// 網頁模式「自動送出＋自動抓回覆」的共用腳本與判斷邏輯。
//
// 這裡只放純函式（不碰 Electron）：產生的字串會分別在
//   - App 內官網視窗：webContents.executeJavaScript
//   - 外部自動化瀏覽器：CDP Runtime.evaluate
// 兩種環境執行，行為與判斷完全一致；測試可直接載入本模組檢查腳本語法與流程判斷。
//
// ── 官網改版時要改哪裡？（給要修改程式碼的人）──────────────────────────────
// 下面 SITE_HINTS 是唯一要動的地方：支援的官網（ChatGPT／Claude／Gemini／DeepSeek／
// Grok／Qwen／Mistral／Copilot／Perplexity／Meta AI／Kimi／Z.ai 共 12 家）的送出鈕
// 字樣、回覆容器、停止鈕字樣、複製鈕字樣與輸入框選擇器全部集中在這裡。
// 改完請跑 `npm test`（app/tests/web-auto-flow.test.js 會驗證腳本語法與判斷邏輯），
// 再做一次真實瀏覽器端到端測試：`node verify-web-auto.cjs`（專案最上層）。
//
// 各欄位的用途：
//   editorSelectors      訊息輸入框的選擇器（不含 input，避免選到登入欄位）
//   editorSearchFilter   輸入框字樣裡有這些詞就排除（搜尋框）
//   sendWords            送出鈕的字樣（含有這些字才算送出鈕）
//   sendBlockWords       要排除的字樣（停止、語音、附件、模型、新對話…）
//   strictSendSelectors  找不到送出鈕時，最後嘗試的 data-testid 與類名（只認「送出」語意）
//   buttonSelectors      找按鈕時用的選擇器（含 input[type=submit]）
//   replySelectors       回覆訊息的容器，依序嘗試、取第一個有命中的
//   streamingSelector    官網標記「正在串流」的元素
//   stopWords            「停止生成」鈕的字樣（有它就代表還在生成中）
//   copyWords            複製鈕的字樣
//   copyBlockWords       要排除的複製鈕（複製程式碼、複製連結…）
const SITE_HINTS = {
  editorSelectors: 'textarea,[contenteditable="true"],[role="textbox"]',
  editorSearchFilter: '(search|搜尋|搜索|filter|篩選)',
  sendWords: '(send|submit|送出|傳送|发送|發送|提交|送信|send message)',
  sendBlockWords: '(stop|停止|中止|voice|mic|microphone|語音|麥克風|attach|attachment|上傳|附件|檔案|file|image|圖片|model|模型|new chat|新對話|新規|speech|dictate|讀取|聽寫)',
  strictSendSelectors: '[data-testid="send-button"],[data-testid*="send" i],[class*="sendmessage" i],[class*="send-button" i],[class*="send-btn" i],[class*="send-message" i],[class*="button-send" i]',
  buttonSelectors: 'button,[role="button"],input[type="submit"]',
  buttonSelectorsBasic: 'button,[role="button"]',
  replySelectors: [
    '[data-message-author-role="assistant"]',
    '[data-is-streaming] .font-claude-message',
    '.font-claude-message',
    '.font-claude-response',
    'model-response',
    '.model-response-text',
    '[data-testid="conversation-turn"] .markdown',
    '[class*="ds-markdown"]',
    '[class*="segment-assistant"]',
    '[class~="prose"]',
    '[class*="markdown"]'
  ],
  streamingSelector: '[data-is-streaming="true"]',
  stopWords: '(^|[^a-z])(stop|stop generating|stop streaming|停止|停止生成|中止)([^a-z]|$)',
  copyWords: '^(copy|copy reply|copy response|複製|複製回覆|コピー|拷贝|复制)',
  copyBlockWords: '(code|程式碼|代码|link|連結|链接|prompt|提示)'
};

// Gemini 的回覆容器在 2024～2026 之間換過好幾次標記（model-response → message-content
// → response-container）。官網改版時最常見的症狀就是「自動送出成功，但接回沒反應」：
// 監看腳本找不到任何回覆節點，永遠拿不到文字。這裡只在 gemini.google.com 上追加這些
// 選擇器，其他官網完全不受影響。
const GEMINI_REPLY_SELECTORS = Object.freeze([
  'model-response',
  'message-content',
  '.model-response-text',
  'response-container',
  '.response-container-content',
  '[data-test-id="response-container"]',
  '[class*="response-container" i]',
  '.conversation-container .markdown'
]);

// DeepSeek 的回覆只認最外層的 div.ds-markdown。官方版面的卡片引用、程式碼複製鈕
// 也帶「ds-markdown」字樣（ds-markdown-cite／ds-markdown-code-copy-button），
// 用通用 [class*="ds-markdown"] 會把這些子節點當成獨立回覆；這裡改用精確類名，
// 並在探測時再濾掉任何仍被其他 ds-markdown 包住的節點。
const DEEPSEEK_REPLY_SELECTORS = Object.freeze(['div.ds-markdown']);

const TEMPORARY_CHAT_PROVIDERS = Object.freeze(['openai', 'gemini', 'anthropic']);

// DeepSeek 的送出鈕／停止鈕是同一顆「主按鈕」：div.ds-button（role=button），
// 沒有 aria-label 或可讀文字，圖示會隨送出／停止／載入切換，類名又是雜湊值。
// 唯一穩定線索是「輸入框所在工具列最右側、小方形、只含圖示的 ds-button」。
// 停止中＝輸入框已清空且這顆按鈕仍可按；閒置送出＝同一顆按鈕帶 ds-button--disabled。
// 這段程式會內嵌到每一個需要在官網頁面執行的腳本裡（只依賴各腳本已宣告的 visible）。
function deepseekDomHelperSource() {
  return `
    const dsPageHost=typeof location!=='undefined'?String(location.hostname||''):'';
    const dsHost=/(^|\\.)deepseek\\.com$/i.test(dsPageHost);
    const dsClassName=e=>String((e&&e.className&&e.className.baseVal!==undefined)?e.className.baseVal:(e&&e.className)||'');
    const dsIconOnly=e=>!!e&&/(^|\\s)ds-button(\\s|$)/.test(dsClassName(e))&&!String(e.innerText||e.textContent||'').replace(/\\s+/g,'');
    const dsDisabled=e=>{
      if(!e)return false;
      return e.disabled===true||e.getAttribute('aria-disabled')==='true'||/(^|\\s)ds-button--disabled(\\s|$)/.test(dsClassName(e));
    };
    const dsSmallButton=e=>{
      try{const r=e.getBoundingClientRect();return !!r&&r.width>=16&&r.width<=64&&r.height>=16&&r.height<=64;}catch{return false;}
    };
    // 由輸入框往上找第一個含「小方形圖示 ds-button」的區塊；右下角最靠右的那顆就是主按鈕。
    // 附件鈕在同一列但更左邊，因此不會被誤按。
    const dsMainButton=editor=>{
      if(!editor)return null;
      let scope=editor;
      for(let depth=0;depth<8&&scope;depth++,scope=scope.parentElement){
        let buttons=[];
        try{buttons=[...scope.querySelectorAll('[role="button"],button')];}catch{}
        const hits=buttons.filter(e=>visible(e)&&dsIconOnly(e)&&dsSmallButton(e));
        if(hits.length){
          hits.sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right);
          return hits[0];
        }
      }
      return null;
    };
    // 助理動作列（複製／重新生成／讚／倒讚／分享…）只在該則回覆不再 WIP 時渲染，
    // 而且位於 div.ds-message 的「下一層」容器；以「直接子元素中有 >=3 顆圖示 ds-button」
    // 找出動作列本身，不用猜雜湊類名，也不會把內文的卡片按鈕算進來。
    const dsActionToolbar=scope=>{
      if(!scope)return null;
      let nodes=[];
      try{nodes=[scope,...scope.querySelectorAll('div')];}catch{}
      for(const node of nodes){
        // 只在「訊息本體之外」找助理動作列。回覆內含程式碼區塊時，區塊自己的
        // 工具列也可能有好幾顆圖示 ds-button；那些位於 .ds-message 內，不能當成完成訊號。
        try{if(node!==scope&&node.closest('.ds-message'))continue;}catch{}
        let buttons=[];
        try{buttons=[...node.children].filter(e=>visible(e)&&dsIconOnly(e));}catch{}
        if(buttons.length>=3)return {node,buttons};
      }
      return null;
    };
    const dsReplyRoots=()=>{
      let roots=[];
      try{roots=[...document.querySelectorAll(${quoteList(DEEPSEEK_REPLY_SELECTORS)})];}catch{}
      return roots.filter(e=>{
        const p=e.parentElement;
        try{return !(p&&p.closest('.ds-markdown,[class*="ds-markdown"]'));}catch{return true;}
      });
    };
  `;
}

// 開始（或重新驗證）官網自己的臨時／無痕對話。支援 ChatGPT、Gemini 與 Claude；
// 其他網站不會被假稱為臨時聊天。腳本要求 UI 回報啟用狀態，未能確認就不送提示詞。
function buildTemporaryChatScript(provider, {startNew = false} = {}) {
  const id = String(provider || '').toLowerCase();
  if (!TEMPORARY_CHAT_PROVIDERS.includes(id)) {
    return `(()=>({ok:false,error:'temporary-chat-not-supported',provider:${JSON.stringify(id)}}))()`;
  }
  return `(async()=>{
    const provider=${JSON.stringify(id)};
    const startNew=${Boolean(startNew)};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const waitFor=async(test,timeoutMs)=>{const deadline=Date.now()+timeoutMs;while(!test()&&Date.now()<deadline)await wait(250);return test();};
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    const label=e=>[e?.getAttribute?.('aria-label'),e?.getAttribute?.('title'),e?.getAttribute?.('data-testid'),e?.innerText,e?.textContent].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
    const controls=()=>[...document.querySelectorAll('button,a,[role="button"],[role="link"],[role="menuitem"],[role="switch"]')].filter(visible);
    const temporaryWords=/(temporary\\s*(?:chat|conversation)?|incognito\\s*(?:chat|conversation)?|temp(?:orary)?\\s*chat|臨時對話|臨時聊天|暫時對話|暫時聊天|暫存聊天|無痕對話|無痕聊天|無痕模式)/i;
    const newChatWords=/^(?:new\\s*(?:chat|conversation)|start\\s*(?:a\\s*)?new\\s*(?:chat|conversation)|新對話|新聊天|新增對話|新增聊天|開始新對話)$/i;
    const temporaryControl=()=>controls().find(e=>temporaryWords.test(label(e))&&!newChatWords.test(label(e)));
    const temporaryCloseControl=()=>controls().find(e=>/(?:關閉|結束|離開).*(?:臨時|無痕|temporary|incognito)|(?:exit|leave|end|close).*(?:temporary|incognito)/i.test(label(e)));
    // Gemini 只有在一般新對話頁才顯示「臨時對話」按鈕；先按「新對話」再按它。
    // 側欄可能預設收起，這時先按「主選單」把「新對話」找出來。
    // Claude 的帳號選單按鈕只有 data-testid="user-menu-button"，沒有 aria-label；
    // 無痕入口收在這個選單裡，因此必須一併認得 testid／aria-haspopup 的帳號選單。
    const menuControl=()=>controls().find(e=>/^(?:Main menu|Menu|Open navigation|主選單|選單|開啟導覽|開啟選單)$/i.test(String(e.getAttribute?.('aria-label')||'').trim()))
      ||controls().find(e=>String(e.getAttribute?.('data-testid')||'')==='user-menu-button')
      ||controls().find(e=>/^menu$/i.test(String(e.getAttribute?.('aria-haspopup')||''))&&/(?:account|profile|user|帳號|個人)/i.test(label(e)));
    const newChatControl=()=>controls().find(e=>/^(?:New chat|New conversation|新對話|新聊天|新增對話|新增聊天)$/i.test(String(e.getAttribute('aria-label')||'').trim()));
    const isActive=e=>{
      if(!e)return false;
      const attrs=['aria-pressed','aria-checked','data-state','data-active','data-selected','aria-current'];
      if(attrs.some(name=>/^(?:true|on|active|selected|checked|page)$/i.test(String(e.getAttribute(name)||''))))return true;
      if(/(?:exit|leave|end|close)\\s+(?:the\\s+)?(?:temporary|incognito)/i.test(label(e)))return true;
      const cls=String(e.className?.baseVal||e.className||'');
      if(/(?:^|[\\s_-])(?:active|selected|checked)(?:$|[\\s_-])/i.test(cls))return true;
      return false;
    };
    const activeIndicator=()=>{
      if(provider==='gemini'){
        // Gemini renders its active temporary mode as a page notice, not a pressed button.
        // Require its privacy notice (recent chats + retention) so the ordinary toolbar item
        // labelled "Temporary chat" cannot be mistaken for an active temporary conversation.
        // Current Gemini also marks the chat window itself; that class is the most reliable signal.
        if(document.querySelector('.chat-window.is-temporary-chat,.is-temporary-chat,.temporary-chat-header'))return true;
        const pageText=String(document.body?.innerText||'').replace(/\\s+/g,' ');
        if(temporaryWords.test(pageText)&&/(?:不會顯示|won't appear|will not appear|does not appear)/i.test(pageText)&&/(?:近期對話|recent chats|72\\s*(?:小時|hours))/i.test(pageText))return true;
      }
      if(provider==='anthropic'){
        // Claude 的無痕對話（Incognito chat）以頁面提示表示啟用（不會出現在歷史紀錄）。
        // 一般對話頁也可能有「Incognito chat」入口字樣，因此必須同時看到官方提示才視為已啟用。
        const pageText=String(document.body?.innerText||'').replace(/\\s+/g,' ');
        return /(?:incognito|無痕)/i.test(pageText)&&/(?:won[’']t appear|will not appear|not appear|does not appear|won[’']t be saved|not saved|不會顯示|不會出現|不會保存|不會被保存)/i.test(pageText);
      }
      const nodes=[...document.querySelectorAll('[role="status"],[role="heading"],[aria-live],[data-testid*="temporary" i],header h1,header h2')].filter(visible);
      return nodes.some(e=>temporaryWords.test(label(e))&&!e.matches('button,[role="button"],[role="menuitem"],[role="switch"]'));
    };
    // Gemini 的「臨時對話」按鈕在一般模式也一直存在；不能把按鈕的 active 樣式當成已啟用。
    // 真正啟用時按鈕字樣會變成「關閉臨時對話」，用這個字樣確認最可靠。
    const confirmed=()=>activeIndicator()||/temporary|incognito/i.test(location.pathname+' '+location.search)||Boolean(temporaryCloseControl())||(provider!=='gemini'&&isActive(temporaryControl()));
    // 已經在無痕對話時不要再按一次入口：Claude 的帳號選單在無痕模式下只剩
    // 「結束無痕模式」，重按會多開新對話或誤觸關閉。已確認就只驗證狀態。
    if(startNew&&!confirmed()){
      if(provider==='openai'||provider==='gemini'){
        let newChat=await waitFor(()=>newChatControl(),1200);
        if(!newChat){
          const menu=await waitFor(()=>menuControl(),1500);
          if(menu){menu.click();await wait(600);}
          newChat=await waitFor(()=>newChatControl(),4000);
        }
        if(!newChat)return {ok:false,error:'temporary-new-chat-control-not-found',provider};
        newChat.click();
        await wait(700);
      }
      if(provider==='anthropic'&&!temporaryControl()){
        // Claude 的無痕入口可能收在「更多／選單」內；先嘗試打開一個可見的選單。
        const menu=await waitFor(()=>menuControl()||controls().find(e=>/^(?:More|更多|Options|選項|Account menu|帳號選單)$/i.test(String(e.getAttribute('aria-label')||'').trim())),1200);
        if(menu){menu.click();await wait(500);}
      }
      let control=await waitFor(()=>temporaryControl(),5000);
      if(!control)return {ok:false,error:'temporary-control-not-found',provider};
      control.click();
      // 某些版面先展開選單，再顯示明確的「Temporary chat」選項。
      let menuChoice=controls().find(e=>e.matches('[role="menuitem"]')&&temporaryWords.test(label(e)));
      if(!menuChoice)menuChoice=await waitFor(()=>controls().find(e=>e.matches('[role="menuitem"]')&&temporaryWords.test(label(e))),500);
      if(menuChoice)menuChoice.click();
    }
    // Gemini's privacy banner and ChatGPT's temporary-mode marker are rendered asynchronously
    // after the control click. Poll for the official confirmation instead of checking once too early.
    const active=await waitFor(confirmed,startNew?6000:1500);
    const control=temporaryControl();
    const rect=control?.getBoundingClientRect?.();
    if(!control&&!activeIndicator()&&!/temporary|incognito/i.test(location.pathname+' '+location.search))return {ok:false,error:'temporary-control-not-found',provider};
    if(!active)return {ok:false,error:startNew?'temporary-chat-not-confirmed':'temporary-chat-not-active',provider,control:label(control),rect:rect&&Number.isFinite(rect.x)?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null};
    return {ok:true,provider,active:true,startedNew:startNew};
  })()`;
}

// 把設定字串安全地放進要注入官網執行的腳本（單引號字串）。
function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
function quoteList(values) {
  return values.map(quote).join(',');
}

// 提示詞填入（沿用原本的「安全填入、不送出」邏輯：避免覆蓋未送出的內容、排除登入用輸入框）。
function buildFillScript(text) {
  return `(async()=>{
    const text=${JSON.stringify(text)};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    // 官網是 SPA：輸入框有時在頁面載入後才掛上來（例如 Perplexity），找不到時先等最多約 3 秒。
    const findEditor=()=>{
      const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
      const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
      candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
      return candidates[0];
    };
    let editor=findEditor();
    for(let i=0;i<10&&!editor;i++){ await wait(300); editor=findEditor(); }
    if(!editor)return {ok:false,error:'尚未找到官網訊息輸入框；請先登入，或確認官網已開啟對話頁。'};
    // 比對忽略空白差異：同一段文字在各種輸入框的 innerText 表示法不同（contenteditable 會把
    // 換行摺疊成空白、有些官網用空行分段），只比「去掉多餘空白後」的內容，才不會把剛填入的
    // 提示詞誤判成殘留舊文字而拒送（與下面 landed() 驗證同一手法）。
    const norm=s=>String(s||'').replace(/\\s+/g,' ').trim();
    const current=norm('value' in editor?editor.value:editor.innerText||editor.textContent);
    const wanted=norm(text);
    if(current&&current!==wanted)return {ok:false,error:'官網輸入框已有未送出的文字，為避免覆蓋，請先確認並清空後重試。'};
    if(current===wanted)return {ok:true,alreadyFilled:true};
    editor.focus();
    if('value' in editor){
      const prototype=editor instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;
      if(!setter)return {ok:false,error:'官網輸入框不支援安全填入；提示詞已留在剪貼簿。'};
      setter.call(editor,text);
    }else{
      const range=document.createRange();range.selectNodeContents(editor);range.deleteContents();
      const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    }
    try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
    catch{editor.dispatchEvent(new Event('input',{bubbles:true}));}
    editor.dispatchEvent(new Event('change',{bubbles:true}));
    // 驗證文字真的進到輸入框；有些官網（例如 Kimi）收到插入後會先重新渲染輸入框，
    // 同步完成前直接讀會誤判成「沒填進去」——所以先等一小段時間再確認。
    // 還是不行才用瀏覽器原生 insertText 管線補救（ProseMirror／Quill 這類富文字輸入框
    // 對原生管線最買帳）；補救前先確認，避免同一段文字被插入兩次。
    const key=text.replace(/\\s+/g,'').slice(0,6);
    const landed=()=>{const t=String('value' in editor?editor.value:(editor.innerText||editor.textContent)||'').replace(/\\s+/g,'');return !key||t.includes(key);};
    if(!('value' in editor)&&!landed()){
      await wait(120);
      if(!landed()){
        try{
          editor.focus();
          const caret=document.createRange();caret.selectNodeContents(editor);caret.collapse(false);
          const selection=window.getSelection();selection.removeAllRanges();selection.addRange(caret);
          document.execCommand('insertText',false,text);
          editor.dispatchEvent(new Event('input',{bubbles:true}));
        }catch{}
        await wait(120);
      }
    }
    const verified=landed();
    return {ok:verified,alreadyFilled:false,verified,error:verified?'':'官網未確認完整提示詞已填入。'};
  })()`;
}

// 原生輸入前置：只把焦點放到輸入框、把游標移到空白內容的末端，不改 DOM 內容。
// 接著由主程序用 Chromium 的原生輸入管線（webContents.insertText／CDP Input.insertText）
// 真的「打字」進去，讓 React／ProseMirror／Quill 收到 beforeinput/input 並更新內部狀態。
// 這是為了解決「DOM 看得到文字、但官網的送出鈕仍是 disabled／送出後沒反應」。
function buildPrepareFillScript(text) {
  return `(async()=>{
    const text=${JSON.stringify(text)};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    const findEditor=()=>{
      const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
      const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
      candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
      return candidates[0];
    };
    const norm=s=>String(s||'').replace(/[\\u200b-\\u200d\\ufeff]/g,'').replace(/\\s+/g,' ').trim();
    let editor=null;
    for(let i=0;i<10&&!editor;i++){editor=findEditor();if(!editor)await wait(300);}
    if(!editor)return {ok:false,error:'尚未找到官網訊息輸入框；請先登入，或確認官網已開啟對話頁。'};
    const current=norm('value' in editor?editor.value:editor.innerText||editor.textContent);
    const wanted=norm(text);
    if(current&&current===wanted)return {ok:true,alreadyFilled:true,editorEmpty:false};
    if(current&&current!==wanted)return {ok:false,conflict:true,error:'官網輸入框已有未送出的文字，為避免覆蓋，請先確認並清空後重試。'};
    editor.focus();
    if('value' in editor){
      try{editor.setSelectionRange(0,0);}catch{}
    }else{
      const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    }
    return {ok:true,ready:true,editorEmpty:!current};
  })()`;
}

// 原生輸入後驗證：DOM 內容必須就是本回合提示詞（忽略空白與零寬字元差異）。
// 額外回報 sendReady，讓主程序知道官網的送出鈕是否已因內容變更而啟用。
function buildVerifyFillScript(text) {
  return `(()=>{
    const text=${JSON.stringify(text)};
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    ${deepseekDomHelperSource()}
    const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
    const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
    candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
    const editor=candidates[0]||null;
    if(!editor)return {ok:false,error:'no-editor',editorEmpty:true};
    const norm=s=>String(s||'').replace(/[\\u200b-\\u200d\\ufeff]/g,'').replace(/\\s+/g,' ').trim();
    const current=norm('value' in editor?editor.value:editor.innerText||editor.textContent);
    const wanted=norm(text);
    const verified=current===wanted||!!(wanted&&current.includes(wanted));
    const label=e=>String(e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||e?.getAttribute?.('data-testid')||e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();
    const sendWords=/${SITE_HINTS.sendWords}/i;
    const blockWords=/${SITE_HINTS.sendBlockWords}/i;
    const pick=scope=>[...scope.querySelectorAll(${quote(SITE_HINTS.buttonSelectors)})]
      .filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true')
      .filter(e=>{const l=label(e);return l.length>0&&l.length<60&&sendWords.test(l)&&!blockWords.test(l);});
    let sendReady=false;
    let scope=editor;
    for(let depth=0;depth<8&&scope&&!sendReady;depth++,scope=scope.parentElement){sendReady=pick(scope).length>0;}
    if(!sendReady)sendReady=[...document.querySelectorAll(${quote(SITE_HINTS.strictSendSelectors)})].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true').length>0;
    if(dsHost){const main=dsMainButton(editor);sendReady=!!(main&&!dsDisabled(main));}
    return {ok:verified,verified,editorEmpty:!current,length:current.length,expected:wanted.length,sendReady};
  })()`;
}

// 原生輸入只放進一部分、或官網拒絕時，安全清掉「剛剛這段提示詞」再走 DOM 補救。
// 只清與提示詞相符（或互為前後段）的內容；若官網或使用者已改成別的內容，一律不動。
function buildClearScript(text) {
  return `(()=>{
    const text=${JSON.stringify(text)};
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
    const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
    candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
    const editor=candidates[0]||null;
    if(!editor)return {ok:false,error:'no-editor'};
    const norm=s=>String(s||'').replace(/[\\u200b-\\u200d\\ufeff]/g,'').replace(/\\s+/g,' ').trim();
    const current=norm('value' in editor?editor.value:editor.innerText||editor.textContent);
    const wanted=norm(text);
    if(current&&current!==wanted&&!current.includes(wanted)&&!wanted.includes(current))return {ok:false,error:'content-changed'};
    editor.focus();
    if('value' in editor){
      const prototype=editor instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;
      if(!setter)return {ok:false,error:'unsupported'};
      setter.call(editor,'');
    }else{
      const range=document.createRange();range.selectNodeContents(editor);range.deleteContents();range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    }
    try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward',data:null}));}
    catch{editor.dispatchEvent(new Event('input',{bubbles:true}));}
    editor.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:true};
  })()`;
}


// editor-empty 代表輸入框是空的：這種情況絕不送出，避免把舊訊息或空白送出去。
function buildSubmitScript() {
  return `(()=>{
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    ${deepseekDomHelperSource()}
    const label=e=>String(e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||e?.getAttribute?.('data-testid')||e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();
    const unavailable=e=>!!(e.disabled||e.getAttribute('aria-disabled')==='true');
    const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
    const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
    candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
    const editor=candidates[0];
    if(!editor)return {ok:false,error:'no-editor'};
    const current=String(('value' in editor?editor.value:editor.innerText||editor.textContent)||'').trim();
    if(!current)return {ok:false,error:'editor-empty'};
    editor.focus();
    let target=null;
    if(dsHost){
      const main=dsMainButton(editor);
      if(main&&!dsDisabled(main))target=main;
      if(!target)return {ok:false,error:'no-send-button'};
    }
    const sendWords=/${SITE_HINTS.sendWords}/i;
    const blockWords=/${SITE_HINTS.sendBlockWords}/i;
    const pick=scope=>[...scope.querySelectorAll(${quote(SITE_HINTS.buttonSelectors)})]
      .filter(e=>visible(e)&&!unavailable(e))
      .filter(e=>{const l=label(e);return l.length>0&&l.length<60&&sendWords.test(l)&&!blockWords.test(l);});
    let scope=editor;
    for(let depth=0;depth<8&&scope&&!target;depth++,scope=scope.parentElement){
      const found=pick(scope);
      if(found.length){target=found[found.length-1];break;}
    }
    if(!target&&!dsHost){
      const strict=[...document.querySelectorAll(${quote(SITE_HINTS.strictSendSelectors)})].filter(e=>visible(e)&&!unavailable(e));
      if(strict.length)target=strict[strict.length-1];
    }
    if(!target)return {ok:false,error:'no-send-button'};
    const rect=target.getBoundingClientRect();
    target.click();
    return {ok:true,method:'button',structural:dsHost,rect:Number.isFinite(rect.x)?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null};
  })()`;
}

// 官網輸入框卡著「上一次自動化留下的提示詞」時的解套腳本。
// 只清「看起來就是本 App 產生的提示詞」（很長、含 JSON 與選項字樣）；
// 使用者自己打的草稿一律不動，避免誤刪。
function buildAppPromptClearScript() {
  return `(()=>{
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
    const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
    candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
    const editor=candidates[0]||null;
    if(!editor)return {ok:false,error:'no-editor'};
    const current=String(('value' in editor?editor.value:editor.innerText||editor.textContent)||'').trim();
    const looksLikeAppPrompt=current.length>=300&&/JSON/i.test(current)&&/(選項|選项|options|choices)/i.test(current);
    if(!looksLikeAppPrompt)return {ok:false,error:'not-app-prompt'};
    editor.focus();
    if('value' in editor){
      const prototype=editor instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;
      if(!setter)return {ok:false,error:'unsupported'};
      setter.call(editor,'');
    }else{
      const range=document.createRange();range.selectNodeContents(editor);range.deleteContents();range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    }
    try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward',data:null}));}
    catch{editor.dispatchEvent(new Event('input',{bubbles:true}));}
    editor.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:true,cleared:true,length:current.length};
  })()`;
}

// 讀取官網目前的回覆狀態：是否還在生成、目前幾則助理訊息、最後一則的文字。
// 只讀不點擊；真正接回時以網站自己的「複製」鈕為優先（見 buildCopyClickScript）。
// 回報多個「完成訊號」給 replyProgress 判斷（追加十 B）：
//   editor      官網輸入框還在不在（不在＝可能被登出或換頁）
//   stopVisible 停止生成鈕（看到它＝正在生成）
//   streaming   官網自己的「串流中」標記
//   copyReady   最後一則回覆旁邊已出現複製鈕（多數官網＝這則回覆已完成）
function buildReplyProbeScript() {
  return `(()=>{
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    ${deepseekDomHelperSource()}
    const label=e=>String(e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||e?.getAttribute?.('data-testid')||e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();
    // 先找出目前的輸入框：回覆容器若「就是輸入框、包著輸入框、或與輸入框大幅重疊」就不算回覆。
    // 例如 Grok 的輸入框外框帶 prose 類名（回覆後備選擇器之一）；不排除的話，「最後一則」
    // 會變成頁面底部的輸入框區域，自動接回永遠抓不到回覆。
    const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
    const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
    candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
    const editor=candidates[0]||null;
    const inEditorArea=e=>{
      if(!editor)return false;
      if(e===editor||e.contains(editor)||editor.contains(e))return true;
      const r=e.getBoundingClientRect();
      const er=editor.getBoundingClientRect();
      if(!r.height||!er.height)return false;
      // 只有「從輸入框高度附近才開始」的容器才算輸入區。長回覆可能一路延伸到
      // 輸入框上方，但它會從更上方開始，不能因為重疊就被誤排除（否則最新回覆
      // 會消失在基準之外，watcher 會把上一則舊回覆當成本回合）。
      return r.top>=er.top-Math.max(8,er.height*0.5);
    };
    const selectors=dsHost
      ? [${quoteList(DEEPSEEK_REPLY_SELECTORS)},${quoteList(SITE_HINTS.replySelectors)}]
      : (/gemini\\.google\\.com$/i.test(String(location.hostname||'')))
        ? [${quoteList(GEMINI_REPLY_SELECTORS)},${quoteList(SITE_HINTS.replySelectors)}]
        : [${quoteList(SITE_HINTS.replySelectors)}];
    let nodes=[];
    // 較舊的回覆可能被官網移出畫面（virtualized／content-visibility），但仍屬於基準。
    // 只排除真正隱藏的節點，避免把上一則舊回覆誤認成本回合的新回覆。
    const present=e=>{
      if(!e)return false;
      const style=getComputedStyle(e);
      if(style.display==='none'||style.visibility==='hidden')return false;
      if(e.getAttribute('aria-hidden')==='true')return false;
      return String(e.innerText||e.textContent||'').trim().length>0;
    };
    for(const selector of selectors){
      try{
        const found=[...document.querySelectorAll(selector)].filter(present).filter(e=>!inEditorArea(e));
        if(found.length){nodes=found;break;}
      }catch{}
    }
    // DeepSeek：只留最外層的 div.ds-markdown。引用卡片、程式碼複製鈕等子節點
    // 的類名也含 ds-markdown，若不濾掉會讓「最後一則」變成卡片文字（誤接）。
    if(dsHost)nodes=nodes.filter(e=>{const p=e.parentElement;try{return !(p&&p.closest('.ds-markdown,[class*="ds-markdown"]'));}catch{return true;}});
    const last=nodes.length?nodes[nodes.length-1]:null;
    const text=last?String(last.innerText||last.textContent||'').trim():'';
    const stopWords=/${SITE_HINTS.stopWords}/i;
    const stopButton=[...document.querySelectorAll(${quote(SITE_HINTS.buttonSelectorsBasic)})].filter(visible).find(e=>{
      const l=label(e);
      return l.length<60&&stopWords.test(l);
    });
    const streaming=document.querySelector(${quote(SITE_HINTS.streamingSelector)});
    // 複製鈕出現＝官網自己覺得這則回覆已完成（強訊號）。複製鈕可能掛在回覆節點內、
    // 同一層的下一顆節點（工具列），或「只含這一則回覆」的共用容器裡；搜尋範圍要保守，
    // 免得把舊回覆的複製鈕當成新回覆完成（誤接）。只認「複製回覆」語意、排除複製程式碼／連結。
    const copyWords=/${SITE_HINTS.copyWords}/i;
    const copyBlockWords=/${SITE_HINTS.copyBlockWords}/i;
    const hasCopyButton=scope=>{
      if(!scope)return false;
      const buttons=[...scope.querySelectorAll(${quote(SITE_HINTS.buttonSelectorsBasic)})];
      return buttons.some(e=>{const l=label(e);return !!l&&l.length<=60&&copyWords.test(l)&&!copyBlockWords.test(l);});
    };
    // DeepSeek 的助理動作列（複製／重新生成／讚／倒讚／分享…）只在該則回覆不再 WIP 時
    // 渲染，而且位於 div.ds-message 的下一層。動作列沒有可讀標籤的複製鈕，改以結構辨認：
    // 容器直接子元素中有 >=3 顆小方形圖示 ds-button，就代表動作列已出現（回覆完成）。
    const dsMessage=dsHost&&last&&typeof last.closest==='function'?last.closest('.ds-message'):null;
    const dsBar=dsHost?dsActionToolbar(dsMessage&&dsMessage.parentElement?dsMessage.parentElement:(last&&last.parentElement)):null;
    const copyReady=(()=>{
      if(!last)return false;
      if(dsHost)return !!dsBar;
      if(hasCopyButton(last))return true;
      if(hasCopyButton(last.nextElementSibling))return true;
      const parent=last.parentElement;
      if(!parent)return false;
      const replyNodes=new Set();
      for(const selector of selectors){try{for(const node of parent.querySelectorAll(selector))replyNodes.add(node);}catch{}}
      return replyNodes.size<=1&&hasCopyButton(parent);
    })();
    const editorText=editor?String(('value' in editor?editor.value:editor.innerText||editor.textContent)||''):'';
    const editorVisibleText=editorText.replace(/[\u200b-\u200d\ufeff]/g,'');
    const editorEmpty=!!editor&&!editorVisibleText.trim();
    // DeepSeek 的停止鈕就是同一顆主按鈕：生成中且輸入框已清空時仍可按；
    // 閒置送出的主按鈕則帶 ds-button--disabled。不需要依賴會被改版換掉的圖示或字串。
    const dsMain=dsHost?dsMainButton(editor):null;
    const dsGenerating=!!(dsMain&&editorEmpty&&!dsDisabled(dsMain));
    const generating=!!(stopButton||streaming||dsGenerating);
    return {ok:true,generating,stopVisible:!!stopButton,streaming:!!streaming,editor:!!editor,editorEmpty,editorLength:editorText.length,copyReady,count:nodes.length,text};
  })()`;
}

// 自動化開場自檢（追加十 D）：只讀不點擊，回報「登入狀態／輸入框／送出鈕／回覆區」能不能尋得，
// 讓 App 用白話告訴使用者「哪一步卡住＋怎麼辦」；任何一步失敗都不影響手動流程。
function buildHealthScript() {
  return `(()=>{
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    ${deepseekDomHelperSource()}
    const label=e=>String(e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||e?.getAttribute?.('data-testid')||e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();
    const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
    const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
    candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height;});
    const editor=candidates[0]||null;
    let sendButton=false;
    if(editor){
      const sendWords=/${SITE_HINTS.sendWords}/i;
      const blockWords=/${SITE_HINTS.sendBlockWords}/i;
      const pick=scope=>[...scope.querySelectorAll(${quote(SITE_HINTS.buttonSelectors)})]
        .filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true')
        .filter(e=>{const l=label(e);return l.length>0&&l.length<60&&sendWords.test(l)&&!blockWords.test(l);});
      let scope=editor;
      for(let depth=0;depth<8&&scope&&!sendButton;depth++,scope=scope.parentElement){sendButton=pick(scope).length>0;}
      if(!sendButton){sendButton=[...document.querySelectorAll(${quote(SITE_HINTS.strictSendSelectors)})].filter(e=>visible(e)&&!e.disabled).length>0;}
    }
    // DeepSeek 的主按鈕在輸入框空白時本來就是 disabled（送出前狀態），
    // 自檢只問「找不找得到」，不能因此誤報沒有送出鈕。
    if(dsHost&&editor)sendButton=!!dsMainButton(editor);
    const loginForm=[...document.querySelectorAll('input[type="password"]')].some(visible);
    const geminiHost=/gemini\\.google\\.com$/i.test(String(location.hostname||''));
    const replySelectors=dsHost
      ? [${quoteList(DEEPSEEK_REPLY_SELECTORS)},${quoteList(SITE_HINTS.replySelectors)}]
      : geminiHost
        ? [${quoteList(GEMINI_REPLY_SELECTORS)},${quoteList(SITE_HINTS.replySelectors)}]
        : [${quoteList(SITE_HINTS.replySelectors)}];
    let replyNodes=0;
    for(const selector of replySelectors){
      try{replyNodes=[...document.querySelectorAll(selector)].filter(visible).length;}catch{}
      if(replyNodes)break;
    }
    if(dsHost&&replyNodes){
      try{replyNodes=[...document.querySelectorAll(${quoteList(DEEPSEEK_REPLY_SELECTORS)})].filter(visible).filter(e=>{const p=e.parentElement;return !(p&&p.closest('.ds-markdown,[class*="ds-markdown"]'));}).length;}catch{}
    }
    return {ok:true,url:String(location.href||''),host:String(location.hostname||''),editor:!!editor,sendButton,replyNodes,loginForm};
  })()`;
}

// 登入狀態探測（目前主要用於 Gemini／Google）：只讀不點，回報是否還停在登入頁、
// 以及官網上的「登入」按鈕位置。外部真瀏覽器可用座標點擊，讓使用者直接看到 Google 登入頁。
function buildLoginGateScript(provider) {
  const id = String(provider || '').toLowerCase();
  return `(()=>{
    const provider=${JSON.stringify(id)};
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    const label=e=>String(e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();
    const host=String(location.hostname||'').toLowerCase();
    if(provider==='gemini'&&/(^|\\.)accounts\\.google\\.com$/.test(host)){
      return {ok:true,provider,host,loggedOut:true,loginPage:true,loginButton:false,editor:false};
    }
    if(provider==='anthropic'){
      // Claude 的登入頁是本機 /login；使用 Google／Apple 登入時會先跳到第三方驗證網域。
      // 兩者都算「尚未登入」，但不由 App 點擊或代填：使用者必須自己完成或明確確認。
      if(/(^|\\.)(?:accounts\\.google\\.com|appleid\\.apple\\.com)$/.test(host)||(/(^|\\.)claude\\.ai$/.test(host)&&/^\\/(?:login|signin|sign-in)(?:\\/|$)/.test(String(location.pathname||'')))){
        return {ok:true,provider,host,loggedOut:true,loginPage:true,loginButton:false,editor:false};
      }
      if(!/(^|\\.)claude\\.ai$/.test(host))return {ok:true,provider,host,loggedOut:false,loginPage:false,loginButton:false,editor:false};
      const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
      const editor=editors.find(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')))||null;
      return {ok:true,provider,host,loggedOut:false,loginPage:false,loginButton:false,editor:!!editor};
    }
    if(provider!=='gemini')return {ok:true,provider,host,loggedOut:false,loginPage:false,loginButton:false};
    const editors=[...document.querySelectorAll(${quote(SITE_HINTS.editorSelectors)})].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&e.tagName.toLowerCase()!=='input');
    const candidates=editors.filter(e=>!/${SITE_HINTS.editorSearchFilter}/i.test(String(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')));
    const editor=candidates[0]||null;
    const loginWords=/^(?:登入|登录|sign\\s*in|log\\s*in)$/i;
    const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(visible).filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&loginWords.test(label(e)));
    const target=buttons.find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;})||null;
    if(target){
      const r=target.getBoundingClientRect();
      return {ok:true,provider,host,loggedOut:true,loginPage:false,loginButton:true,x:r.left+r.width/2,y:r.top+r.height/2,label:label(target),editor:!!editor};
    }
    return {ok:true,provider,host,loggedOut:false,loginPage:false,loginButton:false,editor:!!editor};
  })()`;
}


// 每一家記錄：登入方式、已知限制與適用備註；官網改版時連同 SITE_HINTS 一起維護。
// （測試 web-auto-flow.test.js 會驗證兩邊的清單一致，避免有人漏掉某一家。）
const SITE_MATRIX = [
  {id:'openai',name:'ChatGPT',login:'E-mail 或 Google／Microsoft／Apple 等第三方登入',notes:'訊息容器 data-message-author-role；送出鈕 data-testid="send-button"；複製鈕平時 hover 才顯示（元素仍在 DOM，可點）。'},
  {id:'anthropic',name:'Claude',login:'E-mail 或 Google 登入',notes:'訊息容器 font-claude-message；串流標記 data-is-streaming；長回覆結束後才有複製鈕。'},
  {id:'gemini',name:'Google Gemini',login:'Google 帳號',notes:'訊息容器 model-response；輸入框是富文字（Quill），填入走原生 insertText 補救；登入常跳 Google 帳號選擇頁。'},
  {id:'deepseek',name:'DeepSeek',login:'E-mail 或 Google 登入',notes:'回覆容器只認最外層 div.ds-markdown（濾掉引用卡片／程式碼複製鈕）；送出與停止共用同一顆無標籤主按鈕，以輸入框右側工具列最右邊的圖示 ds-button 結構判定；完成訊號為助理動作列（>=3 顆圖示鈕）出現。'},
  {id:'grok',name:'Grok',login:'X（Twitter）或 Google／Apple 登入',notes:'訊息容器 segment-assistant；輸入框外框帶 prose 類名，探測已排除輸入框區域避免抓錯。'},
  {id:'qwen',name:'通義千問 Qwen',login:'阿里巴巴帳號或 Google 登入',notes:'登入常跳 ali 系網域（已列入登入白名單）；回覆容器以 markdown／prose 類名命中。'},
  {id:'mistral',name:'Mistral Le Chat',login:'E-mail 或 Google 登入',notes:'回覆容器以 prose／markdown 類名命中；模型切換需在官網操作。'},
  {id:'copilot',name:'Microsoft Copilot',login:'Microsoft 帳號',notes:'需要 Microsoft 帳號；回覆容器以 markdown 類名命中。'},
  {id:'perplexity',name:'Perplexity',login:'E-mail 或 Google 登入',notes:'輸入框較晚掛載：填入腳本內建最多約 3 秒等待後才回報找不到。'},
  {id:'meta',name:'Meta AI',login:'Meta（Facebook／Instagram）帳號',notes:'需要 Meta 帳號；回覆容器以 markdown 類名命中。'},
  {id:'kimi',name:'Kimi',login:'手機號或第三方登入',notes:'富文字輸入框收到插入後會重新渲染：已內建落地驗證＋insertText 補救，避免誤判沒填進去。'},
  {id:'glm',name:'Z.ai（智譜 GLM）',login:'E-mail 或手機號登入',notes:'回覆容器以 markdown／prose 類名命中；模型選單需在官網操作。'}
];

// 點擊最後一則回覆的「複製」鈕：由官網自己把乾淨的答覆寫進剪貼簿（最忠實的取法）。
// 官網的複製鈕多半是 hover 才顯示（opacity），仍然是可點擊元素，所以只用 display/visibility 過濾。
function buildCopyClickScript() {
  return `(()=>{
    const clickable=e=>!!(e&&e.getClientRects&&e.getClientRects().length)&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
    const visible=clickable;
    ${deepseekDomHelperSource()}
    const label=e=>String(e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||e?.getAttribute?.('data-testid')||'').replace(/\\s+/g,' ').trim();
    // DeepSeek 的複製鈕沒有 aria-label／title，只有 hover 顯示的 tooltip，字樣比對找不到。
    // 改按結構：最後一則 ds-markdown 所屬訊息旁的助理動作列，第一顆圖示 ds-button 就是複製。
    if(dsHost){
      const roots=dsReplyRoots().filter(clickable).filter(e=>String(e.innerText||e.textContent||'').trim());
      const last=roots.length?roots[roots.length-1]:null;
      const message=last&&typeof last.closest==='function'?last.closest('.ds-message'):null;
      const bar=dsActionToolbar(message&&message.parentElement?message.parentElement:(last&&last.parentElement));
      const target=bar&&bar.buttons&&bar.buttons[0];
      if(target){target.click();return {ok:true,clicked:true,label:'deepseek-copy',structural:true};}
    }
    const copyWords=/${SITE_HINTS.copyWords}/i;
    const buttons=[...document.querySelectorAll(${quote(SITE_HINTS.buttonSelectorsBasic)})].filter(e=>{
      if(!clickable(e)||e.disabled||e.getAttribute('aria-disabled')==='true')return false;
      const l=label(e);
      if(!l||l.length>60||!copyWords.test(l))return false;
      return !/${SITE_HINTS.copyBlockWords}/i.test(l);
    });
    const target=buttons[buttons.length-1];
    if(!target)return {ok:false,clicked:false};
    target.click();
    return {ok:true,clicked:true,label:label(target)};
  })()`;
}

// 純判斷：根據每次探測結果決定「現在可以接回回覆了嗎」。
// 基本規則：還在生成或沒有文字 → 不接；文字連續 requiredStable 次相同且與啟動時的基準不同 → 接回。
// （基準比對可避免把啟用前就存在的舊回覆誤當成新回覆。）
// 追加十 B 多訊號強化：
//   誤接降低——複製鈕（copyReady）是官網自己標記「這則已完成」的強訊號，沒有它時照舊要更穩。
//   漏接降低——「看過生成中、現在停了」（sawGenerating）或複製鈕出現時，只要一次穩定即可接回，
//   不必苦等第二次穩定（有些官網收尾會持續微調文字，永遠等不到兩次相同）。
function replyProgress({probe, baseline, lastText, stableCount, sawGenerating = false, minLength = 20, requiredStable = 2} = {}) {
  const generating = !!(probe && probe.generating);
  const text = String((probe && probe.text) || '');
  const count = Number.isFinite(probe && probe.count) ? probe.count : -1;
  const copyReady = !!(probe && probe.copyReady);
  const idle = {generating, text, count, copyReady, lastText: text, stableCount: 0, emit: false, reply: ''};
  if (!probe || probe.ok === false) return idle;
  if (generating || !text.trim()) return idle;
  const stable = text === lastText ? stableCount + 1 : 0;
  const baselineCount = Number.isFinite(baseline && baseline.count) ? baseline.count : -1;
  const baselineText = String((baseline && baseline.text) || '');
  const changed = count > baselineCount || baselineText !== text;
  const strong = copyReady || sawGenerating;
  const needed = strong ? Math.max(1, Math.min(requiredStable, 1)) : requiredStable;
  const emit = changed && stable >= needed && text.trim().length >= minLength;
  return {generating, text, count, copyReady, lastText: text, stableCount: stable, emit, reply: emit ? text : ''};
}

// R40｜插圖自動下載（best-effort）：在官網頁面找「最後一張生成圖片」，點它附近的下載鈕。
// 找不到按鈕就回報原因；重複呼叫無害（已下載過再點一次通常只是重新下載）。
function buildSceneDownloadClickScript() {
  return `(()=>{
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    const label=e=>String(e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();
    const imgs=[...document.querySelectorAll('img')].filter(visible).filter(i=>(i.naturalWidth||0)>=256&&/^(?:blob:|https?:|data:)/.test(String(i.src||'')));
    if(!imgs.length)return {ok:false,error:'no-image'};
    const img=imgs[imgs.length-1];
    let scope=img.closest('[class*="response" i],[class*="message" i],article,figure');
    for(let depth=0;depth<6&&scope;depth++,scope=scope.parentElement){
      const btn=[...scope.querySelectorAll('button,[role="button"],a[download]')].filter(visible).find(e=>{
        const l=label(e);
        return !!l&&l.length<=40&&/^(?:下載|下载|download|save|save image|save photo|下載圖片|圖片下載)$/i.test(l);
      });
      if(btn){btn.click();return {ok:true,clicked:true};}
    }
    return {ok:false,error:'no-download-button'};
  })()`;
}

module.exports = {
  SITE_HINTS,
  SITE_MATRIX,
  TEMPORARY_CHAT_PROVIDERS,
  buildTemporaryChatScript,
  buildFillScript,
  buildPrepareFillScript,
  buildVerifyFillScript,
  buildClearScript,
  buildSubmitScript,
  buildAppPromptClearScript,
  buildReplyProbeScript,
  buildCopyClickScript,
  buildHealthScript,
  buildLoginGateScript,
  buildSceneDownloadClickScript,
  replyProgress
};
