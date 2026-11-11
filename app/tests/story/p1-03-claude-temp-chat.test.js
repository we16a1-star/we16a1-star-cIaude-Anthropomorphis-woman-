import test from 'node:test';
import assert from 'node:assert/strict';
import { Script, runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const flow = require('../../ai-web-flow.cjs');
const webApp = readFileSync(new URL('../../www/app.js', import.meta.url), 'utf8');
const mainProcess = readFileSync(new URL('../../electron-main.cjs', import.meta.url), 'utf8');

function fakeButton({ label = '', testid = '', aria = '', role = '', className = '', onClick = null, attrs = {} } = {}) {
  const values = { 'aria-label': aria, 'data-testid': testid, title: '', role, 'aria-haspopup': '', ...attrs };
  return {
    tagName: 'BUTTON',
    innerText: label,
    textContent: label,
    className,
    disabled: false,
    getAttribute: name => (Object.hasOwn(values, name) ? values[name] : null),
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ x: 1, y: 2, width: 10, height: 10, left: 1, top: 2 }),
    matches: () => false,
    click() { if (onClick) onClick(); }
  };
}

function fakeEditor({ tagName = 'TEXTAREA', aria = '', placeholder = '' } = {}) {
  return {
    tagName,
    disabled: false,
    readOnly: false,
    getAttribute: name => (name === 'aria-label' ? aria : name === 'placeholder' ? placeholder : null),
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ x: 1, y: 2, width: 10, height: 10, left: 1, top: 2 }),
    matches: () => false
  };
}

function fakePage({ bodyText = '', buttons = [], editors = [], pathname = '/', search = '', hostname = 'claude.ai' } = {}) {
  const fakeNow = { value: 0 };
  const page = {
    location: { pathname, search, hostname, href: `https://${hostname}${pathname}${search}` },
    document: {
      body: { innerText: bodyText },
      querySelector: () => null,
      querySelectorAll: selector => {
        const value = String(selector);
        if (/button|\[role="link"\]|\[role="menuitem"\]|\[role="switch"\]/.test(value)) return buttons;
        if (/textarea|contenteditable|textbox/.test(value)) return editors;
        return [];
      }
    },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    // 讓 waitFor 的輪詢立即結束（每次檢查都把時間推進超過 timeout）
    Date: { now: () => (fakeNow.value += 300) },
    setTimeout: fn => { fn(); return 0; }
  };
  return { context: page, page, fakeNow };
}

test('P1-03/D15 案1：Claude 已列入可驗證的臨時（無痕）對話；腳本語法可解析，不支援的網站安全失敗', () => {
  assert.deepEqual(
    [...flow.TEMPORARY_CHAT_PROVIDERS],
    ['openai', 'gemini', 'anthropic'],
    'Claude（anthropic）與 ChatGPT／Gemini 同列可驗證清單'
  );
  for (const startNew of [false, true]) {
    const script = flow.buildTemporaryChatScript('anthropic', { startNew });
    assert.equal(typeof script, 'string');
    assert.doesNotThrow(() => new Script(script), `anthropic startNew=${startNew} 腳本必須是有效 JavaScript`);
    assert.match(script, /incognito/, '腳本辨識 Claude 的 Incognito chat 字樣');
    assert.match(script, /無痕/, '腳本同時辨識中文「無痕」字樣');
    assert.match(script, /won[’']t appear/, '必須看到官方「不會出現在歷史紀錄」提示才算確認');
    assert.match(script, /不會顯示/, '中文版提示同樣可確認');
    assert.match(script, /user-menu-button/, 'Claude 帳號選單按鈕只有 data-testid，腳本必須認得');
    assert.match(script, /temporary-control-not-found/, '找不到無痕入口時回報原因，不靜默送入一般對話');
    assert.match(script, /temporary-chat-not-confirmed/, 'startNew 後未確認也回報原因');
  }
  const unsupported = flow.buildTemporaryChatScript('deepseek', { startNew: true });
  const result = runInNewContext(unsupported, {});
  assert.equal(result.ok, false);
  assert.equal(result.error, 'temporary-chat-not-supported');
});

test('P1-03/D15 案2：Claude 頁面必須同時出現無痕字樣與「不進歷史」提示才回報成功', async () => {
  const active = fakePage({
    bodyText: 'Incognito chat  Messages in this chat won’t appear in your history and won’t be used to train models.'
  });
  const ok = await runInNewContext(flow.buildTemporaryChatScript('anthropic'), active.context);
  assert.equal(ok.ok, true);
  assert.equal(ok.provider, 'anthropic');
  assert.equal(ok.active, true);
  assert.equal(ok.startedNew, false);

  const zhActive = fakePage({
    bodyText: '無痕對話　此對話不會顯示在歷史紀錄中，也不會用於訓練。'
  });
  const zhOk = await runInNewContext(flow.buildTemporaryChatScript('anthropic'), zhActive.context);
  assert.equal(zhOk.ok, true, '中文介面同樣可確認');

  const entranceOnly = fakePage({
    bodyText: 'Incognito chat',
    buttons: [fakeButton({ aria: 'Incognito chat', label: 'Incognito chat' })]
  });
  const notConfirmed = await runInNewContext(flow.buildTemporaryChatScript('anthropic'), entranceOnly.context);
  assert.equal(notConfirmed.ok, false, '只有入口字樣、沒有官方提示時不得當成已開啟無痕對話');
  assert.equal(notConfirmed.error, 'temporary-chat-not-active');

  const urlConfirmed = fakePage({ pathname: '/incognito/abc', bodyText: 'Claude' });
  const fromUrl = await runInNewContext(flow.buildTemporaryChatScript('anthropic'), urlConfirmed.context);
  assert.equal(fromUrl.ok, true, 'Claude 若把無痕對話放在專屬路徑，路徑可作為已啟用訊號');
});

test('P1-03/D15 案3：app.js 的網頁 provider 清單與文案都含 Claude，且沒有殘留舊限制', () => {
  assert.match(webApp, /TEMPORARY_CHAT_WEB_PROVIDERS=new Set\(\['openai','gemini','anthropic'\]\)/, '前端清單含 anthropic');
  assert.match(webApp, /window\.claudeDesktop\?\.ensureTemporaryChat/, '回合前會要求主程序確認臨時對話');
  assert.match(webApp, /requireTemporaryChat:requiresTemporaryChat,temporaryReady:temporaryConfirmed/, '未確認不送出的旗標有傳給自動化流程');

  const required = [
    '網頁模式可使用清單中的 12 家 AI 官網；臨時對話目前限 Claude、ChatGPT 與 Gemini。故事存檔保存在本機；官網資料處理仍依各供應商規則。',
    '臨時對話需要使用 AI 網頁版，請先切換到 Claude、Gemini 或 ChatGPT 網頁版。',
    '臨時對話故事只能透過已確認的 Claude、ChatGPT 或 Gemini 官網進行；API 模式不會被當成臨時對話。',
    '目前支援 Claude、ChatGPT 與 Gemini 官網的臨時對話；請切換網站，或選擇「保存記錄」。'
  ];
  for (const text of required) {
    const index = webApp.indexOf(text);
    assert.ok(index >= 0, `缺少文案：${text}`);
    // 每條中文鍵都必須有英文對照（同一行 `': '` 之後含 Claude）
    if (text.includes('官網')) {
      const line = webApp.slice(index, webApp.indexOf('\n', index));
      const translation = line.slice(line.indexOf("': '") + 4);
      assert.match(translation, /Claude/, `英文對照缺 Claude：${text}`);
      assert.doesNotMatch(translation, /currently limited to ChatGPT and Gemini|only on ChatGPT and Gemini|cannot use a confirmed ChatGPT or Gemini/i, '英文對照仍是舊限制');
    }
  }
  const oldStrings = [
    '臨時對話目前限 ChatGPT 與 Gemini',
    '請先切換到 Gemini 或 ChatGPT 網頁版',
    '已確認的 ChatGPT 或 Gemini 官網',
    '目前只支援 ChatGPT 與 Gemini 官網'
  ];
  for (const old of oldStrings) assert.equal(webApp.includes(old), false, `殘留舊文案：${old}`);
});

test('P1-03/D15 案4：Claude 無痕入口找不到時維持安全失敗，不退回一般對話', async () => {
  const page = fakePage({ bodyText: 'Claude  New chat  Incognito chat', buttons: [] });
  const result = await runInNewContext(flow.buildTemporaryChatScript('anthropic', { startNew: true }), page.context);
  assert.equal(result.ok, false);
  assert.ok(
    ['temporary-control-not-found', 'temporary-chat-not-confirmed'].includes(result.error),
    `必須回報安全失敗，實際：${result.error}`
  );
});

test('P1-03/D15 案5：Claude 帳號選單（只有 user-menu-button、沒有 aria-label）也能開啟並確認無痕對話', async () => {
  let menuClicks = 0;
  let incognitoClicks = 0;
  const buttons = [];
  const incognito = fakeButton({
    aria: '使用無痕模式',
    label: '使用無痕模式',
    onClick: () => {
      incognitoClicks += 1;
      page.context.document.body.innerText = '無痕對話 您正在使用無痕模式。無痕對話不會出現在您的歷史記錄、記憶與搜尋中，也不會用於訓練 Claude。';
      page.context.location.search = '?incognito';
    }
  });
  const menu = fakeButton({
    label: 'user-menu-button 測試帳號',
    testid: 'user-menu-button',
    attrs: { 'aria-haspopup': 'menu' },
    onClick: () => {
      menuClicks += 1;
      if (!buttons.includes(incognito)) buttons.push(incognito);
    }
  });
  buttons.push(menu);
  const page = fakePage({ bodyText: 'Claude', buttons });
  const result = await runInNewContext(flow.buildTemporaryChatScript('anthropic', { startNew: true }), page.context);
  assert.equal(result.ok, true, `應可從帳號選單開啟無痕對話：${result.error || ''}`);
  assert.equal(menuClicks, 1, '必須先按一次帳號選單');
  assert.equal(incognitoClicks, 1, '必須按一次無痕入口');
  assert.equal(page.context.location.search, '?incognito');
});

test('P1-03/D15 案6：已在無痕對話時 startNew 不再重開，避免每回合多開新對話', async () => {
  let menuClicks = 0;
  let incognitoClicks = 0;
  const menu = fakeButton({
    label: 'user-menu-button 測試帳號',
    testid: 'user-menu-button',
    onClick: () => { menuClicks += 1; }
  });
  const incognito = fakeButton({
    aria: '使用無痕模式',
    label: '使用無痕模式',
    onClick: () => { incognitoClicks += 1; }
  });
  const page = fakePage({
    bodyText: '無痕對話 您正在使用無痕模式。無痕對話不會出現在您的歷史記錄、記憶與搜尋中，也不會用於訓練 Claude。',
    buttons: [menu, incognito],
    search: '?incognito'
  });
  const result = await runInNewContext(flow.buildTemporaryChatScript('anthropic', { startNew: true }), page.context);
  assert.equal(result.ok, true);
  assert.equal(menuClicks, 0, '已確認無痕時不得再開帳號選單');
  assert.equal(incognitoClicks, 0, '已確認無痕時不得再按無痕入口');
});

test('P1-03/D15 案7：Claude 登入頁、Google／Apple 驗證頁與一般對話頁可被正確辨識', async () => {
  const login = fakePage({ pathname: '/login', bodyText: '登入或建立帳戶' });
  const loginGate = await runInNewContext(flow.buildLoginGateScript('anthropic'), login.context);
  assert.equal(loginGate.loggedOut, true, 'claude.ai/login 必須回報未登入');
  assert.equal(loginGate.loginPage, true);

  const google = fakePage({ hostname: 'accounts.google.com', pathname: '/o/oauth2/auth', bodyText: 'Sign in' });
  const googleGate = await runInNewContext(flow.buildLoginGateScript('anthropic'), google.context);
  assert.equal(googleGate.loggedOut, true, 'Claude 使用 Google 登入時必須停在登入等待，不可當成一般頁');

  const apple = fakePage({ hostname: 'appleid.apple.com', pathname: '/auth/authorize', bodyText: 'Sign in' });
  const appleGate = await runInNewContext(flow.buildLoginGateScript('anthropic'), apple.context);
  assert.equal(appleGate.loggedOut, true, 'Apple 登入同樣必須等待使用者完成');

  const ready = fakePage({ pathname: '/new', bodyText: 'Claude', editors: [fakeEditor({ aria: 'Write a message' })] });
  const readyGate = await runInNewContext(flow.buildLoginGateScript('anthropic'), ready.context);
  assert.equal(readyGate.loggedOut, false);
  assert.equal(readyGate.editor, true, '已登入且看到輸入框時才可繼續');
});

test('P1-03/D15 案8：Claude 由使用者登入／確認；明確 opt-in 才自動預填登入；無痕失敗只降級一回合', () => {
  assert.match(webApp, /claudeAccountConfirmedThisRun/, 'Claude 每次 App 執行階段第一次使用前要確認帳號');
  assert.match(webApp, /getWebLoginCredential\?\.\('anthropic'\)/, '確認前會讀取使用者是否已明確啟用 Claude 自動登入');
  assert.match(webApp, /credential\?\.autoLogin===true/, '只有使用者勾選自動登入時才跳過確認');
  assert.match(webApp, /Claude 會使用自動化瀏覽器目前登入的帳號/, '確認文案要說明會使用目前登入的帳號');
  assert.match(webApp, /App 不會預設任何帳號/, '確認文案要明說不預設帳號');
  assert.match(webApp, /provider==='anthropic'&&temporary\?\.error==='login-required'\)\{/, 'Claude 登入提示不依賴自動送出開關');
  assert.match(webApp, /請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入；登入後再按一次送出。App 不會預設任何帳號。/, '手動模式登入後再送一次');
  assert.match(webApp, /Claude 使用獨立的自動化瀏覽器設定檔：預設不預填、不自動登入/, '設定頁要說明 Claude 的預設登入政策');
  assert.match(webApp, /只有你在這裡儲存帳密並勾選「自動送出登入」時，才會預填／自動登入/, '明確 opt-in 才可自動預填／登入');

  assert.match(webApp, /temporaryChatFallbackKey/, '無痕失敗時要有一回合降級狀態');
  assert.match(webApp, /官網目前無法確認無痕（臨時）對話。要只這一回合改用一般對話嗎？/, '降級前必須由使用者明確同意');
  assert.match(webApp, /這回合的內容會留在官網歷史紀錄；下一回合仍會重新確認無痕對話。/, '降級要提醒會進官網歷史，且下一回合重新要求無痕');
  assert.match(webApp, /requiresTemporaryChat=false;/, '同意後只在本回合關閉無痕要求');
  assert.match(webApp, /temporaryChatFallbackKey='';/, '套用回合後清除一次性降級');
});

test('P1-03/D15 案9：主進程使用 Claude 專用設定檔與登入等待，且保留使用者 opt-in 自動登入', () => {
  assert.match(mainProcess, /web-automation-browser-claude-v20/, 'Claude 使用獨立設定檔，不繼承舊 r24/r25 登入');
  assert.match(mainProcess, /CLAUDE_AUTOMATION_PROFILE_CLAUDE/, '測試／進階使用者可覆寫 Claude 設定檔路徑');
  assert.match(mainProcess, /CLAUDE_AUTOMATION_PORT_CLAUDE/, 'Claude 使用獨立除錯埠，避免接手其他官網的瀏覽器');
  assert.match(mainProcess, /function automationProviderPortBase/, '每個 provider 可選擇自己的除錯埠');
  assert.match(mainProcess, /function readLoginGate\(runner, provider/, '登入等待已從 Gemini 泛化到 Claude');
  assert.match(mainProcess, /provider === 'gemini' \|\| provider === 'anthropic'/, 'Claude 登入頁會啟動等待與後續接回');
  assert.match(mainProcess, /isProviderLoginTabFor/, 'Claude 的 /login、Google、Apple 驗證分頁都認得');
  assert.match(mainProcess, /WEB_PASSWORD_HOSTS=Object\.freeze\(\{[^\n]*anthropic/, 'Claude 仍可使用使用者明確保存的登入資料');
  assert.match(mainProcess, /autoLogin=credential\.autoLogin===true/, '自動登入只在使用者明確勾選時啟用');
  assert.doesNotMatch(mainProcess, /name==='anthropic'\)return \{email:'',hasPassword:false,autoLogin:false,disabled:true\}/, '不得封死 Claude 的 opt-in 登入資料');
});

test('P1-03/D15 案10：修改面不含常見個人信箱痕跡', () => {
  const sources = [webApp, mainProcess, flowSource()];
  for (const source of sources) {
    assert.doesNotMatch(source, /[A-Za-z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo)\.[A-Za-z.]{2,}/i, '程式碼不得留下個人信箱');
  }
});

function flowSource() {
  return readFileSync(new URL('../../ai-web-flow.cjs', import.meta.url), 'utf8');
}
