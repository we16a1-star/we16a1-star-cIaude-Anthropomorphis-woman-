const { app, BrowserWindow, shell, dialog, ipcMain, safeStorage, clipboard, screen, session, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const { pathToFileURL } = require('url');
const { createStoredZip } = require('./source-patch-zip.cjs');
const workshopApply = require('./workshop-apply.cjs');
const sceneDownload = require('./scene-download.cjs');
const aiWebFlow = require('./ai-web-flow.cjs');
const aiConnect = require('./ai-connect-check.cjs');

// 官網視窗與外部自動化瀏覽器共用的 Chrome 身分。版本要與實際安裝的 Chrome 一致，
// UA、UA-CH 與 preload 三處必須同步，否則 Google 會把登入頁判成不相容的內嵌瀏覽器。
const AI_WEB_CHROME_MAJOR = '155';
const AI_WEB_CHROME_FULL = '155.0.8059.85';
const AI_WEB_CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${AI_WEB_CHROME_MAJOR}.0.0.0 Safari/537.36`;
const AI_WEB_CHROME_BRANDS = Object.freeze([
  {brand: 'Google Chrome', version: AI_WEB_CHROME_MAJOR},
  {brand: 'Chromium', version: AI_WEB_CHROME_MAJOR},
  {brand: 'Not(A:Brand', version: '24'}
]);
const AI_WEB_CHROME_FULL_BRANDS = Object.freeze([
  {brand: 'Google Chrome', version: AI_WEB_CHROME_FULL},
  {brand: 'Chromium', version: AI_WEB_CHROME_FULL},
  {brand: 'Not(A:Brand', version: '24.0.0.0'}
]);
const AI_WEB_CHROME_UA_CH = `"Google Chrome";v="${AI_WEB_CHROME_MAJOR}", "Chromium";v="${AI_WEB_CHROME_MAJOR}", "Not(A:Brand";v="24"`;
const AI_WEB_CHROME_FULL_UA_CH = `"Google Chrome";v="${AI_WEB_CHROME_FULL}", "Chromium";v="${AI_WEB_CHROME_FULL}", "Not(A:Brand";v="24.0.0.0"`;
try { app.userAgentFallback = AI_WEB_CHROME_UA; } catch {}

// v4.6.34｜工作列圖示：一律使用與安裝檔／桌面捷徑相同的 icon.ico。
// 打包後優先讀 resources\icon.ico（electron-builder extraResources，Explorer 也讀得到），
// 開發模式退回 app\assets\icon.ico；兩個路徑都是同一張來源圖。
const APP_USER_MODEL_ID = 'com.claude.novel.windows11';
function appIconPath() {
  const packaged = app.isPackaged && typeof process.resourcesPath === 'string' && process.resourcesPath
    ? path.join(process.resourcesPath, 'icon.ico')
    : '';
  if (packaged && fs.existsSync(packaged)) return packaged;
  const bundled = path.join(__dirname, 'assets', 'icon.ico');
  return fs.existsSync(bundled) ? bundled : '';
}
function loadAppIcon() {
  try {
    const iconPath = appIconPath();
    if (!iconPath) return null;
    const icon = nativeImage.createFromPath(iconPath);
    return icon.isEmpty() ? null : icon;
  } catch { return null; }
}
try { app.setAppUserModelId(APP_USER_MODEL_ID); } catch {}

const PROVIDER_PREFIX = {
  anthropic: 'ANTHROPIC', openai: 'OPENAI', gemini: 'GEMINI',
  openrouter: 'OPENROUTER', deepseek: 'DEEPSEEK', qwen: 'QWEN',
  groq: 'GROQ', mistral: 'MISTRAL', xai: 'XAI'
};
const VALID_PROFILE = /^[A-Z0-9_]{1,32}$/;
let localApiServer = null;
let localApiBase = '';
let localApiToken = '';
let vaultPath = '';
let mainWindow = null;
let webCompanionRestore = null;
let sceneCaptureUntil = 0;   // 玩家按下「插圖提示詞」後一段時間內，官網視窗下載的圖片會自動匯入遊戲
const SCENE_CAPTURE_MS = 45 * 60 * 1000;
let activeWebCompanionProvider = '';
const webCompanionWindows = new Map();
const AI_WEBSITE_URLS = {
  openai:'https://chatgpt.com/auth/login',anthropic:'https://claude.ai/login',gemini:'https://gemini.google.com/app',
  deepseek:'https://chat.deepseek.com/',grok:'https://grok.com/',qwen:'https://chat.qwen.ai/',
  mistral:'https://chat.mistral.ai/chat',copilot:'https://copilot.com/',perplexity:'https://www.perplexity.ai/',
  meta:'https://www.meta.ai/',kimi:'https://www.kimi.com/',glm:'https://chat.z.ai/'
};
const AI_AUTH_HOSTS = Object.freeze(['google.com','googleusercontent.com','gstatic.com','youtube.com','ytimg.com','googleapis.com','microsoft.com','microsoftonline.com','live.com','apple.com','cloudflare.com','openai.com','facebook.com','x.com','twitter.com',
  // 支援的 12 家官網「註冊域」：登入常跳到同公司的兄弟子網域（例如 auth.deepseek.com、login.qwen.ai），
  // 只列官網本身主機會被內建模式的導覽白名單擋掉，造成登入被踢到外部瀏覽器。
  'anthropic.com','deepseek.com','x.ai','qwen.ai','aliyun.com','alibaba.com','taobao.com','alipay.com','mistral.ai','copilot.com','perplexity.ai','meta.ai','meta.com','kimi.com','moonshot.cn','z.ai','zhipuai.cn']);
const AI_ALLOWED_HOSTS = Object.freeze([...new Set([
  ...Object.values(AI_WEBSITE_URLS).map(value => new URL(value).hostname),
  ...AI_AUTH_HOSTS
])]);
const AI_WEBSITE_BASES = Object.freeze(Object.values(AI_WEBSITE_URLS).map(value => new URL(value).origin));
const injectedEnvNames = new Set();

// ── 創意工坊：v4.4.0 起「整個專案都能開、都能改」 ─────────────────────────────
// 不再維護可編輯白名單；可編輯範圍與安全規則集中在 workshop-apply.cjs
// （路徑不得跳出專案；node_modules、dist、release、_build-tools、備份與 .env 等不開放）。
function workshopSourceRoot() {
  // 優先使用「一鍵安裝」時記下的原始專案：整個交付資料夾（含文件與建置腳本）都能改。
  // 只看得到 app 資料夾時就只開放 app；自解壓安裝版或原資料夾已移動時，退回已安裝的 App 內容。
  const root = workshopApply.resolveWorkshopRoot(app.getAppPath());
  return {...root, appRelative: root.scope !== 'project'};
}

function findChromeExecutable() {
  if (process.platform !== 'win32') return '';
  const candidates = [
    process.env.CHROME_PATH,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || '';
}

async function openAiProviderUrl(url) {
  const chromePath = findChromeExecutable();
  if (!chromePath) return shell.openExternal(url);
  return new Promise((resolve, reject) => {
    try {
      const browser = spawn(chromePath, ['--new-window', url], { detached: true, stdio: 'ignore', windowsHide: false });
      browser.once('error', () => shell.openExternal(url).then(resolve, reject));
      browser.once('spawn', () => { browser.unref(); resolve(); });
    } catch {
      shell.openExternal(url).then(resolve, reject);
    }
  });
}

function isAllowedAiWebsiteUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    return AI_ALLOWED_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

// Google OAuth 不允許嵌入式 user-agent；Gemini 與可能透過 Google 登入的 Claude
// 使用外部 Chrome／Edge，避免在 App 內顯示 Google 的 disallowed_useragent 頁。
// App 不會保存、讀取或自動填入 Google 帳密，也不會呼叫 Windows Hello／PIN。
const webLoginCredentialCache=new Map();
const aiWebsiteWindowProviders=new WeakMap();
const WEB_PASSWORD_HOSTS=Object.freeze({openai:['openai.com'],anthropic:['claude.ai','anthropic.com'],gemini:[],deepseek:['deepseek.com'],grok:['grok.com','x.com'],qwen:['qwen.ai'],mistral:['mistral.ai'],copilot:['copilot.com'],perplexity:['perplexity.ai'],meta:['meta.ai','meta.com'],kimi:['kimi.com','moonshot.cn'],glm:['z.ai','zhipuai.cn']});
function prefillWebLoginCredential(win, provider) {
  // Gemini／Google 登入只在使用者親自操作的外部 Chrome／Edge 視窗完成。
  if(String(provider||'').toLowerCase()==='gemini')return;
  const credential=webLoginCredentialCache.get(String(provider||''));
  if(!credential?.email||!win||win.isDestroyed?.()||win.webContents?.isDestroyed?.())return;
  const encodedEmail=JSON.stringify(credential.email),encodedPassword=JSON.stringify(credential.password||''),encodedPasswordHosts=JSON.stringify(WEB_PASSWORD_HOSTS[String(provider||'')]||[]),autoLogin=credential.autoLogin===true;
  const script=`(async()=>{const email=${encodedEmail},password=${encodedPassword},passwordHosts=${encodedPasswordHosts},autoLogin=${autoLogin};const host=location.hostname.toLowerCase();const path=location.pathname.toLowerCase();const authHost=/(^|\\.)accounts\\.google\\.com$|(^|\\.)login\\.microsoftonline\\.com$|(^|\\.)appleid\\.apple\\.com$/.test(host);const authPath=/(^|\\/)(login|log-in|signin|sign-in|auth|authorize|challenge)(\\/|$)/.test(path)||/signin|login|auth/.test(path);if(!authHost&&!authPath)return false;const mayFillPassword=passwordHosts.some(domain=>host===domain||host.endsWith('.'+domain));const setValue=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,value);else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};for(let attempt=0;attempt<16;attempt++){const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.disabled&&!el.readOnly};const emailInput=[...document.querySelectorAll('input[type=email],input[autocomplete=email],input[autocomplete=username],input[name=email],input[name=username],input[id*=email i]')].find(visible);const passwordInput=mayFillPassword?[...document.querySelectorAll('input[type=password]')].find(visible):null;if(emailInput&&!String(emailInput.value||'').trim())setValue(emailInput,email);if(passwordInput&&password){const form=passwordInput.form;const formEmail=form?.querySelector('input[type=email],input[autocomplete=email],input[name=email],input[name=username]');if(formEmail&&String(formEmail.value||'').trim().toLowerCase()!==email.toLowerCase())return false;setValue(passwordInput,password);if(autoLogin){await new Promise(resolve=>setTimeout(resolve,120));if(form?.requestSubmit)form.requestSubmit();else passwordInput.closest('form')?.submit();}return true;}if(emailInput)return true;await new Promise(resolve=>setTimeout(resolve,250));}return false;})()`;
  win.webContents.executeJavaScript(script,true).catch(()=>{});
}

function attachAiWebsiteNavigationRules(win, provider) {
  if(provider)aiWebsiteWindowProviders.set(win,provider);
  attachSceneImageContextMenu(win);
  win.webContents.on('did-finish-load',()=>prefillWebLoginCredential(win,provider));
  win.webContents.setWindowOpenHandler(({url}) => {
    if (url==='about:blank'||isAllowedAiWebsiteUrl(url)) return {action:'allow',overrideBrowserWindowOptions:{width:760,height:800,autoHideMenuBar:true,webPreferences:{partition:'persist:official-ai-web-r24',contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,preload:path.join(__dirname,'ai-web-preload.cjs')}}};
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return {action:'deny'};
  });
  const openExternalAndBlock = (event,url) => {
    if (isAllowedAiWebsiteUrl(url)) return;
    event.preventDefault();
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  };
  win.webContents.on('will-navigate',openExternalAndBlock);
  win.webContents.on('will-redirect',openExternalAndBlock);
  win.webContents.on('did-create-window',child=>{try{child.webContents.setUserAgent(AI_WEB_CHROME_UA);}catch{} attachAiWebsiteNavigationRules(child,provider);});
}

// 官網視窗（含它開出的彈出視窗）只載入外部網站：權限請求一律先拒絕，只留「複製回覆」
// 需要的剪貼簿寫入與全螢幕。Electron 的預設行為是「沒有處理器就通通允許」——官網或被導向
// 的任何頁面可以不經詢問就取得麥克風、相機、定位、通知，和本 App「不碰玩家隱私」的承諾不符。
let aiWebSessionHardened = false;
function hardenAiWebSession() {
  if (aiWebSessionHardened) return;
  aiWebSessionHardened = true;
  const officialAiSession = session.fromPartition('persist:official-ai-web-r24');
  try { officialAiSession.setUserAgent(AI_WEB_CHROME_UA, 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'); } catch {}
  // Electron 的 UA-CH 只宣告 Chromium，會被 Google 判成內嵌瀏覽器；這裡補上與真 Chrome 相同的
  // 用戶端提示。這不是 Google 登入的解法（官方禁止內嵌），但能讓其他官網正常運作。
  try {
    const setHeader = (headers, name, value) => {
      for (const key of Object.keys(headers)) if (key.toLowerCase() === name.toLowerCase()) headers[key] = value;
      headers[name] = value;
    };
    officialAiSession.webRequest.onBeforeSendHeaders({urls: ['<all_urls>']}, (details, callback) => {
      const headers = details.requestHeaders || {};
      setHeader(headers, 'User-Agent', AI_WEB_CHROME_UA);
      setHeader(headers, 'sec-ch-ua', AI_WEB_CHROME_UA_CH);
      setHeader(headers, 'sec-ch-ua-mobile', '?0');
      setHeader(headers, 'sec-ch-ua-platform', '"Windows"');
      setHeader(headers, 'sec-ch-ua-platform-version', '"19.0.0"');
      setHeader(headers, 'sec-ch-ua-arch', '"x86"');
      setHeader(headers, 'sec-ch-ua-architecture', '"x86"');
      setHeader(headers, 'sec-ch-ua-bitness', '"64"');
      setHeader(headers, 'sec-ch-ua-model', '""');
      setHeader(headers, 'sec-ch-ua-wow64', '?0');
      setHeader(headers, 'sec-ch-ua-full-version', `"${AI_WEB_CHROME_FULL}"`);
      setHeader(headers, 'sec-ch-ua-full-version-list', AI_WEB_CHROME_FULL_UA_CH);
      callback({requestHeaders: headers});
    });
  } catch {}
  // FedCM／Google One Tap 的權限名稱在 Chromium 是 identity-credentials-get；舊版
  // Electron 可能以 fedcm 回報。只放行這一項，其餘相機、麥克風、定位、通知仍一律拒絕。
  const allowed = new Set(['clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'identity-credentials-get', 'fedcm']);
  officialAiSession.setPermissionRequestHandler((webContents, permission, callback) => callback(allowed.has(permission)));
  officialAiSession.setPermissionCheckHandler((webContents, permission) => allowed.has(permission));
}

function openAiWebsite(provider, mode='embedded') {
  const url=AI_WEBSITE_URLS[String(provider||'')];
  if (!url) throw new Error('不支援的 AI 網頁。');
  if (mode!=='embedded') {
    const active=webCompanionWindows.get(activeWebCompanionProvider);
    if (active&&!active.isDestroyed()) active.hide();
    activeWebCompanionProvider='';
    // 外部模式＝App 的「自動化專用」Chrome／Edge。登入必須發生在同一個設定檔，
    // 自動化才接得到；不可另開使用者平常的 Chrome（那裡登入的 Cookie 不會進到自動化設定檔）。
    return openAutomationWebsite(String(provider||''),url);
  }
  hardenAiWebSession();
  let win=webCompanionWindows.get(provider);
  const isNewWindow=!win||win.isDestroyed();
  if (isNewWindow) {
    win=new BrowserWindow({
      width:900,height:820,minWidth:520,minHeight:520,autoHideMenuBar:true,show:false,
      backgroundColor:'#F5EFE3',
      title:`${provider} · 官方 AI 網站`,
      webPreferences:{partition:'persist:official-ai-web-r24',contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,preload:path.join(__dirname,'ai-web-preload.cjs')}
    });
    // 內建瀏覽器即 Chromium（Chrome 同引擎）：使用 Chrome UA 提升官網相容性（尤其 Gemini）。
    // Google 登入仍只支援外部真 Chrome；這裡的偽裝僅供其他官網相容性與備援。
    // API Key 只走 Windows 加密保存的本機後端，絕不注入官網視窗、不上傳。
    try{win.webContents.setUserAgent(AI_WEB_CHROME_UA);}catch{}
    webCompanionWindows.set(provider,win);
    attachAiWebsiteNavigationRules(win,provider);
    win.on('closed',()=>{if(webCompanionWindows.get(provider)===win)webCompanionWindows.delete(provider);if(activeWebCompanionProvider===provider)activeWebCompanionProvider='';});
    // 內容就緒才顯示，避免長時間白畫面被誤認為開啟失敗。
    win.once('ready-to-show',()=>{if(!win.isDestroyed()){win.show();win.focus();}});
    // 載入失敗（斷網、DNS、被擋）時給明確重試，而不是永遠空白。
    win.webContents.on('did-fail-load',(event,errorCode,errorDescription,validatedURL,isMainFrame)=>{
      if(isMainFrame===false||win.isDestroyed())return;
      dialog.showMessageBox(win,{type:'warning',buttons:['重試','關閉'],defaultId:0,cancelId:1,noLink:true,title:'官網載入失敗',message:`官方 AI 網站載入失敗（${errorCode}）：${errorDescription||'請檢查網路連線。'}`,detail:`網址：${validatedURL||url}`}).then(({response})=>{
        if(win.isDestroyed())return;
        if(response===0)win.loadURL(url);
        else win.close();
      }).catch(()=>{});
    });
    win.loadURL(url);
    // 保底：10 秒內若 ready-to-show 沒觸發也顯示，避免使用者以為沒開啟。
    setTimeout(()=>{try{if(!win.isDestroyed()&&!win.isVisible()&&webCompanionWindows.get(provider)===win)win.show();}catch{}},10000);
  }
  // 一次只顯示一個官網視窗：先藏起其他服務的視窗，避免重疊蓋住遊戲或新視窗。
  for (const [key,existing] of webCompanionWindows) {
    if(key!==provider&&existing&&!existing.isDestroyed()&&existing.isVisible())existing.hide();
  }
  activeWebCompanionProvider=provider;
  if(!isNewWindow){if(win.isVisible())win.focus();else{win.show();win.focus();}}
  return Promise.resolve({ok:true,mode:'embedded',provider});
}

function buildModelMenuScript(action, modelName='') {
  return `(async()=>{
    const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
    const rawLabel=e=>String(e?.getAttribute('aria-label')||e?.getAttribute('title')||e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();
    // 官網常把目前的模型寫在觸發鈕的 aria-label，但選單項目才是最新名稱。
    // 開頭若有純數字圖示（例如 Gemini 的方案圖示）先移除，避免把圖示數字當成名稱。
    const label=e=>rawLabel(e).replace(/^\\d+\\s+/,'').slice(0,120);
    const stopWords=new RegExp(${JSON.stringify(aiWebFlow.SITE_HINTS.stopWords)},'i');
    const modelWords=new RegExp('(^|[^a-z])(?:model|select model|change model|模型|gpt[0-9]*|claude|gemini[0-9]*|deepseek|grok|qwen[0-9]*|mistral|llama|sonar|copilot|command|glm|flash|opus|sonnet|haiku|instant|thinking|reasoning|auto|kimi|meta|pro|think deeper|quick response)(?=$|[^a-z])','i');
    const menuSelector='[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-state="open"]';
    const itemSelector='button,[role="option"],[role="menuitem"],[role="menuitemradio"],[role="button"]';
    const visibleMenus=()=>[...document.querySelectorAll(menuSelector)].filter(visible);
    const optionLike=e=>['option','menuitem','menuitemradio'].includes(e.getAttribute('role'))||!!e.closest('[role="listbox"],[role="menu"]');
    const skipItem=e=>{
      if(!e||e.disabled)return true;
      if(e.getAttribute('aria-disabled')==='true')return true;
      // 有子選單的項目（例如 Gemini 的「思考程度」）不是可直接切換的模型。
      if(e.getAttribute('aria-haspopup')==='true')return true;
      // Gemini 免費帳號會把付費方案列成 upsell；點下去只會開升級頁，不列入可切換模型。
      if(/^upsell_/i.test(String(e.getAttribute('data-mode-id')||'')))return true;
      return /^(?:思考程度|思考レベル|thinking level|更多|more|管理|manage|設定|settings)$/i.test(label(e));
    };
    const usableTrigger=e=>!!e&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';
    const globalModelTrigger=()=>{
      const candidates=[...document.querySelectorAll('button,[role="button"]')].filter(visible)
        .filter(e=>usableTrigger(e)&&modelWords.test(rawLabel(e))&&rawLabel(e).length<100)
        .filter(e=>!e.closest(menuSelector))
        .filter(e=>!/^(?:新對話|臨時對話|主選單|設定|更多|上傳與工具|語音輸入.*|新聊天|新增對話)$/.test(rawLabel(e)));
      const score=e=>{
        let s=0;
        const attrs=rawLabel(e)+' '+String(e.className||'')+' '+String(e.getAttribute('data-test-id')||'');
        if(/picker|model|mode|模型|模式/i.test(attrs))s+=10;
        if(/目前.*(?:為|是|使用)/.test(rawLabel(e)))s+=5;
        if(/true|menu|listbox/i.test(String(e.getAttribute('aria-haspopup')||'')))s+=3;
        const r=e.getBoundingClientRect();
        if(r.y<220)s+=2;
        return s;
      };
      return candidates.sort((a,b)=>score(b)-score(a))[0]||null;
    };
    const findTrigger=()=>{
      const editors=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
      for(const editor of editors){
        let parent=editor;
        for(let depth=0;depth<8&&parent;depth++,parent=parent.parentElement){
          const candidates=[...parent.querySelectorAll('button,[role="button"]')].filter(visible)
            .filter(e=>usableTrigger(e)&&modelWords.test(rawLabel(e))&&rawLabel(e).length<100);
          if(candidates.length){
            candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),er=editor.getBoundingClientRect();return Math.hypot(ar.x-er.x,ar.y-er.y)-Math.hypot(br.x-er.x,br.y-er.y)});
            return candidates[0];
          }
        }
      }
      return globalModelTrigger();
    };
    const collect=()=>{
      let items=visibleMenus().flatMap(m=>[...m.querySelectorAll(itemSelector)].filter(visible));
      items=items.filter(e=>!skipItem(e)&&label(e).length<100&&(optionLike(e)||modelWords.test(label(e))));
      const seen=new Set();
      return items.filter(e=>{const name=label(e);if(!name||seen.has(name))return false;seen.add(name);return true;});
    };
    const readCurrent=items=>{
      // 觸發鈕永遠是可見狀態，優先相信它；選單項目的 selected 類別在剛切換或
      // 分頁被帶到前景時可能還是上一個值，不能拿來當唯一依據。
      const trigger=findTrigger();
      const text=trigger?rawLabel(trigger):'';
      const match=text.match(/目前[為是在]*[「『"]?([^」』"』]+)[」』"]?(?:模式)?/);
      if(match&&match[1].trim())return match[1].trim().slice(0,120);
      // Gemini 的 GEM-MENU-ITEM 用 class="selected" 標示目前模型；aria 屬性不一定有。
      const active=items.find(e=>e.getAttribute('data-active')==='true'||e.getAttribute('aria-checked')==='true'||e.getAttribute('aria-selected')==='true'||/(?:^|\\s)(?:selected|checked)(?:\\s|$)/i.test(String(e.className||'')));
      return active?label(active):'';
    };
    // 官網正在產生回覆時，模型選單常可按但不會套用；先等停止鈕消失再切換，
    // 才不會回報成功卻仍停留在舊模型。
    const stopControl=()=>[...document.querySelectorAll('button,[role="button"]')].filter(visible).find(e=>!e.disabled&&stopWords.test(rawLabel(e)));
    const waitForIdle=async(timeoutMs,graceMs=0)=>{
      const deadline=Date.now()+timeoutMs;
      // 使用者可能在自動送出「還沒開始」的空檔切模型；先等幾秒看停止鈕是否出現，
      // 若出現就等這一輪生成結束，避免剛切的模型被接下來的送出覆蓋。
      if(graceMs&&!stopControl()){
        const graceDeadline=Math.min(deadline,Date.now()+graceMs);
        while(!stopControl()&&Date.now()<graceDeadline)await new Promise(r=>setTimeout(r,250));
      }
      while(stopControl()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,500));
      if(!stopControl())await new Promise(r=>setTimeout(r,500));
      return !stopControl();
    };
    const normModel=s=>String(s||'').toLocaleLowerCase().replace(/[\\s「」『』"'·•\\-—_()（）]/g,'');
    const sameModel=(a,b)=>{
      const x=normModel(a),y=normModel(b);
      if(!x||!y)return false;
      if(x===y)return true;
      // 官網的觸發鈕只顯示短名稱；先用最具區別性的字樣比對，避免把 Flash 和 Flash-Lite 混為一談。
      if(/flashlite/.test(x))return /flashlite/.test(y);
      if(/flash/.test(x))return /flash/.test(y)&&!/flashlite/.test(y);
      if(/(?:^|[^a-z])pro(?:$|[^a-z])/.test(x))return /(?:^|[^a-z])pro(?:$|[^a-z])/.test(y);
      if(/thinking|reasoning|思考/.test(x))return /thinking|reasoning|思考/.test(y);
      return x.length>=4&&y.length>=4&&(x.includes(y)||y.includes(x));
    };
    if(${JSON.stringify(action)}!=='list'&&!(await waitForIdle(60000)))return {ok:false,error:'官網正在產生回覆，請等回覆完成後再切換模型。'};
    let items=collect(),opened=null;
    if(!items.length){
      const trigger=findTrigger();
      if(trigger){opened=trigger;trigger.click();await new Promise(r=>setTimeout(r,500));items=collect();}
    }
    if(${JSON.stringify(action)}==='list'){
      const current=readCurrent(items);
      const models=items.map(label).filter(Boolean);
      // 自動讀取不該把官網選單留在畫面上；只有這次由程式開啟時才收回。
      if(opened&&visibleMenus().length){try{opened.click();}catch{}}
      return {ok:models.length>0,models,current,error:models.length?'':'請先在官網登入，並確認該網站已顯示模型選單。'};
    }
    const wanted=${JSON.stringify(modelName)}.trim().toLocaleLowerCase();
    const findTarget=()=>items.find(e=>label(e).toLocaleLowerCase()===wanted)||items.find(e=>label(e).toLocaleLowerCase().startsWith(wanted));
    const openMenu=async()=>{
      if(visibleMenus().length)return;
      const trigger=findTrigger();
      if(!trigger)return;
      trigger.click();
      await new Promise(r=>setTimeout(r,500));
      items=collect();
    };
    let target=findTarget();
    if(!target&&!visibleMenus().length){
      await openMenu();
      target=findTarget();
    }
    if(!target)return {ok:false,error:'找不到此模型選項。請在官網確認登入狀態並重新整理模型清單。'};
    const chosen=label(target);
    const before=rawLabel(findTrigger());
    const beforeCurrent=readCurrent(items);
    if(sameModel(before,chosen)&&sameModel(beforeCurrent,chosen))return {ok:true,label:chosen};
    const clickTarget=async()=>{
      await openMenu();
      const next=findTarget()||target;
      if(!next)return false;
      try{next.scrollIntoView({block:'nearest'});}catch{}
      next.click();
      await new Promise(r=>setTimeout(r,500));
      return true;
    };
    const waitForApplied=async timeoutMs=>{
      const deadline=Date.now()+timeoutMs;
      while(Date.now()<deadline){
        const now=rawLabel(findTrigger());
        if(now&&now!==before&&sameModel(now,chosen))return true;
        await new Promise(r=>setTimeout(r,300));
      }
      // 觸發鈕可能只顯示短名稱（例如 Flash／Pro），再開一次選單讀取 selected 項目。
      const trigger=findTrigger();
      if(!trigger)return false;
      const wasOpen=visibleMenus().length>0;
      if(!wasOpen)trigger.click();
      await new Promise(r=>setTimeout(r,450));
      const current=readCurrent(collect());
      if(!wasOpen&&visibleMenus().length){try{trigger.click();}catch{}}
      return sameModel(current,chosen);
    };
    await clickTarget();
    let applied=await waitForApplied(4000);
    // 有少數情況點擊只關閉選單、沒有套用（例如官網剛好在切換帳號或串流剛結束）。
    // 等一段時間仍未套用時再重試一次，仍失敗才回報，不再假裝切換成功。
    if(!applied){
      await waitForIdle(60000,8000);
      await new Promise(r=>setTimeout(r,800));
      await clickTarget();
      applied=await waitForApplied(4000);
    }
    if(!applied)return {ok:false,error:'官網沒有套用這個模型；請確認官網目前沒有在產生回覆，或重新讀取模型清單後再試。'};
    return {ok:true,label:chosen};
  })()`;
}

async function executeModelMenuAction(action, modelName='', options={}) {
  const provider=String((options&&options.provider)||activeWebCompanionProvider||'gemini').trim().toLowerCase();
  const url=AI_WEBSITE_URLS[provider];
  if(!url)throw new Error('不支援此 AI 網站。');
  const requestedMode=String(options&&options.mode||'');
  const mode=requestedMode==='external'?'external':requestedMode==='embedded'?'embedded':(provider==='gemini'?'external':'embedded');
  const script=buildModelMenuScript(action,modelName);
  if(mode==='external'){
    let tabs=[];
    try{tabs=await listAutomationTabs();}catch{throw new Error('自動化瀏覽器沒有開啟；請先按「開啟官網」並保持瀏覽器執行。');}
    const tab=findAutomationProviderTab(tabs,url,preferredAutomationTabId(provider),provider);
    if(!tab)throw new Error('請先按「開啟官網」，在自動化瀏覽器開啟並登入官網。');
    rememberAutomationTab(provider,tab);
    if(action==='select'&&tab.id){
      // Gemini 的模型選單是彈出層：分頁在背景時，DOM 點擊可能只關閉選單或不開啟，
      // 造成「回報成功但官網沒變」。切換模型前先把該分頁帶到前景。
      try{await fetch(`${automationHttpBase()}/json/activate/${encodeURIComponent(tab.id)}`,{signal:AbortSignal.timeout(2500)});}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const runner=createWebAutoRunner('external',provider,url,tab.id);
    await runner.ready();
    return runner.evaluate(script, action === 'select' ? 70000 : 12000);
  }
  const win=webCompanionWindows.get(provider)||webCompanionWindows.get(activeWebCompanionProvider);
  if (!win||win.isDestroyed()) throw new Error('請先切換到 App 內登入模式並開啟 AI 官網。');
  if (win.webContents.isLoading()) await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  return win.webContents.executeJavaScript(script,true);
}

async function fillAiWebsitePrompt(prompt) {
  const provider=activeWebCompanionProvider;
  const win=webCompanionWindows.get(provider);
  if(!win||win.isDestroyed())throw new Error('請先切換到 App 內登入模式並開啟 AI 官網。');
  const text=String(prompt||'');
  if(!text||text.length>100000)throw new Error('提示詞內容為空或超過可填入長度。');
  const runner=createWebAutoRunner('embedded',provider,AI_WEBSITE_URLS[provider]||'');
  await runner.ready();
  return fillViaRunner(runner,text);
}

// ── 網頁模式自動化：自動送出提示詞＋自動抓回覆接回 ──────────────────────────
// 內建模式：直接控制 App 內官網視窗（webContents.executeJavaScript）。
// 外部模式：用「自動化專用設定檔」啟動 Chrome／Edge（附除錯埠），以 CDP 控制該分頁；
// 專用設定檔要登入一次官網，之後登入狀態會保留。兩種模式共用 ai-web-flow.cjs 的
// 頁面腳本與「什麼時候可以接回」的判斷，只換執行環境。
// 不把除錯埠寫死：同一個 Chrome 設定檔若已由舊版 App 或上一次執行開著，
// Chrome 會沿用原程序並忽略新的 --remote-debugging-port；此時要改讀設定檔裡的
// DevToolsActivePort 才能接上那個已登入的瀏覽器，而不是卡在 about:blank。
let automationPort = Number(process.env.CLAUDE_AUTOMATION_PORT) || 4462;
// Claude 使用獨立設定檔與獨立除錯埠：不接手其他 AI 官網的瀏覽器，也不會默默沿用
// 舊版 r24/r25 設定檔裡的登入。第一次由使用者本人登入；若使用者在設定中明確保存
// Claude 帳密並勾選「自動送出登入」，才由登入頁預填／送出。
function automationProviderPortBase(provider = '') {
  const name = String(provider || '').toLowerCase();
  if (name === 'anthropic') return Number(process.env.CLAUDE_AUTOMATION_PORT_CLAUDE) || 4472;
  return Number(process.env.CLAUDE_AUTOMATION_PORT) || 4462;
}
const AUTOMATION_POLL_MS = 1000;
const AUTOMATION_MAX_MS = 15 * 60 * 1000;
let webAutoWatch = null;
// 外部模式可能同時開著多個同網址分頁（例如舊故事、新臨時對話）。只靠網址每次重找
// 會在分頁被帶到前景、順序改變時換到另一個分頁，造成模型切在 A 分頁、驗證卻讀 B 分頁。
// 這裡記住每個 provider 目前使用中的 target id，後續操作優先沿用同一個分頁。
const automationTabIds = new Map();
function rememberAutomationTab(provider, tab) {
  const id = String((tab && tab.id) || '').trim();
  if (provider && id) automationTabIds.set(provider, id);
  return id;
}
function preferredAutomationTabId(provider) {
  return String(automationTabIds.get(provider) || '').trim();
}

function automationHttpBase(port = automationPort) {
  return `http://127.0.0.1:${port}`;
}
async function automationBrowserAliveAt(port) {
  try {
    const response = await fetch(`${automationHttpBase(port)}/json/version`, {signal: AbortSignal.timeout(1200)});
    if (!response.ok) return false;
    const info = await response.json().catch(() => null);
    // 確認真的是 Chromium 系的除錯埠（避免那個埠剛好被別的服務佔用時誤認成自動化瀏覽器）。
    return Boolean(info && typeof info.Browser === 'string' && /chrome|chromium|edge/i.test(info.Browser));
  } catch { return false; }
}
async function automationBrowserAlive() {
  return automationBrowserAliveAt(automationPort);
}
// Chrome 正在使用某個設定檔時，會在該資料夾留下 DevToolsActivePort（第一行是實際埠）。
// 先驗證該埠真的還是 Chromium，才切換過去；關閉後留下的舊檔不會被誤用。
async function automationDebugPortFromProfile(profileDir) {
  try {
    const raw = fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
    const port = Number(String(raw).split(/\r?\n/)[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 0;
    return await automationBrowserAliveAt(port) ? port : 0;
  } catch { return 0; }
}
// 有些 Chrome 版本不會留下 DevToolsActivePort，但程序命令列仍有實際埠與設定檔路徑。
// 只在設定檔沒有 DevToolsActivePort 時才查一次，避免每次啟動都多花時間。
function automationPortFromRunningChrome(profileDir) {
  const wanted = path.resolve(profileDir).toLowerCase().replace(/[\\/]+$/, '');
  const script = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | ForEach-Object { $_.CommandLine }`;
  let output = '';
  try {
    output = String(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
    }));
  } catch {
    try {
      output = String(execFileSync('wmic.exe', ['process', 'where', "name='chrome.exe' or name='msedge.exe'", 'get', 'CommandLine', '/value'], {
        encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
      }));
    } catch { return 0; }
  }
  for (const line of output.split(/\r?\n/)) {
    const portMatch = line.match(/--remote-debugging-port=(\d{1,5})/i);
    if (!portMatch) continue;
    const port = Number(portMatch[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    const dirMatch = line.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/i);
    if (!dirMatch) continue;
    const runningDir = path.resolve(String(dirMatch[1] || dirMatch[2] || '').replace(/^"+|"+$/g, '')).toLowerCase().replace(/[\\/]+$/, '');
    if (runningDir === wanted) return port;
  }
  return 0;
}
// 只找「命令列明確使用這個自動化設定檔」的 Chrome／Edge 程序。重新啟動時只終止這些
// 程序，絕不會動到使用者平常的瀏覽器。回傳 pid 供 taskkill 使用。
function automationProcessesForProfile(profileDir) {
  const wanted = path.resolve(profileDir).toLowerCase().replace(/[\\/]+$/, '');
  const script = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`;
  let output = '';
  try {
    output = String(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 6000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
    }));
  } catch { return []; }
  const processes = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    const divider = line.indexOf('|');
    if (divider < 1) continue;
    const pid = Number(line.slice(0, divider));
    const commandLine = line.slice(divider + 1);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    const dirMatch = commandLine.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/i);
    if (!dirMatch) continue;
    const runningDir = path.resolve(String(dirMatch[1] || dirMatch[2] || '').replace(/^"+|"+$/g, '')).toLowerCase().replace(/[\\/]+$/, '');
    if (runningDir === wanted) processes.push({pid, commandLine});
  }
  return processes;
}
function canListenOnLocalPort(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(Number(port), '127.0.0.1');
  });
}
async function findFreeAutomationPort(start) {
  const first = Math.max(1024, Number(start) || 4462);
  for (let port = first; port < Math.min(65535, first + 40); port++) {
    if (await canListenOnLocalPort(port)) return port;
  }
  throw new Error('找不到可用的自動化瀏覽器除錯埠。');
}
async function listAutomationTabs() {
  const response = await fetch(`${automationHttpBase()}/json/list`, {signal: AbortSignal.timeout(2500)});
  if (!response.ok) throw new Error('自動化瀏覽器沒有回應。');
  return response.json();
}
function automationBrowserProfileDir(provider = '') {
  const name = String(provider || '').toLowerCase();
  if (name === 'anthropic') {
    const claudeOverride = String(process.env.CLAUDE_AUTOMATION_PROFILE_CLAUDE || '').trim();
    if (claudeOverride) return path.resolve(claudeOverride);
    // Claude 專用設定檔：不繼承其他 AI 或舊版自動化瀏覽器的登入。使用者第一次
    // 使用時必須在官網親自登入或切換帳號；之後可選擇保存帳密並明確啟用自動登入。
    return path.join(app.getPath('userData'), 'web-automation-browser-claude-v20');
  }
  const override = String(process.env.CLAUDE_AUTOMATION_PROFILE || '').trim();
  if (override) return path.resolve(override);
  // 沿用舊版已登入的 r24 設定檔，升級後不必重新登入；只有使用者已經建立過
  // r25（且沒有 r24）時才用 r25。兩者都沒有時建立 r24，與舊版路徑一致。
  const legacy = path.join(app.getPath('userData'), 'web-automation-browser-r24');
  const current = path.join(app.getPath('userData'), 'web-automation-browser-r25');
  if (fs.existsSync(legacy) || !fs.existsSync(current)) return legacy;
  return current;
}
function findAutomationBrowserExecutable() {
  const chrome = findChromeExecutable();
  if (chrome) return chrome;
  const candidates = [
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || '';
}
function automationDelay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
// 啟動自動化瀏覽器時直接載入官網，不要先開 about:blank。舊版會先開空白視窗，
// 若後續導航失敗，使用者就只看到一個「無法打開的 about:blank」視窗。
let automationInitialUrl = AI_WEBSITE_URLS.gemini;
// R51｜Google 帳號不預設：開啟 Gemini 時先經過「帳號選擇器」，由使用者本人挑帳號，
  // 不會自動沿用上次登入的帳號。渲染程序以 IPC 同步開關（預設開）。
let askGoogleAccount = true;
const GEMINI_CHOOSER_URL = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(AI_WEBSITE_URLS.gemini);
function automationEntryUrl(url) {
  const u = String(url || '');
  if (askGoogleAccount && u === AI_WEBSITE_URLS.gemini) return GEMINI_CHOOSER_URL;
  return u;
}
// 本次 App 執行階段是否已經問過帳號（每個階段只問一次，之後沿用同一分頁）。
let googleAccountAskedThisRun = false;
async function ensureAutomationBrowserFor(provider, url) {
  automationPort = automationProviderPortBase(provider);
  automationInitialUrl = automationEntryUrl(String(url || '').trim()) || AI_WEBSITE_URLS.gemini;
  return ensureAutomationBrowser(provider);
}
async function ensureAutomationBrowser(provider = '') {
  const profileDir = automationBrowserProfileDir(provider);
  try { fs.mkdirSync(profileDir, {recursive: true}); } catch {}
  // 同一個設定檔已經有 Chrome 在跑時，先接上它實際的除錯埠。這能避免
  // 「Chrome 只開出 about:blank、App 卻一直等另一個埠」的假啟動。
  const existingPort = await automationDebugPortFromProfile(profileDir);
  if (existingPort) {
    automationPort = existingPort;
    return {reused: true, port: existingPort};
  }
  const runningPort = automationPortFromRunningChrome(profileDir);
  if (runningPort && await automationBrowserAliveAt(runningPort)) {
    automationPort = runningPort;
    return {reused: true, port: runningPort};
  }
  if (await automationBrowserAlive()) return {reused: true, port: automationPort};
  const exe = findAutomationBrowserExecutable();
  if (!exe) throw new Error('找不到 Chrome 或 Edge，無法啟動自動化瀏覽器。');
  // 若預設埠被其他服務佔用，改用下一個可用埠，避免 Chrome 啟動後沒有除錯埠。
  if (!await canListenOnLocalPort(automationPort)) automationPort = await findFreeAutomationPort(automationPort + 1);
  const args = [
    `--remote-debugging-port=${automationPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble',
    '--disable-sync', '--disable-extensions',
    // Google 登入請用真正的 Chrome／Edge 視窗；關閉 WebAuthn／Passkey 相關功能，
    // 避免登入流程把使用者導向 Windows Hello／PIN。App 本身不呼叫任何 Windows 金鑰功能。
    '--disable-features=WebAuthentication,WebAuthenticationCable,WebAuthenticationPasskey,WebAuthenticationConditionalUI',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1100,850',
    // 不傳 --remote-allow-origins=*：除錯埠雖然只綁 127.0.0.1，但「任何網頁」都能連
    // 127.0.0.1；開放來源等於讓造訪中的網站接管這個已登入多家官網的瀏覽器（Chrome 加
    // 這個旗標正是為了擋這種攻擊）。App 自己用 Node WebSocket 連 CDP、不帶 Origin
    // 標頭，維持預設政策即可正常自動化。
    '--new-window', automationInitialUrl || AI_WEBSITE_URLS.gemini
  ];
  spawn(exe, args, {detached: true, stdio: 'ignore', windowsHide: false}).unref();
  for (let i = 0; i < 48; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await automationBrowserAlive()) return {reused: false, port: automationPort};
    // Chrome 若被既有程序接手，新埠不會出現；改抓它寫下的實際埠。
    const activePort = await automationDebugPortFromProfile(profileDir);
    if (activePort) {
      automationPort = activePort;
      return {reused: true, port: activePort};
    }
  }
  throw new Error('自動化瀏覽器啟動逾時，請確認 Chrome／Edge 可以正常開啟。');
}
function automationTabIsBlank(url) {
  return !url || /^(?:about:blank|chrome:\/\/newtab|chrome:\/\/new-tab-page)/i.test(String(url));
}
async function waitForAutomationTab(targetId, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await automationDelay(250);
    let tabs = [];
    try { tabs = await listAutomationTabs(); } catch {}
    const current = tabs.find(tab => tab.id === targetId);
    if (current && /^https?:/i.test(String(current.url || '')) && !automationTabIsBlank(current.url)) return current;
  }
  return null;
}
async function navigateAutomationTab(target, url) {
  if (!target || !target.webSocketDebuggerUrl) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await cdpSend(target.webSocketDebuggerUrl, {method: 'Page.navigate', params: {url}}, 12000);
      if (result && result.errorText) throw new Error(result.errorText);
    } catch {}
    const current = await waitForAutomationTab(target.id, attempt === 0 ? 9000 : 5000);
    if (current) { Object.assign(target, current); return true; }
  }
  return false;
}
async function closeBlankAutomationTabs(keepId = '') {
  let tabs = [];
  try { tabs = await listAutomationTabs(); } catch { return; }
  await Promise.all(tabs
    .filter(tab => tab && tab.type === 'page' && tab.id !== keepId && automationTabIsBlank(tab.url))
    .map(tab => fetch(`${automationHttpBase()}/json/close/${encodeURIComponent(tab.id)}`, {signal: AbortSignal.timeout(2000)}).catch(() => {})));
}
function closeAutomationTab(id) {
  if (!id) return Promise.resolve();
  return fetch(`${automationHttpBase()}/json/close/${encodeURIComponent(id)}`, {signal: AbortSignal.timeout(2000)}).catch(() => {});
}
async function createAutomationTab(url) {
  const endpoint = `${automationHttpBase()}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, {method: 'PUT', signal: AbortSignal.timeout(8000)}).catch(() => null);
  if (!response || !response.ok) response = await fetch(endpoint, {signal: AbortSignal.timeout(8000)}).catch(() => null);
  if (!response || !response.ok) throw new Error('無法在自動化瀏覽器開啟官網分頁。');
  const target = await response.json();
  if (!target || !target.id) throw new Error('自動化瀏覽器沒有回傳可用的官網分頁。');
  // 少數 Chrome 版本用 /json/new 建分頁時會先停在 about:blank；這時用 CDP 明確導航，
  // 並等到網址真的離開空白頁；失敗就明確報錯，不把空白頁當成成功。
  if (automationTabIsBlank(target.url) || !/^https?:/i.test(String(target.url || ''))) {
    if (!await navigateAutomationTab(target, url)) {
      await closeAutomationTab(target.id);
      throw new Error('自動化瀏覽器分頁停在 about:blank，沒有完成載入。請按「重新啟動自動化瀏覽器」後再試。');
    }
  } else {
    const loaded = await waitForAutomationTab(target.id, 9000);
    if (!loaded) {
      await closeAutomationTab(target.id);
      throw new Error('自動化瀏覽器分頁沒有完成載入。請按「重新啟動自動化瀏覽器」後再試。');
    }
    Object.assign(target, loaded);
  }
  return target;
}
async function openAutomationTab(provider, url) {
  url = automationEntryUrl(url);
  await ensureAutomationBrowserFor(provider, url);
  let tabs = [];
  try { tabs = await listAutomationTabs(); } catch {}
  // 已有同一個官網（或同一個登入頁）就沿用，避免每次按「開啟官網」都多開分頁。
  const existing = findAutomationProviderTab(tabs, url, preferredAutomationTabId(provider), provider);
  if (existing && !automationTabIsBlank(existing.url)) {
    fetch(`${automationHttpBase()}/json/activate/${encodeURIComponent(existing.id)}`, {signal: AbortSignal.timeout(2000)}).catch(() => {});
    await closeBlankAutomationTabs(existing.id);
    return existing;
  }
  // 舊版留下的空白分頁直接導航到官網，不再另開一個空白視窗。
  const blank = tabs.find(tab => isDebuggableAutomationTab(tab) && automationTabIsBlank(tab.url));
  let target = null;
  if (blank) {
    target = blank;
    if (!await navigateAutomationTab(target, url)) {
      await closeAutomationTab(target.id);
      throw new Error('自動化瀏覽器分頁停在 about:blank，沒有完成載入。請按「重新啟動自動化瀏覽器」後再試。');
    }
  } else {
    target = await createAutomationTab(url);
  }
  fetch(`${automationHttpBase()}/json/activate/${encodeURIComponent(target.id)}`, {signal: AbortSignal.timeout(2000)}).catch(() => {});
  await closeBlankAutomationTabs(target.id);
  return target;
}
async function openAutomationWebsite(provider, url) {
  await ensureAutomationBrowserFor(provider, url);
  const tab = await openAutomationTab(provider, url);
  rememberAutomationTab(provider, tab);
  return {ok:true, mode:'external', provider, tab:{id:tab.id, url:tab.url, title:tab.title || ''}};
}
// 「檢查登入與接入」：不關瀏覽器，只把官網分頁帶到前景並回報健康狀態。
async function reconnectAutomationBrowser(payload = {}) {
  const provider = String(payload.provider || 'gemini').toLowerCase();
  // 「新增／切換 Google 帳號」會帶 accounts.google.com/AddSession：由使用者本人在自動化
  // 瀏覽器加入另一個 Google 帳號（App 不碰帳密），之後在 Gemini 官網右上角切換即可。
  const url = /^https:\/\/accounts\.google\.com\//.test(String(payload.url || ''))
    ? String(payload.url)
    : AI_WEBSITE_URLS[provider];
  if (!url) throw new Error('不支援的 AI 網頁。');
  await ensureAutomationBrowserFor(provider, url);
  const tab = await openAutomationTab(provider, url);
  if (AI_WEBSITE_URLS[provider] && url === AI_WEBSITE_URLS[provider]) rememberAutomationTab(provider, tab);
// R47：開官網（外部模式）自動排版——App 佔左 2/3、這個瀏覽器佔右 1/3（best-effort）。
  void applyExternalCompanionThirds();
  const health = await webAutoHealth({provider, mode:'external'});
  return {
    ok:true,
    provider,
    tab:{id:tab.id, url:tab.url, title:tab.title || ''},
    health
  };
}
// 「重新啟動自動化瀏覽器」：只終止使用自動化專用設定檔的程序（不動平常的 Chrome），
// 清除舊的空白分頁，換一個可用除錯埠後重新載入官網。登入 Cookie 仍留在同一個設定檔。
async function restartAutomationBrowser(payload = {}) {
  const provider = String(payload.provider || 'gemini').toLowerCase();
  const url = AI_WEBSITE_URLS[provider];
  if (!url) throw new Error('不支援的 AI 網頁。');
  stopWebAutoWatch();
  const profileDir = automationBrowserProfileDir(provider);
  const processes = automationProcessesForProfile(profileDir);
  for (const processInfo of processes) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(processInfo.pid), '/T', '/F'], {
        timeout: 5000, windowsHide: true, stdio: 'ignore'
      });
    } catch {}
  }
  if (processes.length) await automationDelay(1500);
  const remaining = automationProcessesForProfile(profileDir);
  if (remaining.length) {
    throw new Error('無法關閉舊的自動化瀏覽器。請手動關閉那個 Chrome／Edge 視窗後，再按一次「重新啟動自動化瀏覽器」。');
  }
  automationTabIds.clear();
  const preferredPort = automationProviderPortBase(provider);
  automationPort = await canListenOnLocalPort(preferredPort)
    ? preferredPort
    : await findFreeAutomationPort(preferredPort + 1);
  try { fs.rmSync(path.join(profileDir, 'DevToolsActivePort'), {force:true}); } catch {}
  const browser = await ensureAutomationBrowserFor(provider, url);
  const tab = await openAutomationTab(provider, url);
  rememberAutomationTab(provider, tab);
  return {
    ok:true,
    provider,
    restarted: processes.length,
    port: automationPort,
    reused: browser.reused === true,
    tab:{id:tab.id, url:tab.url, title:tab.title || ''}
  };
}
async function recoverAutomationTab(provider, url) {
  // 登入完成時，舊分頁可能被關閉或暫時只剩新分頁。保留本回合提示詞，
  // 重新確認瀏覽器與分頁；已登入的專用設定檔會直接回到官網，不會要求再次登入。
  await ensureAutomationBrowserFor(provider, url);
  const base = automationTabBaseUrl(url);
  let tabs = [];
  try { tabs = await listAutomationTabs(); } catch {}
  const hit = tabs.find(tab => isDebuggableAutomationTab(tab) && base && tab.url.startsWith(base)) || tabs.find(tab => isProviderLoginTabFor(tab, base, provider));
  if (hit) {
    rememberAutomationTab(provider, hit);
    return hit;
  }
  const opened = await openAutomationTab(provider, url);
  rememberAutomationTab(provider, opened);
  return opened;
}
function automationTabBaseUrl(url) {
  try { const parsed = new URL(url); return `${parsed.protocol}//${parsed.host}`; } catch { return ''; }
}
// 自動化瀏覽器分頁的挑選規則（外部模式共用）：
// 1. 先找「網址就是這個官網」的分頁（含同主機的任何路徑）。
// 2. 官網登入常跳到自家 SSO 主機（網址不再是官網網域）：這時只接受「唯一一個不屬於
//    其他 AI 官網」的分頁；同時有多個可疑分頁時寧可回報找不到，也不要把提示詞
//    填到別的網站（多開 AI 官網時最常見的誤填風險）。
function isDebuggableAutomationTab(tab) {
  return Boolean(tab) && tab.type === 'page' && typeof tab.url === 'string' && /^https?:/.test(tab.url) && typeof tab.webSocketDebuggerUrl === 'string';
}
function findAutomationProviderTab(tabs, url, preferredId = '', provider = '') {
  const base = automationTabBaseUrl(url);
  // 先沿用已記住的分頁；只有它還停在官網或登入頁時才採用，避免把指令送到別的網站。
  if (preferredId) {
    const known = tabs.find(tab => tab.id === preferredId && isDebuggableAutomationTab(tab)
      && ((base && tab.url.startsWith(base)) || isProviderLoginTabFor(tab, base, provider)));
    if (known) return known;
  }
  const own = tabs.find(tab => isDebuggableAutomationTab(tab) && base && tab.url.startsWith(base));
  if (own) return own;
  // Gemini 的 Google 登入與 Claude 的 Google／Apple／Email 登入會把同一個分頁導到
  // 驗證網域；在登入完成前仍要認得這個分頁，才不會每次啟用都另開一個新分頁。
  const login = tabs.find(tab => isProviderLoginTabFor(tab, base, provider));
  if (login) return login;
  const otherBases = AI_WEBSITE_BASES.filter(other => other !== base);
  const candidates = tabs.filter(tab => isDebuggableAutomationTab(tab) && !(base && tab.url.startsWith(base)) && !otherBases.some(other => tab.url.startsWith(other)));
  return candidates.length === 1 ? candidates[0] : null;
}
function isGoogleLoginTabFor(tab, base) {
  if (!isDebuggableAutomationTab(tab) || !base || base !== automationTabBaseUrl(AI_WEBSITE_URLS.gemini)) return false;
  try {
    const parsed = new URL(tab.url);
    if (!/(^|\.)accounts\.google\.com$/.test(parsed.hostname)) return false;
    const continuation = parsed.searchParams.get('continue') || '';
    return continuation.startsWith(base);
  } catch { return false; }
}
function isProviderLoginTabFor(tab, base, provider = '') {
  if (isGoogleLoginTabFor(tab, base)) return true;
  if (String(provider || '').toLowerCase() !== 'anthropic' || !isDebuggableAutomationTab(tab)) return false;
  try {
    const parsed = new URL(tab.url), host = parsed.hostname.toLowerCase();
    if (/(^|\.)(?:accounts\.google\.com|appleid\.apple\.com)$/.test(host)) return true;
    if (/(^|\.)claude\.ai$/.test(host) && /^\/(?:login|signin|sign-in)(?:\/|$)/.test(parsed.pathname)) return true;
  } catch {}
  return false;
}
async function cdpSend(wsUrl, message, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('自動化瀏覽器指令逾時。')), timeoutMs);
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => { socket.send(JSON.stringify({id: 1, ...message})); };
    socket.onmessage = event => {
      let payload;
      try { payload = JSON.parse(String(event.data)); } catch { return; }
      if (payload.id !== 1) return;
      if (payload.error) finish(new Error(payload.error.message || '自動化瀏覽器指令失敗。'));
      else finish(null, payload.result);
    };
    socket.onerror = () => finish(new Error('無法連線到自動化瀏覽器。'));
    socket.onclose = () => finish(new Error('自動化瀏覽器連線中斷。'));
  });
}
// 每一個自動化分頁只注入一次反偵測腳本。舊版每次 evaluate／送出前都呼叫
// Page.addScriptToEvaluateOnNewDocument，監看一整回合會累積近千份同樣的腳本，
// 之後每次換頁都要重跑全部腳本，官網畫面因此變慢、甚至讓頁面腳本出錯。
// addScriptToEvaluateOnNewDocument 本來就會套用到之後的導航，所以「每個目標一次」就夠。
const automationStealthPrepared = new Set();
const AUTOMATION_STEALTH_SCRIPT = `(() => {
  try { Object.defineProperty(navigator, 'webdriver', {get: () => undefined, configurable: true}); } catch {}
  try { Object.defineProperty(navigator, 'languages', {get: () => ['zh-TW', 'zh', 'en-US', 'en'], configurable: true}); } catch {}
})();`;
async function prepareAutomationTarget(wsUrl) {
  // 背景分頁／被遮住的 Chrome 視窗會讓 document.visibilityState=hidden，官網的送出事件
  // 就不會被處理。強制 Chrome 以可見、前景模式跑頁面，但不搶使用者目前視窗的焦點。
  try { await cdpSend(wsUrl, {method: 'Emulation.setFocusEmulationEnabled', params: {enabled: true}}, 3000); } catch {}
  try { await cdpSend(wsUrl, {method: 'Page.setWebLifecycleState', params: {state: 'active'}}, 3000); } catch {}
  if (automationStealthPrepared.has(wsUrl)) return;
  // 只隱藏自動化旗標。舊版還把 navigator.plugins 換成 [1,2,3,4,5] 這種假陣列，
  // 官網若呼叫 plugins.item()／namedItem() 會直接丟錯；真實 Chrome 本來就有 PDF
  // 外掛，偽造反而更容易被判定為自動化。window.chrome 也交給瀏覽器原生值。
  try {
    await cdpSend(wsUrl, {method: 'Page.addScriptToEvaluateOnNewDocument', params: {source: AUTOMATION_STEALTH_SCRIPT}}, 3000);
    automationStealthPrepared.add(wsUrl);
  } catch {}
}
async function cdpEvaluate(wsUrl, expression, timeoutMs = 10000) {
  const result = await cdpSend(wsUrl, {method: 'Runtime.evaluate', params: {expression, awaitPromise: true, returnByValue: true, userGesture: true}}, timeoutMs);
  if (result && result.exceptionDetails) throw new Error(result.exceptionDetails.text || '官網頁面指令失敗。');
  return result && result.result ? result.result.value : undefined;
}
async function cdpPressEnter(wsUrl) {
  // Gemini／Quill 需要帶 text 的 keyDown 才會觸發送出；只有 rawKeyDown 會停在輸入框。
  await cdpSend(wsUrl, {method: 'Input.dispatchKeyEvent', params: {type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13}});
  await cdpSend(wsUrl, {method: 'Input.dispatchKeyEvent', params: {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13}});
}
async function cdpClick(wsUrl, x, y) {
  const params = {x: Number(x), y: Number(y), button: 'left', clickCount: 1};
  await cdpSend(wsUrl, {method: 'Input.dispatchMouseEvent', params: {type: 'mouseMoved', x: params.x, y: params.y}});
  await cdpSend(wsUrl, {method: 'Input.dispatchMouseEvent', params: {type: 'mousePressed', ...params}});
  await cdpSend(wsUrl, {method: 'Input.dispatchMouseEvent', params: {type: 'mouseReleased', ...params}});
}
function createWebAutoRunner(mode, provider, url, preferredTabId = '') {
  if (mode === 'external') {
    const pinnedId = String(preferredTabId || preferredAutomationTabId(provider) || '').trim();
    const resolveTab = async () => {
      const tabs = await listAutomationTabs();
      const hit = findAutomationProviderTab(tabs, url, pinnedId, provider);
      if (!hit || !hit.webSocketDebuggerUrl) throw new Error('找不到自動化瀏覽器的官網分頁；請按「開啟官網」重試。');
      rememberAutomationTab(provider, hit);
      await prepareAutomationTarget(hit.webSocketDebuggerUrl);
      return hit.webSocketDebuggerUrl;
    };
    return {
      label: '自動化瀏覽器',
      async ready() {
        for (let i = 0; i < 40; i++) {
          try {
            const state = await cdpEvaluate(await resolveTab(), '(()=>({ready:document.readyState}))()');
            if (state && /interactive|complete/.test(String(state.ready))) return true;
          } catch {}
          await new Promise(resolve => setTimeout(resolve, 750));
        }
        throw new Error('自動化瀏覽器的官網分頁載入逾時。');
      },
      async evaluate(script, timeoutMs) { return cdpEvaluate(await resolveTab(), script, timeoutMs); },
      async insertText(text) {
        return cdpSend(await resolveTab(), {method: 'Input.insertText', params: {text: String(text)}});
      },
      async pressEnter() { return cdpPressEnter(await resolveTab()); },
      async click(x, y) { return cdpClick(await resolveTab(), x, y); }
    };
  }
  const resolveWindow = () => {
    const win = webCompanionWindows.get(provider);
    if (!win || win.isDestroyed()) throw new Error('App 內官網視窗未開啟；請按「開啟官網」後再試。');
    return win;
  };
  return {
    label: 'App 內官網視窗',
    async ready() {
      const win = resolveWindow();
      if (win.webContents.isLoading()) await Promise.race([
        new Promise(resolve => win.webContents.once('did-finish-load', resolve)),
        new Promise(resolve => setTimeout(resolve, 15000))
      ]);
      return true;
    },
    async evaluate(script) { return resolveWindow().webContents.executeJavaScript(script, true); },
    async insertText(text) {
      const win = resolveWindow();
      if (win.isMinimized()) win.restore();
      if (!win.isFocused()) win.focus();
      win.webContents.focus();
      // Chromium 的原生輸入管線：會產生 beforeinput/input，React／ProseMirror／Quill
      // 才會更新內部 state；單純改 innerText 只會讓 DOM 有字、送出鈕仍是 disabled。
      win.webContents.insertText(String(text));
      return true;
    },
    async pressEnter() {
      const win = resolveWindow();
      // Electron only routes sendInputEvent to the focused WebContents. The app
      // window can still own focus after the user chooses a story action, which
      // makes the fallback Enter appear to succeed without reaching the editor.
      if (!win.isFocused()) win.focus();
      win.webContents.focus();
      win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Enter'});
      win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Enter'});
      return true;
    },
    async click(x, y) {
      const win = resolveWindow();
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.focus();
      win.webContents.sendInputEvent({type: 'mouseDown', x: Number(x), y: Number(y), button: 'left', clickCount: 1});
      win.webContents.sendInputEvent({type: 'mouseUp', x: Number(x), y: Number(y), button: 'left', clickCount: 1});
      return true;
    }
  };
}
// 填入提示詞的共用入口：先用原生輸入管線，真的打不進去才退回 DOM 補救。
// 原生管線是「自動送出」能否成功的關鍵：只改 DOM 會讓 React／ProseMirror 的 state
// 仍停留在空白，官網的送出鈕就不會啟用，按下去也不會送出。
async function fillViaRunner(runner, prompt) {
  const text = String(prompt || '');
  if (!text) return {ok: false, error: '提示詞內容為空。'};
  let nativeAttempted = false;
  try {
    const prepared = await runner.evaluate(aiWebFlow.buildPrepareFillScript(text));
    if (prepared && prepared.ok && prepared.alreadyFilled) {
      return {ok: true, alreadyFilled: true, verified: true, native: true};
    }
    if (prepared && prepared.ok && prepared.ready) {
      if (typeof runner.insertText !== 'function') throw new Error('native-insert-unavailable');
      nativeAttempted = true;
      await runner.insertText(text);
      await new Promise(resolve => setTimeout(resolve, 180));
      let verified = await runner.evaluate(aiWebFlow.buildVerifyFillScript(text));
      // 官網有時在下一個 frame 才把內容同步進 state；再等一次再判定，避免誤清。
      if (!verified || !verified.ok) {
        await new Promise(resolve => setTimeout(resolve, 420));
        verified = await runner.evaluate(aiWebFlow.buildVerifyFillScript(text)).catch(() => null);
      }
      if (verified && verified.ok) {
        return {ok: true, alreadyFilled: false, verified: true, native: true, sendReady: verified.sendReady !== false};
      }
    } else if (prepared && prepared.conflict) {
      // 官網輸入框卡著「上一次自動化留下的提示詞」是最常見的卡死原因：舊版只會
      // 每 5 秒重試一次、每次都被同樣的殘留文字擋住，玩家眼裡就是「完全沒反應」。
      // 先確認那段文字確實是本 App 產生的長提示詞（含 JSON／選項字樣），才清掉重填；
      // 使用者自己打的草稿一律不動。
      try {
        const cleared = await runner.evaluate(aiWebFlow.buildAppPromptClearScript());
        if (cleared && cleared.ok) {
          const preparedAgain = await runner.evaluate(aiWebFlow.buildPrepareFillScript(text));
          if (preparedAgain && preparedAgain.ok && !preparedAgain.alreadyFilled) {
            await runner.insertText(text);
            await new Promise(resolve => setTimeout(resolve, 220));
            const verified = await runner.evaluate(aiWebFlow.buildVerifyFillScript(text)).catch(() => null);
            if (verified && verified.ok) return {ok: true, alreadyFilled: false, verified: true, native: true, sendReady: verified.sendReady !== false, recovered: true};
          }
        }
      } catch {}
      return prepared;
    }
  } catch {}
  // 原生管線只放進一部分或官網拒絕：先清掉「剛剛這段提示詞」，再走原本的 DOM 填入。
  // buildClearScript 只會清與提示詞相符的內容，不會動到官網或使用者後來改的文字。
  if (nativeAttempted) {
    try { await runner.evaluate(aiWebFlow.buildClearScript(text)); } catch {}
  }
  return runner.evaluate(aiWebFlow.buildFillScript(text));
}


async function ensureTemporaryChat(payload) {
  const provider = String((payload && payload.provider) || '').toLowerCase();
  const mode = payload && payload.mode === 'external' ? 'external' : 'embedded';
  const url = AI_WEBSITE_URLS[provider];
  if (!url) return {ok: false, error: '不支援的 AI 網頁。'};
  if (!aiWebFlow.TEMPORARY_CHAT_PROVIDERS.includes(provider)) {
    return {ok: false, error: '此 AI 網站目前沒有可確認的臨時對話功能。'};
  }
  try {
    let preferredTabId = preferredAutomationTabId(provider);
    if (mode === 'external') {
      await ensureAutomationBrowserFor(provider, url);
      const base = automationTabBaseUrl(url);
      let existing = null;
      try {
        const tabs = await listAutomationTabs();
        // 使用者正在登入頁時不要另開新分頁；保留同一個登入分頁，
        // 登入完成後再由 activateWebAutoFlow 接手。
        if (tabs.some(tab => isProviderLoginTabFor(tab, base, provider))) return {ok: false, error: 'login-required'};
        existing = findAutomationProviderTab(tabs, url, preferredTabId, provider);
        if (existing && !(base && String(existing.url || '').startsWith(base))) existing = null;
      } catch {}
      if (existing && existing.id) {
        preferredTabId = rememberAutomationTab(provider, existing);
        fetch(`${automationHttpBase()}/json/activate/${existing.id}`, {signal: AbortSignal.timeout(2000)}).catch(() => {});
      } else {
        preferredTabId = rememberAutomationTab(provider, await openAutomationTab(provider, url));
      }
    }
    const runner = createWebAutoRunner(mode, provider, url, preferredTabId);
    await runner.ready();
    // Claude 第一次使用時可能停在官網登入頁；先回報登入需求，讓前端保留待辦回合，
    // 由使用者親自登入或確認帳號，登入完成後再建立無痕對話。絕不把登入頁當成一般對話。
    if (provider === 'anthropic') {
      const gate = await runner.evaluate(aiWebFlow.buildLoginGateScript(provider)).catch(() => null);
      if (gate && gate.ok && gate.loggedOut) return {ok: false, error: 'login-required'};
    }
    let result = await runner.evaluate(aiWebFlow.buildTemporaryChatScript(provider, {startNew: payload && payload.startNew === true}));
    // Gemini 某些版面（例如側欄收起的舊版）用 DOM 的 .click() 不會觸發「臨時對話」，
    // 但用 CDP／Electron 的可信滑鼠點擊可以。未確認時按回傳座標再點一次，再驗證。
    if (mode === 'external' && result && result.ok === false && result.rect && payload && payload.startNew === true) {
      const rect = result.rect;
      const x = Number(rect.x) + Number(rect.width || 0) / 2;
      const y = Number(rect.y) + Number(rect.height || 0) / 2;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        await runner.click(x, y);
        await new Promise(resolve => setTimeout(resolve, 900));
        result = await runner.evaluate(aiWebFlow.buildTemporaryChatScript(provider, {startNew: false}));
      }
    }
    return result;
  } catch (error) {
    return {ok: false, error: (error && error.message) || '無法確認官網臨時對話狀態。'};
  }
}
// Gemini 與 Claude 都是 SPA：剛開好官網時，「登入」按鈕或輸入框可能還沒掛載。
// 只讀一次會把登入頁誤判成「沒有臨時對話」，因此這裡重試幾次；看到登入頁或輸入框就回報。
async function readLoginGate(runner, provider, {attempts = 4, delayMs = 1200} = {}) {
  let gate = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    gate = await runner.evaluate(aiWebFlow.buildLoginGateScript(provider)).catch(() => null);
    if (gate && gate.ok && (gate.loggedOut || gate.editor)) return gate;
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return gate;
}
async function submitViaRunner(runner, prompt = '') {
  // 送出前先記住舊的回覆狀態；送出後用它來分辨「真的送出了」還是「只是按了按鈕」。
  let baseline = null;
  try {
    const probe = await runner.evaluate(aiWebFlow.buildReplyProbeScript());
    if (probe && probe.ok !== false) baseline = {count: Number(probe.count), text: String(probe.text || '')};
  } catch {}
  const result = await runner.evaluate(aiWebFlow.buildSubmitScript());
  let method = '';
  let sendRect = null;
  if (result && result.ok) {
    method = 'button';
    sendRect = result.rect && Number.isFinite(Number(result.rect.x)) ? result.rect : null;
  } else {
    const failure = result && result.error;
    // 沒有輸入框或輸入框是空的：絕不送出，避免把空白或舊訊息送出去。
    if (failure === 'no-editor' || failure === 'editor-empty') return false;
    // 找不到送出鈕：官網的 Enter 就是送出（Shift+Enter 才是換行），改用鍵盤事件。
    await runner.pressEnter();
    method = 'enter';
  }
  // 等官網出現「生成中／新回覆／回覆文字改變／輸入框清空」等證據。按鈕有按到不等於
  // 官網有收件；沒有證據就交給同一待辦回合的安全重試，絕不把按鍵已發出誤報成已送出。
  const evidenceFor = async rounds => {
    for (let attempt = 0; attempt < rounds; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 400));
      let probe = null;
      try { probe = await runner.evaluate(aiWebFlow.buildReplyProbeScript()); } catch {}
      if (!probe || probe.ok === false) continue;
      const baselineCount = Number.isFinite(baseline && baseline.count) ? baseline.count : -1;
      const baselineText = String((baseline && baseline.text) || '');
      if (probe.generating) return 'generating';
      if (Number.isFinite(probe.count) && probe.count > baselineCount) return 'count';
      if (probe.text && String(probe.text) !== baselineText) return 'text';
      if (prompt && probe.editorEmpty === true) return 'editor-empty';
    }
    return '';
  };
  // 約 8 秒：夠慢速官網顯示停止鈕或使用者訊息，又不會讓待辦回合卡太久。
  const first = await evidenceFor(20);
  if (first) return true;
  // 按鈕路徑再確認輸入框：仍是本回合提示詞＝按鈕沒有真的送出，允許一次 Enter 後備。
  // 已清空＝官網已收件、只是回覆還沒出現；交給 watcher 接回，不要重送。
  let stillThere = false;
  try {
    const probe = await runner.evaluate(aiWebFlow.buildReplyProbeScript());
    if (probe && probe.editor === true && probe.editorEmpty === true) return true;
    stillThere = Boolean(probe && probe.editor === true && probe.editorEmpty === false);
  } catch {}
  if (method === 'button' && stillThere) {
    // Angular／Material 的送出鈕有時會忽略 DOM 的 .click()（isTrusted=false）。
    // 先改用真實滑鼠點擊同一個座標，再退回 Enter；兩個都試過才算送出失敗。
    if (sendRect && typeof runner.click === 'function') {
      try {
        const cx = Number(sendRect.x) + Number(sendRect.width || 0) / 2;
        const cy = Number(sendRect.y) + Number(sendRect.height || 0) / 2;
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          await runner.click(cx, cy);
          const byClick = await evidenceFor(20);
          if (byClick) return true;
        }
      } catch {}
    }
    await runner.pressEnter();
    const second = await evidenceFor(20);
    if (second) return true;
  }
  try {
    const probe = await runner.evaluate(aiWebFlow.buildReplyProbeScript());
    if (probe && probe.editor === true && probe.editorEmpty === true) return true;
  } catch {}
  return false;
}
async function harvestWebReply(runner, probeText) {
  // 優先按官網自己的「複製」鈕：讓網站把乾淨的答覆寫進剪貼簿（也避開思考過程的文字）。
  const before = clipboard.readText();
  try {
    const clicked = await runner.evaluate(aiWebFlow.buildCopyClickScript());
    if (clicked && clicked.clicked) {
      await new Promise(resolve => setTimeout(resolve, 420));
      const after = clipboard.readText();
      if (after && after !== before && after.length >= 20) return after;
    }
  } catch {}
  return String(probeText || '');
}
function stopWebAutoWatch() {
  if (!webAutoWatch) return false;
  clearInterval(webAutoWatch.timer);
  webAutoWatch = null;
  return true;
}
// 自動化狀態事件（追加十 A）：主程序只送「階段代碼＋少量數字」，白話句子由 App 依語言組。
// 階段：watching（開始監看）／submitted（已自動送出）／harvesting（正在取回）／harvested（已取回）／
//       retrying（探測失敗自動重試中）／gave-up（重試耗盡停手）／timeout（等待逾時）／needs-login（可能被登出）。
function pushWebAutoStatus(stage, extra) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai-web:auto-status', {stage, ...(extra || {}), at: Date.now()});
  }
}
function startWebAutoWatch(runner, {submitted = false, baseline = null, pendingPrompt = '', provider = '', requireTemporaryChat = false, temporaryReady = false, startNewTemporary = false} = {}) {
  stopWebAutoWatch();
  const initialBaseline=baseline&&typeof baseline==='object'?{count:Number.isFinite(baseline.count)?baseline.count:-1,text:String(baseline.text||'')}:null;
  const watcher = {timer: null, runner, baseline: initialBaseline, lastText: initialBaseline?.text||'', stableCount: 0, sawGenerating: false, startedAt: Date.now(), busy: false, failures: 0, noEditorCount: 0, loginNotified: false, pendingPrompt: submitted?'':String(pendingPrompt||''), lastFillAttemptAt: 0, submissionAttempted:Boolean(submitted), fillFailures: 0, sendFailures: 0, lastFillError: '', stalledNotified: false, provider:String(provider||''), requireTemporaryChat:requireTemporaryChat===true, temporaryReady:temporaryReady===true, startNewTemporary:startNewTemporary===true, lastTemporaryAttemptAt:0, temporaryNotified:false, loginClickedAt:0, lastRecoveryAt:0, lastGate:null};
  webAutoWatch = watcher;
  pushWebAutoStatus('watching', {submitted: !!submitted});
  // 探測失敗的失敗階梯（追加十 A）：先白話告知正在自動重試；中段重新確認官網視窗／分頁還在；
  // 連續失敗到達上限才停手，並用 gave-up 讓 App 把畫面切回「手動貼上回覆」的保底路徑。
  const noteProbeFailure = () => {
    watcher.failures += 1;
    if (watcher.failures === 3) pushWebAutoStatus('retrying', {failures: watcher.failures});
    if (watcher.failures === 4 || watcher.failures === 6) {
      if (watcher.provider === 'gemini') {
        void recoverAutomationTab(watcher.provider, AI_WEBSITE_URLS[watcher.provider]).catch(() => {});
      } else {
        void runner.ready().catch(() => {});
      }
    }
    if (watcher.failures >= (watcher.provider === 'gemini' ? 20 : 8)) {
      pushWebAutoStatus('gave-up', {reason: 'probe-failures'});
      stopWebAutoWatch();
    }
  };
  const tick = async () => {
    if (webAutoWatch !== watcher || watcher.busy) return;
    watcher.busy = true;
    try {
      if (Date.now() - watcher.startedAt > AUTOMATION_MAX_MS) {
        pushWebAutoStatus('timeout', {minutes: Math.round(AUTOMATION_MAX_MS / 60000)});
        stopWebAutoWatch();
        return;
      }
      // Gemini／Claude：登入頁沒有輸入框。先確認登入狀態；Gemini 必要時自動點官網的「登入」，
      // 讓使用者直接在真 Chrome／Edge 視窗輸入帳密；Claude 一律由使用者本人登入或確認。
      // 登入完成後同一個待辦回合會繼續。
      if (watcher.provider === 'gemini' || watcher.provider === 'anthropic') {
        let gate = null;
        try { gate = await runner.evaluate(aiWebFlow.buildLoginGateScript(watcher.provider)); } catch {}
        if (webAutoWatch !== watcher) return;
        if (!gate) {
          // 登入完成時分頁可能正在關閉／置換，或只剩一個新分頁。這不是「官網沒回應」，
          // 先保留待辦提示詞並嘗試找回／重開 Gemini，不要因此在幾秒內放棄整回合。
          if (Date.now() - watcher.lastRecoveryAt >= 5000) {
            watcher.lastRecoveryAt = Date.now();
            await recoverAutomationTab(watcher.provider, AI_WEBSITE_URLS[watcher.provider]).catch(() => null);
          }
          return;
        }
        if (gate.ok && gate.loggedOut) {
          if (!watcher.loginNotified) {
            watcher.loginNotified = true;
            pushWebAutoStatus('needs-login', {provider: watcher.provider});
          }
          // 登入由使用者親自操作，時間無法預估：等待登入期間不計入自動化逾時，
          // 避免「登入完成後，這一回合早已被判定逾時」而不再自動填入／送出／接回。
          watcher.startedAt = Date.now();
          if (watcher.pendingPrompt && !watcher.submissionAttempted && gate.loginButton && typeof runner.click === 'function' && Date.now() - watcher.loginClickedAt >= 10000) {
            watcher.loginClickedAt = Date.now();
            try { await runner.click(gate.x, gate.y); } catch {}
            await new Promise(resolve => setTimeout(resolve, 700));
          }
          // 登入有時會在「新分頁」完成（Google 另開分頁），原本釘選的分頁停在 accounts.google.com
          // 一直被優先採用，watcher 就永遠等不到輸入框。定期掃描：如果已經有回到 Gemini
          // 的分頁，把釘選換過去（下一次 evaluate 自然會用新分頁）。
          if (gate.loginPage && Date.now() - watcher.lastRecoveryAt >= 5000) {
            watcher.lastRecoveryAt = Date.now();
            await recoverAutomationTab(watcher.provider, AI_WEBSITE_URLS[watcher.provider]).catch(() => null);
          }
          watcher.lastGate = gate;
          return;
        }
        // 登入完成（或工作階段恢復）：重置逾時計時，讓填入→送出→接回拿到完整的時間窗口；
        // 也允許之後再次登出時能重新提示。
        if (watcher.loginNotified && gate && gate.ok && !gate.loggedOut) {
          watcher.loginNotified = false;
          watcher.startedAt = Date.now();
          watcher.noEditorCount = 0;
          pushWebAutoStatus('watching', {submitted: !!watcher.submitted});
        }
        watcher.lastGate = gate;
      }
      // 登入後才建立／確認臨時對話；未確認前絕不填入或送出，避免把無痕故事送進一般聊天。
      if (watcher.requireTemporaryChat && !watcher.temporaryReady && watcher.pendingPrompt && !watcher.submissionAttempted) {
        if (Date.now() - watcher.lastTemporaryAttemptAt < 5000) return;
        watcher.lastTemporaryAttemptAt = Date.now();
        const temporary = await runner.evaluate(aiWebFlow.buildTemporaryChatScript(watcher.provider, {startNew: watcher.startNewTemporary})).catch(() => null);
        if (webAutoWatch !== watcher) return;
        if (temporary && temporary.ok) {
          watcher.temporaryReady = true;
          watcher.startNewTemporary = false;
          pushWebAutoStatus('watching', {submitted: false});
        } else if (!watcher.temporaryNotified) {
          watcher.temporaryNotified = true;
          pushWebAutoStatus('needs-temporary-chat', {provider: watcher.provider});
        }
        return;
      }
      // A logged-out provider often has no composer. Keep the already-authorized turn and
      // retry filling after login instead of watching an empty page for 15 minutes.
      if(watcher.pendingPrompt&&!watcher.submissionAttempted&&Date.now()-watcher.lastFillAttemptAt>=5000){
        watcher.lastFillAttemptAt=Date.now();
        const filled=await fillViaRunner(runner,watcher.pendingPrompt).catch(()=>null);
        if(webAutoWatch!==watcher)return;
        if(filled?.ok){
          try{
            const before=await runner.evaluate(aiWebFlow.buildReplyProbeScript());
            if(before&&before.ok!==false)watcher.baseline={count:Number(before.count),text:String(before.text||'')};
          }catch{}
          watcher.lastText=watcher.baseline?.text||'';
          watcher.stableCount=0;
          watcher.submissionAttempted=true;
          let sent=false;
          try{sent=await submitViaRunner(runner,watcher.pendingPrompt);}catch{}
          if(sent){
            watcher.submitted=true;
            watcher.pendingPrompt='';
            watcher.sawGenerating=false;
            pushWebAutoStatus('submitted');
            pushWebAutoStatus('watching',{submitted:true});
          }else{
            // Keep the prompt visible for a safe retry; do not repeatedly press Enter.
            watcher.submissionAttempted=false;
            watcher.lastFillAttemptAt=Date.now()-4000;
            watcher.sendFailures+=1;
            // 送出一直沒有證據：停止再按（避免重複送出），改成只監看，
            // 並明確告訴玩家「已在輸入框、請手動按一次送出」。
            if(watcher.sendFailures>=4&&!watcher.stalledNotified){
              watcher.stalledNotified=true;
              watcher.submissionAttempted=true;
              watcher.pendingPrompt='';
              pushWebAutoStatus('stalled',{reason:'send',attempts:watcher.sendFailures});
            }
          }
        }else{
          watcher.fillFailures+=1;
          watcher.lastFillError=String((filled&&filled.error)||'');
          // 輸入框被殘留文字擋住：外掛已嘗試清掉「本 App 自己的舊提示詞」仍失敗，
          // 代表那是玩家自己的草稿。停止重試並說清楚，不要讓畫面看起來像當掉。
          const conflict=/已有未送出的文字/.test(watcher.lastFillError);
          if((conflict&&watcher.fillFailures>=3)||(!conflict&&watcher.fillFailures>=8)){
            pushWebAutoStatus('stalled',{reason:conflict?'conflict':'fill',detail:watcher.lastFillError.slice(0,80)});
            stopWebAutoWatch();
            return;
          }
        }
      }
      let probe = null;
      try { probe = await runner.evaluate(aiWebFlow.buildReplyProbeScript()); } catch { probe = null; }
      if (webAutoWatch !== watcher) return;
      if (!probe || probe.ok === false) { noteProbeFailure(); return; }
      watcher.failures = 0;
      // 登入失效偵測：輸入框不見了、也沒有任何回覆在動 → 白話提醒一次。
      // 不停止監看：使用者登入後，同一回合會照常自動接回。
      if (probe.editor === false && !probe.generating) {
        watcher.noEditorCount += 1;
        if (watcher.noEditorCount >= 5 && !watcher.loginNotified) {
          watcher.loginNotified = true;
          pushWebAutoStatus('needs-login', {provider: watcher.provider});
        }
        // 已登入（gate 說沒有登出）卻一直沒有輸入框：多半是登入後落在 Gemini 的非對話頁
        // （首頁／介紹頁／通知頁）。把分頁導回對話頁再繼續，而不是誤報需要登入。
        if (watcher.provider === 'gemini' && watcher.noEditorCount >= 6 && watcher.lastGate && watcher.lastGate.ok && !watcher.lastGate.loggedOut && Date.now() - watcher.lastRecoveryAt >= 8000) {
          watcher.lastRecoveryAt = Date.now();
          await recoverAutomationTab(watcher.provider, AI_WEBSITE_URLS[watcher.provider]).catch(() => null);
          try {
            await runner.evaluate(`(()=>{
              const appUrl=${JSON.stringify(AI_WEBSITE_URLS.gemini)};
              if(location.hostname==='gemini.google.com'&&!location.pathname.startsWith('/app')){location.href=appUrl;return true;}
              return false;
            })()`);
          } catch {}
        }
      } else {
        watcher.noEditorCount = 0;
      }
      if (!watcher.baseline) {
        watcher.baseline = {count: Number.isFinite(probe && probe.count) ? probe.count : -1, text: String((probe && probe.text) || '')};
        watcher.lastText = String((probe && probe.text) || '');
        watcher.stableCount = 0;
        return;
      }
      if (probe.generating) watcher.sawGenerating = true;
      const step = aiWebFlow.replyProgress({probe, baseline: watcher.baseline, lastText: watcher.lastText, stableCount: watcher.stableCount, sawGenerating: watcher.sawGenerating});
      watcher.lastText = step.lastText;
      watcher.stableCount = step.stableCount;
      if (!step.emit) return;
      pushWebAutoStatus('harvesting', {via: probe.copyReady ? 'copy' : 'text'});
      const reply = await harvestWebReply(runner, step.reply);
      if (webAutoWatch !== watcher) return;
      if (!reply || !reply.trim()) return;
      stopWebAutoWatch();
      pushWebAutoStatus('harvested', {via: probe.copyReady ? 'copy' : 'text'});
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ai-web:auto-reply', String(reply).slice(0, 120000));
    } catch {
      noteProbeFailure();
    } finally {
      watcher.busy = false;
    }
  };
  watcher.timer = setInterval(() => void tick(), AUTOMATION_POLL_MS);
  void tick();
}
async function activateWebAutoFlow(payload) {
  const provider = String((payload && payload.provider) || '');
  const mode = payload && payload.mode === 'external' ? 'external' : 'embedded';
  const prompt = String((payload && payload.prompt) || '');
  const submit = !(payload && payload.submit === false);
  const requireTemporaryChat = payload && payload.requireTemporaryChat === true;
  const temporaryReady = payload && payload.temporaryReady === true;
  const startNewTemporary = payload && payload.startNewTemporary === true;
  const url = AI_WEBSITE_URLS[provider];
  if (!url) return {ok: false, error: '不支援的 AI 網頁。'};
  stopWebAutoWatch();
  try {
    let preferredTabId = preferredAutomationTabId(provider);
    if (mode === 'external') {
      await ensureAutomationBrowserFor(provider, url);
      // 同一個官網已有分頁就直接沿用（登入狀態與對話都在同一個分頁，不會每次開新分頁）。
      // 若使用者正在登入頁完成登入，也要沿用那個登入分頁。
      const base = automationTabBaseUrl(url);
      let existing = null;
      try {
        const tabs = await listAutomationTabs();
        existing = tabs.find(tab => isDebuggableAutomationTab(tab) && tab.id === preferredTabId && ((base && tab.url.startsWith(base)) || isProviderLoginTabFor(tab, base, provider)))
          || tabs.find(tab => isDebuggableAutomationTab(tab) && base && tab.url.startsWith(base))
          || tabs.find(tab => isProviderLoginTabFor(tab, base, provider)) || null;
      } catch {}
      if (existing && existing.id) {
        preferredTabId = rememberAutomationTab(provider, existing);
        fetch(`${automationHttpBase()}/json/activate/${existing.id}`, {signal: AbortSignal.timeout(2000)}).catch(() => {});
      } else {
        preferredTabId = rememberAutomationTab(provider, await openAutomationTab(provider, url));
      }
      // R51｜帳號不預設：本次 App 執行階段的第一個 Gemini 回合，把既有分頁導向帳號選擇器一次，
      // 由使用者本人挑帳號後再自動繼續（避免直接沿用上次登入的帳號）。
      if (provider === 'gemini' && askGoogleAccount && !googleAccountAskedThisRun && url === AI_WEBSITE_URLS.gemini) {
        googleAccountAskedThisRun = true;
        try {
          const allTabs = await listAutomationTabs();
          const geminiTab = allTabs.find(tab => isDebuggableAutomationTab(tab) && tab.url.startsWith(AI_WEBSITE_URLS.gemini));
          if (geminiTab) {
            await cdpSend(geminiTab.webSocketDebuggerUrl, {method: 'Page.navigate', params: {url: GEMINI_CHOOSER_URL}});
            rememberAutomationTab(provider, geminiTab);
          }
        } catch {}
      }
    }
    const runner = createWebAutoRunner(mode, provider, url, preferredTabId);
    await runner.ready();
    if (requireTemporaryChat && !aiWebFlow.TEMPORARY_CHAT_PROVIDERS.includes(provider)) {
      return {ok: false, error: '此 AI 網站目前沒有可確認的臨時對話功能。'};
    }
    // 登入頁沒有輸入框：先保留本回合提示詞，登入完成後再建立臨時對話、填入與送出。
    // 重試幾次，避免 SPA 還在載入時把登入頁誤判成一般頁面。
    let loginGate = null;
    if (provider === 'gemini' || provider === 'anthropic') loginGate = await readLoginGate(runner, provider);
    if ((provider === 'gemini' || provider === 'anthropic') && loginGate && loginGate.ok && loginGate.loggedOut) {
      startWebAutoWatch(runner, {
        provider,
        submitted: false,
        baseline: null,
        pendingPrompt: submit ? prompt : '',
        requireTemporaryChat,
        temporaryReady: false,
        startNewTemporary
      });
      return {ok: true, mode, provider, filled: {ok: false, error: 'login-required'}, submitted: false, waitingForLogin: submit && Boolean(prompt)};
    }
    if (requireTemporaryChat) {
      const temporary = await runner.evaluate(aiWebFlow.buildTemporaryChatScript(provider, {startNew: temporaryReady ? false : startNewTemporary}));
      if (!temporary || !temporary.ok) {
        // Gemini 剛開啟或剛登入時，官網可能還沒掛載臨時對話按鈕。
        // 不要立刻放棄：保留本回合提示詞，交給 watcher 繼續偵測登入／臨時對話；確認前仍不會送出。
        if (provider === 'gemini' && submit && prompt) {
          startWebAutoWatch(runner, {
            provider,
            submitted: false,
            baseline: null,
            pendingPrompt: prompt,
            requireTemporaryChat,
            temporaryReady: false,
            startNewTemporary
          });
          return {ok: true, mode, provider, filled: {ok: false, error: 'temporary-chat-required'}, submitted: false, waitingForLogin: false};
        }
        return {ok: false, error: '官網未確認為臨時對話，為避免送入一般聊天，本回合未送出。'};
      }
    }
    let filled = {ok: false, skipped: true};
    if (prompt) filled = await fillViaRunner(runner,prompt);
    // 失敗階梯（追加十 A）：有些官網的輸入框較晚掛載；第一次找不到時等 1.2 秒重找一次再放棄，
    // 讓「剛開好官網就開局」這種時序不會直接掉到「請自行手動」的流程。
    if (prompt && !(filled && filled.ok) && /輸入框/.test(String((filled && filled.error) || ''))) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const retried = await fillViaRunner(runner,prompt).catch(() => null);
      if (retried && retried.ok) filled = retried;
    }
    // 兩種模式都先確認「輸入框內容就是本回合提示詞」才送出：內建模式 App 端已先填過，
    // 主程序這裡會補驗證一次（或補填）；內容不一致就不送，避免把殘留的舊文字送出去。
    // 外部模式維持原本「只送這次真的填進去的內容」。
    const canSubmit = Boolean(filled && filled.ok);
    // Capture the old reply state before clicking Send. Starting the watcher only after
    // submission can miss fast replies because its first poll may see the completed text
    // and mistakenly treat it as the baseline.
    let beforeSubmit = null;
    if (submit && canSubmit) {
      try {
        const probe = await runner.evaluate(aiWebFlow.buildReplyProbeScript());
        if (probe && probe.ok !== false) beforeSubmit = {count: Number(probe.count), text: String(probe.text || '')};
      } catch {}
    }
    let submitted = false;
    if (submit && canSubmit) submitted = await submitViaRunner(runner,prompt);
    startWebAutoWatch(runner, {provider, submitted, baseline: submitted ? beforeSubmit : null, pendingPrompt:submit&&!submitted?prompt:'', requireTemporaryChat, temporaryReady: requireTemporaryChat, startNewTemporary: false});
    return {ok: true, mode, provider, filled, submitted, waitingForLogin:submit&&!canSubmit&&Boolean(prompt)};
  } catch (error) {
    stopWebAutoWatch();
    return {ok: false, error: (error && error.message) || '自動化啟動失敗。'};
  }
}
// 自動化健康檢查（追加十 D）：只讀不點擊，回報輸入框／送出鈕／回覆區／登入頁線索。
// 不呼叫 runner.ready()（避免官網沒開時卡 30 秒）：視窗或分頁不在就快速回報白話原因。
async function webAutoHealth(payload) {
  const provider = String((payload && payload.provider) || '');
  const mode = payload && payload.mode === 'external' ? 'external' : 'embedded';
  const url = AI_WEBSITE_URLS[provider];
  if (!url) return {ok: false, error: '不支援的 AI 網頁。'};
  try {
    const runner = createWebAutoRunner(mode, provider, url);
    const report = await runner.evaluate(aiWebFlow.buildHealthScript());
    let tab = null;
    if (mode === 'external') {
      try {
        const tabs = await listAutomationTabs();
        const hit = findAutomationProviderTab(tabs, url, preferredAutomationTabId(provider));
        if (hit) tab = {id: hit.id, url: hit.url, title: hit.title || ''};
      } catch {}
    }
    return {ok: true, provider, mode, tab, report: report || null};
  } catch (error) {
    return {ok: false, error: (error && error.message) || '自動化自檢失敗。'};
  }
}

function accountKey(provider, profileId) {
  const prefix = PROVIDER_PREFIX[provider];
  if (!prefix) throw new Error('不支援的 AI 服務。');
  const suffix = String(profileId || '').trim().toUpperCase();
  if (!VALID_PROFILE.test(suffix)) throw new Error('帳號代號只能使用 1 至 32 個英數字或底線。');
  return `${prefix}_API_KEY_${suffix}`;
}
function accountStoreKey(provider, profileId) {
  return `${provider}:${String(profileId).trim().toUpperCase()}`;
}
// 主畫面的合法網址：index.html 本身，或帶查詢字串／頁籤片段（App 以 ?apiBase=&apiToken= 開啟）。
// 用完整比對而非 startsWith：「...\index.html.evil」這類同前綴網址也會通過 startsWith，
// 正好是來源驗證最不該留的缺口。
function isRendererPageUrl(value) {
  const expected = pathToFileURL(path.join(__dirname, 'www', 'index.html')).href;
  const url = String(value || '');
  return url === expected || url.startsWith(expected + '?') || url.startsWith(expected + '#');
}
function isStartupSplashPageUrl(value) {
  const expected = pathToFileURL(path.join(__dirname, 'www', 'splash-image.html')).href;
  const url = String(value || '');
  return url === expected || url.startsWith(expected + '?');
}
function assertTrustedRenderer(event) {
  if (!isRendererPageUrl(event.senderFrame?.url)) throw new Error('拒絕未授權的帳號資料操作。');
}
function getVaultPath() {
  if (!vaultPath) vaultPath = path.join(app.getPath('userData'), 'ai-credentials.bin');
  return vaultPath;
}
async function readVault() {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows 加密服務目前無法使用，無法安全保存 API Key。');
  const file = getVaultPath();
  if (!fs.existsSync(file)) return {};
  // 檔案存在卻「解不開」或「內容壞掉」時一律拋錯，絕不回傳空物件呼嚨過去：
  // 回傳空物件會讓下一次儲存用「只有新金鑰」的內容覆寫整個金庫，其他所有帳號的
  // Key 一起消失（真實的資料遺失）。呼叫端會把錯誤顯示給使用者。
  //注意：這個 Electron 版本的 decryptStringAsync 回傳 {shouldReEncrypt, result} 物件；
  //舊版文件曾記載直接回字串，兩種形狀都接住，否則已保存的金鑰永遠讀不出來。
  let text = '';
  try {
    const raw = await safeStorage.decryptStringAsync(fs.readFileSync(file));
    text = typeof raw === 'string' ? raw : String(raw?.result ?? '');
  } catch {
    throw new Error('金鑰庫無法解密（可能由其他 Windows 帳戶或不同電腦加密）。為避免覆寫並遺失其他 API Key，已停止這次操作；若確定不需要舊金鑰，可刪除 ai-credentials.bin 後重新新增。');
  }
  let data;
  try {
    data = JSON.parse(text || '{}');
  } catch {
    throw new Error('金鑰庫內容損毀（不是有效 JSON）。為避免覆寫並遺失其他 API Key，已停止這次操作；若確定不需要舊金鑰，可刪除 ai-credentials.bin 後重新新增。');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('金鑰庫內容格式異常。為避免覆寫並遺失其他 API Key，已停止這次操作；若確定不需要舊金鑰，可刪除 ai-credentials.bin 後重新新增。');
  return data;
}
async function writeVault(data) {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows 加密服務目前無法使用，無法安全保存 API Key。');
  const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(data));
  // 先寫暫存檔再改名（同一磁碟區的 rename 是原子操作）：寫入中斷時原有金庫檔不受影響，
  // 不會因為一次寫壞就讓所有帳號的加密金鑰一起消失。
  const target = getVaultPath();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, encrypted);
  fs.renameSync(temporary, target);
}
function getWebLoginCredentialPath(){return path.join(app.getPath('userData'),'web-login-credentials.bin');}
async function readWebLoginCredentialStore(){
  if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error('Windows 本機加密服務無法使用，不能保存登入密碼。');
  const target=getWebLoginCredentialPath();if(!fs.existsSync(target))return{};
  let text='';try{const raw=await safeStorage.decryptStringAsync(fs.readFileSync(target));text=typeof raw==='string'?raw:String(raw?.result??'');}catch{throw new Error('登入資料無法在此 Windows 帳戶解密；為避免遺失資料，已停止修改。');}
  let data;try{data=JSON.parse(text||'{}');}catch{throw new Error('登入資料檔格式損毀，已停止修改以免覆寫。');}
  if(!data||typeof data!=='object'||Array.isArray(data)||!data.providers||typeof data.providers!=='object'||Array.isArray(data.providers))throw new Error('登入資料檔格式異常，已停止修改以免覆寫。');
  return data.providers;
}
async function writeWebLoginCredentialStore(providers){
  if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error('Windows 本機加密服務無法使用，不能保存登入密碼。');
  const target=getWebLoginCredentialPath(),temporary=`${target}.tmp`;
  const encrypted=await safeStorage.encryptStringAsync(JSON.stringify({version:1,providers}));
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(temporary,encrypted);fs.renameSync(temporary,target);
}
function syncVaultIntoServer(vault) {
  for (const name of injectedEnvNames) delete process.env[name];
  injectedEnvNames.clear();
  for (const item of Object.values(vault)) {
    if (!item?.provider || !item?.profileId || !item?.apiKey) continue;
    const name = accountKey(item.provider, item.profileId);
    process.env[name] = item.apiKey;
    injectedEnvNames.add(name);
  }
}
function registerVaultIpc() {
  ipcMain.handle('ai-vault:available', async event => {
    assertTrustedRenderer(event);
    return safeStorage.isAsyncEncryptionAvailable();
  });
  ipcMain.handle('ai-vault:list', async event => {
    assertTrustedRenderer(event);
    const vault = await readVault();
    return Object.values(vault).map(({provider, profileId, label}) => ({provider, profileId, label}));
  });
  ipcMain.handle('ai-vault:save', async (event, value) => {
    assertTrustedRenderer(event);
    const provider = String(value?.provider || '');
    const profileId = String(value?.profileId || '').trim().toUpperCase();
    const label = String(value?.label || '').trim().slice(0, 40);
    const apiKey = String(value?.apiKey || '').trim();
    const envName = accountKey(provider, profileId);
    if (!label) throw new Error('請輸入帳號名稱。');
    if (!apiKey || apiKey.length > 4096) throw new Error('請輸入有效的 API Key。');
    const vault = await readVault();
    vault[accountStoreKey(provider, profileId)] = {provider, profileId, label, apiKey};
    await writeVault(vault);
    syncVaultIntoServer(vault);
    return {ok: true, envName};
  });
  ipcMain.handle('ai-vault:remove', async (event, value) => {
    assertTrustedRenderer(event);
    const provider = String(value?.provider || '');
    const profileId = String(value?.profileId || '').trim().toUpperCase();
    accountKey(provider, profileId);
    const vault = await readVault();
    delete vault[accountStoreKey(provider, profileId)];
    await writeVault(vault);
    syncVaultIntoServer(vault);
    return {ok: true};
  });
  // 追加十一：測試連線。金鑰只在主程序內讀出、放在請求標頭送往該家官方端點；
  // 回給畫面的只有 {ok, class, status}（分類代碼），永不回傳金鑰本體。
  ipcMain.handle('ai-vault:test', async (event, value) => {
    assertTrustedRenderer(event);
    const provider = String(value?.provider || '').trim().toLowerCase();
    const profileId = String(value?.profileId || '').trim().toUpperCase();
    let vault = {};
    try {
      vault = await readVault();
    } catch {
      return {ok: false, class: 'vault'};
    }
    const item = vault[accountStoreKey(provider, profileId)];
    if (!item?.apiKey) return {ok: false, class: 'no-key'};
    return await aiConnect.testAiConnection(provider, item.apiKey);
  });
  ipcMain.handle('ai-web:open', async (event, provider, mode) => {
    assertTrustedRenderer(event);
    return openAiWebsite(String(provider||''),mode==='external'?'external':'embedded');
  });
  ipcMain.handle('ai-web:login-credential:get', async (event, provider) => {
    assertTrustedRenderer(event);const name=String(provider||'').trim().toLowerCase();if(!Object.hasOwn(AI_WEBSITE_URLS,name))throw new Error('不支援此 AI 網站。');
    if(name==='gemini')return {email:'',hasPassword:false,autoLogin:false,disabled:true};
    const providers=await readWebLoginCredentialStore(),item=providers[name];if(item)webLoginCredentialCache.set(name,item);else webLoginCredentialCache.delete(name);
    return {email:String(item?.email||''),hasPassword:Boolean(item?.password),autoLogin:item?.autoLogin===true};
  });
  ipcMain.handle('ai-web:login-credential:save', async (event, payload) => {
    assertTrustedRenderer(event);const name=String(payload?.provider||'').trim().toLowerCase();if(!Object.hasOwn(AI_WEBSITE_URLS,name))throw new Error('不支援此 AI 網站。');
    if(name==='gemini')throw new Error('Gemini 請在外部 Chrome／Edge 視窗登入；本 App 不保存 Google 帳密。');
    const email=String(payload?.email||'').trim().slice(0,254),password=String(payload?.password||'').slice(0,4096),autoLogin=payload?.autoLogin===true;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('請輸入有效的登入信箱。');
    const providers=await readWebLoginCredentialStore(),previous=providers[name];
    const keptPassword=password?password:(previous?.email?.toLowerCase()===email.toLowerCase()?String(previous?.password||''):'');
    if(autoLogin&&!keptPassword)throw new Error('啟用自動登入前，請先輸入並保存密碼。');
    const item={email,password:keptPassword,autoLogin:autoLogin&&Boolean(keptPassword)};providers[name]=item;await writeWebLoginCredentialStore(providers);webLoginCredentialCache.set(name,item);
    for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed()&&aiWebsiteWindowProviders.get(win)===name&&isAllowedAiWebsiteUrl(win.webContents.getURL()))prefillWebLoginCredential(win,name);
    return {ok:true,email:item.email,hasPassword:Boolean(item.password),autoLogin:item.autoLogin};
  });
  ipcMain.handle('ai-web:login-credential:clear', async (event, provider) => {
    assertTrustedRenderer(event);const name=String(provider||'').trim().toLowerCase();if(!Object.hasOwn(AI_WEBSITE_URLS,name))throw new Error('不支援此 AI 網站。');
    const providers=await readWebLoginCredentialStore();delete providers[name];await writeWebLoginCredentialStore(providers);webLoginCredentialCache.delete(name);return {ok:true};
  });
  ipcMain.handle('ai-web:model-list', async (event, options) => {
    assertTrustedRenderer(event);
    const opts=options&&typeof options==='object'?options:{};
    const provider=Object.hasOwn(AI_WEBSITE_URLS,String(opts.provider||''))?String(opts.provider):undefined;
    return executeModelMenuAction('list','',{provider,mode:opts.mode});
  });
  ipcMain.handle('ai-web:model-select', async (event, modelName, options) => {
    assertTrustedRenderer(event);
    const name=String(modelName||'').trim().slice(0,120);
    if(!name)throw new Error('請先選擇官網模型。');
    const opts=options&&typeof options==='object'?options:{};
    const provider=Object.hasOwn(AI_WEBSITE_URLS,String(opts.provider||''))?String(opts.provider):undefined;
    return executeModelMenuAction('select',name,{provider,mode:opts.mode});
  });
  ipcMain.handle('ai-web:fill-prompt', async (event, prompt) => {
    assertTrustedRenderer(event);
    return fillAiWebsitePrompt(prompt);
  });
  ipcMain.handle('ai-web:copy-prompt', async (event, prompt) => {
    assertTrustedRenderer(event);
    const text = String(prompt || '');
    if (!text || text.length > 100000) throw new Error('提示詞內容為空或超過可複製長度。');
    clipboard.writeText(text);
    return {ok: true};
  });
  let lastPendingClipboardReadAt=0;
  ipcMain.handle('ai-web:read-pending-clipboard', event => {
    assertTrustedRenderer(event);
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return '';
    const now=Date.now();
    if(now-lastPendingClipboardReadAt<600)return '';
    lastPendingClipboardReadAt=now;
    return clipboard.readText().slice(0,120000);
  });
  ipcMain.handle('ai-web:read-manual-clipboard', event => {
    assertTrustedRenderer(event);
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || !mainWindow.isFocused()) {
      throw new Error('請先切回遊戲視窗，再讀取剪貼簿。');
    }
    return clipboard.readText().slice(0, 120000);
  });
  ipcMain.handle('ai-web:side-by-side', async event => {
    assertTrustedRenderer(event);
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('遊戲視窗目前不可用。');
    if (!webCompanionRestore) {
      webCompanionRestore = {bounds: mainWindow.getBounds(), maximized: mainWindow.isMaximized(), alwaysOnTop: mainWindow.isAlwaysOnTop()};
    }
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
    const appWidth = Math.min(Math.max(500, Math.round(area.width * 0.43)), Math.min(740, area.width - 420));
    mainWindow.setBounds({x: area.x, y: area.y, width: appWidth, height: area.height});
    mainWindow.setAlwaysOnTop(true, 'floating');
    const webWindow=webCompanionWindows.get(activeWebCompanionProvider);
    if(webWindow&&!webWindow.isDestroyed()){
      webWindow.setBounds({x:area.x+appWidth,y:area.y,width:area.width-appWidth,height:area.height});
      webWindow.setAlwaysOnTop(true,'floating');
      webWindow.show();
    }
    mainWindow.show();
    if (webWindow && !webWindow.isDestroyed()) webWindow.focus();
    else mainWindow.focus();
    return {ok: true, bounds: mainWindow.getBounds()};
  });
  ipcMain.handle('ai-web:restore-window', async event => {
    assertTrustedRenderer(event);
    if (!mainWindow || mainWindow.isDestroyed() || !webCompanionRestore) return {ok: true};
    const previous = webCompanionRestore;
    webCompanionRestore = null;
    for(const existing of webCompanionWindows.values()){try{if(existing&&!existing.isDestroyed())existing.setAlwaysOnTop(false);}catch{}}
    mainWindow.setAlwaysOnTop(previous.alwaysOnTop);
    if (previous.maximized) mainWindow.maximize();
    else mainWindow.setBounds(previous.bounds);
    mainWindow.show();
    mainWindow.focus();
    return {ok: true};
  });
  // 啟動「臨時對話（無痕）」時先切換並驗證官網模式；回合進行中只驗證，不建立新對話。
  ipcMain.handle('ai-web:temporary-chat', async (event, payload) => {
    assertTrustedRenderer(event);
    return ensureTemporaryChat(payload || {});
  });
  // 網頁模式自動化：開啟／關閉「自動送出＋自動抓回覆」。關閉時只停止監看，不動任何視窗。
  ipcMain.handle('ai-web:auto-flow', async (event, payload) => {
    assertTrustedRenderer(event);
    if (payload && payload.enabled === false) {
      stopWebAutoWatch();
      return {ok: true, stopped: true};
    }
    return activateWebAutoFlow(payload || {});
  });
  // 自動化健康檢查（追加十 D）：開場或使用者按「自動化自檢」時，回報哪一步能自動、哪一步卡住。
  ipcMain.handle('ai-web:auto-health', async (event, payload) => {
    assertTrustedRenderer(event);
    return webAutoHealth(payload || {});
  });
  // 登入／接入修復：把同一個自動化設定檔的官網分頁重新帶到前景，或只重啟該設定檔的瀏覽器。
  ipcMain.handle('ai-web:automation-reconnect', async (event, payload) => {
    assertTrustedRenderer(event);
    return reconnectAutomationBrowser(payload || {});
  });
  ipcMain.handle('ai-web:automation-restart', async (event, payload) => {
    assertTrustedRenderer(event);
    return restartAutomationBrowser(payload || {});
  });
  // 工坊檔案清單：整個專案（排除相依、建置產物、備份與秘密檔）。
  ipcMain.handle('workshop-code:info', async event => {
    assertTrustedRenderer(event);
    const root = workshopSourceRoot();
    let files = [];
    try { files = workshopApply.listEditableFiles(root.dir); } catch { files = []; }
    return {dir: root.dir, original: root.original, scope: root.scope, reason: root.reason || '', count: files.length, truncated: files.length >= workshopApply.MAX_LISTED_FILES};
  });
  ipcMain.handle('workshop-code:list', async event => {
    assertTrustedRenderer(event);
    const root = workshopSourceRoot();
    const files = workshopApply.listEditableFiles(root.dir);
    return {dir: root.dir, original: root.original, scope: root.scope, reason: root.reason || '', files, truncated: files.length >= workshopApply.MAX_LISTED_FILES};
  });
  ipcMain.handle('workshop-code:read', async (event, relativePath) => {
    assertTrustedRenderer(event);
    const root = workshopSourceRoot();
    return workshopApply.readEditableFile(root.dir, String(relativePath || ''));
  });
  ipcMain.handle('workshop-code:export', async (event, requestedFiles) => {
    assertTrustedRenderer(event);
    const root = workshopSourceRoot();
    const prefix = root.appRelative ? 'app/' : '';
    const entries = workshopApply.validateFiles(requestedFiles).map(entry => ({name: prefix + entry.path, content: entry.content}));
    if(!entries.length) throw new Error('沒有可匯出的程式碼修改。');
    entries.push({name:'README-套用程式碼修改.txt',content:'此 ZIP 是程式碼修改包，內含已修改的原始檔（v4.4.0 起為整個專案，不限白名單）。\n請先備份原專案，再把 ZIP 內相同路徑的檔案覆蓋到原專案根目錄；檢查差異與程式碼後，再依原專案說明重新建置。\n這些修改不會在已安裝遊戲內即時執行；請勿執行來源不明或未檢查的程式碼。\n'});
    const result=await dialog.showSaveDialog({defaultPath:'claude-novel-workshop-source-patch.zip',filters:[{name:'ZIP 檔案',extensions:['zip']}]});
    if(result.canceled||!result.filePath)return {canceled:true};
    fs.writeFileSync(result.filePath,createStoredZip(entries));
    return {canceled:false,filePath:result.filePath};
  });

  ipcMain.handle('workshop-code:apply', async (event, requestedFiles) => {
    assertTrustedRenderer(event);
    // 與 list/read/export 同根：工坊清單的路徑以「工坊根」為準（scope=project 時帶 app/ 前綴）。
    // 舊版直接用 resolveSourceRoot（app 目錄）當寫入基底，scope=project 時會寫出嵌套的 app/app/。
    const root = workshopSourceRoot();
    if (!root.original) throw new Error(root.reason || '找不到原始專案位置。請用「一鍵安裝-Windows11.bat」建置安裝，或改用「匯出修改程式碼 ZIP」。');
    const prefix = root.appRelative ? 'app/' : '';
    const entries = workshopApply.validateFiles(requestedFiles).map(entry => ({path: prefix + entry.path, content: entry.content}));
    const {problems, unchecked} = workshopApply.checkSyntax(entries);
    if (problems.length) return {ok: false, problems};
    const result = workshopApply.applyFiles(root.dir, entries);
    return {ok: true, appDir: root.dir, written: result.written, backupDir: result.backupDir, unchecked};
  });
  ipcMain.handle('workshop-code:rebuild', async (event) => {
    assertTrustedRenderer(event);
    if (process.platform !== 'win32') throw new Error('自動重建目前只支援 Windows。');
    const appDir = workshopApply.resolveSourceRoot(app.getAppPath());
    const script = path.join(appDir, 'BUILD-WINDOWS11-AUTO.bat');
    if (!fs.existsSync(script)) throw new Error('找不到 BUILD-WINDOWS11-AUTO.bat，無法自動重建。');
    const options = {type: 'question', buttons: ['開始重建並關閉 App', '取消'], defaultId: 1, cancelId: 1, title: '自動重建與安裝',
      message: '將關閉 App，並開啟建置視窗重新編譯、安裝。',
      detail: '需要網路，約數分鐘到十幾分鐘；若建置失敗，目前已安裝的版本不受影響。完成後請從桌面捷徑重新開啟。\n原始專案：' + appDir};
    const choice = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
    if (choice.response !== 0) return {started: false};
    const failure = await shell.openPath(script);
    if (failure) throw new Error('無法啟動建置腳本：' + failure);
    setTimeout(() => app.quit(), 1500);
    return {started: true};
  });
}

// ── 場景插圖：官網視窗 → 遊戲 ─────────────────────────────────────────────
function deliverSceneImage(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.webContents.send('scene-image:downloaded', payload);
  try { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } catch { /* 視窗正在關閉 */ }
  return true;
}

// ChatGPT 圖片的下載按鈕：在「插圖提示詞」啟動後的 45 分鐘內，圖片類下載改存暫存檔並自動匯入；其他下載維持 Electron 預設行為。
function attachSceneImageCapture() {
  session.fromPartition('persist:official-ai-web-r24').on('will-download', (event, item) => {
    if (Date.now() >= sceneCaptureUntil) return;
    const info = sceneDownload.describeDownload({filename: item.getFilename(), mimeType: item.getMimeType()});
    if (!info.isImage) return;
    const target = path.join(app.getPath('temp'), `cloudo-scene-${Date.now()}${info.ext}`);
    item.setSavePath(target);
    item.once('done', (doneEvent, state) => {
      try {
        if (state !== 'completed') return deliverSceneImage({error: '圖片下載未完成，請再試一次。'});
        deliverSceneImage(sceneDownload.readImageFile({path: target, name: path.basename(item.getFilename() || `scene${info.ext}`), mime: info.mime}));
      } catch (error) {
        deliverSceneImage({error: error.message || '無法讀取下載的圖片。'});
      } finally { try { fs.rmSync(target, {force: true}); } catch { /* 暫存檔，忽略 */ } }
    });
  });
}

// 右鍵圖片 →「用作本場景插圖」：先複製圖片到剪貼簿再讀出（blob／data／https 來源都能處理），讀不到才退回下載。
async function captureImageFromPage(win, params) {
  try {
    clipboard.clear();
    win.webContents.copyImageAt(params.x, params.y);
    let image = null;
    for (let attempt = 0; attempt < 20 && !image; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const candidate = clipboard.readImage();
      if (candidate && !candidate.isEmpty()) image = candidate;
    }
    if (image) {
      const bytes = image.toPNG();
      if (bytes.length > sceneDownload.MAX_SCENE_IMAGE_BYTES) return deliverSceneImage({error: '圖片太大，請選擇 12 MB 以下的檔案。'});
      return deliverSceneImage({name: 'scene.png', mime: 'image/png', bytes});
    }
    if (/^https?:/i.test(params.srcURL || '')) { sceneCaptureUntil = Math.max(sceneCaptureUntil, Date.now() + 60 * 1000); win.webContents.downloadURL(params.srcURL); return true; }
    return deliverSceneImage({error: '無法讀取這張圖片，請改用官網的下載按鈕。'});
  } catch (error) {
    return deliverSceneImage({error: error.message || '無法讀取這張圖片。'});
  }
}

function attachSceneImageContextMenu(win) {
  win.webContents.on('context-menu', (event, params) => {
    const items = [];
    if (params.mediaType === 'image' && params.srcURL) {
      items.push({label: '用作本場景插圖（自動匯入遊戲）', click: () => { void captureImageFromPage(win, params); }});
      items.push({label: '複製圖片', click: () => win.webContents.copyImageAt(params.x, params.y)});
    }
    if (params.isEditable) items.push({role: 'cut'}, {role: 'copy'}, {role: 'paste'}, {role: 'selectAll'});
    else if (params.selectionText) items.push({role: 'copy'});
    if (items.length) Menu.buildFromTemplate(items).popup({window: win});
  });
}

function registerSceneImageIpc() {
  // R40｜外部模式插圖「自動下載＋自動匯入」：
  //   自動下載：每 20 秒在自動化分頁點最後一張生成圖片的下載鈕（best-effort，重複點擊無害）。
  //   自動匯入：輪詢「下載」資料夾；新落地且大小穩定的圖檔（≤12MB，15 分鐘內）直接送進故事。
  //   任一張圖成功匯入（deliverSceneImage）即全部停止。
  let sceneAutoHarvestTimer = 0;
  let sceneDownloadsTimer = 0;
  let sceneDownloadsStartedAt = 0;
  function stopSceneAutoHarvest() {
    if (sceneAutoHarvestTimer) { clearInterval(sceneAutoHarvestTimer); sceneAutoHarvestTimer = 0; }
    if (sceneDownloadsTimer) { clearInterval(sceneDownloadsTimer); sceneDownloadsTimer = 0; }
  }
  function checkSceneDownloadsDir() {
    try {
      const hit = sceneDownload.findLatestImage(app.getPath('downloads'));
      if (!hit || hit.mtimeMs <= sceneDownloadsStartedAt) return;
      const before = fs.statSync(hit.path).size;
      const launchedAt = Date.now();
      setTimeout(() => {
        try {
          if (!sceneDownloadsTimer) return;
          if (fs.statSync(hit.path).size !== before || Date.now() - launchedAt < 100) return;
          const payload = sceneDownload.readImageFile(hit);
          if (payload && payload.bytes) {
            deliverSceneImage(payload);
            stopSceneAutoHarvest();
            // 自動下載→匯入→刪除：來源檔已讀入故事，刪掉下載資料夾裡的那一份，不留重複檔案。
            try { fs.rmSync(hit.path, {force: true}); } catch {}
          }
        } catch {}
      }, 1500);
    } catch {}
  }
  function startSceneAutoHarvest(runner) {
    stopSceneAutoHarvest();
    sceneDownloadsStartedAt = Date.now();
    const harvestDeadline = Date.now() + 10 * 60 * 1000;
    sceneAutoHarvestTimer = setInterval(() => {
      if (Date.now() > harvestDeadline) { stopSceneAutoHarvest(); return; }
      void runner.evaluate(aiWebFlow.buildSceneDownloadClickScript()).catch(() => {});
    }, 20000);
    void runner.evaluate(aiWebFlow.buildSceneDownloadClickScript()).catch(() => {});
    sceneDownloadsTimer = setInterval(checkSceneDownloadsDir, 3000);
    setTimeout(() => { if (sceneDownloadsTimer && Date.now() - sceneDownloadsStartedAt > 15 * 60 * 1000) stopSceneAutoHarvest(); }, 15 * 60 * 1000 + 2000);
  }
  // 一次完成：複製提示詞 → 依玩家設定開啟官網（外部模式用「目前故事供應商」，Gemini 也能出圖）→ 自動填入但不替玩家送出 → 下載後匯回場景。
  ipcMain.handle('scene-image:start', async (event, prompt, requestedMode, requestedProvider) => {
    assertTrustedRenderer(event);
    const text = String(prompt || '');
    if (!text || text.length > 20000) throw new Error('插圖提示詞內容為空或過長。');
    clipboard.writeText(text);
    const mode = requestedMode === 'external' ? 'external' : 'embedded';
    // 外部模式沿用故事的官網供應商（已登入的自動化瀏覽器）；App 內視窗維持 ChatGPT。
    const provider = mode === 'external' && requestedProvider === 'gemini' ? 'gemini' : 'openai';
    let runner;
    if (mode === 'external') {
      const url = AI_WEBSITE_URLS[provider];
      await ensureAutomationBrowserFor(provider, url);
      const base = automationTabBaseUrl(url);
      const tabs = await listAutomationTabs().catch(() => []);
      const existing = tabs.find(tab => isDebuggableAutomationTab(tab) && base && tab.url.startsWith(base));
      if (existing?.id) fetch(`${automationHttpBase()}/json/activate/${existing.id}`, {signal: AbortSignal.timeout(2000)}).catch(() => {});
      else await openAutomationTab(provider, url);
      runner = createWebAutoRunner('external', provider, url);
      await runner.ready();
      startSceneAutoHarvest(runner);
    } else {
      await openAiWebsite('openai', 'embedded');
      sceneCaptureUntil = Date.now() + SCENE_CAPTURE_MS;
    }
    let filled = false, error = '';
    for (let attempt = 0; attempt < 10 && !filled; attempt++) {
      try {
        const result = mode === 'embedded'
          ? await fillAiWebsitePrompt(text)
          : await runner.evaluate(aiWebFlow.buildFillScript(text));
        filled = Boolean(result?.ok);
        error = filled ? '' : String(result?.error || '');
      } catch (failure) { error = String(failure?.message || ''); }
      if (filled || !/尚未找到/.test(error)) break;       // 只有「輸入框還沒出現」才重試（登入頁或網頁還在載入）
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    return {ok: true, mode, filled, error};
  });
  // 外部瀏覽器流程：一鍵匯入「下載」資料夾裡 15 分鐘內最新的 PNG／JPG／WebP。
  ipcMain.handle('scene-image:latest-download', async event => {
    assertTrustedRenderer(event);
    const info = sceneDownload.findLatestImage(app.getPath('downloads'));
    return info ? sceneDownload.readImageFile(info) : null;
  });
}

// 視窗大小／位置記憶：存在 userData\window-state.json。還原時先確認視窗落在目前
// 還接著的螢幕範圍內（拔掉外接螢幕後舊座標會落到畫面外），不在任何螢幕上就用預設值。
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WINDOW_BOUNDS = {width: 1280, height: 820};
function windowStatePath() { return path.join(app.getPath('userData'), WINDOW_STATE_FILE); }
function loadWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const bounds = parsed.bounds || {};
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;
    return {bounds, maximized: !!parsed.maximized};
  } catch { return null; }
}
function windowStateVisibleOnAnyDisplay(bounds) {
  try {
    return screen.getAllDisplays().some(display => {
      const area = display.workArea;
      // 視窗至少要有一角落在某個螢幕的工作區內（允許部分超出）。
      return bounds.x < area.x + area.width && bounds.x + bounds.width > area.x
        && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
    });
  } catch { return false; }
}
function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const state = {bounds: win.getNormalBounds ? win.getNormalBounds() : win.getBounds(), maximized: win.isMaximized()};
    fs.writeFileSync(windowStatePath(), JSON.stringify(state), 'utf8');
  } catch {}
}
function createWindow() {
  const indexUrl = pathToFileURL(path.join(__dirname, 'www', 'index.html')).href;
  const appUrl = `${indexUrl}?apiBase=${encodeURIComponent(localApiBase)}&apiToken=${encodeURIComponent(localApiToken)}`;
  const startupSplashUrl = pathToFileURL(path.join(__dirname, 'www', 'splash-image.html')).href;
  // 工作列圖標與桌面捷徑一致：視窗使用與 exe／捷徑相同的 icon.ico。
  // 打包後優先讀 resources\icon.ico，避免不同 Windows 版本從 asar 內讀 ICO 時退回預設圖標。
  const windowIconPath = appIconPath();
  const windowIcon = loadAppIcon();
  const savedState = loadWindowState();
  const bounds = savedState && windowStateVisibleOnAnyDisplay(savedState.bounds) ? savedState.bounds : DEFAULT_WINDOW_BOUNDS;
  const win = mainWindow = new BrowserWindow({
    icon: windowIcon || (windowIconPath ? windowIconPath : undefined),
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
    width: Math.max(500, Math.round(bounds.width || DEFAULT_WINDOW_BOUNDS.width)),
    height: Math.max(640, Math.round(bounds.height || DEFAULT_WINDOW_BOUNDS.height)),
    minWidth: 500,
    minHeight: 640,
    autoHideMenuBar: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#030308',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      paintWhenInitiallyHidden: true
    }
  });
  // 開場動畫播放時，主畫面在同一個隱藏視窗裡預載；狀態集中在此避免重複載入。
  let splashWindow = null;
  let splashBounds = null;
  let splashMaximized = false;
  let splashShown = false;
  let startupFinished = false;
  let appReady = false;
  let appLoadStarted = false;
  let appRevealed = false;
  let revealTimer = 0;
  // 明確將與桌面捷徑相同的 AppID 和 icon.ico 指派給 Windows 工作列按鈕。
  // BrowserWindow 的 icon/setIcon 只設定視窗圖示；setAppDetails 才控制工作列圖示與重新啟動項目。
  try {
    win.setAppDetails({
      appId: APP_USER_MODEL_ID,
      appIconPath: windowIconPath || process.execPath,
      appIconIndex: 0
    });
  } catch {}
try { if (windowIcon) win.setIcon(windowIcon); } catch {}
  // Reapply the app icon after Windows creates and shows the taskbar button.
  const applyTaskbarIdentity = () => {
    try {
      if (process.platform !== 'win32' || win.isDestroyed()) return;
      const iconPath = appIconPath();
      const icon = loadAppIcon();
      if (appRevealed || win.isVisible()) win.setSkipTaskbar(false);
      win.setAppDetails({
        appId: APP_USER_MODEL_ID,
        appIconPath: iconPath || process.execPath,
        appIconIndex: 0,
        relaunchCommand: '"' + process.execPath + '"',
        relaunchDisplayName: 'Claude娘 - Windows 11 電腦版'
      });
      win.setIcon(icon && !icon.isEmpty() ? icon : (iconPath || process.execPath));
    } catch {}
  };
  win.once('ready-to-show', applyTaskbarIdentity);
  win.on('show', () => {
    appRevealed = true;
    try { win.setSkipTaskbar(false); } catch {}
    applyTaskbarIdentity();
    setTimeout(applyTaskbarIdentity, 350);
  });
  win.webContents.on('did-finish-load', applyTaskbarIdentity);
  // 部分 Windows 版本在建立視窗後才決定標題列圖示；再明確套用同一張圖。
  
  // 視窗大小／位置記憶：移動與縮放後防抖寫回；關閉時立即寫回（含最大化狀態）。
  let windowStateSaveTimer = 0;
  const scheduleWindowStateSave = () => {
    if (windowStateSaveTimer) return;
    windowStateSaveTimer = setTimeout(() => {
      windowStateSaveTimer = 0;
      saveWindowState(win);
    }, 800);
  };
  win.on('resize', scheduleWindowStateSave);
  win.on('move', scheduleWindowStateSave);
  win.on('close', () => { if (windowStateSaveTimer) { clearTimeout(windowStateSaveTimer); windowStateSaveTimer = 0; } saveWindowState(win); });
  win.once('closed', () => {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
    if (splashWindow && !splashWindow.isDestroyed()) { try { splashWindow.destroy(); } catch {} }
    splashWindow = null;
  });
  // 全視窗狀態推送（renderer 依此調整版面：立繪不被對話框擋到）。
  win.on('enter-full-screen', () => { try { win.webContents.send('window:fullscreen-changed', true); } catch {} });
  win.on('leave-full-screen', () => { try { win.webContents.send('window:fullscreen-changed', false); } catch {} });
  if (savedState && savedState.maximized) win.maximize();
  win.webContents.setWindowOpenHandler(({url}) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isRendererPageUrl(url) && !isStartupSplashPageUrl(url)) event.preventDefault();
  });
  // 開場動畫與主畫面分離：主畫面在背景預載，9.4 秒動畫結束後只切換視窗。
  // 這樣不需要縮短開場，也不會在切換時重新載入整套 HTML/CSS/JS。
  const startAppLoad = () => {
    if (appLoadStarted || win.isDestroyed()) return;
    appLoadStarted = true;
    try { win.webContents.setBackgroundThrottling(false); } catch {}
    win.loadURL(appUrl).catch(error => {
      console.error('主畫面載入失敗：', error?.message || error);
      appReady = true;
      revealAppWindow();
    });
  };
  const captureSplashState = () => {
    const splash = splashWindow;
    if (!splash || splash.isDestroyed()) return;
    try { splashBounds = splash.getNormalBounds(); } catch {}
    try { splashMaximized = splash.isMaximized(); } catch {}
  };
  const revealAppWindow = () => {
    if (appRevealed || win.isDestroyed() || !startupFinished || !appReady) return;
    appRevealed = true;
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
    try {
      if (splashBounds) {
        if (splashMaximized) win.maximize();
        else win.setBounds(splashBounds);
      } else if (savedState && savedState.maximized) {
        win.maximize();
      }
    } catch {}
    try { win.setSkipTaskbar(false); win.show(); win.focus(); } catch {}
    // 背景預載期間關閉節流；顯示後恢復，最小化時才不會一直吃計時器。
    setTimeout(() => {
      try { if (!win.isDestroyed()) win.webContents.setBackgroundThrottling(true); } catch {}
    }, 2500);
    const splash = splashWindow;
    splashWindow = null;
    if (splash && !splash.isDestroyed()) { try { splash.destroy(); } catch {} }
  };
  const finishStartup = () => {
    if (startupFinished) return;
    startupFinished = true;
    captureSplashState();
    startAppLoad();
    revealAppWindow();
    if (!appReady) {
      // 保險：即使 ready-to-show 沒有觸發，也不讓使用者卡在開場畫面。
      revealTimer = setTimeout(() => { appReady = true; revealAppWindow(); }, 8000);
    }
  };
  win.once('ready-to-show', () => {
    // 避免初始 about:blank 的第一次繪製被誤判成主畫面已就緒。
    if (!appLoadStarted) return;
    appReady = true;
    revealAppWindow();
  });
  win.webContents.on('did-finish-load', () => {
    if (appReady) return;
    const url = win.webContents.getURL();
    if (url !== indexUrl && !url.startsWith(indexUrl + '?')) return;
    setTimeout(() => { appReady = true; revealAppWindow(); }, 500);
  });
  const createStartupSplash = () => {
    if (win.isDestroyed() || startupFinished) return;
    const splash = new BrowserWindow({
      icon: windowIcon || (windowIconPath ? windowIconPath : undefined),
      x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
      y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
      width: Math.max(500, Math.round(bounds.width || DEFAULT_WINDOW_BOUNDS.width)),
      height: Math.max(640, Math.round(bounds.height || DEFAULT_WINDOW_BOUNDS.height)),
      minWidth: 500,
      minHeight: 640,
      autoHideMenuBar: true,
      show: false,
      backgroundColor: '#090706',
      title: 'Claude娘啟動',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    splashWindow = splash;
    if (savedState && savedState.maximized) { try { splash.maximize(); } catch {} }
    const applySplashIdentity = () => {
      try {
        if (process.platform !== 'win32' || splash.isDestroyed()) return;
        splash.setAppDetails({appId: APP_USER_MODEL_ID, appIconPath: windowIconPath || process.execPath, appIconIndex: 0});
        if (windowIcon) splash.setIcon(windowIcon);
      } catch {}
    };
    const showStartupSplash = () => {
      if (startupFinished || splashShown || splash.isDestroyed()) return;
      splashShown = true;
      try { splash.show(); splash.focus(); } catch {}
      setTimeout(startAppLoad, 350);
    };
    splash.once('ready-to-show', () => {
      applySplashIdentity();
      // 正常會由開場頁的 title 訊號顯示；這裡只是避免頁面例外時整片黑。
      setTimeout(showStartupSplash, 2000);
    });
    splash.on('show', () => {
      applySplashIdentity();
      setTimeout(applySplashIdentity, 350);
    });
    splash.webContents.on('did-finish-load', applySplashIdentity);
    splash.webContents.on('page-title-updated', (event, title) => {
      if (title !== 'CLAUDE_SPLASH_VISIBLE') return;
      event.preventDefault();
      try { splash.setTitle('Claude娘啟動'); } catch {}
      showStartupSplash();
    });
    splash.webContents.setWindowOpenHandler(({url}) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return {action: 'deny'};
    });
    splash.webContents.on('will-navigate', event => {
      event.preventDefault();
      finishStartup();
    });
    splash.on('close', captureSplashState);
    splash.on('closed', () => {
      splashWindow = null;
      startupFinished = true;
      startAppLoad();
      revealAppWindow();
    });
    splash.webContents.on('render-process-gone', finishStartup);
    const splashTimeout = setTimeout(finishStartup, 15000);
    splash.once('closed', () => clearTimeout(splashTimeout));
    splash.loadURL(`${startupSplashUrl}?launcher=1&appUrl=${encodeURIComponent(appUrl)}`).catch(() => finishStartup());
  };
  createStartupSplash();
}

// 桌面捷徑自我修復：安裝程式會建立桌面捷徑，但捷徑可能被使用者或清理工具刪掉，
// 也可能因為安裝位置改變而指向一個已經不存在的 exe。舊版只在「第一次啟動」補建一次
// （靠 userData 裡的 desktop-shortcut.created 標記檔判斷），所以只要那個標記存在、
// 捷徑卻被刪掉，就永遠不會重建——這是實際會遇到的 bug。現在改成每次啟動都檢查：
//   1. 捷徑不存在             → 建立
//   2. 捷徑指向的檔案不存在   → 重新指向目前的 exe
//   3. 其他情況（包含使用者自己改成別的有效目標）→ 尊重使用者，不動
// 只在已安裝（packaged）的 App 執行：開發模式（npm start）的 execPath 是 electron.exe，
// 拿它建桌面捷徑只會做出一個壞掉的捷徑。任何失敗都吞掉，捷徑不該影響 App 啟動。
const DESKTOP_SHORTCUT_NAME = 'Claude娘 - Windows 11 電腦版.lnk';
function desktopShortcutState(linkPath, target, iconPath) {
  if (!fs.existsSync(linkPath)) return 'missing';
  let details;
  try { details = shell.readShortcutLink(linkPath); } catch { return 'unreadable'; }
  const current = String(details?.target || '');
  if (!current) return 'unreadable';
  if (path.resolve(current).toLowerCase() !== path.resolve(target).toLowerCase()) {
    if (path.basename(current).toLowerCase() === path.basename(target).toLowerCase()) return 'update';
    return fs.existsSync(current) ? 'other-target' : 'dead-target';
  }
  // 目標正確但圖示是空的（Windows 會退回快取／預設圖）或不是同一張 icon.ico，
  // 或 AppUserModelID 不同（工作列會把視窗歸到別的群組）→ 就地更新捷徑。
  let iconOk = false;
  try {
    iconOk = Boolean(details?.icon) && path.resolve(String(details.icon)).toLowerCase() === path.resolve(iconPath).toLowerCase();
  } catch { iconOk = false; }
  const aumidOk = String(details?.appUserModelId || '') === APP_USER_MODEL_ID;
  return iconOk && aumidOk ? 'ok' : 'update';
}
function ensureDesktopShortcut() {
  try {
    if (process.platform !== 'win32' || !app.isPackaged) return 'skipped';
    const linkPath = path.join(app.getPath('desktop'), DESKTOP_SHORTCUT_NAME);
    const iconPath = appIconPath() || process.execPath;
    const state = desktopShortcutState(linkPath, process.execPath, iconPath);
    if (state === 'ok' || state === 'other-target') return 'kept';
    const options = {
      target: process.execPath,
      description: 'Claude娘 - Windows 11 電腦版',
      cwd: path.dirname(process.execPath),
      icon: iconPath,
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID
    };
    if (state === 'update') {
      // 只更新圖示／識別碼，不刪掉玩家既有的捷徑（保留名稱、位置與其他設定）。
      let updated = false;
      try { updated = shell.writeShortcutLink(linkPath, 'update', options); } catch {}
      if (!updated) { try { updated = shell.writeShortcutLink(linkPath, 'replace', options); } catch {} }
      return updated ? 'icon-repaired' : 'kept';
    }
    let written = state === 'dead-target' ? shell.writeShortcutLink(linkPath, 'replace', options) : false;
    if (!written) {
      try { fs.rmSync(linkPath, {force: true}); } catch {}
      written = shell.writeShortcutLink(linkPath, 'create', options);
    }
    if (!written) return 'failed';
    // 舊版留下的標記檔已無用途，順手清掉，避免日後誤判「捷徑已經處理過了」。
    try { fs.rmSync(path.join(app.getPath('userData'), 'desktop-shortcut.created'), {force: true}); } catch {}
    return state === 'missing' ? 'created' : 'repaired';
  } catch { return 'failed'; }
}

// Repair the Start Menu shortcut too so its taskbar grouping uses the app's AppUserModelID.
function ensureStartMenuShortcut() {
  try {
    if (process.platform !== 'win32' || !app.isPackaged) return 'skipped';
    const linkPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Claude娘', 'Claude娘.lnk');
    const iconPath = appIconPath() || process.execPath;
    const state = desktopShortcutState(linkPath, process.execPath, iconPath);
    if (state === 'ok' || state === 'other-target') return 'kept';
    const options = {
      target: process.execPath,
      description: 'Claude娘 - Windows 11 電腦版',
      cwd: path.dirname(process.execPath),
      icon: iconPath,
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID
    };
    if (state === 'update') {
      let updated = false;
      try { updated = shell.writeShortcutLink(linkPath, 'update', options); } catch {}
      if (!updated) { try { updated = shell.writeShortcutLink(linkPath, 'replace', options); } catch {} }
      return updated ? 'icon-repaired' : 'kept';
    }
    let written = state === 'dead-target' ? shell.writeShortcutLink(linkPath, 'replace', options) : false;
    if (!written) {
      try { written = shell.writeShortcutLink(linkPath, 'create', options); } catch {}
    }
    return written ? (state === 'missing' ? 'created' : 'repaired') : 'failed';
  } catch { return 'failed'; }
}

// R47｜自動排版：App 視窗佔螢幕左 2/3，自動化瀏覽器（Google）佔右 1/3。
// App 用 setBounds；Chrome 用 CDP Browser.setWindowBounds（外部模式開啟官網時自動套用，best-effort）。
async function applyExternalCompanionThirds() {
  try {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen()) return;
    const {workArea} = screen.getPrimaryDisplay();
    const appWidth = Math.round(workArea.width * 2 / 3);
    mainWindow.setBounds({x: workArea.x, y: workArea.y, width: appWidth, height: workArea.height});
    const ver = await (await fetch(`${automationHttpBase()}/json/version`, {signal: AbortSignal.timeout(2500)})).json();
    const tabs = await (await fetch(`${automationHttpBase()}/json/list`, {signal: AbortSignal.timeout(2500)})).json();
    const tab = tabs.find(x => x.type === 'page' && /gemini\.google\.com|chatgpt\.com|accounts\.google\.com/.test(String(x.url||'')));
    if (!tab) return;
    const info = await cdpSend(ver.webSocketDebuggerUrl, {method: 'Browser.getWindowForTarget', params: {targetId: tab.id}});
    if (!info || !Number.isFinite(info.windowId)) return;
    await cdpSend(ver.webSocketDebuggerUrl, {method: 'Browser.setWindowBounds', params: {
      windowId: info.windowId,
      bounds: {left: workArea.x + appWidth, top: workArea.y, width: workArea.width - appWidth, height: workArea.height, windowState: 'normal'}
    }});
  } catch {}
}
function registerWindowIpc() {
  // 全視窗切換（HUD 按鈕／F11）；狀態變化推送給 renderer 調整版面（立繪不被對話框擋到）。
  ipcMain.handle('window:toggle-fullscreen', event => {
    assertTrustedRenderer(event);
    if (!mainWindow || mainWindow.isDestroyed()) return {ok: false};
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return {ok: true, fullscreen: next};
  });
}
app.whenReady().then(async () => {
  try {
    // 工作列／通知使用與安裝捷徑一致的識別碼（app.package.json build.appId）。
    try { app.setAppUserModelId(APP_USER_MODEL_ID); } catch {}
    registerVaultIpc();
  registerSceneImageIpc();
  attachSceneImageCapture();
  registerWindowIpc();
  // R51｜Google 帳號不預設：renderer 同步「開啟 Gemini 時先選帳號」開關。
  ipcMain.handle('ai-web:set-ask-account', (event, value) => {
    assertTrustedRenderer(event);
    askGoogleAccount = value === true;
    return {ok: true, askGoogleAccount};
  });
    // 金庫讀取失敗（損毀／別台電腦加密）不能擋住 App 啟動：照常開啟，只是這次
    // 沒有任何已保存的金鑰可用；絕不在讀不到時改寫金庫，資料留給使用者自行處置。
    try {
      syncVaultIntoServer(await readVault());
    } catch (error) {
      console.error('API 金鑰庫讀取失敗，這次啟動先停用已保存的金鑰（未覆寫任何資料）：', error?.message || error);
    }
    const serverModule = await import(pathToFileURL(path.join(__dirname, 'server', 'server.js')).href);
    localApiToken = crypto.randomBytes(32).toString('hex');
    localApiServer = await serverModule.startApiServer({host: '127.0.0.1', port: 0, token: localApiToken});
    localApiBase = `http://127.0.0.1:${localApiServer.address().port}`;
    ensureDesktopShortcut();
    ensureStartMenuShortcut();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    dialog.showErrorBox('AI 服務啟動失敗', error?.message || '無法啟動本機 AI 連線服務。');
    app.quit();
  }
});
app.on('before-quit', () => localApiServer?.close());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
