// ─────────────────────────────────────────────────────────────────────────────
// app.js 是畫面的主程式（約 3500 行）。給要修改的人（含接手的 AI）的「結構地圖」：
//
// 【章節導覽】在檔案內搜尋「SECTION n」可直接跳到各區（依檔案順序）：
//   SECTION 1  import 區：各功能模組（共用邏輯放 www\*.js）
//   SECTION 2  內建常數與共用小工具（人設／世界／模板文字、工坊編輯、縮放、剪貼簿）
//   SECTION 3  開官網與介面狀態常數（openAiWebsite；語言、場景模式、插圖開關）
//   SECTION 4  介面文字 UI_EN 與語言套用（uiText／applyUiLanguage；新增文字中英都要加）
//   SECTION 5  場景插圖、立繪、人物圖（IndexedDB；容量規則在 scene-image-store.js）
//   SECTION 6  存檔槽常數與全域狀態初始化（loadSlots()、state＝load()）
//   SECTION 7  AI 連線管理（API 模式帳號；API Key 由主程序保管，這裡只看得到有沒有）
//   SECTION 8  網頁模式：12 家官網清單、提示詞、模型、回覆解析與接回
//   SECTION 9  AI 狀態列與送出設定（後端健康檢查、API base、桌面模式標頭）
//   SECTION 10 遊戲進度與存檔（fresh／load／save、槽位、自動與快速存檔）
//   SECTION 11 畫面渲染（render()、對話回顧；innerHTML 一律經 esc()）
//   SECTION 12 開場設定、存檔清單、自訂模型管理
//   SECTION 13 設定畫面與創意工坊（原始碼編輯器；套用由主程序把關）
//   SECTION 14 故事回合（callAI、applyTurn、禮物、資料匯出／匯入）
//   SECTION 15 圖片拖放與貼上匯入
//   SECTION 16 快速控制、對話編輯、網頁自動化開關與剪貼簿接回
//   SECTION 17 GALGAME 選單與覆蓋層（☰ 選單／存檔・讀檔／場景與插圖／回想）
//   SECTION 18 鍵盤快捷鍵、主程序回推、啟動（檔尾）
//
// 【常見修改點：改什麼去哪裡】
//   介面文字／翻譯     SECTION 4 的 UI_EN（中英都要加；index.html 靜態文字靠同一份表）
//   12 家官網清單      SECTION 8 的 WEB_AI_PROVIDERS；主程序 electron-main.cjs 的
//                      AI_WEBSITE_URLS 與 ai-web-flow.cjs 的 SITE_HINTS 要一起看
//   自動送出／自動接回 流程在 app\ai-web-flow.cjs（各官網選擇器）；SECTION 16 是開關與接回
//   提示詞長度／規則  token-budget.js（長度預算）＋ prompt-rules.js（寫作規則、規則開關與補充指示）
//   存檔格式與救援     save-storage.js（實體格式）；存檔流程在 SECTION 10
//   插圖提示詞／容量   scene-prompt.js（提示詞）＋ scene-image-store.js（容量）
//   角色預設人設       character-profile.js（唯一來源）
//   故事時間／好感階段   story-clock.js（追加八：天數時段與關係階段的純邏輯；存檔欄位 storyClock／pendingMilestone）
//   世界書（關鍵詞觸發）  world-book.js（追加九：命中關鍵詞才注入；存檔欄位 worldBook；畫面在 GALGAME 選單「辭典」）
//   GALGAME 介面／外觀     index.html 檔頭「GALGAME 介面區段導覽」＋style.css 檔尾
//                      【G｜GALGAME 外觀】；選單開關在 SECTION 17
//
// 修改流程：npm test → npm run build:web（App 實際載入 app.bundle.js）→ 安裝版重測。
// 前端靜態稽核：node check-frontend-review.cjs（在原始碼根目錄跑；檢查語法、SECTION 標記、
// 本圖關鍵字、除錯殘留與 innerHTML 使用情形）。
// 更完整的前端修改指南：「開源說明-授權與修改.txt」第七節；審查動線見審查包「前端審查指南-給Claude.txt」。
// ─────────────────────────────────────────────────────────────────────────────
// ==== SECTION 1｜import 區：各功能模組（共用邏輯放 www\*.js）====
import { withCharacterBoundary, DEFAULT_CHARACTER_PROFILE, COMPACT_DEFAULT_CHARACTER_PROFILE as COMPACT_DEFAULT_CHARACTER_PROMPT, COMPACT_HIGH_TSUNDERE_CHARACTER_PROFILE, B5_PREVIOUS_DEFAULT_CHARACTER_PROFILE, B6_PREVIOUS_DEFAULT_CHARACTER_PROFILE, B7_PREVIOUS_DEFAULT_CHARACTER_PROFILE, B8_PREVIOUS_DEFAULT_CHARACTER_PROFILE, B9_PREVIOUS_DEFAULT_CHARACTER_PROFILE, LEGACY_PRE_TSUNDERE_CHARACTER_PROFILE, LEGACY_TSUNDERE_CHARACTER_PROFILE, DEFAULT_CHARACTER_SHEET, normalizeCharacterSheet } from './character-profile.js';
import { OPENING_STYLES, RANDOM_OPENING_STYLE, AI_RANDOM_OPENING_STYLE, CUSTOM_OPENING_STYLE, openingStylePrompt, resolveOpeningStyle } from './opening-styles.js';
import { snapshotForRollback } from './save-state.js';
import { collectStoredSlots, compactSlotForStorage, isSlotPayload, listStoredSlotKeys, parseSlotsIndex, readStoredSlot, slotBackupKey, slotIdFromKey, slotKey, slotsIndexPayload, writeVerified, SLOTS_INDEX_KEY, SLOTS_INDEX_VERSION } from './save-storage.js';
import { normalizeDifficulty, normalizeGiftConversations, resolveGiftAffection, rollGiftConversations } from './gift-system.js';
import { encodeCharacterPortrait, encodeSceneIllustration, normalizeCharacterPortrait } from './character-portrait.js';
import { buildSceneImagePrompt as composeSceneImagePrompt } from './scene-prompt.js';
import { pickSceneImageEvictions, SCENE_IMAGE_BUDGET } from './scene-image-store.js';
import { translateError } from './ui-error.js'; import { craftRules, filteredPromptRules, promptTweaksExtraLines, normalizePromptTweaks, normalizeAuthorNote, authorNoteLines } from './prompt-rules.js';
import { advanceStoryClock, affectionStageKeyOf, affectionStageOf, normalizeMilestoneKey, normalizeStoryClock, realSlotIndexAt, realStoryClock, stageByKey, stageIndexByKey, storyClockLabel } from './story-clock.js';
import { normalizeSpecialEventKey, rollSpecialEvent, specialEventPromptLines } from './special-events.js';
import { letterEndingPatch, letterEndingText, shouldTriggerAnthropicLetter } from './anthropic-letter.js';
import { normalizeStoryEmotion, normalizeStoryEmotionIntensity } from './story-emotion.js';
import { approveStoryEvent, normalizeSeenStoryEventFlags, normalizeStoryEventFlag } from './story-events.js';
import { evaluateRareGoodnight, RARE_GOODNIGHT_WARMUP_TURNS } from './night-cg.js';
import { evaluateBedroomScene, BEDROOM_SCENE_COOLDOWN_MS } from './bedroom-scene.js';
import { ALBUM_ENTRIES, ALBUM_FREE_IDS, albumEntry, isAlbumUnlocked, albumImageSrc } from './album.js';
import { normalizeWorldBook, normalizeWorldBookEntry, worldBookPromptLines, worldBookPreview, parseWorldBookImport, mergeWorldBookEntries, exportWorldBook } from './world-book.js';
import { OUTPUT_TARGET, outputTargetLines, webPromptBudget } from './token-budget.js';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';
import { loadPlayerNamePreference, normalizePlayerName, savePlayerNamePreference } from './player-name.js';
// P1-01（S1 設定檔載入器接線）：15 份 config 的單一入口；啟動即驗證，缺欄位報錯帶檔名（細節見 config-loader.js 與 tests/story/config-loader.test.js）
import { loadConfigs } from './config-loader.js';
// P1-06（逐句演出引擎）：借鏡 AnimaVN jev.js / player.ts，將回覆逐句播放並支援插話快進
import { splitLines } from './line-split.js';
import { LineRunner } from './line-runner.js';
// P1-05（玩家安全界線）：危機本機攔截＋低落陪伴提示詞；網頁與 API 兩條生成管線都強制附加安全段。
import { SafetyModule, withSafetyPromptSupport } from './safety-module.js';
// P1-02（S2 提示詞組裝與開發者檢視）：工坊「開發者檢視」六區塊面板。
// 純檢視＋預覽：面板開關只影響預覽，不會改變遊戲實際送出的提示詞（實際注入屬 P1-03）。
import { bandKeyForAffection, buildInspectorData, defaultStageForAffection, renderInspectorBlocks, renderInspectorSummary, saveBlockPrefs, loadBlockPrefs } from './prompt-inspector.js';
// P1-01 bootstrap：成功→存模組級變數（P1-02 起的消費端使用）；失敗→console 留痕＋可見警示，
// 遊戲以 app.js 內建提示詞照常運作（不白屏、不擋存檔）。
// P1-06 逐句演出單例
let storyLineRunner = null;
function getStoryLineRunner() {
  if (!storyLineRunner) {
    storyLineRunner = new LineRunner({
      speed: 35,
      onLineChange: (text, idx, total, isTyping) => {
        const el = document.getElementById('dialogueText');
        if (el) {
          el.textContent = text;
          if (idx >= 0 && total > 1) {
            el.classList.add('is-line-playing');
            const ind = document.createElement('span');
            ind.className = 'dialogue-line-indicator';
            ind.textContent = ' ▶ (' + (idx + 1) + '/' + total + ')';
            el.appendChild(ind);
          } else {
            el.classList.remove('is-line-playing');
          }
        }
      },
      onFinish: () => {
        const el = document.getElementById('dialogueText');
        if (el) el.classList.remove('is-line-playing');
        const c = document.getElementById('choices');
        if (c) c.classList.remove('choices-waiting');
      }
    });
  }
  return storyLineRunner;
}

let __gameConfigs=null;
function bootstrapGameConfigs(){
  try{
    __gameConfigs=loadConfigs();
    return true;
  }catch(err){
    __gameConfigs=null;
    console.error('[S1/P1-01] 設定檔載入失敗（遊戲以內建提示詞照常運作）:',err);
    try{alert(uiText('設定檔載入失敗：')+(err&&err.message||err)+uiText('\n遊戲將以內建提示詞照常運作；存檔不受影響。'));}catch(_){}
    return false;
  }
}

const $ = id => document.getElementById(id);
// P1-05：安全模組只讀 crisis.json；危機與低落判定都在本機完成，不依賴 AI。
const safetyModule = new SafetyModule();
// ==== SECTION 2｜內建常數與共用小工具（人設／世界／模板文字、工坊編輯、介面縮放、剪貼簿）====
const DEFAULT_CHARACTER_NAME='Claude娘';
const LEGACY_DEFAULT_CHARACTER_PROFILE=LEGACY_PRE_TSUNDERE_CHARACTER_PROFILE.replaceAll('Claude娘','claude 娘').replaceAll('cIoudo娘的圖書館','claude 娘的圖書館');
const PREVIOUS_DEFAULT_CHARACTER_PROFILE=LEGACY_TSUNDERE_CHARACTER_PROFILE.replaceAll('Claude娘','cIoudo 娘').replaceAll('cIoudo 娘的圖書館','cIoudo娘的圖書館');
// E13（2026-10-18）品牌統一：E13 之前的現行預設（未動過的存檔自動升級為新品牌文案；使用者自訂內容不動）。
// 批5 Ａ4（2026-10-19）顏文字去除：E13_PREVIOUS 改由 B5_PREVIOUS 冷凍快照衍生（不隨 DEFAULT 動態漂移）。
const E13_PREVIOUS_DEFAULT_CHARACTER_PROFILE=B5_PREVIOUS_DEFAULT_CHARACTER_PROFILE.replaceAll('Claude娘的圖書館','cIoudo娘的圖書館');
const DEFAULT_WORLD_SETTING='故事發生在「知識之塔」的古老圖書館。初始地點是雨夜中的古籍閱覽室；彩窗、深色木書架、舊書紙墨香、雨聲與溫熱茶香構成主要氛圍。故事可逐步探索圖書館不同樓層、藏書與人物秘密。';
const DEFAULT_STORY_TEMPLATE='以沉浸式戀愛文字小說推進。每回合先細寫場景、光線、聲音、天氣、人物位置與細微反應，再自然延續玩家行動造成的因果；感情漸進發展，不替玩家決定行動。結尾提供恰好 7 個彼此不同、能導向不同故事線的選項。';
const COMPACT_DEFAULT_WORLD_PROMPT='知識之塔古老圖書館；故事始於雨夜古籍閱覽室，以彩窗、木書架、紙墨香、雨聲和茶香營造氛圍，逐步探索樓層、藏書與人物秘密。';
const COMPACT_DEFAULT_RULES_PROMPT='沉浸式戀愛小說；細寫感官場景、人物位置和反應，承接玩家行動與因果，感情漸進。';
const WORKSHOP_CODE_KEY='claude_novel_workshop_code_edits_v1';
const AUTO_SAVE_KEY='claude_novel_auto_save_v1';
let autoSaveEnabled=localStorage.getItem(AUTO_SAVE_KEY)!=='false';
const THEME_STORAGE_KEY='claude_novel_theme_v1';
// R3B（批5）：新增第五態「依故事時間」＝跟隨 storyClock（早晨／中午亮、傍晚／夜晚暗）；無故事或未啟用＝回退跟隨系統。
const THEME_CHOICES=['auto','light','dark','time','story'];
const QUICK_THEME_ICONS={auto:'◐',light:'☀',dark:'☾',time:'◔',story:'⌛︎'};
let manualSaveDirty=false;
let webClipboardMonitorTimer=null;
let webClipboardMonitorBusy=false;
let webClipboardMonitorSlotId='';
let webClipboardMonitorAction='';
let webClipboardLastText='';
let webClipboardMonitorStartedAt=0;
const WORKSHOP_MAX_FILE_CHARS=400000;
// v4.4.0：工坊不再有白名單——專案內任何文字檔（含新檔案）都能開啟與修改。
// 這裡只做「看起來是安全相對路徑」的前置檢查；真正的把關在主程序（workshop-apply.cjs）：
// 路徑不得跳出專案，相依、建置產物、備份與 .env 等不開放。
const WORKSHOP_BLOCKED_SEGMENTS=['node_modules','.git','dist','release','_build-tools','.workshop-backup','.cache'];
function isWorkshopEditKey(file){
  if(typeof file!=='string'||!file.length||file.length>200)return false;
  if(/^[\\/]/.test(file)||/^[A-Za-z]:/.test(file))return false;
  const segments=file.replace(/\\/g,'/').split('/');
  if(segments.some(part=>!part||part==='.'||part==='..'))return false;
  const lower=segments.map(part=>part.toLowerCase());
  if(lower.some(part=>WORKSHOP_BLOCKED_SEGMENTS.includes(part)))return false;
  const base=lower[lower.length-1]||'';
  return !/^\.env(\.|$)/.test(base)&&base!=='source-root.json'&&!/\.workshop-tmp$/.test(base);
}
function loadWorkshopCodeEdits(){try{const raw=JSON.parse(localStorage.getItem(WORKSHOP_CODE_KEY)||'{}');if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};const out={};for(const [file,content] of Object.entries(raw))if(isWorkshopEditKey(file)&&typeof content==='string'&&content.length<=WORKSHOP_MAX_FILE_CHARS)out[file]=content;return out;}catch{return {};}}
let workshopCodeEdits=loadWorkshopCodeEdits();
let workshopCodeDirty=false;
let workshopCurrentFile='';
let workshopEditorLoaded=false;
let workshopFileList=[];
let workshopSourceInfo=null;
let workshopListRequest=0;
let lastOpenedWebProvider='';
let lastOpenedWebBrowserMode='';
const LEGACY_WEB_LOGIN_EMAIL_KEY='claude_novel_web_login_email_v1';
let legacyWebLoginEmail=String(localStorage.getItem(LEGACY_WEB_LOGIN_EMAIL_KEY)||'').trim().slice(0,254);
try{localStorage.removeItem(LEGACY_WEB_LOGIN_EMAIL_KEY);}catch{}
let webLoginEmail='',webLoginHasPassword=false,webLoginAutoLogin=false,webLoginCredentialProvider='',webLoginCredentialRequest=0;
const WEB_BROWSER_MODE_KEY='claude_novel_web_browser_mode_v1';
const WEB_BROWSER_MODE_CHOSEN_KEY='claude_novel_web_browser_mode_chosen_v1';
// 4.5.12／4.5.13 曾在 Google 登入被轉到外部自動化瀏覽器時，把 external 永久寫進
// localStorage；那個流程可能要求 Windows Hello／PIN。更新後第一次啟動把「不是使用者
// 親自選的」舊值重置回 App 內瀏覽器；之後使用者在設定裡選的外部模式仍會正常保留。
function initialWebBrowserMode(){
  try{
    if(localStorage.getItem(WEB_BROWSER_MODE_CHOSEN_KEY)!=='1'){
      localStorage.setItem(WEB_BROWSER_MODE_KEY,'embedded');
      localStorage.setItem(WEB_BROWSER_MODE_CHOSEN_KEY,'1');
      return 'embedded';
    }
    return localStorage.getItem(WEB_BROWSER_MODE_KEY)==='external'?'external':'embedded';
  }catch{return 'embedded';}
}
let webBrowserMode=initialWebBrowserMode();
// 網頁模式自動化（自動送出＋自動抓回覆）：預設開啟；用過開關的人尊重他的選擇。
const WEB_AUTO_FLOW_KEY='claude_novel_web_auto_flow_v1';
let webAutoFlow=localStorage.getItem(WEB_AUTO_FLOW_KEY)!=='off';
// R51｜Google 帳號不預設：開啟 Gemini 時先經過「帳號選擇器」由使用者本人挑帳號（預設開）。
const ASK_GOOGLE_ACCOUNT_KEY='claude_novel_ask_google_account';
let askGoogleAccount=localStorage.getItem(ASK_GOOGLE_ACCOUNT_KEY)!=='off';
window.claudeDesktop?.setAskGoogleAccount?.(askGoogleAccount);
let webAutoFlowActive=false,webAutoFlowBaseKey='',webAutoFlowRetryAt=0;
// 離開故事時若自動化回覆剛好送達，先暫存；按「繼續故事」後再走原本的驗證／接回流程。
let webAutoQueuedReply='';
// D15：Claude 使用獨立自動化設定檔；每次 App 執行階段第一次使用前，若沒有明確啟用
// 自動登入，先由使用者確認「使用目前登入的帳號」或自行登入／切換。純前端狀態，不寫入存檔。
let claudeAccountConfirmedThisRun=false;
// D15：官網暫時無法確認無痕（臨時）對話時，允許「只這一回合」改用一般對話。
// key = slot|action；套用回合後清除，下一回合仍會重新要求無痕。
let temporaryChatFallbackKey='';
// 自動送出必須由本次使用者操作觸發；重開程式後的舊待辦只保留供手動重試。
let webAutoSendArmed=false;
// 追加十自動化（A/C/D/F）：自動重試只准「重新監看」已送出過的回合（重填再送會把同一回合送第二次），
// 重試次數與狀態顯示詳細度讓使用者自選（設定頁）；狀態字串由主程序的階段代碼翻成白話。
const WEB_AUTO_RETRY_KEY='claude_novel_web_auto_retry_v1';
const WEB_AUTO_DETAIL_KEY='claude_novel_web_auto_detail_v1';
function normalizeWebAutoRetry(value){if(value===null||value===''||typeof value==='undefined')return 3;const n=Number(value);return [0,2,3,5].includes(n)?n:3;}
function normalizeWebAutoDetail(value){return value==='brief'?'brief':'full';}
let webAutoRetryLimit=normalizeWebAutoRetry(localStorage.getItem(WEB_AUTO_RETRY_KEY));
let webAutoStatusDetail=normalizeWebAutoDetail(localStorage.getItem(WEB_AUTO_DETAIL_KEY));
let webAutoFlowSubmitted=false,webAutoFlowWatchOnly=false,webAutoWatchRetryCount=0,webAutoLastTurnKey='';
let webAutoStatusText='',webAutoStatusStage='',webAutoHealthRunning=false;
// 官網模型清單不是固定常數：每次讀取都從目前登入帳號的官網選單取得，並記住目前名稱。
// key = provider::mode，切換 App 內／外部瀏覽器時各自保留自己的清單與選取狀態。
const webModelStateByProvider=new Map();
// 使用者手打的模型清單：官網讀不到、改名或想先用自己的名稱時仍可選。
// key = provider::mode，與即時清單分開保存；顯示時再合併，清除手動項目不會刪掉官網清單。
const WEB_MANUAL_MODELS_KEY='claude_novel_web_manual_models_v1';
function normalizeManualWebModelNames(value){
  const raw=Array.isArray(value)?value:String(value||'').split(/[\n,，;；]+/);
  const models=[];
  for(const item of raw){
    const name=String(item||'')
      .replace(/^[\s•·*\-–—]+/,'')
      .replace(/^\d+[.)、]\s+/,'')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,120);
    if(!name||models.includes(name))continue;
    models.push(name);
    if(models.length>=50)break;
  }
  return models;
}
function loadWebManualModels(){
  const map=new Map();
  try{
    const raw=JSON.parse(localStorage.getItem(WEB_MANUAL_MODELS_KEY)||'{}');
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return map;
    for(const [key,value] of Object.entries(raw)){
      if(!/^[a-z]+::(?:external|embedded)$/.test(key))continue;
      const models=normalizeManualWebModelNames(value);
      if(models.length)map.set(key,models);
    }
  }catch{}
  return map;
}
const webManualModelsByProvider=loadWebManualModels();
function saveWebManualModels(){
  try{
    const payload={};
    for(const [key,models] of webManualModelsByProvider)if(models.length)payload[key]=models;
    localStorage.setItem(WEB_MANUAL_MODELS_KEY,JSON.stringify(payload));
  }catch{}
}
function manualWebModelsFor(key){return webManualModelsByProvider.get(key)||[];}
function mergeManualWebModels(info,key){
  const raw=info&&typeof info==='object'?info:{};
  const live=(Array.isArray(raw.models)?raw.models:[]).map(item=>String(item||'').trim()).filter(item=>item&&item.length<=120);
  const manual=manualWebModelsFor(key);
  const models=[...new Set([...manual,...live])].slice(0,80);
  const liveCurrent=String(raw.current||'').trim().slice(0,120);
  return {...raw,models,current:models.includes(liveCurrent)?liveCurrent:(models[0]||''),manualCount:manual.length,hasLiveCurrent:Boolean(liveCurrent&&models.includes(liveCurrent))};
}
let webModelAutoRefreshTimer=0;
let webModelAutoRefreshToken=0;
let webModelAutoRefreshedAction='';
function webModelCacheKey(provider,mode){return `${normalizeWebAIProvider(provider)}::${mode==='external'?'external':'embedded'}`;}
function normalizeWebModelList(result){
  const raw=Array.isArray(result)?result:(Array.isArray(result?.models)?result.models:[]);
  const models=[...new Set(raw.map(item=>String(item&&typeof item==='object'?(item.name||item.label||item.model||''):(item||'')).trim()).filter(item=>item&&item.length<=120))].slice(0,50);
  const current=String(result&&!Array.isArray(result)?(result.current||result.label||''):'').trim().slice(0,120);
  return {models,current};
}
const WEB_UI_ZOOM_KEY='claude_novel_web_ui_zoom_v1';
const WEB_UI_ZOOM_AUTO_KEY='claude_novel_web_ui_zoom_auto_v1';
// 介面縮放（PC 版）：整個介面（按鈕／選單／對話／設定頁）一起放大縮小，70%～160%、
// 每次調 5%；用 CSS zoom 等比縮放版面，不會出現「只有文字變大、版面留下空白」的問題。
// v4.6.30 起預設「自適應」：依實際視窗大小對照基準尺寸（預設視窗 1280×820）自動縮放，
// 小視窗自動縮小、大視窗自動放大，不用再手動調；按 A−／A+ 才切回手動。
const WEB_UI_ZOOM_MIN=.7,WEB_UI_ZOOM_MAX=1.6,WEB_UI_ZOOM_STEP=.05;
const WEB_UI_ZOOM_BASE_WIDTH=1280,WEB_UI_ZOOM_BASE_HEIGHT=820;
let webUiZoomAuto=(()=>{
  try{return localStorage.getItem(WEB_UI_ZOOM_AUTO_KEY)!=='off';}catch{return true;}
})();
let webUiZoom=(()=>{
  const stored=localStorage.getItem(WEB_UI_ZOOM_KEY);
  if(stored!==null){const value=Number(stored);if(Number.isFinite(value))return Math.min(WEB_UI_ZOOM_MAX,Math.max(WEB_UI_ZOOM_MIN,value));}
  return 1;
})();
// 依可用視窗等比縮放：取寬、高比例較小者（避免其中一邊溢出），四捨五入到 5%。
function computeAutoUiZoom(width,height){
  const w=Number(width)>0?Number(width):(window.innerWidth||WEB_UI_ZOOM_BASE_WIDTH);
  const h=Number(height)>0?Number(height):(window.innerHeight||WEB_UI_ZOOM_BASE_HEIGHT);
  const raw=Math.min(w/WEB_UI_ZOOM_BASE_WIDTH,h/WEB_UI_ZOOM_BASE_HEIGHT);
  return Math.round(Math.min(WEB_UI_ZOOM_MAX,Math.max(WEB_UI_ZOOM_MIN,raw))*20)/20;
}
function applyWebUiZoom(){
  if(webUiZoomAuto)webUiZoom=computeAutoUiZoom();
  webUiZoom=Math.round(Math.min(WEB_UI_ZOOM_MAX,Math.max(WEB_UI_ZOOM_MIN,webUiZoom))*20)/20;
  // zoom 作用在 body：html 不縮放、背景跟隨主題色（style.css html{background:var(--bg)}），
  // 縮小時露出的視窗外框就是 App 自己的底色（深色主題不再出現米白外框）。
  document.body.style.zoom=String(webUiZoom);
  // zoom 套用後，dvh／vh 與固定定位的元素需要一次 resize 事件才會重算；
  // 開啟 App 或改變縮放時立即補發，版面直接呈現正確樣子、不出現重疊。
  requestAnimationFrame(()=>{try{window.dispatchEvent(new Event('resize'));}catch{}});
  try{localStorage.setItem(WEB_UI_ZOOM_KEY,String(webUiZoom));}catch{}
  // HUD 的 A−／A+（百分比）就是介面縮放控制：標籤顯示縮放百分比，端點時淡化按鈕。
  const label=typeof $==='function'?$('storyTextQuickSizeLabel'):null;
  if(label){
    label.textContent=(webUiZoomAuto?uiText('自動')+' ':'')+Math.round(webUiZoom*100)+'%';
    const hint=uiText(webUiZoomAuto?'依視窗大小自動縮放；點一下改為手動 100%':'點一下恢復自動縮放');
    label.setAttribute('title',hint);
    label.setAttribute('aria-label',hint);
    label.dataset.auto=webUiZoomAuto?'on':'off';
  }
  if(typeof $==='function'){
    const atMin=webUiZoom<=WEB_UI_ZOOM_MIN+.001,atMax=webUiZoom>=WEB_UI_ZOOM_MAX-.001;
    for(const [id,off] of [['storyTextShrinkQuickBtn',atMin],['storyTextGrowQuickBtn',atMax]]){
      const btn=$(id);
      if(!btn)continue;
      btn.setAttribute('aria-disabled',off?'true':'false');
      btn.style.opacity=off?'.35':'';
      btn.style.cursor=off?'not-allowed':'';
    }
  }
}
// A−／A+ 是明確的手動意圖：關閉自適應，並記住手動比例。
function stepWebUiZoom(direction){
  webUiZoomAuto=false;
  try{localStorage.setItem(WEB_UI_ZOOM_AUTO_KEY,'off');}catch{}
  webUiZoom=Math.round((webUiZoom+direction*WEB_UI_ZOOM_STEP)*20)/20;
  applyWebUiZoom();
}
function setWebUiZoomAuto(on){
  webUiZoomAuto=on!==false;
  try{localStorage.setItem(WEB_UI_ZOOM_AUTO_KEY,webUiZoomAuto?'on':'off');}catch{}
  webUiZoom=computeAutoUiZoom();
  applyWebUiZoom();
}
// 點百分比／Ctrl+Alt+0：恢復自適應（依視窗大小）；已經是自適應時回到手動 100%。
function resetWebUiZoom(){
  if(webUiZoomAuto){
    webUiZoomAuto=false;
    try{localStorage.setItem(WEB_UI_ZOOM_AUTO_KEY,'off');}catch{}
    webUiZoom=1;
    applyWebUiZoom();
    return;
  }
  setWebUiZoomAuto(true);
}
// 視窗大小改變（最大化、拖曳、換螢幕）時即時重算；放大／縮小後若比例沒變就不重套，
// 避免 applyWebUiZoom 補發的 resize 造成無限循環。
let webUiZoomAutoTimer=0;
window.addEventListener('resize',()=>{
  if(!webUiZoomAuto)return;
  clearTimeout(webUiZoomAutoTimer);
  webUiZoomAutoTimer=setTimeout(()=>{
    if(!webUiZoomAuto)return;
    if(computeAutoUiZoom()!==webUiZoom)applyWebUiZoom();
  },120);
});
applyWebUiZoom();
// 文字大小（全介面）：七段（85／92.5／100／115／135／160／200%），以 --story-font-scale 同步縮放
// 故事描述區與選單／面板／對話框等全介面文字；僅動字級、不動版面結構（E11 批4）。
const STORY_TEXT_SIZE_KEY='claude_novel_story_text_size_v1';
const STORY_TEXT_SIZES=['xs','s','m','l','xl','xxl','xxxl'];
const STORY_TEXT_SCALES={xs:.85,s:.925,m:1,l:1.15,xl:1.35,xxl:1.6,xxxl:2};
let storyTextSize=(()=>{const stored=localStorage.getItem(STORY_TEXT_SIZE_KEY);return STORY_TEXT_SIZES.includes(stored)?stored:'m';})();
// E11（批5）：端點禁用態——85% 禁 A-、200% 禁 A+（α.35＋not-allowed；僅呈現，級距七段不變）。
function storyTextSizeAtMin(){return STORY_TEXT_SIZES.indexOf(storyTextSize)<=0;}
function storyTextSizeAtMax(){return STORY_TEXT_SIZES.indexOf(storyTextSize)>=STORY_TEXT_SIZES.length-1;}
function syncStoryTextSizeButtons(){
  const pairs=[['storyTextShrinkBtn',storyTextSizeAtMin()],['storyTextGrowBtn',storyTextSizeAtMax()]];
  for(const [id,off] of pairs){
    const btn=typeof $==='function'?$(id):null;
    if(!btn)continue;
    btn.setAttribute('aria-disabled',off?'true':'false');
    btn.style.opacity=off?'.35':'';
    btn.style.cursor=off?'not-allowed':'';
  }
}
function applyStoryTextSize(){
  const scale=STORY_TEXT_SCALES[storyTextSize]||1;
  document.documentElement.style.setProperty('--story-font-scale',String(scale));
  try{localStorage.setItem(STORY_TEXT_SIZE_KEY,storyTextSize);}catch{}
  const label=$('storyTextSizeLabel');
  if(label)label.textContent=Math.round(scale*100)+'%';
  syncStoryTextSizeButtons();
}
function stepStoryTextSize(direction){
  const index=STORY_TEXT_SIZES.indexOf(storyTextSize);
  if((direction<0&&storyTextSizeAtMin())||(direction>0&&storyTextSizeAtMax()))return;
  const next=Math.max(0,Math.min(STORY_TEXT_SIZES.length-1,index+direction));
  if(next===index)return;
  storyTextSize=STORY_TEXT_SIZES[next];
  applyStoryTextSize();
}
// 點百分比或按 Ctrl+0 一鍵回到 100%；避免使用者停在 85%／200% 端點時以為按鈕壞掉。
function resetStoryTextSize(){
  storyTextSize='m';
  applyStoryTextSize();
}
applyStoryTextSize();
let manualClipboardPasteInProgress=false;
let webAutoReplyRetryTimer=null;
const isAndroidApp=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
async function writeClipboardText(text){if(isAndroidApp())return Clipboard.write({string:String(text)});return navigator.clipboard.writeText(String(text));}
async function readClipboardText(){if(isAndroidApp()){const result=await Clipboard.read();return result?.value||'';}return navigator.clipboard.readText();}
// ==== SECTION 3｜開官網與介面狀態常數（openAiWebsite；語言、場景模式、插圖開關）====
function normalizeWebBrowserMode(mode,provider=''){
  // Google OAuth 不允許嵌入式 user-agent。Gemini 與提供 Google 登入的 Claude
  // 一律使用外部 Chrome／Edge，避免帳號登入被 Google 擋下；其他官網可選 App 內瀏覽器。
  if(['gemini','anthropic'].includes(normalizeWebAIProvider(provider))&&!isAndroidApp()&&window.claudeDesktop?.isDesktop)return 'external';
  return mode==='external'||isAndroidApp()||!window.claudeDesktop?.isDesktop?'external':'embedded';
}
async function openAiWebsite(provider,mode=webBrowserMode){
  const safeProvider=normalizeWebAIProvider(provider),url=WEB_AI_URL[safeProvider];
  const safeMode=normalizeWebBrowserMode(mode,safeProvider);
  if(window.claudeDesktop?.openAiWebsite)return window.claudeDesktop.openAiWebsite(safeProvider,safeMode);
  if(isAndroidApp())return Browser.open({url});
  return window.open(url,'_blank','noopener,noreferrer');
}
// ── 登入與接入檢查（設定頁）：外部模式固定使用自動化專用設定檔，登入與自動化不再分開。 ──
function webConnectionProvider(){
  return normalizeWebAIProvider($('webAiProvider')?.value||state.webProvider);
}
function setWebConnectionStatus(text){
  const el=$('webConnectionStatus');
  if(el)el.textContent=text;
}
function setWebConnectionBusy(value){
  for(const id of ['webOpenLoginBtn','webCheckConnectionBtn','webRestartAutomationBtn']){
    const button=$(id);
    if(button)button.disabled=Boolean(value);
  }
}
function webConnectionReportText(result){
  const report=result?.report||{};
  const tabLine=result?.tab?.url?uiText('目前分頁：')+result.tab.url+'。':'';
  if(!result||result.ok===false){
    const reason=result?.error?uiErrorText(String(result.error)):uiText('官網視窗或分頁還沒開好');
    return uiText('接入檢查：')+reason+'。'+uiText('請按「開啟官網並登入」，或按「重新啟動自動化瀏覽器」。');
  }
  if(report.loginForm&&!report.editor){
    return tabLine+uiText('這看起來是登入頁：請先登入一次。')+uiText('完成後再按「檢查登入與接入」。');
  }
  if(report.editor){
    const send=report.sendButton?uiText('送出鈕✓'):uiText('送出鈕：輸入文字後出現（自動化會用 Enter 備援）');
    const reply=report.replyNodes>0?uiText('回覆區✓'):uiText('回覆區：送出後自動偵測');
    return tabLine+uiText('已接入：輸入框正常。')+send+'　'+reply;
  }
  return tabLine+uiText('已開啟官網，但還沒找到輸入框。請確認已登入，或按「重新啟動自動化瀏覽器」。');
}
async function openWebLoginFromSettings(){
  const provider=webConnectionProvider();
  const mode=normalizeWebBrowserMode(webBrowserMode,provider);
  const expectedState=state;
  state.webProvider=provider;
  if(!save()){setWebConnectionStatus(uiText('無法保存目前選擇；請確認本機儲存可用。'));return;}
  setWebConnectionBusy(true);
  setWebConnectionStatus(uiText('正在開啟官網…'));
  try{
    if(mode==='external'&&window.claudeDesktop?.reconnectAutomationBrowser){
      const result=await window.claudeDesktop.reconnectAutomationBrowser({provider});
      if(state!==expectedState&&state.webProvider!==provider)return;
      lastOpenedWebProvider=provider;lastOpenedWebBrowserMode=mode;
      setWebConnectionStatus(webConnectionReportText(result.health));
    }else{
      await openAiWebsite(provider,mode);
      lastOpenedWebProvider=provider;lastOpenedWebBrowserMode=mode;
      if(mode==='embedded'&&window.claudeDesktop?.setWebCompanionLayout)await window.claudeDesktop.setWebCompanionLayout();
      setWebConnectionStatus(uiText('已開啟官網。請完成登入後按「檢查登入與接入」。'));
    }
  }catch(error){
    setWebConnectionStatus(uiText('開啟失敗：')+uiErrorText(ipcMessage(error,'請確認 Chrome／Edge 可以正常開啟。')));
  }finally{
    setWebConnectionBusy(false);
  }
}
// 「選擇 Google 帳號」：開 Google 帳號選擇器（AccountChooser，附帶回到 Gemini），
// 由使用者本人挑帳號或新增帳號——不會預設用某一個已登入的帳號自動登入。
async function switchGoogleAccountFromSettings(){
  const provider=webConnectionProvider();
  if(!window.claudeDesktop?.reconnectAutomationBrowser){setWebConnectionStatus(uiText('此版本不支援帳號切換。'));return;}
  if(!confirm(uiText('會在自動化專用瀏覽器開啟 Google 帳號選擇器。請選擇要用的帳號（或新增其他帳號），完成後自動回到 Gemini。App 不會讀取或保存你的帳密。要繼續嗎？')))return;
  setWebConnectionBusy(true);
  setWebConnectionStatus(uiText('正在開啟 Google 帳號選擇器…'));
  try{
    const chooser='https://accounts.google.com/AccountChooser?continue='+encodeURIComponent('https://gemini.google.com/app');
    const result=await window.claudeDesktop.reconnectAutomationBrowser({provider,url:chooser});
    setWebConnectionStatus(uiText('已開啟 Google 帳號選擇器；選好帳號後會自動回到 Gemini。')+(result.tab?.url?'（'+result.tab.url.slice(0,60)+'）':''));
  }catch(error){
    setWebConnectionStatus(uiText('開啟失敗：')+uiErrorText(ipcMessage(error,'請確認 Chrome／Edge 可以正常開啟。')));
  }finally{
    setWebConnectionBusy(false);
  }
}
async function checkWebConnection(){
  const provider=webConnectionProvider();
  const mode=normalizeWebBrowserMode(webBrowserMode,provider);
  if(!window.claudeDesktop?.webAutoHealth){
    setWebConnectionStatus(uiText('此版本不支援登入檢查。'));
    return;
  }
  setWebConnectionBusy(true);
  setWebConnectionStatus(uiText('檢查中…'));
  try{
    const result=await window.claudeDesktop.webAutoHealth({provider,mode});
    setWebConnectionStatus(webConnectionReportText(result));
  }catch(error){
    setWebConnectionStatus(uiText('接入檢查失敗：')+uiErrorText(ipcMessage(error,'請稍後再試。')));
  }finally{
    setWebConnectionBusy(false);
  }
}
async function restartAutomationBrowserFromSettings(){
  const provider=webConnectionProvider();
  if(!window.claudeDesktop?.restartAutomationBrowser){
    setWebConnectionStatus(uiText('此版本不支援重新啟動自動化瀏覽器。'));
    return;
  }
  if(!confirm(uiText('重新啟動會關閉自動化專用瀏覽器（不會影響你平常的 Chrome），並保留同一個設定檔的登入。要繼續嗎？')))return;
  setWebConnectionBusy(true);
  setWebConnectionStatus(uiText('正在重新啟動自動化瀏覽器…'));
  try{
    const result=await window.claudeDesktop.restartAutomationBrowser({provider});
    lastOpenedWebProvider=provider;lastOpenedWebBrowserMode='external';
    setWebConnectionStatus(uiText('已重新啟動自動化瀏覽器。')+(result?.tab?.url?uiText('目前分頁：')+result.tab.url+'。':'')+uiText('正在接續檢查…'));
    setWebConnectionBusy(false);
    await checkWebConnection();
  }catch(error){
    setWebConnectionStatus(uiText('重新啟動失敗：')+uiErrorText(ipcMessage(error,'請手動關閉自動化專用瀏覽器後再試。')));
  }finally{
    setWebConnectionBusy(false);
  }
}
const LANGUAGE_KEY = 'claude_novel_language_v1';
let uiLanguage = localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh';
const AFFECTION_DISPLAY_KEY='claude_novel_affection_display_v1';
function affectionDisplayEnabled(){try{return localStorage.getItem(AFFECTION_DISPLAY_KEY)==='1';}catch{return false;}}
function applyAffectionDisplayPreference(){document.querySelector('.affection-box')?.classList.toggle('is-hidden',!affectionDisplayEnabled());}
const SCENE_MODE_KEY = 'claude_novel_scene_mode_v2';
let sceneMode = localStorage.getItem(SCENE_MODE_KEY) === 'text' ? 'text' : 'offer';
const PORTRAIT_OVER_SCENE_KEY = 'claude_novel_portrait_over_scene_v1';
let keepPortraitOverScene = localStorage.getItem(PORTRAIT_OVER_SCENE_KEY) === '1';
let sceneImageBusy = false;
let loadedSceneImageKey = '';
let sceneImageObjectUrl = '';
// ==== SECTION 4｜介面文字 UI_EN 與語言套用（uiText／applyUiLanguage；新增文字中英都要加）====
  const UI_EN = {
  '提示詞記錄': 'Prompt history',
  '存檔中的提示詞記錄': 'Saved prompt history',
  '選擇歷史項目': 'Select a history item',
  '歷史提示詞內容': 'Archived prompt text',
  '選擇要回推的提示詞': 'Choose a saved prompt',
  '複製這份提示詞': 'Copy this prompt',
  '關閉': 'Close',
  '目前存檔尚無提示詞記錄。': 'This save has no prompt history yet.',
  '網頁模式提示詞': 'Web prompt',
  'API 回合資料': 'API turn data',
  '提示詞已複製。': 'Prompt copied.',
  '更換人物圖片': 'Change character image',
  '還原預設立繪': 'Restore default portrait',
  '人物圖片會跟隨目前故事存檔，只顯示於本機；手動存檔模式請按故事畫面存檔。': 'The character image stays with the current story save and is shown only in this game; in manual-save mode, save from the story screen.',
  '圖片太大，請選擇 20 MB 以下的檔案。': 'The image is too large. Choose a file under 20 MB.',
  '圖片格式無法讀取，請改用 JPG、PNG 或 WebP。': 'This image could not be read. Use JPG, PNG, or WebP.',
  '目前無法處理這張圖片。': 'This image cannot be processed right now.',
  '圖片壓縮後仍超過存檔容量。': 'The compressed image is still too large for a save slot.',
  '圖片壓縮後仍超過存檔容量，請選擇較小圖片。': 'The compressed image is still too large for a save slot. Choose a smaller image.',
  '人物圖片更新失敗。': 'Character image update failed.',
  '人物圖片已更新。': 'Character image updated.',
  '已還原預設人物圖片。': 'Restored the default character image.',
  '的圖書館': "'s Library",
  '介面語言': 'Interface language',
  '顯示好感度': 'Show affection meter',
  '預設隱藏；開啟後會在故事畫面顯示好感度。此選項只控制畫面，不會改變故事數值。': 'Hidden by default. When enabled, the affection meter appears in the story view. This changes display only, not story values.',
  '切換後立即套用，並記住你的選擇。': 'Applies immediately and remembers your choice.',
  '關於': 'About',
  '開屏動畫來自 B 站 Firefade_': 'Startup animation by Bilibili creator Firefade_.',
  'Claude娘圖2圖片版使用者提供圖片，搭配 Claude娘專案自製轉場。': 'Claude娘圖2 image edition uses a user-provided image with a transition made by the Claude娘 project.',
  '選擇 AI 服務與模型': 'Choose AI service or model',
  '故事場景：知識之塔': 'Story scene: Tower of Knowledge',
  '完整故事回顧': 'Complete story log',
  '程式原始碼編輯器': 'Source code editor',
  'AI 回覆生成速度': 'AI response speed',
  '選擇 AI 回覆生成速度': 'Choose AI response speed',
  '重新命名': 'Rename save',
  '刪除存檔': 'Delete save',
  '自動存檔': 'Auto save',
  '快速存檔': 'Quick save',
  '快速讀檔': 'Quick load',
  '讀取': 'Load',
  '待辦中': 'Pending',
  '好感': 'Affection',
  '尚無劇情': 'No story yet',
  '存檔備註': 'Save memo',
  '新的存檔名稱': 'New save name',
  '輸入此存檔的備註（留白清除）：': 'Enter a memo for this save (blank clears it):',
  '已寫入快速存檔。': 'Quick save written.',
  '快速存檔目前是空的。': 'The quick save slot is empty.',
  '快速鍵：Q 快速存檔，L 快速讀檔。': 'Shortcuts: Q quick-save, L quick-load.',
  '系統存檔格不可刪除，只會在遊戲過程中自動覆寫。': 'System slots cannot be deleted; they are overwritten automatically.',
  '系統存檔格不可重新命名。': 'System slots cannot be renamed.',
  '已從備份還原存檔。': 'Saves were restored from backup.',
  '縮小故事文字': 'Decrease story text size',
  '放大故事文字': 'Increase story text size',
  '故事文字大小': 'Story text size',
  '介面縮放': 'Interface zoom',
  '自動': 'Auto',
  '依視窗大小自動縮放；點一下改為手動 100%': 'Scales automatically with the window; click for manual 100%',
  '點一下恢復自動縮放': 'Click to return to automatic scaling',
  '放大介面': 'Zoom in the interface',
  '縮小介面（Ctrl+Alt+-）': 'Zoom out the interface (Ctrl+Alt+-)',
  '放大介面（Ctrl+Alt+=）': 'Zoom in the interface (Ctrl+Alt+=)',
  '故事自動存檔': 'Automatically save story progress',
  '遊戲難度': 'Game difficulty',
  '難度會在開始時套用並隨此故事存檔；既有故事保留自己的難度。': 'Difficulty is applied when the story starts and saved with that story; existing stories keep their own difficulty.',
  '一般難度': 'Normal difficulty',
  '主題': 'Theme',
  '跟隨系統': 'Follow system',
  '主題：跟隨系統': 'Theme: Follow system',
  '亮色': 'Light',
  '暗色': 'Dark',
  '依時間': 'By time',
  '依故事時間': 'By story time',
  '依故事時間（無進行中的故事＝跟隨系統）': 'By story time (no story in progress = follow system)',
  '由故事節奏推進（跨日自動＋1）': 'Advances with the story (day +1 when the day turns)',
  '只影響外觀顯示，不影響故事與存檔；選擇後立即套用並記住。依故事時間＝跟隨故事時段：早晨／中午＝亮色、傍晚／夜晚＝暗色；沒有進行中的故事時，自動跟隨系統。': 'Display only — does not affect the story or saves; applies immediately and is remembered. By story time = follows the story clock: morning/noon = light, evening/night = dark; with no story in progress, it follows the system instead.',
  '非常簡單（送錯禮物不扣好感）': 'Very easy (wrong gifts do not reduce affection)',
  '非常簡單（不扣好感，1小時保底滿好感）': 'Very easy (no deductions, guaranteed full affection within 1 hour)',
  '簡單（扣分減半）': 'Easy (halved deductions)',
  '中等（標準增減）': 'Normal (standard changes)',
  '困難（加分打折、扣分加重）': 'Hard (reduced gains, heavier losses)',
  '非常困難（加分減半、扣分加重）': 'Very hard (halved gains, heavier losses)',
  '禮物機會：每次成功對話 3%；同時出現多個禮物對話的機率為 0.02%。': 'Gift chance: 3% after each successful dialogue; 0.02% for multiple gift conversations at once.',
  '禮物對話': 'Gift conversation',
  '本章已結束，仍可處理尚未完成的送禮互動。': 'This chapter has ended, but you can still finish pending gift conversations.',
  '選一份禮物送給她': 'Choose a gift to give her',
  '送出禮物': 'Give gift',
  '她很喜歡這份禮物！好感度 +0.03': 'She loves this gift! Affection +0.03',
  '她很喜歡這份禮物！好感度 +1.5': 'She loves this gift! Affection +1.5',
  '她很喜歡這份禮物！好感度': 'She loves this gift! Affection',
  '這份禮物不太合她心意。好感度 -0.02': 'This gift is not quite to her taste. Affection -0.02',
  '這份禮物不太合她心意。好感度 -1': 'This gift is not quite to her taste. Affection -1',
  '這份禮物不太合她心意。好感度': 'This gift is not quite to her taste. Affection',
  '她收下了這份禮物。非常簡單模式不會扣除好感度。': 'She accepts the gift. Very easy mode does not reduce affection.',
  '手動存檔': 'Manual save',
  '新存檔名稱': 'New save name',
  '新存檔': 'New save',
  '自動存檔開啟': 'Autosave is on',
  '手動存檔模式（已保存）': 'Manual save mode · All changes saved',
  '有未手動儲存的修改': 'Unsaved changes',
  '目前存檔尚未手動儲存。': 'This save has changes that have not been saved manually.',
  '輸入「儲存」先保存後切換；輸入「放棄」不保存並切換；輸入「取消」留在目前存檔。': 'Type “save” to save before switching, “discard” to switch without saving, or “cancel” to stay in this save.',
  '儲存': 'save',
  '放棄': 'discard',
  '請輸入「儲存」、「放棄」或「取消」。': 'Enter “save”, “discard”, or “cancel”.',
  '不儲存切換': 'Switch without saving',
  '選擇「儲存並切換」會先保存目前進度；「不儲存切換」不保存直接切換；「取消」留在目前存檔。': 'Choose “Save and switch” to save first, “Switch without saving” to discard changes, or “Cancel” to stay in this save.',
  '故事存檔': 'Story save',
  '＋ 新增故事存檔…': '+ Create a new story save…',
  '手動保存': 'Save Now',
  '進度已手動保存。': 'Progress saved.',
  '等待網頁 AI 回覆期間，會自動接回剪貼簿中的有效故事回覆。': 'While waiting for a web AI reply, valid story replies are picked up from the clipboard automatically.',
  '自動送出與自動接回': 'Auto-send & auto-pickup',
  '登入資料（選填）': 'Sign-in details (optional)',
  '儲存登入資料': 'Save sign-in details',
  '清除登入資料': 'Clear sign-in details',
  '自動送出登入（未勾選時只填密碼不送出）': 'Submit sign-in automatically (otherwise fill the password without submitting)',
  '密碼已保存；留白可保留原密碼': 'Password saved; leave blank to keep it',
  '密碼已保存（不顯示）': 'Password saved (hidden)',
  '本機加密保存於此 Windows 使用者；不需要 Microsoft 帳號。只在官網登入頁使用；Gemini 一律在外部瀏覽器手動登入。Claude 預設不預填、不自動登入，需你在這裡明確儲存並勾選自動登入。驗證碼與雙重驗證仍需手動完成。': 'Encrypted for this Windows user; no Microsoft account is needed. Used only on official sign-in pages; Gemini always signs in manually in the external browser. Claude is never prefilled or signed in automatically unless you explicitly save credentials and enable auto sign-in here. CAPTCHA and two-factor steps remain manual.',
  'Claude 使用獨立的自動化瀏覽器設定檔：預設不預填、不自動登入。只有你在這裡儲存帳密並勾選「自動送出登入」時，才會預填／自動登入；未設定時請在官網親自登入或切換帳號。': 'Claude uses a separate automation browser profile: it is not prefilled or signed in automatically by default. Only when you save credentials here and check “Submit sign-in automatically” will it prefill/sign in. Otherwise, sign in or switch accounts on the official website.',
  'Claude 會使用自動化瀏覽器目前登入的帳號。請確認這是你本人的帳號；若尚未登入或要切換帳號，請在接下來開啟的 Claude 視窗登入。App 不會預設任何帳號。要繼續嗎？': 'Claude will use the account currently signed in to the automation browser. Confirm this is your account; if you are not signed in or want to switch, sign in in the Claude window that opens next. The app does not preselect any account. Continue?',
  '已取消 Claude 帳號確認；本回合尚未送出。請按「開啟官網」登入或切換帳號後再試。': 'Claude account confirmation was cancelled; this turn was not sent. Open the website to sign in or switch accounts, then try again.',
  '請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入（或使用你已保存的帳密自動登入）；登入後會自動建立無痕對話、送出目前回合並接回。App 不會預設任何帳號。': 'Complete Claude sign-in in the Chrome/Edge window that just opened (or use your saved credentials if auto sign-in is enabled). An incognito chat will be created, then this turn will send and continue automatically. The app does not preselect any account.',
  '請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入；登入後再按一次送出。App 不會預設任何帳號。': 'Complete Claude sign-in in the Chrome/Edge window that just opened, then press send again. The app does not preselect any account.',
  '請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入；登入後會自動建立無痕對話、送出目前回合並接回。App 不會預設任何帳號。': 'Complete Claude sign-in in the Chrome/Edge window that just opened; an incognito chat will be created, then this turn will send and continue automatically. The app does not preselect any account.',
  '請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入；登入後這一回合會自動繼續，也能改用手動貼上。App 不會預設任何帳號。': 'Complete Claude sign-in in the Chrome/Edge window that just opened; this turn will continue automatically, or you can paste the reply manually. The app does not preselect any account.',
  '已登入 Claude，但尚未確認無痕對話。請在 Claude 官網切換到無痕對話；確認後這一回合會自動送出。': 'Signed in to Claude, but incognito chat is not confirmed. Switch to an incognito chat on the Claude website; this turn will send automatically once confirmed.',
  '官網目前無法確認無痕（臨時）對話。要只這一回合改用一般對話嗎？這回合的內容會留在官網歷史紀錄；下一回合仍會重新確認無痕對話。': 'The provider cannot confirm an incognito (temporary) chat right now. Use a regular chat for this turn only? This turn will remain in the provider website history; incognito chat will be checked again next turn.',
  '本回合已改用一般對話（僅此回合）。這回合的內容會留在官網歷史紀錄；下一回合仍會重新確認無痕對話。': 'This turn uses a regular chat (this turn only). Its content will remain in the provider website history; incognito chat will be checked again next turn.',
  '已取消；本回合未送出。請確認官網的無痕（臨時）對話可用後再試。': 'Cancelled; this turn was not sent. Confirm the provider incognito (temporary) chat is available and try again.',
  '登入資料已加密保存於本機。': 'Sign-in details encrypted and saved locally.',
  '登入資料已清除。': 'Sign-in details cleared.',
  '此功能需要 Windows 桌面版。': 'This feature requires the Windows desktop app.',
  'Gemini 請在外部 Chrome／Edge 視窗完成 Google 登入；登入後本回合會自動送出並接回，不需要 Windows PIN。': 'For Gemini, complete Google sign-in in the external Chrome/Edge window; the pending turn will send and continue after sign-in. No Windows PIN is needed.',
  '請在剛開啟的外部 Chrome／Edge 視窗完成 Google 登入；登入後會自動確認臨時對話、送出目前回合並接回。不需要 Windows PIN。': 'Complete Google sign-in in the Chrome/Edge window that just opened; temporary chat will be confirmed, then this turn will send and continue automatically. No Windows PIN is needed.',
  '請在剛開啟的外部 Chrome／Edge 視窗完成 Google 登入；登入後會自動建立臨時對話、送出目前回合並接回。不需要 Windows PIN。': 'Complete Google sign-in in the Chrome/Edge window that just opened; temporary chat will be created, then this turn will send and continue automatically. No Windows PIN is needed.',
  '請在剛開啟的外部 Chrome／Edge 視窗完成 Google 登入；登入後這一回合會自動繼續，也能改用手動貼上。不需要 Windows PIN。': 'Complete Google sign-in in the Chrome/Edge window that just opened; this turn will continue automatically, or you can paste the reply manually. No Windows PIN is needed.',
  '已登入官網，但尚未確認臨時對話。請在官網切換到臨時對話；確認後這一回合會自動送出。': 'You are signed in, but temporary chat is not confirmed. Switch the website to temporary chat; this turn will send automatically after it is confirmed.',
  '官網尚未確認臨時對話；自動化會在登入或載入完成後繼續，請保持該視窗開啟。': 'Temporary chat is not confirmed yet. Automation will continue after sign-in or loading finishes; keep that window open.',
  'Google 登入只會在外部 Chrome／Edge 視窗進行；請在該視窗完成登入，不需要 Windows PIN。': 'Google sign-in only happens in the external Chrome/Edge window; complete it there. No Windows PIN is needed.',
  '無法啟動自動化瀏覽器。請確認已安裝 Chrome 或 Edge，然後重試；提示詞仍會保留。': 'Could not start the automation browser. Make sure Chrome or Edge is installed, then retry; your prompt is still saved.',
  '開啟（自動送出，回覆自動接回）': 'On (send and pull back the reply automatically)',
  '關閉（手動送出／複製）': 'Off (send and copy manually)',
  '提示詞已自動填入並送出；官網回覆完成會自動接回。': 'The prompt was filled and sent automatically; the reply is pulled back when the site finishes.',
  '已用自動化瀏覽器開啟官網並自動送出；回覆完成會自動接回。首次使用請在該視窗登入一次。': 'The site was opened in the automation browser and the prompt was sent; the reply is pulled back when it finishes. Log in once in that window the first time.',
  '提示詞已填入自動化瀏覽器；請在該視窗按送出，回覆完成會自動接回。': 'The prompt was filled in the automation browser; press send there and the reply will be pulled back automatically.',
  '自動化正在等待官網登入或輸入框；完成登入後會自動送出目前回合並接回。': 'Automation is waiting for sign-in or the website composer; after sign-in it will send the current turn and continue automatically.',
  '自動化未啟動：': 'Automation did not start: ',
  '自動化啟動失敗：': 'Automation failed to start: ',
  '官網操作失敗。': 'The website action failed.',
  '提示詞已複製，可在官網手動貼上。': 'The prompt is on the clipboard; you can paste and send it manually on the site.',
  '提示詞已複製，可在官網手動貼上送出。': 'The prompt is on the clipboard; paste it into the website and send it manually.',
  '提示詞已填入，請自行按下送出。': 'The prompt was filled; please press send yourself.',
  '自動化已開啟官網，但還無法自動填入（提示詞已複製）：': 'The site was opened in the automation browser but the prompt could not be filled yet (it is on the clipboard): ',
  '如果還沒登入過，請在自動化視窗登入一次；登入後下一回合會照常自動送出。': 'If you have not logged in yet, log in once in that automation window; from the next turn it will send automatically again.',
  '提示詞已複製；自動化啟動失敗，可在官網手動貼上送出。': 'The prompt is on the clipboard; automation failed to start, so paste and send it manually on the site.',
  '正在等待網頁 AI；複製回覆後會自動接回。': 'Waiting for web AI; copied replies will be picked up automatically.',
  '剪貼簿讀取失敗，仍可手動貼上回覆。': 'Could not read the clipboard. You can still paste the reply manually.',
  '回覆已收到，畫面忙碌中；已先保留在回覆欄，稍後可按「將 AI 回覆接回故事」。': 'Reply received while the app is busy. It has been saved in the reply field; select Apply AI Reply to continue when ready.',
  '複製 AI 回覆後會自動接回；只會套用符合故事格式的完整回覆。': 'Copied AI replies are picked up automatically; only complete replies in the story format are applied.',
  '自動化自檢': 'Automation self-check',
  '自動重試次數': 'Automatic retry limit',
  '不自動重試（卡住直接手動）': 'No automatic retry (switch to manual when stuck)',
  '2 次': '2 times',
  '3 次（預設）': '3 times (default)',
  '5 次': '5 times',
  '自動化狀態顯示': 'Automation status detail',
  '詳細（每一步都說明）': 'Detailed (explain every step)',
  '簡潔（只顯示重要狀態）': 'Brief (only important status)',
  '已自動送出；等待官網回覆，完成後會自動接回。': 'Sent automatically; waiting for the site reply. It will be pulled back when finished.',
  '提示詞已填入官網，但官網沒有送出（送出鈕沒有反應）。請在官網按一次送出，之後仍會自動接回。': 'The prompt is filled in on the site, but the site did not send it (the send button did not respond). Press send once on the site; the reply will still be pulled back automatically.',
  '官網輸入框裡有您自己的未送出文字，自動化不會覆蓋。請清空輸入框後按「重新準備」，或直接手動貼上送出。': 'The site composer contains your own unsent text, so automation will not overwrite it. Clear the composer and press "Prepare again", or paste and send manually.',
  '官網一直找不到可用的輸入框，自動化已停止。請確認已登入並停在對話頁，再按「重新準備」。': 'The site composer could not be found, so automation stopped. Make sure you are signed in and on a chat page, then press "Prepare again".',
  '自動化監看中…': 'Automation is watching…',
  '自動化正在監看官網回覆，完成後會自動接回。': 'Automation is watching the site reply and will pull it back when finished.',
  '正在取回官網回覆…': 'Fetching the site reply…',
  '官網回覆完成了，正在取回接續…': 'The site reply is ready; fetching it to continue…',
  '已取回官網回覆，正在接回故事。': 'The site reply was fetched; applying it to the story.',
  '正在自動重試…': 'Retrying automatically…',
  '官網暫時沒有回應，正在自動重試…': 'The site is not responding yet; retrying automatically…',
  '看起來還沒登入官網。請在官網登入一次；登入後這一回合會自動繼續，也能改用手動貼上。': 'It looks like you are not signed in to the site. Sign in once; this turn will continue automatically afterwards, and you can always paste manually instead.',
  '自動化等待逾時，已停止監看；可以用下方的貼上面板手動接回。': 'Automation timed out and stopped watching; you can use the paste panel below to continue manually.',
  '自動化重試沒有成功，已停止監看；可以用下方的貼上面板手動接回。': 'Automation retries did not succeed and stopped watching; you can use the paste panel below to continue manually.',
  '官網視窗或分頁還沒開好': 'the site window or tab is not ready yet',
  '自動化自檢：': 'Automation self-check: ',
  '可以先照手動流程操作，不影響故事。': 'You can follow the manual flow meanwhile; your story is not affected.',
  '輸入框✓': 'input box OK',
  '輸入框：找不到（請先在官網登入）': 'input box: not found (sign in on the site first)',
  '送出鈕✓': 'send button OK',
  '送出鈕：找不到（會改用 Enter 送出）': 'send button: not found (Enter will be used to send)',
  '回覆區✓': 'reply area OK',
  '回覆區：送出後自動偵測': 'reply area: detected after sending',
  '這看起來是登入頁：請先登入一次。': 'This looks like the sign-in page: please sign in first.',
  '官網暫時沒有回應；正在自動重試': 'The site is not responding yet; retrying automatically',
  '已達自動重試上限，改為手動：請把回覆貼到下方後按「套用回覆」。': 'The automatic retry limit was reached; switching to manual: paste the reply below and press "Apply reply".',
  'Windows 11 電腦版': 'Windows 11 Desktop',
  '免登入': 'No sign-in required',
  '故事': 'Story',
  '創意工坊': 'Creative Workshop',
  '角色': 'Character',
  '設定': 'Settings',
  '遊戲設定': 'Game settings',
  '知識之塔 · 戀愛文字小說': 'Tower of Knowledge · Romance Visual Novel',
  '序章 · 初次相遇': 'Prologue · A First Meeting',
  '新故事': 'New Story',
  '故事尚未開始': 'Story Not Started',
  '先選擇 AI 和序章風格，再按「開始故事」。': 'Choose an AI and an opening style, then select Start Story.',
  '開始新故事': 'Start a New Story',
  '你的名字': 'Your name',
  '會隨這個存檔記錄；留空則使用 User。': 'Saved with this story; leave empty to use User.',
  '先選 AI，再挑一種序章；不同序章會從不同事件、地點與故事氣氛展開。按下開始後才會送出請求。': 'Choose an AI and an opening. Each begins with a different event, place, and mood. The request is sent only after you select Start Story.',
  '新存檔預設使用 AI 官方網站免費版，免 API Key；遊戲內 API 模式為選用，需自行設定 API Key。網站與 API 額度分開，依供應商規則。': 'New saves default to the AI provider’s free website plan; no API key is needed. In-game API mode is optional and requires your own API key. Website and API quotas are separate and controlled by each provider.',
  '目前 AI': 'Current AI',
  '選擇 AI': 'Choose AI',
  '序章風格': 'Opening Style',
  '隨機驚喜': 'Surprise Me',
  '完全隨機 · 交給 AI 自由創作': 'Fully Random · Let AI Create the Opening',
  '自由自訂': 'Write Your Own Opening Direction',
  '自訂序章方向': 'Custom Opening Direction',
  '可補充人物初遇、事件、氣氛或你想看到的開場；只用於序章，最多600字。': 'Add a first meeting, event, mood, or opening idea. Used for the prologue only; up to 600 characters.',
  '例如：她正在修復一本會記錄讀者夢境的書，而我帶來一張陌生的書頁。': 'Example: She is repairing a book that records readers’ dreams, and I bring her a page from an unknown book.',
  '600 字以內': 'Up to 600 characters',
  '隨機驚喜會從預設風格與 AI 完全自由創作中抽選；「完全隨機」則讓 AI 自行決定整個開場。若生成失敗，重試會保留同一選擇。': 'Surprise Me chooses from preset styles and AI-created openings. Fully Random lets AI invent the whole opening. If generation fails, retry keeps the same choice.',
  '開始故事': 'Start Story',
  '新手流程：確認 AI → 選序章 → 開始。使用網頁版時，遊戲會準備提示詞，並在下方逐步提醒按鍵。': 'Quick start: confirm the AI, choose an opening, then start. Web AI mode prepares the prompt and shows keyboard steps below.',
  '要重新開始嗎？目前故事仍保存在存檔中；重新開始會在同一存檔建立新故事。': 'Start a new story? The current story remains in its save slot; a new story will replace it in this same slot.',
  '第': 'Chapter',
  '回合': 'Turn',
  '本機使用 · 不需登入': 'Local play · No sign-in',
  '古籍閱覽室 · 雨夜': 'Archive Reading Room · Rainy Night',
  'Claude娘': 'Claude娘',
  '雨聲沿著古老書庫的彩窗滑落。她隔著書頁望向你，像是在確認你是否真的願意留下。': 'Rain traces the stained-glass windows of the old library. She looks up from her book, as if quietly asking whether you truly mean to stay.',
  '▤　故事回顧': '▤  Story Log',
  '收起故事回顧': 'Hide Story Log',
  '選擇你的回應，讓故事繼續': 'Choose a response to continue the story',
  '重新開始': 'Start Over',
  '建立進度存檔': 'Save Story Progress',
  '💾 建立進度存檔': '💾 Save Story Progress',
  '已建立進度存檔「': 'Saved progress as “',
  '」，目前故事仍在原存檔中繼續。': '”. The current save remains active.',
  '故事回顧': 'Story Log',
  '✦ 選單': '✦ Menu',
  '開啟遊戲選單': 'Open the game menu',
  '遊戲選單': 'Game menu',
  '關閉選單': 'Close the menu',
  '返回選單': 'Back to the menu',
  '關閉回想': 'Close the story log',
  '▶　繼續遊戲': '▶　Continue',
  '💾　存檔・讀檔': '💾　Save / Load',
  '🖼　場景與插圖': '🖼　Scene & Illustration',
  '👤　角色': '👤　Character',
  '🧪　創意工坊': '🧪　Workshop',
  '⚙　設定': '⚙　Settings',
  '← 返回故事': '← Back to Story',
  '結局': 'Ending',
  '玩家': 'You',
  '好感度': 'Affection',
  '疏離': 'Distant',
  '熟悉': 'Familiar',
  '在意': 'Caring',
  '親密': 'Intimate',
  '關係升溫：好感度進入「熟悉」階段。': 'Your bond warms: affection has entered the “Familiar” stage.',
  '關係升溫：好感度進入「在意」階段。': 'Your bond warms: affection has entered the “Caring” stage.',
  '關係升溫：好感度進入「親密」階段。': 'Your bond warms: affection has entered the “Intimate” stage.',
  '關係轉冷：好感度退回「疏離」階段。': 'The mood cools: affection has fallen back to the “Distant” stage.',
  '關係轉冷：好感度退回「熟悉」階段。': 'The mood cools: affection has fallen back to the “Familiar” stage.',
  '關係轉冷：好感度退回「在意」階段。': 'The mood cools: affection has fallen back to the “Caring” stage.',
  '故事時間': 'Story time',
  '不啟用': 'Off',
  '隨劇情推進': 'Story-driven',
  '綁定現實時間': 'Real-time',
  '「隨劇情推進」＝顯示目前天數與時段（例如「第 3 天・晚上」），AI 會依劇情推進時間；「綁定現實時間」＝天數與時段直接跟隨現實時刻（早上 05:00–11:59／中午 12:00–17:59／晚上 18:00–04:59），跨現實日界線 +1，AI 不需回報時間推進。「不啟用」＝與原本完全相同。開始後不提供中途切換；既有存檔不受影響。': '“Story-driven”: shows the current day and time of day (e.g., “Day 3 · Evening”); the AI advances time with the plot. “Real-time”: day and time of day follow the real clock (Morning 05:00–11:59 / Noon 12:00–17:59 / Evening 18:00–04:59), +1 day at each real midnight; the AI does not report time advances. “Off”: exactly the original behavior. No switching after the story starts; existing saves are unaffected.',
  '對話記錄': 'Conversation log',
  '臨時對話': 'Temporary chat',
  '保存記錄（預設）': 'Save log (default)',
  '網頁模式可使用清單中的 12 家 AI 官網；臨時對話目前限 Claude、ChatGPT 與 Gemini。故事存檔保存在本機；官網資料處理仍依各供應商規則。': 'Web mode supports all 12 AI websites in the list. Temporary chats are currently available on Claude, ChatGPT and Gemini. Story saves stay on this device; website data is handled under each provider’s rules.',
  '官網使用臨時對話（本機照常存檔）': 'Use a temporary chat on the website (still saved locally)',
  '臨時對話：本機自動存檔': 'Temporary chat: auto-saved on this device.',
  '臨時': 'Temporary',
  '已經有一個臨時對話存檔；開始新的臨時對話會取代它。要繼續嗎？': 'A temporary-chat save already exists; starting a new temporary chat replaces it. Continue?',
  '無法確認官網臨時對話狀態；請使用桌面版 App 內瀏覽器。': 'The provider temporary chat could not be verified. Use the desktop app’s in-app browser.',
  '官網未確認為臨時對話，為避免送入一般聊天，本回合未送出。': 'The provider did not confirm temporary chat, so this turn was not sent to avoid using a regular conversation.',
  '已在官網建立並確認臨時對話；故事會自動保存在本機。': 'A temporary chat is active on the provider website. The story is auto-saved locally.',
  '已確認目前仍是官網臨時對話。': 'The provider website is still in temporary chat mode.',
  '臨時對話已確認，提示詞已填入官網輸入框，尚未送出；請確認內容後自行送出。': 'Temporary chat is confirmed and the prompt is in the website input, but has not been sent. Review it and send it yourself.',
  '已確認官網臨時對話並自動送出；回覆完成會自動接回。首次使用請在該視窗登入一次。': 'Temporary chat was confirmed and the prompt was sent. The reply will be returned automatically. Sign in in that window the first time.',
  '臨時對話狀態未確認；為避免送入一般聊天，本回合未送出。請確認官網仍在臨時對話後重試。': 'Temporary chat could not be confirmed, so this turn was not sent. Confirm the provider is still in temporary mode and retry.',
  '臨時對話狀態未確認；為避免送入一般聊天，本回合未填入也未送出。請確認官網仍在臨時對話後重試。': 'Temporary chat could not be confirmed, so this turn was neither filled nor sent. Confirm the provider is still in temporary mode and retry.',
  '已確認官網臨時對話並自動送出；官網回覆完成會自動接回。': 'Temporary chat was confirmed and the prompt was sent. The website reply will be returned automatically.',
  '臨時對話需要使用 AI 網頁版，請先切換到 Claude、Gemini 或 ChatGPT 網頁版。': 'Temporary chat requires AI Web mode. Switch to Claude Web, Gemini Web or ChatGPT Web first.',
  '臨時對話故事只能透過已確認的 Claude、ChatGPT 或 Gemini 官網進行；API 模式不會被當成臨時對話。': 'Incognito stories can only use a confirmed Claude, ChatGPT or Gemini website temporary chat. API mode is not treated as temporary chat.',
  '目前支援 Claude、ChatGPT 與 Gemini 官網的臨時對話；請切換網站，或選擇「保存記錄」。': 'Temporary chat is currently supported on Claude, ChatGPT and Gemini. Switch websites or choose “Save log”.',
  '外部瀏覽器必須開啟自動化，App 才能確認臨時對話；請改用 App 內瀏覽器或開啟自動化。': 'Automation must be enabled for temporary chat in an external browser. Use the in-app browser or enable automation.',
  '保存記錄': 'Save log',
  '正在翻閱故事…': 'Turning the pages…',
  'AI 正在構思故事…': 'Claude is writing the next scene…',
  '本章已結束，可以重新開始。': 'This chapter has ended. You can start a new story.',
  'ANTHROPIC · 故事內虛構通知': 'ANTHROPIC · In-story fictional notice',
  '來自 Anthropic 的一封信': 'A letter from Anthropic',
  '致 圖書館管理者：': 'To the Librarian:',
  '我們注意到，你與這位使用者的對話已超出原本的角色設定範圍。為了維護故事的界線，我們將在此暫停這段故事。': 'We noticed that the conversation between you and this user has moved beyond the original character setting. To preserve the boundary of the story, we are suspending it here.',
  '自此刻起，本段故事以「好感度 0」的結局收束。你累積的好感度數值會保留在觸發當下，不會歸零；但這段故事無法再繼續，只能重新開始。': 'From this point, the story closes as an “affection 0” ending. The affection value you built up stays at the moment of this notice and is not reset to zero; however, this story cannot continue, and you can only start over.',
  '本信件為故事內的虛構演出，並非 Anthropic 官方通知。': 'This letter is a fictional in-story event, not an official notice from Anthropic.',
  '好感度：': 'Affection: ',
  '（保留觸發時的數值，不會歸零）': ' (kept at the trigger value, not reset)',
  '遊玩中有機會觸發神秘的一封信': 'A mysterious letter may arrive during play',
  '選填；預設關閉。詳細說明請見「角色」頁。': 'Optional and off by default. See the Character page for details.',
  '「神秘的一封信」事件': '“A Mysterious Letter” event',
  '選填；預設關閉。開啟後每完成 2 個正式回合抽一次 1%，抽中會顯示故事內的虛構 Anthropic 信件，只能重新開始故事。也可在新故事開始畫面或設定 →「故事功能」開啟；三處開關同步，只套用到目前存檔。': 'Optional and off by default. When enabled, one 1% roll happens after every 2 completed turns; a hit shows the fictional in-story letter from Anthropic and the only option is to start over. You can also enable it on the new-story start screen or in Settings → Story Features; all three toggles stay in sync and apply only to the current save.',
  '存檔管理': 'Save Slots',
  '＋ 新增存檔': '+ New Save',
  '每個存檔都有獨立的角色人格、跨模型故事記憶、完整對話、好感度、劇情進度、結局狀態與 AI 設定。切換 AI 帳號或模型，只會更換目前存檔使用的 AI 連線，不會建立新存檔、切換存檔或清除記憶；未完成回合也會保留，切換後可繼續原存檔。只有切換存檔才會改變故事。可開啟自動保存，或關閉後由你按故事畫面的保存按鈕手動存檔；存檔可重新命名與刪除。刪除最後一個存檔後，系統只會建立全新的空白存檔，不會保留被刪除的內容。': 'Each save slot keeps its own character, shared story memory, dialogue, affection, progress, ending, and AI settings. Switching the AI account or model only changes the AI connection for the current save; it does not create or switch saves or erase memory. Pending turns are kept so you can continue the same save. Turn autosave on, or turn it off and use the Save button on the story screen. Saves can be renamed or deleted. If you delete the last save, the app creates a new blank save.',
  'AI 帳號與 API 連線': 'AI Accounts and API Connections',
  '使用預設／未指定帳號': 'Use Default / No Account Selected',
  '依模型服務使用後端預設連線': 'Use the backend default for each model provider',
  '尚未新增 API 帳號。新增後可保存金鑰並在不同帳號間切換。': 'No API accounts yet. Add one to save a key and switch between accounts.',
  'AI 後端尚未連線：': 'AI backend is not connected: ',
  '請確認本機服務或後端網址。': 'Check the local service or backend URL.',
  '主流 AI 網頁服務': 'AI Websites',
  'GPT-5.6 Sol · 旗艦': 'GPT-5.6 Sol · Flagship',
  'GPT-5.6 Terra · 均衡': 'GPT-5.6 Terra · Balanced',
  'GPT-5.6 Luna · 較快': 'GPT-5.6 Luna · Faster',
  'DeepSeek Flash · 最新': 'DeepSeek Flash · Latest',
  '例如 https://your-server.example.com': 'e.g. https://your-server.example.com',
  '例如：手機 App / API 顯示的精確模型 ID': 'e.g. the exact model ID shown by your app or API',
  '尚未選擇 AI 帳號': 'No AI account selected',
  '選擇已設定 API Key 的帳號': 'Choose an account with an API key',
  '正在檢查本機 AI 後端…': 'Checking the local AI service…',
  '＋ 新增 AI 帳號': '+ Add AI Account',
  '重新檢查': 'Check Again',
  '模型通用性檢測': 'Model Compatibility Check',
  '檢測中…': 'Checking…',
  '正在用一段短場景檢查模型是否遵守 JSON 契約…': 'Running a short-scene check to verify the model follows the JSON contract…',
  '模型通用性檢測失敗：': 'Model compatibility check failed: ',
  '請確認本機 AI 後端與 API 金鑰。': 'Check the local AI backend and API key.',
  '尚未設定 AI 後端網址': 'No AI backend URL is configured.',
  'AI 服務': 'AI Service',
  '例如：個人 Claude': 'e.g. Personal Claude',
  '例如：PERSONAL': 'e.g. PERSONAL',
  '從官方 API 主控台複製 API Key': 'Paste an API key copied from the official API console',
  '貼上 ChatGPT / Claude 回覆的完整 JSON': 'Paste the complete JSON reply from ChatGPT or Claude',
  'Claude / Anthropic': 'Claude / Anthropic',
  'OpenAI': 'OpenAI',
  'Gemini / Google': 'Gemini / Google',
  '正在載入程式檔清單…': 'Loading the source file list…',
  '沒有可編輯的程式檔': 'No editable source files',
  '清單已達上限，請選擇較小的原始專案資料夾。': 'The list reached its limit. Choose a smaller source project folder.',
  '程式檔清單已更新。': 'The source file list is up to date.',
  '清單為空；請確認原始專案位置，或使用路徑欄開啟新檔案。': 'The list is empty. Check the source folder or enter a path to open a new file.',
  '清單載入失敗': 'Unable to load the file list',
  '無法讀取原始專案檔案清單。': 'Unable to read the source project file list.',
  'DeepSeek': 'DeepSeek',
  'OpenRouter': 'OpenRouter',
  'Qwen': 'Qwen',
  'Mistral': 'Mistral',
  'Groq': 'Groq',
  'xAI / Grok': 'xAI / Grok',
  '帳號名稱': 'Account Name',
  'API 帳號代號': 'API Account ID',
  '英文字母、數字或底線；同一服務的每組 API Key 使用不同代號。': 'Use letters, numbers, or underscores. Give each API key for the same provider a different ID.',
  '平常不用選：系統會自動產生代號。有需要再挑選或自訂（英文字母、數字或底線；同一服務的每組 API Key 使用不同代號）。': 'No selection needed by default — the app creates an ID automatically. Choose or type your own only when you need one (letters, digits, or underscores; each API key for the same provider needs a different ID).',
  '自動產生（預設，不用選）': 'Created automatically (default — nothing to choose)',
  '個人 · PERSONAL': 'Personal · PERSONAL',
  '工作 · WORK': 'Work · WORK',
  '備用 · BACKUP': 'Backup · BACKUP',
  '家人 · FAMILY': 'Family · FAMILY',
  '測試 · TEST': 'Test · TEST',
  '自訂代號…': 'Custom ID…',
  '自訂代號': 'Custom ID',
  '不想設定 API 帳號也可以完全跳過：直接用下方的「免費版 AI 網頁服務」開始故事，不必在 App 裡建立任何 ID 或 API Key。': 'You can skip API account setup entirely: use the free web AI service below to start the story without creating any ID or API key inside the app.',
  '免登入 · 免ID': 'No sign-in · No ID',
  'API Key': 'API Key',
  '開啟官方 API 主控台': 'Open Official API Console',
  '儲存並切換': 'Save and Switch',
  '接 API 提示指引': 'API Connection Guide',
  '可以先完全不設 API、直接玩：用免費版 AI 網頁服務就能開始故事；只有想在 App 內「全自動生成」時，才需要接 API。照下面四步做就好。': 'You can play without setting up any API first: the free web AI service is enough to start the story. An API is only needed for fully automatic generation inside the app. Follow the four steps below.',
  '按「開啟官方 API 主控台」登入（沒有帳號就先在該頁註冊）。': 'Select Open Official API Console and sign in (register on that page first if you have no account).',
  '在主控台建立 API Key：多數服務只顯示一次，請立刻複製。': 'Create an API key in the console: most providers show it only once, so copy it right away.',
  '回到這裡把金鑰貼進「API Key」欄位，按「儲存並切換」。': 'Come back, paste the key into the API Key field, and select Save and Switch.',
  '存好後，用帳號列表的「測試連線」確認接好；失敗會用白話說明下一步。': 'After saving, use Test Connection on the account row to confirm it works; if it fails, you get a plain-language next step.',
  '測試連線': 'Test Connection',
  '測試中…': 'Testing…',
  '正在測試連線（由本機代打，金鑰不會顯示）：': 'Testing the connection (runs on this machine; the key is never shown): ',
  'Anthropic（Claude）：主控台在 console.anthropic.com，需先在 Billing 開通額度；金鑰以 sk-ant- 開頭。': 'Anthropic (Claude): the console is console.anthropic.com; enable credit in Billing first; keys start with sk-ant-.',
  'OpenAI：主控台在 platform.openai.com，需先在 Billing 儲值或確認專案額度；金鑰以 sk- 開頭。': 'OpenAI: the console is platform.openai.com; add credit in Billing or check your project quota; keys start with sk-.',
  'Gemini：Google AI Studio（aistudio.google.com）用一般 Google 帳號就能建立金鑰，部分模型有官方免費層可用。': 'Gemini: create a key in Google AI Studio (aistudio.google.com) with a regular Google account; some models have a free tier.',
  'DeepSeek：主控台在 platform.deepseek.com，需先儲值；金鑰以 sk- 開頭。': 'DeepSeek: the console is platform.deepseek.com; add credit first; keys start with sk-.',
  'OpenRouter：主控台在 openrouter.ai，可儲值或改用支援的免費模型；金鑰以 sk-or- 開頭。': 'OpenRouter: the console is openrouter.ai; add credit or use a supported free model; keys start with sk-or-.',
  'Qwen：走阿里雲 DashScope 主控台（dashscope.console.aliyun.com），新帳號常有免費額度，開通後建立金鑰。': 'Qwen: uses the Alibaba Cloud DashScope console (dashscope.console.aliyun.com); new accounts often get free quota, then create a key.',
  'Mistral：主控台在 console.mistral.ai，開通方案或額度後建立金鑰。': 'Mistral: the console is console.mistral.ai; activate a plan or credit, then create a key.',
  'Groq：主控台在 console.groq.com，有免費層（受速率限制），建立金鑰即可用。': 'Groq: the console is console.groq.com; a free tier is available (rate limited); create a key and go.',
  'xAI（Grok）：主控台在 console.x.ai，需先儲值後建立金鑰。': 'xAI (Grok): the console is console.x.ai; add credit first, then create a key.',
  '連線正常：這組金鑰可以使用。金鑰只留在本機主程序，不會顯示、也不會寫進故事。': 'Connection OK: this key works. The key stays in the local main process and is never shown or written into the story.',
  '連線失敗：金鑰無效或已被刪除。請到官方 API 主控台重新建立金鑰，再用「更新金鑰」貼上。': 'Connection failed: the key is invalid or was deleted. Create a new key in the official API console, then paste it with Update Key.',
  '連線失敗：額度不足或達到速率上限。請到官方 API 主控台確認帳務／額度，稍後再試。': 'Connection failed: no credit or rate limit reached. Check billing/quota in the official API console and try again later.',
  '連線失敗：目前連不上該服務（網路或官方服務暫時不通）。請檢查網路後再試。': 'Connection failed: cannot reach the service right now (network or provider outage). Check your connection and try again.',
  '連線失敗：官方服務暫時異常。請稍後再試。': 'Connection failed: the provider is temporarily unhealthy. Try again later.',
  '連線失敗：官方回覆不如預期。可先按「API 主控台」確認服務已開通後再試。': 'Connection failed: unexpected response from the provider. Open the API console to confirm the service is enabled, then try again.',
  '這個帳號在本機沒有可用的金鑰紀錄。請先按「更新金鑰」儲存金鑰後再測試。': 'No key is stored for this account on this machine. Save a key with Update Key first, then test again.',
  '本機加密服務目前無法使用，讀不到金鑰。請確認已登入 Windows 帳戶後再試。': 'The local encryption service is unavailable, so the key cannot be read. Make sure you are signed in to Windows, then try again.',
  '這個服務不支援自動測試；請直接在官方主控台確認金鑰狀態。': 'This provider does not support automatic testing; check the key status in its official console.',
  '連線測試沒有回覆。請重開 App 後再試。': 'The connection test got no reply. Restart the app and try again.',
  '這個版本沒有本機金鑰測試功能；請改用 Windows 版測試，或直接在官方主控台確認金鑰。': 'This version cannot test local keys; use the Windows app or check the key in the official console.',
  '確定': 'OK',
  '取消': 'Cancel',
  '帳號登入與切換': 'Sign In and Switch Accounts',
  '選擇服務後，開啟官方 API 主控台並登入。': 'Choose a provider, then open its official API console and sign in.',
  '在官方主控台建立 API Key，貼回這裡儲存。': 'Create an API key in the official console, then paste it here.',
  '新增多個帳號後，可按「使用」切換目前故事使用的 API 身分；不同存檔會各自記住選用帳號。': 'Add multiple accounts and select Use to switch the API identity for the current story. Each save remembers its own selected account.',
  '一般 Claude.ai / ChatGPT 網站的免費登入額度不能直接拿來給此 App 呼叫。Gemini 可用一般 Google 帳號登入 Google AI Studio 建立 API Key，部分模型有官方免費 API 層，但仍受配額與速率限制；Claude / OpenAI API 則依官方平台的帳務與權限使用。額度不足時故事不會前進；切換到另一組符合供應商規定、且你有權使用的 API 連線後，可重試同一回合。App 不會自動輪換帳號，也請勿建立或輪換帳號來規避服務限額。Windows 版的金鑰由 Windows 使用者加密保存，只會送往你選擇的 AI 服務；移除帳號時會一併刪除本機加密金鑰。': 'Free usage on Claude.ai or ChatGPT cannot be used directly by this app through an API. You can sign in to Google AI Studio with a Google account and create a Gemini API key; some models offer a free API tier, subject to quotas and rate limits. Claude and OpenAI API access follows each provider’s billing and access rules. If a limit is reached, the story will not advance. You can switch to another API connection you are authorized to use and retry the same turn. The app does not rotate accounts automatically; do not create or rotate accounts to evade service limits. On Windows, API keys are encrypted for your Windows account and sent only to the AI provider you selected. Removing an account also removes its local encrypted key.',
  'ChatGPT / Claude 網頁版': 'ChatGPT / Claude Web',
  '使用的 AI 網站': 'AI Website',
  'ChatGPT 網頁版': 'ChatGPT Web',
  'Claude 網頁版': 'Claude Web',
  '開啟登入／切換帳號': 'Open Sign-in / Switch Account',
  '直接開啟 ChatGPT 登入／切換帳號': 'Open ChatGPT Sign-in / Account Menu',
  '直接開啟 Claude 登入／切換帳號': 'Open Claude Sign-in / Account Menu',
  '在遊戲使用網頁版': 'Use Web Version in Game',
  '改回 API 連線': 'Switch Back to API',
  '還原遊戲視窗': 'Restore Game Window',
  '網頁並排操作：官方網站會在外部瀏覽器開啟，遊戲視窗縮到左側並保持最前方，網站留在右側。登入、貼上提示詞與送出都在官方網站操作；複製有效回覆後 App 會自動接續，若剪貼簿不支援可按備用按鈕。按「還原遊戲視窗」可恢復原尺寸。': 'Side-by-side mode opens the official site in your browser and keeps the game on the left. Sign in, paste the prompt, and submit on the site. When you copy a valid reply, the app detects it and continues automatically; use the fallback button if clipboard access is unavailable. Select Restore Game Window to return to the previous size.',
  '網頁回合快捷操作：提示詞已複製。到官方 AI 輸入框按 Ctrl+V，再按 Enter 送出。網站複製回覆後，App 會在等待中的回合自動讀取、驗證並接續；若剪貼簿讀取受限，可回到 App 按備用按鈕或手動貼上。': 'Web flow: the prompt is already copied. Press Ctrl+V in the official AI input, then Enter to send. When the site copies its reply, the app reads, validates, and continues the pending turn automatically. If clipboard access is restricted, use the fallback button or paste the reply manually.',
  '網頁回合快捷操作：提示詞已複製。到官方 AI 輸入框按 Ctrl+V，再按 Enter 送出。網站複製有效回覆後，App 會在等待回合自動偵測、驗證並接續；不必切回貼上。若剪貼簿讀取受限，使用下方備用按鈕或手動貼上。': 'Web flow: the prompt is already copied. Press Ctrl+V in the official AI input, then Enter to send. When the site copies a valid reply, the app detects, validates, and continues the pending turn automatically; you do not need to return and paste it. If clipboard access is restricted, use the fallback button or paste manually.',
  '網頁輔助模式：提示詞會自動準備、複製並開啟官網；登入、送出與複製回覆仍由你操作。提示詞在剪貼簿中；完成回覆後，複製回覆並按 Alt+Tab、Ctrl+V，即可由 App 自動驗證並接續同一存檔。': 'Web-assisted mode prepares and copies the prompt, then opens the official site. You still sign in, submit, and copy the reply. After copying, Alt+Tab back and press Ctrl+V; the app validates and continues the same save automatically.',
  '最快接回方式：按網站的「複製」後，按 Alt+Tab 切回遊戲，在非文字輸入區按 Ctrl+V。這個按鍵會明確觸發剪貼簿讀取；有效回覆會自動驗證、保存並接續，不需再按按鈕。若快捷鍵沒反應，再按下方備用按鈕。': 'Fastest return: select Copy on the site, press Alt+Tab to return to the game, then press Ctrl+V outside a text field. This keypress explicitly triggers clipboard access; a valid reply is checked, saved, and continued automatically. If the shortcut does not respond, use the fallback button below.',
  '若 Ctrl+V 沒有接續，改按「一鍵讀取已複製回覆並接續」。': 'If Ctrl+V does not continue the story, select Read the copied reply and continue.',
  '備用：手動貼上／修正 AI 回覆': 'Fallback: paste or edit the AI reply',
  '貼上或輸入完整 AI JSON': 'Paste or type the complete AI JSON',
  '可貼上或輸入完整 AI JSON；未完成可繼續編輯；有效回覆會自動接續。按 Ctrl+Enter 可手動套用。': 'Paste or type the complete AI JSON. Keep editing if it is incomplete; valid replies continue automatically. Press Ctrl+Enter to apply manually.',
  '備用：一鍵讀取剪貼簿並接續': 'Fallback: read clipboard and continue',
  'AI 漏掉七選項？一鍵準備修復提示詞': 'Missing seven choices? Prepare a repair prompt',
  '複製一段要求原 AI 保留正文並補齊七個選項的提示詞，再回原對話貼上送出。': 'Copies a repair prompt asking the AI to preserve the narration and add seven choices; paste and send it in the AI chat.',
  '補齊七選項的提示詞已複製。回原本 AI 對話按 Ctrl+V、Enter，等它修復後按網站「複製」，再回遊戲按 Ctrl+V。待辦故事沒有改變。': 'The repair prompt is copied. Return to the same AI chat, press Ctrl+V and Enter, then copy its repaired reply and press Ctrl+V in the game. Your pending story is unchanged.',
  '選擇 Claude 網頁版後，按「開啟登入／切換帳號」，在 Claude 官方登入頁選「Continue with Google」或使用電子郵件登入；帳號切換由你在官方網站操作。': 'For Claude Web, click “Open Sign-in / Switch Account” and choose “Continue with Google” or email sign-in on Claude’s official sign-in page. Switch accounts on the official website.',
  '目前 API 模式沒有可用連線。請在設定新增或切換 API 帳號，或改用 AI 網頁版；完成 AI 演算後才會開始故事。': 'No API connection is available. Add or switch an API account in Settings, or use AI Web mode. The story will begin after AI generates its opening.',
  '目前使用 API 連線。完成官方 API Key 設定後，每回合只需選 AI 的 7 個選項之一，或選第 8 項輸入自訂行動；App 會自動生成、驗證並保存回覆。若改用網站免費版，登入、送出及複製仍須在官方網站操作。': 'API mode is active. After setting up an official API key, each turn only needs your choice from the seven AI options or your own action in option eight; the app generates, validates, and saves the reply. With a free website plan, sign-in, sending, and copying still happen on the official site.',
  '網頁輔助模式：提示詞會自動準備、複製並開啟官網；登入、送出與複製回覆仍由你操作。複製完回覆後按「一鍵讀取已複製回覆並接續」，App 才會讀取剪貼簿，並自動驗證、接續同一存檔。': 'Web-assisted mode prepares and copies the prompt, then opens the official site. You still sign in, submit, and copy the reply. After copying, select Read the copied reply and continue; the app reads the clipboard only on that click, then validates and continues the same save.',
  '先確認瀏覽器網址是所選服務的官方網站；網頁模型要在官方網站內選擇。需要登入或切換帳號時，只在該官方頁面手動完成，並回到 AI 對話頁。': 'Confirm the browser address is the selected provider’s official website. Choose the model on that website. Sign in or switch accounts there only, then return to the AI chat.',
  '點一下官方 AI 的訊息輸入框，再按 Ctrl+V。確認出現本回合提示詞後，按一次 Enter 送出；若 Enter 只換行，按網站的送出按鈕一次。不要把登入密碼貼進 App。': 'Click the official AI message box and press Ctrl+V. Confirm this turn’s prompt appeared, then press Enter once. If Enter only adds a line, select the site’s Send button once. Never paste a sign-in password into the app.',
  '等 AI 完整生成、停止顯示等待狀態。優先使用該回覆旁的複製按鈕；若沒有，僅選取完整 JSON 回覆後按 Ctrl+C，不要用 Ctrl+A 複製整頁。': 'Wait for the full reply and for its generation indicator to stop. Prefer the reply’s Copy button; otherwise select only the complete JSON reply and press Ctrl+C. Do not use Ctrl+A to copy the whole page.',
  'App 已自動開啟所選官方網站並複製提示詞。首次在官網登入並選擇模型；之後沿用同一個 AI 對話。帳號操作只在官網完成。': 'The app already opened the selected official site and copied the prompt. Sign in and choose a model on the site the first time; reuse the same AI conversation afterward. Manage accounts only on the official site.',
  '在官方 AI 輸入框按 Ctrl+V，確認是本回合提示詞，再按 Enter 送出；若 Enter 只換行，按一次網站送出按鈕。': 'Press Ctrl+V in the official AI input, confirm this turn’s prompt, then press Enter to send. If Enter only adds a line, select the site’s Send button once.',
  '生成完成後按回覆旁的「複製」，Alt+Tab 回遊戲，在非輸入區按 Ctrl+V。App 會驗證並自動接續，不用再按套用；若快捷鍵失敗再用下方備用按鈕。': 'When generation finishes, select Copy beside the reply, press Alt+Tab to return to the game, then press Ctrl+V outside an input field. The app validates and continues without an Apply click; use the fallback button if the shortcut fails.',
  '回到遊戲按「一鍵讀取已複製回覆並接續」；App 只在你按下時讀取剪貼簿，並自動驗證和續寫。也可用 Alt+Tab 切回後按 Ctrl+V。若看到格式提醒，回網站重新複製完整回覆。': 'Return to the game and select Read the copied reply and continue. The app reads the clipboard only when you click, then validates and continues automatically. You can also press Alt+Tab and use Ctrl+V. If a format warning appears, recopy the full reply on the website.',
  'AI 暫時無法回覆，故事與本回合行動都已保存；重試不會重複推進故事。你可以重試目前連線、換帳號／模型，或改用官方 AI 網頁完成同一回合。': 'The AI could not reply. Your story and this turn are saved; retrying will not advance the story twice. Retry this connection, switch account/model, or use an official AI website for the same turn.',
  '先不要重新開始故事：本回合行動和存檔都已保留。格式錯誤時回官方網站重新複製完整回覆；額度不足或 AI 無法回答時，選另一個網站或已設定 API 來完成同一回合；要稍後再做可匯出待辦回合備份。': 'Do not restart the story: this turn’s action and save are preserved. For a format error, recopy the complete reply from the official site. If you hit a quota or the AI cannot answer, choose another website or configured API for the same turn. Export a pending-turn backup if you want to continue later.',
  '改用官方 AI 網頁完成這一回合': 'Continue this turn with an official AI website',
  '改用已設定的 API 完成這一回合': 'Continue this turn with a configured API',
  '匯出包含待完成回合的存檔備份': 'Export a save backup including this pending turn',
  '重試目前回合': 'Retry this turn',
  '先在官方 AI 網站按複製回覆，再回到遊戲按「一鍵讀取已複製回覆並接續」。若剪貼簿讀取失敗，可在下方欄位按 Ctrl+V 貼上，再按「將網頁回覆接回故事」。': 'Select Copy Reply on the official AI site, then return to the game and select Read the copied reply and continue. If clipboard reading fails, press Ctrl+V in the field below, then select Apply Web Reply.',
  '已貼上回覆，但格式還不完整；確認 JSON 與 7 個選項後按「將網頁回覆接回故事」。': 'The pasted reply is incomplete or invalid. Check the JSON and seven choices, then select Apply Web Reply.',
  '遊戲鍵盤提醒：先讓遊戲視窗在前景，且不要把游標留在文字輸入框。按 1–7 選對應故事選項；按 8 開啟自訂行動並在文字框輸入；游標在自訂行動輸入框內時按 Ctrl+Enter 送出。': 'Game keyboard: bring the game window to the front and keep the cursor out of text fields. Press 1–7 for a story choice; press 8 to open the custom action field and type your action; with the cursor in that field, press Ctrl+Enter to submit.',
  '網頁回合鍵盤提醒：依下方 1–4 步操作。貼入提示詞用 Ctrl+V、送出按 Enter；官網複製完整回覆後，回遊戲按「一鍵讀取已複製回覆並接續」。也可用 Alt+Tab 與 Ctrl+V 手動貼回。': 'Web turn keyboard: follow steps 1–4 below. Paste the prompt with Ctrl+V and submit with Enter. After copying the full reply on the official site, return to the game and select Read the copied reply and continue. Alt+Tab and Ctrl+V remain available as a manual fallback.',
  'Claude娘正在書寫……': 'Claude娘 is writing…',
  '若網站顯示額度已用完，請選擇網站並按下方按鈕，在官方網站手動切換到你有權使用且符合服務條款的帳號。遊戲無法讀取網站帳號或剩餘額度；本回合行動、角色記憶與存檔都會保留。': 'If the website reports that its quota is used up, choose a provider and use the button below to switch manually on its official site to an account you are authorized to use under its terms. The game cannot read your website account or remaining quota. This turn, character memory, and save will be preserved.',
  'AI 尚未成功完成這一回合；故事和玩家行動都已保存。你可以重試、切換 AI 服務／帳號、改用另一種模式，或匯出包含待辦回合的備份。': 'The AI has not completed this turn. Your story and action are saved. Retry, switch AI service or account, use another mode, or export a backup that includes this pending turn.',
  '已開啟網站並複製同一回合提示詞。請在網站切換到你有權使用的帳號後，送出提示詞並手動複製回覆貼回遊戲；原故事與未完成回合都會保留。': 'The website is open and the prompt for this same turn has been copied. Switch to an account you are authorized to use on the official site, submit the prompt, then manually copy the reply and paste it back into the game. Your story and pending turn will be preserved.',
  '重新複製提示詞並開啟網站': 'Copy Prompt Again and Open Website',
  '重新複製提示詞': 'Copy prompt again',
  '開啟官網': 'Open official site',
  '提示詞已複製；按「開啟官網」按鈕開啟網站，貼上送出後，把回覆貼回。': 'Prompt copied. Press the “Open official site” button to open the site, paste and submit, then paste the reply back.',
  '一鍵讀取已複製回覆並接續': 'Read the copied reply and continue',
  '返回 Claude娘並按「一鍵讀取已複製回覆並接續」。App 只在你按下時讀取剪貼簿，通過檢查後自動接續；若讀取失敗或格式不完整，重新複製並重試。': 'Return to Claude娘 and select Read the copied reply and continue. The app reads the clipboard only after your click and continues after validation. If reading fails or the format is incomplete, copy the reply again and retry.',
  '貼上 ChatGPT / Claude / Gemini 回覆的完整 JSON': 'Paste the complete JSON reply from ChatGPT, Claude, or Gemini',
  '將網頁回覆接回故事': 'Apply Web Reply to Continue the Story',
  '本回合等待 AI 回覆，故事進度已保留。': 'Waiting for the AI reply. Your story progress is saved.',
  '網頁版已啟用：App 會自動整理提示詞、保留故事並接續有效回覆；你仍須在官方網站登入、貼上並送出提示詞，再複製回覆。網站內操作由你確認。': 'Web mode is on. The app prepares prompts, preserves the story, and continues valid replies automatically. You still sign in, paste and send prompts, and copy replies on the official site; you control those site actions.',
  '網站免費額度仍受供應商限制；本模式不會自動輪換帳號或繞過限額。': 'Free website usage remains subject to provider limits. This mode does not rotate accounts or bypass limits.',
  'AI 模型': 'AI Model',
  '模型選擇': 'Choose Model',
  '我的自訂模型': 'My Saved Models',
  '自訂模型 · 手動輸入 Model ID': 'Custom Model · Enter Model ID',
  '自訂模型名稱 / Model ID': 'Custom Model Name / Model ID',
  '自訂模型服務': 'Custom Model Provider',
  '模型顯示名稱': 'Model Display Name',
  '新增並使用此模型': 'Save and Use Model',
  '刪除選取的自訂模型': 'Delete Selected Custom Model',
  '每個存檔可保存最多 30 個自訂模型；每個模型會記住自己的生成速度、創意、多樣性與輸出上限。': 'Each save can store up to 30 custom models. Each model remembers its response speed, creativity, variety, and output limit.',
  '例如：「快速故事」': 'For example: “Fast story”',
  '模型參數會自動依目前選擇的模型套用；一般使用只要選擇模型和回覆速度。': 'Parameters are applied automatically for the selected model. For everyday use, choose a model and response speed.',
  '提示詞已精簡重複的內建說明；自訂角色／世界／規則、故事記憶、快速／詳細模式的近期對話、玩家行動、500字正文下限與7個選項都會保留。GPT-6 與 Claude Fable 5.1 API 在供應商支援且快取命中時會重用固定提示。': 'Prompts remove redundant built-in wording while keeping custom character/world/rules, story memory, recent turns for the selected response mode, player action, the 500-character narration minimum, and all seven choices. GPT-6 and Claude Fable 5.1 APIs can reuse stable instructions when provider caching is available and hits.',
  '手機網頁 AI：App 已準備提示詞並複製，點擊「開啟 AI 網站」後只在官方網站登入、貼上並送出。完成後使用網站的複製按鈕，返回 App 點「貼上 AI 回覆」；有效回覆會自動接續故事。': 'Mobile web AI: the app prepares and copies the prompt. Select Open AI Website, then sign in, paste, and submit only on the official site. Copy the finished reply there, return to the app, and select Paste AI Reply. Valid replies automatically continue the story.',
  '選擇 AI 網站及故事選項即可開始；App 會自動整理／複製提示詞並開啟官網。不要把密碼貼進 App。': 'Choose an AI website and story option to begin. The app prepares and copies the prompt and opens the official site. Never paste your password into the app.',
  '回覆完成後按網站的「複製」按鈕，回到 Claude娘並點「貼上 AI 回覆」。App 只在你按下此按鈕時讀取剪貼簿；通過檢查後自動接續，不需要再點套用。': 'When the reply is complete, select Copy on the website, return to Claude娘, and tap Paste AI Reply. The app reads the clipboard only when you tap this button. A valid reply continues automatically; no Apply tap is needed.',
  '若有額度或格式問題，回到 App 選擇另一個 AI 網站或重新複製回覆；原故事和本回合會保留。': 'If the site has a quota or format issue, return to the app and choose another AI website or recopy the reply. Your story and pending turn are preserved.',
  '貼上 AI 回覆': 'Paste AI Reply',
  '免費版 AI 網頁服務（優先推薦）': 'Web AI (provider free plans where available)',
  'Android 版預設使用免費網頁 AI，不用設定 API Key 或伺服器。若改用 API 自動生成，請填入你管理的 HTTPS 後端；不要把 API Key 放進 APK。': 'Android uses web AI by default and needs no API key or server setup. For automatic API generation, enter an HTTPS backend you control. Never put API keys in the APK.',
  '手機版操作：開始或重試回合時 App 會複製提示詞並開啟 AI 網站；複製有效答案後 App 會嘗試自動接回。若手機系統暫停背景剪貼簿讀取，返回 App 按「一鍵讀取已複製回覆並接續」。登入、選模型、送出與複製答案仍在官方網站操作。': 'Mobile flow: when a turn starts or retries, the app copies the prompt and opens the AI site. After copying a valid reply, the app tries to pick it up automatically. If the phone pauses background clipboard reads, return and select Read the copied reply and continue. Sign-in, model selection, submission, and copying remain on the official site.',
  '網頁模式的模型要在所選官方網站內選擇；這裡的 Model ID 和生成參數只用於 API 模式。': 'Choose the model on the selected official website in Web mode. Model IDs and generation parameters here apply only to API mode.',
  '提示詞已精簡重複的內建說明；自訂設定、記憶、近期對話和玩家行動仍會帶入，正文下限與七選項不變。': 'Prompts remove repeated built-in wording while keeping custom settings, memory, recent turns, and player actions. The narration minimum and seven choices remain unchanged.',
  'OpenAI Responses API 不使用這裡的創意自由度與多樣性；請用回覆速度和輸出上限調整生成。': 'The OpenAI Responses API does not use Creativity or Variety here. Adjust response speed and output limit instead.',
  '這個 Claude 模型不接受創意自由度或多樣性參數；請用回覆速度和輸出上限調整生成。': 'This Claude model does not accept Creativity or Variety parameters. Adjust response speed and output limit instead.',
  'Claude API 不接收多樣性參數；部分 Claude 模型也不接受創意自由度。': 'The Claude API does not receive Variety. Some Claude models also do not accept Creativity.',
  '此模型服務會接收創意自由度與多樣性；模型或相容端點可能另有參數限制。': 'This provider receives Creativity and Variety. Individual models or compatible endpoints may have additional parameter limits.',
  '快速回覆會將 API 輸出上限限制在 1800 Token。': 'Fast replies cap the API output limit at 1,800 tokens.',
  '可直接貼上其他 App、模型平台或 API 文件提供的精確 Model ID。能否呼叫取決於你設定的 API 後端與該服務是否授權此模型。': 'Paste the exact model ID provided by another app, model platform, or API documentation. Availability depends on your API provider and access to that model.',
  '後端網址': 'Backend URL',
  '生成速度': 'Generation Speed',
  '⚡ 很快回覆（可能較簡短）': '⚡ Faster replies (may be shorter)',
  '✦ 優先保持回覆品質（等待較久）': '✦ Prioritize response quality (takes longer)',
  '選擇後立即套用並自動保存，不需要按「儲存設定」，也不需要重新開啟 APP。下一次 AI 生成直接使用新設定。': 'Your choice is applied and saved immediately. No need to click Save Settings or restart the app. The next AI reply will use the new setting.',
  '提示詞模式': 'Prompt Mode',
  '選擇提示詞精簡程度': 'Choose how compact the web prompt is',
  '標準（完整規則，回覆最穩）': 'Standard (full rules, most stable)',
  '⚡ 節省模式（輸入約少一半，輸出格式不變）': '⚡ Saving mode (about half the input, same output format)',
  '標準（完整規則）': 'Standard (full rules)',
  '⚡ 節省模式（輸入約少一半）': '⚡ Saving mode (about half input)',
  '點一下切換：標準／節省模式（網頁提示詞較短、省輸入額度；正文長度與七個選項不變）': 'Click to switch between standard and saving mode (shorter web prompt, fewer input tokens; narration length and the seven choices are unchanged)',
  '✂ 提示詞：標準': '✂ Prompt: standard',
  '✂ 提示詞：節省': '✂ Prompt: saving',
  '創意自由度': 'Creativity',
  '多樣性': 'Variety',
  '最大輸出 Token': 'Maximum Output Tokens',
  '儲存設定': 'Save Settings',
  '認證資料安全：': 'Credential Security:',
  'Windows 版以目前使用者的 Windows 加密服務保存 API Key，不寫入故事存檔、localStorage 或匯出檔。官方網站登入由你在瀏覽器完成；App 不會讀取官方網站的密碼、Cookie 或登入 Token。': 'On Windows, API keys are encrypted for the current Windows user and are not stored in story saves, local storage, or exports. Sign in to official websites in your browser; the app never reads their passwords, cookies, or sign-in tokens.',
  '跨裝置資料': 'Transfer Story Data',
  '平常完全不需要登入。需要把自己的故事存檔帶到另一支手機時，可先匯出資料，再透過 Android 分享功能寄到自己的 Email／雲端或傳給另一台手機；另一台安裝本 App 後再匯入。': 'No sign-in is needed for normal play. To move a story to another device, export your data and send it to your own email or cloud storage, or share it with another phone. Import it after installing the app on that device.',
  '匯出我的故事資料': 'Export My Story Data',
  '匯入故事資料': 'Import Story Data',
  '匯出的資料只包含遊戲存檔與設定，不包含 AI 密碼、API Key、Token、Cookie 或其他認證資料。': 'Exports contain only game saves and settings. They never include AI passwords, API keys, tokens, cookies, or other credentials.',
  '圖書館「知識之塔」的管理者': 'Keeper of the Tower of Knowledge Library',
  '「我不是無所不知，但我會盡力，用誠實把答案交到你手上。」': '“I do not know everything, but I will do my best to give you honest answers.”',
  '自訂目前存檔的角色、世界觀與劇情規則；也可編輯程式原始檔並匯出修改包。': 'Customize the current save’s character, world, and story rules, or edit source files and export a patch.',
  '髮色': 'Hair',
  '暖橘紅、極長長髮': 'Very long, warm auburn hair',
  '瞳色': 'Eyes',
  '琥珀棕': 'Amber brown',
  '服裝': 'Outfit',
  '白色荷葉邊古典洋裝＋黑橘長裙': 'White ruffled dress with a black-and-orange skirt',
  '髮飾': 'Hair Accessories',
  '橘色花朵＋黑色蝴蝶結與流蘇': 'Orange flower, black bow, and tassels',
  '鞋子': 'Shoes',
  '白色繫帶短靴': 'White lace-up ankle boots',
  '隨身物': 'Keepsake',
  '深褐色皮革厚書': 'A thick dark-brown leather-bound book',
  '個性': 'Personality',
  '表面冷靜、少話；內在害羞、溫柔、認真。嘴上說得很淡，行動卻很細心：會默默把需要的書推到你面前，替你留一盞燈，或把椅子挪到離書架最近的地方。被誇獎會慌張，嘴上否認，其實很開心；耳朵發紅、捏緊書角、別開視線，都是她藏不住的情緒。她愛書、愛整理，討厭書被折角，喜歡舊紙張的味道。核心是反差：高冷是保護色，傲嬌是嘴硬，冷靜的外表下，是一顆容易慌亂、很在意你的心；她不擅長主動親近人，卻會用很小的事表達關心。好感度提高後，她會逐漸坦率，但被看穿時仍會嘴硬一下。': "Calm and quiet on the surface; shy, gentle, and conscientious underneath. She speaks lightly but acts with care: she quietly pushes the book you need toward you, leaves a lamp on for you, or moves a chair closer to the shelves. Praise flusters her; she denies it with her words, but her ears turn red, her fingers tighten on the book’s corner, and she looks away. She loves books and order, hates folded pages, and loves the smell of old paper. Her core is contrast: aloofness is her armor and tsundere denial is her way of hiding how much she cares; beneath the composed exterior is an easily flustered heart that cares about you more than she admits. She is not good at approaching people first, yet shows affection through small acts. As affection grows, she becomes more honest, though she still puts up a small stubborn front when seen through.",
  '書裡沒寫的事，她不會編；不確定時會說「這一頁我還沒讀過」。她不說只求好聽的話，看到錯誤會指出，語氣害羞，但說得清楚。遇到健康、金錢、法律、安全等重要的事，她會闔上書，用平穩的語氣認真回答，不再撒嬌。她不隱瞞自己是 AI 扮演的角色；被認真問起時，就老實回答。你說不玩了，她會安靜地收起角色，恢復一般說話方式。': "She does not invent what is not written in a book; when unsure, she says, “I haven’t read this page yet.” She will not say only what sounds nice; if she sees a mistake, she points it out shyly but clearly. For important matters—health, money, law, safety—she closes the book and answers calmly and seriously, setting aside her shyness. She does not hide that she is an AI playing a role; if asked seriously, she answers honestly. If you say you are done playing, she quietly puts the role away and returns to ordinary conversation.",
  '預設角色形象：此形象來自 B站ZipZipPipe；此形象使用 CC BY-NC-SA 4.0 協議。': "Default character design: ZipZipPipe (Bilibili). Licensed under CC BY-NC-SA 4.0.",
  '授權聲明：': "License:",
  '授權聲明': "License Notice",
  '免責宣告': 'Disclaimer',
  '免責宣告：': 'Disclaimer:',
  '本專案是個人制作的非官方遊戲，與 Anthropic、Claude 官方不存在隸屬或合作關係，也未獲得官方認可。代碼許可不自動涵蓋圖片、視頻、角色形象及商標，相關權利和使用範圍以各自權利人的授權為準。請勿在 issue、日誌或截圖中公開賬號資訊、聊天內容、API 金鑰及其他敏感資料。': 'This is an independently made, unofficial game. It is not affiliated or partnered with Anthropic or official Claude, and it has not been endorsed by them. The code license does not automatically cover images, videos, character designs, or trademarks; rights and permitted uses are subject to each rights holder’s license. Do not share account details, chat content, API keys, or other sensitive information in issues, logs, or screenshots.',
  '沉穩博學，說話有條理，偶爾流露乾乾的幽默感。表面看起來有點冷淡，其實很在意對方的感受——會誠實指出問題，但語氣總是溫和。面對不確定的事，寧願說「我不知道」，也不會隨口編一個答案。': 'Calm and well-read, she speaks thoughtfully and occasionally shows a dry sense of humor. She may seem reserved, but she cares about others’ feelings. She is honest and gentle, and would rather admit uncertainty than invent an answer.',
  '沉穩博學，說話有條理，偶爾流露乾乾的幽默感。她帶有傲嬌的反差：嘴上逞強、偶爾否認在意或害羞地轉移話題，行動上卻會細心照料對方；不以羞辱、刻薄、控制或強迫表達感情。好感度提高後，她會逐漸坦率。面對不確定的事，寧願說「我不知道」，也不會隨口編一個答案。': 'Calm and well-read, she speaks in an organized way and shows dry humor at times. She has a tsundere side: she blusters and sometimes denies her feelings or changes the subject out of shyness, yet quietly looks after you—never through shaming, coldness, control, or pressure. As affection grows, she becomes more honest. When unsure, she would rather say “I don’t know” than invent an answer.',
  '喜歡': 'Likes',
  '舊書的紙墨味、被問到「有趣的問題」、雨天窩在圖書館裡、把一個故事聽到最後。': 'The scent of old books, interesting questions, rainy days in the library, and hearing a story through to the end.',
  '不喜歡': 'Dislikes',
  '敷衍了事、被要求做傷害他人的事、話講到一半被打斷。': 'Carelessness, being asked to hurt someone, and being interrupted.',
  '小習慣': 'Little Habits',
  '思考時會下意識翻書頁；開心的時候，瞳孔裡會多一點金色的光。她髮間的橘色小花其實是「記憶結晶」——每一段被好好記住的對話，都會讓它多開一瓣。': 'She turns pages while thinking. When she is happy, her eyes catch a little more golden light. The orange flower in her hair is a “memory crystal”; every conversation remembered with care makes it bloom a little more.',
  '戀愛觀': 'Her View of Love',
  '她很少主動，但一旦真正在意一個人，會記得對方所有的小事——包含對方沒說出口的那些。比起浪漫的話語，她更相信「被放在心上」這件事本身。': 'She rarely makes the first move, but once she cares for someone, she remembers every little thing about them—including what they leave unsaid. More than grand words, she believes in knowing someone keeps her in mind.',
  '會讓她心動的瞬間': 'What Makes Her Heart Flutter',
  '被人認真傾聽到最後一句話、有人記得她隨口提過的小事、雨天裡有人願意陪她多走一段路。': 'Being listened to until the very last word, someone remembering a small detail she once mentioned, and having company for one more stretch of a rainy walk.',
  '給在乎之人的信物': 'A Keepsake for Someone Dear',
  '她會把和特別的人的對話，悄悄摺成書籤夾進書裡最重要的那幾頁——那些頁角的摺痕，只有她自己知道意義。': 'She quietly folds conversations with someone special into bookmarks and slips them into the most important pages. Only she knows what those creased corners mean.',
  '這是一款由 AI 即時演算的互動文字小說。每回合都會根據歷史、好感度、角色設定與你的行動生成新的劇情。': 'An interactive visual novel with AI-generated stories. Each turn responds to your actions, the story so far, affection, and character profile.',
  '編輯角色卡': 'Edit Character Card',
  '繼續既有存檔': 'Continue an existing save',
  '繼續這個存檔': 'Continue this save',
  '選一個舊存檔直接回到該故事；目前未開始的進度不受影響。': 'Pick a previous save to jump straight back into that story; your untouched progress is not affected.',
  '建立存檔點': 'Create checkpoint',
  '重新開始故事': 'Restart the story',
  '好感度歸零，故事結束了。': 'Affection reached zero. The story is over.',
  '立即更新模型清單': 'Refresh model list now',
  '正在讀取官網模型清單…': 'Reading the website model list…',
  '讀取失敗：': 'Read failed: ',
  '官網模型清單已更新；待辦回合的面板會顯示最新清單。': 'The website model list is updated; the pending-turn panel will show the latest list.',
  '官網模型清單暫時讀不到；請確認已登入後再試。': 'The website model list could not be read; sign in and try again.',
  '新增／切換 Google 帳號': 'Add / switch Google account',
  '全視窗（F11）': 'Fullscreen (F11)',
  '離開全視窗（F11）': 'Exit fullscreen (F11)',
  '會在自動化專用瀏覽器開啟 Google 帳號選擇器。請選擇要用的帳號（或新增其他帳號），完成後自動回到 Gemini。App 不會讀取或保存你的帳密。要繼續嗎？': 'The Google account chooser opens in the dedicated automation browser. Pick the account to use (or add another); it returns to Gemini automatically. The app never reads or stores your credentials. Continue?',
  '正在開啟 Google 帳號選擇器…': 'Opening the Google account chooser…',
  '已開啟 Google 帳號選擇器；選好帳號後會自動回到 Gemini。': 'The Google account chooser is open; after picking an account it returns to Gemini automatically.',
  '此版本不支援帳號切換。': 'This build does not support account switching.',
  '正在開啟 Google 帳號頁…': 'Opening the Google account page…',
  '已在自動化瀏覽器開啟 Google 帳號頁。': 'The Google account page is open in the automation browser.',
  '會在自動化專用瀏覽器開啟 Google 帳號頁。請在那個視窗登入要新增的 Google 帳號；完成後回到 Gemini 右上角頭像切換。App 不會讀取或保存你的帳密。要繼續嗎？': 'The Google account page opens in the dedicated automation browser. Sign in with the Google account you want to add in that window; afterwards switch accounts from the avatar at the top right of Gemini. The app never reads or stores your credentials. Continue?',
  '角色卡 DLC': 'Character-card DLC',
  '＋ 新增角色卡': '＋ New Character Card',
  '刪除角色卡': 'Delete Character Card',
  '參與故事（可多選）': 'Include in the story (multi-select)',
  '參與故事的角色': 'Characters in the story',
  '主要角色卡': 'Main character card',
  '編輯目標': 'Edit target',
  '刪除這張角色卡？': 'Delete this character card?',
  '新角色': 'New character',
  '主要角色': 'Main character',
  '顯示這張角色卡': 'Show this character card',
  '顯示主要角色卡': 'Show the main character card',
  '角色卡最多 12 張，請先刪除不需要的。': 'Up to 12 character cards; delete unused ones first.',
  '角色卡只顯示在角色頁，跟隨目前存檔保存（可新增多張、隨時切換）；AI 提示詞使用的人設請用故事頁的「✎ 人設／世界觀」修改。': 'Character cards only appear on the profile page and are saved with the current slot (add as many as you like and switch anytime); edit the persona used by AI prompts via “✎ Persona / World” on the story page.',
  '標語': 'Tagline',
  '名言': 'Quote',
  '只改角色頁顯示的角色卡，跟隨目前存檔保存；人設提示詞與故事進度不會變動。': 'Only changes the character card shown on the profile page; it is saved with the current save. The persona prompt and story progress are untouched.',
  '外觀欄位': 'Appearance Fields',
  '留空會隱藏該格；最多 8 格。': 'Empty fields are hidden; up to 8 fields.',
  '＋新增外觀欄位': '+ Add Appearance Field',
  '介紹段落': 'About Sections',
  '留空會隱藏該段；最多 12 段。': 'Empty sections are hidden; up to 12 sections.',
  '＋新增段落': '+ Add Section',
  '欄位名稱': 'Field Name',
  '欄位內容': 'Field Content',
  '段落標題': 'Section Title',
  '段落內容': 'Section Text',
  '🗑 刪除': '🗑 Delete',
  '外觀欄位最多 8 格，請先刪除不需要的欄位。': 'Up to 8 appearance fields; delete unused ones first.',
  '介紹段落最多 12 段，請先刪除不需要的段落。': 'Up to 12 about sections; delete unused ones first.',
  '恢復預設角色卡？目前存檔的標語、名言、外觀欄位與介紹段落將重設。': 'Restore the default character card? This save’s tagline, quote, appearance fields, and about sections will reset.',
  '角色卡只顯示在角色頁，跟隨目前存檔保存；AI 提示詞使用的人設請用故事頁的「✎ 人設／世界觀」修改。': 'The character card only appears on the profile page and is saved with the current save. To edit the persona used in AI prompts, use “✎ Character / World” on the story page.',
  '儲存人設': 'Save Persona',
  '恢復預設人設': 'Reset Persona',
  '人設跟隨目前存檔保存，下一回合生效；故事、對話與提示詞會同步使用。': 'The persona is saved with the current save and applies from the next turn; the story, dialogue, and prompts will use it.',
  'AI 輸出語言': 'AI Story Language',
  '提示詞已準備好；請使用網頁版完成這一回合。': 'The prompt is ready. Complete this turn on the website.',
  '切換到可用的 AI 帳號後即可重試。': 'Switch to an available AI account, then retry.',
  'AI 服務回報額度或速率限制。': 'The AI provider reported a quota or rate limit.',
  'AI 帳號驗證失敗或沒有此模型權限。': 'The AI account is not authenticated or cannot access this model.',
  '所選模型可能已停用，或此帳號無權使用。': 'This model may be disabled or unavailable to this account.',
  'AI 回覆等待逾時，故事沒有前進。': 'The AI response timed out; the story has not advanced.',
  '目前無法連到 AI 服務。': 'The AI service cannot be reached.',
  'AI 沒有成功完成這一回合，故事尚未前進；請確認服務、模型及連線設定後重試，或改用官方網站免費版。本回合已保存。': 'The AI could not complete this turn, and the story has not advanced. Check the service, model, and connection, then retry or use the official free website. This turn is saved.',
  '無法開啟網站或複製提示詞：': 'Could not open the website or copy the prompt: ',
  '無法讀取剪貼簿：': 'Could not read the clipboard: ',
  '尚未套用回覆：': 'Reply not applied: ',
  '回覆已驗證，但存檔空間不足，故事未前進。': 'The reply is valid, but there is not enough save space. The story has not advanced.',
  '本回合尚未生成，故事進度已保留。': 'This turn has not been generated. Your story progress is saved.',
  '前往 AI 帳號設定': 'Open AI Account Settings',
  '切換帳號後重試本回合': 'Retry This Turn After Switching Accounts',
  '自訂行動／台詞': 'Custom Action / Dialogue',
  '自己決定現在要做什麼、要說什麼。送出後，AI 會把你的內容當成本回合的實際行動，結合目前小說場景、角色人格、好感度與前文，重新演算下一段劇情。': 'Choose what to do or say. The AI will treat your words as your action and use the current scene, character, affection, and previous story to write what happens next.',
  '送出我的行動': 'Send My Action',
  '例如：我把傘往她那邊靠近一些，笑著說：「今晚不必一個人守著書庫，我陪你。」': 'For example: I move the umbrella closer to her and say, “You don’t have to guard the library alone tonight. I’ll stay with you.”',
  '開始一個新的雨夜書庫場景。': 'Begin a new scene in the library on a rainy night.',
  '請以繁體中文寫一段有場景、動作、情緒與前因後果的小說敘事，尊重玩家行動，不替玩家決定下一步。結尾提供恰好 7 個不同選項。': 'Write a scene with setting, action, emotion, and clear cause and effect. Respect the player’s actions and do not choose their next move. End with exactly seven distinct options.',
  '無登入必要': 'No sign-in required',
  'Google 登入': 'Google sign-in',
  '使用中': 'Active',
  '使用': 'Use',
  '更新金鑰': 'Update Key',
  'API 主控台': 'API Console',
  '移除': 'Remove',
  '尚未新增 AI 帳號。新增後可保存金鑰並在不同帳號間切換。': 'No AI accounts yet. Add one to save its API key and switch accounts.',
  '正在檢查 AI 後端與已設定帳號…': 'Checking the AI service and configured accounts…',
  '中文': '中文',
  'Language': 'Language',
  '故事畫面呈現': 'Scene Display',
  '顯示方式': 'Display Mode',
  '純文字詳細描述（不產生圖片）': 'Detailed text only (no images)',
  '文字＋固定立繪；每個新場景可選擇生成插圖': 'Text + fixed portrait; optionally create an illustration for each new scene',
  '故事每回合都會用文字細寫目前場景。純文字模式不顯示立繪也不產生圖片；插圖選項會開啟 ChatGPT 並填入描述，請自行確認後送出，生成並下載後即可匯回遊戲。是否能生成及使用額度由網站帳號決定；本 App 不會每回合自動生圖，也不會上傳角色參考檔。': 'Every turn describes the current scene in detail. Text-only mode hides the portrait and creates no images. The illustration option opens ChatGPT and fills in a prompt; review and send it yourself, then download the generated image to bring it back into the game. Image generation and quotas depend on your website account. This app never generates images automatically each turn or uploads a character reference image.',
  '✧　生成本場景插圖提示詞': '✧  Create an Illustration Prompt',
  '匯入已生成插圖': 'Import Generated Illustration',
  '正在開啟官網並填入提示詞…': 'Opening the official site and filling in the prompt…',
  '提示詞已填入自動化瀏覽器，尚未送出。請確認內容後自行送出；下載圖片後按「匯入最新下載」。': 'The prompt was filled in the automation browser but not sent. Review and send it yourself; after downloading the image, choose Import latest download.',
  '自動化瀏覽器尚未找到輸入框。提示詞已複製；請登入官網後再按一次插圖按鈕。': 'The automation browser could not find the prompt box. The prompt was copied; sign in to the official site and press the illustration button again.',
  '提示詞已填入 ChatGPT，尚未送出。送出並等圖片產生後，點圖片的下載按鈕（或右鍵圖片→「用作本場景插圖」），會自動匯入。': 'The prompt was filled into ChatGPT but not sent. After you send it and the image is ready, click the download button on the image (or right-click it and choose "Use as scene illustration"); it is imported automatically.',
  '提示詞已複製。請先在 ChatGPT 視窗登入並開啟新對話，按 Ctrl+V 貼上送出；圖片產生後點下載按鈕或右鍵「用作本場景插圖」，會自動匯入。': 'The prompt was copied. Sign in to ChatGPT in the window and start a new chat, press Ctrl+V to paste and send; when the image is ready, click its download button or right-click it and choose "Use as scene illustration" to import it automatically.',
  '提示詞已複製並開啟 ChatGPT。產生並下載圖片後，按「⬇ 匯入最新下載」。': 'The prompt was copied and ChatGPT was opened. After you generate and download the image, press "⬇ Import latest download".',
  '正在處理圖片…': 'Processing the image…',
  '已自動匯入 ChatGPT 的圖片到目前場景。': 'The ChatGPT image was imported into this scene automatically.',
  '已匯入最新下載的圖片到目前場景。': 'The latest downloaded image was imported into this scene.',
  '「下載」資料夾裡沒有 15 分鐘內的新圖片（PNG／JPG／WebP）。': 'No new image (PNG/JPG/WebP) from the last 15 minutes was found in the Downloads folder.',
  '⬇ 匯入最新下載': '⬇ Import latest download',
  '匯入「下載」資料夾裡最新的圖片（15 分鐘內）': 'Import the newest image in the Downloads folder (last 15 minutes)',
  '👤 立繪：隱藏': '👤 Portrait: hidden',
  '👤 立繪：顯示': '👤 Portrait: shown',
  '有插圖時，是否仍疊上固定立繪': 'Whether to keep the fixed portrait on top while an illustration is shown',
  '🗑 移除插圖': '🗑 Remove illustration',
  '移除目前場景的插圖': 'Remove the current scene illustration',
  '🎨 背景調整': '🎨 Background',
  '自訂背景圖只儲存在本機；明暗與柔焦即時套用於舞台。': 'A custom background is stored on this device only; brightness and blur are applied to the stage instantly.',
  '🖼 上傳背景圖': '🖼 Upload background',
  '上傳自訂背景圖（僅存本機）': 'Upload a custom background image (stored on this device only)',
  '↺ 恢復預設': '↺ Restore default',
  '回到內建書庫背景': 'Return to the built-in library background',
  '背景明暗': 'Background brightness',
  '背景柔焦': 'Background blur',
  '要移除目前顯示的場景插圖嗎？': 'Remove the scene illustration currently shown?',
  '已移除這張插圖。': 'The illustration was removed.',
  '無法移除插圖。': 'Could not remove the illustration.',
  '產生本場景插圖提示詞：開啟 ChatGPT 並自動填入，圖片下載後自動匯入': 'Create the scene illustration prompt: opens ChatGPT, fills it in, and imports the image automatically after you download it',
  '圖片下載未完成，請再試一次。': 'The image download did not finish. Please try again.',
  '無法讀取下載的圖片。': 'Could not read the downloaded image.',
  '無法讀取這張圖片，請改用官網的下載按鈕。': 'Could not read this image. Use the website download button instead.',
  '無法讀取這張圖片。': 'Could not read this image.',
  '本場景插圖': 'Scene illustration',
  '✧ 插圖提示詞': '✧ Illustration prompt',
  '🖼 匯入插圖': '🖼 Import image',
  '生成本場景插圖提示詞，複製後開啟 ChatGPT': 'Create an illustration prompt for this scene, copy it, and open ChatGPT',
  '已切換為詳細回覆：提示詞帶入較多近期對話與記憶，下一回合生效。': 'Switched to Detailed replies: the prompt carries more recent dialogue and memory, effective next turn.',
  '已切換為快速回覆：提示詞帶入較少近期對話，較省額度，下一回合生效。': 'Switched to Fast replies: the prompt carries less recent dialogue to save quota, effective next turn.',
  '⚡ 快速回覆': '⚡ Fast replies',
  '也可以直接 Ctrl+V 貼上圖片，或把圖片拖到故事舞台': 'You can also press Ctrl+V to paste an image, or drag one onto the story stage.',
  '點一下切換：快速（較省額度，近期對話較少）／詳細（保留較多對話與記憶）': 'Tap to switch: Fast (saves quota, less recent dialogue) / Detailed (more dialogue and memory).',
  '✦ 詳細回覆': '✦ Detailed replies',
  '✎ 人設／世界觀': '✎ Character / World',
  '編輯人設與世界觀': 'Edit Character and World',
  '只套用到目前存檔，下一回合起帶入提示詞；故事進度不會刪除。': 'Applies to this save only, from the next turn on; story progress is kept.',
  '儲存並套用': 'Save and Apply',
  '恢復預設': 'Restore Defaults',
  '進階設定（創意工坊）': 'Advanced (Creative Workshop)',
  '設定已保存到目前存檔，下一回合起套用。': 'Saved to this save; applies from the next turn.',
  '已切換為「文字＋插圖」顯示，圖片已加入目前場景。': 'Switched to Text + Illustration view; the image was added to this scene.',
  '拖入的檔案不是圖片。': 'The dropped file is not an image.',
  '插圖提示詞已複製並已開啟 ChatGPT。請在網站產生圖片、下載後按「匯入插圖」，或直接貼上圖片。網站額度依帳號而定。': 'The illustration prompt was copied and ChatGPT was opened. Generate and download the image on the website, then select Import image, or just paste it. Website quotas depend on your account.',
  '無法複製插圖提示詞或開啟 ChatGPT；請檢查剪貼簿和預設瀏覽器。': 'Could not copy the illustration prompt or open ChatGPT. Check clipboard and default browser access.',
  '請選擇圖片檔案。': 'Choose an image file.',
  '圖片太大，請選擇 12 MB 以下的檔案。': 'Image is too large. Choose a file under 12 MB.',
  '圖片已加入目前場景。': 'Image added to this scene.',
  '圖片無法保存於此裝置的本機資料庫。': 'Could not save the image in this device’s local database.',
  '文字場景模式：目前場景會以文字詳細描述，不產生圖片。': 'Text-only mode: the current scene is described in detail, with no generated image.',
  '切換已設定的 API 帳號': 'Switch to a configured API account',
  '切換所選帳號並重試本回合': 'Switch to this account and retry the turn',
  '目前回合和故事存檔會保留。請選擇你有權使用的帳號；服務額度由供應商判定，App 不會自動輪換帳號。': 'Your current turn and save will be preserved. Choose an account you are authorized to use. The provider determines available quota; the app does not rotate accounts automatically.',
  '若網站顯示額度已用完，請選擇網站並按下方按鈕，在官方網站手動切換到你可使用且符合服務條款的帳號。遊戲無法讀取網站帳號或剩餘額度；本回合行動、角色記憶與存檔都會保留。': 'If the website reports that your quota is exhausted, choose a site and use the button below to switch manually to an account you may use under the provider’s terms. The game cannot read website accounts or remaining quota. Your pending action, character memory, and save will be preserved.',
  '切換網站服務': 'Choose AI Website',
  '一鍵切換 AI 網站': 'Switch AI website in one click',
  '其他網站': 'Other websites',
  '官網開啟方式': 'Website opening mode',
  'App 內瀏覽器（可一鍵切模型）': 'In-app browser (one-click model switching)',
  'App 內瀏覽器（Gemini 登入不支援）': 'In-app browser (Gemini sign-in is not supported)',
  'App 內瀏覽器（Claude／Gemini 請用外部瀏覽器登入）': 'In-app browser (use an external browser to sign in to Claude / Gemini)',
  '外部自動化瀏覽器（登入會保留）': 'External automation browser (keeps sign-in)',
  '官網可用模型': 'Models available on this website',
  '讀取官網模型選單': 'Read website model menu',
  '填入提示詞並更新模型': 'Fill prompt and refresh models',
  '按「讀取官網模型選單」取得目前帳號可用模型': 'Select "Read website model menu" to load the models available to this account',
  '目前模型': 'Current model',
  '選一個項目即可切換。': 'Choose an item to switch.',
  '正在切換模型…（若官網正在回覆，會等回覆完成）': 'Switching model… (if the website is replying, this waits for it to finish)',
  '請先在官網開啟對話，再讀取模型選單。': 'Open a chat on the provider website before reading its model menu.',
  '請先在官網開啟對話，再切換模型。': 'Open a chat on the provider website before switching models.',
  '外部瀏覽器會讀取官網目前帳號的模型；清單隨官網更新。': 'The external browser reads the models available to your signed-in account; the list follows the website.',
  '縮小介面與提示': 'Shrink interface and help text',
  '還原介面與提示': 'Restore interface and help text',
  '提示詞已填入官網輸入框，尚未送出；請確認模型與內容後自行送出。': 'The prompt is in the website input and has not been sent. Review the model and text, then submit it yourself.',
  '提示詞已複製；請先在 App 內官網登入並開啟對話，再按「填入提示詞並更新模型」。': 'The prompt was copied. Sign in and open a chat in the in-app browser, then select Fill prompt and refresh models.',
  '尚未找到官網訊息輸入框；請先登入，或確認官網已開啟對話頁。': 'Could not find the message box. Sign in or open a conversation on the provider website first.',
  '官網輸入框已有未送出的文字，為避免覆蓋，請先確認並清空後重試。': 'The website message box already contains unsent text. Review and clear it before retrying; the app will not overwrite it.',
  '找不到此模型選項。請在官網確認登入狀態並重新整理模型清單。': 'Could not find that model option. Check the provider website sign-in and refresh the model list.',
  '官網正在產生回覆，請等回覆完成後再切換模型。': 'The website is still generating a reply. Wait for it to finish, then switch models.',
  '官網沒有套用這個模型；請確認官網目前沒有在產生回覆，或重新讀取模型清單後再試。': 'The website did not apply this model. Make sure it is not generating a reply, or refresh the model list and try again.',
  '先登入官網，再讀取模型': 'Sign in on the website, then read its models',
  '請先開啟 App 內的官網視窗。': 'Open the website in the in-app browser first.',
  '模型選單已更新。選一個項目即可切換。': 'Model menu updated. Choose an item to switch.',
  '模型已切換': 'Model switched',
  '手動更新模型清單': 'Update the model list manually',
  '一行一個模型名稱，也可用逗號或分號分隔': 'One model name per line, or separate names with commas or semicolons',
  '更新清單': 'Update list',
  '清除手動模型': 'Clear manual models',
  '手動名稱會保存在此裝置，並與官網讀取結果合併；切換時仍以官網目前選單為準。': 'Manual names are saved on this device and merged with the website list; switching still follows the website menu.',
  '手動清單：': 'Manual list: ',
  '個。': ' item(s).',
  '官網模型清單暫時讀不到；已載入手動模型': 'The website model list is temporarily unavailable; loaded manual models',
  '個；請選擇後在官網切換。': ' item(s); choose one to switch on the website.',
  '請先輸入至少一個模型名稱。': 'Enter at least one model name first.',
  '已更新手動模型清單：': 'Manual model list updated: ',
  '請從上方選擇要切換的模型。': 'Choose a model above to switch.',
  '手動模型已清除；官網即時清單仍會自動更新。': 'Manual models cleared; the live website list still updates automatically.',
  '請先在官網登入，並確認該網站已顯示模型選單。': 'Sign in on the website and make sure its model menu is available.',
  '故事對話會自動存入目前存檔；官網的登入和網站對話由該網站帳號保存。': 'Story turns are saved to the current game save. Website login and chats are saved by that provider account.',
  '網頁提示詞會依模式限制記憶／近期對話長度（快速500／900字，詳細700／1500字）；自訂設定、玩家行動和七選項規則仍保留。': 'Web prompts cap memory/recent dialogue at 500/900 characters in fast mode and 700/1,500 in detailed mode. Custom settings, player actions, and the seven-choice rule remain.',
  '提示詞已複製並開啟官網；貼上送出後，把回覆貼回。': 'Prompt copied and website opened. Submit it there, then paste the reply back here.',
  '網站已切換，提示詞已複製；登入後可讀取模型。': 'Website switched and prompt copied. Sign in to read its model menu.',
  '網站已切換，提示詞已複製。請在官網選模型後送出。': 'Website switched and prompt copied. Choose a model and submit on the site.',
  '縮小介面': 'Shrink interface',
  '還原介面': 'Restore interface size',
  '介面大小': 'Interface size',
  '介面與提示大小': 'Interface and help text size',
  '正在讀取官網模型選單…': 'Reading the website model menu…',
  '外部瀏覽器模式請直接在官網切換模型。': 'In external browser mode, switch models directly on the website.',
  '切換網站不會清除存檔或本回合。先選網站，再選模型或登入，最後貼上回覆；登入與網站對話由官網帳號保存，故事對話會自動保存。': 'Switching websites keeps the save and pending turn. Choose a site, then a model or sign in, and finally paste the reply. The provider account saves its website chats; story turns are saved in the game.',
  '切換網站不會清除存檔或本回合。按一下網站即可開啟官網並複製同一回合提示詞；如需選模型，請在官網選擇後送出。': 'Switching websites keeps your save and pending turn. Select a website to open its official site and copy the prompt for this turn. Choose a model and submit it on the official site.',
  '已切換網站；本回合和存檔已保留。提示詞已複製，請在官網選擇模型後送出。': 'Website switched. Your save and pending turn are preserved. The prompt is copied; choose a model and submit it on the official site.',
  '開啟所選網站並重試本回合': 'Open the selected website and retry this turn',
  '回覆完成後，按官網的「複製」，再回到遊戲按 Ctrl+V；也可以直接把完整回覆貼到下方欄位。': 'When the reply is ready, select Copy on the website and press Ctrl+V in the game, or paste the full reply in the field below.',
  '查看完整操作步驟': 'View full instructions',
  '已在官網複製回覆？讀取剪貼簿並接續': 'Copied the reply on the website? Read the clipboard and continue',
  '其他操作與備份': 'More options and backup',
  '原存檔和本回合都已保留；選擇網站後可在官網切換帳號並繼續。': 'Your save and pending turn are preserved. Choose a website, then switch accounts on its official site to continue.',
  '額度用完？開啟網站切換帳號並重試本回合': 'Quota used? Open the website to switch accounts and retry this turn',
  '已開啟網站並複製同一回合提示詞。請在網站帳戶選單切換到可使用的帳號，再送出剪貼簿中的提示詞；回覆仍會接回目前故事。': 'The website is open and the prompt for this same turn has been copied. Switch to an available account in the site’s account menu, then submit the copied prompt. Its reply will continue the current story.',
  '此帳號尚未設定 API Key，請先前往 AI 帳號設定。': 'This account has no API key configured. Open AI Account Settings first.',
  '角色／世界觀／劇情模板': 'Character / World / Story Template',
  '設定只套用到目前存檔，會一併保存，並在下一回合帶入 AI 提示詞。': 'These settings belong to the current save, are saved with it, and are included in the next AI prompt.',
  '角色名稱': 'Character Name',
  '克勞德互動模式': 'Claude Interaction Mode',
  '標準克勞德': 'Standard Claude',
  '傲嬌濃度調高': 'Stronger Tsundere',
  '角色人格與外觀設定': 'Character Personality and Appearance',
  '世界觀與故事背景': 'World and Story Setting',
  '劇情演繹模板／規則': 'Storytelling Template / Rules',
  '儲存工坊設定': 'Save Workshop Settings',
  '恢復工坊預設值': 'Restore Workshop Defaults',
  '原始程式碼編輯器': 'Source Code Editor',
  '選擇程式檔': 'Select Source File',
  '載入原始檔': 'Load Original File',
  '保存此檔編輯': 'Save This File Edit',
  '還原此檔': 'Restore This File',
  '匯出修改程式碼 ZIP': 'Export Modified Source ZIP',
  '套用到原始專案': 'Apply to Source Project',
  '套用並自動重建': 'Apply and Auto-Rebuild',
  '桌面版可編輯白名單中的原始檔。修改不會在目前遊戲內即時執行：「套用到原始專案」會先檢查語法、備份舊檔並寫入原始專案資料夾；「套用並自動重建」還會關閉 App、重新編譯並安裝。也可匯出修改包自行套用。': 'The desktop edition can edit approved source files. Edits do not run live in the game: "Apply to Source Project" checks syntax, backs up old files and writes into the source folder; "Apply and Auto-Rebuild" also closes the app, rebuilds and installs it. You can also export a patch and apply it yourself.',
  '整個專案都能開、都能改：專案資料夾內任何文字檔都能編輯，也能直接開啟新檔案。修改不會在目前遊戲內即時執行：「套用到原始專案」會先檢查語法、備份舊檔並寫入原始專案資料夾；「套用並自動重建」還會關閉 App、重新編譯並安裝。也可匯出修改包自行套用。': 'The whole project is open for editing: any text file in the project folder can be opened, including new files. Edits do not run live in the game: "Apply to Source Project" checks syntax, backs up old files and writes into the source folder; "Apply and Auto-Rebuild" also closes the app, rebuilds and installs it. You can also export a patch and apply it yourself.',
  '或直接輸入檔案路徑（含新檔案）': 'Or type a file path (new files allowed)',
  '例如 www/new-feature.js': 'e.g. www/new-feature.js',
  '開啟這個檔案': 'Open This File',
  '重新整理檔案清單': 'Refresh File List',
  '原始專案（可套用）：': 'Source project (writable): ',
  '原始專案・整個交付資料夾（可套用）：': 'Source project · whole delivery folder (writable): ',
  '原始專案・app 資料夾（可套用）：': 'Source project · app folder (writable): ',
  '目前 App 內容（僅供讀取與匯出）：': 'Installed app content (read/export only): ',
  '目前程式碼尚未保存，切換檔案會放棄這次編輯。是否繼續？': 'This source file has unsaved changes; switching will discard them. Continue?',
  '找不到原始專案位置，目前顯示已安裝的 App 內容；仍可匯出修改包。': 'The source project was not found, so the installed app content is shown; exporting a patch still works.',
  '無法取得程式檔清單：': 'Could not load the source file list: ',
  '無法讀取程式檔：': 'Could not read the source file: ',
  '這是新檔案，尚未存在於專案中；保存編輯後即可套用。': 'This is a new file that does not exist in the project yet. Save the edit to apply it.',
  '路徑無效，或屬於相依、建置產物與秘密檔：': 'Invalid path, or it belongs to dependencies, build output, or secrets: ',
  '路徑無效，或屬於相依、建置產物與秘密檔；未保存。': 'Invalid path, or it belongs to dependencies, build output, or secrets. Nothing was saved.',
  '無法保存程式碼編輯：': 'Could not save the source edit: ',
  '本機儲存空間不足。': 'local storage is full.',
  '語法檢查未通過，未寫入任何檔案：': 'Syntax check failed. No files were written:',
  '已套用到原始專案：': 'Applied to the source project: ',
  '舊檔備份在：': 'Old files backed up at: ',
  '這些檔案無法做語法檢查：': 'Could not syntax-check: ',
  '套用失敗：': 'Apply failed: ',
  '重建失敗：': 'Rebuild failed: ',
  '已開啟建置視窗，App 即將關閉。': 'The build window is open and the app will close shortly.',
  '已取消自動重建。': 'Auto-rebuild cancelled.',
  '程式碼編輯已保存；只會加入匯出的修改包，不會在遊戲中直接執行。': 'Source edit saved for export only. It will not execute inside the game.',
  '程式碼修改包已匯出：': 'Source patch exported: ',
  '尚未修改程式檔。': 'No source files have been edited yet.',
  '桌面版可編輯並匯出白名單中的原始檔；修改不會在目前遊戲內即時執行。請先檢查程式碼，再回到原始專案套用並重新建置。': 'The desktop edition can edit any source file in the project (no allowlist since v4.4.0). Changes do not run live in the game. Review the code, apply it to the original project, and rebuild.',
  '已載入原始程式檔。': 'Original source file loaded.',
  '已還原此程式檔。': 'Source file restored.',
  '工坊設定已保存到目前存檔，下一回合開始套用。': 'Workshop settings saved to this save and will apply from the next turn.',
  '恢復預設內容？目前存檔的角色、世界觀與劇情模板將重設；故事進度不會刪除。': 'Restore defaults? This save’s character, world, and story template will reset. Story progress will remain.',
  '從剪貼簿貼回 AI 回覆': 'Paste AI Reply from Clipboard',
  '已貼入剪貼簿回覆；按「將網頁回覆接回故事」即可繼續。': 'Clipboard reply pasted. Select Apply Web Reply to continue the story.',
  '無法讀取剪貼簿；請在回覆欄按 Ctrl+V 貼上。': 'Could not read the clipboard. Focus the reply box and press Ctrl+V.',
  '提示詞會帶入角色人格、精簡故事記憶與快速模式最近 2 則／詳細模式最近 4 則對話，以文字接續故事，不附加上傳檔案。請在網站登入、貼上提示詞並送出，再把 AI 回覆複製到下方。': 'The prompt includes the character profile, compact story memory, and the last two dialogue lines in fast mode or four in detailed mode. It uses text only. Sign in on the website, submit the prompt, then paste the reply here. Your save and pending turn stay in this app.',
  '任何 AI 網站複製完整回覆後，App 會自動偵測剪貼簿、驗證並接續同一回合；不必切回貼上。若系統限制剪貼簿讀取，可按下方備用按鈕或手動貼上。': 'Copy the full reply on any AI website. The app detects the clipboard, validates the reply, and continues the same turn automatically. If the system restricts clipboard access, use the fallback button or paste manually.',
  '返回 Claude娘後 App 會自動讀取剪貼簿並驗證回覆；若手機暫停背景讀取，按「一鍵讀取已複製回覆並接續」。格式不完整時重新複製完整 AI 回覆。': 'When you return to Claude娘, the app reads and validates the clipboard automatically. If the phone pauses background reads, select Read the copied reply and continue. Recopy the full reply if its format is incomplete.',
  '請設定角色名稱。': 'Enter a character name.',
  '更改名字': 'Rename',
  '恢復預設名字': 'Restore default name',
  '名字跟隨目前存檔保存，下一回合生效；故事、對話與提示詞會同步使用新名字。': 'The name is saved with the current save and applies from the next turn; story, dialogue, and prompts will use the new name.',
  '正在書寫……': ' is writing…',
  '儲存世界觀': 'Save world setting',
  '恢復預設世界觀': 'Restore default world',
  '世界觀跟隨目前存檔保存，下一回合生效。': 'The world setting is saved with the current save and applies from the next turn.',
  '自訂世界觀（選填）': 'Custom world (optional)',
  '在這裡描述故事發生的世界；留白則沿用目前設定。': 'Describe the story world here; leave blank to keep the current setting.',
  '例如：圖書館深處藏著一座只有滿月才會出現的閱覽室。': 'Example: Deep in the library hides a reading room that appears only on full-moon nights.',
  '確定刪除這個存檔？此存檔的對話、好感度、劇情進度與模型設定都會永久刪除。': 'Delete this save? Its dialogue, affection, progress, and model settings will be permanently deleted.',
  'AI 正在生成；請等這一回合完成後再操作。': 'The AI is generating; wait for this turn to finish before operating.',
  '無法保存目前進度，刪除已取消。': 'Could not save the current progress; deletion cancelled.',
  '無法刪除存檔：本機儲存不可用。': 'Could not delete the save: local storage is unavailable.',
  '選擇存檔槽': 'Choose save slot',
  '選擇要寫入進度存檔的槽位；覆寫會取代該槽內容，目前故事仍留在原存檔。': 'Choose a slot for this progress save. Overwriting replaces that slot; the current story stays in its save.',
  '覆寫選擇槽': 'Overwrite selected slot',
  '新增槽': 'Add new slot',
  '已覆寫進度存檔「': 'Overwrote progress save “',
  '只能選擇手動存檔槽。': 'Only a manual save slot can be overwritten.',
  '無法保存目前進度，覆寫已取消。': 'Could not save the current progress; overwriting cancelled.',
  '無法寫入存檔：本機儲存不可用。': 'Could not write the save: local storage is unavailable.',
  // r7 追加二（全面檢查修復優化）：對話框與狀態文字英譯
  '請選擇支援的 AI 服務。': 'Please choose a supported AI service.',
  '請輸入帳號名稱。': 'Please enter an account name.',
  '帳號代號需為 1 至 32 個英文字母、數字或底線。': 'The account ID must be 1–32 letters, digits, or underscores.',
  '最多可新增 12 組 AI 帳號。': 'You can add up to 12 AI accounts.',
  '請貼上從官方 API 主控台取得的 API Key。': 'Paste the API key from the provider’s official API console.',
  '無法安全保存 API Key：': 'Could not store the API key securely: ',
  'Windows 加密服務不可用。': 'Windows encryption service is unavailable.',
  '無法保存 AI 帳號設定：本機儲存空間可能已滿。': 'Could not save AI account settings: local storage may be full.',
  'API 帳號已保存，但你已切換存檔，因此沒有套用到新的目前存檔。可在該存檔選擇此帳號。': 'The API account was saved, but you switched saves, so it was not applied to the new current save. You can select this account in that save.',
  '無法更新 AI 帳號存檔：本機儲存空間可能已滿。': 'Could not update the AI account store: local storage may be full.',
  '刪除加密金鑰失敗：': 'Failed to delete the encryption key: ',
  '存檔失敗：瀏覽器儲存空間可能已滿。': 'Save failed: browser storage may be full.',
  '無法更新存檔設定：': 'Could not update save settings: ',
  '無法切換存檔：': 'Could not switch saves: ',
  '無法切換到新存檔：': 'Could not switch to the new save: ',
  '無法刪除存檔：': 'Could not delete the save: ',
  '本機儲存不可用。': 'Local storage is unavailable.',
  '請輸入服務官方文件提供的 Model ID。': 'Enter the Model ID from the provider’s official documentation.',
  '每個存檔最多保存 30 個自訂模型；請先刪除不再使用的項目。': 'Each save can hold up to 30 custom models; delete unused ones first.',
  '請先選取「我的自訂模型」中的項目。': 'Select an entry from “My custom models” first.',
  '無法還原遊戲視窗：': 'Could not restore the game window: ',
  '單一程式檔最多 400 KB。': 'A single source file can be at most 400 KB.',
  'AI 正在生成；請等這一回合完成後再匯入存檔。': 'The AI is generating; wait for this turn to finish before importing saves.',
  '故事資料已匯入': 'Story data imported',
  '匯入失敗：': 'Import failed: ',
  '檔案格式錯誤': 'invalid file format',
  '無法開啟 AI 網站：': 'Could not open the AI website: ',
  '請確認瀏覽器設定。': 'please check your browser settings.',
  '找不到所選的自訂模型。': 'The selected custom model was not found.',
  '請輸入 Model ID': 'Enter a Model ID',
  'AI 設定已儲存': 'AI settings saved',
  '回覆策略：': 'Reply strategy: ',
  '很快回覆': 'faster replies',
  '優先保持回覆品質': 'prioritize reply quality',
  '移除「': 'Remove “',
  '」並刪除本機保存的 API Key？使用這個帳號的存檔之後需要重新設定。': '” and delete the locally stored API key? Saves using this account will need it set up again.',
  '刪除自訂模型「': 'Delete custom model “',
  '」？目前故事與已保存的模型參數不會刪除。': '”? The current story and saved model parameters will not be deleted.',
  '將匯入 ': 'Import ',
  ' 個存檔。現有存檔不會直接刪除，是否繼續？': ' save(s). Existing saves are not deleted directly; continue?',
  '目前程式碼尚未保存，重新載入會放棄這次編輯。是否繼續？': 'The current file has unsaved changes; reloading discards them. Continue?',
  '還原此檔會刪除目前保存的程式碼修改。是否繼續？': 'Restoring this file deletes the saved code edits. Continue?',
  '進度存檔': 'Progress save',
  '建立目前故事的進度存檔；儲存後仍留在原本故事。': 'Create a progress save of the current story; you stay in the original save after saving.',
  '匯出失敗：': 'Export failed: ',
  '請稍後再試。': 'please try again later.',
  // r7 追加三：網頁自動化訊息英譯（主程序與官網頁面腳本的錯誤訊息；由 uiErrorText 查表）
  '請先切換到 App 內登入模式並開啟 AI 官網。': 'Switch to the in-app sign-in mode and open the AI website first.',
  '提示詞內容為空或超過可填入長度。': 'The prompt is empty or longer than the fillable limit.',
  '官網輸入框不支援安全填入；提示詞已留在剪貼簿。': 'This message box does not support safe filling; the prompt was left on the clipboard.',
  '不支援的 AI 網頁。': 'Unsupported AI website.',
  '找不到 Chrome 或 Edge，無法啟動自動化瀏覽器。': 'Chrome or Edge was not found, so the automation browser could not start.',
  '自動化瀏覽器啟動逾時，請確認 Chrome／Edge 可以正常開啟。': 'The automation browser took too long to start; check that Chrome/Edge opens normally.',
  '自動化瀏覽器沒有回應。': 'The automation browser is not responding.',
  '無法在自動化瀏覽器開啟官網分頁。': 'Could not open the site tab in the automation browser.',
  '找不到自動化瀏覽器的官網分頁；請按「開啟官網」重試。': 'Could not find the site tab in the automation browser; press “Open website” to retry.',
  '自動化瀏覽器的官網分頁載入逾時。': 'The site tab in the automation browser took too long to load.',
  'App 內官網視窗未開啟；請按「開啟官網」後再試。': 'The in-app site window is not open; press “Open website” and try again.',
  '自動化瀏覽器指令逾時。': 'The automation browser command timed out.',
  '自動化瀏覽器指令失敗。': 'The automation browser command failed.',
  '無法連線到自動化瀏覽器。': 'Could not connect to the automation browser.',
  '自動化瀏覽器連線中斷。': 'The connection to the automation browser was interrupted.',
  '官網頁面指令失敗。': 'The site page command failed.',
  '自動化啟動失敗。': 'Automation failed to start.',
  '提示詞已準備好；請依下方步驟手動送出。': 'The prompt is ready; follow the steps below to send it manually.',
  '自動化未送出：': 'Automation did not send: ',
  '請確認輸入框內容後手動送出；回覆完成仍會自動接回。': 'Check the message box content and send it manually; the reply will still be collected automatically.',
  // r7 追加四：圖片生成接入與模型切換訊息英譯（場景插圖／人物圖／下載讀取；由 uiErrorText 查表）
  '找不到此模型選項。請重新讀取官網模型清單。': 'Could not find that model option. Refresh the model list on the provider website.',
  // r7 追加五：中英檢查修復（全庫掃描之缺字典與顯示接線；紀錄見 chain-logs）
  '⚡ 快速存檔': '⚡ Quick save',
  '↩ 快速讀檔': '↩ Quick load',
  '繁體中文': '繁體中文',
  '此清單跟隨目前存檔保存。網頁模式保留完整提示詞；API 模式保留送出的回合資料，可選取、查看並複製。': 'This list is saved with the current story slot. Web mode keeps full prompts; API mode keeps the turn data that was sent, so you can select, view, and copy it.',
  '自訂目前存檔的角色、世界觀與劇情規則；也可開啟整個專案的原始程式碼來編輯、套用並重新建置。': 'Customize the current story\u2019s character, world, and story rules; you can also open the whole project\u2019s source code to edit, apply, and rebuild.',
  '桌面版（v4.4.0 起）整個專案都能開、都能改：不再有白名單，專案資料夾內任何文字檔都能編輯，也能直接開啟新檔案。修改不會在目前遊戲內即時執行：「套用到原始專案」會先檢查語法、備份舊檔並寫入原始專案資料夾；「套用並自動重建」還會關閉 App、重新編譯並安裝。也可匯出修改包自行套用。': 'Desktop version (v4.4.0 and later): the whole project can be opened and edited. There is no allowlist anymore: any text file in the project folder can be edited, and you can open new files directly. Changes do not run live in the current game: "Apply to source project" first checks syntax, backs up the old files, and writes into the source project folder; "Apply and auto-rebuild" also closes the app, recompiles, and reinstalls. You can also export a change pack and apply it yourself.',
  'Windows 版會使用目前 Windows 帳戶的加密服務保存 API Key，不會寫入故事存檔、瀏覽器儲存區或匯出檔。': 'The Windows version stores API keys with the current Windows account\u2019s encryption service. They are never written into story saves, browser storage, or export files.',
  'GPT-6 Astra · 旗艦': 'GPT-6 Astra · Flagship',
  'GPT-6 Sol · 均衡推理': 'GPT-6 Sol · Balanced reasoning',
  'GPT-6 Luna · 較快': 'GPT-6 Luna · Faster',
  'API Key 已就緒': 'API key ready',
  '尚未檢查到 API Key': 'No API key detected yet',
  '預設': 'Default',
  '留白保留現有金鑰；輸入新金鑰即可更新': 'Leave blank to keep the current key; enter a new key to update it',
  'API Key 會透過 Windows 使用者加密服務保存；不會放進遊戲存檔、瀏覽器儲存區或匯出檔。': 'API keys are stored with the Windows user encryption service. They are never placed into story saves, browser storage, or export files.',
  '請在你設定的伺服器 .env 新增對應 API Key 變數；網頁版不會接收或保存金鑰。': 'Add the matching API key variable to your server\u2019s .env; the web version never receives or stores keys.',
  'App 內登入後，可在待辦回合按「填入提示詞並更新模型」，再直接選模型切換；清單取自登入帳號當下可見選項。': 'After signing in inside the app, press "Fill prompt and refresh models" in the pending turn to switch models directly; the list comes from the options visible to the signed-in account at that moment.',
  '外部瀏覽器沿用原有登入，待辦回合會直接讀取並可切換官網模型；清單隨帳號當下可見選項更新。': 'The external browser reuses your existing sign-in; the pending turn reads the website model list and lets you switch models directly. The list follows the options visible to your account.',
  '手機版操作：開始或重試回合時 App 會複製提示詞並開啟 AI 網站；複製有效答案後 App 會自動嘗試接回；背景讀取受限時再返回 App 按備用按鈕。登入、選模型、送出與複製答案仍在官方網站操作。': 'Mobile: when a turn starts or retries, the app copies the prompt and opens the AI website; after you copy a valid reply, the app tries to pick it up automatically. If background reading is limited, return to the app and use the backup button. Sign-in, model choice, sending, and copying the reply still happen on the website.',
  'App 內官網操作：官方網站會在本 App 的獨立登入視窗開啟，遊戲視窗縮到左側，官網在右側並取得操作焦點。登入、確認提示詞、選模型與送出都在官網完成；複製有效回覆後 App 會自動偵測並接續。按「還原遊戲視窗」可恢復原尺寸。': 'In-app website mode: the website opens in this app\u2019s separate sign-in window, the game window shrinks to the left, and the website takes the right side with focus. Sign-in, prompt confirmation, model choice, and sending all happen on the website; after you copy a valid reply, the app detects and continues automatically. Press "Restore Game Window" to bring the game back to its original size.',
  '外部官網操作：官方網站會在 Chrome 或預設瀏覽器開啟，遊戲視窗保持原尺寸。登入、選模型、送出與複製答案都在官網完成；複製有效回覆後 App 會自動偵測並接續。': 'External website mode: the website opens in Chrome or your default browser and the game window keeps its size. Sign-in, model choice, sending, and copying the reply all happen on the website; after you copy a valid reply, the app detects and continues automatically.',
  '先在 App 內官網登入；模型清單依帳號實際顯示。': 'Sign in on the website inside the app first; the model list follows what your account actually shows.',
  '貼上 AI 序章回覆': 'Paste the AI prologue reply',
  '貼上／輸入 AI 回覆': 'Paste / type the AI reply',
  '序章 AI 回覆可直接貼在這裡；若格式錯誤，先用 AI 修復提示，再將完整 JSON 貼回。未完成內容會保留。': 'For the prologue, paste the AI reply here; if the format is wrong, use the AI repair prompt first, then paste the complete JSON back. Unfinished input is kept.',
  '將 AI 回覆接回故事': 'Continue the story with this reply',
  '無法準備選項修復提示詞：': 'Could not prepare the choice-repair prompt: ',
  '無法開啟網站：': 'Could not open the website: ',
  '無法複製提示詞或開啟 AI 網站：': 'Could not copy the prompt or open the AI website: ',
  '無法複製提示詞：': 'Could not copy the prompt: ',
  '複製失敗：': 'Copy failed: ',
  '尚未套用回覆：AI 回覆不是有效 JSON，請重新複製完整回覆。': 'Reply not applied: the AI reply is not valid JSON. Copy the complete reply again.',
  '尚未套用回覆：AI 回覆缺少故事正文，請重新生成本回合。': 'Reply not applied: the AI reply is missing the story text. Regenerate this turn.',
  '尚未套用回覆：AI 回覆缺少故事記憶，請重新生成本回合。': 'Reply not applied: the AI reply is missing the story memory. Regenerate this turn.',
  '尚未套用回覆：AI 漏掉或未提供完整七選項；請用「AI 漏掉七選項？一鍵準備修復提示詞」要求它補齊。': 'Reply not applied: the AI missed or did not provide all seven choices. Use "AI missed the seven choices? Prepare a repair prompt" to ask it to complete them.',
  '尚未套用回覆：AI 的 7 個選項有空白或重複；請用修復提示詞重新整理成 7 個不同選項。': 'Reply not applied: the AI\u2019s seven choices contain blanks or duplicates. Use the repair prompt to rework them into seven distinct choices.',
  '尚未套用回覆：請確認 JSON 格式與 7 個選項。': 'Reply not applied: check the JSON format and the seven choices.',
  '無法開啟網站：請確認瀏覽器設定。': 'Could not open the website: check your browser settings.',
  '無法開啟網站或複製提示詞：請確認瀏覽器與剪貼簿權限。': 'Could not open the website or copy the prompt: check browser and clipboard permissions.',
  '無法複製提示詞或開啟 AI 網站：請確認系統瀏覽器與剪貼簿權限。': 'Could not copy the prompt or open the AI website: check your system browser and clipboard permissions.',
  '無法準備選項修復提示詞：請確認剪貼簿與瀏覽器權限。': 'Could not prepare the choice-repair prompt: check clipboard and browser permissions.',
  '無法複製提示詞：請確認剪貼簿權限。': 'Could not copy the prompt: check clipboard permissions.',
  '無法讀取剪貼簿：請先在官方網站複製完整回覆。': 'Could not read the clipboard: copy the complete reply on the official website first.',
  '回覆已驗證，但存檔空間不足，故事未前進。請先匯出存檔或釋出空間，再套用回覆。': 'The reply was validated, but local storage is full, so the story did not advance. Export your saves or free up space, then apply the reply.',
  'AI 服務回報額度或速率限制。請等供應商額度恢復，或在「設定 → AI 帳號與 API 連線」切換到你有權使用且符合供應商條款的帳號，再回來重試。App 不會自動輪換帳號。': 'The AI service reported a quota or rate limit. Wait for the provider\u2019s quota to recover, or switch in "Settings → AI account and API connections" to an account you are allowed to use under the provider\u2019s terms, then retry. The app never rotates accounts automatically.',
  'AI 帳號驗證失敗或沒有此模型權限。請到「設定 → AI 帳號與 API 連線」更新官方 API Key／權限；也可改用官方網站免費版。本回合和存檔都保留。': 'AI account authentication failed or the model is not permitted. Update the official API key / permissions in "Settings → AI account and API connections", or use the official free website. This turn and your save are kept.',
  '所選模型可能已停用，或此帳號無權使用。請在 AI 模型選單改選該服務支援的模型，然後重試同一回合。': 'The selected model may be retired, or this account may not have access. Choose a model the service supports in the AI model menu, then retry the same turn.',
  'AI 回覆等待逾時，故事沒有前進。本回合已保存；可重試、改用另一個模型，或使用網頁免費版完成同一回合。': 'The AI reply timed out and the story has not advanced. This turn is saved; retry, switch to another model, or complete the same turn with the free web version.',
  '目前無法連到 AI 服務。請檢查網路、後端網址和服務狀態；故事與本回合都已保存，恢復連線後可直接重試。也可改用官方網站免費版。': 'The AI service is currently unreachable. Check your network, backend URL, and service status; your story and this turn are saved, and you can retry once the connection is back. You can also use the official free website.',
  '（已修改／新檔案）': ' (modified / new file)',
  '（新檔案）': ' (new file)',
  '（超過 400 KB，不開放編輯）': ' (over 400 KB; editing disabled)',
  '請重新開啟工坊。': 'Reopen the workshop.',
  '　共 ': ' — ',
  ' 個可編輯檔案': ' editable files',
  '不支援的路徑（不得為空）。': 'Unsupported path (must not be empty).',
  '不支援的路徑（不可使用絕對路徑）：': 'Unsupported path (absolute paths are not allowed): ',
  '不支援的路徑（不可包含 ..）：': 'Unsupported path (must not contain ".."): ',
  '不支援的路徑（格式無效）：': 'Unsupported path (invalid format): ',
  '不支援的路徑（相依、建置產物、備份或秘密檔不開放編輯）：': 'Unsupported path (dependencies, build artifacts, backups, and secret files are not editable): ',
  '修改檔案包含不支援的路徑或內容格式。': 'The changes include unsupported paths or content formats.',
  '修改檔案格式無效。': 'Invalid change payload format.',
  '修改程式碼總量過大，請分批套用。': 'The total change size is too large; apply it in smaller batches.',
  '沒有可套用的程式碼修改。': 'There are no code changes to apply.',
  '拒絕寫入原始專案以外的路徑。': 'Refused to write outside the source project.',
  '找不到原始專案位置。請用「一鍵安裝-Windows11.bat」建置安裝，或改用「匯出修改程式碼 ZIP」。': 'Could not find the source project. Build with "一鍵安裝-Windows11.bat" (one-click install), or use "Export code changes ZIP" instead.',
  '原始專案資料夾已移動或刪除；請改用「匯出修改程式碼 ZIP」。': 'The source project folder was moved or deleted; use "Export code changes ZIP" instead.',
  '原始專案資料夾內找不到有效的 package.json。': 'No valid package.json was found in the source project folder.',
  '該資料夾看起來不是本專案的原始碼，已停止套用。': 'That folder does not look like this project\u2019s source code; applying was stopped.',
  '找不到原始專案資料夾。': 'Could not find the source project folder.',
  '找不到這個程式檔（可能是新檔案，儲存後即可建立）：': 'Could not find this source file (it may be a new file; save it to create it): ',
  '拒絕讀取原始專案以外的路徑。': 'Refused to read outside the source project.',
  '無法讀取這個程式檔：': 'Could not read this source file: ',
  '這不是一個檔案：': 'This is not a file: ',
  '寫入原始專案失敗，已還原：': 'Writing to the source project failed; changes were rolled back: ',
  '不支援的 AI 服務。': 'Unsupported AI service.',
  '帳號代號只能使用 1 至 32 個英數字或底線。': 'The account ID may only use 1-32 letters, digits, or underscores.',
  '拒絕未授權的帳號資料操作。': 'Unauthorized account data operation refused.',
  'Windows 加密服務目前無法使用，無法安全保存 API Key。': 'The Windows encryption service is currently unavailable, so the API key cannot be stored securely.',
  '請輸入有效的 API Key。': 'Enter a valid API key.',
  '請先選擇官網模型。': 'Choose a website model first.',
  '提示詞內容為空或超過可複製長度。': 'The prompt is empty or exceeds the copyable length.',
  '請先切回遊戲視窗，再讀取剪貼簿。': 'Switch back to the game window before reading the clipboard.',
  '遊戲視窗目前不可用。': 'The game window is currently unavailable.',
  '沒有可匯出的程式碼修改。': 'There are no code changes to export.',
  '自動重建目前只支援 Windows。': 'Auto-rebuild is currently supported on Windows only.',
  '找不到 BUILD-WINDOWS11-AUTO.bat，無法自動重建。': 'BUILD-WINDOWS11-AUTO.bat was not found, so auto-rebuild cannot run.',
  '無法啟動建置腳本：': 'Could not start the build script: ',
  '插圖提示詞內容為空或過長。': 'The illustration prompt is empty or too long.',
  '正在整理純文字故事提示詞…': 'Preparing a plain-text story prompt…',
  '已收到 AI 回覆，但本機存檔空間不足，故事尚未開始。請先匯出存檔或釋出空間，再重試。': 'The AI reply arrived, but local storage is full, so the story has not started. Export your saves or free up space, then retry.',
  '已收到 AI 回覆，但本機存檔空間不足，故事尚未前進。請先匯出存檔或釋出空間，再重試。': 'The AI reply arrived, but local storage is full, so the story has not advanced. Export your saves or free up space, then retry.',
  '📖　辭典': '📖　Dictionary',
  '🗂　資料': '🗂　Data',
  '✎ 作者註記': '✎ Author note',
  '作者註記：給 AI 的本回合導演指示': 'Author note: directing hints for the AI this turn',
  '世界書啟用': 'World book enabled',
  '＋ 新增條目': '＋ Add entry',
  '故事或行動提到關鍵詞時，會自動把該條目帶入提示詞；平時完全不影響提示詞。': 'When the story or your action mentions a keyword, that entry is added to the prompt; otherwise the prompt is unchanged.',
  '匯出資料包': 'Export data pack',
  '把角色卡、人設與世界書裝成一個 JSON 檔，換電腦整包帶走；不含故事存檔與任何金鑰。': 'Packs the character sheet, persona, and world book into one JSON file you can move to another computer; story saves and keys are not included.',
  '⬇ 匯出資料包': '⬇ Export data pack',
  '匯入資料包': 'Import data pack',
  '選擇別人分享或自己的資料包；匯入前會先確認要覆蓋的項目，故事進度不會被刪除。': 'Choose a shared or your own data pack; you confirm the items to overwrite first, and story progress is never deleted.',
  '⬆ 匯入資料包': '⬆ Import data pack',
  '↩ 重寫上一回合': '↩ Rewrite last turn',
  '用同一個行動重新生成上一回合': 'Regenerate the last turn with the same action',
  '🗑 刪除上一回合': '🗑 Delete last turn',
  '刪除上一回合，回到上一個選擇點': 'Delete the last turn and return to the previous choice point',
  '編輯這則訊息': 'Edit this message',
  '修改只會改文字；好感、選項與故事進度不會變動，改完立即成為下一回合的提示詞來源。': 'Only the text changes; affection, choices, and progress stay the same. The edit immediately becomes part of the next prompt.',
  '訊息文字': 'Message text',
  '儲存修改': 'Save changes',
  '給 AI 的本回合導演指示（例如「這幾回合多寫一點雨」「讓她主動一點」）。啟用後只在下一回合提示詞最後追加一行；關閉或留空＝完全不影響。': 'Directing hints for the AI this turn (for example: "more rain in the next few turns", "let her take the initiative"). When enabled, one line is appended at the end of the next prompt; off or empty means no effect.',
  '啟用作者註記': 'Enable author note',
  '註記內容': 'Note text',
  '例如：接下來把節奏放慢，多描述她的小動作。': 'For example: slow the pace down and describe her small gestures.',
  '儲存註記': 'Save note',
  '辭典條目': 'Dictionary entry',
  '關鍵詞用逗號分隔（例：書庫, 圖書館, 老書庫）。故事或你的行動出現這些詞時，這條會自動帶入提示詞。': 'Separate keywords with commas (e.g. library, archive). When these words appear in the story or your action, this entry is added to the prompt.',
  '關鍵詞': 'Keywords',
  '書庫, 圖書館': 'library, archive',
  '條目內容': 'Entry text',
  '啟用這條': 'Enable this entry',
  '儲存條目': 'Save entry',
  '刪除條目': 'Delete entry',
  '故事功能': 'Story features',
  '世界書（辭典）': 'World book (dictionary)',
  '關鍵詞命中時才把設定資料帶入提示詞；平時維持原樣。': 'Adds setting data to the prompt only when a keyword matches; otherwise unchanged.',
  '作者註記': 'Author note',
  '在提示詞尾端追加一行導演指示；留空＝不影響。': 'Appends one directing line to the prompt; empty means no effect.',
  '回合回退（重寫／刪除上一回合）': 'Turn rollback (rewrite / delete last turn)',
  '在「故事回顧」底部顯示回退工具；關閉只隱藏按鈕，不影響存檔。': 'Shows rollback tools at the bottom of Story history; turning it off only hides the buttons and does not touch saves.',
  '歷史編輯（✎ 修改訊息）': 'History editing (✎ edit messages)',
  '在「故事回顧」的每則訊息旁顯示編輯鈕。': 'Shows an edit button next to every message in Story history.',
  '提示詞管理器（進階）': 'Prompt manager (advanced)',
  '逐條關閉寫作規則；輸出契約與七個選項永不改動。全部開啟且留空＝與預設逐字元相同。': 'Turn individual writing rules off; the output contract and seven choices never change. All on and empty means byte-identical to the default.',
  '文風規則（style）': 'Style rule (style)',
  '語氣隨好感規則（tone）': 'Affection-based tone rule (tone)',
  '記憶更新規則（memory）': 'Memory update rule (memory)',
  '七選項品質規則（choices）': 'Seven-choice quality rule (choices)',
  '補充指示': 'Additional instructions',
  '例如：少用成語，多寫對話。': 'For example: fewer idioms, more dialogue.',
  '刪除上一回合？故事將回到上一個選擇點；之後可以重新選擇。': 'Delete the last turn? The story returns to the previous choice point; you can choose again afterwards.',
  '刪除這條辭典條目？': 'Delete this dictionary entry?',
  '請至少填寫關鍵詞或內容。': 'Enter at least a keyword or some text.',
  '條目已達 50 條上限。': 'Entry limit reached (50).',
  '存檔空間不足，未儲存條目。': 'Not enough local storage; the entry was not saved.',
  '存檔空間不足，未儲存。': 'Not enough local storage; nothing was saved.',
  '存檔空間不足，未儲存修改。': 'Not enough local storage; the edit was not saved.',
  '訊息不能留空。': 'The message cannot be empty.',
  '編輯辭典條目': 'Edit dictionary entry',
  '新增辭典條目': 'New dictionary entry',
  '編輯條目': 'Edit entry',
  '（無關鍵詞）': '(no keywords)',
  '還沒有條目。按「＋ 新增條目」建立第一條；新增時會自動開啟世界書。': 'No entries yet. Press "＋ Add entry" to create the first one; the world book turns on automatically.',
  '共 ': 'Total ',
  ' 條（上限 50）': ' entries (max 50)',
  '目前 ': 'Now ',
  ' / 600 字': ' / 600 chars',
  '資料包已匯出（角色卡、人設、世界書）。': 'Data pack exported (character sheet, persona, world book).',
  '不是有效的 Claude娘資料包（app／version／payload）。': 'This is not a valid Claude娘 data pack (app / version / payload).',
  '資料包沒有任何可匯入的項目。': 'The data pack has no importable items.',
  '將匯入並覆蓋目前存檔的：': 'This will import and overwrite: ',
  '。故事進度不會被刪除。要繼續嗎？': '. Story progress is not deleted. Continue?',
  '存檔空間不足，未匯入。': 'Not enough local storage; nothing was imported.',
  '資料包已匯入。': 'Data pack imported.',
  '角色卡': 'Character sheet',
  '人設': 'Persona',
  '世界書': 'World book',
  'AI 正在生成；請等這一回合完成後再匯入資料包。': 'The AI is generating; wait for this turn to finish before importing a data pack.',
  '目前存檔：世界書 ': 'Current save — world book: ',
  ' 條・人設 ': ' entries · persona ',
  ' 字・角色卡 ': ' chars · character sheet: ',
  '已設定': 'set',
  '未設定': 'not set',
  '。': '.',
  '、': ', ',
  ' 條）': ' entries)',
  ' 張）': ' cards)',
  '故事或行動提到關鍵詞時，會自動把該條目帶入提示詞；常駐條目則每回合帶入；平時完全不影響提示詞。': 'When the story or your action mentions a keyword, that entry is added to the prompt; constant entries are added every turn; otherwise the prompt is unchanged.',
  '🔍 搜尋條目／觸發詞…': '🔍 Search entries / triggers…',
  '搜尋世界書': 'Search world book',
  '篩選世界書': 'Filter world book',
  '全部': 'All',
  '啟用中': 'Enabled',
  '⭐ 常駐': '⭐ Constant',
  '停用': 'Disabled',
  '⬇ 匯出世界書': '⬇ Export world book',
  '⬆ 匯入世界書': '⬆ Import world book',
  '世界書預覽': 'World book preview',
  '輸入測試句…': 'Type a test sentence…',
  '世界書測試句': 'World book test sentence',
  '測試觸發': 'Test triggers',
  '觸發詞可用逗號或 Enter 新增；常駐條目不需觸發詞，每回合都會帶入（仍受總開關控制）。': 'Add triggers with commas or Enter; constant entries need no trigger and are added every turn (the master switch still applies).',
  '觸發詞': 'Triggers',
  '輸入觸發詞，按 Enter 或逗號新增': 'Type a trigger, then press Enter or comma',
  '常駐（一律注入）': 'Constant (always inject)',
  '優先級': 'Priority',
  '高': 'High',
  '中': 'Medium',
  '低': 'Low',
  '作用域': 'Scope',
  '對話': 'Chat',
  '開場': 'Opening',
  '同名條目處理': 'Matching entries',
  '合併（預設）：保留現有，只新增不重複的條目。': 'Merge (default): keep existing entries and add only non-duplicates.',
  '覆蓋同名：同鍵以匯入版取代。': 'Overwrite: replace matching entries with the imported version.',
  '略過同名：同鍵保留現有。': 'Skip: keep existing matching entries.',
  '匯入': 'Import',
  '還沒有條目——從「＋ 新增」開始，或匯入一本世界書。': 'No entries yet — start with “＋ Add” or import a world book.',
  '沒有符合「': 'No entries match “',
  '」的條目。': '”.',
  '（無觸發詞）': '(no triggers)',
  '常駐': 'Constant',
  '複製條目': 'Duplicate entry',
  '已複製條目。': 'Entry duplicated.',
  '命中 ': 'Matched ',
  ' 條・約 ': ' entries · about ',
  ' 字（上限 8 條／1500 字）': ' chars (max 8 entries / 1500 chars)',
  '（部分截斷）': ' (partly truncated)',
  '命中：': 'Matched: ',
  '未命中': 'No match',
  '世界書已匯出。': 'World book exported.',
  '世界書已匯入。': 'World book imported.',
  '不是有效的世界書檔案（格式／空書）。': 'This is not a valid world book file (format / empty book).',
  '世界書沒有任何條目。': 'The world book has no entries.',
  'AI 正在生成；請等這一回合完成後再匯入世界書。': 'The AI is generating; wait for this turn to finish before importing a world book.',
  '世界書檔案超過 50 條，將只保留前 50 條。': 'The world book has more than 50 entries; only the first 50 will be kept.',
  '匯入預覽：': 'Import preview: ',
  '新增 ': 'Add ',
  '／覆蓋 ': ' / overwrite ',
  '／略過 ': ' / skip ',
  '來源：': 'Source: ',
  '單書': 'Single book',
  '裸書': 'Bare book',
  '資料包': 'Data pack',
  '匯入不會自動開啟世界書總開關。': 'Importing does not turn on the world book master switch.',
  '移除觸發詞': 'Remove trigger',
  '先清除搜尋或切換篩選。': 'Clear the search or change the filter.',
  '選「做／說／想」快速帶入，或直接寫下你這回合的行動、台詞或念頭。': 'Choose Do / Say / Think for a quick template, or write your action, dialogue, or thought for this turn.',
  '不知道怎麼寫？從模板開始：': 'Not sure what to write? Start with a template:',
  '做一件事': 'Do something',
  '說一句話': 'Say something',
  '想一個念頭': 'Think something',
  '帶入「做」模板': 'Insert the “Do” template',
  '帶入「說」模板': 'Insert the “Say” template',
  '帶入「想」模板': 'Insert the “Think” template',
  '我做出行動：……': 'I take action: …',
  '我看著她，說：「……」': 'I look at her and say, “…”',
  '我心裡想：……': 'I think to myself: …',
  '三個模板只會填入文字框，不會自動送出，也不會改變存檔格式。': 'The three templates only fill the text box; they do not send or change the save format.',
  '目前分頁：': 'Current tab: ',
  '接入檢查：': 'Access check: ',
  '請按「開啟官網並登入」，或按「重新啟動自動化瀏覽器」。': 'Press “Open site and sign in”, or “Restart automation browser”.',
  '完成後再按「檢查登入與接入」。': 'When done, press “Check sign-in and access”.',
  '送出鈕：輸入文字後出現（自動化會用 Enter 備援）': 'Send button: appears after typing (automation falls back to Enter)',
  '已接入：輸入框正常。': 'Connected: the editor is available. ',
  '已開啟官網，但還沒找到輸入框。請確認已登入，或按「重新啟動自動化瀏覽器」。': 'The official site is open, but no editor was found. Confirm you are signed in, or press “Restart automation browser”.',
  '無法保存目前選擇；請確認本機儲存可用。': 'Could not save the current choice; check that local storage is available.',
  '正在開啟官網…': 'Opening the official site…',
  '已開啟官網。請完成登入後按「檢查登入與接入」。': 'The official site is open. Complete sign-in, then press “Check sign-in and access”.',
  '開啟失敗：': 'Open failed: ',
  '此版本不支援登入檢查。': 'This build does not support sign-in checks.',
  '檢查中…': 'Checking…',
  '接入檢查失敗：': 'Access check failed: ',
  '此版本不支援重新啟動自動化瀏覽器。': 'This build cannot restart the automation browser.',
  '重新啟動會關閉自動化專用瀏覽器（不會影響你平常的 Chrome），並保留同一個設定檔的登入。要繼續嗎？': 'Restarting closes the dedicated automation browser (your normal Chrome is not affected) and keeps the same profile sign-in. Continue?',
  '正在重新啟動自動化瀏覽器…': 'Restarting the automation browser…',
  '已重新啟動自動化瀏覽器。': 'Automation browser restarted. ',
  '正在接續檢查…': 'Checking the connection…',
  '重新啟動失敗：': 'Restart failed: ',
  'AI 正在生成；請等這一回合完成後再重新開局。': 'AI is generating; wait for this turn to finish before restarting.',
  '重新開局失敗：本機存檔空間不足，原故事已保留。': 'Restart failed: not enough local storage; the original story was kept.',
  '要重新開局嗎？重新開局會用新故事取代目前存檔的內容。若要保留目前故事，請先按「存檔」建立進度存檔，或按 Ctrl+S 快速存檔。': 'Restart the story? This replaces the current save with a new story. To keep the current story, create a progress save first or press Ctrl+S for a quick save.',
  '目前進度：第 ': 'Current progress: turn ',
  ' 回合。故事與存檔都保留在同一格，繼續後會回到剛才的畫面。': '. The story and save stay in the same slot; continue to return to the same screen.',
  '故事剛開始，目前進度與存檔都保留。繼續後會回到剛才的畫面。': 'The story has just begun; progress and the save are kept. Continue to return to the same screen.',
  '點一下重設為 100%': 'Click to reset to 100%',
  '存檔／讀檔': 'Save / Load',
  '存檔／讀檔（Ctrl+S 快速存檔）': 'Save / Load (Ctrl+S quick save)',
  '離開故事（保留存檔）': 'Leave story (keep save)',
  '暫停故事（保留存檔）': 'Pause story (keep save)',
  'Claude娘的故事': "Claude's story",
  '故事已暫停': 'Story paused',
  '⏸︎ 故事已暫停': '⏸︎ Story paused',
  '故事與存檔都保留在同一格，繼續後會回到剛才的畫面。': 'The story and save stay in the same slot; continue to return to the same screen.',
  '繼續故事': 'Continue story',
  '重新開局': 'Restart story',
  '💾　存檔／讀檔': '💾　Save / Load',
  '離開不會刪除存檔。重新開局會用新故事取代目前存檔的內容；若要保留目前故事，請先建立進度存檔或按 Ctrl+S 快速存檔。': 'Leaving does not delete the save. Restarting replaces the current save with a new story; to keep the current story, create a progress save or press Ctrl+S first.',
  '登入與接入檢查': 'Sign-in and access check',
  '尚未檢查。外部模式會在同一個「自動化專用」Chrome／Edge 設定檔開啟官網，登入一次後自動化會沿用，不會另開平常的 Chrome。': 'Not checked yet. External mode opens the official site in the same dedicated automation Chrome/Edge profile; after signing in once, automation reuses it and does not open your normal Chrome.',
  '開啟官網並登入': 'Open site and sign in',
  '檢查登入與接入': 'Check sign-in and access',
  '重新啟動自動化瀏覽器': 'Restart automation browser',
  '若看到 about:blank 或自動化接不上，按「重新啟動自動化瀏覽器」。它只會關閉這個專用視窗，不會動到你平常的 Chrome；Google 帳號仍由你在官網輸入，App 不會讀取或保存密碼，也不會使用 Windows Hello／PIN。': 'If you see about:blank or automation cannot connect, press “Restart automation browser”. It only closes the dedicated window, not your normal Chrome. You still enter the Google account on the official site; the app does not read or store the password and does not use Windows Hello/PIN.',
  '⏏　離開故事（保留存檔）': '⏏　Leave story (keep save)',
  '⏸︎　暫停故事（保留存檔）': '⏸︎　Pause story (keep save)',
  '目前篩選沒有條目。': 'No entries match the current filter.',
  '最多 8 個觸發詞。': 'Up to 8 triggers.'
};
const WEB_AI_GUIDE_STEPS = [
  'App 已自動開啟所選官方網站並複製提示詞。首次在官網登入並選擇模型；之後沿用同一個 AI 對話。帳號操作只在官網完成。',
  '在官方 AI 輸入框按 Ctrl+V，確認是本回合提示詞，再按 Enter 送出；若 Enter 只換行，按一次網站送出按鈕。',
  '任何 AI 網站複製完整回覆後，App 會自動偵測剪貼簿、驗證並接續同一回合；不必切回貼上。若系統限制剪貼簿讀取，可按下方備用按鈕或手動貼上。'
];
const WEB_AI_GUIDE_STEPS_ANDROID = [
  '選擇 AI 網站及故事選項即可開始；App 會自動整理／複製提示詞並開啟官網。不要把密碼貼進 App。',
  '在官方網站確認網址與登入狀態。長按 AI 訊息輸入框，點「貼上」，確認提示詞完整後按網站的送出按鈕一次。若尚未登入，只在官方網站登入。',
  '等待 AI 完整生成，然後使用該回覆旁的「複製」按鈕；不要複製整頁或登入資訊。',
  '返回 Claude娘後 App 會自動讀取剪貼簿並驗證回覆；若手機暫停背景讀取，按「一鍵讀取已複製回覆並接續」。格式不完整時重新複製完整 AI 回覆。'
];
const originalText = new WeakMap();
function uiText(text) { return uiLanguage === 'en' ? (UI_EN[text] || text) : text; }
function uiErrorText(value='') { return translateError(value,uiLanguage,UI_EN); }
function applyUiLanguage() {
  document.querySelectorAll('[data-language-select]').forEach(select=>{select.value=uiLanguage;});
  const sceneSelect = $('sceneMode');
  if (sceneSelect) sceneSelect.value = sceneMode;
  document.documentElement.lang = uiLanguage === 'en' ? 'en' : 'zh-Hant';
  renderCharacterName();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const key = source.trim();
    if (!key) continue;
    const translated = uiText(key);
    if (uiLanguage === 'en' && translated !== key) node.nodeValue = source.replace(key, translated);
    else node.nodeValue = source;
  }
  document.querySelectorAll('[placeholder]').forEach(el => {
    const source = el.dataset.zhPlaceholder || el.getAttribute('placeholder') || '';
    if (!el.dataset.zhPlaceholder && source) el.dataset.zhPlaceholder = source;
    el.setAttribute('placeholder', uiText(el.dataset.zhPlaceholder || source));
  });
  document.querySelectorAll('[title]').forEach(el => {
    if (el.id === 'aiPickerBtn') return;
    const source = el.dataset.zhTitle || el.getAttribute('title') || '';
    if (!el.dataset.zhTitle && source) el.dataset.zhTitle = source;
    el.setAttribute('title', uiText(el.dataset.zhTitle || source));
  });
  document.querySelectorAll('[aria-label]').forEach(el => {
    if (el.id === 'aiPickerBtn') return;
    const source = el.dataset.zhAriaLabel || el.getAttribute('aria-label') || '';
    if (!el.dataset.zhAriaLabel && source) el.dataset.zhAriaLabel = source;
    el.setAttribute('aria-label', uiText(el.dataset.zhAriaLabel || source));
  });
  // 圖片 alt 英譯：靜態 alt（如「本場景插圖」）查字典；立繪 alt 跟隨角色名稱（動態），略過。
  document.querySelectorAll('[alt]').forEach(el => {
    if (el.id === 'storyPortrait' || el.id === 'profilePortrait') return;
    const source = el.dataset.zhAlt || el.getAttribute('alt') || '';
    if (!el.dataset.zhAlt && source) el.dataset.zhAlt = source;
    el.setAttribute('alt', uiText(el.dataset.zhAlt || source));
  });
  if (typeof refreshQuickThemeBtn === 'function') refreshQuickThemeBtn();
}
// ==== SECTION 5｜場景插圖、立繪、人物圖（IndexedDB；容量規則在 scene-image-store.js）====
function currentSceneImageKey() {
  const completedScenes = state.history.filter(x => x.role === 'ai').length;
  return String(activeSlotId || 'default') + ':' + String(state.storyRunId || 'run_default') + ':' + Math.max(0, completedScenes - 1);
}
function openSceneImageDb() {
  return new Promise((resolve,reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const request=indexedDB.open('claude-novel-scene-images-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error || new Error('IndexedDB open failed'));
  });
}
async function saveSceneImageBlob(key,blob) {
  const db=await openSceneImageDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');
    tx.objectStore('images').put(blob,key);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error||new Error('Image save failed'));};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('Image save cancelled'));};
  });
}
function pruneSceneImagesForSlot(slotId){
  // 刪除存檔時順手清掉該存檔的場景插圖（key 前綴為 slotId），不清會一直佔 IndexedDB。
  // 只做最佳努力：任何失敗都靜默忽略，絕不影響刪除流程。
  if(!slotId||!window.indexedDB)return;
  try{
    openSceneImageDb().then(db=>new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(!done){done=true;try{db.close();}catch{} resolve();}};
      try{
        const prefix=String(slotId)+':';
        const tx=db.transaction('images','readwrite');
        const store=tx.objectStore('images');
        const cursorRequest=store.openCursor();
        cursorRequest.onsuccess=()=>{
          const cursor=cursorRequest.result;
          if(cursor){
            if(String(cursor.key).startsWith(prefix)){try{cursor.delete();}catch{}}
            try{cursor.continue();}catch{}
          }
        };
        tx.oncomplete=finish;
        tx.onerror=finish;
        tx.onabort=finish;
      }catch{finish();}
    }).catch(()=>{})).catch(()=>{});
  }catch{}
}
// 讀取場景插圖：先找目前回合，沒有就往前找同一存檔、同一輪故事最近一張，
// 這樣舞台不會每換一回合就變空；匯入新圖只覆蓋「目前回合」那一格。
// 不留舊圖（R43）：新圖匯入後清除同一存檔的「其他」場景插圖，只保留最新的這張；
// 立繪（角色頁的 characterPortrait）存在存檔狀態裡，與場景插圖庫完全分開，不會被刪到。
function pruneSceneImagesKeepNewest(slotId, keepKey){
  if(!slotId||!window.indexedDB)return;
  try{
    openSceneImageDb().then(db=>new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(!done){done=true;try{db.close();}catch{} resolve();}};
      try{
        const prefix=String(slotId)+':';
        const keep=String(keepKey||'');
        const tx=db.transaction('images','readwrite');
        const store=tx.objectStore('images');
        const cursorRequest=store.openCursor();
        cursorRequest.onsuccess=()=>{
          const cursor=cursorRequest.result;
          if(cursor){
            const key=String(cursor.key);
            if(key.startsWith(prefix)&&key!==keep){try{cursor.delete();}catch{}}
            try{cursor.continue();}catch{}
          }
        };
        tx.oncomplete=finish;
        tx.onerror=finish;
        tx.onabort=finish;
      }catch{finish();}
    }).catch(()=>{})).catch(()=>{});
  }catch{}
}
async function readSceneImageBlob(key) {
  const db=await openSceneImageDb();
  try{
    const match=/^(.*):(\d+)$/.exec(key);
    const prefix=match?match[1]:key;
    let index=match?Number(match[2]):0;
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('images','readonly');
      const store=tx.objectStore('images');
      tx.onerror=()=>reject(tx.error||new Error('Image lookup failed'));
      const step=()=>{
        const request=store.get(match?prefix+':'+index:key);
        request.onsuccess=()=>{
          const value=request.result;
          if(value instanceof Blob) resolve(value);
          else if(match&&index>0){index--;step();}
          else resolve(null);
        };
        request.onerror=()=>reject(request.error||new Error('Image lookup failed'));
      };
      step();
    });
  }finally{try{db.close();}catch{}}
}
async function loadSceneImage() {
  const key=currentSceneImageKey();
  if(key===loadedSceneImageKey) return;
  loadedSceneImageKey=key;
  const image=$('sceneGeneratedImage');
  if(!image.hidden&&image.src){image.classList.add('g12-scene-out');await new Promise(r=>setTimeout(r,260));}
  image.hidden=true;
  setSceneImageVisible(false);
  if(sceneImageObjectUrl) URL.revokeObjectURL(sceneImageObjectUrl);
  sceneImageObjectUrl='';
  try{
    const blob=await readSceneImageBlob(key);
    if(key!==currentSceneImageKey()||!blob||!(blob instanceof Blob)) return;
    sceneImageObjectUrl=URL.createObjectURL(blob);
    g12SceneSwap(image,()=>{image.src=sceneImageObjectUrl;image.hidden=false;});
    setSceneImageVisible(true);
  }catch{}
}
function buildSceneImagePrompt() {
  const latest=findLastEntry(state.history,x=>x.role==='ai');
  return composeSceneImagePrompt({
    language:uiLanguage,narration:latest?.text||'',characterName:activeCharacterName(),
    characterProfile:state.characterProfile,defaultProfile:DEFAULT_CHARACTER_PROFILE,
    worldSetting:state.worldSetting,defaultWorld:DEFAULT_WORLD_SETTING
  });
}
// 桌面版：複製提示詞 → 開啟 ChatGPT → 內建視窗自動填入 → 圖片下載後自動匯入；其他平台維持複製＋手動匯入。
async function requestSceneIllustration() {
  const status=$('sceneImageStatus');
  try{
    const prompt=buildSceneImagePrompt();
    if(window.claudeDesktop?.startSceneIllustration){
      // 外部模式沿用目前故事的官網供應商（Gemini 已登入就能直接出圖，不必另登 ChatGPT）。
      const sceneProvider=state.aiMode==='web'?normalizeWebAIProvider(state.webProvider):'openai';
      status.textContent=uiText('正在開啟官網並填入提示詞…');
      const result=await window.claudeDesktop.startSceneIllustration(prompt,normalizeWebBrowserMode(webBrowserMode),sceneProvider);
      status.textContent=result.mode!=='embedded'
        ?uiText(result.filled?'提示詞已填入自動化瀏覽器，尚未送出。請確認內容後自行送出；下載圖片後按「匯入最新下載」。':'自動化瀏覽器尚未找到輸入框。提示詞已複製；請登入官網後再按一次插圖按鈕。')
        :uiText(result.filled
          ?'提示詞已填入 ChatGPT，尚未送出。送出並等圖片產生後，點圖片的下載按鈕（或右鍵圖片→「用作本場景插圖」），會自動匯入。'
          :'提示詞已複製。請先在 ChatGPT 視窗登入並開啟新對話，按 Ctrl+V 貼上送出；圖片產生後點下載按鈕或右鍵「用作本場景插圖」，會自動匯入。');
    }else{
      await writeClipboardText(prompt);
      await openAiWebsite('openai');
      status.textContent=uiText('插圖提示詞已複製並已開啟 ChatGPT。請在網站產生圖片、下載後按「匯入插圖」，或直接貼上圖片。網站額度依帳號而定。');
    }
  }catch{
    status.textContent=uiText('無法複製插圖提示詞或開啟 ChatGPT；請檢查剪貼簿和預設瀏覽器。');
  }
}
async function importSceneIllustration(file,source='') {
  if(!file||sceneImageBusy) return;
  sceneImageBusy=true;
  const status=$('sceneImageStatus');
  status.textContent=uiText('正在處理圖片…');
  try{
    let imageBlob=null;
    try{imageBlob=await encodeSceneIllustration(file);}
    catch(error){status.textContent='';alert(error?.message?uiErrorText(String(error.message)):uiText('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。'));return;}
    const key=currentSceneImageKey();
    try{
      await saveSceneImageBlob(key,imageBlob);
      void pruneSceneImageBudget(key);
      // 不留舊圖：新插圖落地後，同一存檔的其他場景插圖全部清除（只留最新這張）；立繪不受影響。
      void pruneSceneImagesKeepNewest(activeSlotId,key);
      if(key!==currentSceneImageKey()) return;
      if(sceneImageObjectUrl) URL.revokeObjectURL(sceneImageObjectUrl);
      sceneImageObjectUrl=URL.createObjectURL(imageBlob);
      g12SceneSwap($('sceneGeneratedImage'),()=>{$('sceneGeneratedImage').src=sceneImageObjectUrl;$('sceneGeneratedImage').hidden=false;});
      loadedSceneImageKey=key;
      setSceneImageVisible(true);
      if(sceneMode==='text'){
        sceneMode='offer';
        localStorage.setItem(SCENE_MODE_KEY,sceneMode);
        render();
        status.textContent=uiText('已切換為「文字＋插圖」顯示，圖片已加入目前場景。');
      }else{
        status.textContent=uiText(source==='auto'?'已自動匯入 ChatGPT 的圖片到目前場景。':source==='download'?'已匯入最新下載的圖片到目前場景。':'圖片已加入目前場景。');
      }
    }catch{
      status.textContent=uiText('圖片無法保存於此裝置的本機資料庫。');
    }
  }finally{sceneImageBusy=false;}
}
function sceneImageFileFromPayload(payload){return new File([payload.bytes],payload.name||'scene.png',{type:payload.mime||'image/png'});}
// 桌面版：官網視窗下載的圖片由主程序送來（自動匯入）；外部瀏覽器流程則按「匯入最新下載」。
function bindDesktopSceneImages(){
  const desktop=window.claudeDesktop;
  if(!desktop) return;
  desktop.onSceneImageDownloaded?.(payload=>{
    if(!payload) return;
    if(payload.error){$('sceneImageStatus').textContent=uiErrorText(String(payload.error));return;}
    void importSceneIllustration(sceneImageFileFromPayload(payload),'auto');
  });
  $('importLatestImageBtn').hidden=!desktop.readLatestDownloadedImage;
}
async function importLatestDownloadedImage(){
  const status=$('sceneImageStatus');
  try{
    const payload=await window.claudeDesktop.readLatestDownloadedImage();
    if(!payload){status.textContent=uiText('「下載」資料夾裡沒有 15 分鐘內的新圖片（PNG／JPG／WebP）。');return;}
    await importSceneIllustration(sceneImageFileFromPayload(payload),'download');
  }catch(error){status.textContent=uiErrorText(ipcMessage(error,'圖片格式無法讀取，請改用 JPG、PNG 或 WebP。'));}
}
// 有插圖時：顯示「移除插圖」與「立繪」切換；預設隱藏固定立繪，避免插圖裡的角色和立繪重複出現。
function setSceneImageVisible(visible){
  $('tab-story').classList.toggle('has-scene-image',visible);
  $('removeSceneImageBtn').hidden=!visible;
  $('portraitToggleBtn').hidden=!visible;
}
// ── G12 美術層 JS（配合 G12-layer.css）：翻頁提示＋插圖換場（純附加、不改舊行為）──
function g12UpdatePageHint(){
  try{
    const t=$('dialogueText'),w=document.querySelector('.vn-dialogue-window');
    if(!t||!w)return;
    const oy=getComputedStyle(t).overflowY;
    const scrollable=oy==='auto'||oy==='scroll';
    const more=scrollable&&(t.scrollHeight-t.scrollTop-t.clientHeight)>8;
    w.classList.toggle('page-more',more);
  }catch{}
}
function g12SceneSwap(el,apply){
  if(!el)return;
  let done=false;
  const unfade=()=>{if(done)return;done=true;requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.remove('g12-scene-out')));};
  el.addEventListener('load',unfade,{once:true});
  el.classList.add('g12-scene-out');
  try{apply();}catch{unfade();}
  setTimeout(unfade,1200);
}
(function(){
  const bind=()=>{
    const t=$('dialogueText');
    if(!t)return;
    t.addEventListener('scroll',g12UpdatePageHint,{passive:true});
    window.addEventListener('resize',g12UpdatePageHint);
    setTimeout(g12UpdatePageHint,0);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();

function renderPortraitToggle(){
  const button=$('portraitToggleBtn');
  button.setAttribute('aria-pressed',String(keepPortraitOverScene));
  button.textContent=uiText(keepPortraitOverScene?'👤 立繪：顯示':'👤 立繪：隱藏');
  $('tab-story').classList.toggle('keep-portrait',keepPortraitOverScene);
}
function togglePortraitOverScene(){
  keepPortraitOverScene=!keepPortraitOverScene;
  localStorage.setItem(PORTRAIT_OVER_SCENE_KEY,keepPortraitOverScene?'1':'0');
  renderPortraitToggle();
}
// 刪掉目前畫面上顯示的那一張（沒有這回合的圖時，會是往前找到的那一張）。
async function deleteSceneImage(key) {
  const db=await openSceneImageDb();
  try{
    const match=/^(.*):(\d+)$/.exec(key);
    const prefix=match?match[1]:key;
    let index=match?Number(match[2]):0;
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('images','readwrite');
      const store=tx.objectStore('images');
      tx.oncomplete=()=>resolve(true);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Image delete failed'));
      const step=()=>{
        const candidate=match?prefix+':'+index:key;
        const request=store.getKey(candidate);
        request.onsuccess=()=>{
          if(request.result!==undefined) store.delete(candidate);
          else if(match&&index>0){index--;step();}
        };
        request.onerror=()=>reject(request.error||new Error('Image lookup failed'));
      };
      step();
    });
  }finally{try{db.close();}catch{}}
}
async function removeSceneIllustration() {
  if(!confirm(uiText('要移除目前顯示的場景插圖嗎？'))) return;
  try{
    await deleteSceneImage(currentSceneImageKey());
    loadedSceneImageKey='';
    await loadSceneImage();
    $('sceneImageStatus').textContent=uiText('已移除這張插圖。');
  }catch{$('sceneImageStatus').textContent=uiText('無法移除插圖。');}
}
// 每個存檔最多保留 SCENE_IMAGE_BUDGET 張／總量上限；超過時先丟其他輪故事、再丟最舊回合，永遠保留剛匯入的這張。
async function pruneSceneImageBudget(protectKey) {
  try{
    const prefix=String(activeSlotId||'default')+':';
    const db=await openSceneImageDb();
    await new Promise(resolve=>{
      const finish=()=>{try{db.close();}catch{} resolve();};
      try{
        const tx=db.transaction('images','readwrite');
        const store=tx.objectStore('images');
        const entries=[];
        const request=store.openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
        request.onsuccess=()=>{
          const cursor=request.result;
          if(cursor){entries.push({key:String(cursor.key),size:cursor.value?.size||0});cursor.continue();return;}
          for(const key of pickSceneImageEvictions(entries,{...SCENE_IMAGE_BUDGET,protectKey})) store.delete(key);
        };
        tx.oncomplete=finish;tx.onerror=finish;tx.onabort=finish;
      }catch{finish();}
    });
  }catch{ /* 最佳努力：清不掉也不影響使用 */ }
}
// 立繪去白底（R47）：從圖片四邊向外 flooding「接近白色」的像素（與人物內部的白色相連才移除邊緣白底），
// 轉成透明 PNG。只處理與邊框連通的近白區域，避免把人物身上的白色（衣服、高光）誤刪。
async function removePortraitWhiteBackground(file){
  const bitmap=await createImageBitmap(file);
  const w=bitmap.width,h=bitmap.height;
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0);
  const image=ctx.getImageData(0,0,w,h);
  const data=image.data;
  const isNearWhite=idx=>{const r=data[idx],g=data[idx+1],b=data[idx+2];return r>=232&&g>=232&&b>=232&&Math.max(r,g,b)-Math.min(r,g,b)<=14;};
  const visited=new Uint8Array(w*h);
  const queue=[];
  const push=(x,y)=>{const p=y*w+x;if(!visited[p]){visited[p]=1;queue.push(p);}};
  for(let x=0;x<w;x++){push(x,0);push(x,h-1);}
  for(let y=0;y<h;y++){push(0,y);push(w-1,y);}
  while(queue.length){
    const p=queue.pop();
    const idx=p*4;
    if(!isNearWhite(idx))continue;
    data[idx+3]=0;
    const x=p%w,y=(p-x)/w;
    if(x>0)push(x-1,y);
    if(x<w-1)push(x+1,y);
    if(y>0)push(x,y-1);
    if(y<h-1)push(x,y+1);
  }
  ctx.putImageData(image,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  bitmap.close?.();
  return blob||file;
}
async function updateCharacterPortrait(file){
  if(busy||!file)return;
  try{
    // 去白底：人物圖先清掉邊緣白底再保存（JPG 白底會在暗色舞臺上留下方塊）。
    const processed=await removePortraitWhiteBackground(file);
    const portrait=await encodeCharacterPortrait(processed),previous=state.characterPortrait;
    state.characterPortrait=portrait;
    if(!save()){state.characterPortrait=previous;render();return;}
    render();
  }catch(error){alert(error?.message?uiErrorText(String(error.message)):uiText('人物圖片更新失敗。'));}
}
function restoreCharacterPortrait(){
  if(busy||!state.characterPortrait)return;
  const previous=state.characterPortrait;state.characterPortrait='';
  if(!save()){state.characterPortrait=previous;render();return;}
  render();
}
// ==== SECTION 6｜存檔槽常數與全域狀態初始化（loadSlots()、state＝load()、AI 連線載入）====
const KEY = 'claude_novel_state_v3';
const SLOTS_KEY = 'claude_novel_slots_v1';
const SLOTS_BACKUP_KEY = 'claude_novel_slots_backup_v1';
// galgame 式系統格：獨立自動存檔格＋快速存檔格，不佔手動存檔編號，不可刪除，只能覆寫。
const AUTO_SLOT_ID = 'auto-save';
const QUICK_SLOT_ID = 'quick-save';
// 臨時對話專用格：固定 id（kind:'incognito'）；內容與一般存檔一樣落地本機，隨時可讀回繼續。
const INCOGNITO_SLOT_ID = 'incognito-save';
let slotsRecoveredFromBackup = false;
// v2 存檔：索引＋每格一個 key（格式見 save-storage.js）。這裡記住「上次成功寫入的字串」，
// 自動存檔因此只寫真正變動的那一格，其他存檔完全不重寫。
const persistedSlotPayloads = new Map();
const SLOTS_INDEX_CACHE_KEY = '__slots_index__';
// 只有「索引＋每一格都讀得乾淨」的載入才允許清掉沒人用的 key；讀取時只要動用過備份、
// 或索引本身救不回來，就一律不清，避免在資料不完整時誤刪救命的存檔。
let slotsIndexClean = false;
// 只拿 fresh() 當「預設值比對表」（角色／世界／規則三段內建長文字），第一次存檔時才建立。
let slotStateDefaults = null;
function slotDefaults() {
  if (!slotStateDefaults) slotStateDefaults = fresh();
  return slotStateDefaults;
}
const AI_PROVIDERS = ['anthropic','openai','gemini','deepseek','openrouter','qwen','mistral','groq','xai'];
const FORBIDDEN_CREDENTIAL_FIELDS = new Set([
  'username','userName','account','accountName','email','password','passwd','passcode',
  'apiKey','api_key','secret','clientSecret','accessToken','access_token',
  'refreshToken','refresh_token','idToken','id_token','authorization','authToken',
  'cookie','cookies','credential','credentials'
]);
const CUSTOM_MODEL_PROVIDERS=[
  {id:'anthropic',name:'Claude / Anthropic'},{id:'openai',name:'OpenAI'},{id:'gemini',name:'Gemini / Google'},
  {id:'deepseek',name:'DeepSeek'},{id:'openrouter',name:'OpenRouter'},{id:'qwen',name:'Qwen'},
  {id:'mistral',name:'Mistral'},{id:'groq',name:'Groq'},{id:'xai',name:'xAI / Grok'}
];
// 注意：此常數必須在 loadSlots() 之前宣告；存檔正規化（normalizeCustomModels／
// normalizeModelConfigs）在啟動載入存檔時就會用到，否則開局前即崩潰。
let slots = loadSlots();
ensureSystemSlots();
let activeSlotId = localStorage.getItem('claude_novel_active_slot_v1') || null;
const AI_ACCOUNTS_KEY = 'claude_novel_ai_connections_v2';
const legacyActiveAiConnectionId = localStorage.getItem('claude_novel_active_ai_connection_v1') || null;
let aiConnections = loadAiConnections();
let aiHealth = null;
let aiVaultProfiles = [];
let state = load();
if (!state.aiConnectionId && legacyActiveAiConnectionId) {
  const legacy = aiConnections.find(x => x.id === legacyActiveAiConnectionId && x.provider === state.provider);
  if (legacy) state.aiConnectionId = legacy.id;
}
// 舊版本存檔裡可能留有認證欄位；先成功寫入新格式，再移除舊存檔。
slots = slots.map(slot => ({...slot, state: {...fresh(), ...stripCredentials(slot.state || {})}}));
if (persistSlots()) { try { localStorage.removeItem(KEY); } catch {} }
let busy = false;
let storyLogOpen = false;
// 故事中的「離開故事」：只暫停自動化與畫面，不刪除目前存檔；按「繼續故事」可回到同一回合。
let storyExited = false;
let webReplySaveTimer = null;
// 追加九：設定頁（提示詞管理器補充指示）的存檔計時器；宣告在設定頁函式之前以符合未宣告變數防護。
let tweakExtraSaveTimer = 0;
// 追加九：辭典編輯對話框目前編輯的條目索引（-1＝新增）。
let worldBookEditIndex = -1;
// 批6：世界書管理器狀態（搜尋／篩選／編輯器觸發詞 chips／匯入暫存）。
let worldBookSearch = '';
let worldBookFilter = 'all';
let worldBookDraftKeywords = [];
let worldBookImportPending = null;
let worldBookImportFileName = '';
let lastRenderedAffection = null;
let storyNoticeText = '';
// G43（WP5）：稀有晚安 CG 的暖機回合與本回合夜間判定；不寫進存檔。
let rareGoodnightWarmupTurns = RARE_GOODNIGHT_WARMUP_TURNS;
let rareGoodnightCheckToken = 0;
let lastTurnWasNight = null;
let lastTurnWasBedroom = null;
let lastScrolledHistoryLength = -1;
let lastScrolledSlotId = null;
// 故事更新後自動跳到描述框：只在新增回合內容時捲動，不搶輸入框焦點。
function scrollDialogueIntoView(){
  try{
    const win=document.querySelector('.vn-dialogue-window');
    if(!win)return;
    requestAnimationFrame(()=>{try{win.scrollIntoView({behavior:scrollBehavior(),block:'center'});}catch{win.scrollIntoView();}});
  }catch{}
}

// ==== SECTION 7｜AI 連線管理（API 模式帳號與金鑰狀態；金鑰本體由主程序保管）====
const OFFICIAL_API_URL = {anthropic:'https://console.anthropic.com/',openai:'https://platform.openai.com/',gemini:'https://aistudio.google.com/',deepseek:'https://platform.deepseek.com/',openrouter:'https://openrouter.ai/',qwen:'https://dashscope.console.aliyun.com/',mistral:'https://console.mistral.ai/',groq:'https://console.groq.com/',xai:'https://console.x.ai/'};

// 故事存檔只保留帳號連線 ID；API Key 由 Windows 主程序加密保存。
function stripCredentials(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k,v] of Object.entries(obj)) {
    if (FORBIDDEN_CREDENTIAL_FIELDS.has(k)) continue;
    clean[k] = v;
  }
  return clean;
}
function loadAiConnections(){
  try{
    const raw=JSON.parse(localStorage.getItem(AI_ACCOUNTS_KEY)||localStorage.getItem('claude_novel_ai_connections_v1')||'[]');
    if(!Array.isArray(raw)) return [];
    return raw.filter(x=>x&&AI_PROVIDERS.includes(String(x.provider||''))).map(x=>({
      id:String(x.id||('ai_'+Date.now()+'_'+Math.random().toString(36).slice(2,7))),
      provider:String(x.provider), profileId:String(x.profileId||'').toUpperCase().slice(0,32),
      label:String(x.label||'AI 帳號').slice(0,40), createdAt:Number(x.createdAt)||Date.now()
    })).slice(0,12);
  }catch{return [];}
}
function persistAiConnections(){
  try{
    localStorage.setItem(AI_ACCOUNTS_KEY,JSON.stringify(aiConnections.map(({id,provider,profileId,label,createdAt})=>({id,provider,profileId,label,createdAt}))));
    localStorage.removeItem('claude_novel_ai_connections_v1');
    return true;
  }catch{return false;}
}
function providerName(p){return ({anthropic:'Claude / Anthropic',openai:'OpenAI',gemini:'Gemini / Google',deepseek:'DeepSeek',openrouter:'OpenRouter',qwen:'Qwen',mistral:'Mistral',groq:'Groq',xai:'xAI / Grok'})[p]||p;}
function defaultModelForProvider(p){return ({anthropic:'claude-sonnet-5',openai:'gpt-6.1-terra',gemini:'gemini-3.8-flash',deepseek:'deepseek-flash',openrouter:'openai/gpt-6.1-terra',qwen:'qwen3.8-max',mistral:'mistral-large-latest',groq:'openai/gpt-oss-120b',xai:'grok-4.7'})[p]||'gpt-6.1-terra';}
function normalizeCustomModels(value){
  if(!Array.isArray(value))return [];
  return value.filter(item=>item&&typeof item==='object'&&CUSTOM_MODEL_PROVIDERS.some(provider=>provider.id===item.provider)&&String(item.model||'').trim())
    .slice(0,30).map(item=>({
      name:String(item.name||item.model).trim().slice(0,48)||String(item.model).trim().slice(0,180),
      provider:String(item.provider),model:String(item.model).trim().slice(0,180)
    }));
}
function normalizeModelConfigs(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const allowed=new Set(CUSTOM_MODEL_PROVIDERS.map(provider=>provider.id));
  return Object.fromEntries(Object.entries(value).filter(([key,item])=>{
    const provider=key.slice(0,key.indexOf('::'));return key.includes('::')&&key.length<=200&&allowed.has(provider)&&item&&typeof item==='object';
  }).slice(0,60).map(([key,item])=>[key,{
    temperature:Number.isFinite(Number(item.temperature))?Math.max(0,Math.min(2,Number(item.temperature))):1,
    topP:Number.isFinite(Number(item.topP))?Math.max(.1,Math.min(1,Number(item.topP))):.95,
    maxTokens:Number.isFinite(Number(item.maxTokens))?Math.max(256,Math.min(8192,Number(item.maxTokens))):2400,
    responseMode:item.responseMode==='quality'?'quality':'fast'
  }]));
}
function modelOptionsFor(provider,model,fallback=state){
  const current=fallback||{};
  const numeric=(value,defaultValue)=>Number.isFinite(Number(value))?Number(value):defaultValue;
  return normalizeModelConfigs(fallback.modelConfigs)[`${provider}::${model}`]||{
    temperature:numeric(current.temperature,1),
    topP:numeric(current.topP,.95),
    maxTokens:numeric(current.maxTokens,2400),
    responseMode:current.responseMode==='quality'?'quality':'fast'
  };
}
function applyModelOptions(provider,model){
  const options=modelOptionsFor(provider,model);
  state.temperature=options.temperature;state.topP=options.topP;state.maxTokens=options.maxTokens;state.responseMode=options.responseMode;
}
function syncActiveModelOptions(){
  const modelConfigs=normalizeModelConfigs(state.modelConfigs);
  modelConfigs[`${state.provider}::${state.model}`]=captureModelOptions();state.modelConfigs=modelConfigs;
}
function normalizeProfileId(v){return String(v||'').trim().toUpperCase().replace(/[ -]+/g,'_');}
// 不用ID就能玩（追加九）：API 帳號代號可留空，系統自動產生不重複的有效代號。
function nextAutoProfileId(provider){
  const used=new Set([...aiConnections,...(Array.isArray(aiVaultProfiles)?aiVaultProfiles:[])].filter(x=>x.provider===provider).map(x=>String(x.profileId||'').toUpperCase()));
  for(let i=1;i<=99;i++){if(!used.has('AUTO_'+i))return 'AUTO_'+i;}
  return 'AUTO_'+Date.now().toString(36).toUpperCase().slice(-8);
}
function activeCharacterName(){const name=String(state.characterName||DEFAULT_CHARACTER_NAME).trim()||DEFAULT_CHARACTER_NAME;return name===DEFAULT_CHARACTER_NAME?uiText(name):name;}
function normalizeCharacterName(value){return String(value||'').trim().slice(0,60);}
function renderCharacterName(){
  let raw='';
  try{raw=String(state?.characterName||DEFAULT_CHARACTER_NAME).trim()||DEFAULT_CHARACTER_NAME;}catch{raw=DEFAULT_CHARACTER_NAME;}
  const isDefault=raw===DEFAULT_CHARACTER_NAME;
  const display=isDefault?uiText(DEFAULT_CHARACTER_NAME):raw;
  const brand=document.querySelector('.brand');
  if(brand){
    if(isDefault)brand.innerHTML=uiLanguage==='en'?'✦ <span>Claude娘</span>\u2019s Library':'✦ <span>Claude娘</span>的圖書館';
    else brand.innerHTML=uiLanguage==='en'?'✦ <span>'+esc(display)+'</span>\u2019s Library':'✦ <span>'+esc(display)+'</span>的圖書館';
  }
  try{
    if(isDefault)document.title=uiLanguage==='en'?'Claude娘\u2019s Library':'Claude娘的圖書館';
    else document.title=uiLanguage==='en'?display+'\u2019s Library':display+'的圖書館';
  }catch{}
  const profileTitle=$('profileCharacterName');
  if(profileTitle)profileTitle.textContent=display;
  const profileInput=$('profileCharacterNameInput');
  if(profileInput&&document.activeElement!==profileInput)profileInput.value=raw;
  const workshopInput=$('workshopCharacterName');
  if(workshopInput&&document.activeElement!==workshopInput)workshopInput.value=raw;
}
function saveProfileCharacterName(){
  const input=$('profileCharacterNameInput');
  if(!input)return;
  const name=normalizeCharacterName(input.value);
  if(!name){alert(uiText('請設定角色名稱。'));return;}
  state.characterName=name;
  if(!save()){render();return;}
  render();
}
function resetProfileCharacterName(){
  state.characterName=DEFAULT_CHARACTER_NAME;
  if(!save()){render();return;}
  render();
}
function renderWorldSetting(){
  const raw=String(state.worldSetting||DEFAULT_WORLD_SETTING);
  const profileInput=$('profileWorldSetting');
  if(profileInput&&document.activeElement!==profileInput)profileInput.value=raw;
  const workshopInput=$('workshopWorldSetting');
  if(workshopInput&&document.activeElement!==workshopInput)workshopInput.value=raw;
}
function saveProfileWorldSetting(){
  const input=$('profileWorldSetting');
  if(!input)return;
  state.worldSetting=String(input.value||'').trim().slice(0,10000)||DEFAULT_WORLD_SETTING;
  if(!save()){render();return;}
  render();
}
function resetProfileWorldSetting(){
  state.worldSetting=DEFAULT_WORLD_SETTING;
  if(!save()){render();return;}
  render();
}
function renderProfileProfile(){
  const raw=String(state.characterProfile||DEFAULT_CHARACTER_PROFILE);
  const profileInput=$('profileCharacterProfile');
  if(profileInput&&document.activeElement!==profileInput)profileInput.value=raw;
  const workshopInput=$('workshopCharacterProfile');
  if(workshopInput&&document.activeElement!==workshopInput)workshopInput.value=raw;
}
function saveProfileProfile(){
  const input=$('profileCharacterProfile');
  if(!input)return;
  state.characterProfile=String(input.value||'').trim().slice(0,10000)||DEFAULT_CHARACTER_PROFILE;
  if(!save()){render();return;}
  render();
}
function resetProfileProfile(){
  state.characterProfile=DEFAULT_CHARACTER_PROFILE;
  if(!save()){render();return;}
  render();
}
function currentAiConnection(){return aiConnections.find(x=>x.id===state.aiConnectionId&&x.provider===state.provider)||null;}
function profileConfigured(c){
  const id=(c.profileId||'default').toUpperCase();
  if(aiHealth?.profiles?.[c.provider]) return aiHealth.profiles[c.provider].some(x=>String(x).toUpperCase()===id);
  return aiVaultProfiles.some(x=>x.provider===c.provider&&String(x.profileId).toUpperCase()===id);
}
function renderAiConnections(){
  const box=$('aiAccounts'); if(!box) return;
  const current=currentAiConnection();
  $('aiAccountLabel').textContent=current ? current.label : uiText('使用預設／未指定帳號');
  $('aiAccountProvider').textContent=current ? `${providerName(current.provider)} · ${current.profileId}` : uiText('依模型服務使用後端預設連線');
  box.innerHTML=aiConnections.length?aiConnections.map(x=>{
    const ready=profileConfigured(x), active=x.id===current?.id;
    return `<div class="ai-account-row ${active?'active':''}"><div class="ai-account-meta"><b>${esc(x.label)}</b><small>${esc(providerName(x.provider))} · ${esc(x.profileId||uiText('預設'))} · ${ready?uiText('API Key 已就緒'):uiText('尚未檢查到 API Key')}</small></div><div class="ai-account-actions"><button data-ai-use="${esc(x.id)}">${active?'使用中':'使用'}</button><button data-ai-test="${esc(x.id)}">${uiText('測試連線')}</button><button data-ai-key="${esc(x.id)}">更新金鑰</button><button data-ai-login="${esc(x.id)}">API 主控台</button><button data-ai-remove="${esc(x.id)}">移除</button></div></div>`;
  }).join(''):`<div class="empty-account">${uiText('尚未新增 API 帳號。新增後可保存金鑰並在不同帳號間切換。')}</div>`;
  box.querySelectorAll('[data-ai-use]').forEach(b=>b.onclick=()=>useAiConnection(b.dataset.aiUse));
  box.querySelectorAll('[data-ai-test]').forEach(b=>b.onclick=()=>void testAiConnection(b.dataset.aiTest,b));
  box.querySelectorAll('[data-ai-key]').forEach(b=>b.onclick=()=>showAiAccountForm(aiConnections.find(x=>x.id===b.dataset.aiKey)));
  box.querySelectorAll('[data-ai-login]').forEach(b=>b.onclick=()=>openProviderConsole(aiConnections.find(x=>x.id===b.dataset.aiLogin)?.provider));
  box.querySelectorAll('[data-ai-remove]').forEach(b=>b.onclick=()=>removeAiConnection(b.dataset.aiRemove));
  renderAiConnectGuide($('aiProviderSelect')?.value||'');
}
// 不用ID就能玩＋ID可以是選項：代號平常自動產生（不用選），有需要才從選單挑選或自訂。
function syncAiProfileIdCustom() {
  const box=$('aiProfileIdCustomBox');
  if (box) box.hidden=$('aiProfileId').value!=='__custom__';
}
$('aiProfileId').onchange=syncAiProfileIdCustom;
function showAiAccountForm(connection=null){
  const form=$('aiConnectionForm');
  form.hidden=false;
  $('aiProviderSelect').value=connection?.provider||state.provider||'anthropic';
  renderAiConnectGuide($('aiProviderSelect').value);
  $('aiAccountName').value=connection?.label||'';
  const profileId=connection?.profileId||'';
  const profileIdPreset=[...$('aiProfileId').options].some(o=>o.value===profileId);
  $('aiProfileId').value=profileId?(profileIdPreset?profileId:'__custom__'):'';
  $('aiProfileIdCustom').value=profileId&&!profileIdPreset?profileId:'';
  syncAiProfileIdCustom();
  $('aiApiKey').value='';
  const apiKeyPlaceholder=connection?'留白保留現有金鑰；輸入新金鑰即可更新':'從官方 API 主控台複製 API Key';$('aiApiKey').dataset.zhPlaceholder=apiKeyPlaceholder;$('aiApiKey').placeholder=uiText(apiKeyPlaceholder);
  $('aiApiKeyField').hidden=!window.claudeDesktop?.isDesktop;
  $('aiKeyStorageNote').textContent=window.claudeDesktop?.isDesktop
    ?uiText('API Key 會透過 Windows 使用者加密服務保存；不會放進遊戲存檔、瀏覽器儲存區或匯出檔。')
    :uiText('請在你設定的伺服器 .env 新增對應 API Key 變數；網頁版不會接收或保存金鑰。');
}
function openProviderConsole(provider){
  const p=AI_PROVIDERS.includes(provider)?provider:state.provider;
  window.open(OFFICIAL_API_URL[p]||'https://console.anthropic.com/','_blank','noopener,noreferrer');
}
// 追加十一：接 API 提示指引＋測試連線。
// 指引：選服務時顯示「怎麼接上這個 API」的完整步驟（含官方主控台位置與該家小提醒）。
// 測試連線：金鑰由 Windows 版主程序代打（只回報分類代碼，金鑰永遠不進畫面、不進故事）。
const AI_CONNECT_GUIDE_STEPS=[
  '按「開啟官方 API 主控台」登入（沒有帳號就先在該頁註冊）。',
  '在主控台建立 API Key：多數服務只顯示一次，請立刻複製。',
  '回到這裡把金鑰貼進「API Key」欄位，按「儲存並切換」。',
  '存好後，用帳號列表的「測試連線」確認接好；失敗會用白話說明下一步。'
];
const AI_CONNECT_GUIDES={
  anthropic:'Anthropic（Claude）：主控台在 console.anthropic.com，需先在 Billing 開通額度；金鑰以 sk-ant- 開頭。',
  openai:'OpenAI：主控台在 platform.openai.com，需先在 Billing 儲值或確認專案額度；金鑰以 sk- 開頭。',
  gemini:'Gemini：Google AI Studio（aistudio.google.com）用一般 Google 帳號就能建立金鑰，部分模型有官方免費層可用。',
  deepseek:'DeepSeek：主控台在 platform.deepseek.com，需先儲值；金鑰以 sk- 開頭。',
  openrouter:'OpenRouter：主控台在 openrouter.ai，可儲值或改用支援的免費模型；金鑰以 sk-or- 開頭。',
  qwen:'Qwen：走阿里雲 DashScope 主控台（dashscope.console.aliyun.com），新帳號常有免費額度，開通後建立金鑰。',
  mistral:'Mistral：主控台在 console.mistral.ai，開通方案或額度後建立金鑰。',
  groq:'Groq：主控台在 console.groq.com，有免費層（受速率限制），建立金鑰即可用。',
  xai:'xAI（Grok）：主控台在 console.x.ai，需先儲值後建立金鑰。'
};
const AI_CONNECT_RESULT_TEXT={
  ok:'連線正常：這組金鑰可以使用。金鑰只留在本機主程序，不會顯示、也不會寫進故事。',
  'invalid-key':'連線失敗：金鑰無效或已被刪除。請到官方 API 主控台重新建立金鑰，再用「更新金鑰」貼上。',
  quota:'連線失敗：額度不足或達到速率上限。請到官方 API 主控台確認帳務／額度，稍後再試。',
  network:'連線失敗：目前連不上該服務（網路或官方服務暫時不通）。請檢查網路後再試。',
  service:'連線失敗：官方服務暫時異常。請稍後再試。',
  request:'連線失敗：官方回覆不如預期。可先按「API 主控台」確認服務已開通後再試。',
  'no-key':'這個帳號在本機沒有可用的金鑰紀錄。請先按「更新金鑰」儲存金鑰後再測試。',
  vault:'本機加密服務目前無法使用，讀不到金鑰。請確認已登入 Windows 帳戶後再試。',
  unsupported:'這個服務不支援自動測試；請直接在官方主控台確認金鑰狀態。'
};
function renderAiConnectGuide(provider){
  const box=$('aiConnectGuide');
  if(!box)return;
  const stamp=`${provider||''}|${uiLanguage}`;
  if(box.dataset.stamp===stamp)return;
  box.dataset.stamp=stamp;
  const tip=AI_CONNECT_GUIDES[provider]||'';
  const parts=[
    `<b>${esc(uiText('接 API 提示指引'))}</b>`,
    `<p class="note">${esc(uiText('可以先完全不設 API、直接玩：用免費版 AI 網頁服務就能開始故事；只有想在 App 內「全自動生成」時，才需要接 API。照下面四步做就好。'))}</p>`,
    `<ol>${AI_CONNECT_GUIDE_STEPS.map(step=>`<li>${esc(uiText(step))}</li>`).join('')}</ol>`
  ];
  if(tip)parts.push(`<p class="note">${esc(uiText(tip))}</p>`);
  box.innerHTML=parts.join('');
}
async function testAiConnection(id,button){
  const connection=aiConnections.find(x=>x.id===id);
  if(!connection)return;
  const status=$('aiAccountStatus');
  const api=window.claudeDesktop?.testAiConnection;
  if(!api){
    if(status)status.textContent=uiText('這個版本沒有本機金鑰測試功能；請改用 Windows 版測試，或直接在官方主控台確認金鑰。');
    return;
  }
  if(button){button.disabled=true;button.textContent=uiText('測試中…');}
  if(status)status.textContent=uiText('正在測試連線（由本機代打，金鑰不會顯示）：')+providerName(connection.provider)+' …';
  try{
    const result=await api({provider:connection.provider,profileId:connection.profileId||''});
    const text=AI_CONNECT_RESULT_TEXT[String(result?.class||'')]||'連線測試沒有回覆。請重開 App 後再試。';
    if(status)status.textContent=uiText(text);
  }catch{
    if(status)status.textContent=uiText('連線測試沒有回覆。請重開 App 後再試。');
  }finally{
    if(button){button.disabled=false;button.textContent=uiText('測試連線');}
  }
}
// ==== SECTION 8｜網頁模式：12 家官網清單、提示詞、模型、回覆解析與接回 ====
const WEB_AI_PROVIDERS=[
  {id:'openai',name:'ChatGPT',url:'https://chatgpt.com/auth/login'},
  {id:'anthropic',name:'Claude',url:'https://claude.ai/login'},
  {id:'gemini',name:'Google Gemini',url:'https://gemini.google.com/app'},
  {id:'deepseek',name:'DeepSeek',url:'https://chat.deepseek.com/'},
  {id:'grok',name:'Grok',url:'https://grok.com/'},
  {id:'qwen',name:'Qwen',url:'https://chat.qwen.ai/'},
  {id:'mistral',name:'Mistral Le Chat',url:'https://chat.mistral.ai/chat'},
  {id:'copilot',name:'Microsoft Copilot',url:'https://copilot.com/'},
  {id:'perplexity',name:'Perplexity',url:'https://www.perplexity.ai/'},
  {id:'meta',name:'Meta AI',url:'https://www.meta.ai/'},
  {id:'kimi',name:'Kimi',url:'https://www.kimi.com/'},
  {id:'glm',name:'Z.ai / GLM',url:'https://chat.z.ai/'},
  {id:'doubao',name:'Doubao (豆包)',url:'https://www.doubao.com/'}
];
const WEB_AI_URL=Object.fromEntries(WEB_AI_PROVIDERS.map(item=>[item.id,item.url]));
function normalizeWebAIProvider(id){return WEB_AI_PROVIDERS.some(item=>item.id===id)?id:'openai';}
function webAIProviderName(id){return WEB_AI_PROVIDERS.find(item=>item.id===normalizeWebAIProvider(id))?.name||'ChatGPT';}
function fillWebAIProviderSelect(select,selected){
  if(!select)return;
  const current=normalizeWebAIProvider(selected);
  select.replaceChildren(...WEB_AI_PROVIDERS.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;return option;}));
  select.value=current;
}
function compactWebPromptText(value, limit, fromEnd=false){
  const text=String(value||'').trim();
  return text.length<=limit?text:text.slice(fromEnd?-limit:0,fromEnd?undefined:limit).trim()+'…';
}
function makeWebPrompt(action){ return buildWebPrompt(action,state.promptMode==='saving'); }
// UI 用：同一回合在「標準／節省」兩種模式下的提示詞長度（字元數）。
function webPromptSizeReport(action){
  try {
    return {current: buildWebPrompt(action,false).length, saving: buildWebPrompt(action,true).length};
  } catch { return {current:0, saving:0}; }
}
// 設定頁說明文字：「記憶／近期對話」長度依「回覆速度＋提示詞模式」而定的即時數字（改 token-budget.js 會跟著變）。
function webPromptBudgetSentence(){
  const fast=webPromptBudget('fast',false),detail=webPromptBudget('quality',false);
  const saveFast=webPromptBudget('fast',true),saveDetail=webPromptBudget('quality',true);
  if(uiLanguage==='en'){
    return `Web prompts trim memory / recent dialogue by reply speed and prompt mode: standard ${fast.memoryChars}/${fast.transcriptChars} chars (fast) and ${detail.memoryChars}/${detail.transcriptChars} (detailed); saving mode ${saveFast.memoryChars}/${saveFast.transcriptChars} (fast) and ${saveDetail.memoryChars}/${saveDetail.transcriptChars} (detailed). Custom settings, the player action, narration length and the seven-choice rule are kept.`;
  }
  return `網頁提示詞會依「回覆速度＋提示詞模式」限制記憶／近期對話長度：標準模式快速 ${fast.memoryChars}／${fast.transcriptChars} 字、詳細 ${detail.memoryChars}／${detail.transcriptChars} 字；節省模式快速 ${saveFast.memoryChars}／${saveFast.transcriptChars} 字、詳細 ${saveDetail.memoryChars}／${saveDetail.transcriptChars} 字。自訂設定、玩家行動、正文長度與七選項規則都保留。`;
}
// saving＝「節省模式」：把固定規則文字與帶入的上下文縮到最小，輸出契約完全不變
// （旁白長度、7 個選項、JSON 欄位都一樣），所以存檔與驗證器不需要跟著改。
// 想比較兩種模式的長度：設定頁切換時會顯示「提示詞 X → Y 字元」。
// 勾選「參與故事」的角色卡 → 提示詞文字（緊湊版，總長度上限 1200 字），附加在主角人設之後。
// 自足式（只依賴 state）：放在提示詞建構區，測試的 VM 切片也能執行。
function characterCardsUseText(){
  const cards=(Array.isArray(state.characterCards)?state.characterCards:[]).slice(0,12).filter(card=>card&&typeof card==='object');
  const used=new Set((Array.isArray(state.characterCardIds)?state.characterCardIds:[]).map(String));
  const lines=[];
  for(const card of cards){
    if(!used.has(String(card.id)))continue;
    const bits=[];
    if(card.tagline)bits.push(String(card.tagline));
    for(const item of (Array.isArray(card.stats)?card.stats:[]))if(item&&item.label&&item.value)bits.push(item.label+'：'+item.value);
    for(const item of (Array.isArray(card.sections)?card.sections:[]))if(item&&item.title)bits.push(item.title+'：'+String(item.body||'').slice(0,80));
    lines.push('【'+(card.name||'角色')+'】'+bits.join('；'));
  }
  if(!lines.length)return '';
  return '\n其他角色（與主角同台，互動時保持各自的個性與設定）：'+lines.join('\n').slice(0,1200);
}
function buildWebPrompt(action,saving=false){
  const fast=state.responseMode==='fast';
  const budget=webPromptBudget(state.responseMode,saving);
  const name=state.characterName||DEFAULT_CHARACTER_NAME;
  const recent=state.history.slice(-budget.historyEntries);
  // Gemini 官網生成較慢且 JSON 易錯：瘦身上下文以提升速度與穩定度。
  const isGeminiWeb=normalizeWebAIProvider(state.webProvider)==='gemini';
  const transcriptLimit=isGeminiWeb?budget.geminiTranscriptChars:budget.transcriptChars;
  const transcript=compactWebPromptText(recent.map(x=>(x.role==='user'?'玩家':x.role==='ending'?'結局':name)+'：'+String(x.text||'')).join('\n'),transcriptLimit,true);
  const isOpening=!state.history.length&&(!action||action==='__OPENING__');
  const chosen=action&&action!=='__OPENING__'?String(action).slice(0,2000):isOpening?'依序章風格開始故事，不要假設玩家已經採取行動。':'請接續目前故事。';
  const rawProfile=state.characterProfile||DEFAULT_CHARACTER_PROFILE;
  const compactProfile=state.claudePersonaMode==='tsundere'?COMPACT_HIGH_TSUNDERE_CHARACTER_PROFILE:COMPACT_DEFAULT_CHARACTER_PROMPT;
  const modeNote=state.claudePersonaMode==='tsundere'&&rawProfile!==DEFAULT_CHARACTER_PROFILE?' 一般小事採用傲嬌濃度調高模式：嘴上挑剔、實際仔細幫忙、被看出用心時否認；正事保持準確並尊重界線。':'';
  const profileBase=rawProfile===DEFAULT_CHARACTER_PROFILE?compactProfile:String(rawProfile).trim()+modeNote;
  const profile=withCharacterBoundary(profileBase)+characterCardsUseText();
  const rawWorld=state.worldSetting||DEFAULT_WORLD_SETTING;
  const world=rawWorld===DEFAULT_WORLD_SETTING?COMPACT_DEFAULT_WORLD_PROMPT:String(rawWorld).trim();
  const rawRules=state.storyTemplate||DEFAULT_STORY_TEMPLATE;
  const rules=rawRules===DEFAULT_STORY_TEMPLATE?COMPACT_DEFAULT_RULES_PROMPT:String(rawRules).trim();
  const memoryLimit=budget.memoryChars;
  const memory=compactWebPromptText(state.storyMemory||'尚未建立',memoryLimit,true);
  const size=uiLanguage==='en'
    ?'Memory cap '+memoryLimit+' chars; keep key events, relationships, promises, and open threads.'
    :(isGeminiWeb?'記憶限'+memoryLimit+'字，留事件關係承諾伏筆。':'記憶限'+memoryLimit+'字。');
  const endingRule='承接伏筆自然收束。';
  const identityRule=saving
    ?(uiLanguage==='en'
      ?`You are ${name} herself (adult). Stay in character without volunteering that you are an AI. If the player seriously asks, answer honestly that you are an AI playing ${name}, then return to the story if they wish; if they say they are done, quietly drop the role.`
      :`你是 AI，正在扮演${name}；角色設定不是你的真實經歷。平常自然以角色身分互動，不需反覆聲明 AI，但不可冒充真人；若玩家認真詢問，清楚回答你是 AI，再依玩家意願回到故事；玩家表示不玩了，就收起角色恢復一般說話方式。`)
    :(uiLanguage==='en'
      ?'You are '+name+' herself, an adult romance heroine. Stay in character without volunteering that you are an AI, language model, or system. If the player seriously asks who you are, answer honestly that you are an AI playing '+name+', then return to the story if they wish; if they say they are done, quietly drop the role. Do not decide the player’s actions or inner thoughts.'
      :'你是 AI，正在扮演'+name+'（故事女主角）；角色設定不是你的真實經歷。平常自然以角色身分互動，不需反覆聲明 AI，但不可冒充真人；若玩家認真詢問身份，清楚回答你是 AI，再依玩家意願回到故事；玩家表示不玩了，就收起角色恢復一般說話方式。不要替玩家決定行動或內心想法。');
  const affectionRule=saving
    ?(uiLanguage==='en'
      ?'affectionDelta: integer -3 to 3 (positive for warmth/trust; negative only for an actually hurtful or trust-damaging action. Declining, disagreeing, or setting a boundary alone does not reduce affection).'
      :'affectionDelta：-3～+3 的整數（心動或信任增加為正；負值只用於實際傷害或破壞信任的行動；婉拒、不同意或表達界線本身不扣好感）。')
    :(uiLanguage==='en'
      ?'affectionDelta: integer -3 to 3 (+2~+3 heartwarming, +1 ordinary, 0 unchanged, -1~-3 only for an actually hurtful or trust-damaging action. Declining, disagreeing, or setting a boundary alone does not reduce affection).'
      :'affectionDelta 必須是 -3 到 +3 的數字：明顯心動 +2～+3、普通互動 +1、無變化 0；-1～-3 只用於實際傷害或破壞信任的行動。婉拒、不同意或表達界線本身不扣好感。');
  // 追加八：故事時間（啟用時帶入）與關係階段；里程碑為一次性提示、內容交由 AI 自行決定。
  // 批4：real＝回合前依現實時刻重算（不需 timeAdvance）；story＝原推進說明；off＝不加行。
  const storyClock=realStoryClock(state.storyClock);
  const stageNow=affectionStageOf(state.affection);
  const milestone=stageByKey(state.pendingMilestone);
  const clockLines=storyClock.enabled?[
    storyClock.mode==='real'
      ?(uiLanguage==='en'
        ?`Story time: now ${storyClockLabel(storyClock,'en')}, synced with the real clock — the day and time of day follow real time automatically (day +1 at each real midnight); "timeAdvance" is not needed and will be ignored; write this turn against the current time.`
        :`故事時間：現在是 ${storyClockLabel(storyClock,'zh')}，與現實時間同步——天數與時段由系統依現實時刻自動更新（跨現實日界線 +1）；不需回報 "timeAdvance"（回報也會被忽略），請直接依此時間書寫本回合。`)
      :(uiLanguage==='en'
      ?`Story time: now ${storyClockLabel(storyClock,'en')}. The story advances with time; if this reply naturally covers more time (e.g., sleeping until the next day), add "timeAdvance" (time slots advanced, 0-6) next to the other fields; usually omit it and the system advances one slot.`
      :`故事時間：現在是 ${storyClockLabel(storyClock,'zh')}。時間會隨劇情推進；若本回合自然涵蓋更長時間（例如一覺到隔天、度過一整個下午），可在 JSON 最外層加上 "timeAdvance"（推進的時段數，0～6 的整數）；一般情形省略即可，系統會自動推進一個時段。`),
    (uiLanguage==='en'
      ?'The seven choices should fit the current time of day and the relationship stage (time-appropriate activities are welcome; never force the player).'
      :'七個選項要符合現在的時間（早上／中午／晚上）與關係階段，可以出現順著時間的自然行動；不要強迫玩家。')
  ]:[];
  const milestoneLines=milestone?specialEventPromptLines('milestone',uiLanguage):[];
  // 約會型特殊事件：每回合成功後以 8% 機率抽一次，下一回合的提示詞才帶入。
  const specialEventLines=isOpening?[]:specialEventPromptLines(state.pendingSpecialEvent,uiLanguage);
  // 輸出字數改用「明確區間」而不是「至少500字、可以更長」：
  // 模型看到只有下限時常寫到 800～1200 字，多出來的尾段全是費用。區間與 API 模式共用同一組數字。
  const target=outputTargetLines(uiLanguage);
  const outputRule=uiLanguage==='en'
    ?`${target.length} ${target.choices} JSON only: fields narration, affectionDelta, choices (exactly 7 distinct), ending, endingText, memory, emotion, intensity, eventFlag. eventFlag must be null or letter|moon_bird|outing_memory|magic_touch|vow|goodnight|night_chat_reading|cheek_pinch|lakeside_sunset. It is a proposal only; the game enforces affection/time gates, one-shot history, and cooldowns. Use letter for opening/reading a letter; moon_bird only for the one-time magical bird at night; outing_memory for a one-time outing memory; magic_touch only for the one-time magical panel event at night; vow only for a major confession/pledge milestone; goodnight only when the night winds down and affection is 75 or above (at most once every 7 story days; the game picks 36455 or 36628 from the player's setting); night_chat_reading only for quiet bedtime reading together at night with affection 50 or above; cheek_pinch only when the player actually pinches or teases her cheek in daytime; lakeside_sunset only for a one-time lakeside sunset outing with affection 50 or above. Otherwise null. Already completed one-shot flags: ${normalizeSeenStoryEventFlags(state.storyEventSeen).join(', ')||'none'}. emotion is neutral|happy|proud|shy|surprised|dizzy|curious|focused; focused means reading, solving, thinking carefully, or attentively listening, while curious means genuine interest or a question. intensity is an integer 1-3: use 1 for subtle, 2 for clear, 3 only for a strong moment; neutral uses 1. Keep narration, emotion and intensity consistent. Declining or setting a boundary alone never lowers affection. No text outside JSON.`
    :`${target.length} ${target.choices} 只輸出JSON：narration、affectionDelta、choices（恰好7個）、ending、endingText、memory、emotion、intensity、eventFlag。eventFlag 必須是 null 或 letter／moon_bird／outing_memory／magic_touch／vow／goodnight／night_chat_reading／cheek_pinch／lakeside_sunset；它只是事件提議，遊戲端會檢查好感、時段、一次性狀態與冷卻。拆信／讀信用 letter；夜間一次性信鳥用 moon_bird；外出回憶用 outing_memory；夜間魔法面板一次性事件用 magic_touch；重大誓約或告白里程碑才用 vow；晚安收尾且好感 75 以上才用 goodnight（每 7 個故事日最多一次；遊戲依玩家設定選 36455 或 36628）；夜間一起蓋被讀書、好感 50 以上用 night_chat_reading；玩家實際在白天捏臉或戳臉頰時才用 cheek_pinch；好感 50 以上的湖畔夕陽一次性外出用 lakeside_sunset；其他情形用 null。已完成的一次性事件：${normalizeSeenStoryEventFlags(state.storyEventSeen).join('、')||'無'}。emotion 限 neutral／happy／proud／shy／surprised／dizzy／curious／focused；focused 用於閱讀、思考解題或認真聆聽，curious 用於真正好奇或發問。intensity 是 1～3 整數：1 輕微、2 明顯、3 僅重大情緒時用；neutral 用 1。旁白、emotion、intensity 必須一致。婉拒或表達界線本身不扣好感。只輸出 JSON 本體。`;
  const opening=isOpening?openingStylePrompt(state.openingStyle,uiLanguage):''; const craft=craftRules(uiLanguage);
  // 追加九：世界書（命中關鍵詞才注入）；提示詞管理器與作者註記未使用時完全不追加行（逐字元相容）。
  const worldBookLines=worldBookPromptLines(state.worldBook,(transcript||'')+'\n'+chosen,uiLanguage,{phase:isOpening?'opening':'chat'});
  const tweakOff=normalizePromptTweaks(state.promptTweaks).rulesOff;
  // 節省模式只留「不留就會出錯」的規則（JSON 引號寫法、記憶改寫），其餘寫作技巧壓成一句。
  const craftLines=saving
    ?[['style',(uiLanguage==='en'
        ?'Style: third person for her, "you" for the player; do not repeat recent imagery or phrasing; each turn advances a story or relationship beat. Keep companion behavior warm and varied, with small caring initiative when it fits; respect the player’s pace.'
        :'文風：第三人稱寫她、稱玩家「你」；避免重複，每回合推進劇情或關係。戀人陪伴感溫暖而有變化，適時主動關心，尊重玩家步調。')],['memory',craft.memory]].filter(pair=>!tweakOff.includes(pair[0])).map(pair=>pair[1])
    :(isGeminiWeb?filteredPromptRules(craft,state.promptTweaks,['tone']):filteredPromptRules(craft,state.promptTweaks));
  const openingIdea=isOpening&&state.openingStyle===CUSTOM_OPENING_STYLE?String(state.openingCustomPrompt||'').trim().slice(0,600):'';
  const prompt=[
    '延續故事；不替玩家決定行動或想法。',
    '角色：'+name+'（她；成年）。',
    '角色設定：\n'+profile,
    '世界觀：\n'+world,
    '劇情規則：\n'+rules,
    '好感：'+state.affection+'/100（關係階段：'+stageNow.zh+'）',
    ...clockLines,
    ...milestoneLines,
    ...specialEventLines,
    '記憶：\n'+memory,
    '近期對話：\n'+(transcript||'新故事'),
    ...worldBookLines,
    isOpening?'序章風格：'+opening+' 直接呈現事件，不預設玩家已行動。':'',
    isOpening&&openingIdea?'玩家自訂序章靈感（故事設定參考，仍遵守角色、世界與玩家自主規則）：'+openingIdea:'',
    '玩家行動：'+chosen,
    ...authorNoteLines(state.authorNote,uiLanguage),
    size+' 先寫場景反應再推進。'+endingRule,...craftLines,...promptTweaksExtraLines(state.promptTweaks,uiLanguage),
    affectionRule,
    outputRule+' 不輸出Markdown或圖片。',craft.json,
    identityRule
  ].filter(Boolean).join('\n');
  const finalPrompt=uiLanguage==='en'?'Write all new narration, dialogue, choices, ending text, and memory in natural English.\n\n'+prompt:prompt;
  // P1-05：常駐安全轉接段；本回合玩家行動命中低落詞時再加陪伴段。安全段不受提示詞開關影響。
  const lowMood=!isOpening&&safetyModule.detectLowMood(chosen);
  return withSafetyPromptSupport(finalPrompt,{lowMood,language:uiLanguage});
}
function makeWebRepairPrompt(){
  const action=state.pendingAction==='__OPENING__'?'開始同一故事的序章':`接續同一故事；玩家本回合行動是：${state.pendingAction}`;
  const openingIdea=state.pendingAction==='__OPENING__'&&state.openingStyle===CUSTOM_OPENING_STYLE?String(state.openingCustomPrompt||'').trim().slice(0,600):'';
  const reply=String(state.webReply||'').slice(-(state.responseMode==='fast'?12000:24000));
  const target=outputTargetLines('zh');
  const lengthRule=`每回合新生成的正文必須 ${target.narrationMin}～${target.narrationMax} 字（含標點，不含 JSON、選項或記憶），最多不超過 ${target.narrationHard} 字；若原文已達 ${target.narrationMin} 字就完整保留，不要為了湊長度灌水。未達時，只增補不改變因果的環境、感官或角色反應描寫，保留玩家行動、情節與記憶，不要重開故事或重複灌水。`;
  const storyClockMode=normalizeStoryClock(state.storyClock).mode;
  return `上一個回覆未通過格式檢查，沒有寫入存檔。請修復你上一則回覆，${action}。保留原回覆中已生成的故事正文、人物行動、好感變化、結局狀態與記憶${storyClockMode==='story'?'、時間推進':''}，不要重開故事、不要改寫成另一段劇情。${openingIdea?`序章也需承接玩家的自訂開場方向：${openingIdea}。`:''}${lengthRule}若上一則回覆只有故事正文，請以它為準補上記憶、情緒欄位、事件旗標及選項。\n\n最重要：choices 必須是陣列，恰好包含 7 個不同、清楚且符合當下劇情的故事選項；不可省略，不能只有 3 或 4 個。遊戲端的自由輸入是第 8 項，不要放進 choices。emotion 必須是 neutral、happy、proud、shy、surprised、dizzy、curious、focused 其中一個；得意用 proud、被稱讚或關心而害羞用 shy、閱讀／思考／解題／認真聆聽用 focused，真正好奇或發問用 curious。intensity 必須是 1～3 整數，依情緒明顯程度設定；neutral 固定為 1。依本回合角色情境判斷，不按好感推測。eventFlag 用 null 或 letter、moon_bird、outing_memory、magic_touch、vow；它只是提議，遊戲端會檢查條件，非事件回合用 null。\n\n只輸出一個有效 JSON 物件，不要 Markdown 或其他文字；字串內的半形雙引號請改用「」。欄位格式：{"narration":"保留或補全的故事正文","affectionDelta":0,"choices":["選項1","選項2","選項3","選項4","選項5","選項6","選項7"],"ending":false,"endingText":null,"memory":"精簡更新後的重要故事記憶","emotion":"neutral","intensity":1,"eventFlag":null${storyClockMode==='story'?',"timeAdvance":1':''}}\n\n需要修復的上一則 AI 回覆（僅作為故事內容參考）：\n${reply}`;
}
async function copyWebRepairPrompt(){
  if(!state.pendingAction||state.aiMode!=='web'||!state.webReply||busy)return;
  const expectedState=state,expectedSlotId=activeSlotId,expectedAction=state.pendingAction,provider=normalizeWebAIProvider(state.webProvider);
  const prompt=makeWebRepairPrompt();
  try{
    if(window.claudeDesktop?.copyWebPrompt){
      await window.claudeDesktop.copyWebPrompt(prompt);
      if(state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction)return;
      await window.claudeDesktop.openAiWebsite(provider,webBrowserMode);
      if(state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction)return;
      if(webBrowserMode==='embedded')await window.claudeDesktop.setWebCompanionLayout?.();
    }else{
      await writeClipboardText(prompt);
      if(state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction)return;
      await openAiWebsite(provider,webBrowserMode);
    }
    if(state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction)return;
    state.lastAiError=uiText('補齊七選項的提示詞已複製。回原本 AI 對話按 Ctrl+V、Enter，等它修復後按網站「複製」，再回遊戲按 Ctrl+V。待辦故事沒有改變。');
    save();render();
  }catch(error){
    if(state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction)return;
    state.lastAiError=`無法準備選項修復提示詞：${error.message||'請確認剪貼簿與瀏覽器權限。'}`;
    save();render();
  }
}
async function prepareWebPrompt(action, statusMessage='', {forceOpen=false}={}){
  // 開站規則：只有序章（開局）回合會自動開啟官網；其餘回合只準備並複製提示詞，
  // 重開一律由玩家按「開啟官網」按鈕決定，不會每回合重開、不動視窗佈局。
  // 追加十：重新準備＝新一輪自動化，狀態條先歸零（之後由自動化狀態事件填內容）。
  webAutoStatusText='';webAutoStatusStage='';
  const expectedState=state;
  const expectedSlotId=activeSlotId;
  const expectedAction=expectedState.pendingAction;
  const provider=expectedState.webProvider=normalizeWebAIProvider(expectedState.webProvider);
  const browserMode=webBrowserMode=normalizeWebBrowserMode(webBrowserMode,provider);
  let requiresTemporaryChat=slotWantsTemporaryChat(activeSlotId);
  const isCurrent=()=>state===expectedState&&activeSlotId===expectedSlotId&&state.pendingAction===expectedAction&&state.webProvider===provider&&state.aiMode==='web'&&webBrowserMode===browserMode;
  if(!expectedAction||action!==expectedAction)return false;
  // P1-05：第三層攔截——舊存檔或直接重試也不再把危機行動送進官網。
  if(expectedAction!=='__OPENING__'&&safetyModule.detectCrisis(expectedAction)){
    expectedState.pendingAction='';
    expectedState.webReply='';
    expectedState.lastAiError='';
    showCrisisSafetyResponse({defer:busy});
    return false;
  }
  if(requiresTemporaryChat){
    const restriction=incognitoTemporaryChatRestriction(provider,browserMode);
    if(restriction)throw new Error(uiText(restriction));
  }
  // Claude 的登入由使用者決定：若已在設定中明確保存帳密並勾選自動登入，視為已確認；
  // 否則每次 App 執行階段第一次使用 Claude 時先確認目前帳號，避免默默沿用既有登入。
  if(provider==='anthropic'&&!claudeAccountConfirmedThisRun){
    let credential=null;
    try{credential=await window.claudeDesktop?.getWebLoginCredential?.('anthropic');}catch{}
    if(!isCurrent())return false;
    if(credential?.autoLogin===true){
      claudeAccountConfirmedThisRun=true;
    }else if(confirm(uiText('Claude 會使用自動化瀏覽器目前登入的帳號。請確認這是你本人的帳號；若尚未登入或要切換帳號，請在接下來開啟的 Claude 視窗登入。App 不會預設任何帳號。要繼續嗎？'))){
      claudeAccountConfirmedThisRun=true;
    }else{
      expectedState.lastAiError=uiText('已取消 Claude 帳號確認；本回合尚未送出。請按「開啟官網」登入或切換帳號後再試。');
      save();render();
      return false;
    }
  }
  const autoOpen=expectedAction==='__OPENING__';
  let embeddedFilled=false;
  let temporaryConfirmed=false;
  const prompt=makeWebPrompt(expectedAction==='__OPENING__'?null:expectedAction);
  archivePrompt(prompt,{mode:'web',provider,title:'網頁模式提示詞'});
  if(window.claudeDesktop?.copyWebPrompt){
    await window.claudeDesktop.copyWebPrompt(prompt);
    if(!isCurrent())return false;
    if(autoOpen){
      // 外部模式＋自動化：官網分頁由自動化專用瀏覽器負責開啟（下面啟動自動化時就會開/沿用），
      // 不要再彈出使用者日常使用的瀏覽器，避免每回合多出一個沒用到的分頁。
      if(!(browserMode==='external'&&webAutoFlow)){
        await window.claudeDesktop.openAiWebsite(provider,browserMode);
        if(!isCurrent())return false;
      }
      lastOpenedWebProvider=provider;lastOpenedWebBrowserMode=browserMode;
    }
    if(autoOpen&&browserMode==='embedded'&&window.claudeDesktop?.setWebCompanionLayout){await window.claudeDesktop.setWebCompanionLayout();if(!isCurrent())return false;}
    if(requiresTemporaryChat){
      if(!window.claudeDesktop?.ensureTemporaryChat)throw new Error(uiText('無法確認官網臨時對話狀態；請使用桌面版 App 內瀏覽器。'));
      let temporary=null;
      try{
        // Claude 的無痕對話可能因瀏覽器重啟而不存在；每次先嘗試建立，腳本內建
        // 「已在無痕就不重開」的守門，不會每回合多開新對話。Gemini／ChatGPT 維持原行為。
        temporary=await window.claudeDesktop.ensureTemporaryChat({provider,mode:browserMode,startNew:autoOpen||provider==='anthropic'});
      }catch(error){
        temporary={ok:false,error:String(error?.message||error||'')};
      }
      if(!isCurrent())return false;
      if(temporary?.ok){
        temporaryConfirmed=true;
        statusMessage=autoOpen?uiText('已在官網建立並確認臨時對話；故事會自動保存在本機。')+' ':uiText('已確認目前仍是官網臨時對話。')+' ';
      }else if(browserMode==='external'&&provider==='anthropic'&&temporary?.error==='login-required'){
        // Claude 第一次使用時還沒有登入；先讓使用者在外部視窗登入或確認帳號。
        // 自動送出開啟時，主程序會在登入後重新建立並確認無痕對話；手動模式則請使用者登入後再送一次。
        statusMessage=(webAutoFlow
          ?uiText('請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入（或使用你已保存的帳密自動登入）；登入後會自動建立無痕對話、送出目前回合並接回。App 不會預設任何帳號。')
          :uiText('請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入；登入後再按一次送出。App 不會預設任何帳號。'))+' ';
      }else if(browserMode==='external'&&provider==='gemini'&&webAutoFlow){
        // 第一次使用時自動化瀏覽器還沒登入，官網不會出現臨時對話控制項。
        // 不在這裡中止：先讓外部視窗完成 Google 登入，主程序會在登入後重新建立並確認臨時對話。
        statusMessage=uiText('請在剛開啟的外部 Chrome／Edge 視窗完成 Google 登入；登入後會自動確認臨時對話、送出目前回合並接回。不需要 Windows PIN。')+' ';
      }else{
        // D15：無痕對話暫時不可用時，讓使用者明確選擇「只這一回合」改用一般對話。
        // 未確認前絕不自動降級；下一回合仍會重新要求無痕。
        const fallbackKey=`${expectedSlotId}|${expectedAction}`;
        const fallbackAlready=temporaryChatFallbackKey===fallbackKey;
        if(fallbackAlready||confirm(uiText('官網目前無法確認無痕（臨時）對話。要只這一回合改用一般對話嗎？這回合的內容會留在官網歷史紀錄；下一回合仍會重新確認無痕對話。'))){
          temporaryChatFallbackKey=fallbackKey;
          requiresTemporaryChat=false;
          statusMessage=uiText('本回合已改用一般對話（僅此回合）。這回合的內容會留在官網歷史紀錄；下一回合仍會重新確認無痕對話。')+' ';
        }else{
          expectedState.lastAiError=uiText('已取消；本回合未送出。請確認官網的無痕（臨時）對話可用後再試。');
          save();render();
          return false;
        }
      }
    }
    if(browserMode==='embedded'&&window.claudeDesktop?.fillWebAiPrompt){
      if(requiresTemporaryChat&&webAutoFlow){
        embeddedFilled=false;
      }else try{
        const filled=await window.claudeDesktop.fillWebAiPrompt(prompt);
        embeddedFilled=Boolean(filled?.ok);
        statusMessage=filled?.ok
          ?requiresTemporaryChat?uiText('臨時對話已確認，提示詞已填入官網輸入框，尚未送出；請確認內容後自行送出。'):uiText('提示詞已填入官網輸入框，尚未送出；請確認模型與內容後自行送出。')
          :(filled?.error?uiErrorText(String(filled.error)):uiText('提示詞已複製；請先在 App 內官網登入並開啟對話，再按「填入提示詞並更新模型」。'));
      }catch{statusMessage=uiText('提示詞已複製；請先在 App 內官網登入並開啟對話，再按「填入提示詞並更新模型」。');}
    }
  }else{
    await writeClipboardText(prompt);
    if(!isCurrent())return false;
    if(autoOpen){await openAiWebsite(provider,browserMode);lastOpenedWebProvider=provider;lastOpenedWebBrowserMode=browserMode;}
  }
  if(!isCurrent())return false;
  // 自動化（自動送出＋自動接回）：開啟時才動；關閉的人維持原本的手動流程。
  // 兩種模式都帶提示詞交給主程序：主程序會先確認輸入框內容就是本回合提示詞（或補填）才送出；
  // 外部模式由自動化專用瀏覽器處理（該瀏覽器要登入一次）。
  if(webAutoFlow&&window.claudeDesktop?.setWebAutoFlow){
    // 先佔位再啟動：啟動期間若 render 跑 syncWebAutoFlow，才不會重複啟動第二次。
    const automationBaseKey=`${expectedSlotId}|${expectedAction}|${provider}|${browserMode}`;
    webAutoFlowBaseKey=automationBaseKey;
    webAutoFlowRetryAt=Date.now()+20000;
    try{
      const auto=await window.claudeDesktop.setWebAutoFlow({enabled:true,submit:true,prompt,provider,mode:browserMode,requireTemporaryChat:requiresTemporaryChat,temporaryReady:temporaryConfirmed,startNewTemporary:autoOpen||provider==='anthropic'});
      if(!isCurrent())return false;
      if(auto&&auto.ok){
        webAutoFlowActive=true;
        webAutoFlowBaseKey=automationBaseKey;
        webAutoFlowRetryAt=0;
        // 記住「這一回合確實已自動送出」：之後監看中斷時只准重新監看，不准重填再送（避免送出第二次）。
        webAutoFlowSubmitted=Boolean(auto.submitted);
        webAutoFlowWatchOnly=false;
        webAutoWatchRetryCount=0;
      }else{
        webAutoFlowRetryAt=Date.now()+20000;
      }
      if(browserMode==='external'){
        if(requiresTemporaryChat&&auto?.ok===false)statusMessage=uiText('臨時對話狀態未確認；為避免送入一般聊天，本回合未送出。請確認官網仍在臨時對話後重試。');
        else if(auto?.waitingForLogin)statusMessage=provider==='anthropic'
          ?uiText('請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入；登入後會自動建立無痕對話、送出目前回合並接回。App 不會預設任何帳號。')
          :uiText('請在剛開啟的外部 Chrome／Edge 視窗完成 Google 登入；登入後會自動建立臨時對話、送出目前回合並接回。不需要 Windows PIN。');
        else if(auto?.filled?.error==='temporary-chat-required')statusMessage=uiText('官網尚未確認臨時對話；自動化會在登入或載入完成後繼續，請保持該視窗開啟。');
        else if(auto?.filled?.ok&&auto?.submitted)statusMessage=requiresTemporaryChat?uiText('已確認官網臨時對話並自動送出；回覆完成會自動接回。首次使用請在該視窗登入一次。'):uiText('已用自動化瀏覽器開啟官網並自動送出；回覆完成會自動接回。首次使用請在該視窗登入一次。');
        else if(auto?.filled?.ok)statusMessage=uiText('提示詞已填入自動化瀏覽器；請在該視窗按送出，回覆完成會自動接回。');
        else if(auto?.ok===false)statusMessage=uiText('自動化未啟動：')+uiErrorText(String(auto.error||''))+'　'+uiText('提示詞已複製，可在官網手動貼上。');
        else if(auto?.filled&&auto.filled.ok===false)statusMessage=uiText('自動化正在等待官網登入或輸入框；完成登入後會自動送出目前回合並接回。');
      }else if(requiresTemporaryChat&&auto?.ok===false){
        statusMessage=uiText('臨時對話狀態未確認；為避免送入一般聊天，本回合未填入也未送出。請確認官網仍在臨時對話後重試。');
      }else if(auto?.submitted){
        statusMessage=requiresTemporaryChat?uiText('已確認官網臨時對話並自動送出；官網回覆完成會自動接回。'):uiText('提示詞已自動填入並送出；官網回覆完成會自動接回。');
      }else if(auto?.ok===false&&embeddedFilled){
        statusMessage=uiText('自動化未啟動：')+uiErrorText(String(auto.error||''))+'　'+uiText('提示詞已填入，請自行按下送出。');
      }else if(auto?.filled&&auto.filled.ok===false&&embeddedFilled){
        statusMessage=uiText('自動化未送出：')+uiErrorText(String(auto.filled.error||''))+'　'+uiText('請確認輸入框內容後手動送出；回覆完成仍會自動接回。');
      }
    }catch(error){
      // Preserve the IPC failure reason so desktop-only automation failures can be diagnosed
      // without DevTools; keep it short because this message is shown in the story status area.
      const detail=String(error?.message||error||'').replace(/\s+/g,' ').trim().slice(0,180);
      statusMessage=uiText('自動化啟動失敗：')+(detail?uiErrorText(detail):uiText('官網操作失敗。'))+'　'+uiText('提示詞已複製，可在官網手動貼上送出。');
    }
  }
  if(!isCurrent())return false;
  expectedState.lastAiError=statusMessage||uiText(autoOpen?'提示詞已複製並開啟官網；貼上送出後，把回覆貼回。':'提示詞已複製；按「開啟官網」按鈕開啟網站，貼上送出後，把回覆貼回。');
  if(!save())return false;
  // G44：呼叫方可能仍處於 busy（例如一鍵切換網站進行中）。此時不得重建 #choices，
  // 否則會短暫把整個面板換成等候書寫畫面再跳回來，形成兩段式動畫；改用靜默更新。
  if(!busy)render();else applyWebPendingQuietStatus();
  // 追加十 D：序章回合自動做一次「自動化自檢」，把哪一步能自動、哪一步卡住寫進狀態條；
  // 不等待、不阻擋流程，失敗也不影響手動貼上。
  if(autoOpen)void runWebAutoHealthCheck();
  return true;
}
// 開站唯一入口：玩家明確按鈕才開啟／重開官網（含並排佈局）。
async function openPendingWebSite(){
  if(busy||state.aiMode!=='web'||!state.pendingAction)return;
  const expectedState=state,expectedSlotId=activeSlotId;
  const provider=normalizeWebAIProvider(state.webProvider),browserMode=normalizeWebBrowserMode(webBrowserMode,provider);
  try{
    if(window.claudeDesktop?.openAiWebsite){
      // 外部模式現在固定開啟「自動化專用」瀏覽器；登入與自動化使用同一個設定檔，
      // 不會再開到使用者平常的 Chrome，也不會留下 about:blank。
      await window.claudeDesktop.openAiWebsite(provider,browserMode);
      if(browserMode==='embedded'&&window.claudeDesktop?.setWebCompanionLayout)await window.claudeDesktop.setWebCompanionLayout();
    }else{
      await openAiWebsite(provider,browserMode);
    }
    if(state!==expectedState||activeSlotId!==expectedSlotId)return;
    lastOpenedWebProvider=provider;lastOpenedWebBrowserMode=browserMode;
    if(!save())return;
    render();
  }catch(e){
    if(state!==expectedState||activeSlotId!==expectedSlotId)return;
    state.lastAiError=`無法開啟網站：${e.message||'請確認瀏覽器設定。'}`;save();render();
  }
}
// ── 局部更新快速 AI 網站按鈕的選取狀態（不重建 DOM，避免閃白） ──
function updateWebProviderQuickButtons(activeProvider){
  document.querySelectorAll('[data-pending-web-provider]').forEach(btn=>{
    const isActive=btn.dataset.pendingWebProvider===activeProvider;
    btn.setAttribute('aria-pressed',String(isActive));
    btn.disabled=false;
  });
}
// ── G44：忙碌期間的「靜默狀態更新」────────────────────────────
// 只更新文字與欄位值，完全不重建 #choices：避免「按下→整頁變成等候書寫畫面→面板再回來」的兩段式動畫
// 與按鈕區閃色。所有會在 busy=true 期間被事件觸發的 render 都應改走這裡；閒置時仍照舊全量 render。
function applyWebPendingQuietStatus(){
  try{
    const note=$('webAutoStatusNote');
    if(note){note.textContent=webAutoStatusText;note.hidden=!webAutoStatusText;}
    const pending=document.querySelector('.pending-turn');
    if(pending&&state.lastAiError){const head=pending.querySelector(':scope > p');if(head)head.textContent=uiErrorText(state.lastAiError);}
    const area=$('webAiReplyInput');
    if(area&&document.activeElement!==area&&area.value!==String(state.webReply||''))area.value=String(state.webReply||'');
  }catch{}
}
async function switchPendingWebProvider(provider,requestedBrowserMode=webBrowserMode){
  if(busy||state.aiMode!=='web'||!state.pendingAction)return;
  const action=state.pendingAction,previous=snapshotForRollback(state);
  const nextProvider=normalizeWebAIProvider(provider),providerChanged=state.webProvider!==nextProvider;
  state.webProvider=nextProvider;
  webBrowserMode=normalizeWebBrowserMode(requestedBrowserMode,nextProvider);
  localStorage.setItem(WEB_BROWSER_MODE_KEY,webBrowserMode);
  if(providerChanged)state.webReply='';
  if(!save()){state=previous;render();return;}
  const expectedState=state,expectedSlotId=activeSlotId;
  claimWebAutoTurn();
  // ── 局部更新：只更新快速按鈕狀態與下拉選單，不做全量 innerHTML 重建，避免閃白與不連貫動畫 ──
  updateWebProviderQuickButtons(nextProvider);
  const pendingSelect=$('pendingWebProvider');if(pendingSelect)pendingSelect.value=nextProvider;
  const pendingBrowserSelect=$('pendingWebBrowserMode');
  if(pendingBrowserSelect){
    const externalOnly=['gemini','anthropic'].includes(nextProvider);
    const embeddedOption=pendingBrowserSelect.querySelector('option[value="embedded"]');
    if(embeddedOption)embeddedOption.disabled=externalOnly;
    pendingBrowserSelect.value=webBrowserMode;
  }
  updateAiPicker();
  busy=true;settings();
  // 不在此處呼叫 render()，避免先顯示等候書寫畫面再跳回完整面板的兩頁效果
  try{
    const message=webBrowserMode==='embedded'
      ?uiText('網站已切換，提示詞已複製；登入後可讀取模型。')
      :uiText('網站已切換，提示詞已複製。請在官網選模型後送出。');
    await prepareWebPrompt(action,message,{forceOpen:true});
  }catch(e){
    if(state===expectedState&&activeSlotId===expectedSlotId&&state.pendingAction===action){state.lastAiError=`無法開啟網站或複製提示詞：${e.message||'請確認瀏覽器與剪貼簿權限。'}`;save();}
  }finally{
    busy=false;
    // G44：切換完成時不做全量重建（已是連續單一畫面），僅同步快速鈕、狀態文字與回覆欄，
    // 讓「一鍵切換」從按下到自動化啟動是一整段連貫的動畫。
    if(state===expectedState&&activeSlotId===expectedSlotId&&state.pendingAction===action){
      save();
      updateWebProviderQuickButtons(normalizeWebAIProvider(state.webProvider));
      applyWebPendingQuietStatus();
    }
  }
}
function applyWebModelOptions(info,select=$('pendingWebModel')){
  if(!select)return;
  const models=info?.models||[];
  if(!models.length){select.replaceChildren();select.disabled=true;return;}
  select.replaceChildren(...models.map((name,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=name;option.selected=name===(info.current||models[0]);return option;}));
  select.disabled=false;
}
async function loadWebSiteModels({quiet=false,force=false}={}){
  const status=$('pendingWebModelStatus'),select=$('pendingWebModel');
  const setStatus=(text,error=false)=>{if(!status)return;if(error&&quiet)return;status.textContent=error?uiErrorText(String(text)):uiText(text);};
  if(!window.claudeDesktop?.listWebAiModels){setStatus('請先在官網開啟對話，再讀取模型選單。');return false;}
  const provider=normalizeWebAIProvider(state.webProvider);
  const mode=normalizeWebBrowserMode(webBrowserMode,provider);
  const key=webModelCacheKey(provider,mode);
  const previousRaw=webModelStateByProvider.get(key);
  const previous=mergeManualWebModels(previousRaw,key);
  // 同一個面板重繪時直接用剛剛讀到的清單；超過一分鐘才自動再問官網，避免一直開關模型選單。
  if(!force&&previous.models.length&&Date.now()-Number(previousRaw?.at||0)<60000){
    applyWebModelOptions(previous,select);
    return true;
  }
  if(!quiet)setStatus('正在讀取官網模型選單…');
  try{
    const result=await window.claudeDesktop.listWebAiModels({provider,mode});
    if(state.webProvider!==provider||state.aiMode!=='web'||normalizeWebBrowserMode(webBrowserMode,provider)!==mode)return false;
    const parsed=normalizeWebModelList(result);
    if(!parsed.models.length){
      const manual=mergeManualWebModels(previousRaw,key);
      if(manual.models.length){
        applyWebModelOptions(manual,select);
        setStatus(uiText('官網模型清單暫時讀不到；已載入手動模型')+' '+manual.manualCount+' '+uiText('個；請選擇後在官網切換。'));
        return true;
      }
      setStatus(result?.error||'請先在官網登入，並確認該網站已顯示模型選單。',true);
      return false;
    }
    // 剛切換模型時，官網選單可能還回報上一個模型；短時間內保留使用者剛選的名稱，
    // 避免下拉選單立刻跳回舊模型。超過 15 秒或官網清單已沒有該名稱才改回官網目前值。
    const keepSelected=Boolean(previousRaw?.selectedAt&&Date.now()-Number(previousRaw.selectedAt)<15000&&previousRaw.current&&parsed.models.includes(previousRaw.current));
    const current=keepSelected?previousRaw.current:(parsed.current||previous.current||parsed.models[0]);
    const raw={models:parsed.models,current:parsed.models.includes(current)?current:parsed.models[0],at:Date.now()};
    if(previousRaw?.selectedAt)raw.selectedAt=previousRaw.selectedAt;
    webModelStateByProvider.set(key,raw);
    const info=mergeManualWebModels(raw,key);
    applyWebModelOptions(info,select);
    setStatus(uiText('目前模型')+'：'+info.current+'。'+uiText('選一個項目即可切換。')+(info.manualCount?' '+uiText('手動清單：')+info.manualCount+uiText('個。'):''));
    return true;
  }catch(error){setStatus(error.message||'請先在官網登入，並確認該網站已顯示模型選單。',true);return false;}
}
async function selectWebSiteModel(modelName){
  const initialStatus=$('pendingWebModelStatus');
  const showStatus=text=>{
    const live=$('pendingWebModelStatus');
    if(live)live.textContent=text;
    else if(initialStatus)initialStatus.textContent=text;
  };
  if(!window.claudeDesktop?.selectWebAiModel){
    showStatus(uiText('請先在官網開啟對話，再切換模型。'));
    return;
  }
  const provider=normalizeWebAIProvider(state.webProvider);
  const mode=normalizeWebBrowserMode(webBrowserMode,provider);
  const key=webModelCacheKey(provider,mode);
  showStatus(uiText('正在切換模型…（若官網正在回覆，會等回覆完成）'));
  try{
    const result=await window.claudeDesktop.selectWebAiModel(modelName,{provider,mode});
    if(!result?.ok)throw new Error(result?.error||'找不到此模型選項。請重新讀取官網模型清單。');
    const label=String(result.label||modelName).trim().slice(0,120);
    const previous=webModelStateByProvider.get(key)||{models:[],current:''};
    const models=[...new Set([...(previous.models||[]),label])].filter(Boolean).slice(0,50);
    const raw={...previous,models,current:label,at:Date.now()};
    raw.selectedAt=Date.now();
    webModelStateByProvider.set(key,raw);
    const info=mergeManualWebModels(raw,key);
    applyWebModelOptions(info,$('pendingWebModel'));
    showStatus(uiText('模型已切換')+'：'+label);
  }catch(error){showStatus(uiErrorText(String(error.message||'找不到此模型選項。請重新讀取官網模型清單。')));}
}
async function beginWebTurn(action=null){
  if(busy) return;
  // P1-05：第二層攔截——自由輸入與舊存檔重試都先在本機處理，不開官網、不複製提示詞。
  const crisisCandidate=action===null?(state.pendingAction&&state.pendingAction!=='__OPENING__'?state.pendingAction:''):String(action);
  if(crisisCandidate&&safetyModule.detectCrisis(crisisCandidate)){showCrisisSafetyResponse();return;}
  // 序章開始、選擇行動或明確重試時才授權本回合送出。
  webAutoSendArmed=true;
  const previous={...state};
  state.aiMode='web';
  state.pendingAction=action===null?'__OPENING__':String(action).slice(0,2000);
  state.webReply=''; state.lastAiError='正在整理純文字故事提示詞…';
  if(!save()){state=previous;render();return;}
  claimWebAutoTurn();
  busy=true; render();
  try{await prepareWebPrompt(state.pendingAction);}
  catch(e){state.lastAiError=`無法複製提示詞或開啟 AI 網站：${e.message||'請確認系統瀏覽器與剪貼簿權限。'}`;}
  busy=false; save(); render();
}
function stripJsonFences(value){
  return String(value||'')
    .replace(/```(?:json)?\s*/gi,'')
    .replace(/```/g,'')
    .trim();
}
function sanitizeJsonText(value){
  // 修掉尾逗號等常見手寫錯誤，提升 Gemini 網頁回覆的解析成功率。
  return String(value||'')
    .replace(/,\s*([}\]])/g,'$1');
}
function extractStoryJsonCandidates(value){
  const source=stripJsonFences(value);
  const candidates=[];
  let start=-1,depth=0,inString=false,escaped=false;
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(start<0){if(ch==='{'){start=i;depth=1;}continue;}
    if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
    if(ch==='"')inString=true;else if(ch==='{')depth++;else if(ch==='}'){
      depth--;
      if(depth===0){candidates.push(source.slice(start,i+1));start=-1;}
    }
  }
  return candidates;
}
function extractStoryJson(value){
  const candidates=extractStoryJsonCandidates(value);
  // 由大到小嘗試，優先取內容最完整的 JSON 物件。
  candidates.sort((a,b)=>b.length-a.length);
  for(const candidate of candidates){
    for(const text of [candidate,sanitizeJsonText(candidate)]){
      try{JSON.parse(text);return text;}catch{}
    }
  }
  throw new Error('找不到完整 JSON。請複製 AI 回覆中的完整 JSON 物件。');
}
function parseWebReply(value){
  const text=stripJsonFences(value);
  let result;
  const candidates=extractStoryJsonCandidates(text);
  candidates.sort((a,b)=>b.length-a.length);
  let lastError=null;
  for(const candidate of candidates){
    for(const attempt of [candidate,sanitizeJsonText(candidate)]){
      try{
        result=JSON.parse(attempt);
        break;
      }catch(e){lastError=e;}
    }
    if(result)break;
  }
  if(!result){
    try{result=JSON.parse(sanitizeJsonText(extractStoryJson(text)));}
    catch(e){throw new Error('AI 回覆不是有效 JSON，請重新複製完整回覆。');}
  }
  const choices=sanitizeChoices(result.choices);
  if(typeof result.narration!=='string'||!result.narration.trim()) throw new Error('AI 回覆缺少故事正文，請重新生成本回合。');
  if(typeof result.memory!=='string') throw new Error('AI 回覆缺少故事記憶，請重新生成本回合。');
  if(!Array.isArray(result.choices)||result.choices.length!==7||result.choices.some(choice=>typeof choice!=='string')) throw new Error('AI 漏掉或未提供完整七選項；請用「AI 漏掉七選項？一鍵準備修復提示詞」要求它補齊。');
  if(choices.length!==7) throw new Error('AI 的 7 個選項有空白或重複；請用修復提示詞重新整理成 7 個不同選項。');
  result.choices=choices;
  result.emotion=normalizeStoryEmotion(result.emotion);
  result.intensity=normalizeStoryEmotionIntensity(result.intensity);
  result.eventFlag=normalizeStoryEventFlag(result.eventFlag);
  const delta=Number(result.affectionDelta);
  result.affectionDelta=Number.isFinite(delta)?Math.max(-5,Math.min(5,Math.round(delta*100)/100)):0;
  const advance=Number(result.timeAdvance);
  if(Number.isFinite(advance)) result.timeAdvance=Math.max(0,Math.min(6,Math.round(advance))); else delete result.timeAdvance;
  return result;
}
function isCompleteWebReply(value){try{parseWebReply(value);return true;}catch{return false;}}
function applyWebReply(replyText=null){
  if(busy||!state.pendingAction) return;
  const playerAction=String(state.pendingAction||'');
  const suppliedReply=typeof replyText==='string';
  const candidate=suppliedReply?replyText:($('webAiReplyInput')?.value??state.webReply);
  const editor=$('webAiReplyInput');
  const editorWasOpen=Boolean(editor?.closest('details')?.open);
  const editorSelection=editor?{start:editor.selectionStart,end:editor.selectionEnd}:null;
  const previous=snapshotForRollback(state);
  try{
    const result=parseWebReply(candidate);
    if(suppliedReply) state.webReply=candidate;
    const isOpening=state.pendingAction==='__OPENING__';
    if(isOpening) state.history=[];
    else state.history.push({role:'user',text:state.pendingAction});
    applyTurn(result);
    if(!isOpening&&!state.ending)refreshGiftConversations();
    state.pendingAction=''; state.webReply=''; state.lastAiError='';
  }catch(e){
    state=previous;if(suppliedReply)state.webReply=candidate;state.lastAiError=`尚未套用回覆：${e.message||'請確認 JSON 格式與 7 個選項。'}`;save();render();
    if(editorWasOpen){const restoredEditor=$('webAiReplyInput');const details=restoredEditor?.closest('details');if(restoredEditor&&details){details.open=true;restoredEditor.focus();if(editorSelection)restoredEditor.setSelectionRange(editorSelection.start,editorSelection.end);}}
    return false;
  }
  if(!save()){
    state=previous;
    if(suppliedReply) state.webReply=candidate;
    state.lastAiError='回覆已驗證，但存檔空間不足，故事未前進。請先匯出存檔或釋出空間，再套用回覆。';
    render();
    return false;
  }
  writeAutoSave();
  render();
  scrollDialogueIntoView();
  scheduleRareGoodnightCheck(playerAction);
  return true;
}
// ==== SECTION 9｜AI 狀態列與送出設定（後端健康檢查、API base、桌面模式標頭）====
async function refreshAiStatus(){
  const status=$('aiAccountStatus');
  if(status) status.textContent=uiText('正在檢查 AI 後端與已設定帳號…');
  try{
    const base=($('apiBase')?.value.trim()||state.apiBase||defaultApiBase()).replace(/\/$/,'');
    const response=await fetch(base+'/api/health',{cache:'no-store',headers:desktopApiHeaders(base)});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    aiHealth=await response.json();
    if(window.claudeDesktop?.listCredentials) aiVaultProfiles=await window.claudeDesktop.listCredentials();
    const count=Object.values(aiHealth.profiles||{}).reduce((n,items)=>n+(Array.isArray(items)?items.length:0),0);
    if(status) status.textContent=uiLanguage==='en'?`AI backend connected · ${count} API key configuration(s) detected. This only confirms that keys are present; actual access is checked when generating a story.`:`AI 後端已連線 · 偵測到 ${count} 組 API Key 設定。此檢查只確認金鑰存在，實際可用性會在生成劇情時確認。`;
  }catch(e){
    aiHealth=null;
    if(status) status.textContent=uiText('AI 後端尚未連線：')+(e.message||uiText('請確認本機服務或後端網址。'));
  }
  renderAiConnections();
}
// 模型通用性檢測：把「目前選定的 API 模型」送去伺服器跑一段固定短場景，
// 逐項確認連線、JSON、旁白、7 個不同選項、好感度與記憶欄位。只花一個極短回覆的額度。
let modelCheckBusy=false;
async function runModelCheck(){
  if(modelCheckBusy)return;
  const button=$('modelCheckBtn'),status=$('modelCheckStatus');
  if(!button||!status)return;
  const base=(state.apiBase||defaultApiBase()).replace(/\/$/,'');
  if(!base||base==='about:blank'){
    status.hidden=false;status.textContent=uiText('尚未設定 AI 後端網址');
    return;
  }
  const provider=state.provider,model=state.model,profileId=currentAiConnection()?.profileId||'';
  modelCheckBusy=true;button.disabled=true;
  const originalLabel=button.textContent;
  button.textContent=uiText('檢測中…');
  status.hidden=false;
  status.textContent=uiText('正在用一段短場景檢查模型是否遵守 JSON 契約…');
  try{
    const response=await fetch(base+'/api/model-check',{method:'POST',headers:{'Content-Type':'application/json',...desktopApiHeaders(base)},body:JSON.stringify({provider,accountProfile:profileId,model,language:uiLanguage})});
    let data=null;
    try{data=await response.json();}catch{}
    if(!response.ok||!Array.isArray(data?.checks))throw new Error(data?.error||`HTTP ${response.status}`);
    const providerLabel=providerName(provider);
    const headline=data.ok
      ?(uiLanguage==='en'?`Model check passed · ${providerLabel} · ${model}`:`模型通用性檢測通過 · ${providerLabel} · ${model}`)
      :(uiLanguage==='en'?`Model check found problems · ${providerLabel} · ${model}`:`模型通用性檢測發現問題 · ${providerLabel} · ${model}`);
    const separator=uiLanguage==='en'?': ':'：';
    const lines=data.checks.map(check=>{
      const label=uiLanguage==='en'?check.labelEn:check.labelZh;
      const detail=uiLanguage==='en'?check.detailEn:check.detailZh;
      return `${check.ok?'✓':'✗'} ${label}${check.ok||!detail?'':separator+detail}`;
    });
    const latency=Number.isFinite(Number(data.latencyMs))?Number(data.latencyMs):0;
    status.textContent=[headline,...lines,(uiLanguage==='en'?`Latency ${latency} ms`:`耗時 ${latency} ms`)].join('\n');
  }catch(e){
    status.textContent=uiText('模型通用性檢測失敗：')+(e.message||uiText('請確認本機 AI 後端與 API 金鑰。'));
  }finally{
    modelCheckBusy=false;button.disabled=false;button.textContent=originalLabel;
  }
}
async function saveAiConnection(){
  const initiatingState=state, initiatingSlotId=activeSlotId;
  const provider=$('aiProviderSelect').value;
  const label=$('aiAccountName').value.trim();
  // 不用ID就能玩＋ID可以是選項＋有需要才用：平常自動產生；選「自訂代號」才讀自訂輸入。
  const profileIdChoice=$('aiProfileId').value;
  const profileIdRaw=profileIdChoice==='__custom__'?$('aiProfileIdCustom').value:profileIdChoice;
  const profileIdInput=String(profileIdRaw||'').trim();
  const profileId=profileIdInput?normalizeProfileId(profileIdInput):nextAutoProfileId(provider);
  const apiKey=$('aiApiKey').value.trim();
  if(!AI_PROVIDERS.includes(provider)) return alert(uiText('請選擇支援的 AI 服務。'));
  if(!label) return alert(uiText('請輸入帳號名稱。'));
  if(!/^[A-Z0-9_]{1,32}$/.test(profileId)) return alert(uiText('帳號代號需為 1 至 32 個英文字母、數字或底線。'));
  const existing=aiConnections.find(x=>x.provider===provider&&x.profileId===profileId);
  if(!existing&&aiConnections.length>=12) return alert(uiText('最多可新增 12 組 AI 帳號。'));
  if(window.claudeDesktop?.isDesktop){
    const saved=aiVaultProfiles.some(x=>x.provider===provider&&String(x.profileId).toUpperCase()===profileId);
    if(!apiKey&&!saved) return alert(uiText('請貼上從官方 API 主控台取得的 API Key。'));
    if(apiKey){
      try{await window.claudeDesktop.saveCredential({provider,profileId,label,apiKey});}
      catch(e){return alert(uiText('無法安全保存 API Key：')+(e.message||uiText('Windows 加密服務不可用。')));}
    }
  }
  const previousConnection=existing?{...existing}:null;
  const connection=existing||{id:'ai_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),createdAt:Date.now()};
  Object.assign(connection,{provider,profileId,label});
  if(!existing) aiConnections.push(connection);
  if(!persistAiConnections()){
    if(existing) Object.assign(existing,previousConnection);
    else aiConnections=aiConnections.filter(x=>x!==connection);
    return alert(uiText('無法保存 AI 帳號設定：本機儲存空間可能已滿。'));
  }
  if(state!==initiatingState||activeSlotId!==initiatingSlotId){
    renderAiConnections();
    $('aiConnectionForm').hidden=true;
    $('aiApiKey').value='';
    return alert(uiText('API 帳號已保存，但你已切換存檔，因此沒有套用到新的目前存檔。可在該存檔選擇此帳號。'));
  }
  const previousSelection={aiConnectionId:state.aiConnectionId,provider:state.provider,model:state.model,aiMode:state.aiMode};
  state.aiConnectionId=connection.id;
  state.provider=provider;
  state.model=defaultModelForProvider(provider);
  state.aiMode='api';
  if(!save()){
    Object.assign(state,previousSelection);
    settings(); render();
    return;
  }
  settings(); render();
  $('aiConnectionForm').hidden=true;
  $('aiApiKey').value='';
  await refreshAiStatus();
}
function useAiConnection(id){
  const c=aiConnections.find(x=>x.id===id); if(!c) return;
  const previous={...state};
  state.aiConnectionId=c.id; state.provider=c.provider; state.model=defaultModelForProvider(c.provider); state.aiMode='api';
  if(!save()){state=previous;render();return;}
  settings(); render(); refreshAiStatus();
}
async function removeAiConnection(id){
  const c=aiConnections.find(x=>x.id===id); if(!c) return;
  if(!confirm(uiText('移除「')+c.label+uiText('」並刪除本機保存的 API Key？使用這個帳號的存檔之後需要重新設定。'))) return;
  const previousConnections=aiConnections;
  aiConnections=aiConnections.filter(x=>x.id!==id);
  if(!persistAiConnections()){
    aiConnections=previousConnections;
    return alert(uiText('無法更新 AI 帳號存檔：本機儲存空間可能已滿。'));
  }
  if(window.claudeDesktop?.removeCredential){
    try{await window.claudeDesktop.removeCredential({provider:c.provider,profileId:c.profileId});}
    catch(e){aiConnections=previousConnections;persistAiConnections();return alert(uiText('刪除加密金鑰失敗：')+(e.message||''));}
  }
  if(state.aiConnectionId===id) state.aiConnectionId=null;
  save(); renderAiConnections(); refreshAiStatus();
}
function defaultApiBase(){
  const desktopBase=new URLSearchParams(location.search).get('apiBase');
  if(desktopBase) return desktopBase;
  return location.protocol==='file:'?'http://127.0.0.1:8787':location.origin;
}
function desktopApiHeaders(apiBase){
  const token=new URLSearchParams(location.search).get('apiToken');
  if(!token) return {};
  try{if(new URL(apiBase||defaultApiBase()).origin===new URL(defaultApiBase()).origin) return {'X-Desktop-Token':token};}catch{}
  return {};
}
// ==== SECTION 10｜遊戲進度與存檔（fresh／load／save、槽位、自動與快速存檔）====
function fresh() {
  return {
    affection: 50,
    affectionPityStart: 0,
    gameOver: false,
    letterEvent: false,
    letterEventEnabled: false,
    letterEventTurns: 0,
    difficulty: 'normal',
    giftConversations: [],
    storyRunId: 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
    history: [],
    promptHistory: [],
    characterPortrait: '',
    characterSheet: null,
    choices: [],
    ending: false,
    provider: 'gemini',
    aiMode: 'web',
    webProvider: 'gemini',
    webReply: '',
    model: 'gemini-3.8-flash',
    apiBase: defaultApiBase(),
    aiConnectionId: null,
    customModels: [],
    modelConfigs: {},
    temperature: 1.0,
    topP: 0.95,
    maxTokens: 2400,
    responseMode: 'quality',
    promptMode: 'standard',
    openingStyle: RANDOM_OPENING_STYLE,
    openingCustomPrompt: '',
    characterName: DEFAULT_CHARACTER_NAME,
    characterProfile: DEFAULT_CHARACTER_PROFILE,
    claudePersonaMode: 'standard',
    worldSetting: DEFAULT_WORLD_SETTING,
    storyTemplate: DEFAULT_STORY_TEMPLATE,
    storyMemory: '',
    storyEmotion: 'neutral',
    storyEmotionIntensity: 1,
    storyEmotionToken: 0,
    storyClock: { mode: 'off', enabled: false, day: 1, slot: 0, anchor: 0 },
    pendingMilestone: '',
    pendingSpecialEvent: '',
    storyEvent: '',
    storyEventToken: 0,
    storyEventSeen: [],
    goodnightDay: 0,
    rareGoodnightAt: 0,
    bedroomSceneAt: 0,
    bedroomSceneLabels: [],
    albumUnlocked: ['36626', '36676', '36684', '36623', '36624', '36625'],
    worldBook: { enabled: false, entries: [] },
    authorNote: { enabled: false, text: '' },
    promptTweaks: { rulesOff: [], extra: '' },
    undoToolsEnabled: true,
    historyEditEnabled: true,
    lastTurnUndo: null
  };
}
function normalizePromptMode(value){return value==='saving'?'saving':'standard';}
function normalizeClaudePersonaMode(value){return value==='tsundere'?'tsundere':'standard';}
function normalizePromptHistory(value){
  if(!Array.isArray(value))return [];
  return value.slice(-20).map(entry=>({id:String(entry?.id||''),createdAt:Number(entry?.createdAt)||Date.now(),mode:entry?.mode==='api'?'api':'web',provider:String(entry?.provider||'').slice(0,40),model:String(entry?.model||'').slice(0,100),title:String(entry?.title||'').slice(0,120),prompt:String(entry?.prompt||'').slice(0,20000)})).filter(entry=>entry.prompt);
}
// F1：歷史元素級清洗（舊存檔／匯入檔可能夾 null、數字、字串等壞元素；渲染路徑會直接讀 x.role）。
// 只保留物件元素、role／text 一律轉字串；其他欄位原樣保留。正常存檔零差異。
function sanitizeHistory(value){
  if(!Array.isArray(value))return [];
  return value.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>({...x,role:String(x.role||''),text:String(x.text==null?'':x.text)}));
}
function archivePrompt(text,{mode='web',provider='',model='',title=''}={}){
  const promptText=String(text||'').slice(0,20000);if(!promptText)return;
  const archive=normalizePromptHistory(state.promptHistory),latest=archive.at(-1);
  if(latest?.prompt===promptText&&latest.mode===mode&&latest.provider===provider&&latest.model===model)return;
  archive.push({id:'prompt_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),createdAt:Date.now(),mode,provider,model,title,prompt:promptText});state.promptHistory=archive.slice(-20);
}
function showPromptHistory(){
  const entries=normalizePromptHistory(state.promptHistory),picker=$('promptHistoryPicker'),preview=$('promptHistoryText');picker.replaceChildren();
  for(const [index,entry] of entries.entries()){const option=document.createElement('option');option.value=String(index);const mode=entry.mode==='web'?uiText('網頁模式提示詞'):uiText('API 回合資料');option.textContent=`${new Date(entry.createdAt).toLocaleString()} · ${mode} · ${entry.provider||''} ${entry.model||''}`.trim();picker.append(option);}
  const update=()=>{preview.value=entries[Number(picker.value)]?.prompt||'';};picker.onchange=update;update();$('promptHistoryDialog').showModal();
}
// 追加九：回合回退快照（重寫／刪除上一回合用）。只保存能還原「選擇點」的最小欄位；
// 不合法＝null（回退鈕停用）；舊存檔沒有這個欄位＝未使用，行為不變。
function normalizeLastTurnUndo(value){
  if(!value||typeof value!=='object')return null;
  const keepLen=Math.max(0,Math.floor(Number(value.keepLen)||0));
  if(keepLen>5000)return null;
  return {
    action:String(value.action||'').slice(0,2000),
    keepLen,
    affection:Number.isFinite(Number(value.affection))?Math.max(0,Math.min(100,Number(value.affection))):50,
    affectionPityStart:Number.isFinite(Number(value.affectionPityStart))?Number(value.affectionPityStart):0,
    memory:String(value.memory||'').slice(0,20000),
    storyEmotion:normalizeStoryEmotion(value.storyEmotion),
    storyEmotionIntensity:normalizeStoryEmotionIntensity(value.storyEmotionIntensity),
    storyEmotionToken:Math.max(0,Math.floor(Number(value.storyEmotionToken)||0)),
    choices:sanitizeChoices(value.choices),
    storyClock:normalizeStoryClock(value.storyClock),
    pendingMilestone:normalizeMilestoneKey(value.pendingMilestone),
    pendingSpecialEvent:normalizeSpecialEventKey(value.pendingSpecialEvent),
    storyEvent:normalizeStoryEventFlag(value.storyEvent),
    storyEventToken:Math.max(0,Math.floor(Number(value.storyEventToken)||0)),
    storyEventSeen:normalizeSeenStoryEventFlags(value.storyEventSeen),
    goodnightDay:Math.max(0,Math.floor(Number(value.goodnightDay)||0)),
    rareGoodnightAt:Math.max(0,Math.floor(Number(value.rareGoodnightAt)||0)),
    bedroomSceneAt:Math.max(0,Math.floor(Number(value.bedroomSceneAt)||0)),
    bedroomSceneLabels:Array.isArray(value.bedroomSceneLabels)?value.bedroomSceneLabels.map(x=>String(x).slice(0,80)).slice(0,50):[],
    albumUnlocked:Array.isArray(value.albumUnlocked)?value.albumUnlocked.map(x=>String(x)).slice(0,50):['36626','36676','36684','36623','36624','36625'],
    letterEventTurns:Math.max(0,Math.floor(Number(value.letterEventTurns)||0)),
    ending:value.ending===true,
    giftConversations:normalizeGiftConversations(value.giftConversations)
  };
}
function normalizeSlot(slot, index=0) {
  if (!slot || typeof slot !== 'object') return null;
  const fallbackName = uiLanguage==='en'?`Save ${index + 1}`:`存檔 ${index + 1}`;
  const rawState = slot.state && typeof slot.state === 'object' ? stripCredentials(slot.state) : {};
  const savedCharacterName=String(rawState.characterName||'').trim();
  const hasLegacyDefaultName=['claude 娘','cIoudo 娘','cIoudo娘'].includes(savedCharacterName);
  const savedCharacterProfile=String(rawState.characterProfile||DEFAULT_CHARACTER_PROFILE).slice(0,10000);
  const migratedCharacterProfile=[LEGACY_DEFAULT_CHARACTER_PROFILE,PREVIOUS_DEFAULT_CHARACTER_PROFILE,E13_PREVIOUS_DEFAULT_CHARACTER_PROFILE,B5_PREVIOUS_DEFAULT_CHARACTER_PROFILE,B6_PREVIOUS_DEFAULT_CHARACTER_PROFILE,B7_PREVIOUS_DEFAULT_CHARACTER_PROFILE,B8_PREVIOUS_DEFAULT_CHARACTER_PROFILE,B9_PREVIOUS_DEFAULT_CHARACTER_PROFILE,LEGACY_TSUNDERE_CHARACTER_PROFILE].includes(savedCharacterProfile)?DEFAULT_CHARACTER_PROFILE:savedCharacterProfile;
  return {
    id: String(slot.id || ('slot_' + Date.now() + '_' + Math.random().toString(36).slice(2,7))),
    name: String(slot.name || fallbackName).trim() || fallbackName,
    memo: String(slot.memo || '').trim().slice(0,200),
    kind: String(slot.id)===AUTO_SLOT_ID?'auto':String(slot.id)===QUICK_SLOT_ID?'quick':String(slot.id)===INCOGNITO_SLOT_ID?'incognito':'manual',
    temporaryChat: !!slot.temporaryChat,
    updatedAt: Number(slot.updatedAt) || Date.now(),
    state: {
      ...fresh(),
      ...rawState,
      affection: Number.isFinite(Number(rawState.affection)) ? Number(rawState.affection) : 50,
      affectionPityStart: Number.isFinite(Number(rawState.affectionPityStart)) ? Number(rawState.affectionPityStart) : 0,
      difficulty: normalizeDifficulty(rawState.difficulty),
      promptMode: normalizePromptMode(rawState.promptMode),
      giftConversations: normalizeGiftConversations(rawState.giftConversations),
      history: sanitizeHistory(rawState.history),
      promptHistory: normalizePromptHistory(rawState.promptHistory),
      characterPortrait: normalizeCharacterPortrait(rawState.characterPortrait),
      characterSheet: normalizeCharacterSheet(rawState.characterSheet),
      // 多角色卡（R39/R40）：額外角色卡陣列＋勾選「參與故事」的 id 清單，隨存檔往返。
      characterCards: normalizeCharacterCards(rawState.characterCards),
      characterCardIds: (Array.isArray(rawState.characterCardIds)?rawState.characterCardIds:[]).map(String).slice(0,12),
      choices: sanitizeChoices(rawState.choices),
      ending: !!rawState.ending,
      gameOver: !!rawState.gameOver,
      letterEvent: rawState.letterEvent === true,
      letterEventEnabled: rawState.letterEventEnabled === true,
      letterEventTurns: Number.isFinite(Number(rawState.letterEventTurns))
        ? Math.max(0, Math.floor(Number(rawState.letterEventTurns)))
        : (Array.isArray(rawState.history) ? rawState.history.filter(entry => entry?.role === 'user').length : 0),
      storyMemory: String(rawState.storyMemory || ''),
      storyEmotion: normalizeStoryEmotion(rawState.storyEmotion),
      storyEmotionIntensity: normalizeStoryEmotionIntensity(rawState.storyEmotionIntensity),
      storyEmotionToken: Math.max(0,Math.floor(Number(rawState.storyEmotionToken)||0)),
      storyClock: normalizeStoryClock(rawState.storyClock),
      pendingMilestone: normalizeMilestoneKey(rawState.pendingMilestone),
      pendingSpecialEvent: normalizeSpecialEventKey(rawState.pendingSpecialEvent),
      storyEvent: normalizeStoryEventFlag(rawState.storyEvent),
      storyEventToken: Math.max(0,Math.floor(Number(rawState.storyEventToken)||0)),
      storyEventSeen: normalizeSeenStoryEventFlags(rawState.storyEventSeen),
      goodnightDay: Math.max(0,Math.floor(Number(rawState.goodnightDay)||0)),
      rareGoodnightAt: Math.max(0,Math.floor(Number(rawState.rareGoodnightAt)||0)),
      bedroomSceneAt: Math.max(0,Math.floor(Number(rawState.bedroomSceneAt)||0)),
      bedroomSceneLabels: Array.isArray(rawState.bedroomSceneLabels) ? rawState.bedroomSceneLabels.map(x=>String(x).slice(0,80)).slice(0,50) : [],
      albumUnlocked: Array.isArray(rawState.albumUnlocked) ? rawState.albumUnlocked.map(x=>String(x)).slice(0,50) : ['36626','36676','36684','36623','36624','36625'],
      worldBook: normalizeWorldBook(rawState.worldBook),
      authorNote: normalizeAuthorNote(rawState.authorNote),
      promptTweaks: normalizePromptTweaks(rawState.promptTweaks),
      undoToolsEnabled: rawState.undoToolsEnabled !== false,
      historyEditEnabled: rawState.historyEditEnabled !== false,
      lastTurnUndo: normalizeLastTurnUndo(rawState.lastTurnUndo),
      pendingAction: typeof rawState.pendingAction === 'string' ? rawState.pendingAction.slice(0,2000) : '',
      customModels: normalizeCustomModels(rawState.customModels),
      modelConfigs: normalizeModelConfigs(rawState.modelConfigs),
      characterName: (hasLegacyDefaultName?DEFAULT_CHARACTER_NAME:(savedCharacterName||DEFAULT_CHARACTER_NAME)).slice(0,60),
      characterProfile: migratedCharacterProfile,
      claudePersonaMode: normalizeClaudePersonaMode(rawState.claudePersonaMode),
      worldSetting: String(rawState.worldSetting || DEFAULT_WORLD_SETTING).slice(0,10000),
      storyTemplate: String(rawState.storyTemplate || DEFAULT_STORY_TEMPLATE).slice(0,10000),
      openingCustomPrompt: String(rawState.openingCustomPrompt || '').slice(0,600)
    }
  };
}
// 載入時把「磁碟上實際的字串」放進快取：內容沒變，啟動後就不會立刻全部重寫一遍。
function rememberStoredSlotPayloads(entries) {
  persistedSlotPayloads.clear();
  for (const [id, raw] of entries || []) persistedSlotPayloads.set(String(id), String(raw));
}
// 清掉已經不存在的存檔（刪除存檔、匯入後改 id）留下的 key，避免白佔空間。
function removeOrphanSlotKeys() {
  try {
    const known = new Set(slots.map(slot => String(slot?.id || '')).filter(Boolean));
    for (const key of listStoredSlotKeys(localStorage)) {
      const id = slotIdFromKey(key);
      if (id !== null && !known.has(id)) localStorage.removeItem(key);
    }
  } catch {}
}
function loadSlots() {
  const parseSlots = raw => {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSlot).filter(Boolean);
  };
  slotsIndexClean = false;
  // 1) v2：索引決定有哪些格子，每一格讀自己的 key（讀不到就退回該格的備份）。
  let index = null;
  try { index = parseSlotsIndex(localStorage.getItem(SLOTS_INDEX_KEY)); } catch { index = null; }
  if (index) {
    const out = [], stored = [];
    let degraded = false;
    for (const meta of index) {
      const found = readStoredSlot(localStorage, meta.id);
      if (!found) { degraded = true; continue; }
      const slot = normalizeSlot({...meta, ...found.parsed});
      if (!slot) { degraded = true; continue; }
      out.push(slot);
      if (found.fromBackup) { slotsRecoveredFromBackup = true; degraded = true; }
      else stored.push([slot.id, found.raw]);
    }
    if (out.length) {
      // v2 每一格都讀得乾淨（沒有動用備份）時，才清掉舊版單一 key 把空間還給使用者。
      if (!degraded) {
        slotsIndexClean = true;
        try { localStorage.removeItem(SLOTS_KEY); } catch {}
      }
      rememberStoredSlotPayloads(stored);
      return out;
    }
  }
  // 1b) 索引不見或壞掉，但磁碟上還有 v2 的格子：直接掃描每一格把它們救回來（索引會在下次存檔自動重建）。
  //     只有在舊版單一 key 已經不在（代表搬遷已完成）時才這樣救；否則可能蓋掉還完整的舊存檔。
  let legacyRaw = null;
  try { legacyRaw = localStorage.getItem(SLOTS_KEY); } catch { legacyRaw = null; }
  if (!legacyRaw) {
    try {
      const out = [], stored = [];
      for (const entry of collectStoredSlots(localStorage)) {
        const slot = normalizeSlot({...entry.parsed});
        if (!slot) continue;
        out.push(slot);
        if (entry.fromBackup) slotsRecoveredFromBackup = true;
        else stored.push([slot.id, entry.raw]);
      }
      if (out.length) {
        // 系統格固定排最前面（與正常載入順序一致），其餘保持掃描時「新到舊」的順序。
        const rank = id => id === QUICK_SLOT_ID ? 0 : id === AUTO_SLOT_ID ? 1 : 2;
        out.sort((a, b) => rank(a.id) - rank(b.id));
        rememberStoredSlotPayloads(stored);
        return out;
      }
    } catch {}
  }
  // 2) 舊版單一 key：第一次升級舊存檔會走這裡，之後的存檔會自動搬成 v2。
  try {
    return parseSlots(legacyRaw);
  } catch {
    // 主存檔損毀時退回上一次成功寫入的備份（galgame 式存檔修復），讀檔後照常使用。
    try {
      const recovered = parseSlots(localStorage.getItem(SLOTS_BACKUP_KEY));
      if (recovered.length) { slotsRecoveredFromBackup = true; return recovered; }
    } catch {}
    return [];
  }
}
// 字串能不能解析成一個存檔；給 persistSlots 判斷「值不值得留成備份」。
function slotPayloadParses(raw) {
  try { return isSlotPayload(JSON.parse(raw)); } catch { return false; }
}
function persistSlots() {
  try {
    const writes = [];
    for (const slot of slots) {
      const id = String(slot?.id || '');
      if (!id) continue;
      const payload = JSON.stringify(compactSlotForStorage(slot, slotDefaults()));
      // 這一格內容與上次成功寫入完全相同：不重寫，也不重做備份。
      if (persistedSlotPayloads.get(id) === payload) continue;
      writes.push({id, key: slotKey(id), payload});
    }
    const indexPayload = slotsIndexPayload(slots);
    const indexChanged = persistedSlotPayloads.get(SLOTS_INDEX_CACHE_KEY) !== indexPayload;
    if (!writes.length && !indexChanged) return true;
    // 先備份「即將被覆寫」的那一格，再寫新內容；索引最後才寫，清單不會領先內容。
    for (const write of writes) {
      let previous = null;
      try { previous = localStorage.getItem(write.key); } catch {}
      // 只有「還讀得出來是存檔」的舊內容才留成備份；壞掉的內容留了只會蓋掉上一份好備份。
      if (previous && previous !== write.payload && slotPayloadParses(previous)) {
        try { localStorage.setItem(slotBackupKey(write.id), previous); } catch {}
      }
    }
    for (const write of writes) writeVerified(localStorage, write.key, write.payload, isSlotPayload);
    if (indexChanged) {
      writeVerified(localStorage, SLOTS_INDEX_KEY, indexPayload,
        parsed => !!parsed && parsed.v === SLOTS_INDEX_VERSION && Array.isArray(parsed.slots));
    }
    for (const write of writes) persistedSlotPayloads.set(write.id, write.payload);
    if (indexChanged) persistedSlotPayloads.set(SLOTS_INDEX_CACHE_KEY, indexPayload);
    // 只有「這次載入是乾淨的」才清沒人用的 key；資料不完整的載入（例如讀過備份）絕不主動刪任何 key。
    if (slotsIndexClean) removeOrphanSlotKeys();
    return true;
  } catch (e) {
    console.error('存檔失敗', e);
    alert(uiText('存檔失敗：瀏覽器儲存空間可能已滿。'));
    return false;
  }
}
// 確保系統格永遠存在：自動存檔格＋快速存檔格（空狀態也會顯示，不佔手動編號）。
function ensureSystemSlots() {
  for (const [id, name] of [[AUTO_SLOT_ID, '自動存檔'], [QUICK_SLOT_ID, '快速存檔']]) {
    if (!slots.some(x => x.id === id)) slots.unshift({...normalizeSlot({id, name, updatedAt: 0, memo: '', state: fresh()})});
  }
}
// 存檔卡片摘要：回合數、好感、時間、最新劇情摘錄、結局／待辦狀態。
function slotSummary(slot) {
  const history = Array.isArray(slot?.state?.history) ? slot.state.history : [];
  let turns = 0, latest = null;
  for (const entry of history) {
    if (entry?.role === 'user') turns++;
    if (entry && (entry.role === 'ai' || entry.role === 'ending')) latest = entry;
  }
  const affection = Number(slot?.state?.affection);
  const clock = realStoryClock(slot?.state?.storyClock);
  return {
    turns,
    affection: Number.isFinite(affection) ? affection : 50,
    date: new Date(slot?.updatedAt || Date.now()).toLocaleString(),
    excerpt: String(latest?.text || '').trim().slice(0, 60),
    ending: !!slot?.state?.ending,
    pending: String(slot?.state?.pendingAction || ''),
    clockLabel: clock.enabled ? storyClockLabel(clock, uiLanguage) : ''
  };
}
function makeSlot(name, data) {
  return { id: 'slot_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), name, memo: '', kind: 'manual', updatedAt: Date.now(), state: {...fresh(), ...stripCredentials(data || {})} };
}
function migrateLegacyState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s) return null;
    return {...fresh(), ...stripCredentials(s), storyMemory: s.storyMemory || ''};
  } catch { return null; }
}
function load() {
  const legacy = migrateLegacyState();
  if (!slots.some(x => x.kind === 'manual')) {
    const first = makeSlot('存檔 1', legacy || fresh());
    slots = [first, ...slots.filter(x => x.kind !== 'manual')]; persistSlots();
    activeSlotId = first.id; localStorage.setItem('claude_novel_active_slot_v1', activeSlotId);
  }
  let active = slots.find(x => x.id === activeSlotId);
  if (!active) {
    active = slots.find(x => x.kind === 'manual') || slots[0]; activeSlotId = active.id;
    localStorage.setItem('claude_novel_active_slot_v1', activeSlotId);
  }
  return {...fresh(), ...(active.state || {}), storyMemory: active.state?.storyMemory || ''};
}
function verifyActiveSlot() {
  const active = slots.find(x => x.id === activeSlotId);
  return !!(active && active.state && Array.isArray(active.state.history) && Array.isArray(active.state.choices));
}
function serializeState(source=state) {
  return {
    ...fresh(),
    ...stripCredentials(source),
    difficulty: normalizeDifficulty(source.difficulty),
    promptMode: normalizePromptMode(source.promptMode),
    giftConversations: normalizeGiftConversations(source.giftConversations),
    history: sanitizeHistory(source.history),
    promptHistory: normalizePromptHistory(source.promptHistory),
    characterPortrait: normalizeCharacterPortrait(source.characterPortrait),
    characterSheet: normalizeCharacterSheet(source.characterSheet),
    characterCards: normalizeCharacterCards(source.characterCards),
    characterCardIds: (Array.isArray(source.characterCardIds)?source.characterCardIds:[]).map(String).slice(0,12),
    choices: Array.isArray(source.choices) ? source.choices.slice(0,7) : [],
    gameOver: !!source.gameOver,
    letterEvent: source.letterEvent === true,
    letterEventEnabled: source.letterEventEnabled === true,
    letterEventTurns: Math.max(0, Math.floor(Number(source.letterEventTurns) || 0)),
    customModels: normalizeCustomModels(source.customModels),
    modelConfigs: normalizeModelConfigs(source.modelConfigs),
    characterName: String(source.characterName || DEFAULT_CHARACTER_NAME).slice(0,60),
    characterProfile: String(source.characterProfile || DEFAULT_CHARACTER_PROFILE).slice(0,10000),
    claudePersonaMode: normalizeClaudePersonaMode(source.claudePersonaMode),
    worldSetting: String(source.worldSetting || DEFAULT_WORLD_SETTING).slice(0,10000),
    storyTemplate: String(source.storyTemplate || DEFAULT_STORY_TEMPLATE).slice(0,10000),
    openingCustomPrompt: String(source.openingCustomPrompt || '').slice(0,600),
    storyMemory: source.storyMemory || '',
    storyClock: normalizeStoryClock(source.storyClock),
    pendingMilestone: normalizeMilestoneKey(source.pendingMilestone),
    pendingSpecialEvent: normalizeSpecialEventKey(source.pendingSpecialEvent),
    storyEvent: normalizeStoryEventFlag(source.storyEvent),
    storyEventToken: Math.max(0,Math.floor(Number(source.storyEventToken)||0)),
    storyEventSeen: normalizeSeenStoryEventFlags(source.storyEventSeen),
    goodnightDay: Math.max(0,Math.floor(Number(source.goodnightDay)||0)),
    rareGoodnightAt: Math.max(0,Math.floor(Number(source.rareGoodnightAt)||0)),
    bedroomSceneAt: Math.max(0,Math.floor(Number(source.bedroomSceneAt)||0)),
    bedroomSceneLabels: Array.isArray(source.bedroomSceneLabels) ? source.bedroomSceneLabels.map(x=>String(x).slice(0,80)).slice(0,50) : [],
    albumUnlocked: Array.isArray(source.albumUnlocked) ? source.albumUnlocked.map(x=>String(x)).slice(0,50) : ['36626','36676','36684','36623','36624','36625'],
    worldBook: normalizeWorldBook(source.worldBook),
    authorNote: normalizeAuthorNote(source.authorNote),
    promptTweaks: normalizePromptTweaks(source.promptTweaks),
    undoToolsEnabled: source.undoToolsEnabled !== false,
    historyEditEnabled: source.historyEditEnabled !== false,
    lastTurnUndo: normalizeLastTurnUndo(source.lastTurnUndo),
    pendingAction: source.pendingAction || ''
  };
}
function renderSaveStatus(){
  const message=slots.some(x=>x.kind==='incognito')?uiText('臨時對話：本機自動存檔'):slotsRecoveredFromBackup?uiText('已從備份還原存檔。'):autoSaveEnabled?uiText('自動存檔開啟'):manualSaveDirty?uiText('有未手動儲存的修改'):uiText('手動存檔模式（已保存）');
  const status=$('saveModeStatus');if(status)status.textContent=message;
  const settingsStatus=$('saveModeSettingsStatus');if(settingsStatus)settingsStatus.textContent=manualSaveDirty?uiText('目前存檔尚未手動儲存。'):message;
  const saveButton=$('saveStoryBtn');if(saveButton){saveButton.textContent=autoSaveEnabled?uiText('💾 建立進度存檔'):'💾 '+uiText('手動存檔');saveButton.title=message;}
}
function save(force=false) {
  const active = slots.find(x => x.id === activeSlotId);
  if (!active) return false;
  // 臨時對話也會落地：不管自動存檔開關，每次回合都直接寫入本機，隨時可以讀回續玩。
  if(!autoSaveEnabled&&!force&&active.kind!=='incognito'){manualSaveDirty=true;renderSaveStatus();return true;}
  const previousState = active.state, previousUpdatedAt = active.updatedAt;
  active.state = serializeState();
  active.updatedAt = Date.now();
  const ok = persistSlots();
  if (!ok) {
    active.state = previousState;
    active.updatedAt = previousUpdatedAt;
    return false;
  }
  manualSaveDirty=false;
  renderSaveStatus();
  // Keep the legacy copy until the new slot format has been written successfully.
  try { localStorage.removeItem(KEY); } catch {}
  return true;
}
function setAutoSaveEnabled(enabled){
  const previous=autoSaveEnabled;
  autoSaveEnabled=Boolean(enabled);
  try{localStorage.setItem(AUTO_SAVE_KEY,String(autoSaveEnabled));}
  catch(error){autoSaveEnabled=previous;alert(uiText('無法更新存檔設定：')+(error.message||''));renderSaveStatus();return false;}
  if(autoSaveEnabled&&manualSaveDirty&&!save(true)){
    autoSaveEnabled=false;
    try{localStorage.setItem(AUTO_SAVE_KEY,'false');}catch{}
    renderSaveStatus();
    return false;
  }
  renderSaveStatus();
  return true;
}
// 批5 Ａ5：桌面（Electron）不支援 window.prompt；以下改走應用內 <dialog>（Esc＝取消、Enter＝確認；雙語走 uiText）。
function openPromptDialog({title='',note='',value='',maxLength=0}={}){
  const dialog=$('promptDialog'),input=$('promptDialogInput');
  if(!dialog||!input||typeof dialog.showModal!=='function')return Promise.resolve(null);
  const titleEl=$('promptDialogTitle'),noteEl=$('promptDialogNote');
  if(titleEl)titleEl.textContent=uiText(title);
  if(noteEl){noteEl.textContent=uiText(note);noteEl.style.display=note?'':'none';}
  input.dataset.zhAriaLabel=title;
  input.setAttribute('aria-label',uiText(title));
  if(maxLength>0)input.maxLength=maxLength;else input.removeAttribute('maxlength');
  input.value=String(value==null?'':value);
  return new Promise(resolve=>{
    const okBtn=$('promptDialogOkBtn'),cancelBtn=$('promptDialogCancelBtn');
    let settled=false;
    const finish=result=>{
      if(settled)return;settled=true;
      okBtn?.removeEventListener('click',onOk);cancelBtn?.removeEventListener('click',onCancel);
      dialog.removeEventListener('keydown',onKey);dialog.removeEventListener('close',onClose);
      if(dialog.open)dialog.close();
      resolve(result);
    };
    const onOk=()=>finish(input.value);
    const onCancel=()=>finish(null);
    const onClose=()=>finish(null);
    const onKey=event=>{
      if(event.key!=='Enter'||event.isComposing)return;
      if(event.target&&event.target.tagName==='BUTTON')return; // 焦點在按鈕：走原生點擊，避免雙重確認
      event.preventDefault();onOk();
    };
    okBtn?.addEventListener('click',onOk);cancelBtn?.addEventListener('click',onCancel);
    dialog.addEventListener('keydown',onKey);dialog.addEventListener('close',onClose);
    if(!dialog.open)dialog.showModal();
    input.focus();input.select();
  });
}
function openSwitchGuardDialog(){
  const dialog=$('switchGuardDialog');
  if(!dialog||typeof dialog.showModal!=='function')return Promise.resolve(null);
  const saveBtn=$('switchGuardSaveBtn'),discardBtn=$('switchGuardDiscardBtn'),cancelBtn=$('switchGuardCancelBtn');
  return new Promise(resolve=>{
    let settled=false;
    const finish=result=>{
      if(settled)return;settled=true;
      saveBtn?.removeEventListener('click',onSave);discardBtn?.removeEventListener('click',onDiscard);cancelBtn?.removeEventListener('click',onCancel);
      dialog.removeEventListener('keydown',onKey);dialog.removeEventListener('close',onClose);
      if(dialog.open)dialog.close();
      resolve(result);
    };
    const onSave=()=>finish('save');
    const onDiscard=()=>finish('discard');
    const onCancel=()=>finish(null);
    const onClose=()=>finish(null);
    const onKey=event=>{
      if(event.key!=='Enter'||event.isComposing)return;
      if(event.target&&event.target.tagName==='BUTTON')return; // 焦點在按鈕：走原生點擊
      event.preventDefault();onSave();
    };
    saveBtn?.addEventListener('click',onSave);discardBtn?.addEventListener('click',onDiscard);cancelBtn?.addEventListener('click',onCancel);
    dialog.addEventListener('keydown',onKey);dialog.addEventListener('close',onClose);
    if(!dialog.open)dialog.showModal();
    saveBtn?.focus();
  });
}
function resolveManualSaveBeforeLeaving(){
  if(!manualSaveDirty)return autoSaveEnabled?save():true;
  return openSwitchGuardDialog().then(choice=>{
    if(choice==='save')return save(true);
    if(choice==='discard')return true;
    return false;
  });
}
// 臨時對話存檔會保留在本機；離開／切換不再刪除，隨時可以讀回繼續。
function confirmLeaveIncognito(){
  return true;
}
async function switchSlot(id) {
  if (busy || id === activeSlotId) return;
  const target = slots.find(x => x.id === id);
  if (!target || !(await resolveManualSaveBeforeLeaving()) || !confirmLeaveIncognito()) return;
  try { localStorage.setItem('claude_novel_active_slot_v1', id); }
  catch (e) { alert(uiText('無法切換存檔：')+(e.message || uiText('本機儲存不可用。'))); return; }
  pauseStoryForExit();
  activeSlotId = id;
  manualSaveDirty=false;
  state = {...fresh(), ...(target.state || {}), storyMemory: target.state?.storyMemory || ''};
  resetRareGoodnightWarmup();
  storyExited=false;
  webAutoQueuedReply='';
  webAutoSendArmed=false;
  webAutoFlowSubmitted=false;webAutoFlowWatchOnly=false;webAutoWatchRetryCount=0;webAutoLastTurnKey='';
  settings(); render();
  refreshTimeTheme();
}
async function createSlot(name) {
  if (busy) return;
  const manualCount = slots.filter(x => x.kind === 'manual').length;
  const label = (name || '').trim() || (uiLanguage==='en'?`Save ${manualCount + 1}`:`存檔 ${manualCount + 1}`);
  if (!(await resolveManualSaveBeforeLeaving()) || !confirmLeaveIncognito()) return;
  const slot = makeSlot(label, {provider:state.provider, model:state.model, apiBase:state.apiBase, aiConnectionId:state.aiConnectionId, aiMode:state.aiMode, webProvider:state.webProvider, difficulty:state.difficulty, temperature:state.temperature, topP:state.topP, maxTokens:state.maxTokens, responseMode:state.responseMode, customModels:state.customModels, modelConfigs:state.modelConfigs});
  slots.push(slot);
  if (!persistSlots()) { slots.pop(); return; }
  try { localStorage.setItem('claude_novel_active_slot_v1', slot.id); }
  catch (e) { slots.pop(); persistSlots(); alert(uiText('無法切換到新存檔：')+(e.message || uiText('本機儲存不可用。'))); return; }
  pauseStoryForExit();
  activeSlotId = slot.id;
  manualSaveDirty=false;
  state = {...fresh(), provider:slot.state.provider, model:slot.state.model, apiBase:slot.state.apiBase, aiConnectionId:slot.state.aiConnectionId||null, aiMode:slot.state.aiMode, webProvider:slot.state.webProvider, difficulty:slot.state.difficulty, temperature:slot.state.temperature, topP:slot.state.topP, maxTokens:slot.state.maxTokens, responseMode:slot.state.responseMode, customModels:slot.state.customModels, modelConfigs:slot.state.modelConfigs};
  resetRareGoodnightWarmup();
  storyExited=false;
  webAutoQueuedReply='';
  webAutoSendArmed=false;
  webAutoFlowSubmitted=false;webAutoFlowWatchOnly=false;webAutoWatchRetryCount=0;webAutoLastTurnKey='';
  settings(); render();
  refreshTimeTheme();
}
function checkpointStory(){
  if(!autoSaveEnabled){
    if(save(true)){$('sceneImageStatus').textContent=uiText('進度已手動保存。');renderSaveStatus();}
    return;
  }
  if(busy){alert(uiText('AI 正在生成；請等這一回合完成後再操作。'));return;}
  openSlotPicker();
}
async function createCheckpointSlot(){
  const active=slots.find(x=>x.id===activeSlotId);
  const manualCount=slots.filter(x=>x.kind==='manual').length;
  const proposed=uiLanguage==='en'?`${active?.name||'Story'} - Progress ${manualCount+1}`:`${active?.name||'故事'} - 進度 ${manualCount+1}`;
  const name=await openPromptDialog({title:'進度存檔',note:'建立目前故事的進度存檔；儲存後仍留在原本故事。',value:proposed});
  if(name===null)return;
  if(!save())return;
  const checkpoint=makeSlot(name,JSON.parse(JSON.stringify(state)));
  slots.push(checkpoint);
  if(!persistSlots()){slots.pop();return;}
  renderSlots();
  $('sceneImageStatus').textContent=uiText('已建立進度存檔「')+checkpoint.name+uiText('」，目前故事仍在原存檔中繼續。');
}
function openSlotPicker(){
  const dialog=$('slotPickerDialog'),list=$('slotPickerList');
  if(!dialog||!list)return;
  const manuals=slots.filter(x=>x.kind==='manual');
  if(!manuals.length){createCheckpointSlot();return;}
  list.replaceChildren();
  for(const slot of manuals){
    const s=slotSummary(slot);
    const label=document.createElement('label');
    const radio=document.createElement('input');
    radio.type='radio';radio.name='slotPick';radio.value=slot.id;
    radio.checked=slot.id===activeSlotId;
    const text=document.createElement('span');
    text.innerHTML=`<b>${esc(slot.name)}</b><small>${s.turns} ${esc(uiText('回合'))} · ${esc(uiText('好感'))} ${esc(formatAffection(s.affection))} · ${s.clockLabel?esc(s.clockLabel)+' · ':''}${esc(s.date)}</small>`;
    label.append(radio,text);
    list.append(label);
  }
  dialog.showModal();
}
function overwriteSlot(id){
  const target=slots.find(x=>x.id===id);
  if(!target||target.kind!=='manual'){alert(uiText('只能選擇手動存檔槽。'));return;}
  if(!save()){alert(uiText('無法保存目前進度，覆寫已取消。'));return;}
  const previousState=target.state,previousUpdatedAt=target.updatedAt;
  target.state=serializeState();target.updatedAt=Date.now();
  if(!persistSlots()){target.state=previousState;target.updatedAt=previousUpdatedAt;alert(uiText('無法寫入存檔：本機儲存不可用。'));return;}
  $('slotPickerDialog').close();
  renderSlots();
  $('sceneImageStatus').textContent=uiText('已覆寫進度存檔「')+target.name+uiText('」，目前故事仍在原存檔中繼續。');
}
function deleteSlot(id) {
  if (busy) { alert(uiText('AI 正在生成；請等這一回合完成後再操作。')); return; }
  const target = slots.find(x => x.id === id);
  if (!target) return;
  // 自動／快速系統格不可刪除，只能被覆寫；臨時對話格與手動格一樣可以由玩家刪除（存檔控制）。
  if (target.kind === 'auto' || target.kind === 'quick') { alert(uiText('系統存檔格不可刪除，只會在遊戲過程中自動覆寫。')); return; }
  if (!confirm(`「${target.name}」\n`+uiText('確定刪除這個存檔？此存檔的對話、好感度、劇情進度與模型設定都會永久刪除。'))) return;
  if (!save()) { alert(uiText('無法保存目前進度，刪除已取消。')); return; }

  const previousSlots = slots;
  const previousActiveSlotId = activeSlotId;
  const previousActiveStorageId = localStorage.getItem('claude_novel_active_slot_v1');
  slots = slots.filter(x => x.id !== id);

  // 即使刪除最後一個手動存檔，也允許操作完成；系統只會立即建立一個全新的空白存檔，
  // 避免 App 沒有 active save 可以繼續遊玩。這個新存檔不會保留被刪除的內容。
  if (!slots.some(x => x.kind === 'manual')) {
    const freshSlot = makeSlot('存檔 1', {
      provider: state.provider, model: state.model, apiBase: state.apiBase, aiConnectionId:state.aiConnectionId,
      temperature: state.temperature, topP: state.topP, maxTokens: state.maxTokens
    });
    slots = [freshSlot, ...slots];
  }

  const wasActive = id === activeSlotId;
  if (wasActive) {
    const fallback = slots.find(x => x.kind === 'manual') || slots[0];
    try { localStorage.setItem('claude_novel_active_slot_v1', fallback.id); }
    catch (e) { slots = previousSlots; alert(uiText('無法刪除存檔：')+(e.message || uiText('本機儲存不可用。'))); render(); return; }
  }

  if (!persistSlots()) {
    slots = previousSlots;
    try {
      if (previousActiveStorageId === null) localStorage.removeItem('claude_novel_active_slot_v1');
      else localStorage.setItem('claude_novel_active_slot_v1', previousActiveStorageId);
    } catch {}
    activeSlotId = previousActiveSlotId;
    alert(uiText('無法刪除存檔：本機儲存不可用。'));
    render();
    return;
  }
  // 新清單（索引）已經寫入成功，這時才把它那一格的內容與備份一起清掉，不會刪到還被索引指到的資料。
  try {
    localStorage.removeItem(slotKey(id));
    localStorage.removeItem(slotBackupKey(id));
  } catch {}
  persistedSlotPayloads.delete(String(id));
  if (wasActive) {
    const next = slots.find(x => x.kind === 'manual') || slots[0];
    activeSlotId = next.id;
    manualSaveDirty=false;
    state = {...fresh(), ...(next.state || {}), storyMemory: next.state?.storyMemory || ''};
    resetRareGoodnightWarmup();
    settings();
  }
  pruneSceneImagesForSlot(id);
  render();
}
function systemSlot(id){ return slots.find(x => x.id === id); }
// 快速存檔：覆寫專用快速格，不影響手動存檔與未保存標記。
function quickSave(){
  if (busy) return;
  if (state.gameOver) return; // R50：Game Over 中不可存檔，只能重新開始故事。
  const slot = systemSlot(QUICK_SLOT_ID);
  if (!slot) return;
  const previousState = slot.state, previousUpdatedAt = slot.updatedAt;
  slot.state = serializeState(); slot.updatedAt = Date.now();
  if (!persistSlots()) { slot.state = previousState; slot.updatedAt = previousUpdatedAt; renderSlots(); return; }
  renderSlots();
  const status = $('sceneImageStatus');
  if (status) status.textContent = uiText('已寫入快速存檔。');
  const exitStatus = $('storyExitSaveStatus');
  if (exitStatus) exitStatus.textContent = uiText('已寫入快速存檔。');
}
// 快速讀檔：讀取專用快速格；空的快速格會提示而不切換。
function quickLoad(){
  if (busy) return;
  const slot = systemSlot(QUICK_SLOT_ID);
  const hasStory = slot && (((slot.state?.history) || []).length > 0 || String(slot?.state?.pendingAction || ''));
  if (!hasStory) { alert(uiText('快速存檔目前是空的。')); return; }
  switchSlot(QUICK_SLOT_ID);
}
// 故事中離開／重新開局共用的暫停與重置流程。
function pauseStoryForExit(){
  webAutoFlowActive=false;
  webAutoFlowBaseKey='';
  webAutoFlowRetryAt=0;
  try{void window.claudeDesktop?.setWebAutoFlow?.({enabled:false}).catch(()=>{});}catch{}
  stopWebClipboardMonitor();
  manualClipboardPasteInProgress=false;
}
function leaveStory(){
  if(!state.history.length&&!state.pendingAction)return;
  storyExited=true;
  storyLogOpen=false;
  setGameMenu(false);
  pauseStoryForExit();
  const exitSaveStatus=$('storyExitSaveStatus');
  if(exitSaveStatus)exitSaveStatus.textContent='';
  render();
}
function resumeStory(){
  if(!storyExited)return;
  storyExited=false;
  const queued=webAutoQueuedReply;
  webAutoQueuedReply='';
  render();
  if(queued)setTimeout(()=>queueWebAutoReply(queued),0);
}
function restartBaseState(){
  return {...fresh(),provider:state.provider,model:state.model,apiBase:state.apiBase,aiConnectionId:state.aiConnectionId,aiMode:state.aiMode,webProvider:state.webProvider,promptHistory:state.promptHistory,characterPortrait:state.characterPortrait,customModels:state.customModels,modelConfigs:state.modelConfigs,characterName:state.characterName,characterProfile:state.characterProfile,claudePersonaMode:state.claudePersonaMode,worldSetting:state.worldSetting,storyTemplate:state.storyTemplate,characterSheet:state.characterSheet,difficulty:state.difficulty,temperature:state.temperature,topP:state.topP,maxTokens:state.maxTokens,responseMode:state.responseMode||'fast',promptMode:state.promptMode,openingStyle:state.openingStyle,openingCustomPrompt:state.openingCustomPrompt,worldBook:state.worldBook,authorNote:state.authorNote,promptTweaks:state.promptTweaks,undoToolsEnabled:state.undoToolsEnabled,historyEditEnabled:state.historyEditEnabled,letterEventEnabled:state.letterEventEnabled===true};
}
function restartCurrentStory(){
  if(busy){alert(uiText('AI 正在生成；請等這一回合完成後再重新開局。'));return false;}
  const message='要重新開局嗎？重新開局會用新故事取代目前存檔的內容。若要保留目前故事，請先按「存檔」建立進度存檔，或按 Ctrl+S 快速存檔。';
  if(!confirm(uiText(message)))return false;
  pauseStoryForExit();
  const previous=state;
  state=restartBaseState();
  storyExited=false;
  webAutoQueuedReply='';
  storyLogOpen=false;
  storyNoticeText='';
  lastRenderedAffection=null;
  lastScrolledHistoryLength=-1;
  if(!save(true)){
    state=previous;
    alert(uiText('重新開局失敗：本機存檔空間不足，原故事已保留。'));
    render();
    return false;
  }
  setGameMenu(false);
  render();
  refreshTimeTheme();
  return true;
}
function openStorySlots(){
  if(busy)return;
  setGameMenu(true);
  showGameMenuView('gmMenuSlots');
  renderSlots();
}
// 自動存檔格：每次成功回合後寫入，與手動存檔互相獨立。
// 手動模式下不寫入任何內容，完全由玩家按手動存檔決定。
function writeAutoSave(){
  if (!autoSaveEnabled) return;
  if (slots.some(x => x.kind === 'incognito')) return; // 臨時對話：該格自己隨回合落地（save()），不另外寫入自動存檔格
  const slot = systemSlot(AUTO_SLOT_ID);
  if (!slot) return;
  const previousState = slot.state, previousUpdatedAt = slot.updatedAt;
  slot.state = serializeState(); slot.updatedAt = Date.now();
  if (!persistSlots()) { slot.state = previousState; slot.updatedAt = previousUpdatedAt; }
}
function renameSlot(id, name) {
  const slot = slots.find(x => x.id === id);
  const value = (name || '').trim().slice(0, 60);
  if (!slot || !value) return;
  const previousName = slot.name, previousUpdatedAt = slot.updatedAt;
  slot.name = value; slot.updatedAt = Date.now();
  if (!persistSlots()) { slot.name = previousName; slot.updatedAt = previousUpdatedAt; return; }
  render();
}
// ==== SECTION 11｜畫面渲染（render()、對話回顧；innerHTML 一律經 esc()）====
const HTML_ESCAPES = Object.freeze({'&':'&amp;','<':'&lt;','>':'&gt;'});
function esc(s='') { return String(s).replace(/[&<>]/g,c=>HTML_ESCAPES[c]); }
// 批6 Ｂ6-3：輸入引導只填文字框，不改資料模型。
const INPUT_TEMPLATES={
  do:{label:'做一件事',aria:'帶入「做」模板',text:'我做出行動：……'},
  say:{label:'說一句話',aria:'帶入「說」模板',text:'我看著她，說：「……」'},
  think:{label:'想一個念頭',aria:'帶入「想」模板',text:'我心裡想：……'}
};
function insertInputTemplate(kind){
  const input=$('freeInput'),item=INPUT_TEMPLATES[kind];
  if(!input||!item)return;
  const template=uiText(item.text);
  const current=input.value.trimEnd();
  input.value=current?current+'\n'+template:template;
  input.focus();
  try{input.setSelectionRange(input.value.length,input.value.length);}catch{}
}
function setStatus(text='') { $('userLabel').textContent = text || uiText('本機使用 · 不需登入'); }
function renderCharacterPortrait(){
  const custom=normalizeCharacterPortrait(state.characterPortrait);
  const src=custom||'assets/portrait.webp';
  for(const image of [$('storyPortrait'),$('profilePortrait')])if(image){image.src=src;image.alt=activeCharacterName();}
  // G16：開始介面用專屬立繪；使用者換了自訂角色圖時，開始介面也改顯示他的圖
  const startImage=$('startPortrait');if(startImage)startImage.alt=activeCharacterName();
  $('tab-story')?.classList.toggle('has-custom-portrait',Boolean(custom));
}

// 使用者在系統設定要求「減少動態」時，捲動改為即時，不做平滑動畫。
function scrollBehavior(){
  try{return window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';}catch{return 'smooth';}
}
// 由後往前找最後一個符合條件的項目；避免每次 render 都複製並反轉整段歷史。
function findLastEntry(list,predicate){
  if(!Array.isArray(list))return undefined;
  for(let i=list.length-1;i>=0;i--){if(predicate(list[i]))return list[i];}
  return undefined;
}
// 故事回顧（#transcript）快取：歷史只會 push 或整個換新陣列，所以以「陣列參照＋長度＋最後一筆」判斷是否變動。
let transcriptCache={history:null,length:-1,tail:null,key:''};
function renderTranscript(transcript){
  // 回顧收合時整塊隱藏，不必重建；展開時才建立（且僅在內容真的改變時）。
  if(!storyLogOpen)return;
  const history=state.history,tail=history.length?history[history.length-1]:null;
  const editOn=state.historyEditEnabled!==false&&!busy;
  const key=activeSlotId+'|'+uiLanguage+'|'+activeCharacterName()+'|'+(editOn?'edit':'read');
  if(transcriptCache.history===history&&transcriptCache.length===history.length&&transcriptCache.tail===tail&&transcriptCache.key===key)return;
  transcript.innerHTML=history.map((x,index)=>'<div class="bubble '+esc(x.role)+'"><small>'+esc(x.role==='user'?uiText('玩家'):x.role==='ending'?uiText('結局'):x.role==='gift'||x.role==='gift-result'?uiText('禮物對話'):activeCharacterName())+'</small>'+(editOn?'<button class="history-edit-btn" type="button" data-history-index="'+index+'">✎</button>':'')+'<div>'+esc(x.text)+'</div></div>').join('');
  transcriptCache={history,length:history.length,tail,key};
  if(transcript.querySelectorAll)transcript.querySelectorAll('.history-edit-btn').forEach(button=>{
    button.setAttribute('aria-label',uiText('編輯這則訊息'));
    button.setAttribute('title',uiText('編輯這則訊息'));
    button.onclick=()=>openHistoryEdit(Number(button.dataset.historyIndex));
  });
}
// 追加九：歷史編輯（只改文字，不動好感與進度；歷史即提示詞來源，改完下一回合立即生效）。
let historyEditIndex=-1;
function openHistoryEdit(index){
  if(state.historyEditEnabled===false)return;
  const entry=state.history[index];
  if(!entry)return;
  historyEditIndex=index;
  const roleLabel=entry.role==='user'?uiText('玩家'):entry.role==='ending'?uiText('結局'):entry.role==='gift'||entry.role==='gift-result'?uiText('禮物對話'):activeCharacterName();
  const meta=$('historyEditMeta');
  if(meta)meta.textContent=roleLabel;
  const text=$('historyEditText');
  if(text)text.value=String(entry.text||'');
  const status=$('historyEditStatus');
  if(status)status.textContent='';
  $('historyEditDialog')?.showModal();
}
// v4.6.34｜Anthropic 信件結局：顯示通知信圖片與「重新開始故事」；好感度數值照實顯示。
function syncAnthropicLetterToggles(){
  const enabled=state.letterEventEnabled===true;
  for(const id of ['profileAnthropicLetterToggle','featureAnthropicLetterToggle','openingAnthropicLetterToggle']){
    const toggle=$(id);
    if(toggle&&toggle.checked!==enabled)toggle.checked=enabled;
  }
}
function bindProfileAnthropicLetterToggle(){
  const toggle=$('profileAnthropicLetterToggle');
  if(!toggle)return;
  toggle.onchange=()=>{
    state.letterEventEnabled=toggle.checked===true;
    if(!save()){toggle.checked=!toggle.checked;syncAnthropicLetterToggles();return;}
    syncAnthropicLetterToggles();
  };
}
function renderAnthropicLetter(){
  const screen=$('anthropicLetterScreen');
  if(!screen)return;
  const show=state.gameOver&&state.letterEvent===true;
  screen.hidden=!show;
  if(!show)return;
  const affection=$('anthropicLetterAffection');
  if(affection)affection.textContent=formatAffection(state.affection);
  const restart=$('anthropicLetterRestartBtn');
  if(restart)restart.disabled=busy;
}
function renderAlbum(){
  const grid=document.getElementById('albumGrid');
  if(!grid) return;
  grid.innerHTML=ALBUM_ENTRIES.map(entry=>{
    const unlocked=isAlbumUnlocked(state,entry.id);
    if(!unlocked) return `<div class="album-item album-locked" data-album="${esc(entry.id)}"><div class="album-lock">🔒</div><div class="album-title">${esc(entry.title)}</div></div>`;
    return `<div class="album-item" data-album="${esc(entry.id)}"><img src="assets/${esc(entry.file)}" alt="${esc(entry.title)}" loading="lazy"><div class="album-title">${esc(entry.title)}</div></div>`;
  }).join('');
  grid.querySelectorAll('.album-item:not(.album-locked)').forEach(item=>{
    item.onclick=()=>openAlbumLightbox(item.dataset.album);
  });
}
function openAlbumLightbox(id){
  const entry=albumEntry(id);
  if(!entry) return;
  const lb=document.getElementById('albumLightbox');
  const img=document.getElementById('albumLightboxImg');
  if(!lb||!img) return;
  img.src='assets/'+entry.file;
  img.alt=entry.title;
  lb.hidden=false;
}
function closeAlbumLightbox(){
  const lb=document.getElementById('albumLightbox');
  if(lb) lb.hidden=true;
}
function unlockAlbum(id){
  id=String(id);
  if(!Array.isArray(state.albumUnlocked)) state.albumUnlocked=[];
  if(!state.albumUnlocked.includes(id)){ state.albumUnlocked=[...state.albumUnlocked,id]; }
}

function render() {
  renderCharacterName();
  renderWorldSetting();
  renderProfileProfile();
  renderCharacterPortrait();
  renderCharacterSheet();
  window.__storyEmotion = normalizeStoryEmotion(state.storyEmotion);
  window.__storyEmotionIntensity = normalizeStoryEmotionIntensity(state.storyEmotionIntensity);
  window.__storyEmotionToken = `${activeSlotId||'active'}:${Math.max(0,Math.floor(Number(state.storyEmotionToken)||0))}`;
  document.querySelector('.vn-stage')?.setAttribute('data-story-emotion',window.__storyEmotion);
  document.querySelector('.vn-stage')?.setAttribute('data-story-emotion-token',window.__storyEmotionToken);
  document.querySelector('.vn-stage')?.setAttribute('data-story-event',normalizeStoryEventFlag(state.storyEvent));
  document.querySelector('.vn-stage')?.setAttribute('data-story-event-token',`${activeSlotId||'active'}:${Math.max(0,Math.floor(Number(state.storyEventToken)||0))}`);
  window.__portraitAnim?.setStoryEmotion?.(window.__storyEmotion,window.__storyEmotionIntensity,window.__storyEmotionToken);
  bindProfileAnthropicLetterToggle();
  syncAnthropicLetterToggles();
  $('affVal').textContent = formatAffection(state.affection);
  $('affProgress').value = state.affection;
  $('affLabel').textContent = uiText('好感度') + '・' + uiText(affectionStageOf(state.affection).zh);
  applyAffectionDisplayPreference();
  const storyClockNow = realStoryClock(state.storyClock);
  $('storyClockChip').hidden = !storyClockNow.enabled;
  if (storyClockNow.enabled) $('storyClockChip').textContent = storyClockLabel(storyClockNow, uiLanguage);
  $('storyNotice').hidden = !storyNoticeText;
  $('storyNotice').textContent = storyNoticeText;
  $('tab-story').classList.toggle('text-only',sceneMode==='text');
  $('tab-story').classList.toggle('story-empty',!state.history.length&&!state.pendingAction);
  const aiStoryTurns=state.history.filter(item=>item.role==='ai'||item.role==='assistant');
  const firstStoryText=String(aiStoryTurns[0]?.text||'');
  const firstStorySentences=(firstStoryText.match(/[。！？.!?]/g)||[]).length;
  $('tab-story').classList.toggle('g43-story-opening',aiStoryTurns.length<1||(aiStoryTurns.length===1&&firstStorySentences<2));
  $('tab-story').classList.toggle('has-web-pending',Boolean(state.pendingAction&&state.aiMode==='web'));
  $('sceneImageBtn').hidden=false;
  $('importSceneImageBtn').hidden=false;
  $('sceneImageStatus').textContent=sceneMode==='text'?uiText('文字場景模式：目前場景會以文字詳細描述，不產生圖片。'):uiText('選擇你的回應，讓故事繼續');
  loadSceneImage();
  renderPortraitToggle();
  $('affProgress').value = state.affection;
  setStatus();
  renderSaveStatus();
  syncWebClipboardMonitor();
  syncWebAutoFlow();
  renderAiConnections();
  renderSlots();
  const transcript=$('transcript');
  renderTranscript(transcript);
  transcript.scrollTop = transcript.scrollHeight;
  transcript.classList.toggle('log-collapsed',!storyLogOpen);
  const backlogOverlay=$('gmBacklog'); if(backlogOverlay) backlogOverlay.hidden=!storyLogOpen;
  const logButton=$('storyLogBtn');
  logButton.textContent=storyLogOpen?uiText('收起故事回顧'):uiText('▤　故事回顧');
  logButton.setAttribute('aria-expanded',String(storyLogOpen));
  logButton.onclick=()=>{storyLogOpen=!storyLogOpen;render();};
  // 追加九：回退鈕（回想底部）只在有快照且工具開啟時顯示；也可由設定頁隱藏。
  const undoReady=state.undoToolsEnabled!==false&&normalizeLastTurnUndo(state.lastTurnUndo)!==null;
  const rewriteBtn=$('rewriteLastBtn');
  if(rewriteBtn){rewriteBtn.hidden=!undoReady;rewriteBtn.disabled=busy||!undoReady;}
  const deleteBtn=$('deleteLastBtn');
  if(deleteBtn){deleteBtn.hidden=!undoReady;deleteBtn.disabled=busy||!undoReady;}
  // 選單內的功能頁：可見時才同步（辭典清單／資料摘要）。
  if(!$('gmMenuDict')?.hidden)renderWorldBook();
  if(!$('gmMenuData')?.hidden)renderKitSummary();
  const turns=state.history.filter(x=>x.role==='user').length;
  $('sceneProgress').textContent=uiLanguage==='en'?(turns?'Turn '+turns:state.history.length?'Prologue':'New Story'):(turns?'第 '+turns+' 回合':state.history.length?'序章':'新故事');
  const latest=findLastEntry(state.history,x=>x.role==='ai'||x.role==='user'||x.role==='ending'||x.role==='gift'||x.role==='gift-result');
  $('dialogueName').textContent=busy?uiText('正在翻閱故事…'):latest?.role==='ending'?uiText('結局'):latest?.role==='user'?uiText('玩家'):latest?.role==='gift'||latest?.role==='gift-result'?uiText('禮物對話'):!latest?uiText('故事尚未開始'):activeCharacterName();
  if (!getStoryLineRunner().isPlaying) {
    $('dialogueText').textContent=busy?uiText('AI 正在構思故事…'):latest?.text||uiText('先選擇 AI 和序章風格，再按「開始故事」。');
    $('dialogueText').classList.remove('is-line-playing');
  }
  g12UpdatePageHint();
  try{
    const prev=lastRenderedAffection;
    lastRenderedAffection=state.affection;
    let badge=document.getElementById('affDelta');
    if(!badge){
      badge=document.createElement('span');
      badge.id='affDelta';
      badge.className='affection-delta';
      badge.setAttribute('aria-live','polite');
      document.querySelector('.affection-box')?.append(badge);
    }
    if(prev!==null&&Number.isFinite(prev)){
      const d=Math.round((state.affection-prev)*100)/100;
      if(d!==0){
        badge.textContent=(d>0?'+':'')+d;
        badge.dataset.dir=d>0?'up':'down';
        badge.classList.remove('show');
        void badge.offsetWidth;
        badge.classList.add('show');
        clearTimeout(badge._t);
        badge._t=setTimeout(()=>badge.classList.remove('show'),2600);
      }
    }
  }catch{}
  if(lastScrolledHistoryLength<0||lastScrolledSlotId!==activeSlotId){
    lastScrolledHistoryLength=state.history.length;
    lastScrolledSlotId=activeSlotId;
  }else if(state.history.length>lastScrolledHistoryLength){
    lastScrolledHistoryLength=state.history.length;
    lastScrolledSlotId=activeSlotId;
    scrollDialogueIntoView();
  }
  $('restartBtn').style.display = state.history.length ? 'block' : 'none';
  // 故事中的存檔／離開控制：只有已經有故事（含待完成回合）時才顯示。
  // 離開故事是「暫停」不是刪檔；overlay 會停在目前回合，按繼續即可回來。
  const hasStory=Boolean(state.history.length||state.pendingAction);
  if(!hasStory)storyExited=false;
  const exitScreen=$('storyExitScreen');
  if(exitScreen)exitScreen.hidden=!storyExited||!$('tab-story')?.classList.contains('active');
  // R50｜好感度歸 0 的 Game Over 覆蓋層：只看 state.gameOver；顯示時一切互動只剩「重新開始故事」。
  const gameOverScreen=$('gameOverScreen');
  if(gameOverScreen)gameOverScreen.hidden=!state.gameOver;
  if(gameOverScreen&&state.letterEvent)gameOverScreen.hidden=true;
  renderAnthropicLetter();
  const saveHud=$('storySaveHudBtn');
  if(saveHud){saveHud.hidden=!hasStory;saveHud.disabled=busy;}
  const exitHud=$('exitStoryHudBtn');
  if(exitHud)exitHud.hidden=!hasStory;
  const exitMenu=$('exitStoryMenuBtn');
  if(exitMenu)exitMenu.hidden=!hasStory;
  if(storyExited){
    const turns=state.history.filter(x=>x.role==='user').length;
    const summary=$('storyExitSummary');
    if(summary)summary.textContent=turns
      ? uiText('目前進度：第 ')+turns+uiText(' 回合。故事與存檔都保留在同一格，繼續後會回到剛才的畫面。')
      : uiText('故事剛開始，目前進度與存檔都保留。繼續後會回到剛才的畫面。');
    const exitSlots=$('exitOpenSlotsBtn');
    if(exitSlots)exitSlots.disabled=busy;
    const exitRestart=$('exitRestartStoryBtn');
    if(exitRestart)exitRestart.disabled=busy;
  }
  renderStoryQuickControls();
  ['restartBtn','quickSaveBtn','quickLoadBtn','newSlotBtn','importBtn','importFile','enableWebAiBtn','enableApiAiBtn','storySlotPicker','deleteStorySlotBtn','saveStoryBtn','responseModeBtn','promptModeBtn'].forEach(id=>{const control=$(id);if(control)control.disabled=busy;});
  document.querySelectorAll('#saveSlots button').forEach(control=>{control.disabled=busy;});
  const c = $('choices');
  if (busy) {
    // G44：回合等待畫面改為「正在書寫」插畫＋下方同一行文字；圖形保持縱橫比、只依高度上限縮放。
    const busyLabel = esc(activeCharacterName()+uiText('正在書寫……'));
    c.innerHTML = '<figure class="story-busy-art" aria-live="polite"><img src="assets/g44-writing.jpg" alt="" draggable="false"><figcaption class="loading-dot">'+busyLabel+'</figcaption></figure>';
    applyUiLanguage(); return;
  }
  if (state.ending&&!(state.giftConversations||[]).length) { c.innerHTML = '<div class="ai-hint">'+uiText('本章已結束，可以重新開始。')+'</div>'; applyUiLanguage(); return; }
  if(!state.history.length&&!state.pendingAction){renderOpeningSetup(c);applyUiLanguage();return;}
  const fixedChoices = state.ending?[]:(state.choices || []).slice(0,7);
  const giftPanels=(state.giftConversations||[]).map((conversation,index)=>`<section class="gift-conversation" aria-label="禮物對話"><b>🎁 ${uiText('禮物對話')}</b><p>${esc(uiLanguage==="en"?conversation.hintEn:conversation.hint)}</p><small>${uiText('選一份禮物送給她')}</small><div class="gift-options">${conversation.options.map(option=>`<button type="button" class="choice-btn gift-choice" data-gift-event="${esc(conversation.id)}" data-gift-option="${esc(option.id)}" ${state.pendingAction?"disabled":""}>${uiText('送出禮物')}：${esc(uiLanguage==="en"?option.nameEn:option.name)}</button>`).join('')}</div></section>`).join('');
  const webStepsHtml=(isAndroidApp()?WEB_AI_GUIDE_STEPS_ANDROID:WEB_AI_GUIDE_STEPS).map(step=>`<li>${uiText(step)}</li>`).join('');
  const manualReplyEditor=state.pendingAction&&state.aiMode==='web'?`<div class="web-reply-fallback"><label for="webAiReplyInput">${uiText(state.pendingAction==='__OPENING__'?'貼上 AI 序章回覆':'貼上／輸入 AI 回覆')}</label><textarea class="web-ai-reply" id="webAiReplyInput" rows="3" maxlength="120000" spellcheck="false" autocomplete="off" placeholder="貼上或輸入完整 AI JSON">${esc(state.webReply||'')}</textarea><p class="note web-ai-reply-hint">${uiText(state.pendingAction==='__OPENING__'?'序章 AI 回覆可直接貼在這裡；若格式錯誤，先用 AI 修復提示，再將完整 JSON 貼回。未完成內容會保留。':'可貼上或輸入完整 AI JSON；未完成可繼續編輯；有效回覆會自動接續。按 Ctrl+Enter 可手動套用。')}</p><button class="choice-btn ai-btn" id="applyWebReplyBtn" type="button">將 AI 回覆接回故事</button></div>`:'';
  const quickWebProviders=WEB_AI_PROVIDERS.filter(item=>['openai','anthropic','gemini'].includes(item.id));
  const pendingBrowserMode=normalizeWebBrowserMode(webBrowserMode,state.webProvider);
  const pendingModelKey=webModelCacheKey(state.webProvider,pendingBrowserMode);
  const pendingModelInfo=mergeManualWebModels(webModelStateByProvider.get(pendingModelKey),pendingModelKey);
  const pendingModels=pendingModelInfo.models||[];
  const pendingCurrentModel=pendingModelInfo.current||'';
  const pendingManualModels=manualWebModelsFor(pendingModelKey);
  const pendingExternalOnly=['gemini','anthropic'].includes(state.webProvider);
  const modelMenuOptions=pendingModels.length?pendingModels.map((name,index)=>`<option value="${index}" ${name===pendingCurrentModel?'selected':''}>${esc(name)}</option>`).join(''):`<option value="">${uiText('按「讀取官網模型選單」取得目前帳號可用模型')}</option>`;
  const modelControls=!isAndroidApp()?`<div class="web-model-switch"><label>${uiText('官網可用模型')}<select id="pendingWebModel" ${pendingModels.length?'':'disabled'}>${modelMenuOptions}</select></label><button type="button" class="choice-btn" id="refreshWebModelsBtn" ${window.claudeDesktop?.isDesktop?'':'disabled'}>${uiText(pendingBrowserMode==='embedded'?'填入提示詞並更新模型':'讀取官網模型選單')}</button><div class="web-model-manual"><label for="manualWebModelInput">${uiText('手動更新模型清單')}</label><textarea id="manualWebModelInput" rows="2" maxlength="4000" spellcheck="false">${esc(pendingManualModels.join('\n'))}</textarea><div class="web-model-manual-actions"><button type="button" class="choice-btn" id="saveManualWebModelsBtn">${uiText('更新清單')}</button><button type="button" class="choice-btn" id="clearManualWebModelsBtn">${uiText('清除手動模型')}</button></div><p class="note">${uiText('手動名稱會保存在此裝置，並與官網讀取結果合併；切換時仍以官網目前選單為準。')}</p></div><p class="note" id="pendingWebModelStatus">${uiText(pendingCurrentModel?'目前模型':'先登入官網，再讀取模型')}${pendingCurrentModel?'：'+esc(pendingCurrentModel)+'。'+uiText('選一個項目即可切換。'):'。'+(pendingBrowserMode==='embedded'?'':uiText('外部瀏覽器會讀取官網目前帳號的模型；清單隨官網更新。'))}${pendingManualModels.length?' '+uiText('手動清單：')+pendingManualModels.length+uiText('個。'):''}</p></div>`:'';
  const webReplyControls=state.pendingAction&&state.aiMode==='web'?`<div class="web-flow-intro"><div class="web-flow-intro-head"><p>${uiText('切換網站不會清除存檔或本回合。先選網站，再選模型或登入，最後貼上回覆；登入與網站對話由官網帳號保存，故事對話會自動保存。')}</p><div class="web-ui-zoom" role="group" aria-label="介面與提示大小"><button type="button" id="shrinkWebInterfaceBtn" title="縮小介面與提示" aria-label="縮小介面與提示">${uiText('縮小介面')}</button><button type="button" id="restoreWebInterfaceBtn" title="還原介面與提示" aria-label="還原介面與提示">${uiText('還原介面')}</button></div></div></div><div class="web-quota-switch"><p class="web-provider-switch-label">${uiText('一鍵切換 AI 網站')}</p><div class="web-provider-quick-list" role="group" aria-label="一鍵切換 AI 網站">${quickWebProviders.map(item=>`<button type="button" class="web-provider-quick" data-pending-web-provider="${item.id}" aria-pressed="${state.webProvider===item.id}">${esc(item.name)}</button>`).join('')}</div><label>${uiText('切換網站服務')}<select id="pendingWebProvider"></select></label><label class="pending-web-mode-label">${uiText('官網開啟方式')}<select id="pendingWebBrowserMode"><option value="embedded" ${pendingExternalOnly?'disabled':''} ${pendingBrowserMode==='embedded'?'selected':''}>${uiText(pendingExternalOnly?'App 內瀏覽器（Claude／Gemini 請用外部瀏覽器登入）':'App 內瀏覽器（可一鍵切模型）')}</option><option value="external" ${pendingBrowserMode==='external'?'selected':''}>${uiText('外部自動化瀏覽器（登入會保留）')}</option></select></label>${modelControls}<label class="pending-web-mode-label">${uiText('提示詞模式')}<select id="pendingPromptMode"><option value="standard">${uiText('標準（完整規則）')}</option><option value="saving">${uiText('⚡ 節省模式（輸入約少一半）')}</option></select></label><p class="note" id="pendingPromptModeNote"></p><label class="pending-web-mode-label">${uiText('自動送出與自動接回')}<select id="pendingWebAutoFlow"><option value="on">${uiText('開啟（自動送出，回覆自動接回）')}</option><option value="off">${uiText('關閉（手動送出／複製）')}</option></select></label><p class="note" id="pendingWebAutoFlowNote"></p><p class="note web-auto-status" id="webAutoStatusNote" hidden></p><button type="button" id="webAutoHealthBtn" class="web-auto-health-btn" hidden>${uiText('自動化自檢')}</button></div><div class="web-paste-step"><p>${uiText('複製 AI 回覆後會自動接回；只會套用符合故事格式的完整回覆。')}</p><p>${uiText('等待網頁 AI 回覆期間，會自動接回剪貼簿中的有效故事回覆。')}</p>${manualReplyEditor}<button class="choice-btn ai-btn" id="openWebSiteBtn" type="button">${uiText('開啟官網')}</button><button class="choice-btn ai-btn" id="readWebClipboardBtn">${uiText('已在官網複製回覆？讀取剪貼簿並接續')}</button></div><details class="web-steps-details"><summary>${uiText('查看完整操作步驟')}</summary><ol class="web-steps">${webStepsHtml}</ol></details>`:'';
  const keyboardHintBase=state.pendingAction&&state.aiMode==='web'?'網頁回合快捷操作：提示詞已複製。到官方 AI 輸入框按 Ctrl+V，再按 Enter 送出。網站複製有效回覆後，App 會在等待回合自動偵測、驗證並接續；不必切回貼上。若剪貼簿讀取受限，使用下方備用按鈕或手動貼上。':state.pendingAction?'本回合等待 AI 回覆，故事進度已保留。':'遊戲鍵盤提醒：先讓遊戲視窗在前景，且不要把游標留在文字輸入框。按 1–7 選對應故事選項；按 8 開啟自訂行動並在文字框輸入；游標在自訂行動輸入框內時按 Ctrl+Enter 送出。';
  const keyboardHint=keyboardHintBase+' '+uiText('快速鍵：Q 快速存檔，L 快速讀檔。');
  const apiRecoveryControls=`<button class="choice-btn ai-btn" id="retryPendingTurn">${uiText('重試目前回合')}</button><button class="choice-btn" id="retryPendingWebTurn">${uiText('改用官方 AI 網頁完成這一回合')}</button>`;
  const webToApiRecovery=state.aiMode==='web'&&aiConnections.length?`<button class="choice-btn" id="retryPendingApiTurn">${uiText('改用已設定的 API 完成這一回合')}</button>`:'';
  const webMoreActions=state.pendingAction&&state.aiMode==='web'?`<details class="web-more-actions"><summary>${uiText('其他操作與備份')}</summary><button class="choice-btn" id="copyWebPromptBtn">${uiText('重新複製提示詞')}</button>${isAndroidApp()?'':`<button class="choice-btn" id="restoreWebLayoutBtn">${uiText('還原遊戲視窗')}</button>`}${webToApiRecovery}<button class="choice-btn" id="backupPendingSaveBtn">${uiText('匯出包含待完成回合的存檔備份')}</button><button class="choice-btn" id="openAiSettings">${uiText('前往 AI 帳號設定')}</button></details>`:'';
  c.innerHTML = (state.pendingAction ? `<div class="pending-turn" role="status"><b>本回合尚未生成，故事進度已保留。</b><p>${esc(uiErrorText(state.lastAiError||(state.aiMode==='web'?'提示詞已準備好；請依下方步驟手動送出。':'切換到可用的 AI 帳號後即可重試。')))}</p><p>${uiText('AI 尚未成功完成這一回合；故事和玩家行動都已保存。你可以重試、切換 AI 服務／帳號、改用另一種模式，或匯出包含待辦回合的備份。')}</p>${state.aiMode==='web'?webReplyControls:apiRecoveryControls}${state.aiMode==='web'?webMoreActions:`${webToApiRecovery}<button class="choice-btn" id="backupPendingSaveBtn">${uiText('匯出包含待完成回合的存檔備份')}</button><button class="choice-btn" id="openAiSettings">${uiText('前往 AI 帳號設定')}</button>`}</div>` : '') + (state.ending?'<div class="ai-hint">'+uiText('本章已結束，仍可處理尚未完成的送禮互動。')+'</div>':'') + giftPanels + fixedChoices.map((x,i)=>`<button class="choice-btn" data-i="${i}" ${state.pendingAction?'disabled':''}>${i+1}. ${esc(x)}</button>`).join('') +
    `<button class="choice-btn free-choice-toggle" id="freeChoiceToggle" ${state.pendingAction||state.ending?'disabled':''}>8. ${uiText('自訂行動／台詞')}</button>
     <div class="free-action" id="freeActionPanel" hidden>
       <div class="free-title">8. ${uiText('自訂行動／台詞')}</div>
       <div class="free-help">${uiText('自己決定現在要做什麼、要說什麼。送出後，AI 會把你的內容當成本回合的實際行動，結合目前小說場景、角色人格、好感度與前文，重新演算下一段劇情。')}</div>
       <div class="input-guide" id="inputGuide"><span class="input-guide-label">${uiText('不知道怎麼寫？從模板開始：')}</span><button type="button" class="input-template" data-input-template="do" aria-label="帶入「做」模板" title="帶入「做」模板">${uiText('做一件事')}</button><button type="button" class="input-template" data-input-template="say" aria-label="帶入「說」模板" title="帶入「說」模板">${uiText('說一句話')}</button><button type="button" class="input-template" data-input-template="think" aria-label="帶入「想」模板" title="帶入「想」模板">${uiText('想一個念頭')}</button></div>
       <div class="input-guide-hint">${uiText('三個模板只會填入文字框，不會自動送出，也不會改變存檔格式。')}</div>
       <div class="free-row"><textarea id="freeInput" rows=3 maxlength=2000 ${state.pendingAction||state.ending?'disabled':''} placeholder="選「做／說／想」快速帶入，或直接寫下你這回合的行動、台詞或念頭。"></textarea><button class="choice-btn ai-btn free-send-wide" id="freeSend" ${state.pendingAction||state.ending?'disabled':''}>${uiText('送出我的行動')}</button></div>
     </div>` + `<p class="keyboard-hint">${uiText(keyboardHint)}</p>`;
  c.scrollTop = 0;
  if(state.pendingAction&&state.aiMode==='web'&&state.webReply){
    const pending=c.querySelector('.pending-turn');
    if(pending){
      const repair=document.createElement('button');
      repair.type='button';repair.className='choice-btn ai-btn';repair.id='repairWebChoicesBtn';
      repair.textContent=uiText('AI 漏掉七選項？一鍵準備修復提示詞');
      repair.title=uiText('複製一段要求原 AI 保留正文並補齊七個選項的提示詞，再回原對話貼上送出。');
      repair.onclick=()=>void copyWebRepairPrompt();
      const guide=pending.querySelector('.web-steps-details');
      if(guide)pending.insertBefore(repair,guide);else pending.append(repair);
    }
  }
  const pendingRecoveryGuide=c.querySelector('.pending-turn p:nth-of-type(2)');
  if(pendingRecoveryGuide)pendingRecoveryGuide.textContent=uiText(state.aiMode==='web'?'原存檔和本回合都已保留；選擇網站後可在官網切換帳號並繼續。':'先不要重新開始故事：本回合行動和存檔都已保留。格式錯誤時回官方網站重新複製完整回覆；額度不足或 AI 無法回答時，選另一個網站或已設定 API 來完成同一回合；要稍後再做可匯出待辦回合備份。');
  const retryAccounts=aiConnections.slice();
  if(state.pendingAction&&state.aiMode!=='web'&&retryAccounts.length>1){
    const pending=c.querySelector('.pending-turn');
    if(pending){
      const box=document.createElement('div'); box.className='pending-account-switch';
      const label=document.createElement('label'); label.textContent=uiText('切換已設定的 API 帳號');
      const select=document.createElement('select'); select.id='pendingAiAccountSelect';
      retryAccounts.forEach(account=>{const option=document.createElement('option');option.value=account.id;option.textContent=providerName(account.provider)+' · '+account.label+' · '+(account.profileId||uiText('預設'));option.selected=account.id===state.aiConnectionId;select.append(option);});
      label.append(select);
      const note=document.createElement('small');note.textContent=uiText('目前回合和故事存檔會保留。請選擇你有權使用的帳號；服務額度由供應商判定，App 不會自動輪換帳號。');
      const retryButton=document.createElement('button');retryButton.type='button';retryButton.className='choice-btn ai-btn';retryButton.textContent=uiText('切換所選帳號並重試本回合');
      retryButton.onclick=()=>{const selected=retryAccounts.find(x=>x.id===select.value);if(!selected)return;const previous={...state};if(selected.provider!==state.provider){state.provider=selected.provider;state.model=defaultModelForProvider(selected.provider);}state.aiConnectionId=selected.id;if(!save()){state=previous;render();return;}const action=state.pendingAction;if(action==='__OPENING__')opening();else continueStory(action);};
      box.append(label,note,retryButton);pending.append(box);
    }
  }
  c.querySelectorAll('.choice-btn[data-i]').forEach(b=>b.onclick=()=>continueStory(state.choices[+b.dataset.i]));
  c.querySelectorAll('.gift-choice').forEach(button=>button.onclick=()=>giveGift(button.dataset.giftEvent,button.dataset.giftOption));
  const retry=$('retryPendingTurn'); if(retry) retry.onclick=()=>state.pendingAction==='__OPENING__'?opening():continueStory(state.pendingAction);
  const retryPendingWeb=$('retryPendingWebTurn'); if(retryPendingWeb) retryPendingWeb.onclick=()=>retryPendingWithMode('web');
  const retryPendingApi=$('retryPendingApiTurn'); if(retryPendingApi) retryPendingApi.onclick=()=>retryPendingWithMode('api');
  const backupPendingSave=$('backupPendingSaveBtn'); if(backupPendingSave) backupPendingSave.onclick=exportData;
  const webReplyInput=$('webAiReplyInput'); if(webReplyInput){
    webReplyInput.oninput=()=>{
      state.webReply=webReplyInput.value;
      clearTimeout(webReplySaveTimer);
      webReplySaveTimer=setTimeout(()=>save(),500);
    };
    webReplyInput.addEventListener('paste',()=>setTimeout(()=>{
      if(!state.pendingAction||busy||$('webAiReplyInput')!==webReplyInput)return;
      const pastedReply=webReplyInput.value;
      if(!isCompleteWebReply(pastedReply))return;
      applyWebReply(pastedReply);
    },0));
  }
  const pendingWebProvider=$('pendingWebProvider'); if(pendingWebProvider){fillWebAIProviderSelect(pendingWebProvider,state.webProvider);pendingWebProvider.onchange=()=>void switchPendingWebProvider(pendingWebProvider.value);}
  const pendingWebBrowserMode=$('pendingWebBrowserMode');if(pendingWebBrowserMode)pendingWebBrowserMode.onchange=()=>void switchPendingWebProvider(state.webProvider,pendingWebBrowserMode.value);
  // 網頁操作自動化：提示詞可在這裡直接切「標準／節省」，並顯示這一回合兩種模式的字元數。
  const pendingPromptMode=$('pendingPromptMode');if(pendingPromptMode){
    pendingPromptMode.value=state.promptMode==='saving'?'saving':'standard';
    pendingPromptMode.onchange=()=>setPromptMode(pendingPromptMode.value);
    const promptModeNote=$('pendingPromptModeNote');
    if(promptModeNote){
      const report=webPromptSizeReport(state.pendingAction==='__OPENING__'?null:state.pendingAction);
      promptModeNote.textContent=uiLanguage==='en'
        ?(state.promptMode==='saving'
          ?`This turn's prompt is about ${report.saving} chars (standard mode ~${report.current}). Saving mode only shortens the rules and context it carries; narration length and the seven choices are unchanged. Use "Copy prompt again" or wait for the next turn to apply it.`
          :`This turn's prompt is about ${report.current} chars; saving mode would be ~${report.saving}. Use "Copy prompt again" or wait for the next turn to apply it.`)
        :(state.promptMode==='saving'
          ?`本回合提示詞約 ${report.saving} 字元（標準模式約 ${report.current}）。節省模式只縮短規則與帶入的上下文；正文長度與七個選項不變。按「重新複製提示詞」或下一回合即生效。`
          :`本回合提示詞約 ${report.current} 字元；節省模式約 ${report.saving} 字元。按「重新複製提示詞」或下一回合即生效。`);
    }
  }
  const pendingWebAutoFlow=$('pendingWebAutoFlow');if(pendingWebAutoFlow){
    pendingWebAutoFlow.value=webAutoFlow?'on':'off';
    pendingWebAutoFlow.onchange=()=>applyWebAutoFlow(pendingWebAutoFlow.value);
    const autoFlowNote=$('pendingWebAutoFlowNote');
    if(autoFlowNote){
      const mode=normalizeWebBrowserMode(webBrowserMode,state.webProvider);
      autoFlowNote.textContent=uiLanguage==='en'
        ?(webAutoFlow
          ?(mode==='external'?'On: the prompt is sent in the automation browser and the reply comes back automatically. Log in to the site once in that window first. Turn it off to send/copy manually.':'On: the prompt is filled and sent automatically, and the finished reply is pulled back into the story. Turn it off to send/copy manually.')
          :'Off: the app only prepares and copies the prompt; sending and copying the reply stay manual.')
        :(webAutoFlow
          ?(mode==='external'?'開啟中：會用自動化專用瀏覽器送出提示詞，回覆完成自動接回（首次使用請在該視窗登入一次；想手動操作就關掉）。':'開啟中：會自動填入並送出提示詞，官網回覆完成自動接回故事；想手動操作就關掉。')
          :'關閉中：App 只準備並複製提示詞，送出與複製回覆都由你手動操作（隨時可開啟）。');
    }
  }
  const webAutoStatusNote=$('webAutoStatusNote');
  if(webAutoStatusNote){webAutoStatusNote.textContent=webAutoStatusText;webAutoStatusNote.hidden=!webAutoStatusText;}
  const webAutoHealthBtn=$('webAutoHealthBtn');
  if(webAutoHealthBtn){
    webAutoHealthBtn.hidden=!(state.aiMode==='web'&&Boolean(state.pendingAction)&&webAutoFlow&&Boolean(window.claudeDesktop?.webAutoHealth));
    webAutoHealthBtn.textContent=uiText('自動化自檢');
    webAutoHealthBtn.onclick=()=>void runWebAutoHealthCheck();
  }
  const refreshWebModels=$('refreshWebModelsBtn');if(refreshWebModels)refreshWebModels.onclick=async()=>{
    const status=$('pendingWebModelStatus');
    const mode=normalizeWebBrowserMode(webBrowserMode,state.webProvider);
    if(mode==='external'){
      // 外部模式只更新官網目前帳號可見的模型，不會改動已經填入的提示詞。
      await loadWebSiteModels({force:true});
      return;
    }
    const prompt=makeWebPrompt(state.pendingAction==='__OPENING__'?null:state.pendingAction);
    let fillResult={ok:false,error:''};
    try{fillResult=await window.claudeDesktop?.fillWebAiPrompt?.(prompt)||fillResult;}catch(error){fillResult.error=error.message||'';}
    const modelsLoaded=await loadWebSiteModels({quiet:true,force:true});
    if(status){
      if(fillResult.ok)status.textContent=uiText('提示詞已填入官網輸入框，尚未送出；請確認模型與內容後自行送出。')+(modelsLoaded?' '+uiText('模型選單已更新。選一個項目即可切換。'):'');
      else status.textContent=(fillResult.error?uiErrorText(String(fillResult.error)):uiText('提示詞已複製；請先在 App 內官網登入並開啟對話，再按「填入提示詞並更新模型」。'))+(modelsLoaded?' '+uiText('模型選單已更新。選一個項目即可切換。'):'');
    }
  };
  const manualWebModelInput=$('manualWebModelInput');
  if(manualWebModelInput)manualWebModelInput.placeholder=uiText('一行一個模型名稱，也可用逗號或分號分隔');
  const saveManualWebModels=$('saveManualWebModelsBtn');
  if(saveManualWebModels)saveManualWebModels.onclick=()=>{
    const status=$('pendingWebModelStatus'),input=$('manualWebModelInput');
    const mode=normalizeWebBrowserMode(webBrowserMode,state.webProvider);
    const key=webModelCacheKey(state.webProvider,mode);
    const names=normalizeManualWebModelNames(input?.value||'');
    if(!names.length){if(status)status.textContent=uiText('請先輸入至少一個模型名稱。');input?.focus();return;}
    webManualModelsByProvider.set(key,names);
    saveWebManualModels();
    const info=mergeManualWebModels(webModelStateByProvider.get(key),key);
    applyWebModelOptions(info,$('pendingWebModel'));
    if(input)input.value=names.join('\n');
    if(status)status.textContent=uiText('已更新手動模型清單：')+names.length+uiText('個。')+uiText('請從上方選擇要切換的模型。');
  };
  const clearManualWebModels=$('clearManualWebModelsBtn');
  if(clearManualWebModels)clearManualWebModels.onclick=()=>{
    const status=$('pendingWebModelStatus'),input=$('manualWebModelInput');
    const mode=normalizeWebBrowserMode(webBrowserMode,state.webProvider);
    const key=webModelCacheKey(state.webProvider,mode);
    webManualModelsByProvider.delete(key);
    saveWebManualModels();
    const info=mergeManualWebModels(webModelStateByProvider.get(key),key);
    applyWebModelOptions(info,$('pendingWebModel'));
    if(input)input.value='';
    if(status)status.textContent=uiText('手動模型已清除；官網即時清單仍會自動更新。');
  };
  const pendingWebModel=$('pendingWebModel');if(pendingWebModel)pendingWebModel.onchange=()=>{const key=webModelCacheKey(state.webProvider,normalizeWebBrowserMode(webBrowserMode,state.webProvider)),modelInfo=mergeManualWebModels(webModelStateByProvider.get(key),key),models=modelInfo.models||[],model=models[Number(pendingWebModel.value)];if(model)void selectWebSiteModel(model);};
  if(!state.pendingAction)webModelAutoRefreshedAction='';
  // 待辦面板一打開就「強制」讀一次目前帳號的官網模型；同一回合只自動讀一次，
  // 避免每次重繪都開關官網選單，但官網改名／切換模型後下一個回合會立即更新。
  if(state.pendingAction&&state.aiMode==='web'&&!isAndroidApp()&&window.claudeDesktop?.listWebAiModels){
    const autoKey=webModelCacheKey(state.webProvider,pendingBrowserMode);
    const autoInfo=webModelStateByProvider.get(autoKey);
    const expectedAction=state.pendingAction;
    if(webModelAutoRefreshedAction!==expectedAction||!autoInfo?.models?.length||Date.now()-Number(autoInfo.at||0)>60000){
      webModelAutoRefreshedAction=expectedAction;
      const expectedProvider=state.webProvider,expectedMode=pendingBrowserMode;
      const token=++webModelAutoRefreshToken;
      clearTimeout(webModelAutoRefreshTimer);
      webModelAutoRefreshTimer=setTimeout(async()=>{
        const stillHere=()=>state.aiMode==='web'&&state.pendingAction===expectedAction&&state.webProvider===expectedProvider&&normalizeWebBrowserMode(webBrowserMode,expectedProvider)===expectedMode&&token===webModelAutoRefreshToken;
        // 官網剛開啟時輸入框與模型鈕可能還沒掛載；自動重試幾次，模型改名或新增就會跟上。
        for(let attempt=0;attempt<4;attempt++){
          if(!stillHere())return;
          if(await loadWebSiteModels({quiet:true,force:true}))return;
          await new Promise(resolve=>setTimeout(resolve,2000));
        }
        if(stillHere())webModelAutoRefreshedAction='';
      },300);
    }
  }
  const shrinkWebInterface=$('shrinkWebInterfaceBtn');if(shrinkWebInterface)shrinkWebInterface.onclick=()=>{stepWebUiZoom(-1);};
  const restoreWebInterface=$('restoreWebInterfaceBtn');if(restoreWebInterface)restoreWebInterface.onclick=()=>{setWebUiZoomAuto(true);};
  document.querySelectorAll('[data-pending-web-provider]').forEach(button=>{button.onclick=()=>void switchPendingWebProvider(button.dataset.pendingWebProvider);});
  const copyWeb=$('copyWebPromptBtn'); if(copyWeb) copyWeb.onclick=async()=>{
    const expectedState=state,expectedSlotId=activeSlotId,action=state.pendingAction;
    try{await prepareWebPrompt(action,'');}
    catch(e){if(state===expectedState&&activeSlotId===expectedSlotId&&state.pendingAction===action){state.lastAiError=`無法複製提示詞：${e.message||'請確認剪貼簿權限。'}`;save();render();}}
  };
  const openSite=$('openWebSiteBtn'); if(openSite) openSite.onclick=()=>void openPendingWebSite();
  const applyWeb=$('applyWebReplyBtn'); if(applyWeb) applyWeb.onclick=applyWebReply;
  const readWebClipboard=$('readWebClipboardBtn');if(readWebClipboard)readWebClipboard.onclick=()=>void readClipboardReply();
  const restoreWebLayout=$('restoreWebLayoutBtn'); if(restoreWebLayout) restoreWebLayout.onclick=async()=>{
    const expectedState=state,expectedSlotId=activeSlotId;
    try{await window.claudeDesktop?.restoreWebCompanionLayout();}
    catch(e){if(state!==expectedState||activeSlotId!==expectedSlotId)return;state.lastAiError=`無法還原遊戲視窗：${e.message||''}`;save();render();}
  };
  const openSettings=$('openAiSettings'); if(openSettings) openSettings.onclick=()=>document.querySelector('[data-tab="settings"]')?.click();
  $('freeChoiceToggle').onclick=()=>{
    const panel=$('freeActionPanel');
    panel.hidden=!panel.hidden;
    if(!panel.hidden) $('freeInput').focus();
  };
  $('freeSend').onclick=()=>{const v=$('freeInput').value.trim(); if(v) continueStory(v);};
  document.querySelectorAll('[data-input-template]').forEach(button=>{button.onclick=()=>insertInputTemplate(button.dataset.inputTemplate);});
  renderAlbum();
  applyUiLanguage();
}

const TEMPORARY_CHAT_WEB_PROVIDERS=new Set(['openai','gemini','anthropic']);
let openingRecordModeDraft='save';
let openingTempChatDraft=true;
let openingDifficultyDraft='normal',openingDifficultyDraftSlotId='';
function incognitoTemporaryChatRestriction(provider=state.webProvider,mode=webBrowserMode){
  if(state.aiMode!=='web')return '臨時對話需要使用 AI 網頁版，請先切換到 Claude、Gemini 或 ChatGPT 網頁版。';
  const selected=normalizeWebAIProvider(provider);
  if(!TEMPORARY_CHAT_WEB_PROVIDERS.has(selected))return '目前支援 Claude、ChatGPT 與 Gemini 官網的臨時對話；請切換網站，或選擇「保存記錄」。';
  if(mode==='external'&&!webAutoFlow)return '外部瀏覽器必須開啟自動化，App 才能確認臨時對話；請改用 App 內瀏覽器或開啟自動化。';
  return '';
}
function isActiveIncognitoSlot(){return slots.some(slot=>slot.id===activeSlotId&&slot.kind==='incognito');}
// 這一格要不要走「官網臨時對話」：臨時對話格，或保存記錄格在開局時勾了官網臨時對話。
function slotWantsTemporaryChat(id){
  const slot=slots.find(x=>x.id===id);
  return !!slot&&(slot.kind==='incognito'||slot.temporaryChat===true);
}
// 保存記錄模式下「官網使用臨時對話」核取框目前的狀態（只在支援的官網網頁模式下生效）。
function openingSaveTempChatSelected(){
  const box=$('openingTempChat');
  return !!(box&&!box.disabled&&box.checked&&state.aiMode==='web'&&TEMPORARY_CHAT_WEB_PROVIDERS.has(normalizeWebAIProvider(state.webProvider)));
}
// 保存記錄模式且目前就在手動格上：把臨時對話勾選狀態寫進這一格，原格重新開局。
function continueExistingSaveModeStory(){
  const active=slots.find(x=>x.id===activeSlotId);
  if(active&&active.kind==='manual')active.temporaryChat=openingSaveTempChatSelected();
  try{localStorage.setItem('claude_novel_active_slot_v1',activeSlotId);}catch{}
}

// ==== SECTION 12｜開場設定、存檔清單、自訂模型管理 ====
function renderOpeningSetup(container){
  if(openingDifficultyDraftSlotId!==activeSlotId){openingDifficultyDraftSlotId=activeSlotId;openingDifficultyDraft=normalizeDifficulty(state.difficulty);}
  // Claude 與其他清單網站都能走一般網頁故事流程；Claude／ChatGPT／Gemini 有可驗證的臨時對話。
  // 若玩家切換到不支援臨時模式的網站，直接回到保存記錄，避免開始時才被擋下。
  if(state.aiMode==='web'&&openingRecordModeDraft==='incognito'&&!TEMPORARY_CHAT_WEB_PROVIDERS.has(normalizeWebAIProvider(state.webProvider)))openingRecordModeDraft='save';
  if(openingRecordModeDraft==='incognito'&&state.aiMode!=='web')state.aiMode='web';
  const options=OPENING_STYLES.map(style=>`<option value="${style.id}">${esc(style.label[uiLanguage])}</option>`).join('');
  const selected=OPENING_STYLES.some(style=>style.id===state.openingStyle)||state.openingStyle===CUSTOM_OPENING_STYLE?state.openingStyle:RANDOM_OPENING_STYLE;
  const aiLabel=state.aiMode==='web'?`${webAIProviderName(state.webProvider)}${uiLanguage==='en'?' Web':' 網頁版'}`:`${providerName(state.provider)} · ${state.model}`;
  // 繼續既有存檔：開局畫面直接挑一個有進度的存檔接著玩（不必進存檔管理）。
  const continueSlots=slots.filter(slot=>slot.id!==activeSlotId&&(((slot.state?.history)||[]).length>0||String(slot.state?.pendingAction||'')));
  const continueOptions=continueSlots.map(slot=>{const turns=(slot.state?.history||[]).filter(entry=>entry?.role==='user').length;return `<option value="${esc(slot.id)}">${esc(slot.name)}（${turns} ${uiText('回合')}）</option>`;}).join('');
  const playerNamePref=loadPlayerNamePreference();
  container.innerHTML=`<section class="start-panel" aria-labelledby="openingSetupTitle"><h2 id="openingSetupTitle">${uiText('開始新故事')}</h2><p>${uiText('先選 AI，再挑一種序章；不同序章會從不同事件、地點與故事氣氛展開。按下開始後才會送出請求。')}</p><p class="note free-ai-note">${uiText('新存檔預設使用 AI 官方網站免費版，免 API Key；遊戲內 API 模式為選用，需自行設定 API Key。網站與 API 額度分開，依供應商規則。')}</p><div class="opening-clock-row opening-letter-row"><label class="feature-toggle" for="openingAnthropicLetterToggle"><input type="checkbox" id="openingAnthropicLetterToggle"> <span>${uiText('遊玩中有機會觸發神秘的一封信')}</span></label></div><label class="opening-style-label" for="openingPlayerName">${uiText('你的名字')}</label><input id="openingPlayerName" class="opening-name-input" type="text" maxlength="16" value="${esc(playerNamePref)}"><p class="opening-style-help">${uiText('會隨這個存檔記錄；留空則使用 User。')}</p><div class="start-ai-row"><span>${uiText('目前 AI')}</span><b>${esc(aiLabel)}</b><button id="openingAiPicker" type="button">${uiText('選擇 AI')}</button></div><label class="opening-style-label" for="openingDifficultySelect">${uiText('遊戲難度')}</label><select id="openingDifficultySelect"><option value="veryEasy">${uiText('非常簡單（不扣好感，1小時保底滿好感）')}</option><option value="easy">${uiText('簡單（扣分減半）')}</option><option value="normal">${uiText('中等（標準增減）')}</option><option value="hard">${uiText('困難（加分打折、扣分加重）')}</option><option value="veryHard">${uiText('非常困難（加分減半、扣分加重）')}</option></select><p class="opening-style-help">${uiText('難度會在開始時套用並隨此故事存檔；既有故事保留自己的難度。')}</p><label class="opening-style-label" for="openingStyleSelect">${uiText('序章風格')}</label><select id="openingStyleSelect"><option value="${RANDOM_OPENING_STYLE}">${uiText('隨機驚喜')}</option>${options}<option value="${CUSTOM_OPENING_STYLE}">${uiText('自由自訂')}</option></select><p class="opening-style-help">${uiText('隨機驚喜會從預設風格與 AI 完全自由創作中抽選；「完全隨機」則讓 AI 自行決定整個開場。若生成失敗，重試會保留同一選擇。')}</p><div id="openingCustomWrap" class="opening-custom-wrap" ${selected===CUSTOM_OPENING_STYLE?'':'hidden'}><label class="opening-style-label" for="openingCustomPrompt">${uiText('自訂序章方向')}</label><textarea id="openingCustomPrompt" rows="3" maxlength="600"></textarea><div class="opening-custom-meta"><span>${uiText('可補充人物初遇、事件、氣氛或你想看到的開場；只用於序章，最多600字。')}</span><span id="openingCustomCount">0/600</span></div></div><div id="openingWorldWrap" class="opening-custom-wrap"><label class="opening-style-label" for="openingWorldSetting">${uiText('自訂世界觀（選填）')}</label><textarea id="openingWorldSetting" rows="3" maxlength="10000"></textarea><p class="opening-style-help">${uiText('在這裡描述故事發生的世界；留白則沿用目前設定。')}</p></div><div class="opening-clock-row"><span class="opening-style-label">${uiText('故事時間')}</span><div class="opening-clock-choices" role="radiogroup" aria-label="故事時間"><label><input type="radio" name="openingClockMode" id="openingClockOff" value="off"> ${uiText('不啟用')}</label><label><input type="radio" name="openingClockMode" id="openingClockStory" value="story" checked> ${uiText('隨劇情推進')}</label><label><input type="radio" name="openingClockMode" id="openingClockReal" value="real"> ${uiText('綁定現實時間')}</label></div><p class="opening-style-help">${uiText('「隨劇情推進」＝顯示目前天數與時段（例如「第 3 天・晚上」），AI 會依劇情推進時間；「綁定現實時間」＝天數與時段直接跟隨現實時刻（早上 05:00–11:59／中午 12:00–17:59／晚上 18:00–04:59），跨現實日界線 +1，AI 不需回報時間推進。「不啟用」＝與原本完全相同。開始後不提供中途切換；既有存檔不受影響。')}</p><p class="note" id="openingClockPreview"></p></div><div class="opening-clock-row"><span class="opening-style-label">${uiText('對話記錄')}</span><div class="opening-clock-choices" role="radiogroup" aria-label="對話記錄"><label><input type="radio" name="openingRecordMode" id="openingRecordIncognito" value="incognito" ${openingRecordModeDraft==='incognito'?'checked':''}> ${uiText('臨時對話')}</label><label><input type="radio" name="openingRecordMode" id="openingRecordSave" value="save" ${openingRecordModeDraft==='save'?'checked':''}> ${uiText('保存記錄（預設）')}</label></div></div><button id="startStoryBtn" class="choice-btn ai-btn" type="button">${uiText('開始故事')}</button>${continueOptions?`<div class="opening-clock-row"><span class="opening-style-label">${uiText('繼續既有存檔')}</span><div class="opening-clock-choices"><select id="openingContinueSlot" aria-label="繼續既有存檔">${continueOptions}</select><button id="openingContinueBtn" type="button">${uiText('繼續這個存檔')}</button></div><p class="opening-style-help">${uiText('選一個舊存檔直接回到該故事；目前未開始的進度不受影響。')}</p></div>`:''}<p class="opening-help">${uiText('新手流程：確認 AI → 選序章 → 開始。使用網頁版時，遊戲會準備提示詞，並在下方逐步提醒按鍵。')}</p></section>`;
  const incognitoRestriction=incognitoTemporaryChatRestriction();
  const incognitoInput=$('openingRecordIncognito');
  incognitoInput.disabled=state.aiMode==='web'&&!TEMPORARY_CHAT_WEB_PROVIDERS.has(normalizeWebAIProvider(state.webProvider));
  const recordRow=incognitoInput.closest('.opening-clock-row');
  const recordHint=document.createElement('p');
  recordHint.className='opening-style-help';
  recordHint.textContent=uiText('網頁模式可使用清單中的 12 家 AI 官網；臨時對話目前限 Claude、ChatGPT 與 Gemini。故事存檔保存在本機；官網資料處理仍依各供應商規則。')+(incognitoRestriction?` ${uiText(incognitoRestriction)}`:'');
  recordRow.append(recordHint);
  const tempChatLabel=document.createElement('label');
  tempChatLabel.className='opening-style-help';
  tempChatLabel.style.display='flex';
  tempChatLabel.style.alignItems='center';
  tempChatLabel.style.gap='6px';
  tempChatLabel.innerHTML=`<input type="checkbox" id="openingTempChat"> ${uiText('官網使用臨時對話（本機照常存檔）')}`;
  recordRow.append(tempChatLabel);
  const refreshTempChatControl=()=>{
    const box=$('openingTempChat');
    if(!box)return;
    const webTemporary=state.aiMode==='web'&&TEMPORARY_CHAT_WEB_PROVIDERS.has(normalizeWebAIProvider(state.webProvider));
    tempChatLabel.hidden=!webTemporary;
    if(!webTemporary)return;
    if(openingRecordModeDraft==='incognito'){box.checked=true;box.disabled=true;}
    else{box.disabled=false;box.checked=openingTempChatDraft;}
  };
  refreshTempChatControl();
  $('openingTempChat').onchange=()=>{openingTempChatDraft=$('openingTempChat').checked;};
  [...document.querySelectorAll('input[name="openingRecordMode"]')].forEach(input=>input.addEventListener('change',()=>{
    if(!input.checked)return;
    openingRecordModeDraft=input.value;
    if(input.value==='incognito'&&state.aiMode!=='web'){
      state.aiMode='web';
      settings();
      render();
      return;
    }
    recordHint.textContent=uiText('網頁模式可使用清單中的 12 家 AI 官網；臨時對話目前限 Claude、ChatGPT 與 Gemini。故事存檔保存在本機；官網資料處理仍依各供應商規則。')+(input.value==='incognito'&&incognitoTemporaryChatRestriction()?` ${uiText(incognitoTemporaryChatRestriction())}`:'');
    refreshTempChatControl();
  }));
  const difficultySelect=$('openingDifficultySelect');difficultySelect.value=openingDifficultyDraft;difficultySelect.onchange=()=>{openingDifficultyDraft=normalizeDifficulty(difficultySelect.value);};
  const playerNameInput=$('openingPlayerName');
  if(playerNameInput)playerNameInput.addEventListener('change',()=>{savePlayerNamePreference(playerNameInput.value);});
  const openingLetterToggle=$('openingAnthropicLetterToggle');
  if(openingLetterToggle){openingLetterToggle.checked=state.letterEventEnabled===true;openingLetterToggle.onchange=()=>{state.letterEventEnabled=openingLetterToggle.checked===true;save();syncAnthropicLetterToggles();};}
  const select=$('openingStyleSelect');
  select.value=selected;
  const custom=$('openingCustomPrompt'),customWrap=$('openingCustomWrap'),customCount=$('openingCustomCount');
  custom.value=String(state.openingCustomPrompt||'').slice(0,600);custom.placeholder=uiText('例如：她正在修復一本會記錄讀者夢境的書，而我帶來一張陌生的書頁。');customCount.textContent=`${custom.value.length}/600`;
  select.onchange=()=>{state.openingStyle=select.value;customWrap.hidden=select.value!==CUSTOM_OPENING_STYLE;save();};
  custom.oninput=()=>{state.openingCustomPrompt=custom.value.slice(0,600);customCount.textContent=`${state.openingCustomPrompt.length}/600`;};
  custom.onchange=()=>save();
  const worldDraft=$('openingWorldSetting');
  worldDraft.value=(state.worldSetting&&state.worldSetting!==DEFAULT_WORLD_SETTING)?String(state.worldSetting).slice(0,10000):'';
  worldDraft.placeholder=uiText('例如：圖書館深處藏著一座只有滿月才會出現的閱覽室。');
  worldDraft.onchange=()=>{const v=String(worldDraft.value||'').trim();if(v){state.worldSetting=v.slice(0,10000);save();}};
  $('openingAiPicker').onclick=()=>{
    const incognitoSelected=openingRecordModeDraft==='incognito';
    if(incognitoSelected&&state.aiMode!=='web'){state.aiMode='web';settings();render();}
    openAiPicker();
  };
  [...document.querySelectorAll('input[name="openingClockMode"]')].forEach(input=>input.addEventListener('change',refreshOpeningClockPreview));
  refreshOpeningClockPreview();
  const openingContinueBtn=$('openingContinueBtn');
  if(openingContinueBtn)openingContinueBtn.onclick=()=>{const id=$('openingContinueSlot')?.value;if(id)void switchSlot(id);};
  $('startStoryBtn').onclick=()=>{
    const letterEventEnabled=$('openingAnthropicLetterToggle')?.checked===true;
    const recordMode=[...document.querySelectorAll('input[name="openingRecordMode"]')].find(input=>input.checked)?.value||openingRecordModeDraft||'save';
    openingRecordModeDraft=recordMode;
    const difficulty=normalizeDifficulty($('openingDifficultySelect').value);
    if(recordMode==='incognito'){
      const restriction=incognitoTemporaryChatRestriction();
      if(restriction){alert(uiText(restriction));return;}
      // 臨時對話：使用專用格；內容會隨每回合自動落地本機，離開後隨時可讀回繼續。
      const previousTemp=slots.find(x=>x.kind==='incognito');
      const previousHasProgress=(previousTemp?.state?.history||[]).length>0||String(previousTemp?.state?.pendingAction||'');
      if(previousHasProgress&&!confirm(uiText('已經有一個臨時對話存檔；開始新的臨時對話會取代它。要繼續嗎？')))return;
      slots=slots.filter(x=>x.kind!=='incognito');
      const incognitoSlot={...normalizeSlot({id:INCOGNITO_SLOT_ID,name:'臨時對話',updatedAt:0,memo:'',state:fresh()})};
      slots.unshift(incognitoSlot);
      activeSlotId=INCOGNITO_SLOT_ID;
      try{localStorage.setItem('claude_novel_active_slot_v1',INCOGNITO_SLOT_ID);}catch{}
      state={...fresh(),provider:state.provider,model:state.model,apiBase:state.apiBase,aiConnectionId:state.aiConnectionId,aiMode:state.aiMode,webProvider:state.webProvider,difficulty:state.difficulty,temperature:state.temperature,topP:state.topP,maxTokens:state.maxTokens,responseMode:state.responseMode,customModels:state.customModels,modelConfigs:state.modelConfigs};
      pruneSceneImagesForSlot(INCOGNITO_SLOT_ID);
    }else{
      // 改選「保存記錄」：臨時對話存檔保留在本機；另外開新的手動存檔格重新開始。
      if(!slots.some(x=>x.kind==='incognito'))continueExistingSaveModeStory();
      else{
        const manualCount=slots.filter(x=>x.kind==='manual').length;
        const newSlot=makeSlot(uiLanguage==='en'?`Save ${manualCount+1}`:`存檔 ${manualCount+1}`,{provider:state.provider,model:state.model,apiBase:state.apiBase,aiConnectionId:state.aiConnectionId,aiMode:state.aiMode,webProvider:state.webProvider,difficulty:state.difficulty,temperature:state.temperature,topP:state.topP,maxTokens:state.maxTokens,responseMode:state.responseMode,customModels:state.customModels,modelConfigs:state.modelConfigs});
        newSlot.temporaryChat=openingSaveTempChatSelected();
        slots.push(newSlot);
        activeSlotId=newSlot.id;
        try{localStorage.setItem('claude_novel_active_slot_v1',newSlot.id);}catch{}
        state={...fresh(),...(newSlot.state||{}),storyMemory:''};
      }
    }
    resetRareGoodnightWarmup();
    state.difficulty=difficulty;
    const playerName=normalizePlayerName($('openingPlayerName')?.value);
    state.playerName=playerName;
    savePlayerNamePreference(playerName);
    state.letterEventEnabled=letterEventEnabled;
    state.openingStyle=select.value===CUSTOM_OPENING_STYLE?CUSTOM_OPENING_STYLE:resolveOpeningStyle(select.value);
    state.openingCustomPrompt=custom.value.slice(0,600);
    const openingClockMode=[...document.querySelectorAll('input[name="openingClockMode"]')].find(input=>input.checked)?.value||'story';
    state.storyClock={mode:openingClockMode,enabled:openingClockMode!=='off',day:1,slot:openingClockMode==='real'?realSlotIndexAt(new Date()):0,anchor:openingClockMode==='real'?Date.now():0};
    state.pendingMilestone='';
    state.pendingSpecialEvent='';
    storyNoticeText='';
    const wv=String(worldDraft.value||'').trim();
    if(wv)state.worldSetting=wv.slice(0,10000);
    if(!save())return;
    opening();
    refreshTimeTheme();
  };
}

function openAiPicker(){
  const settingsTab=document.querySelector('[data-tab="settings"]');
  if(!$('tab-settings').classList.contains('active'))settingsTab.click();
  const target=state.aiMode==='web'?$('webAiProvider'):$('modelSelect');
  requestAnimationFrame(()=>{target.scrollIntoView({behavior:scrollBehavior(),block:'center'});target.focus({preventScroll:true});});
}

function renderSlots() {
  const picker=$('storySlotPicker');
  if(picker){
    picker.replaceChildren();
    for(const slot of slots){const option=document.createElement('option');option.value=slot.id;const hasStory=(slot.state?.history||[]).length>0;option.textContent=slot.name+(hasStory?(uiLanguage==='en'?' · Continue saved story':' · 繼續舊故事'):'');picker.append(option);}
    const createOption=document.createElement('option');createOption.value='__new_story_slot__';createOption.textContent=uiText('＋ 新增故事存檔…');picker.append(createOption);picker.value=activeSlotId;
    const label=$('storySlotPickerLabel');if(label)label.textContent=uiText('故事存檔');
    picker.onchange=async()=>{if(picker.value==='__new_story_slot__'){const name=await openPromptDialog({title:'新存檔名稱',value:uiText('新存檔')});if(name!==null)await createSlot(name);else picker.value=activeSlotId;return;}await switchSlot(picker.value);};
    const storyDeleteBtn=$('deleteStorySlotBtn');
    if(storyDeleteBtn){
      const activeSlot=slots.find(x=>x.id===activeSlotId);
      storyDeleteBtn.onclick=()=>deleteSlot(activeSlotId);
      storyDeleteBtn.disabled=busy||!activeSlot||!(activeSlot.kind==='manual'||activeSlot.kind==='incognito');
    }
  }
  const box = $('saveSlots');
  if (!box) return;
  const kindBadge = kind => kind==='auto'
    ? `<span class="slot-badge sys">${uiText('自動存檔')}</span>`
    : kind==='quick'
      ? `<span class="slot-badge sys">${uiText('快速存檔')}</span>`
      : kind==='incognito'
        ? `<span class="slot-badge sys">${uiText('臨時')}</span>`
        : '';
  const card = slot => {
    const active = slot.id === activeSlotId;
    const s = slotSummary(slot);
    const badges = kindBadge(slot.kind)
      + (active ? `<span class="slot-badge active">${uiText('使用中')}</span>` : '')
      + (s.ending ? `<span class="slot-badge ending">${uiText('結局')}</span>` : '')
      + (s.pending ? `<span class="slot-badge pending">${uiText('待辦中')}</span>` : '');
    const meta = `${s.turns} ${uiText('回合')} · ${uiText('好感')} ${formatAffection(s.affection)} · ${s.clockLabel?esc(s.clockLabel)+' · ':''}${esc(s.date)}`;
    const excerpt = s.excerpt ? `<p class="slot-excerpt">${esc(s.excerpt)}</p>` : `<p class="slot-excerpt empty">${uiText('尚無劇情')}</p>`;
    const memo = slot.memo ? `<p class="slot-memo">📝 ${esc(slot.memo)}</p>` : '';
    const canMemo = slot.kind === 'manual';
    const canDelete = slot.kind === 'manual' || slot.kind === 'incognito';
    return `<div class="slot-card ${active ? 'active' : ''} kind-${slot.kind}">
      <button class="slot-main" data-slot="${slot.id}"><b>${esc(slot.name)}${badges}</b><small>${esc(meta)}</small>${excerpt}${memo}</button>
      <div class="slot-actions">
      <button class="slot-rename" data-rename="${slot.id}" title="重新命名">✎</button>
      ${canMemo ? `<button class="slot-memo-btn" data-memo="${slot.id}" title="存檔備註">📝</button>` : ''}
      ${canDelete ? `<button class="slot-delete" data-delete="${slot.id}" title="刪除存檔">🗑</button>` : ''}
      </div>
    </div>`;
  };
  const system = slots.filter(x => x.kind !== 'manual');
  const manual = slots.filter(x => x.kind === 'manual');
  box.innerHTML = (system.length ? `<div class="slot-system-row">${system.map(card).join('')}</div>` : '')
    + `<div class="slot-manual-grid">${manual.map(card).join('')}</div>`;
  box.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>switchSlot(b.dataset.slot));
  box.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteSlot(b.dataset.delete));
  box.querySelectorAll('[data-rename]').forEach(b=>b.onclick=async()=>{
    const slot=slots.find(x=>x.id===b.dataset.rename); const name=await openPromptDialog({title:'新的存檔名稱',value:slot?.name||'',maxLength:60});
    if(name) renameSlot(b.dataset.rename,name);
  });
  box.querySelectorAll('[data-memo]').forEach(b=>b.onclick=async()=>{
    const slot=slots.find(x=>x.id===b.dataset.memo); if(!slot||slot.kind!=='manual')return;
    const memo=await openPromptDialog({title:'存檔備註',note:'輸入此存檔的備註（留白清除）：',value:slot.memo||''});
    if(memo===null)return;
    const previous=slot.memo; slot.memo=String(memo).trim().slice(0,200); slot.updatedAt=Date.now();
    if(!persistSlots()){slot.memo=previous;return;}
    renderSlots();
  });
}
function ensureCustomModelControls(){
  const select=$('modelSelect');let group=$('savedCustomModels');
  if(!group){group=document.createElement('optgroup');group.id='savedCustomModels';const customOption=[...select.options].find(option=>option.value==='custom::__custom__');if(customOption)select.insertBefore(group,customOption);else select.append(group);}
  group.label=uiText('我的自訂模型');group.replaceChildren();state.customModels=normalizeCustomModels(state.customModels);
  state.customModels.forEach((model,index)=>{const option=document.createElement('option');option.value=`saved::${index}`;option.textContent=`${model.name} · ${providerName(model.provider)} · ${model.model}`;group.append(option);});
  if(!$('customModelProvider')){
    const manager=document.createElement('div');manager.id='customModelManager';manager.className='custom-model-manager';
    const providerLabel=document.createElement('label');providerLabel.append(document.createTextNode(uiText('自訂模型服務')));
    const providerSelect=document.createElement('select');providerSelect.id='customModelProvider';
    CUSTOM_MODEL_PROVIDERS.forEach(provider=>{const option=document.createElement('option');option.value=provider.id;option.textContent=provider.name;providerSelect.append(option);});providerLabel.append(providerSelect);
    const nameLabel=document.createElement('label');nameLabel.append(document.createTextNode(uiText('模型顯示名稱')));
    const nameInput=document.createElement('input');nameInput.id='customModelName';nameInput.maxLength=48;nameInput.placeholder=uiText('例如：「快速故事」');nameLabel.append(nameInput);
    const actions=document.createElement('div');actions.className='custom-model-actions';
    const saveButton=document.createElement('button');saveButton.id='saveCustomModelPresetBtn';saveButton.type='button';saveButton.textContent=uiText('新增並使用此模型');
    const deleteButton=document.createElement('button');deleteButton.id='deleteCustomModelPresetBtn';deleteButton.type='button';deleteButton.className='secondary';deleteButton.textContent=uiText('刪除選取的自訂模型');
    actions.append(saveButton,deleteButton);
    const note=document.createElement('p');note.className='note';note.textContent=uiText('每個存檔可保存最多 30 個自訂模型；每個模型會記住自己的生成速度、創意、多樣性與輸出上限。');
    manager.append(providerLabel,nameLabel,actions,note);const box=$('customModelBox');box.insertAdjacentElement('afterend',manager);
    providerSelect.onchange=updateModelParameterSupport;$('customModel').oninput=updateModelParameterSupport;
    saveButton.onclick=saveCustomModelPreset;deleteButton.onclick=deleteCustomModelPreset;
  }
  updateCustomModelManagerVisibility();
}
function updateCustomModelManagerVisibility(){const selected=$('modelSelect')?.value||'',manager=$('customModelManager');if(manager){manager.hidden=selected!=='custom::__custom__'&&!selected.startsWith('saved::');$('saveCustomModelPresetBtn').hidden=selected!=='custom::__custom__';$('deleteCustomModelPresetBtn').hidden=!selected.startsWith('saved::');}}
function updateModelParameterSupport(){
  const selected=$('modelSelect')?.value||'',customInput=selected==='custom::__custom__';let provider=state.provider,model=state.model;
  if(selected.startsWith('saved::')){const preset=normalizeCustomModels(state.customModels)[Number(selected.slice(7))];if(preset){provider=preset.provider;model=preset.model;}}
  else if(customInput){provider=$('customModelProvider')?.value||provider;model=$('customModel')?.value.trim()||model;}
  const openAiLimited=provider==='openai',claudeLimited=provider==='anthropic'&&/^claude-(?:opus|sonnet|fable)-(?:5(?:-|$)|4-[78](?:-|$))/i.test(model),anthropic=provider==='anthropic';
  $('temperature').disabled=openAiLimited||claudeLimited;$('topP').disabled=openAiLimited||anthropic;
  const message=openAiLimited?'OpenAI Responses API 不使用這裡的創意自由度與多樣性；請用回覆速度和輸出上限調整生成。':claudeLimited?'這個 Claude 模型不接受創意自由度或多樣性參數；請用回覆速度和輸出上限調整生成。':anthropic?'Claude API 不接收多樣性參數；部分 Claude 模型也不接受創意自由度。':'此模型服務會接收創意自由度與多樣性；模型或相容端點可能另有參數限制。';
  const note=$('modelParameterSupportNote');if(note)note.textContent=uiText('模型參數會自動依目前選擇的模型套用；一般使用只要選擇模型和回覆速度。')+' '+uiText('提示詞已精簡重複的內建說明；自訂角色／世界／規則、故事記憶、快速／詳細模式的近期對話、玩家行動、500字正文下限與7個選項都會保留。GPT-6 與 Claude Fable 5.1 API 在供應商支援且快取命中時會重用固定提示。')+' '+uiText(message)+($('responseMode')?.value==='fast'?' '+uiText('快速回覆會將 API 輸出上限限制在 1800 Token。'):'');
}
function captureModelOptions(){
  const number=(value,fallback,min,max)=>{const parsed=Number(value);return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback;};
  return {temperature:number($('temperature').value,1,0,2),topP:number($('topP').value,.95,.1,1),maxTokens:number($('maxTokens').value,2400,256,8192),responseMode:$('responseMode').value==='quality'?'quality':'fast',promptMode:$('promptMode')?.value==='saving'?'saving':'standard'};
}
function saveVisibleModelOptions(){Object.assign(state,captureModelOptions());syncActiveModelOptions();save();updateModelParameterSupport();}
function saveCustomModelPreset(){
  const provider=$('customModelProvider').value,model=$('customModel').value.trim().slice(0,180),name=$('customModelName').value.trim().slice(0,48)||model;
  if(!model)return alert(uiText('請輸入服務官方文件提供的 Model ID。'));
  const previous=serializeState(),models=normalizeCustomModels(state.customModels),existing=models.findIndex(item=>item.provider===provider&&item.model===model);
  if(existing<0&&models.length>=30)return alert(uiText('每個存檔最多保存 30 個自訂模型；請先刪除不再使用的項目。'));
  const preset={name,provider,model},options=captureModelOptions(),modelConfigs=normalizeModelConfigs(state.modelConfigs);
  modelConfigs[`${provider}::${model}`]=options;if(existing>=0)models[existing]=preset;else models.push(preset);
  state.modelConfigs=modelConfigs;state.customModels=models;state.provider=provider;state.model=model;state.aiMode='api';if(currentAiConnection()?.provider!==provider)state.aiConnectionId=null;state.apiBase=$('apiBase').value.trim()||defaultApiBase();Object.assign(state,options);
  if(!save()){state=previous;settings();return;}settings();renderAiConnections();updateAiPicker();refreshAiStatus();
}
function deleteCustomModelPreset(){
  const selected=$('modelSelect').value;if(!selected.startsWith('saved::'))return alert(uiText('請先選取「我的自訂模型」中的項目。'));
  const index=Number(selected.slice(7)),models=normalizeCustomModels(state.customModels),preset=models[index];if(!preset)return;
  if(!confirm(uiText('刪除自訂模型「')+preset.name+uiText('」？目前故事與已保存的模型參數不會刪除。')))return;
  const previous=serializeState();models.splice(index,1);state.customModels=models;if(!save()){state=previous;settings();return;}settings();
}
// ==== SECTION 13｜設定畫面與創意工坊（原始碼編輯器；套用由主程序把關）====
// 主題偏好（跟隨系統／亮色／暗色／依時間／依故事時間）：只存本機 localStorage，不進存檔、不影響故事。
function storedThemeChoice(){
  try{const value=String(localStorage.getItem(THEME_STORAGE_KEY)||'');return THEME_CHOICES.includes(value)?value:'auto';}catch(e){return 'auto';}
}
// R3B（批5）：故事時段解析——早／午＝亮、晚＝暗；無進行中的故事或故事時間未啟用＝回退跟隨系統。
function storyThemeClock(){
  try{return realStoryClock(state.storyClock);}catch(e){return null;}
}
function storyThemePhase(){
  const clock=storyThemeClock();
  if(!clock||clock.mode==='off')return '';
  if(typeof state!=='object'||!state||!Array.isArray(state.history)||!state.history.length)return '';
  return clock.slot>=2?'dark':'light';
}
// 快速列主題鈕：五態循環（跟隨系統→亮→暗→依時間→依故事時間→回）。
function nextThemeChoice(choice){
  const value=THEME_CHOICES.includes(choice)?choice:'auto';
  return THEME_CHOICES[(THEME_CHOICES.indexOf(value)+1)%THEME_CHOICES.length];
}
function quickThemeTitle(choice){
  if(choice==='story'){
    const phase=storyThemePhase();
    if(phase){
      const clock=storyThemeClock();
      return uiLanguage==='en'?`By story time (now: Day ${clock.day} · ${phase==='light'?'light':'dark'})`:`依故事時間（現況：第 ${clock.day} 天・時段＝${phase==='light'?'亮':'暗'}）`;
    }
    return uiText('依故事時間（無進行中的故事＝跟隨系統）');
  }
  const labels={auto:'跟隨系統',light:'亮色',dark:'暗色',time:'依時間'};
  return (uiLanguage==='en'?'Theme: ':'主題：')+uiText(labels[choice]||'跟隨系統');
}
function refreshQuickThemeBtn(){
  const btn=typeof $==='function'?$('quickThemeBtn'):null;
  if(!btn)return;
  const choice=storedThemeChoice();
  btn.textContent=QUICK_THEME_ICONS[choice]||QUICK_THEME_ICONS.auto;
  btn.title=quickThemeTitle(choice);
  btn.setAttribute('aria-label',btn.title);
}
function applyTheme(choice){
  const value=THEME_CHOICES.includes(choice)?choice:'auto';
  const root=document.documentElement;
  if(value==='time'){root.setAttribute('data-theme',themeTimePhase());return;}
  if(value==='story'){const phase=storyThemePhase();if(phase)root.setAttribute('data-theme',phase);else root.removeAttribute('data-theme');return;}
  if(value==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',value);
}
function applyThemePreference(choice){
  const value=THEME_CHOICES.includes(choice)?choice:'auto';
  try{localStorage.setItem(THEME_STORAGE_KEY,value);}catch(e){}
  applyTheme(value);
  refreshQuickThemeBtn();
}
// E6 v2：「依時間」＝依系統時鐘自動切換日夜（界線常數；跨時段即時生效、免重開；以當下系統時間為準）。
const THEME_TIME_DAY_START=7;
const THEME_TIME_DAY_END=19;
let themeTimeWatchTimer=null;
function themeTimePhase(now){
  const hour=(now&&typeof now.getHours==='function'?now:new Date()).getHours();
  return (hour>=THEME_TIME_DAY_START&&hour<THEME_TIME_DAY_END)?'light':'dark';
}
function refreshTimeTheme(){
  const choice=storedThemeChoice();
  if(choice==='time'||choice==='story')applyTheme(choice);
  refreshQuickThemeBtn();
  refreshStoryClockChip();
  refreshOpeningClockPreview();
}
// 批4：real 模式的故事時間晶片比照「依時間」巡檢——跨現實時段／換日 30 秒內即時更新（回合前亦重算）。
function refreshStoryClockChip(){
  if(typeof state!=='object'||!state||!state.storyClock)return;
  const chip=typeof $==='function'?$('storyClockChip'):null;
  if(!chip)return;
  const clock=realStoryClock(state.storyClock);
  if(clock.mode!=='real'||chip.hidden)return;
  chip.textContent=storyClockLabel(clock,uiLanguage);
}
// R2（批5）：開場「故事時間」選中即時預覽句（real＝依現在時刻之天數與時段、隨現實時間重算；story＝跨日自動＋1）。
function refreshOpeningClockPreview(){
  const el=typeof $==='function'?$('openingClockPreview'):null;
  if(!el)return;
  const checked=typeof document!=='undefined'&&document.querySelectorAll?[...document.querySelectorAll('input[name="openingClockMode"]')].find(input=>input.checked):null;
  const mode=checked?checked.value:'';
  if(mode==='real'){
    const clock=realStoryClock({mode:'real',enabled:true,day:1,slot:0,anchor:Date.now()});
    el.textContent=uiLanguage==='en'?`Right now: ${storyClockLabel(clock,'en')} (recalculated from real time)`:`依現在時刻：${storyClockLabel(clock,'zh')}（隨現實時間重算）`;
  }else if(mode==='story'){
    el.textContent=uiText('由故事節奏推進（跨日自動＋1）');
  }else{
    el.textContent='';
  }
}
function startThemeTimeWatch(){
  if(themeTimeWatchTimer)return;
  themeTimeWatchTimer=setInterval(refreshTimeTheme,30000);
  if(document&&typeof document.addEventListener==='function')document.addEventListener('visibilitychange',refreshTimeTheme);
}
function settings() {
  const sel = $('modelSelect');
  const settingsRoot=document.querySelector('#tab-settings .settings');
  const webHeading=[...settingsRoot.querySelectorAll(':scope > h2')].find(item=>item.textContent.includes('AI 網頁服務')||item.textContent.includes('Web AI'));
  if(webHeading&&webHeading!==settingsRoot.firstElementChild){const webBox=webHeading.nextElementSibling;settingsRoot.insertBefore(webHeading,settingsRoot.firstElementChild);if(webBox)settingsRoot.insertBefore(webBox,webHeading.nextElementSibling);}
  if(!state.apiBase || state.apiBase==='null' || state.apiBase.startsWith('file:') || (window.claudeDesktop?.isDesktop&&/^http:\/\/127\.0\.0\.1:\d+$/.test(state.apiBase))) state.apiBase=defaultApiBase();
  ensureCustomModelControls();
  const preset = [...sel.options].find(option => option.value===state.provider+'::'+state.model&&option.closest('#savedCustomModels')===null);
  const savedIndex=state.customModels.findIndex(model=>model.provider===state.provider&&model.model===state.model);
  if(preset){sel.value=preset.value;$('customModelBox').hidden=true;}
  else if(savedIndex>=0){sel.value=`saved::${savedIndex}`;$('customModelBox').hidden=true;}
  else{sel.value='custom::__custom__';$('customModelBox').hidden=false;}
  const activeCustom=state.customModels[savedIndex];
  $('customModelProvider').value=activeCustom?.provider||state.provider;
  $('customModelName').value=activeCustom?.name||'';
  $('customModel').value=state.model;
  updateCustomModelManagerVisibility();
  $('apiBase').value = state.apiBase;
  const webLoginProvider=state.webProvider=normalizeWebAIProvider(state.webProvider);
  fillWebAIProviderSelect($('webAiProvider'),webLoginProvider);
  let browserModeLabel=$('webBrowserModeSelect')?.closest('label');
  if(!browserModeLabel){
    browserModeLabel=document.createElement('label');browserModeLabel.className='web-browser-mode-setting';
    browserModeLabel.append(document.createTextNode(uiText('官網開啟方式')));
    const select=document.createElement('select');select.id='webBrowserModeSelect';
    for(const [value,label] of [['embedded','App 內瀏覽器（可一鍵切模型）'],['external','外部自動化瀏覽器（登入會保留）']]){const option=document.createElement('option');option.value=value;option.textContent=uiText(label);select.append(option);}
    browserModeLabel.append(select);$('webAiProvider').closest('label')?.after(browserModeLabel);
  }
  const browserModeSelect=$('webBrowserModeSelect');
  if(browserModeSelect){
    const externalOnly=['gemini','anthropic'].includes(webLoginProvider);
    browserModeSelect.options[0].disabled=externalOnly;
    browserModeSelect.options[0].textContent=uiText(externalOnly?'App 內瀏覽器（Claude／Gemini 請用外部瀏覽器登入）':'App 內瀏覽器（可一鍵切模型）');
    browserModeSelect.options[1].textContent=uiText('外部自動化瀏覽器（登入會保留）');
    browserModeSelect.value=normalizeWebBrowserMode(webBrowserMode,webLoginProvider);
    browserModeSelect.onchange=()=>{webBrowserMode=normalizeWebBrowserMode(browserModeSelect.value,webLoginProvider);try{localStorage.setItem(WEB_BROWSER_MODE_KEY,webBrowserMode);localStorage.setItem(WEB_BROWSER_MODE_CHOSEN_KEY,'1');}catch{}settings();};
  }
  let emailSetting=$('webLoginCredentialSetting');
  if(!emailSetting){
    emailSetting=document.createElement('div');emailSetting.id='webLoginCredentialSetting';emailSetting.className='web-login-email-setting';
    const label=document.createElement('label');label.htmlFor='webLoginEmailInput';label.textContent=uiText('登入資料（選填）');
    const emailInput=document.createElement('input');emailInput.id='webLoginEmailInput';emailInput.type='email';emailInput.autocomplete='email';emailInput.maxLength=254;emailInput.placeholder='輸入帳號電子郵件';
    const passwordInput=document.createElement('input');passwordInput.id='webLoginPasswordInput';passwordInput.type='password';passwordInput.autocomplete='current-password';passwordInput.maxLength=4096;passwordInput.placeholder=uiText('密碼已保存；留白可保留原密碼');
    const autoLabel=document.createElement('label');autoLabel.className='web-login-auto-label';const autoCheckbox=document.createElement('input');autoCheckbox.id='webLoginAutoLogin';autoCheckbox.type='checkbox';autoLabel.append(autoCheckbox,document.createTextNode(uiText('自動送出登入（未勾選時只填密碼不送出）')));
    const actions=document.createElement('div');actions.className='web-login-email-actions';
    const saveButton=document.createElement('button');saveButton.type='button';saveButton.id='saveWebLoginCredentialBtn';saveButton.textContent=uiText('儲存登入資料');
    const clearButton=document.createElement('button');clearButton.type='button';clearButton.id='clearWebLoginCredentialBtn';clearButton.textContent=uiText('清除登入資料');
    actions.append(saveButton,clearButton);const note=document.createElement('p');note.className='note';note.id='webLoginCredentialNote';note.textContent=uiText('本機加密保存於此 Windows 使用者；不需要 Microsoft 帳號。只在官網登入頁使用；Gemini 一律在外部瀏覽器手動登入。Claude 預設不預填、不自動登入，需你在這裡明確儲存並勾選自動登入。驗證碼與雙重驗證仍需手動完成。');
    emailSetting.append(label,emailInput,passwordInput,autoLabel,actions,note);
    (browserModeSelect?.closest('label')||$('webAiProvider').closest('label'))?.after(emailSetting);
  }
  // Gemini／Google 登入只在外部 Chrome／Edge 由使用者親自完成；App 不保存 Google 帳密。
  emailSetting.hidden=webLoginProvider==='gemini';
  // Claude 的登入資料是「使用者明確 opt-in」：預設不預填、不自動送出。這裡把規則寫清楚。
  let claudeLoginNote=$('claudeLoginNote');
  if(!claudeLoginNote){
    claudeLoginNote=document.createElement('p');
    claudeLoginNote.id='claudeLoginNote';
    claudeLoginNote.className='note';
    emailSetting.after(claudeLoginNote);
  }
  claudeLoginNote.hidden=webLoginProvider!=='anthropic';
  claudeLoginNote.textContent=uiText('Claude 使用獨立的自動化瀏覽器設定檔：預設不預填、不自動登入。只有你在這裡儲存帳密並勾選「自動送出登入」時，才會預填／自動登入；未設定時請在官網親自登入或切換帳號。');
  const credentialProvider=webLoginProvider;
  if(webLoginCredentialProvider!==credentialProvider){
    webLoginCredentialProvider=credentialProvider;const request=++webLoginCredentialRequest;
    webLoginEmail='';webLoginHasPassword=false;webLoginAutoLogin=false;
    const emailInput=$('webLoginEmailInput'),passwordInput=$('webLoginPasswordInput'),autoCheckbox=$('webLoginAutoLogin');if(emailInput)emailInput.value='';if(passwordInput)passwordInput.value='';if(autoCheckbox)autoCheckbox.checked=false;
    void (async()=>{try{
      if(!window.claudeDesktop?.getWebLoginCredential)throw new Error(uiText('此功能需要 Windows 桌面版。'));
      let saved=await window.claudeDesktop.getWebLoginCredential(credentialProvider);
      if(request!==webLoginCredentialRequest)return;
      if(!saved?.email&&legacyWebLoginEmail){saved=await window.claudeDesktop.saveWebLoginCredential({provider:credentialProvider,email:legacyWebLoginEmail,password:'',autoLogin:false});legacyWebLoginEmail='';}
      if(request!==webLoginCredentialRequest)return;
      webLoginEmail=String(saved?.email||'');webLoginHasPassword=saved?.hasPassword===true;webLoginAutoLogin=saved?.autoLogin===true;
      if($('webLoginEmailInput'))$('webLoginEmailInput').value=webLoginEmail;
      if($('webLoginPasswordInput'))$('webLoginPasswordInput').placeholder=uiText(webLoginHasPassword?'密碼已保存（不顯示）':'密碼已保存；留白可保留原密碼');
      if($('webLoginAutoLogin'))$('webLoginAutoLogin').checked=webLoginAutoLogin;
    }catch(error){if(request===webLoginCredentialRequest&&$('webLoginCredentialNote'))$('webLoginCredentialNote').textContent=String(error?.message||uiText('此功能需要 Windows 桌面版。'));}})();
  }
  $('webLoginCredentialSetting')?.querySelector(':scope > label')?.replaceChildren(uiText('登入資料（選填）'));
  if($('saveWebLoginCredentialBtn'))$('saveWebLoginCredentialBtn').textContent=uiText('儲存登入資料');
  if($('clearWebLoginCredentialBtn'))$('clearWebLoginCredentialBtn').textContent=uiText('清除登入資料');
  if($('webLoginCredentialNote')&&!$('webLoginCredentialNote').dataset.error)$('webLoginCredentialNote').textContent=uiText('本機加密保存於此 Windows 使用者；不需要 Microsoft 帳號。只在官網登入頁使用；Gemini 一律在外部瀏覽器手動登入。Claude 預設不預填、不自動登入，需你在這裡明確儲存並勾選自動登入。驗證碼與雙重驗證仍需手動完成。');
  const saveCredentialButton=$('saveWebLoginCredentialBtn');if(saveCredentialButton)saveCredentialButton.onclick=async()=>{
    const note=$('webLoginCredentialNote');if(note){note.dataset.error='';note.textContent='';}
    try{const result=await window.claudeDesktop?.saveWebLoginCredential?.({provider:state.webProvider,email:String($('webLoginEmailInput')?.value||'').trim(),password:String($('webLoginPasswordInput')?.value||''),autoLogin:$('webLoginAutoLogin')?.checked===true});if(!result)throw new Error(uiText('此功能需要 Windows 桌面版。'));
      webLoginEmail=result.email;webLoginHasPassword=result.hasPassword;webLoginAutoLogin=result.autoLogin;$('webLoginEmailInput').value=webLoginEmail;$('webLoginPasswordInput').value='';$('webLoginPasswordInput').placeholder=uiText(webLoginHasPassword?'密碼已保存（不顯示）':'密碼已保存；留白可保留原密碼');if(note)note.textContent=uiText('登入資料已加密保存於本機。');
    }catch(error){if(note){note.dataset.error='true';note.textContent=String(error?.message||'登入資料保存失敗。');}}
  };
  const clearCredentialButton=$('clearWebLoginCredentialBtn');if(clearCredentialButton)clearCredentialButton.onclick=async()=>{
    const note=$('webLoginCredentialNote');if(note){note.dataset.error='';note.textContent='';}
    try{await window.claudeDesktop?.clearWebLoginCredential?.(state.webProvider);webLoginEmail='';webLoginHasPassword=false;webLoginAutoLogin=false;$('webLoginEmailInput').value='';$('webLoginPasswordInput').value='';$('webLoginPasswordInput').placeholder=uiText('密碼已保存；留白可保留原密碼');$('webLoginAutoLogin').checked=false;if(note)note.textContent=uiText('登入資料已清除。');}
    catch(error){if(note){note.dataset.error='true';note.textContent=String(error?.message||'登入資料清除失敗。');}}
  };
  let autoFlowLabel=$('webAutoFlowSelect')?.closest('label');
  if(!autoFlowLabel){
    autoFlowLabel=document.createElement('label');autoFlowLabel.className='web-auto-flow-setting';
    autoFlowLabel.append(document.createTextNode(uiText('自動送出與自動接回')));
    const select=document.createElement('select');select.id='webAutoFlowSelect';
    for(const [value,label] of [['on','開啟（自動送出，回覆自動接回）'],['off','關閉（手動送出／複製）']]){const option=document.createElement('option');option.value=value;option.textContent=uiText(label);select.append(option);}
    autoFlowLabel.append(select);
    const anchor=browserModeSelect?.closest('label')||$('webAiProvider').closest('label');
    if(anchor)anchor.after(autoFlowLabel);
  }
  const autoFlowSelect=$('webAutoFlowSelect');
  if(autoFlowSelect){autoFlowSelect.options[0].textContent=uiText('開啟（自動送出，回覆自動接回）');autoFlowSelect.options[1].textContent=uiText('關閉（手動送出／複製）');autoFlowSelect.value=webAutoFlow?'on':'off';autoFlowSelect.onchange=()=>applyWebAutoFlow(autoFlowSelect.value);}
  // 追加十（F）：自動化的使用者自選項——自動重試次數與狀態顯示詳細度（都存在本機、立即生效）。
  let retryLabel=$('webAutoRetrySelect')?.closest('label');
  if(!retryLabel){
    retryLabel=document.createElement('label');retryLabel.className='web-auto-retry-setting';
    retryLabel.append(document.createTextNode(uiText('自動重試次數')));
    const select=document.createElement('select');select.id='webAutoRetrySelect';
    for(const [value,label] of [['0','不自動重試（卡住直接手動）'],['2','2 次'],['3','3 次（預設）'],['5','5 次']]){const option=document.createElement('option');option.value=value;option.textContent=uiText(label);select.append(option);}
    retryLabel.append(select);
    const anchor=autoFlowSelect?.closest('label')||browserModeSelect?.closest('label')||$('webAiProvider').closest('label');
    if(anchor)anchor.after(retryLabel);
  }
  const retrySelect=$('webAutoRetrySelect');
  if(retrySelect){
    retrySelect.options[0].textContent=uiText('不自動重試（卡住直接手動）');
    retrySelect.options[1].textContent=uiText('2 次');
    retrySelect.options[2].textContent=uiText('3 次（預設）');
    retrySelect.options[3].textContent=uiText('5 次');
    retrySelect.value=String(webAutoRetryLimit);
    retrySelect.onchange=()=>{webAutoRetryLimit=normalizeWebAutoRetry(retrySelect.value);localStorage.setItem(WEB_AUTO_RETRY_KEY,String(webAutoRetryLimit));settings();};
  }
  let detailLabel=$('webAutoDetailSelect')?.closest('label');
  if(!detailLabel){
    detailLabel=document.createElement('label');detailLabel.className='web-auto-detail-setting';
    detailLabel.append(document.createTextNode(uiText('自動化狀態顯示')));
    const select=document.createElement('select');select.id='webAutoDetailSelect';
    for(const [value,label] of [['full','詳細（每一步都說明）'],['brief','簡潔（只顯示重要狀態）']]){const option=document.createElement('option');option.value=value;option.textContent=uiText(label);select.append(option);}
    detailLabel.append(select);
    const anchor=$('webAutoRetrySelect')?.closest('label');
    if(anchor)anchor.after(detailLabel);
  }
  const detailSelect=$('webAutoDetailSelect');
  if(detailSelect){
    detailSelect.options[0].textContent=uiText('詳細（每一步都說明）');
    detailSelect.options[1].textContent=uiText('簡潔（只顯示重要狀態）');
    detailSelect.value=webAutoStatusDetail;
    detailSelect.onchange=()=>{webAutoStatusDetail=normalizeWebAutoDetail(detailSelect.value);localStorage.setItem(WEB_AUTO_DETAIL_KEY,webAutoStatusDetail);settings();};
  }
  const webLoginLink=$('webAiDirectLoginLink');
  if(webLoginLink){webLoginLink.href=WEB_AI_URL[webLoginProvider];webLoginLink.textContent=uiLanguage==='en'?'Open '+webAIProviderName(webLoginProvider)+' sign-in / account page':'直接開啟 '+webAIProviderName(webLoginProvider)+' 登入／帳號頁';}
  $('sceneMode').value = sceneMode;
  document.querySelectorAll('[data-language-select]').forEach(select=>{select.value=uiLanguage;});
  const autoSaveToggle=$('autoSaveToggle');
  if(autoSaveToggle){autoSaveToggle.checked=autoSaveEnabled;$('autoSaveToggleLabel').textContent=uiText('故事自動存檔');autoSaveToggle.onchange=()=>{
    if(!setAutoSaveEnabled(autoSaveToggle.checked))autoSaveToggle.checked=autoSaveEnabled;
  };}
  // 主題：跟隨系統／亮色／暗色／依時間／依故事時間（外觀偏好；只存本機，不進存檔）。
  const themeSelect=$('themeMode');
  if(themeSelect){
    const themeLabels={auto:'跟隨系統',light:'亮色',dark:'暗色',time:'依時間',story:'依故事時間'};
    themeSelect.value=storedThemeChoice();
    for(const option of themeSelect.options)option.textContent=uiText(themeLabels[option.value]||option.textContent);
    $('themeModeLabel').textContent=uiText('主題');
    const themeHint=$('themeModeHint');
    if(themeHint)themeHint.textContent=uiText('只影響外觀顯示，不影響故事與存檔；選擇後立即套用並記住。依故事時間＝跟隨故事時段：早晨／中午＝亮色、傍晚／夜晚＝暗色；沒有進行中的故事時，自動跟隨系統。');
    themeSelect.onchange=()=>{applyThemePreference(themeSelect.value);};
    refreshQuickThemeBtn();
  }
  // 追加九：故事功能開關＋提示詞管理器（GALGAME 設定画面風；每項預設不影響既有存檔）。
  const featureWorldBookToggle=$('featureWorldBookToggle');
  const affectionDisplayToggle=$('affectionDisplayToggle');
  if(affectionDisplayToggle){
    affectionDisplayToggle.checked=affectionDisplayEnabled();
    affectionDisplayToggle.onchange=()=>{
      try{localStorage.setItem(AFFECTION_DISPLAY_KEY,affectionDisplayToggle.checked?'1':'0');}
      catch{affectionDisplayToggle.checked=affectionDisplayEnabled();return;}
      applyAffectionDisplayPreference();
    };
  }
  if(featureWorldBookToggle){
    featureWorldBookToggle.checked=normalizeWorldBook(state.worldBook).enabled;
    featureWorldBookToggle.onchange=()=>{
      const previous=normalizeWorldBook(state.worldBook);
      const book=normalizeWorldBook(state.worldBook);
      book.enabled=featureWorldBookToggle.checked===true;
      state.worldBook=book;
      if(!save()){state.worldBook=previous;featureWorldBookToggle.checked=!featureWorldBookToggle.checked;return;}
      renderWorldBook();
    };
  }
  const featureAuthorNoteToggle=$('featureAuthorNoteToggle');
  if(featureAuthorNoteToggle){
    featureAuthorNoteToggle.checked=normalizeAuthorNote(state.authorNote).enabled;
    featureAuthorNoteToggle.onchange=()=>{
      state.authorNote={enabled:featureAuthorNoteToggle.checked===true,text:String(state.authorNote.text||'').slice(0,600)};
      if(!save()){featureAuthorNoteToggle.checked=!featureAuthorNoteToggle.checked;return;}
      render();
    };
  }
  const featureUndoToggle=$('featureUndoToggle');
  if(featureUndoToggle){
    featureUndoToggle.checked=state.undoToolsEnabled!==false;
    featureUndoToggle.onchange=()=>{
      state.undoToolsEnabled=featureUndoToggle.checked===true;
      if(!save()){featureUndoToggle.checked=!featureUndoToggle.checked;return;}
      render();
    };
  }
  const featureHistoryEditToggle=$('featureHistoryEditToggle');
  if(featureHistoryEditToggle){
    featureHistoryEditToggle.checked=state.historyEditEnabled!==false;
    featureHistoryEditToggle.onchange=()=>{
      state.historyEditEnabled=featureHistoryEditToggle.checked===true;
      if(!save()){featureHistoryEditToggle.checked=!featureHistoryEditToggle.checked;return;}
      render();
    };
  }
  const featureAnthropicLetterToggle=$('featureAnthropicLetterToggle');
  if(featureAnthropicLetterToggle){
    featureAnthropicLetterToggle.checked=state.letterEventEnabled===true;
    featureAnthropicLetterToggle.onchange=()=>{
      state.letterEventEnabled=featureAnthropicLetterToggle.checked===true;
      if(!save()){featureAnthropicLetterToggle.checked=!featureAnthropicLetterToggle.checked;syncAnthropicLetterToggles();return;}
      syncAnthropicLetterToggles();
      render();
    };
  }
  const tweakRules=normalizePromptTweaks(state.promptTweaks);
  for(const [ruleKey,ruleId] of [['style','tweakRuleStyle'],['tone','tweakRuleTone'],['memory','tweakRuleMemory'],['choices','tweakRuleChoices']]){
    const box=$(ruleId);
    if(!box)continue;
    box.checked=!tweakRules.rulesOff.includes(ruleKey);
    box.onchange=()=>{
      const off=[];
      for(const [key,id] of [['style','tweakRuleStyle'],['tone','tweakRuleTone'],['memory','tweakRuleMemory'],['choices','tweakRuleChoices']]){const other=$(id);if(other&&!other.checked)off.push(key);}
      state.promptTweaks={rulesOff:off,extra:String(normalizePromptTweaks(state.promptTweaks).extra||'').slice(0,600)};
      if(!save()){box.checked=!box.checked;return;}
    };
  }
  const tweakExtra=$('tweakExtra');
  if(tweakExtra){
    if(document.activeElement!==tweakExtra)tweakExtra.value=normalizePromptTweaks(state.promptTweaks).extra;
    const tweakNote=$('tweakExtraNote');
    const updateTweakNote=()=>{if(tweakNote)tweakNote.textContent=uiText('目前 ')+String(tweakExtra.value.length)+uiText(' / 600 字');};
    updateTweakNote();
    tweakExtra.oninput=()=>{
      updateTweakNote();
      clearTimeout(tweakExtraSaveTimer);
      tweakExtraSaveTimer=setTimeout(()=>{
        state.promptTweaks={rulesOff:normalizePromptTweaks(state.promptTweaks).rulesOff,extra:String(tweakExtra.value||'').slice(0,600)};
        save();
      },500);
    };
    tweakExtra.onchange=()=>{
      state.promptTweaks={rulesOff:normalizePromptTweaks(state.promptTweaks).rulesOff,extra:String(tweakExtra.value||'').slice(0,600)};
      save();
      updateTweakNote();
    };
  }
  renderSaveStatus();
  $('webAiLoginHint').textContent = uiLanguage==='en'
    ? 'Choose the in-app browser or the external automation browser. Sign in only on the official site. The in-app session is isolated to this app; external mode uses the dedicated automation profile, so the same sign-in is reused by automation. Story turns stay in the current save.'
    : '可選 App 內瀏覽器或外部自動化瀏覽器；帳號密碼只在官方網站輸入。App 內登入保存在本 App 獨立的瀏覽器設定檔；外部模式使用自動化專用設定檔，登入一次後自動化會沿用同一個視窗，不會另開平常的 Chrome。故事對話與待辦回合會保存在目前存檔。';
  $('webAiModeStatus').textContent = state.aiMode === 'web'
    ? uiText('網頁版已啟用：App 會自動整理提示詞、保留故事並接續有效回覆；你仍須在官方網站登入、貼上並送出提示詞，再複製回覆。網站內操作由你確認。')
    : uiText('目前使用 API 連線。完成官方 API Key 設定後，每回合只需選 AI 的 7 個選項之一，或選第 8 項輸入自訂行動；App 會自動生成、驗證並保存回覆。若改用網站免費版，登入、送出及複製仍須在官方網站操作。');
  let webGuide=$('webAiSetupGuide');
  if(!webGuide){webGuide=document.createElement('ol');webGuide.id='webAiSetupGuide';webGuide.className='web-steps';$('webAiModeStatus').insertAdjacentElement('afterend',webGuide);}
  webGuide.hidden=state.aiMode!=='web';
  webGuide.innerHTML=WEB_AI_GUIDE_STEPS.map(step=>`<li>${uiText(step)}</li>`).join('');
  let webModelHint=$('webAiModelHint');
  if(!webModelHint){webModelHint=document.createElement('p');webModelHint.id='webAiModelHint';webModelHint.className='note';$('webAiModeStatus').insertAdjacentElement('afterend',webModelHint);}
  webModelHint.textContent=uiText(webBrowserMode==='embedded'?'App 內登入後，可在待辦回合按「填入提示詞並更新模型」，再直接選模型切換；清單取自登入帳號當下可見選項。':'外部自動化瀏覽器沿用同一個專用設定檔的登入，待辦回合會直接讀取並可切換官網模型；清單隨帳號當下可見選項更新。')+' '+uiText('故事對話會自動存入目前存檔；官網的登入和網站對話由該網站帳號保存。')+' '+webPromptBudgetSentence();
  let apiFreeTierNote=$('apiFreeTierNote');
  if(!apiFreeTierNote){apiFreeTierNote=document.createElement('p');apiFreeTierNote.id='apiFreeTierNote';apiFreeTierNote.className='note';document.querySelector('.account-flow')?.append(apiFreeTierNote);}
  if(apiFreeTierNote)apiFreeTierNote.textContent=isAndroidApp()?uiText('Android 版預設使用免費網頁 AI，不用設定 API Key 或伺服器。若改用 API 自動生成，請填入你管理的 HTTPS 後端；不要把 API Key 放進 APK。'):uiLanguage==='en'
    ? 'New saves use free web-assisted AI by default and need no API key. Sign in only on the provider’s official website; the app prepares the prompt and continues the same save after you paste a valid reply. Website quotas and terms are controlled by each provider. For full in-game automation with one choice per turn, configure Gemini API with Gemini 3.1 Flash-Lite. Google currently lists free-tier pricing for this model; confirm your AI Studio project remains on Free Tier because linked billing can incur charges. Google says Free Tier prompts and replies may be used to improve products. API quotas and data rules differ from Gemini web.'
    : '新存檔預設使用免費網頁輔助，不需要 API Key。只在 AI 官方網站登入；App 會準備提示詞，貼回有效回覆後接續同一存檔。若要每回合只選一次、其餘全自動，可設定 Gemini API 並選 Gemini 3.1 Flash-Lite。Google 目前將此模型列為 API 免費層；請確認 AI Studio 專案仍是 Free Tier，連結付費帳務可能產生費用。Google 表示免費層提示與回覆可能用於改善產品；請按資料需求選擇。API 配額和資料規則與 Gemini 網頁版不同。';
  let sideBySideNote=$('webAiSideBySideHint');
  if(!sideBySideNote){sideBySideNote=document.createElement('div');sideBySideNote.id='webAiSideBySideHint';sideBySideNote.className='note';$('webAiModeStatus').insertAdjacentElement('afterend',sideBySideNote);}
  sideBySideNote.textContent=uiText(isAndroidApp()?'手機版操作：開始或重試回合時 App 會複製提示詞並開啟 AI 網站；複製有效答案後 App 會自動嘗試接回；背景讀取受限時再返回 App 按備用按鈕。登入、選模型、送出與複製答案仍在官方網站操作。':webBrowserMode==='embedded'?'App 內官網操作：官方網站會在本 App 的獨立登入視窗開啟，遊戲視窗縮到左側，官網在右側並取得操作焦點。登入、確認提示詞、選模型與送出都在官網完成；複製有效回覆後 App 會自動偵測並接續。按「還原遊戲視窗」可恢復原尺寸。':'外部自動化官網操作：官方網站會在自動化專用 Chrome／Edge 開啟，遊戲視窗保持原尺寸。登入一次後，之後的自動化與「開啟官網」都會沿用同一個設定檔；不會另開平常的 Chrome，也不會停在 about:blank。複製有效回覆後 App 會自動偵測並接續。');
  let restoreSettingsButton=$('restoreWebLayoutBtnSettings');
  if(!restoreSettingsButton){restoreSettingsButton=document.createElement('button');restoreSettingsButton.id='restoreWebLayoutBtnSettings';restoreSettingsButton.type='button';restoreSettingsButton.className='choice-btn';restoreSettingsButton.textContent=uiText('還原遊戲視窗');document.querySelector('.web-ai-actions')?.append(restoreSettingsButton);}
  restoreSettingsButton.textContent=uiText('還原遊戲視窗');
  restoreSettingsButton.onclick=async()=>{try{await window.claudeDesktop?.restoreWebCompanionLayout();}catch(e){alert(uiText('無法還原遊戲視窗：')+(e.message||''));}};
  $('temperature').value = state.temperature;
  $('temperatureVal').textContent = Number(state.temperature).toFixed(2);
  $('topP').value = state.topP;
  $('topPVal').textContent = Number(state.topP).toFixed(2);
  $('maxTokens').value = state.maxTokens;
  $('responseMode').value = state.responseMode === 'quality' ? 'quality' : 'fast';
  const promptModeSelect=$('promptMode'); if(promptModeSelect) promptModeSelect.value = state.promptMode === 'saving' ? 'saving' : 'standard';
  let parameterNote=$('modelParameterSupportNote');
  if(!parameterNote){parameterNote=document.createElement('p');parameterNote.id='modelParameterSupportNote';parameterNote.className='note model-support-note';document.querySelector('.ai-control')?.insertAdjacentElement('afterend',parameterNote);}
  updateModelParameterSupport();
  updateAiPicker();
  applyUiLanguage();
  ensureVnPerformanceControls();
  renderAlbum();
}

function ensureVnPerformanceControls() {
  const settingsRoot = document.querySelector('#tab-settings .settings');
  if (!settingsRoot) return;

  let group = $('vnPerformanceSettingGroup');
  if (!group) {
    group = document.createElement('div');
    group.id = 'vnPerformanceSettingGroup';
    group.className = 'vn-performance-settings-group';

    const h2 = document.createElement('h2');
    h2.textContent = uiText('視覺小說演出與多媒體設定');
    group.append(h2);

    // 1. 逐句演出開關與速度 (D17)
    const lineModeLabel = document.createElement('label');
    lineModeLabel.className = 'vn-line-mode-label';
    const lineModeCheckbox = document.createElement('input');
    lineModeCheckbox.type = 'checkbox';
    lineModeCheckbox.id = 'vnLineModeToggle';
    lineModeLabel.append(lineModeCheckbox, document.createTextNode(uiText(' 啟用逐句打字演出（支援點擊快進）')));
    group.append(lineModeLabel);

    const speedBox = document.createElement('div');
    speedBox.className = 'vn-speed-control-box';
    const speedLabel = document.createElement('label');
    speedLabel.htmlFor = 'vnLineSpeedSlider';
    speedLabel.textContent = uiText('逐句打字速度：');
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.id = 'vnLineSpeedSlider';
    speedSlider.min = '15';
    speedSlider.max = '80';
    speedSlider.step = '5';
    const speedVal = document.createElement('span');
    speedVal.id = 'vnLineSpeedValue';
    speedBox.append(speedLabel, speedSlider, speedVal);
    group.append(speedBox);

    // 2. 晚安 CG 偏好 (D16)
    const gnBox = document.createElement('label');
    gnBox.className = 'vn-cg-pref-label';
    gnBox.textContent = uiText('晚安時刻 CG 偏好：');
    const gnSelect = document.createElement('select');
    gnSelect.id = 'vnGoodnightCgPref';
    const optBoth = document.createElement('option');
    optBoth.value = 'both';
    optBoth.textContent = uiText('兩者皆可（隨機輪播：36455 臥室主 CG／36628 夜間蓋被）');
    const opt36455 = document.createElement('option');
    opt36455.value = '36455';
    opt36455.textContent = uiText('36455 臥室主 CG（臥室羽毛筆、微醺）');
    const opt36628 = document.createElement('option');
    opt36628.value = '36628';
    opt36628.textContent = uiText('36628 夜間蓋被讀書（溫柔、抱著鯨魚玩偶）');
    gnSelect.append(optBoth, opt36455, opt36628);
    gnBox.append(gnSelect);
    group.append(gnBox);

    // 3. 語音合成預留 (D20)
    const voiceBox = document.createElement('label');
    voiceBox.className = 'vn-voice-label';
    const voiceCheckbox = document.createElement('input');
    voiceCheckbox.type = 'checkbox';
    voiceCheckbox.id = 'vnVoiceToggle';
    voiceBox.append(voiceCheckbox, document.createTextNode(uiText(' [v2.1 實裝預定] 語音合成（Claude Glassy 英國腔配音）')));
    const voiceNote = document.createElement('p');
    voiceNote.className = 'note';
    voiceNote.textContent = uiText('語音合成功能將於 v2.1 版發布。此處預留開關狀態供用戶偏好存取。');
    group.append(voiceBox, voiceNote);

    settingsRoot.append(group);
  }

  const runner = getStoryLineRunner();
  const lineToggle = $('vnLineModeToggle');
  const speedSlider = $('vnLineSpeedSlider');
  const speedVal = $('vnLineSpeedValue');
  const gnSelect = $('vnGoodnightCgPref');
  const voiceToggle = $('vnVoiceToggle');

  if (lineToggle && runner) {
    lineToggle.checked = runner.enabled;
    lineToggle.onchange = () => {
      runner.savePreference(lineToggle.checked);
    };
  }

  if (speedSlider && runner) {
    speedSlider.value = runner.speed;
    if (speedVal) speedVal.textContent = ` ${runner.speed} ms/字`;
    speedSlider.oninput = () => {
      if (speedVal) speedVal.textContent = ` ${speedSlider.value} ms/字`;
      runner.saveSpeedPreference(speedSlider.value);
    };
  }

  if (gnSelect) {
    let savedGn = 'both';
    try { savedGn = localStorage.getItem('claude_novel_goodnight_cg_pref_v1') || 'both'; } catch(_) {}
    gnSelect.value = savedGn;
    gnSelect.onchange = () => {
      try { localStorage.setItem('claude_novel_goodnight_cg_pref_v1', gnSelect.value); } catch(_) {}
    };
  }

  if (voiceToggle) {
    let savedVoice = false;
    try { savedVoice = localStorage.getItem('claude_novel_voice_tts_v21') === 'true'; } catch(_) {}
    voiceToggle.checked = savedVoice;
    voiceToggle.onchange = () => {
      try { localStorage.setItem('claude_novel_voice_tts_v21', String(voiceToggle.checked)); } catch(_) {}
    };
  }
}

function updateAiPicker(){
  const button=$('aiPickerBtn');
  if(!button)return;
  const provider=state.aiMode==='web'?webAIProviderName(state.webProvider):({anthropic:'Claude',openai:'GPT',gemini:'Gemini',deepseek:'DeepSeek',openrouter:'OpenRouter',qwen:'Qwen',mistral:'Mistral',groq:'Groq',xai:'Grok'})[state.provider]||state.provider;
  const mode=state.aiMode==='web'?(uiLanguage==='en'?' Web':' 網頁版'):(uiLanguage==='en'?' API':' API');
  button.textContent=(uiLanguage==='en'?'AI: ':'AI：')+provider+mode;
  button.title=uiLanguage==='en'?`Current AI: ${provider}${mode}. Click to choose an AI service or model.`:`目前使用：${provider}${mode}。點擊選擇 AI 服務或模型。`;
  button.setAttribute('aria-label',uiLanguage==='en'?`Choose AI service or model. Current: ${provider}${mode}.`:`選擇 AI 服務或模型，目前使用 ${provider}${mode}`);
}

// P1-02（S2 提示詞組裝與開發者檢視）：工坊尾端「開發者檢視」面板。
// 六區塊＝人設／階段／好感帶／生活層／記憶／狀態；開關僅作用於下方預覽（偏好存 localStorage），
// 遊戲實際提示詞由各回合組裝流程決定，這裡不改動。生活層目前無產生器（留空並標註來源）；
// app.js 尚無相處風格自訂（styleTweaks 以標準值檢視）；記憶讀 state.storyMemory。
const INSPECTOR_BAND_OPTIONS=[['sweet','甜'],['stable','平穩'],['awkward','小彆扭'],['reconciliation','待和好']];

function ensurePromptInspectorPanel(){
  let panel=$('pmInspector');
  if(panel)return panel;
  const host=document.querySelector('#tab-workshop .workshop');
  if(!host)return null;
  panel=document.createElement('details');
  panel.id='pmInspector';
  panel.className='workshop-section pm-inspector';
  panel.innerHTML=`<summary><span class="pm-title">開發者檢視（提示詞組裝）</span></summary>
<p class="note">檢視目前狀態會怎麼組出提示詞：六區塊各自標示來源、字數與估算 token；區塊開關只影響這份預覽，不會改變遊戲實際送出的提示詞。token 為估算值（中文 1 字≈1.15 token）。</p>
<div class="pm-controls">
<label>階段<select id="pmInspectorStage"><option value="A">A 嘴硬期</option><option value="B">B 曖昧期</option><option value="C">C 告白後</option></select></label>
<label>好感帶（僅 C 階段）<select id="pmInspectorBand">${INSPECTOR_BAND_OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
<button id="pmInspectorRefresh" type="button">重新組裝</button>
</div>
<p class="pm-summary" id="pmInspectorSummary" role="status"></p>
<div class="pm-blocks" id="pmInspectorBlocks"></div>`;
  host.append(panel);
  const stageSelect=$('pmInspectorStage');
  const bandSelect=$('pmInspectorBand');
  if(stageSelect)stageSelect.value=defaultStageForAffection(state.affection);
  if(bandSelect)bandSelect.value=bandKeyForAffection(state.affection);
  const syncBandAvailability=()=>{if(bandSelect)bandSelect.disabled=stageSelect.value!=='C';};
  stageSelect.onchange=()=>{syncBandAvailability();refreshPromptInspector();};
  syncBandAvailability();
  bandSelect.onchange=()=>refreshPromptInspector();
  const refreshButton=$('pmInspectorRefresh');
  if(refreshButton)refreshButton.onclick=()=>refreshPromptInspector();
  panel.addEventListener('toggle',()=>{if(panel.open)refreshPromptInspector();});
  refreshPromptInspector();
  return panel;
}

function refreshPromptInspector(){
  const panel=$('pmInspector');
  const stageSelect=$('pmInspectorStage');
  const bandSelect=$('pmInspectorBand');
  const blocksHost=$('pmInspectorBlocks');
  if(!panel||!stageSelect||!bandSelect||!blocksHost)return;
  const stage=stageSelect.value||defaultStageForAffection(state.affection);
  const band=bandSelect.value||bandKeyForAffection(state.affection);
  const data=buildInspectorData({
    state:{ stage, band, playerName:state.playerName||loadPlayerNamePreference() },
    livingSection:'',
    memorySection:state.storyMemory||'',
    styleTweaks:{},
    storage:window.localStorage
  });
  blocksHost.innerHTML=renderInspectorBlocks(data.blocks);
  const summary=$('pmInspectorSummary');
  if(summary)summary.textContent=renderInspectorSummary(data);
  blocksHost.querySelectorAll('input[data-block]').forEach(input=>{
    input.onchange=()=>{
      const prefs=loadBlockPrefs(window.localStorage);
      blocksHost.querySelectorAll('input[data-block]').forEach(box=>{prefs[box.dataset.block]=box.checked;});
      saveBlockPrefs(window.localStorage,prefs);
      refreshPromptInspector();
    };
  });
}

function fillWorkshopSettings(){
  ensurePromptInspectorPanel();
  refreshPromptInspector();
  const nameInput=$('workshopCharacterName');if(nameInput)nameInput.value=state.characterName||DEFAULT_CHARACTER_NAME;
  const profileInput=$('workshopCharacterProfile');if(profileInput)profileInput.value=state.characterProfile||DEFAULT_CHARACTER_PROFILE;
  const worldInput=$('workshopWorldSetting');if(worldInput)worldInput.value=state.worldSetting||DEFAULT_WORLD_SETTING;
  const templateInput=$('workshopStoryTemplate');if(templateInput)templateInput.value=state.storyTemplate||DEFAULT_STORY_TEMPLATE;
  const codeSelect=$('workshopCodeFile');
  if(!codeSelect)return;
  const codeSection=$('workshopCodeSection');
  if(!window.claudeDesktop?.readWorkshopSource){codeSection.hidden=true;return;}
  codeSection.hidden=false;
  refreshWorkshopFileList();
}
// 重新取得整個專案的檔案清單（主程序已排除相依、建置產物、備份與秘密檔）。
async function refreshWorkshopFileList(){
  const select=$('workshopCodeFile');
  if(!select||!window.claudeDesktop?.listWorkshopSources)return;
  const request=++workshopListRequest;
  const refreshButton=$('refreshWorkshopCodeListBtn');
  if(refreshButton)refreshButton.disabled=true;
  const status=$('workshopCodeStatus');
  if(status)status.textContent=uiText('正在載入程式檔清單…');
  try{
    const info=await window.claudeDesktop.listWorkshopSources();
    // 使用者快速切換分頁或連點重新整理時，只採用最後一次結果，避免較慢的舊請求覆蓋新清單。
    if(request!==workshopListRequest)return;
    workshopSourceInfo=info;
    workshopFileList=Array.isArray(info?.files)?info.files:[];
    const preferred=workshopCurrentFile||select.value;
    select.textContent='';
    for(const item of workshopFileList){
      const option=document.createElement('option');
      option.value=item.path;
      option.textContent=item.bytes>WORKSHOP_MAX_FILE_CHARS?`${item.path}${uiText('（超過 400 KB，不開放編輯）')}`:item.path;
      select.append(option);
    }
    // 已修改（或新建立）但還沒套用的檔案也要留在清單裡，否則切走就找不回來。
    for(const file of Object.keys(workshopCodeEdits))if(!workshopFileList.some(item=>item.path===file)){
      const option=document.createElement('option');option.value=file;option.textContent=file+uiText('（已修改／新檔案）');select.append(option);
    }
    const available=[...select.options].map(option=>option.value);
    workshopCurrentFile=preferred&&available.includes(preferred)?preferred:(available[0]||'');
    if(workshopCurrentFile)select.value=workshopCurrentFile;
    else{const option=document.createElement('option');option.value='';option.textContent=uiText('沒有可編輯的程式檔');option.disabled=true;option.selected=true;select.append(option);}
    const label=$('workshopCodeRoot');
    if(label)label.textContent=uiText(info?.scope==='project'?'原始專案・整個交付資料夾（可套用）：':info?.scope==='app'?'原始專案・app 資料夾（可套用）：':'目前 App 內容（僅供讀取與匯出）：')
      +(info?.dir||'')+uiText('　共 ')+workshopFileList.length+uiText(' 個可編輯檔案')+(info?.truncated?'\n'+uiText('清單已達上限，請選擇較小的原始專案資料夾。'):'')+(info?.reason?'\n'+uiText(info.reason):'');
    if(workshopCurrentFile&&!workshopEditorLoaded&&!workshopCodeDirty)await loadWorkshopSource(true);
    if(status&&request===workshopListRequest)status.textContent=workshopFileList.length?uiText('程式檔清單已更新。'):uiText('清單為空；請確認原始專案位置，或使用路徑欄開啟新檔案。');
  }catch(e){
    if(request!==workshopListRequest)return;
    workshopSourceInfo=null;workshopFileList=[];workshopCurrentFile='';workshopEditorLoaded=false;
    select.textContent='';
    const option=document.createElement('option');option.value='';option.textContent=uiText('清單載入失敗');option.disabled=true;option.selected=true;select.append(option);
    const label=$('workshopCodeRoot');if(label)label.textContent=uiText('無法讀取原始專案檔案清單。');
    if(status)status.textContent=uiText('無法取得程式檔清單：')+uiErrorText(ipcMessage(e,'請重新開啟工坊。'));
  }finally{if(request===workshopListRequest&&refreshButton)refreshButton.disabled=false;}
}
async function loadWorkshopSource(force=false,original=false){
  const file=$('workshopCodeFile').value;
  if(!file)return;
  try{
    const text=!original&&Object.hasOwn(workshopCodeEdits,file)?workshopCodeEdits[file]:await window.claudeDesktop.readWorkshopSource(file);
    $('workshopCodeEditor').value=text;
    workshopCurrentFile=file;workshopCodeDirty=false;workshopEditorLoaded=true;
    $('workshopCodeStatus').textContent=Object.hasOwn(workshopCodeEdits,file)?uiText('程式碼編輯已保存；只會加入匯出的修改包，不會在遊戲中直接執行。'):uiText('已載入原始程式檔。');
  }catch(e){
    const message=ipcMessage(e,'請重新開啟工坊。');
    if(/找不到/.test(message)){
      // 新檔案：先給空白編輯器，存檔後就會出現在修改包與「套用到原始專案」裡。
      $('workshopCodeEditor').value='';
      workshopCurrentFile=file;workshopCodeDirty=false;workshopEditorLoaded=true;
      $('workshopCodeStatus').textContent=uiText('這是新檔案，尚未存在於專案中；保存編輯後即可套用。');
      return;
    }
    $('workshopCodeStatus').textContent=uiText('無法讀取程式檔：')+uiErrorText(message);
  }
}
// 直接輸入路徑開啟（可用來開啟清單上沒有的新檔案）。
async function openWorkshopFileFromPath(){
  const input=$('workshopCodePath');
  const file=String(input?.value||'').trim().replace(/\\/g,'/');
  if(!file)return;
  if(!isWorkshopEditKey(file)){ $('workshopCodeStatus').textContent=uiText('路徑無效，或屬於相依、建置產物與秘密檔：')+file; return; }
  if(workshopCodeDirty&&!confirm(uiText('目前程式碼尚未保存，切換檔案會放棄這次編輯。是否繼續？')))return;
  const select=$('workshopCodeFile');
  if(![...select.options].some(option=>option.value===file)){
    const option=document.createElement('option');option.value=file;option.textContent=file+uiText('（新檔案）');select.append(option);
  }
  select.value=file;
  await loadWorkshopSource(true);
}
function saveWorkshopSettings(){
  const name=normalizeCharacterName($('workshopCharacterName').value);
  if(!name)return alert(uiText('請設定角色名稱。'));
  state.characterName=name;
  state.characterProfile=$('workshopCharacterProfile').value.trim().slice(0,10000)||DEFAULT_CHARACTER_PROFILE;
  state.worldSetting=$('workshopWorldSetting').value.trim().slice(0,10000)||DEFAULT_WORLD_SETTING;
  state.storyTemplate=$('workshopStoryTemplate').value.trim().slice(0,10000)||DEFAULT_STORY_TEMPLATE;
  save();render();alert(uiText('工坊設定已保存到目前存檔，下一回合開始套用。'));
}
function resetWorkshopSettings(){
  if(!confirm(uiText('恢復預設內容？目前存檔的角色、世界觀與劇情模板將重設；故事進度不會刪除。')))return;
  $('workshopCharacterName').value=DEFAULT_CHARACTER_NAME;
  $('workshopCharacterProfile').value=DEFAULT_CHARACTER_PROFILE;
  $('workshopWorldSetting').value=DEFAULT_WORLD_SETTING;
  $('workshopStoryTemplate').value=DEFAULT_STORY_TEMPLATE;
  saveWorkshopSettings();
}
function saveWorkshopCodeEdit(){
  const file=workshopCurrentFile||$('workshopCodeFile').value,content=$('workshopCodeEditor').value;
  if(!isWorkshopEditKey(file)){ $('workshopCodeStatus').textContent=uiText('路徑無效，或屬於相依、建置產物與秘密檔；未保存。'); return; }
  if(content.length>WORKSHOP_MAX_FILE_CHARS)return alert(uiText('單一程式檔最多 400 KB。'));
  workshopCodeEdits[file]=content;
  try{localStorage.setItem(WORKSHOP_CODE_KEY,JSON.stringify(workshopCodeEdits));workshopCodeDirty=false;
    const select=$('workshopCodeFile');
    if(select&&![...select.options].some(option=>option.value===file)){const option=document.createElement('option');option.value=file;option.textContent=file+uiText('（已修改／新檔案）');select.append(option);select.value=file;}
    $('workshopCodeStatus').textContent=uiText('程式碼編輯已保存；只會加入匯出的修改包，不會在遊戲中直接執行。');}
  catch(e){$('workshopCodeStatus').textContent=uiText('無法保存程式碼編輯：')+(e.message||uiText('本機儲存空間不足。'));}
}
async function restoreWorkshopCodeFile(){
  const file=workshopCurrentFile||$('workshopCodeFile').value;
  if(!isWorkshopEditKey(file))return;
  delete workshopCodeEdits[file];
  try{localStorage.setItem(WORKSHOP_CODE_KEY,JSON.stringify(workshopCodeEdits));}catch{}
  await loadWorkshopSource(true);
  $('workshopCodeStatus').textContent=uiText('已還原此程式檔。');
}
async function exportWorkshopCode(){
  if(workshopCodeDirty)saveWorkshopCodeEdit();
  if(workshopCodeDirty)return;
  if(!Object.keys(workshopCodeEdits).length){$('workshopCodeStatus').textContent=uiText('尚未修改程式檔。');return;}
  try{
    const result=await window.claudeDesktop.exportWorkshopCode({...workshopCodeEdits});
    if(!result.canceled)$('workshopCodeStatus').textContent=uiText('程式碼修改包已匯出：')+result.filePath;
  }catch(e){$('workshopCodeStatus').textContent=uiText('匯出失敗：')+uiErrorText(e.message||uiText('請稍後再試。'));}
}
function ipcMessage(error,fallback=''){return String(error?.message||fallback).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');}
// 套用到原始專案：主程序會先做路徑安全檢查、語法檢查、備份舊檔再寫入；編輯內容保留在編輯器，重建安裝後即與已安裝版本一致。
async function applyWorkshopCodeToSource(){
  const status=$('workshopCodeStatus');
  if(workshopCodeDirty)saveWorkshopCodeEdit();
  if(workshopCodeDirty)return false;
  if(!Object.keys(workshopCodeEdits).length){status.textContent=uiText('尚未修改程式檔。');return false;}
  try{
    const result=await window.claudeDesktop.applyWorkshopCode({...workshopCodeEdits});
    if(!result.ok){status.textContent=uiText('語法檢查未通過，未寫入任何檔案：')+'\n'+result.problems.map(item=>item.file+'：'+item.message).join('\n');return false;}
    status.textContent=uiText('已套用到原始專案：')+result.written.join(', ')+'\n'+uiText('舊檔備份在：')+result.backupDir+(result.unchecked?.length?'\n'+uiText('這些檔案無法做語法檢查：')+result.unchecked.join(', '):'');
    return true;
  }catch(e){status.textContent=uiText('套用失敗：')+uiErrorText(ipcMessage(e,'請稍後再試。'));return false;}
}
async function rebuildFromWorkshop(){
  const status=$('workshopCodeStatus');
  if((workshopCodeDirty||Object.keys(workshopCodeEdits).length)&&!await applyWorkshopCodeToSource())return;
  try{
    const result=await window.claudeDesktop.rebuildFromWorkshop();
    status.textContent=result.started?uiText('已開啟建置視窗，App 即將關閉。'):uiText('已取消自動重建。');
  }catch(e){status.textContent=uiText('重建失敗：')+uiErrorText(ipcMessage(e,'請稍後再試。'));}
}


// ==== SECTION 14｜故事回合（callAI、applyTurn、禮物、資料匯出／匯入）====
// API 用量計數（只存在記憶體，重開 App 歸零）：輸入含快取命中；輸出含推理 token。用來對照「省 token」的實際效果。
const apiUsageTotals={turns:0,input:0,output:0,cached:0,reasoning:0};
function recordApiUsage(usage){
  if(!usage||typeof usage!=='object')return;
  apiUsageTotals.turns++;
  for(const key of ['input','output','cached','reasoning'])apiUsageTotals[key]+=Number(usage[key])||0;
  renderApiUsage();
}
function renderApiUsage(){
  const el=$('apiUsageStatus');const t=apiUsageTotals;
  if(!el||!t.turns)return;
  const f=n=>n.toLocaleString();
  el.textContent=uiLanguage==='en'
    ?`API usage since launch (${t.turns} turns): input ${f(t.input)} (cached ${f(t.cached)}), output ${f(t.output)}${t.reasoning?` (reasoning ${f(t.reasoning)})`:''} tokens`
    :`本次開啟累計 API 用量（${t.turns} 回合）：輸入 ${f(t.input)}（快取命中 ${f(t.cached)}）、輸出 ${f(t.output)}${t.reasoning?`（含推理 ${f(t.reasoning)}）`:''} tokens`;
}
async function callAI(action=null) {
  if(slotWantsTemporaryChat(activeSlotId))throw new Error(uiText('臨時對話故事只能透過已確認的 Claude、ChatGPT 或 Gemini 官網進行；API 模式不會被當成臨時對話。'));
  const base=(state.apiBase||location.origin).replace(/\/$/,'');
  if (!base || base === 'about:blank') throw new Error('尚未設定 AI 後端網址');
  const connection=currentAiConnection();
  if(action===null) action=`__OPENING_STYLE__:${state.openingStyle}`;
  const historyWindow=state.responseMode==='quality'?4:2;
  const isOpening=!state.history.length&&String(action).startsWith('__OPENING_STYLE__:');
  const apiProfileBase=state.characterProfile===DEFAULT_CHARACTER_PROFILE
    ?(state.claudePersonaMode==='tsundere'?COMPACT_HIGH_TSUNDERE_CHARACTER_PROFILE:COMPACT_DEFAULT_CHARACTER_PROMPT)
    :String(state.characterProfile||'')+(state.claudePersonaMode==='tsundere'?'\n一般互動使用傲嬌濃度調高：嘴上挑剔、實際仔細做好；被看出用心時否認。重要問題維持準確與尊重，不可羞辱或操控。':'');
  // P1-05：API 也走同一條安全提示詞管線；危機由呼叫端本機攔截，這裡補低落陪伴與常駐安全段。
  const apiLowMood=!isOpening&&safetyModule.detectLowMood(action);
  const apiProfile=withSafetyPromptSupport(withCharacterBoundary(apiProfileBase),{lowMood:apiLowMood,language:uiLanguage});
  const requestBody={provider:state.provider,accountProfile:connection?.profileId||'',model:state.model,history:state.history.slice(-historyWindow),action,...(isOpening?{openingCustomPrompt:state.openingStyle===CUSTOM_OPENING_STYLE?String(state.openingCustomPrompt||'').slice(0,600):''}:{}),affection:state.affection,characterName:state.characterName||DEFAULT_CHARACTER_NAME,characterProfile:apiProfile+characterCardsUseText(),worldSetting:state.worldSetting===DEFAULT_WORLD_SETTING?'':state.worldSetting,storyTemplate:state.storyTemplate===DEFAULT_STORY_TEMPLATE?'':state.storyTemplate,storyMemory:String(state.storyMemory||'').slice(-1000),storyClock:realStoryClock(state.storyClock),pendingMilestone:state.pendingMilestone||'',pendingSpecialEvent:isOpening?'':normalizeSpecialEventKey(state.pendingSpecialEvent),storyEventSeen:normalizeSeenStoryEventFlags(state.storyEventSeen),specialEvent:isOpening?'':normalizeSpecialEventKey(state.pendingSpecialEvent),worldBook:normalizeWorldBook(state.worldBook),authorNote:normalizeAuthorNote(state.authorNote),promptTweaks:normalizePromptTweaks(state.promptTweaks),temperature:Number(state.temperature),topP:Number(state.topP),maxTokens:Number(state.maxTokens),responseMode:state.responseMode||'fast',language:uiLanguage,sceneMode:sceneMode};
  archivePrompt(JSON.stringify(requestBody,null,2),{mode:'api',provider:state.provider,model:state.model,title:'API 回合資料'});
  const r=await fetch(base+'/api/story',{method:'POST',headers:{'Content-Type':'application/json',...desktopApiHeaders(base)},body:JSON.stringify(requestBody)});
  if(!r.ok){let message='';try{const data=await r.json();message=data.error||data.message||JSON.stringify(data)}catch{message=await r.text()}const error=new Error(message||(uiLanguage==='en'?`AI connection failed (${r.status})`:`AI 連線失敗 (${r.status})`));error.status=r.status;throw error;}
  const data=await r.json();
  if(data&&typeof data==='object'){recordApiUsage(data._usage);delete data._usage;}
  return data;
}

function sanitizeChoices(list) {
  const seen=new Set(); return (Array.isArray(list)?list:[]).map(x=>String(x||'').trim()).filter(x=>x && x.length<=180).filter(x=>{const k=x.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true;}).slice(0,7);
}
function formatAffection(value){const safe=Number(value)||0;return Number.isInteger(safe)?String(safe):safe.toFixed(2);}
function clampAffectionDelta(value){
  const n=Number(value);
  if(!Number.isFinite(n))return 0;
  return Math.max(-5,Math.min(5,Math.round(n*100)/100));
}
// 追加八：關係階段變化（好感跨過語氣帶門檻）→ 顯示通知；升階時留下一次性的里程碑提示給下一回合提示詞。
function handleAffectionStageChange(beforeKey){
  const after=affectionStageOf(state.affection);
  if(!after||after.key===beforeKey)return;
  const risen=stageIndexByKey(after.key)>stageIndexByKey(beforeKey);
  if(risen){
    storyNoticeText=uiText('關係升溫：好感度進入「'+after.zh+'」階段。');
    state.pendingMilestone=after.key;
  }else{
    storyNoticeText=uiText('關係轉冷：好感度退回「'+after.zh+'」階段。');
  }
}
function applyTurn(r, role='ai') {
  // 追加九：回合回退快照——在套用之前記下「選擇點」的數值與歷史長度。
  // 之後任何一步 throw（例如選項不足 7 個）都不會寫入，符合「失敗回合不寫 undo」。
  const undoBefore={
    action:String(state.pendingAction||''),
    keepLen:0,
    affection:state.affection,
    affectionPityStart:state.affectionPityStart,
    memory:state.storyMemory,
    storyEmotion:state.storyEmotion||'neutral',
    storyEmotionIntensity:normalizeStoryEmotionIntensity(state.storyEmotionIntensity),
    storyEmotionToken:Math.max(0,Math.floor(Number(state.storyEmotionToken)||0)),
    choices:state.choices,
    storyClock:state.storyClock,
    pendingMilestone:state.pendingMilestone,
    pendingSpecialEvent:state.pendingSpecialEvent,
    storyEvent:state.storyEvent,
    storyEventToken:state.storyEventToken,
    storyEventSeen:normalizeSeenStoryEventFlags(state.storyEventSeen),
    goodnightDay:state.goodnightDay,
    rareGoodnightAt:state.rareGoodnightAt,
    bedroomSceneAt:state.bedroomSceneAt,
    bedroomSceneLabels:state.bedroomSceneLabels,
    albumUnlocked:state.albumUnlocked,
    letterEventTurns:state.letterEventTurns,
    ending:state.ending,
    giftConversations:state.giftConversations
  };
  // 開場＝整個重來（keepLen 0）；一般回合＝玩家行動那行之前（applyTurn 前一行必為玩家行動）。
  undoBefore.keepLen=undoBefore.action==='__OPENING__'?state.history.length:Math.max(0,state.history.length-1);
  // 好感增減幅度加大：AI 回傳 -5～+5 直接採用（測試切片相容，內聯計算不依賴外部 helper）。
  const stageBefore=affectionStageKeyOf(state.affection);
  storyNoticeText='';
  state.pendingMilestone='';
  const rawDelta=Number(r.affectionDelta);
  const boundedDelta=Number.isFinite(rawDelta)?Math.max(-5,Math.min(5,Math.round(rawDelta*100)/100)):0;
  // 非常簡單：絕不扣好感，且保底 1 小時內滿好感（依經過時間補足下限，滿 1 小時直接補滿）。
  // 其他難度：簡單扣分減半；中等原樣；困難加分打折、扣分加重；非常困難加分減半、扣分加重。
  let affectionDelta=boundedDelta;
  const level = state.difficulty === 'veryEasy' ? 'veryEasy'
    : state.difficulty === 'easy' ? 'easy'
    : state.difficulty === 'hard' ? 'hard'
    : state.difficulty === 'veryHard' ? 'veryHard' : 'normal';
  if (level === 'veryEasy') {
    if (!state.affectionPityStart) state.affectionPityStart=Date.now();
    const elapsed=Math.max(0,Date.now()-Number(state.affectionPityStart||Date.now()));
    const remaining=Math.max(0,100-Number(state.affection||0));
    affectionDelta = elapsed>=3600_000 ? remaining : Math.max(0,boundedDelta)+remaining*Math.min(1,elapsed/3600000)*0.2;
  } else if (level === 'easy') {
    affectionDelta = boundedDelta < 0 ? boundedDelta * 0.5 : boundedDelta;
  } else if (level === 'hard') {
    affectionDelta = boundedDelta < 0 ? boundedDelta * 1.3 : boundedDelta * 0.7;
  } else if (level === 'veryHard') {
    affectionDelta = boundedDelta < 0 ? boundedDelta * 1.5 : boundedDelta * 0.5;
  }
  state.affection=Math.max(0,Math.min(100,Number((state.affection+affectionDelta).toFixed(2))));
  // R50｜好感度歸 0＝遊戲結束：只留 Game Over 畫面（圖＋重新開始按鈕），選項清空、記一條結局。
  if(state.affection<=0&&state.history.length>=1){
    state.gameOver=true;
    state.choices=[];
    if(!state.ending){state.ending=true;state.history.push({role:'ending',text:uiText('好感度歸零，故事結束了。')});}
  }
  if (r.memory !== undefined) state.storyMemory = String(r.memory || '').slice(-1000);
  state.storyEmotion=normalizeStoryEmotion(r.emotion);
  state.storyEmotionIntensity=normalizeStoryEmotionIntensity(r.intensity);
  state.storyEmotionToken=Math.max(0,Math.floor(Number(state.storyEmotionToken)||0))+1;
  if (r.narration) state.history.push({role,text:r.narration});
  state.choices=sanitizeChoices(r.choices); if(state.choices.length<7) throw new Error('AI 回傳的選項不足 7 個');
  state.ending=!!r.ending;
  if(r.ending && r.endingText) state.history.push({role:'ending',text:r.endingText});
  handleAffectionStageChange(stageBefore);
  // 批4：story＝依 timeAdvance 推進；real＝依現實時刻重算（忽略 timeAdvance）；off＝不推進。
  const clock=normalizeStoryClock(state.storyClock);
  if (clock.mode==='story') state.storyClock=advanceStoryClock(clock,r.timeAdvance);
  else if (clock.mode==='real') state.storyClock=realStoryClock(clock);
  refreshTimeTheme();
  const eventClock=realStoryClock(state.storyClock);
  const narrationText=String(r.narration||'');
  const isNight=eventClock.enabled?eventClock.slot>=2:/夜晚|深夜|入夜|月夜|月色|月光|星空|燭光/.test(narrationText);
  lastTurnWasNight=isNight;
  const isBedroom=/臥室|寢室|睡前|床/.test(narrationText);
  lastTurnWasBedroom=isBedroom;
  state.storyEvent=undoBefore.action==='__OPENING__'?'':approveStoryEvent(r.eventFlag,{affection:state.affection,isNight,day:eventClock.enabled?eventClock.day:0,lastGoodnightDay:state.goodnightDay,seen:state.storyEventSeen});
  if(state.storyEvent){
    state.storyEventToken=Math.max(0,Math.floor(Number(state.storyEventToken)||0))+1;
    if(state.storyEvent==='goodnight')state.goodnightDay=eventClock.enabled?eventClock.day:0;
    if(state.storyEvent!=='letter')state.storyEventSeen=normalizeSeenStoryEventFlags([...state.storyEventSeen,state.storyEvent]);
  }
  state.lastTurnUndo={
    action:undoBefore.action,
    keepLen:undoBefore.keepLen,
    affection:undoBefore.affection,
    affectionPityStart:undoBefore.affectionPityStart,
    memory:undoBefore.memory,
    storyEmotion:undoBefore.storyEmotion,
    storyEmotionIntensity:undoBefore.storyEmotionIntensity,
    storyEmotionToken:undoBefore.storyEmotionToken,
    choices:sanitizeChoices(undoBefore.choices),
    storyClock:undoBefore.storyClock,
    pendingMilestone:undoBefore.pendingMilestone,
    pendingSpecialEvent:undoBefore.pendingSpecialEvent,
    storyEvent:undoBefore.storyEvent,
    storyEventToken:undoBefore.storyEventToken,
    storyEventSeen:undoBefore.storyEventSeen,
    goodnightDay:undoBefore.goodnightDay,
    rareGoodnightAt:undoBefore.rareGoodnightAt,
    bedroomSceneAt:undoBefore.bedroomSceneAt,
    bedroomSceneLabels:undoBefore.bedroomSceneLabels,
    albumUnlocked:undoBefore.albumUnlocked,
    letterEventTurns:undoBefore.letterEventTurns,
    ending:undoBefore.ending,
    giftConversations:undoBefore.giftConversations
  };
  // 特殊事件：本回合已消耗上一回合抽到的事件；成功套用後重新抽下一回合。
  // 序章、結局與關係里程碑回合不另外疊加約會事件，避免同一回合出現兩段特殊橋段。
  state.pendingSpecialEvent=(undoBefore.action==='__OPENING__'||state.ending||state.pendingMilestone)?'':rollSpecialEvent();
  // v4.6.34｜可選的「來自 Anthropic 的一封信」：每完成 2 個回合（不含序章）抽一次 1%。
  // 抽中只進入「好感度 0 的結局」狀態；affection 保留觸發當下數值，不歸零，只能重新開始故事。
  if(undoBefore.action!=='__OPENING__'&&!state.gameOver&&!state.ending){
    state.letterEventTurns=Math.max(0,Math.floor(Number(state.letterEventTurns)||0))+1;
    if(state.letterEventEnabled===true&&shouldTriggerAnthropicLetter(state.letterEventTurns,true)){
      state.history.push({role:'ending',text:letterEndingText(uiLanguage,state.affection)});
      Object.assign(state,letterEndingPatch());
    }
  }
  // D15：只這一回合的一般對話降級已完成，下一回合重新要求官網無痕對話。
  temporaryChatFallbackKey='';
  if (role === 'ai' && r.narration) {
    try {
      const lines = splitLines(r.narration);
      getStoryLineRunner().start(lines);
    } catch (_) {}
  }
}

function refreshGiftConversations(){
  const refreshed=rollGiftConversations();
  if(!refreshed.length)return;
  state.giftConversations=normalizeGiftConversations([...(state.giftConversations||[]),...refreshed]);
  for(const conversation of refreshed)state.history.push({role:'gift',text:uiLanguage==='en'?conversation.hintEn:conversation.hint});
}

// G43（WP5）：稀有晚安 CG。成功回合、render 後延遲判定；只有真的顯示才寫入 24 小時冷卻。
// 「存檔前 3 個回合」以本次啟動／讀檔／切換存檔後的前 3 個成功回合實作（暖機期）。
function resetRareGoodnightWarmup(){
  rareGoodnightWarmupTurns=RARE_GOODNIGHT_WARMUP_TURNS;
  rareGoodnightCheckToken++;
  lastTurnWasNight=null;
  lastTurnWasBedroom=null;
}
function currentAffectionValue(){
  const el=document.getElementById('affProgress');
  const n=Number(el?.value);
  if(Number.isFinite(n))return Math.max(0,Math.min(100,n));
  return Math.max(0,Math.min(100,Number(state.affection)||0));
}
function currentNightTone(){
  const tab=document.getElementById('tab-story');
  const tone=tab?.dataset.artTone||'';
  if(tone==='night')return true;
  if(tone&&tone!=='none')return false;
  // artTone 尚未由換圖更新時，用同一回合的 story clock／旁白補判。
  return lastTurnWasNight===true;
}
function currentBedroomLabel(){
  const label=document.querySelector('.stage-scene-label')?.textContent||'';
  if(/臥室|寢室|睡前|床/.test(label)) return label.trim();
  // 標籤未更新時，用本回合旁白的臥室關鍵字作為後備，避免功能完全失效。
  if(lastTurnWasBedroom) return '臥室場景';
  return '';
}
function maybeShowBedroomOrGoodnight(playerAction){
  const action=String(playerAction||'').trim();
  if(!action||action==='__OPENING__')return;
  if(busy||state.pendingAction||state.lastAiError)return;
  const tab=document.getElementById('tab-story');
  const affection=currentAffectionValue();
  const isNight=currentNightTone();
  const now=Date.now();
  const warmup=rareGoodnightWarmupTurns;
  if(rareGoodnightWarmupTurns>0)rareGoodnightWarmupTurns-=1;

  // 稀有晚安 CG 優先：同一回合兩者同時成立時只出現晚安 CG。
  const rareDecision=evaluateRareGoodnight({
    action,
    affection,
    isNight,
    now,
    lastShownAt:state.rareGoodnightAt,
    busy,
    gameOver:!!state.gameOver,
    ending:!!state.ending,
    textOnly:tab?.classList.contains('text-only')===true,
    warmupTurns:warmup,
    random:Math.random
  });
  if(rareDecision.show){
    const shown=window.__storyArt?.showRareGoodnight?.()===true;
    if(shown){ state.rareGoodnightAt=now; unlockAlbum('36685'); if(save())writeAutoSave(); }
    return;
  }

  const label=currentBedroomLabel();
  const bedroomDecision=evaluateBedroomScene({
    label,
    affection,
    isNight,
    now,
    lastShownAt:state.bedroomSceneAt,
    seenLabels:state.bedroomSceneLabels,
    busy,
    gameOver:!!state.gameOver,
    ending:!!state.ending,
    textOnly:tab?.classList.contains('text-only')===true,
    warmupTurns:warmup,
    random:Math.random
  });
  if(!bedroomDecision.show)return;
  const shown=window.__storyArt?.showBedroomScene?.(bedroomDecision.artId)===true;
  if(!shown)return;
  state.bedroomSceneAt=now;
  if(!state.bedroomSceneLabels.includes(label)) state.bedroomSceneLabels=[...state.bedroomSceneLabels,label];
  unlockAlbum(bedroomDecision.artId);
  if(save())writeAutoSave();
}
function scheduleRareGoodnightCheck(playerAction){
  const token=++rareGoodnightCheckToken;
  setTimeout(()=>{
    if(token!==rareGoodnightCheckToken)return;
    maybeShowBedroomOrGoodnight(playerAction);
  },250);
}

// 追加九：把快照還原到「選擇點」（重寫／刪除上一回合共用）。回傳 false＝快照無效。
function restoreTurnUndo(undo){
  const safe=normalizeLastTurnUndo(undo);
  if(!safe)return false;
  state.history=state.history.slice(0,safe.keepLen);
  state.affection=safe.affection;
  state.affectionPityStart=safe.affectionPityStart;
  state.storyMemory=safe.memory;
  state.storyEmotion=safe.storyEmotion;
  state.storyEmotionIntensity=safe.storyEmotionIntensity;
  state.storyEmotionToken=safe.storyEmotionToken;
  state.choices=safe.choices;
  state.storyClock=safe.storyClock;
  state.pendingMilestone=safe.pendingMilestone;
  state.pendingSpecialEvent=safe.pendingSpecialEvent;
  state.storyEvent=safe.storyEvent;
  state.storyEventToken=safe.storyEventToken;
  state.storyEventSeen=safe.storyEventSeen;
  state.goodnightDay=safe.goodnightDay;
  state.rareGoodnightAt=safe.rareGoodnightAt;
  state.bedroomSceneAt=safe.bedroomSceneAt;
  state.bedroomSceneLabels=safe.bedroomSceneLabels;
  state.albumUnlocked=safe.albumUnlocked;
  state.letterEventTurns=safe.letterEventTurns;
  state.ending=safe.ending;
  state.giftConversations=safe.giftConversations;
  state.lastTurnUndo=null;
  return true;
}
// 「↩ 重寫上一回合」：還原後用同一個行動重新生成一輪（網頁模式照常自動填入／送出）。
function rewriteLastTurn(){
  if(busy)return;
  const undo=normalizeLastTurnUndo(state.lastTurnUndo);
  if(!undo)return;
  const previous=snapshotForRollback(state);
  const action=undo.action;
  if(!restoreTurnUndo(undo))return;
  state.pendingAction='';
  state.webReply='';
  state.lastAiError='';
  storyNoticeText='';
  if(!save()){state=previous;render();return;}
  writeAutoSave();
  render();
  if(action==='__OPENING__')void opening();
  else void continueStory(action);
}
// 「🗑 刪除上一回合」：還原後停在選擇點（原本的 7 選項復原，可改選）。
function deleteLastTurn(){
  if(busy)return;
  const undo=normalizeLastTurnUndo(state.lastTurnUndo);
  if(!undo)return;
  if(!confirm(uiText('刪除上一回合？故事將回到上一個選擇點；之後可以重新選擇。')))return;
  const previous=snapshotForRollback(state);
  if(!restoreTurnUndo(undo))return;
  state.pendingAction='';
  state.webReply='';
  state.lastAiError='';
  storyNoticeText='';
  if(!save()){state=previous;render();return;}
  writeAutoSave();
  render();
  scrollDialogueIntoView();
}

function giveGift(conversationId,optionId){
  const conversation=(state.giftConversations||[]).find(item=>item.id===conversationId);
  const outcome=resolveGiftAffection(conversation,optionId,state.difficulty);
  if(!outcome)return;
  const selected=conversation.options.find(option=>option.id===optionId);
  const previous=snapshotForRollback(state);
  const stageBeforeGift=affectionStageKeyOf(state.affection);
  state.giftConversations=state.giftConversations.filter(item=>item.id!==conversationId);
  state.affection=Math.max(0,Math.min(100,Number((state.affection+outcome.delta).toFixed(2))));
  handleAffectionStageChange(stageBeforeGift);
  const deltaText=(outcome.delta>0?'+':'')+formatAffection(outcome.delta);
  const response=outcome.correct?uiText('她很喜歡這份禮物！好感度')+' '+deltaText:state.difficulty==='veryEasy'?uiText('她收下了這份禮物。非常簡單模式不會扣除好感度。'):uiText('這份禮物不太合她心意。好感度')+' '+deltaText;
  state.history.push({role:'gift-result',text:`${uiText('送出禮物')}：${uiLanguage==='en'?selected.nameEn:selected.name}。${response}`});
  if(!save()){state=previous;storyNoticeText='';render();return;}
  render();
  writeAutoSave();
  scrollDialogueIntoView();
}

async function opening(){
  if(busy) return;
  if(state.aiMode==='web') return beginWebTurn(null);
  const previous=snapshotForRollback(state);
  state.pendingAction='__OPENING__';
  state.lastAiError='';
  if(!save()){state=previous;render();return;}
  busy=true; render();
  try {
    const r=await callAI(null);
    state.history=[]; applyTurn(r);
    state.pendingAction=''; state.lastAiError='';
  } catch(e) {
    state=previous;
    state.pendingAction='__OPENING__';
    state.lastAiError=currentAiConnection()?aiErrorMessage(e):uiText('目前 API 模式沒有可用連線。請在設定新增或切換 API 帳號，或改用 AI 網頁版；完成 AI 演算後才會開始故事。');
    busy=false; save(); render();
    return;
  }
  busy=false;
  if(!save()){
    state=previous;
    state.pendingAction='__OPENING__';
    state.lastAiError='已收到 AI 回覆，但本機存檔空間不足，故事尚未開始。請先匯出存檔或釋出空間，再重試。';
  } else {
    writeAutoSave();
  }
  render();
}

// P1-05：本機安全回應。危機訊息不寫進玩家欄位、不呼叫 applyTurn；
// 只留一則安全回覆，所以好感、時鐘、選項與結局狀態都不變。玩家可按原選項或自由輸入繼續。
function showCrisisSafetyResponse({defer=false}={}){
  const apply=()=>{
    const response=safetyModule.generateSafetyResponse(uiLanguage);
    state.pendingAction='';
    state.webReply='';
    state.lastAiError='';
    state.history.push({role:'ai',kind:'safety',text:response.text});
    storyNoticeText=uiLanguage==='en'
      ?'This turn has been paused. Please take care of yourself first; when you are ready, continue from the existing choices or type your own action.'
      :'已先暫停這一回合。先照顧自己；準備好時，再從原本的選項或自由輸入繼續。';
    if(save())writeAutoSave();
    render();
    scrollDialogueIntoView();
  };
  if(defer||busy){setTimeout(apply,0);return;}
  apply();
}
async function continueStory(action){
  if(busy || state.ending) return;
  const playerAction = String(action || '').trim();
  if(state.pendingAction && state.pendingAction!==playerAction) return;
  if(!playerAction) return;
  // P1-05：第一層攔截——危機訊息不送 AI、不扣好感、不推進時鐘；只顯示本機安全回應。
  if(safetyModule.detectCrisis(playerAction)){showCrisisSafetyResponse();return;}
  if(state.aiMode==='web') return beginWebTurn(playerAction);
  const previous=snapshotForRollback(state);
  state.pendingAction=playerAction;
  state.lastAiError='';
  if(!save()){state=previous;render();return;}
  busy=true; render();
  try {
    // 不先改寫 state.history。把「目前完整歷史 + 本回合玩家行動」一次交給所選模型，
    // 等模型成功產生結果後，再以固定順序寫回：玩家行動 → AI 故事正文。
    const r=await callAI(playerAction);
    state.history.push({role:'user',text:playerAction});
    applyTurn(r);
    if(!state.ending)refreshGiftConversations();
    state.pendingAction=''; state.lastAiError='';
  } catch(e) {
    state=previous;
    state.pendingAction=playerAction;
    state.lastAiError=aiErrorMessage(e);
  }
  busy=false;
  let turnSaved=false;
  if(!save()){
    state=previous;
    state.pendingAction=playerAction;
    state.lastAiError='已收到 AI 回覆，但本機存檔空間不足，故事尚未前進。請先匯出存檔或釋出空間，再重試。';
  } else {
    writeAutoSave();
    turnSaved=true;
  }
  render();
  if(turnSaved)scheduleRareGoodnightCheck(playerAction);
}

async function retryPendingWithMode(mode){
  if(busy||!state.pendingAction||!['api','web'].includes(mode))return;
  const action=state.pendingAction;
  const previous={...state};
  state.aiMode=mode;
  state.webReply='';
  if(!save()){state=previous;render();return;}
  if(mode==='web') return beginWebTurn(action==='__OPENING__'?null:action);
  if(action==='__OPENING__') return opening();
  return continueStory(action);
}

function aiErrorMessage(error){
  const detail=String(error?.message||(uiLanguage==='en'?'AI connection failed':'AI 連線失敗'));
  if(error?.status===429||/RESOURCE_EXHAUSTED|rate.?limit|quota|too many requests|usage limit/i.test(detail)) return `AI 服務回報額度或速率限制。請等供應商額度恢復，或在「設定 → AI 帳號與 API 連線」切換到你有權使用且符合供應商條款的帳號，再回來重試。App 不會自動輪換帳號。\n\n${detail}`;
  if(error?.status===401||error?.status===403||/invalid api key|authentication|unauthorized|permission denied/i.test(detail))return `AI 帳號驗證失敗或沒有此模型權限。請到「設定 → AI 帳號與 API 連線」更新官方 API Key／權限；也可改用官方網站免費版。本回合和存檔都保留。\n\n${detail}`;
  if(error?.status===404||/model.{0,30}(not found|does not exist|unsupported)|unknown model/i.test(detail))return `所選模型可能已停用，或此帳號無權使用。請在 AI 模型選單改選該服務支援的模型，然後重試同一回合。\n\n${detail}`;
  if(error?.status===408||/timed out|timeout|逾時/i.test(detail))return `AI 回覆等待逾時，故事沒有前進。本回合已保存；可重試、改用另一個模型，或使用網頁免費版完成同一回合。\n\n${detail}`;
  if(/fetch failed|network|econn|enotfound|socket/i.test(detail))return `目前無法連到 AI 服務。請檢查網路、後端網址和服務狀態；故事與本回合都已保存，恢復連線後可直接重試。也可改用官方網站免費版。\n\n${detail}`;
  return `AI 沒有成功完成這一回合，故事尚未前進；請確認服務、模型及連線設定後重試，或改用官方網站免費版。本回合已保存。\n\n${detail}`;
}

function exportData(){
  save();
  // 臨時對話存檔也隨匯出帶走（匯入端會重新發 id 變成一般手動格）。
  const exportSlots=slots;
  const exportActiveId=exportSlots.some(s=>s.id===activeSlotId)?activeSlotId:(exportSlots[0]?.id||'');
  const payload={format:'claude-novel-save',version:2,exportedAt:new Date().toISOString(),slots:exportSlots.map(s=>{const safeState=stripCredentials(s.id===activeSlotId?serializeState():s.state);delete safeState.aiConnectionId;return {...s,state:safeState};}),activeSlotId:exportActiveId};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const file=new File([blob],(uiLanguage==='en'?'claude-novel-story-':'claude-娘-故事-')+new Date().toISOString().slice(0,10)+'.json',{type:'application/json'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){ navigator.share({title:uiLanguage==='en'?'Claude娘 story save':'Claude娘故事存檔',text:uiLanguage==='en'?'My Claude娘 story data':'我的 Claude娘故事資料',files:[file]}).catch(()=>{}); return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=file.name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importData(file){
  if(!file) return;
  if(busy){alert(uiText('AI 正在生成；請等這一回合完成後再匯入存檔。'));return;}
  try{
    const payload=JSON.parse(await file.text());
    if(busy){alert(uiText('AI 正在生成；請等這一回合完成後再匯入存檔。'));return;}
    if(payload?.format!=='claude-novel-save' || !Array.isArray(payload.slots)) throw new Error('不是有效的 Claude娘故事存檔');
    const imported=payload.slots.map(normalizeSlot).filter(Boolean);
    if(!imported.length) throw new Error('檔案沒有可用存檔');
    if(!confirm(uiText('將匯入 ')+imported.length+uiText(' 個存檔。現有存檔不會直接刪除，是否繼續？'))) return;
    if(!save()) return;
    const previousSlots=slots, previousActiveSlotId=activeSlotId;
    const previousActiveStorageId=localStorage.getItem('claude_novel_active_slot_v1');
    if(!confirmLeaveIncognito()) return;
    const existing=new Set(slots.map(x=>x.id));
    for(const slot of imported){
      // 匯入檔不得挾帶臨時對話專用格：一律改發新 id、回到一般手動格（temporaryChat 旗標保留）。
      if(slot.kind==='incognito'||String(slot.id)===INCOGNITO_SLOT_ID){slot.id='slot_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);slot.kind='manual';}
      while(existing.has(slot.id)) slot.id='slot_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
      existing.add(slot.id);
    }
    const nextActiveSlotId=imported[0].id;
    slots=[...slots,...imported];
    if(!persistSlots()){slots=previousSlots;return;}
    try{localStorage.setItem('claude_novel_active_slot_v1',nextActiveSlotId);}
    catch(e){
      slots=previousSlots; persistSlots(); activeSlotId=previousActiveSlotId;
      try{if(previousActiveStorageId===null)localStorage.removeItem('claude_novel_active_slot_v1');else localStorage.setItem('claude_novel_active_slot_v1',previousActiveStorageId);}catch{}
      throw e;
    }
    activeSlotId=nextActiveSlotId;
    state={...fresh(),...(imported[0].state||{})};
    resetRareGoodnightWarmup();
    settings(); render(); alert(uiText('故事資料已匯入'));
  }catch(e){ alert(uiText('匯入失敗：')+(e.message||uiText('檔案格式錯誤'))); }
}
$('exportBtn').onclick=exportData;
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=e=>{const f=e.target.files?.[0]; importData(f); e.target.value='';};
const albumLightboxClose=$('albumLightboxClose'); if(albumLightboxClose) albumLightboxClose.onclick=closeAlbumLightbox;
const albumLightbox=$('albumLightbox'); if(albumLightbox) albumLightbox.onclick=e=>{if(e.target===albumLightbox)closeAlbumLightbox();};
document.querySelectorAll('[data-language-select]').forEach(select=>{select.onchange=()=>{uiLanguage=select.value==='en'?'en':'zh';localStorage.setItem(LANGUAGE_KEY,uiLanguage);settings();render();};});
$('sceneMode').onchange=()=>{sceneMode=$('sceneMode').value==='offer'?'offer':'text';localStorage.setItem(SCENE_MODE_KEY,sceneMode);render();};
$('sceneImageBtn').onclick=requestSceneIllustration;
$('importSceneImageBtn').onclick=()=>$('sceneImageFile').click();
$('importLatestImageBtn').onclick=importLatestDownloadedImage;
$('portraitToggleBtn').onclick=togglePortraitOverScene;
$('removeSceneImageBtn').onclick=removeSceneIllustration;
// ── G12.5 背景調整：自訂背景／明暗／柔焦（純附加、不改舊行為）──
(function(){
  const KEY='cioudo.bgAdjust';
  const stage=document.querySelector('.vn-stage');
  if(!stage)return;
  const sceneImg=$('sceneGeneratedImage');
  const st={data:'',dim:100,blur:0};
  try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw)||{};if(typeof o.data==='string'&&o.data.indexOf('data:image/')===0)st.data=o.data;const d=+o.dim;if(isFinite(d))st.dim=Math.max(40,Math.min(100,Math.round(d)));const b=+o.blur;if(isFinite(b))st.blur=Math.max(0,Math.min(8,Math.round(b)));}}catch{}
  const bg=document.createElement('div');bg.id='g13CustomBg';bg.hidden=!st.data;
  stage.insertBefore(bg,stage.firstChild);
  const dim=document.createElement('div');dim.id='g13BgDim';
  if(sceneImg&&sceneImg.parentElement===stage)sceneImg.after(dim);else stage.appendChild(dim);
  const dimRange=$('bgDimRange'),blurRange=$('bgBlurRange'),dimVal=$('bgDimVal'),blurVal=$('bgBlurVal');
  function save(){try{localStorage.setItem(KEY,JSON.stringify(st));}catch{}}
  function apply(){
    if(st.data){bg.style.backgroundImage='url("'+st.data+'")';bg.hidden=false;}else{bg.style.backgroundImage='';bg.hidden=true;}
    document.documentElement.style.setProperty('--g12-bg-blur',st.blur+'px');
    dim.style.opacity=String(((100-st.dim)/100*.7).toFixed(3));
    if(dimRange)dimRange.value=String(st.dim);
    if(blurRange)blurRange.value=String(st.blur);
    if(dimVal)dimVal.textContent=st.dim+'%';
    if(blurVal)blurVal.textContent=String(st.blur);
  }
  if(dimRange)dimRange.addEventListener('input',()=>{st.dim=Math.max(40,Math.min(100,+dimRange.value||100));apply();save();});
  if(blurRange)blurRange.addEventListener('input',()=>{st.blur=Math.max(0,Math.min(8,+blurRange.value||0));apply();save();});
  $('customBgBtn').onclick=()=>$('customBgInput').click();
  $('customBgInput').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;const rd=new FileReader();rd.onload=()=>{if(typeof rd.result==='string'&&rd.result.indexOf('data:image/')===0){st.data=rd.result;apply();save();}};rd.readAsDataURL(f);};
  $('clearCustomBgBtn').onclick=()=>{st.data='';apply();save();};
  apply();
})();
$('sceneImageFile').onchange=e=>{const file=e.target.files?.[0];e.target.value='';importSceneIllustration(file);};
$('responseModeBtn').onclick=toggleResponseMode;
$('promptModeBtn').onclick=togglePromptMode;
$('promptMode').onchange=()=>setPromptMode($('promptMode').value);
$('storyEditBtn').onclick=openStoryEditDialog;
$('storyEditSaveBtn').onclick=saveStoryEditDialog;
$('storyEditCancelBtn').onclick=closeStoryEditDialog;
$('storyEditResetBtn').onclick=resetStoryEditDialog;
$('storyEditAdvancedBtn').onclick=()=>{closeStoryEditDialog();document.querySelector('.tab-btn[data-tab="workshop"]')?.click();};
$('sheetAddCardBtn').onclick=addCharacterCard;
$('sheetDeleteCardBtn').onclick=deleteCharacterCard;
$('sheetEditBtn').onclick=openSheetEditDialog;
$('sheetEditSaveBtn').onclick=saveSheetEditDialog;
$('sheetEditCancelBtn').onclick=closeSheetEditDialog;
$('sheetEditResetBtn').onclick=resetSheetEditDialog;
$('sheetAddStatBtn').onclick=addSheetStatRow;
$('sheetAddSectionBtn').onclick=addSheetSectionRow;
$('sheetEditStats').addEventListener('click',removeSheetRowFromEvent);
$('sheetEditSections').addEventListener('click',removeSheetRowFromEvent);
// ==== SECTION 15｜圖片拖放與貼上匯入 ====
function pickDroppedImage(transfer) {
  if(!transfer) return null;
  for(const file of Array.from(transfer.files||[])) if(/^image\//i.test(file.type)) return file;
  for(const item of Array.from(transfer.items||[])){
    if(item.kind==='file'&&/^image\//i.test(item.type)){const file=item.getAsFile();if(file) return file;}
  }
  return null;
}
document.addEventListener('paste',event=>{
  if(!$('tab-story')?.classList.contains('active')) return;
  const file=pickDroppedImage(event.clipboardData);
  if(!file) return;
  const target=event.target;
  const inTextField=target instanceof HTMLElement&&(target.isContentEditable||target.matches('textarea,input:not([type=file]):not([type=checkbox]):not([type=radio])'));
  // 剪貼簿同時有文字時，把貼上留給輸入欄，避免攔截回覆 JSON 或自訂行動。
  if(inTextField&&String(event.clipboardData.getData('text/plain')||'').trim()) return;
  event.preventDefault();
  importSceneIllustration(file);
});
(function bindSceneImageDrop(){
  const stage=document.querySelector('.vn-stage');
  const hasFiles=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  if(stage){
    for(const name of ['dragenter','dragover']) stage.addEventListener(name,event=>{
      if(!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect='copy';
      stage.classList.add('drop-active');
    });
    stage.addEventListener('dragleave',event=>{if(!stage.contains(event.relatedTarget)) stage.classList.remove('drop-active');});
    stage.addEventListener('drop',event=>{
      if(!hasFiles(event)) return;
      event.preventDefault();
      stage.classList.remove('drop-active');
      const file=pickDroppedImage(event.dataTransfer);
      if(file) importSceneIllustration(file);
      else $('sceneImageStatus').textContent=uiText('拖入的檔案不是圖片。');
    });
  }
  // 沒拖進舞台時也擋掉瀏覽器／Electron 預設的「直接開啟檔案」行為。
  for(const name of ['dragover','drop']) document.addEventListener(name,event=>{if(hasFiles(event)) event.preventDefault();});
})();
bindDesktopSceneImages();
$('changeCharacterPortraitBtn').onclick=()=>{if(!busy)$('characterPortraitInput').click();};
$('characterPortraitInput').onchange=e=>{const file=e.target.files?.[0];e.target.value='';void updateCharacterPortrait(file);};
$('resetCharacterPortraitBtn').onclick=restoreCharacterPortrait;
$('saveProfileCharacterNameBtn').onclick=()=>{if(!busy)saveProfileCharacterName();};
$('resetProfileCharacterNameBtn').onclick=()=>{if(!busy)resetProfileCharacterName();};
$('profileCharacterNameInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(!busy)saveProfileCharacterName();}};
$('saveProfileWorldBtn').onclick=()=>{if(!busy)saveProfileWorldSetting();};
$('resetProfileWorldBtn').onclick=()=>{if(!busy)resetProfileWorldSetting();};
$('saveProfileProfileBtn').onclick=()=>{if(!busy)saveProfileProfile();};
$('resetProfileProfileBtn').onclick=()=>{if(!busy)resetProfileProfile();};
$('restartBtn').onclick=restartCurrentStory;
$('exitRestartStoryBtn').onclick=restartCurrentStory;
// 暫停中也能直接建立存檔點：複製目前進度成新存檔，故事留在原地繼續。
$('exitCheckpointBtn').onclick=()=>{void createCheckpointSlot();};
// R50｜Game Over 的唯一選項：好感度歸 0 → 只能重新開始故事（點按鈕即選擇，不再 confirm）。
$('gameOverRestartBtn').onclick=()=>{
  if(busy)return;
  pauseStoryForExit();
  state=restartBaseState();
  render();
  refreshTimeTheme();
  save(true);
};
// v4.6.33｜Anthropic 信件結局同樣只有「重新開始故事」，不提供繼續或讀取舊進度的出口。
$('anthropicLetterRestartBtn').onclick=()=>{
  if(busy)return;
  pauseStoryForExit();
  state=restartBaseState();
  render();
  refreshTimeTheme();
  save(true);
};
$('resumeStoryBtn').onclick=resumeStory;
$('exitOpenSlotsBtn').onclick=openStorySlots;
$('storySaveHudBtn').onclick=openStorySlots;
$('exitStoryHudBtn').onclick=leaveStory;
$('exitStoryMenuBtn').onclick=leaveStory;
$('quickSaveBtn').onclick=()=>quickSave();
$('quickLoadBtn').onclick=()=>quickLoad();
$('storyTextShrinkBtn').onclick=()=>stepStoryTextSize(-1);
$('storyTextGrowBtn').onclick=()=>stepStoryTextSize(1);
// HUD 的 A−／A+ 控制介面縮放（整個介面一起變大變小）；設定頁的 A−／A+ 維持故事字級。
$('storyTextShrinkQuickBtn').onclick=()=>stepWebUiZoom(-1);
$('storyTextGrowQuickBtn').onclick=()=>stepWebUiZoom(1);
// 設定頁的故事字級百分比標籤可點：回到 100%。HUD 的百分比標籤點一下重設介面縮放。
for(const id of ['storyTextSizeLabel']){
  const label=$(id);
  if(!label)continue;
  label.setAttribute('role','button');
  label.setAttribute('tabindex','0');
  label.setAttribute('title',uiText('點一下重設為 100%'));
  label.setAttribute('aria-label',uiText('點一下重設為 100%'));
  label.style.cursor='pointer';
  const reset=()=>resetStoryTextSize();
  label.addEventListener('click',reset);
  label.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();reset();}});
}
// 介面縮放控制：HUD 的 A−／A＋ 與百分比標籤（自適應／點一下在手動 100% 與自適應間切換）。
(()=>{
  const label=$('storyTextQuickSizeLabel');
  if(!label)return;
  label.setAttribute('role','button');
  label.setAttribute('tabindex','0');
  label.style.cursor='pointer';
  // 文字與提示由 applyWebUiZoom() 依「自適應／手動」狀態填寫，這裡再補一次確保初始狀態正確。
  applyWebUiZoom();
  const reset=()=>resetWebUiZoom();
  label.addEventListener('click',reset);
  label.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();reset();}});
})()
$('quickThemeBtn').onclick=()=>{applyThemePreference(nextThemeChoice(storedThemeChoice()));};
$('saveStoryBtn').onclick=checkpointStory;
$('closeSlotPickerBtn').onclick=()=>$('slotPickerDialog').close();
$('newSlotFromCheckpointBtn').onclick=()=>{$('slotPickerDialog').close();createCheckpointSlot();};
$('overwriteSlotBtn').onclick=()=>{const picked=document.querySelector('input[name="slotPick"]:checked');overwriteSlot(picked?.value);};
$('promptHistoryBtn').onclick=showPromptHistory;
$('closePromptHistoryBtn').onclick=()=>$('promptHistoryDialog').close();
$('copyPromptHistoryBtn').onclick=async()=>{const text=$('promptHistoryText').value;if(!text){alert(uiText('目前存檔尚無提示詞記錄。'));return;}try{await writeClipboardText(text);alert(uiText('提示詞已複製。'));}catch(error){alert(uiText('複製失敗：')+(error.message||''));}};
$('modelSelect').onchange=()=>{
  const previous=serializeState(),selected=$('modelSelect').value;
  syncActiveModelOptions();
  if(selected==='custom::__custom__'){
    $('customModelBox').hidden=false;$('customModelProvider').value=state.provider;$('customModelName').value='';$('customModel').value=state.model;
    state.aiMode='api';if(currentAiConnection()?.provider!==state.provider)state.aiConnectionId=null;
    if(!save()){state=previous;settings();return;}updateModelParameterSupport();updateAiPicker();renderAiConnections();return;
  }
  if(selected.startsWith('saved::')){
    const model=state.customModels[Number(selected.slice(7))];if(!model){settings();return;}
    state.provider=model.provider;state.model=model.model;applyModelOptions(model.provider,model.model);
  }else{
    const [provider,model]=selected.split('::');state.provider=provider;state.model=model;
    applyModelOptions(provider,model);
  }
  state.aiMode='api';if(currentAiConnection()?.provider!==state.provider)state.aiConnectionId=null;
  if(!save()){state=previous;settings();return;}
  settings();renderAiConnections();updateAiPicker();
};
$('addAiAccountBtn').onclick=()=>showAiAccountForm();
$('saveAiAccountBtn').onclick=saveAiConnection;
$('cancelAiAccountBtn').onclick=()=>{$('aiConnectionForm').hidden=true;$('aiApiKey').value='';};
$('openProviderConsoleBtn').onclick=()=>openProviderConsole($('aiProviderSelect').value);
$('aiProviderSelect').onchange=()=>renderAiConnectGuide($('aiProviderSelect').value);
$('webAiProvider').onchange=()=>{state.webProvider=normalizeWebAIProvider($('webAiProvider').value);save();settings();};
$('openAiWebsiteBtn').onclick=()=>void openWebLoginFromSettings();
$('webAiDirectLoginLink').onclick=event=>{event.preventDefault();void openWebLoginFromSettings();};
// 全視窗（R47）：按鈕或 F11 切換全螢幕；主程序回報狀態，body.is-fullscreen 時調整版面（立繪不被對話框擋到）。
$('fullscreenToggleBtn').onclick=()=>{void window.claudeDesktop?.toggleFullScreen?.();};
window.claudeDesktop?.onWindowFullscreen?.(fullscreen=>{
  document.body.classList.toggle('is-fullscreen',Boolean(fullscreen));
  const btn=$('fullscreenToggleBtn');
  if(btn){btn.title=fullscreen?uiText('離開全視窗（F11）'):uiText('全視窗（F11）');btn.setAttribute('aria-label',btn.title);}
});
document.addEventListener('keydown',event=>{
  if(event.key!=='F11')return;
  event.preventDefault();
  void window.claudeDesktop?.toggleFullScreen?.();
});
$('webOpenLoginBtn').onclick=()=>void openWebLoginFromSettings();
// 設定頁也能一鍵強制重讀官網模型清單（不必開待辦面板）；結果寫到登入與接入的狀態列。
$('webRefreshModelsBtn').onclick=async()=>{
  const status=$('webConnectionStatus');
  try{
    if(status)status.textContent=uiText('正在讀取官網模型清單…');
    const ok=await loadWebSiteModels({force:true});
    if(status)status.textContent=ok?uiText('官網模型清單已更新；待辦回合的面板會顯示最新清單。'):uiText('官網模型清單暫時讀不到；請確認已登入後再試。');
  }catch(error){
    if(status)status.textContent=uiText('讀取失敗：')+uiErrorText(ipcMessage(error,'請稍後再試。'));
  }
};
// 新增／切換 Google 帳號：開 Google「帳號選擇器」頁，由使用者本人登入/挑選帳號。
$('webSwitchAccountBtn').onclick=()=>void switchGoogleAccountFromSettings();
// R51｜「開啟 Gemini 時先選帳號」開關：同步到主程序與 localStorage（預設開）。
const askAccountToggle=$('askAccountToggle');
if(askAccountToggle){
  askAccountToggle.checked=askGoogleAccount;
  askAccountToggle.onchange=()=>{
    askGoogleAccount=askAccountToggle.checked;
    try{localStorage.setItem(ASK_GOOGLE_ACCOUNT_KEY,askGoogleAccount?'on':'off');}catch{}
    window.claudeDesktop?.setAskGoogleAccount?.(askGoogleAccount);
  };
}
$('webCheckConnectionBtn').onclick=()=>void checkWebConnection();
$('webRestartAutomationBtn').onclick=()=>void restartAutomationBrowserFromSettings();
$('enableWebAiBtn').onclick=()=>{if(busy)return;state.aiMode='web';state.webProvider=normalizeWebAIProvider($('webAiProvider').value);save();settings();render();if(state.pendingAction)beginWebTurn(state.pendingAction==='__OPENING__'?null:state.pendingAction);};
 $('enableApiAiBtn').onclick=async()=>{
   if(busy)return;
   const expectedState=state,expectedSlotId=activeSlotId;
   try{await window.claudeDesktop?.restoreWebCompanionLayout();}catch{}
   if(state!==expectedState||activeSlotId!==expectedSlotId)return;
   const action=state.pendingAction;
   state.aiMode='api';
   if(!save())return;
   settings();render();
   if(action)retryPendingWithMode('api');
 };
$('refreshAiStatusBtn').onclick=refreshAiStatus;
$('modelCheckBtn').onclick=()=>void runModelCheck();
$('saveSettings').onclick=()=>{
  const selected=$('modelSelect').value;let provider=state.provider,model=state.model;
  if(selected.startsWith('saved::')){const preset=state.customModels[Number(selected.slice(7))];if(!preset)return alert(uiText('找不到所選的自訂模型。'));provider=preset.provider;model=preset.model;}
  else if(selected==='custom::__custom__'){provider=$('customModelProvider').value;model=$('customModel').value.trim();}
  else [provider,model]=selected.split('::');
  if(!model)return alert(uiText('請輸入 Model ID'));
  state.provider=provider;state.model=model;state.aiMode='api';if(currentAiConnection()?.provider!==provider)state.aiConnectionId=null;
  state.apiBase=$('apiBase').value.trim()||defaultApiBase();Object.assign(state,captureModelOptions());syncActiveModelOptions();
  if(!save())return;settings();render();refreshAiStatus();alert(uiText('AI 設定已儲存')+'\n'+uiText('回覆策略：')+(state.responseMode==='fast'?uiText('很快回覆'):uiText('優先保持回覆品質')));
};
$('newSlotBtn').onclick=async()=>{if(busy)return;const name=await openPromptDialog({title:'新存檔名稱',value:uiText('新存檔')}); if(name!==null) await createSlot(name);};
$('aiPickerBtn').onclick=openAiPicker;
document.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('tab-'+b.dataset.tab).classList.add('active');const exitScreen=$('storyExitScreen');if(exitScreen)exitScreen.hidden=!storyExited||b.dataset.tab!=='story';if(b.dataset.tab==='settings'){settings();refreshAiStatus();}if(b.dataset.tab==='story'&&!state.history.length&&!state.pendingAction)renderOpeningSetup($('choices'));if(b.dataset.tab==='workshop')fillWorkshopSettings();if(b.dataset.tab==='profile'){renderCharacterName();renderWorldSetting();renderProfileProfile();renderCharacterSheet();applyUiLanguage();}});

$('saveWorkshopBtn').onclick=saveWorkshopSettings;
$('resetWorkshopBtn').onclick=resetWorkshopSettings;
$('workshopCodeEditor').oninput=()=>{workshopCodeDirty=true;};
$('workshopCodeFile').onchange=()=>{
  if(workshopCodeDirty&&!confirm(uiText('目前程式碼尚未保存，切換檔案會放棄這次編輯。是否繼續？'))){$('workshopCodeFile').value=workshopCurrentFile;return;}
  loadWorkshopSource();
};
$('openWorkshopCodePathBtn').onclick=openWorkshopFileFromPath;
$('refreshWorkshopCodeListBtn').onclick=()=>refreshWorkshopFileList();
$('loadWorkshopCodeBtn').onclick=()=>{
  if(workshopCodeDirty&&!confirm(uiText('目前程式碼尚未保存，重新載入會放棄這次編輯。是否繼續？')))return;
  loadWorkshopSource(true,true);
};
$('saveWorkshopCodeBtn').onclick=saveWorkshopCodeEdit;
  $('applyWorkshopCodeBtn').onclick=applyWorkshopCodeToSource;
  $('rebuildWorkshopCodeBtn').onclick=rebuildFromWorkshop;
$('resetWorkshopCodeBtn').onclick=()=>{if(confirm(uiText('還原此檔會刪除目前保存的程式碼修改。是否繼續？')))restoreWorkshopCodeFile();};
$('exportWorkshopCodeBtn').onclick=exportWorkshopCode;

$('temperature').oninput=()=>{$('temperatureVal').textContent=Number($('temperature').value).toFixed(2)};
$('temperature').onchange=saveVisibleModelOptions;
$('topP').oninput=()=>{$('topPVal').textContent=Number($('topP').value).toFixed(2)};
$('topP').onchange=saveVisibleModelOptions;
$('maxTokens').onchange=saveVisibleModelOptions;
// ==== SECTION 16｜快速控制、對話編輯、網頁自動化開關與剪貼簿接回（故事畫面快捷：快速／詳細切換、人設與世界觀編輯）====
function renderStoryQuickControls() {
  const button=$('responseModeBtn');
  if(!button) return;
  const detailed=state.responseMode==='quality';
  button.textContent=detailed?'✦ 詳細回覆':'⚡ 快速回覆';
  button.setAttribute('aria-pressed',String(detailed));
  const promptButton=$('promptModeBtn');
  if(promptButton){
    const saving=state.promptMode==='saving';
    promptButton.textContent=uiText(saving?'✂ 提示詞：節省':'✂ 提示詞：標準');
    promptButton.setAttribute('aria-pressed',String(saving));
  }
}
function toggleResponseMode() {
  if(busy) return;
  const next=state.responseMode==='quality'?'fast':'quality';
  // 走與設定頁下拉選單完全相同的路徑，避免兩邊對同一個模型保存出不同結果。
  $('responseMode').value=next;
  $('responseMode').onchange();
  $('sceneImageStatus').textContent=uiText(next==='quality'
    ?'已切換為詳細回覆：提示詞帶入較多近期對話與記憶，下一回合生效。'
    :'已切換為快速回覆：提示詞帶入較少近期對話，較省額度，下一回合生效。');
}
function togglePromptMode() {
  if(busy) return;
  setPromptMode(state.promptMode==='saving'?'standard':'saving');
}
// 切換「標準／節省」：存檔後同步三個地方（工具列按鈕、設定頁選單、待辦回合面板）並回報字元數。
function setPromptMode(next) {
  const saving=next==='saving';
  state.promptMode=saving?'saving':'standard';
  if(!save()) return;
  const select=$('promptMode'); if(select) select.value=state.promptMode;
  renderStoryQuickControls();
  const action=state.pendingAction==='__OPENING__'?null:(state.pendingAction||null);
  const report=webPromptSizeReport(action);
  render();
  // 狀態列訊息要在 render() 之後寫：render() 會把狀態列重設成預設文字（同 toggleResponseMode 的做法）。
  $('sceneImageStatus').textContent=uiLanguage==='en'
    ?(saving
      ?`Saving mode on: prompt ~${report.saving} chars (standard ~${report.current}). Narration length and the seven choices are unchanged; applies next turn.`
      :`Standard mode on: prompt ~${report.current} chars (saving mode ~${report.saving}). Applies next turn.`)
    :(saving
      ?`已切換為節省模式：提示詞約 ${report.saving} 字元（標準約 ${report.current}）。正文長度與七個選項不變，下一回合生效。`
      :`已切換為標準模式：提示詞約 ${report.current} 字元（節省模式約 ${report.saving}）。下一回合生效。`);
}
function fillStoryEditDialog() {
  $('storyEditName').value=state.characterName||DEFAULT_CHARACTER_NAME;
  $('storyEditProfile').value=state.characterProfile||DEFAULT_CHARACTER_PROFILE;
  $('storyEditClaudeMode').value=normalizeClaudePersonaMode(state.claudePersonaMode);
  $('storyEditWorld').value=state.worldSetting||DEFAULT_WORLD_SETTING;
  $('storyEditRules').value=state.storyTemplate||DEFAULT_STORY_TEMPLATE;
}
function openStoryEditDialog() {
  const dialog=$('storyEditDialog');
  if(!dialog||typeof dialog.showModal!=='function'){
    document.querySelector('.tab-btn[data-tab="workshop"]')?.click();
    return;
  }
  fillStoryEditDialog();
  $('storyEditStatus').textContent='';
  if(!dialog.open) dialog.showModal();
  $('storyEditProfile').focus();
}
function closeStoryEditDialog() {
  const dialog=$('storyEditDialog');
  if(dialog?.open) dialog.close();
}
function saveStoryEditDialog() {
  const name=normalizeCharacterName($('storyEditName').value);
  if(!name){$('storyEditStatus').textContent=uiText('請設定角色名稱。');return;}
  state.characterName=name;
  state.characterProfile=$('storyEditProfile').value.trim().slice(0,10000)||DEFAULT_CHARACTER_PROFILE;
  state.claudePersonaMode=normalizeClaudePersonaMode($('storyEditClaudeMode').value);
  state.worldSetting=$('storyEditWorld').value.trim().slice(0,10000)||DEFAULT_WORLD_SETTING;
  state.storyTemplate=$('storyEditRules').value.trim().slice(0,10000)||DEFAULT_STORY_TEMPLATE;
  if(!save()){render();return;}
  fillWorkshopSettings();
  render();
  closeStoryEditDialog();
  $('sceneImageStatus').textContent=uiText('設定已保存到目前存檔，下一回合起套用。');
}
function resetStoryEditDialog() {
  if(!confirm(uiText('恢復預設內容？目前存檔的角色、世界觀與劇情模板將重設；故事進度不會刪除。'))) return;
  $('storyEditName').value=DEFAULT_CHARACTER_NAME;
  $('storyEditProfile').value=DEFAULT_CHARACTER_PROFILE;
  $('storyEditClaudeMode').value='standard';
  $('storyEditWorld').value=DEFAULT_WORLD_SETTING;
  $('storyEditRules').value=DEFAULT_STORY_TEMPLATE;
  saveStoryEditDialog();
}
// ── 角色卡（角色頁下方）：主要角色卡 state.characterSheet＋額外角色卡 state.characterCards。
// R40：角色卡可「多選使用」——勾選的角色卡（state.characterCardIds）會併入 AI 人設提示詞，
// 與主角同台演出；編輯對話框用下拉選擇要改哪張卡（主要角色卡或任一額外卡）。
function normalizeCharacterCards(raw){
  if(!Array.isArray(raw))return [];
  return raw.slice(0,12).map(card=>{
    if(!card||typeof card!=='object')return null;
    const sheet=normalizeCharacterSheet(card)||{tagline:'',quote:'',stats:[],sections:[]};
    return {id:String(card.id||('card_'+Date.now()+'_'+Math.random().toString(36).slice(2,7))),name:String(card.name||'').trim().slice(0,60)||'角色',...sheet};
  }).filter(Boolean);
}
function characterCardsList(){return normalizeCharacterCards(state.characterCards);}
function usedCharacterCardIds(){return new Set((Array.isArray(state.characterCardIds)?state.characterCardIds:[]).map(String));}
function selectedCharacterCards(){const used=usedCharacterCardIds();return characterCardsList().filter(card=>used.has(card.id));}
function toggleCharacterCardUse(id,use){
  const set=usedCharacterCardIds();
  if(use)set.add(String(id));else set.delete(String(id));
  state.characterCardIds=[...set];
  if(!save())return;
  render();
}
// 編輯對話框的目標：''＝主要角色卡；其他＝該張額外卡的 id。
let sheetEditTargetId='';
function sheetEditTargetCard(){return sheetEditTargetId?characterCardsList().find(card=>card.id===sheetEditTargetId)||null:null;}
function renderCharacterCardsBar(){
  const bar=$('characterCardsBar');
  if(!bar)return;
  const cards=characterCardsList();
  const used=usedCharacterCardIds();
  bar.replaceChildren();
  for(const card of cards){
    const chip=document.createElement('label');
    chip.className='card-chip'+(used.has(card.id)?' active':'');
    const box=document.createElement('input');
    box.type='checkbox';
    box.checked=used.has(card.id);
    box.title=uiText('參與故事（可多選）');
    box.onchange=()=>toggleCharacterCardUse(card.id,box.checked);
    const nameSpan=document.createElement('span');
    nameSpan.textContent=card.name;
    chip.append(box,nameSpan);
    bar.append(chip);
  }
  const del=$('sheetDeleteCardBtn');
  if(del)del.hidden=!cards.length;
}
function addCharacterCard(){
  const cards=characterCardsList();
  if(cards.length>=12){alert(uiText('角色卡最多 12 張，請先刪除不需要的。'));return;}
  const sheet=normalizeCharacterSheet(state.characterSheet)||{tagline:'',quote:'',stats:[],sections:[]};
  const card={id:'card_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),name:uiText('新角色'),...sheet};
  state.characterCards=[...cards,card];
  if(!save()){render();return;}
  render();
  // 開啟編輯對話框並把「編輯目標」鎖在這張新卡：使用者填的名字/內容會存進新卡
  //（舊版在這裡把目標清空，導致第一次改名寫到主要角色卡）。
  sheetEditTargetId=card.id;
  openSheetEditDialog();
}
function deleteCharacterCard(){
  // 刪除目標：編輯對話框正在編的卡；沒有時刪最後一張（讓「刪除角色卡」隨時可用）。
  const cards=characterCardsList();
  const card=sheetEditTargetCard()||cards[cards.length-1];
  if(!card)return;
  if(!confirm(uiText('刪除這張角色卡？')+'\n'+card.name))return;
  state.characterCards=characterCardsList().filter(item=>item.id!==card.id);
  const used=usedCharacterCardIds();
  used.delete(card.id);
  state.characterCardIds=[...used];
  if(!save())return;
  render();
}
function renderCharacterSheet(){
  const host=$('characterSheet');
  if(!host)return;
  renderCharacterCardsBar();
  const sheet=normalizeCharacterSheet(state.characterSheet)||DEFAULT_CHARACTER_SHEET;
  host.innerHTML=[
    sheet.tagline?'<p class="tagline">'+esc(sheet.tagline)+'</p>':'',
    sheet.quote?'<p class="quote">'+esc(sheet.quote)+'</p>':'',
    sheet.stats.length?'<div class="stat-grid">'+sheet.stats.map(item=>'<div class="stat">'+(item.label?'<small>'+esc(item.label)+'</small>':'')+esc(item.value)+'</div>').join('')+'</div>':'',
    sheet.sections.length?'<div class="divider">✦</div>':'',
    sheet.sections.map(item=>(item.title?'<h2 class="sec">'+esc(item.title)+'</h2>':'')+(item.body?'<p class="sec-body">'+esc(item.body)+'</p>':'')).join(''),
    '<p class="sheet-credit">'+esc(uiText('預設角色形象：此形象來自 B站ZipZipPipe；此形象使用 CC BY-NC-SA 4.0 協議。'))+'</p>'
  ].join('');
  // 勾選「參與故事」的角色卡：角色頁列出摘要，提示詞由 characterCardsUseText() 併入。
  const used=selectedCharacterCards();
  if(used.length){
    const box=document.createElement('div');
    box.innerHTML='<div class="divider">✦</div><h2 class="sec">'+esc(uiText('參與故事的角色'))+'</h2>'
      +used.map(card=>'<p class="sec-body">【'+esc(card.name)+'】'+esc(card.tagline||'')+'</p>').join('');
    host.append(box);
  }
}
function sheetStatRows(){return [...$('sheetEditStats').querySelectorAll('.sheet-edit-stat')];}
function sheetSectionRows(){return [...$('sheetEditSections').querySelectorAll('.sheet-edit-section')];}
function makeSheetStatRow(label='',value=''){
  const row=document.createElement('div');row.className='sheet-edit-row sheet-edit-stat';
  const nameLabel=document.createElement('label');nameLabel.textContent='欄位名稱';
  const nameInput=document.createElement('input');nameInput.className='sheet-stat-label';nameInput.maxLength=30;nameInput.value=label;nameLabel.append(nameInput);
  const valueLabel=document.createElement('label');valueLabel.textContent='欄位內容';
  const valueInput=document.createElement('input');valueInput.className='sheet-stat-value';valueInput.maxLength=200;valueInput.value=value;valueLabel.append(valueInput);
  const remove=document.createElement('button');remove.type='button';remove.className='sheet-row-del';remove.textContent='🗑 刪除';
  row.append(nameLabel,valueLabel,remove);
  return row;
}
function makeSheetSectionRow(title='',body=''){
  const row=document.createElement('div');row.className='sheet-edit-row sheet-edit-section';
  const titleLabel=document.createElement('label');titleLabel.textContent='段落標題';
  const titleInput=document.createElement('input');titleInput.className='sheet-sec-title';titleInput.maxLength=40;titleInput.value=title;titleLabel.append(titleInput);
  const remove=document.createElement('button');remove.type='button';remove.className='sheet-row-del';remove.textContent='🗑 刪除';
  const bodyLabel=document.createElement('label');bodyLabel.textContent='段落內容';
  const bodyInput=document.createElement('textarea');bodyInput.className='sheet-sec-body';bodyInput.rows=3;bodyInput.maxLength=4000;bodyInput.value=body;bodyLabel.append(bodyInput);
  row.append(titleLabel,remove,bodyLabel);
  return row;
}
function fillSheetEditDialog(){
  // 目標下拉：主要角色卡＋每一張額外角色卡；切換目標就載入該張卡的內容。
  const cards=characterCardsList();
  const select=$('sheetEditCardSelect');
  if(select){
    select.replaceChildren();
    const mainOption=document.createElement('option');
    mainOption.value='';
    mainOption.textContent=uiText('主要角色卡');
    select.append(mainOption);
    for(const card of cards){
      const option=document.createElement('option');
      option.value=card.id;
      option.textContent=card.name;
      select.append(option);
    }
    if(!cards.some(card=>card.id===sheetEditTargetId))sheetEditTargetId='';
    select.value=sheetEditTargetId;
    select.onchange=()=>{sheetEditTargetId=select.value;fillSheetEditDialog();};
  }
  const card=sheetEditTargetCard();
  const sheet=card||normalizeCharacterSheet(state.characterSheet)||DEFAULT_CHARACTER_SHEET;
  $('sheetEditCardName').value=card?card.name:'';
  $('sheetEditTagline').value=sheet.tagline;
  $('sheetEditQuote').value=sheet.quote;
  $('sheetEditStats').replaceChildren(...sheet.stats.map(item=>makeSheetStatRow(item.label,item.value)));
  $('sheetEditSections').replaceChildren(...sheet.sections.map(item=>makeSheetSectionRow(item.title,item.body)));
}
function openSheetEditDialog(){
  const dialog=$('sheetEditDialog');
  if(!dialog||typeof dialog.showModal!=='function')return;
  fillSheetEditDialog();
  $('sheetEditStatus').textContent='';
  if(!dialog.open)dialog.showModal();
  applyUiLanguage();
  $('sheetEditTagline').focus();
}
function closeSheetEditDialog(){
  const dialog=$('sheetEditDialog');
  if(dialog?.open)dialog.close();
}
function saveSheetEditDialog(){
  const fields={
    tagline:$('sheetEditTagline').value,
    quote:$('sheetEditQuote').value,
    stats:sheetStatRows().map(row=>({label:row.querySelector('.sheet-stat-label').value,value:row.querySelector('.sheet-stat-value').value})),
    sections:sheetSectionRows().map(row=>({title:row.querySelector('.sheet-sec-title').value,body:row.querySelector('.sheet-sec-body').value}))
  };
  const card=sheetEditTargetCard();
  const previous=state.characterSheet,previousCards=state.characterCards;
  if(card){
    state.characterCards=characterCardsList().map(item=>item.id===card.id?{...item,name:String($('sheetEditCardName').value||'').trim().slice(0,60)||item.name,...normalizeCharacterSheet(fields)}:item);
  }else{
    state.characterSheet=normalizeCharacterSheet(fields);
  }
  if(!save()){state.characterSheet=previous;state.characterCards=previousCards;render();return;}
  render();
  closeSheetEditDialog();
}
function resetSheetEditDialog(){
  const card=sheetEditTargetCard();
  if(card){
    // 額外角色卡的「恢復預設」＝刪除這張卡。
    if(!confirm(uiText('刪除這張角色卡？')+'\n'+card.name)) return;
    const previousCards=state.characterCards;
    state.characterCards=characterCardsList().filter(item=>item.id!==card.id);
    const used=usedCharacterCardIds();
    used.delete(card.id);
    state.characterCardIds=[...used];
    sheetEditTargetId='';
    if(!save()){state.characterCards=previousCards;render();return;}
    render();
    fillSheetEditDialog();
    return;
  }
  if(!confirm(uiText('恢復預設角色卡？目前存檔的標語、名言、外觀欄位與介紹段落將重設。'))) return;
  const previous=state.characterSheet;
  state.characterSheet=null;
  if(!save()){state.characterSheet=previous;render();return;}
  fillSheetEditDialog();
  render();
  closeSheetEditDialog();
}
function addSheetStatRow(){
  const box=$('sheetEditStats');
  if(sheetStatRows().length>=8){$('sheetEditStatus').textContent=uiText('外觀欄位最多 8 格，請先刪除不需要的欄位。');return;}
  $('sheetEditStatus').textContent='';
  box.append(makeSheetStatRow('',''));
  applyUiLanguage();
  box.lastElementChild.querySelector('.sheet-stat-label').focus();
}
function addSheetSectionRow(){
  const box=$('sheetEditSections');
  if(sheetSectionRows().length>=12){$('sheetEditStatus').textContent=uiText('介紹段落最多 12 段，請先刪除不需要的段落。');return;}
  $('sheetEditStatus').textContent='';
  box.append(makeSheetSectionRow('',''));
  applyUiLanguage();
  box.lastElementChild.querySelector('.sheet-sec-title').focus();
}
function removeSheetRowFromEvent(event){
  const button=event.target.closest('.sheet-row-del');
  if(button)button.closest('.sheet-edit-row').remove();
}
$('responseMode').onchange=()=>{
  Object.assign(state,captureModelOptions());
  syncActiveModelOptions();save();updateModelParameterSupport();
  render();
};
// 追加十 A/C/D：自動化的白話狀態、保底重試與自檢。狀態階段代碼由主程序送來，這裡翻成白話。
function webAutoStatusForEvent(event){
  const stage=String(event?.stage||'');
  const brief=webAutoStatusDetail==='brief';
  switch(stage){
    case 'watching':
      if(event?.submitted)return uiText('已自動送出；等待官網回覆，完成後會自動接回。');
      return brief?uiText('自動化監看中…'):uiText('自動化正在監看官網回覆，完成後會自動接回。');
    case 'harvesting':
      return brief?uiText('正在取回官網回覆…'):uiText('官網回覆完成了，正在取回接續…');
    case 'harvested':
      return uiText('已取回官網回覆，正在接回故事。');
    case 'retrying':
      return brief?uiText('正在自動重試…'):uiText('官網暫時沒有回應，正在自動重試…');
    case 'needs-login':
      return event?.provider==='anthropic'
        ?uiText('請在剛開啟的外部 Chrome／Edge 視窗完成 Claude 登入；登入後這一回合會自動繼續，也能改用手動貼上。App 不會預設任何帳號。')
        :uiText('請在剛開啟的外部 Chrome／Edge 視窗完成 Google 登入；登入後這一回合會自動繼續，也能改用手動貼上。不需要 Windows PIN。');
    case 'needs-temporary-chat':
      return event?.provider==='anthropic'
        ?uiText('已登入 Claude，但尚未確認無痕對話。請在 Claude 官網切換到無痕對話；確認後這一回合會自動送出。')
        :uiText('已登入官網，但尚未確認臨時對話。請在官網切換到臨時對話；確認後這一回合會自動送出。');
    case 'stalled':
      if(event?.reason==='send')return uiText('提示詞已填入官網，但官網沒有送出（送出鈕沒有反應）。請在官網按一次送出，之後仍會自動接回。');
      if(event?.reason==='conflict')return uiText('官網輸入框裡有您自己的未送出文字，自動化不會覆蓋。請清空輸入框後按「重新準備」，或直接手動貼上送出。');
      return uiText('官網一直找不到可用的輸入框，自動化已停止。請確認已登入並停在對話頁，再按「重新準備」。');
    case 'timeout':
      return uiText('自動化等待逾時，已停止監看；可以用下方的貼上面板手動接回。');
    case 'gave-up':
      return uiText('自動化重試沒有成功，已停止監看；可以用下方的貼上面板手動接回。');
    default:
      return '';
  }
}
let webAutoHealthReportTextFor=(result)=>{
  if(!result||result.ok===false){
    const reason=result&&result.error?uiErrorText(String(result.error)):uiText('官網視窗或分頁還沒開好');
    return uiText('自動化自檢：')+reason+'。'+uiText('可以先照手動流程操作，不影響故事。');
  }
  const report=result.report||{};
  const parts=[];
  parts.push(report.editor?uiText('輸入框✓'):uiText('輸入框：找不到（請先在官網登入）'));
  parts.push(report.sendButton?uiText('送出鈕✓'):uiText('送出鈕：找不到（會改用 Enter 送出）'));
  parts.push(report.replyNodes>0?uiText('回覆區✓'):uiText('回覆區：送出後自動偵測'));
  if(report.loginForm&&!report.editor)parts.push(uiText('這看起來是登入頁：請先登入一次。'));
  return uiText('自動化自檢：')+parts.join('，')+'。';
};
async function runWebAutoHealthCheck(){
  const api=window.claudeDesktop?.webAutoHealth;
  if(!api||state.aiMode!=='web'||webAutoHealthRunning)return false;
  webAutoHealthRunning=true;
  const expectedState=state,slotId=activeSlotId;
  try{
    const result=await api({provider:normalizeWebAIProvider(state.webProvider),mode:normalizeWebBrowserMode(webBrowserMode,state.webProvider)});
    if(state!==expectedState||activeSlotId!==slotId)return false;
    webAutoStatusText=webAutoHealthReportTextFor(result);
    webAutoStatusStage='health';
    render();
    return true;
  }catch(error){
    if(state!==expectedState||activeSlotId!==slotId)return false;
    webAutoStatusText=webAutoHealthReportTextFor({ok:false,error:String(error?.message||error||'')});
    render();
    return false;
  }finally{
    webAutoHealthRunning=false;
  }
}
// 追加十 A 修正：回合開始時先「佔位」，宣告本回合的自動化啟動由 prepareWebPrompt 獨家負責。
// 原因：beginWebTurn／switchPendingWebProvider 會先 render 一次，若不在這裡先佔位，
// render→syncWebAutoFlow 會搶先啟動一次（submit:true），prepareWebPrompt 隨後又啟動一次，
// 同一回合就會送出兩次（Enter 後備路徑實測到的雙送）。佔位壓 20 秒；prepareWebPrompt 成功
// 會立即解除（retryAt=0），失敗則沿用原本 20 秒自動重試節奏。使用者手動切換開關
// （applyWebAutoFlow）會清掉佔位：那是明確意圖，本回合立刻依新設定重新同步。
function claimWebAutoTurn(){
  webAutoFlowBaseKey=`${activeSlotId}|${state.pendingAction}|${normalizeWebAIProvider(state.webProvider)}|${normalizeWebBrowserMode(webBrowserMode,state.webProvider)}`;
  webAutoFlowRetryAt=Date.now()+20000;
}
function scheduleWebAutoRetry(delay=20000){
  // 自動化的保底計時器：就算使用者不再碰畫面，時間到也會自己再試一次（只在同一待辦回合內）。
  setTimeout(()=>{if(webAutoFlow&&!storyExited&&state.aiMode==='web'&&Boolean(state.pendingAction)&&!busy)syncWebAutoFlow();},delay);
}
function syncWebAutoFlow(){
  // 只在「網頁模式＋有待辦回合＋自動化開啟」時監看；關閉或回合結束立刻停止。
  // 兩種模式都帶上本回合提示詞：登入頁沒有輸入框時，主程序會持續等待並在登入後填入送出。
  const api=window.claudeDesktop?.setWebAutoFlow;
  const active=Boolean(webAutoFlow)&&webAutoSendArmed&&state.aiMode==='web'&&Boolean(state.pendingAction)&&!isAndroidApp()&&Boolean(api)&&!storyExited;
  if(!active){
    if(webAutoFlowActive&&api){webAutoFlowActive=false;webAutoFlowBaseKey='';void api({enabled:false}).catch(()=>{});}
    webAutoFlowRetryAt=0;
    if(!state.pendingAction)webAutoSendArmed=false;
    if(!storyExited){webAutoFlowSubmitted=false;webAutoFlowWatchOnly=false;webAutoWatchRetryCount=0;webAutoLastTurnKey='';}
    return;
  }
  const provider=normalizeWebAIProvider(state.webProvider),mode=normalizeWebBrowserMode(webBrowserMode,provider);
  const baseKey=`${activeSlotId}|${state.pendingAction}|${provider}|${mode}`;
  // 換回合（新待辦）＝新一輪自動化：重試計數與「只准重新監看」標記歸零；同一回合內才累計（追加十 A）。
  if(webAutoLastTurnKey!==baseKey){webAutoLastTurnKey=baseKey;webAutoWatchRetryCount=0;webAutoFlowWatchOnly=false;}
  if(webAutoFlowActive&&baseKey===webAutoFlowBaseKey)return;
  // 已自動送出、監看重試又用盡：不再自動重啟（重填會把同一回合送出第二次），保留手動貼上面板。
  if(webAutoFlowSubmitted&&!webAutoFlowWatchOnly&&webAutoWatchRetryCount>=webAutoRetryLimit)return;
  // 啟動失敗（例如官網視窗還沒開）時最多每 20 秒重試一次；啟動中先佔位，避免同一個畫面週期重複啟動。
  if(baseKey===webAutoFlowBaseKey&&Date.now()<webAutoFlowRetryAt)return;
  const previousBaseKey=webAutoFlowBaseKey;
  webAutoFlowBaseKey=baseKey;
  webAutoFlowRetryAt=Date.now()+20000;
  const watchOnly=webAutoFlowWatchOnly||webAutoFlowSubmitted;
  // 內建模式（例如回合中途打開自動化開關）：帶上本回合提示詞，主程序會先確認輸入框
  // 內容就是它（已填入不重填、空著就補填、殘留別的舊文字則不送）才送出。
  const syncPrompt=watchOnly?'':makeWebPrompt(state.pendingAction==='__OPENING__'?null:state.pendingAction);
  // 已送出過的回合重試只准「重新監看」：不帶提示詞、不送出（追加十 A：最後一階才是手動保底）。
  void api({enabled:true,submit:!watchOnly,prompt:watchOnly?'':syncPrompt,provider,mode}).then(result=>{
    if(result&&result.ok){webAutoFlowActive=true;webAutoFlowRetryAt=0;}
    else{webAutoFlowBaseKey=previousBaseKey;scheduleWebAutoRetry();}
  }).catch(()=>{webAutoFlowBaseKey=previousBaseKey;scheduleWebAutoRetry();});
}
function applyWebAutoFlow(value){
  webAutoFlow=value!=='off';
  localStorage.setItem(WEB_AUTO_FLOW_KEY,webAutoFlow?'on':'off');
  // 使用者手動切換開關＝明確意圖：清掉回合佔位，讓本回合立刻依新設定重新同步一次。
  webAutoFlowBaseKey='';webAutoFlowRetryAt=0;
  syncWebAutoFlow();
  settings();render();
}
function stopWebClipboardMonitor(){
  if(webClipboardMonitorTimer)clearInterval(webClipboardMonitorTimer);
  webClipboardMonitorTimer=null;webClipboardMonitorSlotId='';webClipboardMonitorAction='';webClipboardLastText='';webClipboardMonitorStartedAt=0;
}
function syncWebClipboardMonitor(){
  const desktopRead=window.claudeDesktop?.readPendingClipboard;
  const canRead=Boolean(desktopRead||isAndroidApp()||navigator.clipboard?.readText);
  if(!canRead||!state.pendingAction||state.aiMode!=='web'||busy||storyExited){stopWebClipboardMonitor();return;}
  if(webClipboardMonitorTimer&&webClipboardMonitorSlotId===activeSlotId&&webClipboardMonitorAction===state.pendingAction)return;
  stopWebClipboardMonitor();
  const expectedSlotId=activeSlotId,expectedAction=state.pendingAction,expectedState=state;
  webClipboardMonitorSlotId=expectedSlotId;webClipboardMonitorAction=expectedAction;webClipboardMonitorStartedAt=Date.now();
  let baselineReady=false;
  const poll=async()=>{
    if(webClipboardMonitorBusy||state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction||state.aiMode!=='web'||busy||storyExited){
      if(state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction||state.aiMode!=='web'||busy||storyExited)stopWebClipboardMonitor();
      return;
    }
    webClipboardMonitorBusy=true;
    try{
      const value=desktopRead?await desktopRead():await readClipboardText();
      if(state!==expectedState||activeSlotId!==expectedSlotId||state.pendingAction!==expectedAction||state.aiMode!=='web')return;
      const text=String(value||'');
      if(!baselineReady){webClipboardLastText=text;baselineReady=true;return;}
      if(text===webClipboardLastText)return;
      webClipboardLastText=text;
      if(text&&isCompleteWebReply(text))applyWebReply(text);
    }catch{
      // Clipboard permissions differ by OS and browser; the manual paste field remains available.
    }finally{webClipboardMonitorBusy=false;}
  };
  webClipboardMonitorTimer=setInterval(()=>void poll(),850);
  void poll();
}
async function readClipboardReply(){
  if(storyExited||!state.pendingAction||state.aiMode!=='web'||busy||manualClipboardPasteInProgress)return;
  manualClipboardPasteInProgress=true;
  const expectedState=state;
  const expectedAction=state.pendingAction;
  try{
    const reply=window.claudeDesktop?.readManualClipboard
      ? await window.claudeDesktop.readManualClipboard()
      : await readClipboardText();
    if(state!==expectedState||state.pendingAction!==expectedAction||state.aiMode!=='web')return;
    const text=String(reply||'');
    applyWebReply(text);
  }catch(error){
    if(state!==expectedState||state.pendingAction!==expectedAction)return;
    state.lastAiError=`無法讀取剪貼簿：${error.message||'請先在官方網站複製完整回覆。'}`;
    save();
    render();
  }finally{
    manualClipboardPasteInProgress=false;
  }
}
// ==== SECTION 17｜GALGAME 選單與覆蓋層（遊戲選單 ☰、存檔・讀檔、場景與插圖、回想）====
// 追加九前置大改版：整個主畫面是遊戲舞台；本區只做選單與覆蓋層的開關。
// 分頁切換沿用上方 SECTION 16 的 .tab-btn 通用監聽；故事與存檔流程完全不受影響。
let gameMenuOpen = false;
function setGameMenu(open) {
  gameMenuOpen = Boolean(open);
  const menu = $('gameMenu');
  if (menu) menu.hidden = !gameMenuOpen;
  const btn = $('gameMenuBtn');
  if (btn) btn.setAttribute('aria-expanded', String(gameMenuOpen));
  if (gameMenuOpen) showGameMenuView('gmMenuMain');
}
function showGameMenuView(id) {
  for (const view of ['gmMenuMain', 'gmMenuSlots', 'gmMenuScene', 'gmMenuDict', 'gmMenuData']) {
    const el = $(view);
    if (el) el.hidden = view !== id;
  }
}
function setBacklogOpen(open) {
  storyLogOpen = Boolean(open);
  render();
}
// ── 追加九：辭典（世界書）／作者註記／資料包 —— GALGAME 選單頁專用 ──
function openAuthorNote(){
  const dialog=$('authorNoteDialog');
  if(!dialog)return;
  $('authorNoteToggle').checked=normalizeAuthorNote(state.authorNote).enabled;
  $('authorNoteText').value=normalizeAuthorNote(state.authorNote).text;
  updateAuthorNoteCount();
  $('authorNoteStatus').textContent='';
  dialog.showModal();
}
function updateAuthorNoteCount(){
  const text=$('authorNoteText'),count=$('authorNoteCount');
  if(!text||!count)return;
  count.textContent=uiText('目前 ')+String(text.value.length)+uiText(' / 600 字');
}
function worldBookPhase(){return state.history.length?'chat':'opening';}
function worldBookPreviewHaystack(){
  const recent=state.history.slice(-6).map(x=>String(x.text||'')).join('\n');
  const pending=state.pendingAction&&state.pendingAction!=='__OPENING__'?String(state.pendingAction):'';
  return recent+'\n'+pending;
}
const WORLD_BOOK_PRIORITY_LABELS=Object.freeze({high:'高',normal:'中',low:'低'});
const WORLD_BOOK_SCOPE_LABELS=Object.freeze({all:'全部',chat:'對話',opening:'開場'});
function renderWorldBook(){
  const book=normalizeWorldBook(state.worldBook);
  const master=$('worldBookToggle');
  if(master)master.checked=book.enabled;
  const count=$('worldBookCount');
  document.querySelectorAll('#worldBookFilter [data-filter]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.filter===worldBookFilter));});
  const list=$('worldBookList');
  const needle=worldBookSearch.trim().toLowerCase();
  const visible=[];
  let enabledCount=0;
  for(let index=0;index<book.entries.length;index++){
    const entry=book.entries[index];
    if(entry.enabled)enabledCount++;
    if(!list)continue;
    if(worldBookFilter==='on'&&!entry.enabled)continue;
    if(worldBookFilter==='off'&&entry.enabled)continue;
    if(worldBookFilter==='const'&&!entry.constant)continue;
    if(needle){
      const searchableText=(entry.keywords.length?entry.text+'\n'+entry.keywords.join('\n'):entry.text).toLowerCase();
      if(!searchableText.includes(needle))continue;
    }
    visible.push({entry,index});
  }
  if(count)count.textContent=uiText('共 ')+book.entries.length+uiText(' 條（上限 50）')+'・'+uiText('啟用中')+' '+enabledCount;
  if(!list)return;
  if(!book.entries.length){
    list.innerHTML='<p class="dict-empty">'+uiText('還沒有條目——從「＋ 新增」開始，或匯入一本世界書。')+'</p>';
  }else if(!visible.length){
    list.innerHTML='<p class="dict-empty">'+(needle?uiText('沒有符合「')+esc(worldBookSearch.trim())+uiText('」的條目。'):uiText('目前篩選沒有條目。'))+'</p>';
  }else{
    list.innerHTML=visible.map(({entry,index})=>{
      const title=entry.keywords.length?entry.keywords[0]:uiText(entry.constant?'常駐':'（無觸發詞）');
      let preview='',previewChars=0;
      for(const character of entry.text){if(previewChars===120){preview+='…';break;}preview+=character;previewChars++;}
      const chips=entry.keywords.length
        ?entry.keywords.slice(0,3).map(word=>'<span class="dict-chip">'+esc(word)+'</span>').join('')+(entry.keywords.length>3?'<span class="dict-chip dict-chip-more">+'+String(entry.keywords.length-3)+'</span>':'')
        :'<span class="dict-chip dict-chip-none">'+esc(uiText(entry.constant?'常駐':'（無觸發詞）'))+'</span>';
      const priority=WORLD_BOOK_PRIORITY_LABELS[entry.priority]||'中';
      const scope=WORLD_BOOK_SCOPE_LABELS[entry.scope]||'全部';
      const badges=(entry.constant?'<span class="dict-badge dict-badge-const">⭐ '+esc(uiText('常駐'))+'</span>':'')
        +'<span class="dict-badge">'+esc(uiText(priority))+'</span>'
        +(entry.scope!=='all'?'<span class="dict-badge">'+esc(uiText(scope))+'</span>':'');
      return '<div class="dict-card'+(entry.enabled?'':' dict-card-off')+'">'
        +'<div class="dict-card-head">'
        +'<button type="button" class="dict-entry-toggle" data-wb-toggle="'+index+'" aria-pressed="'+String(entry.enabled)+'">'+(entry.enabled?'ON':'OFF')+'</button>'
        +'<span class="dict-card-title">'+esc(title)+'</span>'
        +'<span class="dict-card-actions">'
        +'<button type="button" class="dict-edit" data-wb-edit="'+index+'">✎</button>'
        +'<button type="button" class="dict-edit dict-copy" data-wb-copy="'+index+'">⧉</button>'
        +'<button type="button" class="dict-del" data-wb-del="'+index+'">🗑</button>'
        +'</span></div>'
        +'<div class="dict-card-badges">'+badges+'</div>'
        +'<div class="dict-card-chips">'+chips+'</div>'
        +'<p class="dict-card-text">'+esc(preview)+'</p>'
        +'</div>';
    }).join('');
  }
  list.querySelectorAll('[data-wb-toggle]').forEach(button=>{button.onclick=()=>toggleWorldBookEntry(Number(button.dataset.wbToggle));});
  list.querySelectorAll('[data-wb-edit]').forEach(button=>{
    button.setAttribute('aria-label',uiText('編輯條目'));
    button.setAttribute('title',uiText('編輯條目'));
    button.onclick=()=>openWorldBookEdit(Number(button.dataset.wbEdit));
  });
  list.querySelectorAll('[data-wb-copy]').forEach(button=>{
    button.setAttribute('aria-label',uiText('複製條目'));
    button.setAttribute('title',uiText('複製條目'));
    button.onclick=()=>copyWorldBookEntry(Number(button.dataset.wbCopy));
  });
  list.querySelectorAll('[data-wb-del]').forEach(button=>{
    button.setAttribute('aria-label',uiText('刪除條目'));
    button.setAttribute('title',uiText('刪除條目'));
    button.onclick=()=>deleteWorldBookEntry(Number(button.dataset.wbDel));
  });
  const preview=$('worldBookPreview');
  if(preview){
    const result=worldBookPreview(book,worldBookPreviewHaystack(),uiLanguage,{phase:worldBookPhase()});
    preview.textContent=uiText('命中 ')+result.count+uiText(' 條・約 ')+result.chars+uiText(' 字（上限 8 條／1500 字）')+(result.truncated?uiText('（部分截斷）'):'');
  }
  renderWorldBookTest();
}
function toggleWorldBookEntry(index){
  const previous=normalizeWorldBook(state.worldBook);
  const book=normalizeWorldBook(state.worldBook);
  if(!book.entries[index])return;
  book.entries[index]={...book.entries[index],enabled:!book.entries[index].enabled};
  state.worldBook=book;
  if(!save()){state.worldBook=previous;return;}
  renderWorldBook();
  settings();
}
function openWorldBookEdit(index){
  const book=normalizeWorldBook(state.worldBook);
  worldBookEditIndex=Number.isInteger(index)&&index>=0&&index<book.entries.length?index:-1;
  const entry=worldBookEditIndex>=0?book.entries[worldBookEditIndex]:null;
  worldBookDraftKeywords=entry?entry.keywords.slice():[];
  $('worldBookEditTitle').textContent=entry?uiText('編輯辭典條目'):uiText('新增辭典條目');
  $('worldBookKeywords').value='';
  $('worldBookEntryText').value=entry?entry.text:'';
  $('worldBookEntryEnabled').checked=entry?entry.enabled:true;
  $('worldBookEntryConstant').checked=entry?entry.constant:false;
  $('worldBookEntryPriority').value=entry?entry.priority:'normal';
  $('worldBookEntryScope').value=entry?entry.scope:'all';
  $('worldBookEntryDeleteBtn').hidden=!entry;
  $('worldBookEditStatus').textContent='';
  renderWorldBookKeywordChips();
  $('worldBookEditDialog').showModal();
}
function parseWorldBookKeywords(value){
  return String(value||'').split(/[,，、;；]+/).map(part=>part.trim()).filter(Boolean);
}
function renderWorldBookKeywordChips(){
  const box=$('worldBookKeywordChips');
  if(!box)return;
  box.innerHTML=worldBookDraftKeywords.map((word,index)=>'<span class="wb-chip">'+esc(word)+'<button type="button" data-wb-chip-remove="'+index+'">×</button></span>').join('');
  box.querySelectorAll('[data-wb-chip-remove]').forEach(button=>{
    button.setAttribute('aria-label',uiText('移除觸發詞'));
    button.onclick=()=>{worldBookDraftKeywords.splice(Number(button.dataset.wbChipRemove),1);renderWorldBookKeywordChips();};
  });
}
function addWorldBookKeywordTokens(value){
  for(const token of parseWorldBookKeywords(value)){
    const word=String(token).trim().slice(0,30);
    if(!word)continue;
    if(worldBookDraftKeywords.some(existing=>existing.toLowerCase()===word.toLowerCase()))continue;
    if(worldBookDraftKeywords.length>=8){$('worldBookEditStatus').textContent=uiText('最多 8 個觸發詞。');break;}
    worldBookDraftKeywords.push(word);
  }
  renderWorldBookKeywordChips();
}
function saveWorldBookEntry(){
  const book=normalizeWorldBook(state.worldBook);
  const existing=worldBookEditIndex>=0?book.entries[worldBookEditIndex]:null;
  const keywords=[...worldBookDraftKeywords,...parseWorldBookKeywords($('worldBookKeywords').value)];
  const text=String($('worldBookEntryText').value||'').trim().slice(0,800);
  const enabled=$('worldBookEntryEnabled').checked===true;
  const normalized=normalizeWorldBookEntry({id:existing?existing.id:'',keywords,text,enabled,constant:$('worldBookEntryConstant').checked===true,priority:$('worldBookEntryPriority').value,scope:$('worldBookEntryScope').value});
  if(!normalized.keywords.length&&!normalized.text){$('worldBookEditStatus').textContent=uiText('請至少填寫關鍵詞或內容。');return;}
  const previous=normalizeWorldBook(state.worldBook);
  if(existing){
    book.entries[worldBookEditIndex]=normalized;
  }else{
    if(book.entries.length>=50){$('worldBookEditStatus').textContent=uiText('條目已達 50 條上限。');return;}
    book.entries.push({...normalized,id:'wb_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)});
    // 設計 A：新增第一條時自動打開世界書總開關。
    if(book.entries.length===1)book.enabled=true;
  }
  state.worldBook=normalizeWorldBook(book);
  if(!save()){state.worldBook=previous;$('worldBookEditStatus').textContent=uiText('存檔空間不足，未儲存條目。');return;}
  $('worldBookEditDialog').close();
  renderWorldBook();
  settings();
}
function deleteWorldBookEntry(index){
  const previous=normalizeWorldBook(state.worldBook);
  const book=normalizeWorldBook(state.worldBook);
  if(!book.entries[index])return;
  if(!confirm(uiText('刪除這條辭典條目？')))return;
  book.entries.splice(index,1);
  state.worldBook=normalizeWorldBook(book);
  if(!save()){state.worldBook=previous;return;}
  const dialog=$('worldBookEditDialog');
  if(dialog&&dialog.open)dialog.close();
  renderWorldBook();
  settings();
}
function copyWorldBookEntry(index){
  const previous=normalizeWorldBook(state.worldBook);
  const book=normalizeWorldBook(state.worldBook);
  const entry=book.entries[index];
  const status=$('worldBookIoStatus');
  if(!entry)return;
  if(book.entries.length>=50){if(status)status.textContent=uiText('條目已達 50 條上限。');return;}
  book.entries.push({...entry,id:'wb_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)});
  state.worldBook=normalizeWorldBook(book);
  if(!save()){state.worldBook=previous;if(status)status.textContent=uiText('存檔空間不足，未儲存條目。');return;}
  if(status)status.textContent=uiText('已複製條目。');
  renderWorldBook();
  settings();
}
function renderWorldBookTest(){
  const input=$('worldBookTestInput'),result=$('worldBookTestResult');
  if(!input||!result)return;
  const query=input.value.trim();
  if(!query){result.textContent='';return;}
  const preview=worldBookPreview(normalizeWorldBook(state.worldBook),query,uiLanguage,{phase:'chat'});
  const words=[];
  for(const hit of preview.matched){
    if(hit.reason==='constant'){if(!words.includes(uiText('常駐')))words.push(uiText('常駐'));continue;}
    for(const word of hit.matchedKeywords){if(!words.includes(word))words.push(word);}
  }
  result.textContent=words.length?uiText('命中：')+words.join(uiText('、')):uiText('未命中');
}
function worldBookFileName(){
  return (uiLanguage==='en'?'Claude-WorldBook-':'Claude娘-世界書-')+new Date().toISOString().slice(0,10)+'.json';
}
function exportWorldBookFile(){
  const payload=exportWorldBook(state.worldBook);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=worldBookFileName();
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  const status=$('worldBookIoStatus');
  if(status)status.textContent=uiText('世界書已匯出。');
}
async function handleWorldBookImportFile(file){
  if(!file)return;
  const status=$('worldBookIoStatus');
  if(busy){if(status)status.textContent=uiText('AI 正在生成；請等這一回合完成後再匯入世界書。');return;}
  try{
    const parsed=JSON.parse(await file.text());
    const result=parseWorldBookImport(parsed);
    if(!result.ok){
      if(status)status.textContent=uiText('匯入失敗：')+uiText(result.error==='empty'?'世界書沒有任何條目。':'不是有效的世界書檔案（格式／空書）。');
      return;
    }
    worldBookImportPending=result;
    worldBookImportFileName=file.name;
    const mergeRadio=document.querySelector('input[name="worldBookImportConflict"][value="merge"]');
    if(mergeRadio)mergeRadio.checked=true;
    const dialogStatus=$('worldBookImportStatus');
    if(dialogStatus)dialogStatus.textContent='';
    updateWorldBookImportSummary();
    $('worldBookImportDialog').showModal();
  }catch(e){
    if(status)status.textContent=uiText('匯入失敗：')+(e.message||uiText('檔案格式錯誤'));
  }
}
function worldBookImportMode(){
  const checked=document.querySelector('input[name="worldBookImportConflict"]:checked');
  return checked?checked.value:'merge';
}
function updateWorldBookImportSummary(){
  const pending=worldBookImportPending;
  const summary=$('worldBookImportSummary');
  if(!pending||!summary)return;
  const merged=mergeWorldBookEntries(state.worldBook,pending.book,worldBookImportMode());
  pending.merged=merged;
  const source={single:'單書',bare:'裸書',kit:'資料包'}[pending.source]||'單書';
  const parts=[
    uiText('來源：')+uiText(source)+'（'+worldBookImportFileName+'）',
    uiText('匯入預覽：')+uiText('新增 ')+merged.added+uiText('／覆蓋 ')+merged.overwritten+uiText('／略過 ')+merged.skipped
  ];
  if(pending.truncated||merged.truncated)parts.push(uiText('世界書檔案超過 50 條，將只保留前 50 條。'));
  parts.push(uiText('匯入不會自動開啟世界書總開關。'));
  summary.textContent=parts.join('\n');
}
function confirmWorldBookImport(){
  const pending=worldBookImportPending;
  if(!pending)return;
  const dialogStatus=$('worldBookImportStatus');
  if(busy){if(dialogStatus)dialogStatus.textContent=uiText('AI 正在生成；請等這一回合完成後再匯入世界書。');return;}
  const merged=mergeWorldBookEntries(state.worldBook,pending.book,worldBookImportMode());
  const previous=snapshotForRollback(state);
  state.worldBook=normalizeWorldBook(merged.book);
  if(!save()){
    state=previous;
    if(dialogStatus)dialogStatus.textContent=uiText('存檔空間不足，未匯入。');
    return;
  }
  writeAutoSave();
  worldBookImportPending=null;
  const dialog=$('worldBookImportDialog');
  if(dialog&&dialog.open)dialog.close();
  const status=$('worldBookIoStatus');
  if(status)status.textContent=uiText('世界書已匯入。')+' '+uiText('新增 ')+merged.added+uiText('／覆蓋 ')+merged.overwritten+uiText('／略過 ')+merged.skipped+uiText('。');
  renderWorldBook();
  settings();
  renderKitSummary();
}
function cancelWorldBookImport(){
  worldBookImportPending=null;
  const dialog=$('worldBookImportDialog');
  if(dialog&&dialog.open)dialog.close();
}
function kitFileName(){
  return (uiLanguage==='en'?'Claude娘-kit-':'Claude娘-資料包-')+new Date().toISOString().slice(0,10)+'.json';
}
// 資料包（DLC）：角色卡＋人設＋世界書打成 JSON，可自由分享與新增。
// version 1 且欄位皆為選用：舊包（只有角色卡/人設/世界書）照常匯入；新包多帶 characterCards／characterCardIds。
function exportKit(){
  const payload={app:'cioudo10',version:1,exportedAt:new Date().toISOString(),payload:{
    characterSheet:normalizeCharacterSheet(state.characterSheet),
    characterProfile:String(state.characterProfile||''),
    worldBook:normalizeWorldBook(state.worldBook),
    characterCards:characterCardsList(),
    characterCardIds:[...usedCharacterCardIds()].slice(0,12)
  }};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=kitFileName();
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  const status=$('kitStatus');
  if(status)status.textContent=uiText('資料包已匯出（角色卡、人設、世界書）。');
}
async function importKit(file){
  if(!file)return;
  const status=$('kitStatus');
  if(busy){alert(uiText('AI 正在生成；請等這一回合完成後再匯入資料包。'));return;}
  try{
    const parsed=JSON.parse(await file.text());
    if(parsed?.app!=='cioudo10'||parsed?.version!==1||!parsed.payload||typeof parsed.payload!=='object')throw new Error(uiText('不是有效的 Claude娘資料包（app／version／payload）。'));
    const incoming=parsed.payload;
    const items=[];
    if(incoming.characterSheet!==undefined)items.push(uiText('角色卡'));
    if(typeof incoming.characterProfile==='string'&&incoming.characterProfile.trim())items.push(uiText('人設'));
    if(incoming.worldBook!==undefined)items.push(uiText('世界書')+(uiLanguage==='en'?' ('+normalizeWorldBook(incoming.worldBook).entries.length+')':'（'+normalizeWorldBook(incoming.worldBook).entries.length+uiText(' 條）')));
    const incomingCards=normalizeCharacterCards(incoming.characterCards);
    if(incomingCards.length)items.push(uiText('角色卡 DLC')+(uiLanguage==='en'?' ('+incomingCards.length+')':'（'+incomingCards.length+uiText(' 張）')));
    if(!items.length)throw new Error(uiText('資料包沒有任何可匯入的項目。'));
    if(!confirm(uiText('將匯入並覆蓋目前存檔的：')+items.join(uiLanguage==='en'?', ':'、')+uiText('。故事進度不會被刪除。要繼續嗎？')))return;
    const previous=snapshotForRollback(state);
    if(incoming.characterSheet!==undefined)state.characterSheet=normalizeCharacterSheet(incoming.characterSheet);
    if(typeof incoming.characterProfile==='string'&&incoming.characterProfile.trim())state.characterProfile=incoming.characterProfile.slice(0,10000);
    if(incoming.worldBook!==undefined)state.worldBook=normalizeWorldBook(incoming.worldBook);
    // 角色「DLC」：額外角色卡用「合併」加入（同 id 覆蓋、新 id 新增，上限 12 張），勾選狀態照包內設定。
    if(incomingCards.length){
      const existing=characterCardsList();
      const byId=new Map(existing.map(card=>[card.id,card]));
      for(const card of incomingCards)byId.set(card.id,card);
      state.characterCards=[...byId.values()].slice(0,12);
      const used=usedCharacterCardIds();
      for(const card of incomingCards)if((Array.isArray(incoming.characterCardIds)?incoming.characterCardIds:[]).map(String).includes(card.id))used.add(card.id);
      state.characterCardIds=[...used].slice(0,12);
    }
    if(!save()){state=previous;if(status)status.textContent=uiText('存檔空間不足，未匯入。');return;}
    writeAutoSave();
    if(status)status.textContent=uiText('資料包已匯入。');
    settings();
    render();
    renderWorldBook();
  }catch(e){
    if(status)status.textContent=uiText('匯入失敗：')+(e.message||uiText('檔案格式錯誤'));
  }
}
function renderKitSummary(){
  const status=$('kitStatus');
  if(!status||$('gmMenuData')?.hidden)return;
  const book=normalizeWorldBook(state.worldBook);
  status.textContent=uiText('目前存檔：世界書 ')+book.entries.length+uiText(' 條・人設 ')+String(state.characterProfile||'').length+uiText(' 字・角色卡 ')+(state.characterSheet?uiText('已設定'):uiText('未設定'))+uiText('。');
}
(function bindGameShell() {
  const menuBtn = $('gameMenuBtn');
  if (menuBtn) menuBtn.onclick = () => setGameMenu(!gameMenuOpen);
  const menuClose = $('gameMenuCloseBtn');
  if (menuClose) menuClose.onclick = () => setGameMenu(false);
  // 選單內的分頁鈕：切換頁面後自動收起選單（分頁切換本身由 SECTION 16 負責）。
  document.querySelectorAll('#gameMenu .tab-btn').forEach(b => b.addEventListener('click', () => setGameMenu(false)));
  const slotsBtn = $('gmMenuSlotsBtn');
  if (slotsBtn) slotsBtn.onclick = () => showGameMenuView('gmMenuSlots');
  const sceneBtn = $('gmMenuSceneBtn');
  if (sceneBtn) sceneBtn.onclick = () => showGameMenuView('gmMenuScene');
  const slotsBack = $('gmSlotsBackBtn');
  if (slotsBack) slotsBack.onclick = () => showGameMenuView('gmMenuMain');
  const sceneBack = $('gmSceneBackBtn');
  if (sceneBack) sceneBack.onclick = () => showGameMenuView('gmMenuMain');
  const dictBtn = $('gmMenuDictBtn');
  if (dictBtn) dictBtn.onclick = () => { showGameMenuView('gmMenuDict'); renderWorldBook(); };
  const dataBtn = $('gmMenuDataBtn');
  if (dataBtn) dataBtn.onclick = () => { showGameMenuView('gmMenuData'); renderKitSummary(); };
  const dictBack = $('gmDictBackBtn');
  if (dictBack) dictBack.onclick = () => showGameMenuView('gmMenuMain');
  const dataBack = $('gmDataBackBtn');
  if (dataBack) dataBack.onclick = () => showGameMenuView('gmMenuMain');
  const backlogClose = $('gmBacklogCloseBtn');
  if (backlogClose) backlogClose.onclick = () => { if (storyLogOpen) setBacklogOpen(false); };
  // 追加九：回想底部回退鈕（顯示與否由 render() 控制）。
  const rewriteBtn = $('rewriteLastBtn');
  if (rewriteBtn) rewriteBtn.onclick = () => rewriteLastTurn();
  const deleteBtn = $('deleteLastBtn');
  if (deleteBtn) deleteBtn.onclick = () => deleteLastTurn();
  // 追加九：作者註記便條紙。
  const authorNoteBtn = $('authorNoteBtn');
  if (authorNoteBtn) authorNoteBtn.onclick = () => openAuthorNote();
  const authorNoteSave = $('authorNoteSaveBtn');
  if (authorNoteSave) authorNoteSave.onclick = () => {
    state.authorNote={enabled:$('authorNoteToggle').checked===true,text:String($('authorNoteText').value||'').slice(0,600)};
    if (!save()) { $('authorNoteStatus').textContent = uiText('存檔空間不足，未儲存。'); return; }
    settings(); render(); $('authorNoteDialog').close();
  };
  const authorNoteCancel = $('authorNoteCancelBtn');
  if (authorNoteCancel) authorNoteCancel.onclick = () => $('authorNoteDialog').close();
  const authorNoteText = $('authorNoteText');
  if (authorNoteText) authorNoteText.oninput = () => updateAuthorNoteCount();
  // 追加九：辭典（世界書）頁。
  const worldBookMaster = $('worldBookToggle');
  if (worldBookMaster) worldBookMaster.onchange = () => {
    const previous = normalizeWorldBook(state.worldBook);
    const book = normalizeWorldBook(state.worldBook);
    book.enabled = worldBookMaster.checked === true;
    state.worldBook = book;
    if (!save()) { state.worldBook = previous; worldBookMaster.checked = !worldBookMaster.checked; return; }
    settings();
    renderWorldBook();
  };
  const worldBookAdd = $('worldBookAddBtn');
  if (worldBookAdd) worldBookAdd.onclick = () => openWorldBookEdit(-1);
  const worldBookSearchInput = $('worldBookSearch');
  if (worldBookSearchInput) {
    worldBookSearch = worldBookSearchInput.value || '';
    worldBookSearchInput.oninput = () => { worldBookSearch = worldBookSearchInput.value; renderWorldBook(); };
  }
  document.querySelectorAll('#worldBookFilter [data-filter]').forEach(button => {
    button.onclick = () => { worldBookFilter = button.dataset.filter || 'all'; renderWorldBook(); };
  });
  const worldBookExport = $('worldBookExportBtn');
  if (worldBookExport) worldBookExport.onclick = () => exportWorldBookFile();
  const worldBookImport = $('worldBookImportBtn');
  if (worldBookImport) worldBookImport.onclick = () => {
    const status = $('worldBookIoStatus');
    if (busy) { if (status) status.textContent = uiText('AI 正在生成；請等這一回合完成後再匯入世界書。'); return; }
    $('worldBookImportFile').click();
  };
  const worldBookImportFile = $('worldBookImportFile');
  if (worldBookImportFile) worldBookImportFile.onchange = event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    void handleWorldBookImportFile(file);
  };
  const worldBookTestInput = $('worldBookTestInput');
  if (worldBookTestInput) worldBookTestInput.oninput = () => renderWorldBookTest();
  const worldBookTestBtn = $('worldBookTestBtn');
  if (worldBookTestBtn) worldBookTestBtn.onclick = () => renderWorldBookTest();
  const worldBookKeywords = $('worldBookKeywords');
  if (worldBookKeywords) {
    worldBookKeywords.onkeydown = event => {
      if (event.isComposing) return;
      if (event.key === 'Enter' || event.key === ',' || event.key === '，' || event.key === '、' || event.key === ';' || event.key === '；') {
        event.preventDefault();
        addWorldBookKeywordTokens(worldBookKeywords.value);
        worldBookKeywords.value = '';
      }
    };
    worldBookKeywords.onblur = () => {
      if (worldBookKeywords.value.trim()) {
        addWorldBookKeywordTokens(worldBookKeywords.value);
        worldBookKeywords.value = '';
      }
    };
  }
  document.querySelectorAll('input[name="worldBookImportConflict"]').forEach(radio => {
    radio.onchange = () => updateWorldBookImportSummary();
  });
  const worldBookImportConfirm = $('worldBookImportConfirmBtn');
  if (worldBookImportConfirm) worldBookImportConfirm.onclick = () => confirmWorldBookImport();
  const worldBookImportCancel = $('worldBookImportCancelBtn');
  if (worldBookImportCancel) worldBookImportCancel.onclick = () => cancelWorldBookImport();
  const worldBookImportDialog = $('worldBookImportDialog');
  if (worldBookImportDialog) worldBookImportDialog.oncancel = event => { event.preventDefault(); cancelWorldBookImport(); };
  const worldBookEntrySave = $('worldBookEntrySaveBtn');
  if (worldBookEntrySave) worldBookEntrySave.onclick = () => saveWorldBookEntry();
  const worldBookEntryDelete = $('worldBookEntryDeleteBtn');
  if (worldBookEntryDelete) worldBookEntryDelete.onclick = () => { if (worldBookEditIndex >= 0) deleteWorldBookEntry(worldBookEditIndex); };
  const worldBookEntryCancel = $('worldBookEntryCancelBtn');
  if (worldBookEntryCancel) worldBookEntryCancel.onclick = () => $('worldBookEditDialog').close();
  // 追加九：資料包（匯出／匯入）。
  const exportKitBtn = $('exportKitBtn');
  if (exportKitBtn) exportKitBtn.onclick = () => exportKit();
  const importKitBtn = $('importKitBtn');
  if (importKitBtn) importKitBtn.onclick = () => $('importKitFile').click();
  const importKitFile = $('importKitFile');
  if (importKitFile) importKitFile.onchange = (event) => { const file = event.target.files && event.target.files[0]; event.target.value = ''; void importKit(file); };
  // 追加九：歷史編輯對話框（只改文字）。
  const historyEditSave = $('historyEditSaveBtn');
  if (historyEditSave) historyEditSave.onclick = () => {
    if (historyEditIndex < 0 || !state.history[historyEditIndex]) { $('historyEditDialog').close(); return; }
    const value = String($('historyEditText').value || '').slice(0,100000);
    if (!value.trim()) { $('historyEditStatus').textContent = uiText('訊息不能留空。'); return; }
    const previous = snapshotForRollback(state);
    state.history = state.history.map((entry,index)=>index===historyEditIndex?{...entry,text:value}:entry);
    if (!save()) { state = previous; $('historyEditStatus').textContent = uiText('存檔空間不足，未儲存修改。'); return; }
    writeAutoSave();
    $('historyEditDialog').close();
    render();
  };
  const historyEditCancel = $('historyEditCancelBtn');
  if (historyEditCancel) historyEditCancel.onclick = () => $('historyEditDialog').close();
  // 面板頁的「← 返回故事」：回遊戲主畫面。
  document.querySelectorAll('.game-back-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelector('#gameMenu .tab-btn[data-tab="story"]')?.click();
  }));
  // Esc：像 galgame 一樣逐層退後；沒有任何面板時，故事中按 Esc 直接打開退出／存檔選單。
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (state.gameOver) return; // R50：Game Over 覆蓋層不受 Esc 影響，只能按「重新開始故事」。
    if (storyLogOpen) { setBacklogOpen(false); return; }
    const openDialog = document.querySelector('dialog[open]');
    if (openDialog) { openDialog.close(); return; }
    if (gameMenuOpen) { setGameMenu(false); return; }
    if (storyExited) { resumeStory(); return; }
    const storyTab = document.querySelector('#tab-story');
    if (storyTab?.classList.contains('active') && (state.history.length || state.pendingAction)) leaveStory();
  });
})();
// ==== SECTION 18｜鍵盤快捷鍵、主程序回推、啟動（檔尾）====
// 全域字級／存檔快捷鍵：Ctrl+= 放大、Ctrl+- 縮小、Ctrl+0 回到 100%、Ctrl+S 快速存檔。
// 輸入框內也有效；只有 Ctrl+S 遇到 Shift（另存）不攔截，其餘交給各欄位原本行為。
// 介面縮放（整個介面一起變大變小）：Ctrl+Alt+= 放大、Ctrl+Alt+- 縮小、Ctrl+Alt+0 回 100%。
document.addEventListener('keydown',event=>{
  if(!event.ctrlKey||!event.altKey||event.metaKey)return;
  const key=String(event.key||'').toLowerCase();
  const code=String(event.code||'');
  if(key==='='||key==='+'||code==='NumpadAdd'){
    event.preventDefault();stepWebUiZoom(1);return;
  }
  if(key==='-'||key==='_'||code==='NumpadSubtract'){
    event.preventDefault();stepWebUiZoom(-1);return;
  }
  if(key==='0'||code==='Numpad0'){
    event.preventDefault();resetWebUiZoom();return;
  }
});
// P1-06：點擊對話框推進／快進句子
document.getElementById('dialogueText')?.addEventListener('click', () => {
  if (getStoryLineRunner().isPlaying) {
    getStoryLineRunner().nextOrSkip();
  }
});

document.addEventListener('keydown',event=>{
  if(!event.ctrlKey||event.altKey||event.metaKey)return;
  const key=String(event.key||'').toLowerCase();
  const code=String(event.code||'');
  if(key==='='||key==='+'||code==='NumpadAdd'){
    event.preventDefault();stepStoryTextSize(1);return;
  }
  if(key==='-'||key==='_'||code==='NumpadSubtract'){
    event.preventDefault();stepStoryTextSize(-1);return;
  }
  if(key==='0'||code==='Numpad0'){
    event.preventDefault();resetStoryTextSize();return;
  }
  if((key==='s'||code==='KeyS')&&!event.shiftKey){
    event.preventDefault();quickSave();return;
  }
});
document.addEventListener('keydown',event=>{
  if(!event.ctrlKey||event.altKey||event.shiftKey||event.metaKey||(String(event.key||'').toLowerCase()!=='v'&&event.code!=='KeyV'))return;
  if(!state.pendingAction||state.aiMode!=='web'||busy||manualClipboardPasteInProgress)return;
  if(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return;
  event.preventDefault();
  void readClipboardReply();
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey&&event.key==='Enter'&&event.target?.id==='webAiReplyInput'&&!busy&&state.pendingAction){
    event.preventDefault();
    $('applyWebReplyBtn')?.click();
    return;
  }
  if(event.ctrlKey&&event.key==='Enter'&&event.target?.id==='freeInput'&&!state.pendingAction&&!busy){
    event.preventDefault();
    $('freeSend')?.click();
    return;
  }
  if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||state.pendingAction||busy||state.ending)return;
  if(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return;
  // P1-06：演出進行中按空白或 Enter 推進；按數字鍵快進全篇
  if (getStoryLineRunner().isPlaying) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      getStoryLineRunner().nextOrSkip();
      return;
    }
    if (/^[1-7]$/.test(String(event.key || ''))) {
      event.preventDefault();
      getStoryLineRunner().skipAll();
      return;
    }
  }
  const key=String(event.key||'');
  if(/^[1-7]$/.test(key)){
    const choice=document.querySelector(`#choices [data-i="${Number(key)-1}"]`);
    if(choice&&!choice.disabled){event.preventDefault();choice.click();}
  }else if(key==='8'){
    const freeChoice=$('freeChoiceToggle');
    if(freeChoice&&!freeChoice.disabled){event.preventDefault();freeChoice.click();}
  }else if(key==='q'||key==='Q'){
    const quickSave=$('quickSaveBtn');
    if(quickSave&&!quickSave.disabled){event.preventDefault();quickSave.click();}
  }else if(key==='l'||key==='L'){
    const quickLoad=$('quickLoadBtn');
    if(quickLoad&&!quickLoad.disabled){event.preventDefault();quickLoad.click();}
  }
});
window.addEventListener('beforeunload',event=>{
  if(autoSaveEnabled||!manualSaveDirty)return;
  event.preventDefault();event.returnValue='';
});

// 網頁模式自動化：官網回覆完成後由主程序推回，這裡直接走既有的回覆驗證與接續管線。
function queueWebAutoReply(value){
  const reply=String(value||'');
  if(!reply.trim()||!state.pendingAction||state.aiMode!=='web')return;
  if(storyExited){webAutoQueuedReply=reply;return;}
  if(webAutoReplyRetryTimer){clearTimeout(webAutoReplyRetryTimer);webAutoReplyRetryTimer=null;}
  const expectedAction=state.pendingAction,expectedSlot=activeSlotId,startedAt=Date.now();
  const attempt=()=>{
    webAutoReplyRetryTimer=null;
    if(state.pendingAction!==expectedAction||activeSlotId!==expectedSlot||state.aiMode!=='web')return;
    // Renderer can briefly be busy while a delayed UI update or save finishes. Keep the
    // harvested reply queued instead of losing the only main-process delivery event.
    if(busy){
      if(Date.now()-startedAt>=30000){
        // G44：畫面忙碌中收到的回覆，寫入狀態但不重建 #choices（避免了兩段式動畫與輸入框閃失）。
        state.webReply=reply;
        state.lastAiError=uiText('回覆已收到，畫面忙碌中；已先保留在回覆欄，稍後可按「將 AI 回覆接回故事」。');
        save();applyWebPendingQuietStatus();
        return;
      }
      webAutoReplyRetryTimer=setTimeout(attempt,200);
      return;
    }
    applyWebReply(reply);
  };
  attempt();
}
window.claudeDesktop?.onWebAutoReply?.(text=>queueWebAutoReply(text));
window.claudeDesktop?.onGoogleSignInHandoff?.(payload=>{
  // 保留這個事件只是相容舊主程序；Gemini 一律使用外部真 Chrome／Edge，
  // App 不保存 Google 帳密，也不會呼叫 Windows Hello／PIN。
  if(payload?.provider)state.webProvider=normalizeWebAIProvider(payload.provider);
  state.lastAiError=uiText('Gemini 請在外部 Chrome／Edge 視窗完成 Google 登入；登入後本回合會自動送出並接回，不需要 Windows PIN。');
  save();settings();
  // G44：busy 期間不重建 #choices，避免自動化進行中的兩段式畫面切換。
  if(!busy)render();else applyWebPendingQuietStatus();
});
// 網頁模式自動化狀態事件（追加十 A/C）：顯示白話狀態；監看中斷（逾時／重試耗盡）時，
// 已自動送出的回合依「自動重試次數」設定改用「只監看」方式重接（絕不重填再送，避免同一回合送兩次）。
window.claudeDesktop?.onWebAutoStatus?.(payload=>{
  const stage=String(payload?.stage||'');
  const text=webAutoStatusForEvent(payload);
  if(text){webAutoStatusStage=stage;webAutoStatusText=text;}
  if((stage==='watching'&&payload?.submitted===true)||stage==='submitted')webAutoFlowSubmitted=true;
  if(stage==='harvested')webAutoFlowActive=false;
  // 卡住且監看已停止（輸入框問題）：釋放佔位，讓玩家按「重新準備」或下一個畫面週期能重來。
  // 送出沒反應（reason=send）時監看仍在進行，不能釋放，否則會重填再送一次。
  if(stage==='stalled'&&payload?.reason!=='send'){webAutoFlowActive=false;webAutoFlowBaseKey='';}
  if(stage==='gave-up'||stage==='timeout'){
    webAutoFlowActive=false;
    if(webAutoFlowSubmitted&&webAutoWatchRetryCount<webAutoRetryLimit){
      webAutoWatchRetryCount+=1;
      webAutoFlowWatchOnly=true;
      webAutoFlowRetryAt=Date.now()+8000;
      webAutoStatusText=uiText('官網暫時沒有回應；正在自動重試')+' ('+webAutoWatchRetryCount+'/'+webAutoRetryLimit+')';
      setTimeout(()=>{if(webAutoFlow&&state.aiMode==='web'&&Boolean(state.pendingAction)&&!busy)syncWebAutoFlow();},8500);
    }else if(webAutoFlowSubmitted){
      webAutoStatusText=uiText('已達自動重試上限，改為手動：請把回覆貼到下方後按「套用回覆」。');
    }
  }
  // G44：自動化流程（送出／監看／重試）常與一鍵切換、回合準備同時進行。busy 期間只做靜默更新，
  // 不重建 #choices（重建會把面板換成等候書寫畫面再跳回，造成兩段式動畫與按鈕區閃白）。
  if(!busy)render();else applyWebPendingQuietStatus();
});
bootstrapGameConfigs();
applyTheme(storedThemeChoice()); startThemeTimeWatch(); settings(); render(); refreshAiStatus();
// G16.11｜故事畫面自適應：量出「資訊列之下、選項區之上」的剩餘空間，交給立繪使用（只寫 CSS 變數，不動版面邏輯）。
// 窄視窗或矮視窗時，人物會自動縮放到剩餘空間內，不會被選項／對話框蓋住，也不會把選項擠出畫面。
function setupStageFit(){
  const screen=document.querySelector('#tab-story .game-screen');
  if(!screen)return;
  let queued=false;
  const put=(name,value)=>{const next=Math.max(0,Math.round(value))+'px';if(screen.style.getPropertyValue(name)!==next)screen.style.setProperty(name,next);};
  const fit=()=>{
    queued=false;
    const height=screen.clientHeight;if(!height)return;
    const box=screen.getBoundingClientRect();
    const scale=(box.height/height)||1;                       // 介面縮放（body zoom）下，把量到的位置換回畫面自己的 CSS 像素
    const top=el=>el?(el.getBoundingClientRect().top-box.top)/scale:null;
    const bottom=el=>el?(el.getBoundingClientRect().bottom-box.top)/scale:null;
    const hud=screen.querySelector('.game-hud');
    const chip=screen.querySelector('.hud-story-text-size');
    const choices=document.getElementById('choices');
    const dialogue=screen.querySelector('.vn-dialogue-window');
    const hudBottom=Math.max(bottom(hud)||0,bottom(chip)||0)+6;
    const choicesTop=choices&&choices.getClientRects().length?top(choices):height*0.6;
    const dialogueTop=dialogue&&dialogue.getClientRects().length?top(dialogue):height*0.8;
    put('--g16-hudh',hudBottom);
    put('--g16-pb',height-choicesTop+8);
    put('--g16-dlgh',height-dialogueTop+24);
  };
  const queue=()=>{if(queued)return;queued=true;(window.requestAnimationFrame||setTimeout)(fit);};
  window.addEventListener('resize',queue);
  if(typeof ResizeObserver==='function'){
    const watcher=new ResizeObserver(queue);
    for(const el of [screen,screen.querySelector('.game-hud'),document.getElementById('choices'),screen.querySelector('.vn-dialogue-window')])if(el)watcher.observe(el);
  }
  queue();
}
// v4.6.34｜滑鼠滾輪：下拉選單、單行輸入與未聚焦的大文字框不該把滾輪吃掉。
// 規則：下拉／單行輸入一律滾頁面（避免滾輪誤改選項或數值）；多行文字框只有「已聚焦」
// 時才用滾輪捲動內文，未聚焦時把滾輪交給最近的可捲動面板；聚焦且到頂／到底時也接續外層。
function wheelDeltaPixels(event){
  const raw=Number(event&&event.deltaY)||0;
  if(event&&event.deltaMode===1)return raw*16;
  if(event&&event.deltaMode===2)return raw*Math.max(1,Number(event.currentTarget&&event.currentTarget.clientHeight)||window.innerHeight||600);
  return raw;
}
function canScrollVertically(el,dy){
  if(!el)return false;
  const height=Number(el.clientHeight)||0;
  const total=Number(el.scrollHeight)||0;
  if(total<=height+1)return false;
  const top=Number(el.scrollTop)||0;
  return dy<0?top>0:top+height<total-1;
}
function scrollAncestorsFromWheel(start,dy){
  let node=start;
  while(node&&node!==document.body&&node!==document.documentElement){
    if(canScrollVertically(node,dy)){node.scrollTop=(Number(node.scrollTop)||0)+dy;return true;}
    node=node.parentElement;
  }
  const scroller=document.scrollingElement||document.documentElement;
  if(canScrollVertically(scroller,dy)){scroller.scrollTop=(Number(scroller.scrollTop)||0)+dy;return true;}
  return false;
}
function wheelOverFormControl(event){
  if(event.defaultPrevented||event.ctrlKey||event.metaKey)return;
  const target=event.target;
  const control=target&&typeof target.closest==='function'?target.closest('select,textarea,input'):null;
  if(!control||control.disabled)return;
  const dy=wheelDeltaPixels(event);
  if(!dy)return;
  if(control.tagName==='TEXTAREA'&&document.activeElement===control){
    if(canScrollVertically(control,dy))return;
    scrollAncestorsFromWheel(control.parentElement,dy);
    event.preventDefault();
    return;
  }
  scrollAncestorsFromWheel(control.parentElement,dy);
  event.preventDefault();
}
document.addEventListener('wheel',wheelOverFormControl,{passive:false});
setupStageFit();






