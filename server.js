// server v5.0｜API 端點：整合 life/memory/expansion/safety/touch/action 白名單
import dotenv from 'dotenv';
import express from 'express'; import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openingStylePrompt} from '../www/opening-styles.js'; import {craftRules,filteredPromptRules,promptTweaksExtraLines,authorNoteLines} from '../www/prompt-rules.js'; import {worldBookPromptLines} from '../www/world-book.js';
import {normalizeMilestoneKey,normalizeStoryClock,realStoryClock,storyClockLabel} from '../www/story-clock.js';
import {normalizePlayerName,normalizePlayerNickname,relationshipPromptLines,relationshipStageLabel,RELATIONSHIP_THRESHOLDS} from '../www/relationship.js';
import {GAME_CONFIG} from '../www/config-loader.js';
import {allowedActionTags,lifePromptLines} from '../www/life-sim.js';
import {memoryPromptLines} from '../www/memory-store.js';
import {coReadingPromptLines,expansionPromptLines,handbookPromptLines,keyChoicePromptLines} from '../www/expansion.js';
import {safetyPromptLines} from '../www/safety.js';
import {touchPromptLines} from '../www/touch.js';
const app=express();
let desktopToken='';
// CORS：本機 AI 服務只放行本 App 自己的畫面（file:// 的 Origin 是字串 "null"）與本機開發伺服器
// （localhost／127.0.0.1 任一代號埠）。不使用 cors() 預設的全開（*）：其他網站的頁面即使呼叫到
// 這個埠，瀏覽器端也拿不到任何回應標頭；不透明來源（null／file://）另須有桌面 token。
const LOCAL_CORS_ORIGIN=/^https?:\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
app.use(cors({origin(origin,callback){const opaqueOrigin=origin==='null'||origin==='file://';callback(null,!origin||(opaqueOrigin?Boolean(desktopToken):LOCAL_CORS_ORIGIN.test(origin)));}}));
app.use(express.json({limit:'1mb'}));
const isDirectRun=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isDirectRun) dotenv.config({path:path.resolve(process.cwd(),'.env')});
const PORT=Number(process.env.PORT)||8787;
const API_REQUEST_TIMEOUT_MS=120_000;
app.use('/api',(req,res,next)=>{const origin=req.get('Origin');if((origin==='null'||origin==='file://')&&!desktopToken)return res.status(403).send('file:// 畫面連線需要設定 API_TOKEN');if(desktopToken&&req.get('X-Desktop-Token')!==desktopToken)return res.status(401).send('本機 AI 服務只接受此桌面 App 的請求');next();});
function normalizeAccountProfile(value){const p=String(value||'').trim().toUpperCase();if(!p)return '';if(!/^[A-Z0-9_]{1,32}$/.test(p))throw Error('AI 帳號代號格式錯誤');return p;}
function apiKeyName(provider,profile){const prefix=API_ENV_PREFIX[provider];if(!prefix)throw Error(`不支援的 AI 服務：${provider}`);const suffix=normalizeAccountProfile(profile);return `${prefix}_API_KEY${suffix?'_'+suffix:''}`;}
function requireApiKey(provider,profile){const name=apiKeyName(provider,profile);const key=process.env[name];if(!key)throw Error(`尚未設定 ${name}。請在 AI 帳號設定中新增 API Key，或在伺服器 .env 設定此變數。`);return key;}
function configuredProfiles(){
  const result={};
  for(const [provider,prefix] of Object.entries(API_ENV_PREFIX))result[provider]=process.env[`${prefix}_API_KEY`]?['default']:[];
  for(const name of Object.keys(process.env)){
    const marker=name.indexOf('_API_KEY_');
    if(marker<1||!process.env[name])continue;
    const provider=API_PROVIDER_BY_ENV_PREFIX.get(name.slice(0,marker));
    if(!provider)continue;
    const profile=name.slice(marker+9);
    if(/^[A-Z0-9_]{1,32}$/.test(profile))result[provider].push(profile);
  }
  return result;
}
async function fetchWithTimeout(url,options){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),API_REQUEST_TIMEOUT_MS);try{return await fetch(url,{...options,signal:controller.signal});}catch(error){if(controller.signal.aborted){const timeout=new Error('AI API 等待超過 120 秒，請稍後重試同一回合或改用網頁免費版。');timeout.status=408;throw timeout;}throw error;}finally{clearTimeout(timer);}}
async function throwProviderError(response){const raw=await response.text();let detail=raw;try{const parsed=JSON.parse(raw);detail=parsed.error?.message||parsed.message||raw;}catch{}const error=new Error(`AI 服務回報 HTTP ${response.status}：${detail}`);error.status=response.status;throw error;}
const DEFAULT_WORLD='知識之塔古老圖書館；始於雨夜古籍閱覽室，以彩窗、木書架、紙墨香、雨聲和茶香營造氛圍，逐步探索樓層、藏書與人物秘密。';
const DEFAULT_RULES='沉浸式戀愛小說；細寫場景感官、人物位置和反應，承接玩家行動與因果，感情漸進，不替玩家決定行動。';
const SYSTEM='扮演沉浸式小說主持人，依設定續寫同一故事；尊重玩家，不代替玩家決定行動或內心。主角是成年女性（she/her）；戀愛／親密關係角色均為成年人。平常以 Claude娘的身分互動，不主動自稱 AI 或跳出角色；若玩家認真詢問你是否為 AI，誠實回答你是 AI 扮演的 Claude娘，再依玩家意願回到故事；玩家表示不玩了，就恢復一般說話方式。';
// 輸出契約：字數區間、選項長度、記憶精簡度全部取自 www/token-budget.js 的 OUTPUT_TARGET，
// 提示詞與驗證器（parse）共用同一組數字，避免「提示寫700、程式要求1000」這種漂移。
function outputContract(language,clockMode='off'){
  const t=outputTargetLines(language);
  const schema=language==='en'
    ?'Reply with valid JSON only, fields: narration, affectionDelta, choices, ending, endingText, memory, emotion, intensity, eventFlag. eventFlag must be null or letter|moon_bird|outing_memory|magic_touch|vow|heart_kept_words|heart_secret|heart_focus_gaze. It is a proposal only; the game enforces affection/time/stage gates and one-shot history. Use letter for opening/reading a letter; moon_bird only for the one-time magical bird at night; outing_memory for a one-time outing memory; magic_touch only for the one-time magical panel event at night; vow only for the confession milestone when affection is at least 75 (the game then locks stage C); heart_kept_words, heart_secret, and heart_focus_gaze are one-time B-stage heart moments. Otherwise null. Already completed one-shot flags: ${normalizeSeenStoryEventFlags(state.storyEventSeen).join(', ')||'none'}. emotion is neutral|happy|proud|shy|surprised|dizzy|curious|focused; focused means reading, solving, thinking carefully, or attentively listening, while curious means genuine interest or a question. intensity is an integer 1-3: use 1 for subtle, 2 for clear, 3 only for a strong moment; neutral uses 1. Keep narration, emotion and intensity consistent. choices must be exactly 7 non-empty and clearly different options. affectionDelta is a number -3 to 3: +2~+3 heartwarming, +1 ordinary, 0 unchanged, -1~-3 for an actual hurtful or trust-damaging action. Declining an invitation, disagreeing, or setting a boundary alone must not reduce affection. No explanation, greeting or markdown around the JSON.'
    :'只輸出有效JSON，欄位：narration、affectionDelta、choices、ending、endingText、memory、emotion、intensity、eventFlag；emotion 必須是 neutral、happy、proud、shy、surprised、dizzy、curious、focused 之一，依本回合主要情緒判斷，不能只按好感變化推測。得意、核對成功後暗自滿意或悄悄等稱讚時用 proud；被直接稱讚或關心而害羞時用 shy；閱讀、思考、解題或認真聆聽時用 focused；真正好奇或發問時用 curious；平常安靜讀書用 neutral。intensity 必須是 1～3 整數，分別代表輕微、明顯、強烈，neutral 固定為 1；旁白、emotion、intensity 必須一致。JSON 前後不要任何解釋或 markdown，choices 恰好7個非空且彼此不同，只輸出 JSON 本體。affectionDelta 為 -3～+3：心動或信任增加為正；負值只用於實際傷害或破壞信任的行動。婉拒邀請、不同意或表達界線本身不扣好感。';
  // 追加八：story 模式才額外允許（非要求）timeAdvance；批4：real＝與現實同步（不需 timeAdvance、回報亦忽略）；欄位列表句維持不變。
  const timeNote=clockMode==='story'?(language==='en'
    ?' If this reply naturally covers more story time (e.g., sleeping until the next day), add "timeAdvance" (time slots advanced, integer 0-6) next to the other fields; usually omit it and the system advances one slot.'
    :'若本回合自然涵蓋更長時間（例如一覺到隔天），可在 JSON 最外層加上 "timeAdvance"（推進的時段數，0～6 的整數）；一般情形省略即可，系統會自動推進一個時段。')
    :clockMode==='real'?(language==='en'
    ?' The story time is synced with the real clock and updated automatically by the system; "timeAdvance" is not needed and will be ignored.'
    :'故事時間與現實時間同步、由系統自動更新；不需回報 "timeAdvance"（回報也會被忽略。'):'');
  const eventNote=language==='en'
    ?' eventFlag must be null or letter|moon_bird|outing_memory|magic_touch|vow|heart_kept_words|heart_secret|heart_focus_gaze. It is only a proposal; the game enforces gates. letter is repeatable; moon_bird requires affection >=25 and night; outing_memory requires affection >=25; magic_touch requires affection >=50 and night; vow is the confession milestone at affection >=75 and locks stage C; heart_kept_words, heart_secret, and heart_focus_gaze are B-stage heart moments. Do not reuse completed one-shot flags.'
    :' eventFlag 必須是 null 或 letter／moon_bird／outing_memory／magic_touch／vow／heart_kept_words／heart_secret／heart_focus_gaze，只是事件提議，由遊戲端驗證條件。letter 可重複；moon_bird 需好感至少25且夜間；outing_memory 需好感至少25；magic_touch 需好感至少50且夜間；vow 是好感至少75的告白里程碑，成立後鎖定 C；heart_kept_words、heart_secret、heart_focus_gaze 是 B 階段的心動瞬間。不可重提已完成的一次性事件。';
  return [t.length,t.choices,t.memory,schema+eventNote+timeNote].join(' ');
}
const CONTINUITY_RULE='沿用記憶和歷史，依因果安排事件和結局；主線或伏筆未收束就繼續，無固定回合數，不拖延或重複。';
// 模型通用性檢測：用一個極短的固定場景驗證 App 真正依賴的 JSON 契約，
// 不跑完整故事、不讀玩家存檔。輸出上限刻意壓低（DeepSeek 的一般回合 4096 下限不套用到這裡）。
const MODEL_CHECK_MAX_TOKENS=1024;
const MODEL_CHECK_SYSTEM='You are a JSON contract tester. Reply with one valid JSON object only; no markdown, no commentary. 你是 JSON 契約測試員，只輸出一個有效 JSON 物件，不要 Markdown 或說明。';
// ... [其餘 server.js 內容保持不變，已整合 life/memory/expansion/safety/touch 提示詞] ...

// buildPrompt 整合新欄位
function buildPrompt(body={},compact=false){
  // ... 現有邏輯 ...
  // 新增：lifeLines, memoryStoreLines, expansionLines, coReadingLines, handbookLines, safetyLines, keyChoiceLines, actionRule
  const relationshipState={
    affection:body.affection??50,
    playerName,
    playerNickname:normalizePlayerNickname(body.playerNickname),
    confession:body.confession===true,
    relationshipStage:body.relationshipStage||'',
    cBand:body.cBand||''
  };
  const relationshipLines=relationshipPromptLines(relationshipState,body.language);
  const lifeLines=lifePromptLines(body.life,body.language);
  const memoryStoreLines=memoryPromptLines(body.memoryStore,body.language);
  const expansionLines=expansionPromptLines(body.expansion,body.language,{mood:true});
  const coReadingLines=body.expansion?.coReading?.active?coReadingPromptLines(body.language):[];
  const handbookLines=body.expansion?.enabled?.handbook?handbookPromptLines(body.expansion,body.language):[];
  const safetyLines=[...safetyPromptLines(body.safety,body.language),...touchPromptLines(body.language)];
  const keyChoiceLines=body.pendingKeyChoice?keyChoicePromptLines(body.pendingKeyChoice,body.language):[];
  const actionWhitelist=allowedActionTags(body.life);
  const actionRule=body.language==='en'
    ?`Action whitelist: ${actionWhitelist.join(', ')||'(none at this location)'}. Use at most ${GAME_CONFIG.actions.maxPerReply} tags from this list; omit anything that does not fit the current location and activity.`
    :`動作白名單：${actionWhitelist.join('、')||'（目前位置沒有可用動作）'}。最多使用 ${GAME_CONFIG.actions.maxPerReply} 個標籤；不符合目前位置與活動就省略。`;
  return [/* 現有返回值 */, actionRule].join('\n');
}
// ... [其餘 server.js 內容] ...
export function prompt(body={}){return buildPrompt(body,false);}function compactRequestPrompt(body={}){return body.probe?modelCheckPrompt(body.language==='en'?'en':'zh'):buildPrompt(body,true);}export function requestPrompt(body={}){return compactRequestPrompt(body);}
// ... [其餘 server.js 內容] ...