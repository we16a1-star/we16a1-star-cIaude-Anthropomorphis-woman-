import dotenv from 'dotenv';
import express from 'express'; import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openingStylePrompt} from '../www/opening-styles.js'; import {craftRules,filteredPromptRules,promptTweaksExtraLines,authorNoteLines} from '../www/prompt-rules.js'; import {worldBookPromptLines} from '../www/world-book.js';
import {affectionStageOf,normalizeMilestoneKey,normalizeStoryClock,realStoryClock,stageByKey,storyClockLabel} from '../www/story-clock.js';
import {budgetFor,clipTail,clipHead,ANTHROPIC_CACHE_SYSTEM,OPENAI_REASONING_EFFORT,OUTPUT_TARGET,outputTargetLines} from '../www/token-budget.js';
import {normalizeSpecialEventKey,specialEventPromptLines} from '../www/special-events.js';
import {evaluateModelCheck} from '../www/model-check.js';
import {DEFAULT_CHARACTER_PROFILE,COMPACT_DEFAULT_CHARACTER_PROFILE} from '../www/character-profile.js';
import {STORY_EMOTIONS,normalizeStoryEmotion,normalizeStoryEmotionIntensity} from '../www/story-emotion.js';
import {normalizeStoryEventFlag,normalizeSeenStoryEventFlags} from '../www/story-events.js';
import {splitThinkingText} from '../www/thinking-splitter.js';
import {normalizeSpokenEnList} from '../www/voice-tts.js';
const app=express();
let desktopToken='';
// CORS：本機 AI 服務只放行本 App 自己的畫面（file:// 的 Origin 是字串 "null"）與本機開發伺服器
// （localhost／127.0.0.1 任一代號埠）。不使用 cors() 預設的全開（*）：其他網站的頁面即使呼叫到
// 這個埠，瀏覽器端也拿不到任何回應標頭；不透明來源（null／file://）另須有桌面 token。
const LOCAL_CORS_ORIGIN=/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
app.use(cors({origin(origin,callback){const opaqueOrigin=origin==='null'||origin==='file://';callback(null,!origin||(opaqueOrigin?Boolean(desktopToken):LOCAL_CORS_ORIGIN.test(origin)));}}));
app.use(express.json({limit:'1mb'}));
const isDirectRun=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isDirectRun) dotenv.config({path:path.resolve(process.cwd(),'.env')});
const PORT=Number(process.env.PORT)||8787;
const API_REQUEST_TIMEOUT_MS=120_000;
app.use('/api',(req,res,next)=>{const origin=req.get('Origin');if((origin==='null'||origin==='file://')&&!desktopToken)return res.status(403).send('file:// 畫面連線需要設定 API_TOKEN');if(desktopToken&&req.get('X-Desktop-Token')!==desktopToken)return res.status(401).send('本機 AI 服務只接受此桌面 App 的請求');next();});
const API_ENV_PREFIX={anthropic:'ANTHROPIC',openai:'OPENAI',gemini:'GEMINI',openrouter:'OPENROUTER',deepseek:'DEEPSEEK',qwen:'QWEN',groq:'GROQ',mistral:'MISTRAL',xai:'XAI'};
const API_PROVIDER_BY_ENV_PREFIX=new Map(Object.entries(API_ENV_PREFIX).map(([provider,prefix])=>[prefix,provider]));
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
    ?'Reply with valid JSON only, fields: narration, affectionDelta, choices, ending, endingText, memory, emotion, intensity, eventFlag (optional spokenEn string array for British English voice lines). emotion must be one of neutral, happy, proud, shy, surprised, dizzy, curious, focused, worried, tender, chosen from her dominant emotion in this turn (not from affectionDelta alone). Use proud when she is quietly pleased with an achievement or waiting for praise; shy when directly praised or cared for; focused when reading, thinking, solving, or listening intently; curious for genuine interest or a question; worried for concern or anxiety; tender for quiet affection or gentle warmth. intensity is integer 1-3 (subtle, clear, strong); neutral uses 1. Keep narration, emotion and intensity consistent. choices must be exactly 7 non-empty and clearly different options. affectionDelta is a number -3 to 3: +2~+3 heartwarming, +1 ordinary, 0 unchanged, -1~-3 for an actual hurtful or trust-damaging action. Declining an invitation, disagreeing, or setting a boundary alone must not reduce affection. No explanation, greeting or markdown around the JSON.'
    :'只輸出有效JSON，欄位：narration、affectionDelta、choices、ending、endingText、memory、emotion、intensity、eventFlag（可選 spokenEn 字串陣列供英式英文配音）；emotion 必須是 neutral、happy、proud、shy、surprised、dizzy、curious、focused、worried、tender 之一，依本回合主要情緒判斷，不能只按好感變化推測。得意、核對成功後暗自滿意或悄悄等稱讚時用 proud；被直接稱讚或關心而害羞時用 shy；閱讀、思考、解題或認真聆聽時用 focused；真正好奇或發問時用 curious；擔心或心疼時用 worried；溫柔眷戀時用 tender；平常安靜讀書用 neutral。intensity 必須是 1～3 整數，分別代表輕微、明顯、強烈，neutral 固定為 1；旁白、emotion、intensity 必須一致。JSON 前後不要任何解釋或 markdown，choices 恰好7個非空且彼此不同，只輸出 JSON 本體。affectionDelta 為 -3～+3：心動或信任增加為正；負值只用於實際傷害或破壞信任的行動。婉拒邀請、不同意或表達界線本身不扣好感。';
  // 追加八：story 模式才額外允許（非要求）timeAdvance；批4：real＝與現實同步（不需 timeAdvance、回報亦忽略）；欄位列表句維持不變。
  const timeNote=clockMode==='story'?(language==='en'
    ?' If this reply naturally covers more story time (e.g., sleeping until the next day), add "timeAdvance" (time slots advanced, integer 0-6) next to the other fields; usually omit it and the system advances one slot.'
    :'若本回合自然涵蓋更長時間（例如一覺到隔天），可在 JSON 最外層加上 "timeAdvance"（推進的時段數，0～6 的整數）；一般情形省略即可，系統會自動推進一個時段。')
    :clockMode==='real'?(language==='en'
    ?' The story time is synced with the real clock and updated automatically by the system; "timeAdvance" is not needed and will be ignored.'
    :'故事時間與現實時間同步、由系統自動更新；不需回報 "timeAdvance"（回報也會被忽略）。'):'';
  const eventNote=language==='en'
    ?' eventFlag must be null or letter|moon_bird|outing_memory|magic_touch|vow. It is only a proposal; the game enforces gates. letter is repeatable; moon_bird requires affection >=25 and night; outing_memory requires affection >=25; magic_touch requires affection >=50 and night; vow requires affection >=75. Do not reuse completed one-shot flags.'
    :' eventFlag 必須是 null 或 letter／moon_bird／outing_memory／magic_touch／vow，只是事件提議，由遊戲端驗證條件。letter 可重複；moon_bird 需好感至少25且夜間；outing_memory 需好感至少25；magic_touch 需好感至少50且夜間；vow 需好感至少75。不可重提已完成的一次性事件。';
  return [t.length,t.choices,t.memory,schema+eventNote+timeNote].join(' ');
}
const CONTINUITY_RULE='沿用記憶和歷史，依因果安排事件和結局；主線或伏筆未收束就繼續，無固定回合數，不拖延或重複。';
// 模型通用性檢測：用一個極短的固定場景驗證 App 真正依賴的 JSON 契約，
// 不跑完整故事、不讀玩家存檔。輸出上限刻意壓低（DeepSeek 的一般回合 4096 下限不套用到這裡）。
const MODEL_CHECK_MAX_TOKENS=1024;
const MODEL_CHECK_SYSTEM='You are a JSON contract tester. Reply with one valid JSON object only; no markdown, no commentary. 你是 JSON 契約測試員，只輸出一個有效 JSON 物件，不要 Markdown 或說明。';
function modelCheckPrompt(language='zh'){
  if(language==='en')return [
    'This is a model compatibility test, not a story turn.',
    'Scene: a rainy night in an old library. The player sets a cup of hot tea on the desk.',
    'Reply with exactly one JSON object using these fields:',
    '{"narration":"her reaction, 60-120 words","affectionDelta":1,"choices":["choice 1","choice 2","choice 3","choice 4","choice 5","choice 6","choice 7"],"ending":false,"endingText":null,"memory":"one short sentence","emotion":"happy","intensity":1}',
    'Rules: narration must be a non-empty string; affectionDelta must be a number; choices must be exactly 7 distinct, concrete options; memory must be a short string; emotion must be neutral, happy, proud, shy, surprised, dizzy, curious, focused, worried, or tender; intensity must be an integer from 1 to 3. Output JSON only.'
  ].join('\n');
  return [
    '這是一個模型相容性測試，不是故事回合。',
    '場景：雨夜的古老圖書館，玩家把一杯熱茶放到桌上。',
    '請只輸出一個 JSON 物件，欄位如下：',
    '{"narration":"她對此的反應，80～150 字","affectionDelta":1,"choices":["選項1","選項2","選項3","選項4","選項5","選項6","選項7"],"ending":false,"endingText":null,"memory":"一句簡短的故事記憶","emotion":"happy","intensity":1}',
    '規則：narration 必須是非空字串；affectionDelta 必須是數字；choices 必須恰好 7 個彼此不同且具體的選項；memory 必須是簡短字串；emotion 必須是 neutral、happy、proud、shy、surprised、dizzy、curious、focused、worried、tender 其中一個；intensity 必須是 1～3 整數。只輸出 JSON 本體。'
  ].join('\n');
}

function outputLanguageInstruction(body){
  return body.language==='en'
    ? 'Write all new narration, dialogue, choices, ending text, and memory in natural English; understand earlier Chinese and continue faithfully.'
    : '所有新旁白、對話、選項、結局文字與記憶均用繁體中文。';
}
function compactPromptText(value, limit, fallback='', fromEnd=false) {
  const text=String(value||fallback).trim();
  if(text.length<=limit)return text;
  const clipped=fromEnd?text.slice(-limit):text.slice(0,limit);
  return clipped.trim()+'…';
}
export function systemInstruction(body={}) {
  const profile=String(body.characterProfile||COMPACT_DEFAULT_CHARACTER_PROFILE).trim();
  return [SYSTEM,'角色設定：',profile,outputLanguageInstruction(body)].join('\n');
}
export function requestSystemInstruction(body={}) {
  if(body.probe)return MODEL_CHECK_SYSTEM;
  const world=String(body.worldSetting||DEFAULT_WORLD).trim();
  const rules=String(body.storyTemplate||DEFAULT_RULES).trim(); const craft=craftRules(body.language);
  return [systemInstruction(body),'世界觀：',world,'劇情規則：',rules,CONTINUITY_RULE,...filteredPromptRules(craft,body.promptTweaks),...promptTweaksExtraLines(body.promptTweaks,body.language),craft.json,outputContract(body.language,realStoryClock(body.storyClock).mode)].join('\n');
}
function buildPrompt(body={},compact=false){
  const fast=body.responseMode==='fast';
  const characterName=String(body.characterName||'Claude娘').slice(0,60);
  const budget=budgetFor(fast?'fast':'quality',body.language);
  const memory=compactPromptText(body.storyMemory,budget.memoryChars,'尚未建立',true);
  const history=Array.isArray(body.history)?body.history:[];
  const recent=history.slice(-budget.historyEntries);
  const roles=recent.map(x=>x?.role);const lastAi=roles.length-1-[...roles].reverse().findIndex(role=>role!=='user');
  const transcript=recent.map((x,i)=>(x.role==='user'?'玩家':x.role==='ending'?'結局':characterName)+'：'+(x.role==='user'?clipHead(x.text,budget.userChars):clipTail(x.text,i===lastAi?budget.aiChars:budget.olderAiChars))).join('\n');
  const isOpening=history.length===0;
  const styleId=String(body.action||'').match(/^__OPENING_STYLE__:([a-z_]+)$/)?.[1]||'rainy_first_meeting';
  const opening=isOpening?openingStylePrompt(styleId,body.language):'';
  const openingIdea=isOpening&&styleId==='custom'?compactPromptText(body.openingCustomPrompt,600):'';
  const action=isOpening?'依序章風格直接開始，不要假設玩家已行動。':String(body.action||'請接續目前故事。').slice(0,2000);
  const size=body.language==='en'
    ?'Memory cap: '+budget.memoryChars+' characters; keep key events, relationships, promises, and open threads.'
    :'記憶上限'+budget.memoryChars+'字；只留重要事件、關係、承諾與伏筆。';
  const endingRule=String(body.storyTemplate||'').includes('三回合接續測試')
    ?'遵守上述三回合測試條件；特殊事件仍依劇情因果自然安排。'
    :CONTINUITY_RULE;
  // 追加八：故事時間（啟用時帶入）與關係階段；里程碑為一次性提示、內容交由 AI 自行決定。
  // 批4：real＝依現實時刻重算並以現實同步語意帶入；story＝原語意；off＝不帶入。
  const storyClock=realStoryClock(body.storyClock);
  const clockLines=storyClock.mode!=='off'?[storyClock.mode==='real'
    ?(body.language==='en'
      ?`Story time: now ${storyClockLabel(storyClock,'en')}, synced with the real clock — the day and time of day follow real time automatically (day +1 at each real midnight); "timeAdvance" is not needed and will be ignored; write this turn against the current time.`
      :`故事時間：現在是 ${storyClockLabel(storyClock,'zh')}，與現實時間同步——天數與時段由系統依現實時刻自動更新（跨現實日界線 +1）；不需回報 "timeAdvance"（回報也會被忽略），請直接依此時間書寫本回合。`)
    :(body.language==='en'
      ?`Story time: now ${storyClockLabel(storyClock,'en')}. The story advances with time; the seven choices should fit the time of day and the relationship stage.`
      :`故事時間：現在是 ${storyClockLabel(storyClock,'zh')}。時間會隨劇情推進；七個選項要符合時間與關係階段，可以出現順著時間的自然行動，不要強迫玩家。`)]:[];
  const milestone=stageByKey(normalizeMilestoneKey(body.pendingMilestone));
  const milestoneLines=milestone?specialEventPromptLines('milestone',body.language):[];
  const completedFlags=normalizeSeenStoryEventFlags(body.storyEventSeen);
  const eventHistory=body.language==='en'
    ?`Completed one-shot event flags for this save: ${completedFlags.join(', ')||'none'}. Propose an eventFlag only when the current scene naturally reaches it; otherwise use null.`
    :`本存檔已完成的一次性事件：${completedFlags.join('、')||'無'}。只有劇情自然到達事件時才提議 eventFlag，否則用 null。`;
  const specialEventLines=specialEventPromptLines(normalizeSpecialEventKey(body.specialEvent),body.language);
  const settings=compact?[]:[
    '角色設定：'+String(body.characterProfile||COMPACT_DEFAULT_CHARACTER_PROFILE).trim(),
    '世界觀：'+String(body.worldSetting||DEFAULT_WORLD).trim(),
    '劇情規則：'+String(body.storyTemplate||DEFAULT_RULES).trim()
  ];
  return [
    ...settings,
    '角色名稱：'+characterName+'；好感度：'+(body.affection??50)+'/100（關係階段：'+affectionStageOf(body.affection??50).zh+'）。',
    ...clockLines,
    ...milestoneLines,
    ...specialEventLines,
    eventHistory,
    '記憶：'+memory,
    '最近'+recent.length+'則對話：\n'+(transcript||'新故事'),
    ...worldBookPromptLines(body.worldBook,transcript+'\n'+action,body.language,{phase:isOpening?'opening':'chat'}),
    ...(isOpening?['序章風格：'+opening]:[]),
    ...(isOpening&&openingIdea?['玩家自訂序章靈感（故事設定參考，仍遵守角色、世界與玩家自主規則）：'+openingIdea]:[]),
    '玩家行動：'+action,
    ...authorNoteLines(body.authorNote,body.language),
    ...(Array.isArray(body.pluginDirectives)?body.pluginDirectives.filter(x=>typeof x==='string'&&x.trim()).slice(0,12).map(x=>x.trim().slice(0,600)):[]),
    compact
      ?size+' 正文先寫場景與角色反應，直接承接玩家行動。'
      :size+' 正文先描寫場景和角色反應再推進行動；不重述既有設定或抄錄台詞。'+endingRule+' '+outputTargetLines(body.language).length+' '+outputTargetLines(body.language).memory+' choices恰好7個彼此明顯不同。'
  ].join('\n');
}
export function prompt(body={}){return buildPrompt(body,false);}
function compactRequestPrompt(body={}){return body.probe?modelCheckPrompt(body.language==='en'?'en':'zh'):buildPrompt(body,true);}
export function requestPrompt(body={}){return compactRequestPrompt(body);}
function extractJsonObject(value){const stripped=splitThinkingText(String(value||'')).body;const raw=stripped.replace(/```(?:json)?\s*/gi,'').replace(/```/g,'');const source=raw;let start=-1,depth=0,inString=false,escaped=false;for(let i=0;i<source.length;i++){const ch=source[i];if(start<0){if(ch==='{'){start=i;depth=1;}continue;}if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}if(ch==='"')inString=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return source.slice(start,i+1).replace(/,\s*([}\]])/g,'$1');}throw Error('模型未回傳完整JSON物件');}
// 選項太長（模型沒照 15～40 字寫）只截短、不整回合丟錯：
// 丟錯＝使用者得手動重打整個回合＝雙倍花費，代價遠大於一顆按鈕字數多幾個字。
function trimChoice(value){
  const text=String(value).trim();
  if(text.length<=OUTPUT_TARGET.choiceHard)return text;
  const head=text.slice(0,OUTPUT_TARGET.choiceHard);
  const cut=Math.max(head.lastIndexOf('。'),head.lastIndexOf('，'),head.lastIndexOf('、'),head.lastIndexOf('；'),head.lastIndexOf(' '));
  const clipped=cut>=OUTPUT_TARGET.choiceMin?head.slice(0,cut):head;
  return clipped.replace(/[，、；。\s]+$/,'')+'…';
}
export function parse(s){const j=JSON.parse(extractJsonObject(s)); if(!j||typeof j!=='object'||Array.isArray(j)||typeof j.narration!=='string'||!j.narration.trim()||typeof j.memory!=='string')throw Error('模型未提供有效故事正文或記憶更新'); if(!Array.isArray(j.choices)||j.choices.length!==7)throw Error('模型必須提供恰好7個選項'); const choices=j.choices.map(x=>typeof x==='string'?trimChoice(x):''); const normalized=choices.map(x=>x.toLocaleLowerCase()); if(choices.some(x=>!x)||new Set(normalized).size!==7)throw Error('模型選項必須是7個非空且彼此不同的文字'); j.choices=choices; j.emotion=normalizeStoryEmotion(j.emotion); j.intensity=normalizeStoryEmotionIntensity(j.intensity); j.eventFlag=normalizeStoryEventFlag(j.eventFlag); const delta=Number(j.affectionDelta); j.affectionDelta=Number.isFinite(delta)?Math.max(-5,Math.min(5,Math.round(delta*100)/100)):0; const advance=Number(j.timeAdvance); if(Number.isFinite(advance))j.timeAdvance=Math.max(0,Math.min(6,Math.round(advance))); else delete j.timeAdvance; const spokenEn=normalizeSpokenEnList(j.spokenEn); if(spokenEn.length)j.spokenEn=spokenEn; else delete j.spokenEn; return j;}
function usageOf(provider,raw){
  if(!raw||typeof raw!=='object')return null;
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  let u;
  if(provider==='anthropic'){const read=n(raw.cache_read_input_tokens),write=n(raw.cache_creation_input_tokens);u={input:n(raw.input_tokens)+read+write,output:n(raw.output_tokens),cached:read,reasoning:0};}
  else if(provider==='gemini'){const thoughts=n(raw.thoughtsTokenCount);u={input:n(raw.promptTokenCount),output:n(raw.candidatesTokenCount)+thoughts,cached:n(raw.cachedContentTokenCount),reasoning:thoughts};}
  else u={input:n(raw.input_tokens??raw.prompt_tokens),output:n(raw.output_tokens??raw.completion_tokens),cached:n(raw.input_tokens_details?.cached_tokens??raw.prompt_tokens_details?.cached_tokens??raw.prompt_cache_hit_tokens),reasoning:n(raw.output_tokens_details?.reasoning_tokens??raw.completion_tokens_details?.reasoning_tokens)};
  return u.input||u.output?u:null;
}
function withUsage(story,provider,raw){const usage=usageOf(provider,raw);if(usage)story._usage=usage;return story;}
function generationConfig(body){const mode=body.responseMode==='fast'?'fast':'quality'; const cap=OUTPUT_TARGET.maxTokens; const defaults=mode==='fast'?{temperature:1.0,topP:0.9,maxTokens:cap.fast}:{temperature:0.85,topP:0.95,maxTokens:cap.quality}; const requested=Number(body.maxTokens); const configured=Number.isFinite(requested)?Math.max(256,Math.min(8192,requested)):defaults.maxTokens; return {mode,temperature:Math.max(0,Math.min(2,Number(body.temperature ?? defaults.temperature))),top_p:Math.max(0,Math.min(1,Number(body.topP ?? defaults.topP))),max_tokens:body.probe?Math.min(configured,MODEL_CHECK_MAX_TOKENS):mode==='fast'?Math.min(configured,cap.fast):configured}}
async function anthropic(body){
  const profile=normalizeAccountProfile(body.accountProfile);const apiKey=requireApiKey('anthropic',profile);const baseURL=process.env[`ANTHROPIC_BASE_URL${profile?'_'+profile:''}`]||process.env.ANTHROPIC_BASE_URL;const c=new Anthropic({apiKey,baseURL,timeout:API_REQUEST_TIMEOUT_MS,maxRetries:1});const g=generationConfig(body);const model=body.model||'claude-sonnet-5';
  const system=requestSystemInstruction(body);
  const request={model,max_tokens:g.max_tokens,system:(ANTHROPIC_CACHE_SYSTEM||model==='claude-fable-5')?[{type:'text',text:system,cache_control:{type:'ephemeral'}}]:system,messages:[{role:'user',content:compactRequestPrompt(body)}]};
  if(!/^claude-(?:opus|sonnet|fable)-5|^claude-(?:opus|sonnet)-4-[78]/i.test(model))request.temperature=g.temperature;
  const r=await c.messages.create(request);const text=r.content?.map(x=>x.text||'').join('')||'';const story=body.probe?{__raw:text}:parse(text);return withUsage(story,'anthropic',r.usage);
}
async function gemini(body){const profile=normalizeAccountProfile(body.accountProfile);const apiKey=requireApiKey('gemini',profile);const baseUrl=process.env[`GEMINI_BASE_URL${profile?'_'+profile:''}`]||process.env.GEMINI_BASE_URL;const ai=new GoogleGenAI({apiKey,httpOptions:{baseUrl,timeout:API_REQUEST_TIMEOUT_MS,retryOptions:{attempts:2}}});const g=generationConfig(body);const model=body.model||'gemini-3.8-flash';const config={systemInstruction:requestSystemInstruction(body),responseMimeType:'application/json',maxOutputTokens:g.max_tokens};if(!/^gemini-3(?:\.|-)/i.test(model)){config.temperature=g.temperature;config.topP=g.top_p;}const r=await ai.models.generateContent({model,contents:compactRequestPrompt(body),config});const text=r.text||'';const story=body.probe?{__raw:text}:parse(text);return withUsage(story,'gemini',r.usageMetadata)}
async function compatible(body){
  const provider=body.provider||'openai';
  const configs={
    openai:{prefix:'OPENAI',base:'https://api.openai.com/v1',fallback:'gpt-6.1-terra'},
    openrouter:{prefix:'OPENROUTER',base:'https://openrouter.ai/api/v1',fallback:'openai/gpt-6.1-terra'},
    deepseek:{prefix:'DEEPSEEK',base:'https://api.deepseek.com',fallback:'deepseek-flash'},
    groq:{prefix:'GROQ',base:'https://api.groq.com/openai/v1',fallback:'openai/gpt-oss-120b'},
    mistral:{prefix:'MISTRAL',base:'https://api.mistral.ai/v1',fallback:'mistral-large-latest'},
    xai:{prefix:'XAI',base:'https://api.x.ai/v1',fallback:'grok-4.7'},
    qwen:{prefix:'QWEN',base:'https://dashscope.aliyuncs.com/compatible-mode/v1',fallback:'qwen3.8-max'}
  };
  const config=configs[provider];
  if(!config) throw Error(`不支援的 AI 服務：${provider}`);
  const profile=normalizeAccountProfile(body.accountProfile);
  const key=requireApiKey(provider,profile);
  const base=process.env[`${config.prefix}_BASE_URL${profile?'_'+profile:''}`]||process.env[`${config.prefix}_BASE_URL`]||config.base;
  const g=generationConfig(body);
  if(provider==='openai'){
    const model=body.model||config.fallback;
    const payload={model,instructions:requestSystemInstruction(body),input:compactRequestPrompt(body),max_output_tokens:g.max_tokens};
    if(/^gpt-(?:5\.6|6)(?:\.1)?-/i.test(model))payload.reasoning={effort:body.probe?'low':(OPENAI_REASONING_EFFORT[g.mode]||'medium')};
    const r=await fetchWithTimeout(base.replace(/\/$/,'')+'/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok)await throwProviderError(r);
    const j=await r.json();const text=j.output_text||j.output?.flatMap(item=>(item.content||[]).filter(part=>part.type==='output_text').map(part=>part.text)).join('')||'';
    const story=body.probe?{__raw:text}:parse(text);
    return withUsage(story,'openai',j.usage);
  }
  const payload={model:body.model||config.fallback,messages:[{role:'system',content:requestSystemInstruction(body)},{role:'user',content:compactRequestPrompt(body)}],temperature:g.temperature,top_p:g.top_p,max_tokens:g.max_tokens};
  // DeepSeek V4 預設開啟 thinking，推理 token 與正式回覆共用 max_tokens。本 App 要求嚴格 JSON
  // （500～700 字旁白＋7 選項＋記憶），推理很容易吃光 3000～3600 的上限，導致 content 空白或
  // JSON 被截斷（finish_reason=length），使用者只會看到「無法使用」。這裡明確關閉推理並要求
  // JSON 輸出；非推理模式仍足夠寫小說，且回覆長度與格式才穩定。
  if(provider==='deepseek'){
    payload.thinking={type:'disabled'};
    payload.response_format={type:'json_object'};
    if(!body.probe)payload.max_tokens=Math.max(g.max_tokens,4096);
  }
  const sendChat=payload=>fetchWithTimeout(base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let r=await sendChat(payload);
  // 少數 DeepSeek 相容模型／舊版端點不接受 thinking 或 response_format；遇到 400 時移除這兩個
  // 選用欄位重試一次，避免「關閉推理」反而讓 API 模式完全不能用。
  if(!r.ok&&provider==='deepseek'&&r.status===400){
    const compatiblePayload={...payload};delete compatiblePayload.thinking;delete compatiblePayload.response_format;
    r=await sendChat(compatiblePayload);
  }
  if(!r.ok)await throwProviderError(r); const j=await r.json(); const choice=j.choices?.[0]; const content=choice?.message?.content||'';
  if(!content.trim()&&provider==='deepseek'&&choice?.message?.reasoning_content){
    if(body.probe)return withUsage({__raw:''},provider,j.usage);
    throw Error(`DeepSeek 只回傳推理內容、沒有正式 JSON 回覆${choice.finish_reason==='length'?'（推理佔滿輸出上限）':''}。請重試本回合。`);
  }
  if(body.probe)return withUsage({__raw:content},provider,j.usage);
  try{return withUsage(parse(content),provider,j.usage);}catch(error){
    if(choice?.finish_reason==='length')throw Error('AI 回覆在輸出上限前被截斷（finish_reason=length）。請重試本回合，或把「AI 回覆生成速度」改成「很快回覆」以縮短輸出。');
    throw error;
  }
}
function parseProbeReply(raw){
  const text=String(raw||'');
  if(!text.trim())return {story:null,error:'模型沒有回傳內容（可能被輸出上限截斷或服務未回傳正文）。'};
  try{return {story:JSON.parse(extractJsonObject(text))};}
  catch(e){return {story:null,error:'模型回覆不是可解析的 JSON：'+String(e?.message||e).slice(0,120)};}
}
// 開發端與 App 內共用：檢查目前選定的 API 模型是否真的遵守本 App 的 JSON 契約。
// 只送一段固定短場景，不讀玩家存檔；輸出上限 1024，成本遠低於一個完整回合。
export async function probeModel(body={}){
  const provider=String(body.provider||'').trim();
  const model=String(body.model||'').trim();
  const language=body.language==='en'?'en':'zh';
  if(!/^(anthropic|openai|gemini|openrouter|deepseek|qwen|groq|mistral|xai)$/.test(provider))throw Error('不支援的 AI 服務：'+provider);
  const started=Date.now();
  let raw='';
  try{
    const probeBody={...body,probe:true,history:[],action:'__MODEL_CHECK__',responseMode:'fast',maxTokens:MODEL_CHECK_MAX_TOKENS,language};
    const result=provider==='gemini'?await gemini(probeBody):provider==='anthropic'?await anthropic(probeBody):await compatible(probeBody);
    raw=String(result?.__raw||'');
  }catch(e){
    return evaluateModelCheck(null,{provider,model,latencyMs:Date.now()-started,connected:false,error:String(e?.message||e).slice(0,300)});
  }
  const parsed=parseProbeReply(raw);
  return evaluateModelCheck(parsed.story,{provider,model,latencyMs:Date.now()-started,connected:true,parseError:parsed.error});
}
const IMAGE_REQUEST_TIMEOUT_MS=90_000;
function isSafeCustomImageBaseUrl(raw){
  try{
    const u=new URL(String(raw||'').trim());
    if(u.protocol==='https:')return true;
    if(u.protocol==='http:'&&/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname))return true;
    return false;
  }catch{return false;}
}
async function generateImage(body={}){
  const provider=String(body.provider||'gemini').trim().toLowerCase();
  const promptText=String(body.prompt||'').trim().slice(0,4000);
  if(!promptText){const e=new Error('缺少圖片生成提示詞（prompt）');e.status=400;throw e;}
  const size=String(body.size||'1536x1024').trim();
  const profile=normalizeAccountProfile(body.accountProfile);
  const started=Date.now();

  if(provider==='gemini'){
    const apiKey=requireApiKey('gemini',profile);
    const baseUrl=process.env[`GEMINI_BASE_URL${profile?'_'+profile:''}`]||process.env.GEMINI_BASE_URL;
    const model=String(body.model||'gemini-2.5-flash-image').trim();
    const ai=new GoogleGenAI({apiKey,httpOptions:{baseUrl,timeout:IMAGE_REQUEST_TIMEOUT_MS,retryOptions:{attempts:1}}});
    if(/^imagen-/i.test(model)){
      const aspect=size==='1024x1024'?'1:1':(size==='1024x1536'?'3:4':'16:9');
      const r=await ai.models.generateImages({model,prompt:promptText,config:{numberOfImages:1,aspectRatio:aspect}});
      const b64=r?.generatedImages?.[0]?.image?.imageBytes||'';
      if(!b64)throw Error('Imagen 未回傳圖片資料');
      return {ok:true,provider,model,mime:'image/png',dataUrl:`data:image/png;base64,${b64}`,latencyMs:Date.now()-started};
    }
    const r=await ai.models.generateContent({model,contents:promptText,config:{responseModalities:['IMAGE','TEXT']}});
    const parts=r?.candidates?.[0]?.content?.parts||[];
    const imgPart=parts.find(p=>p?.inlineData?.data);
    if(!imgPart)throw Error('Gemini 生圖模型未回傳圖片內容（請確認所選模型支援影像輸出）');
    const mime=imgPart.inlineData.mimeType||'image/png';
    return {ok:true,provider,model,mime,dataUrl:`data:${mime};base64,${imgPart.inlineData.data}`,latencyMs:Date.now()-started};
  }

  if(provider==='openai'||provider==='compatible'){
    const isCustom=provider==='compatible';
    const customBase=String(body.baseUrl||'').trim();
    if(isCustom&&!isSafeCustomImageBaseUrl(customBase)){
      const e=new Error('自訂生圖端點網址必須為 https:// 或本機 http://127.0.0.1 / localhost');
      e.status=400;throw e;
    }
    const apiKey=isCustom?(String(body.apiKey||process.env.CUSTOM_IMAGE_API_KEY||process.env.OPENAI_API_KEY||'').trim()):requireApiKey('openai',profile);
    const base=isCustom?customBase.replace(/\/+$/,''):(process.env[`OPENAI_BASE_URL${profile?'_'+profile:''}`]||process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'');
    const model=String(body.model||(isCustom?'flux':'gpt-image-1')).trim();
    const headers={'Content-Type':'application/json',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})};

    // 支援本機 Automatic1111 / Forge WebUI（/sdapi/v1/txt2img）
    if(isCustom&&/\/sdapi\/v1\/txt2img$/i.test(base)){
      const [w,h]=size.split('x').map(n=>Math.max(512,Math.min(1536,Number(n)||1024)));
      const r=await fetchWithTimeout(base,{method:'POST',headers,body:JSON.stringify({prompt:promptText,width:w,height:h,steps:24})});
      if(!r.ok)await throwProviderError(r);
      const j=await r.json();
      const b64=j?.images?.[0]||'';
      if(!b64)throw Error('本機 SD WebUI 未回傳圖片');
      return {ok:true,provider,model,mime:'image/png',dataUrl:`data:image/png;base64,${b64}`,latencyMs:Date.now()-started};
    }

    const endpoint=/\/images\/generations$/i.test(base)?base:`${base}/images/generations`;
    const payload={model,prompt:promptText,n:1,size:size==='1536x1024'&&model==='dall-e-3'?'1792x1024':size};
    if(!/^gpt-image-/i.test(model))payload.response_format='b64_json';
    const r=await fetchWithTimeout(endpoint,{method:'POST',headers,body:JSON.stringify(payload)});
    if(!r.ok)await throwProviderError(r);
    const j=await r.json();
    const first=j?.data?.[0];
    if(first?.b64_json){
      return {ok:true,provider,model,mime:'image/png',dataUrl:`data:image/png;base64,${first.b64_json}`,latencyMs:Date.now()-started};
    }
    if(first?.url&&/^https:\/\//i.test(first.url)){
      const imgRes=await fetchWithTimeout(first.url,{method:'GET'});
      if(!imgRes.ok)throw Error(`無法下載遠端生圖結果（HTTP ${imgRes.status}）`);
      const mime=imgRes.headers.get('content-type')||'image/png';
      const b64=Buffer.from(await imgRes.arrayBuffer()).toString('base64');
      return {ok:true,provider,model,mime,dataUrl:`data:${mime};base64,${b64}`,latencyMs:Date.now()-started};
    }
    throw Error('生圖 API 未回傳有效圖片資料');
  }

  const e=new Error(`不支援的圖片生成供應商：${provider}（僅支援 gemini、openai、compatible）`);
  e.status=400;throw e;
}
app.get('/api/health',(req,res)=>res.json({ok:true,apiVersion:'2.1-harness',capabilities:{story:true,modelCheck:true,imageGen:true},emotions:STORY_EMOTIONS,profiles:configuredProfiles()}));
app.get('/api/debug/status',(req,res)=>res.json({
  ok:true,
  apiVersion:'2.1-harness',
  capabilities:{story:true,modelCheck:true,imageGen:true},
  nodeVersion:process.version,
  uptimeSec:Math.round(process.uptime()),
  emotions:STORY_EMOTIONS,
  profiles:configuredProfiles()
}));
app.post('/api/story',async(req,res)=>{try{const b=req.body||{};let out=b.provider==='gemini'?await gemini(b):b.provider==='anthropic'?await anthropic(b):await compatible(b);res.json(out)}catch(e){console.error(e);const message=String(e?.message||'AI error');const upstreamStatus=Number(e?.status||e?.statusCode||0);const status=upstreamStatus>=400&&upstreamStatus<=599?upstreamStatus:(/RESOURCE_EXHAUSTED|rate.?limit|quota|too many requests|usage limit/i.test(message)?429:500);res.status(status).json({error:message,status})}});
app.post('/api/image',async(req,res)=>{try{res.json(await generateImage(req.body||{}));}catch(e){console.error(e);const message=String(e?.message||'image generation failed');const upstreamStatus=Number(e?.status||e?.statusCode||0);const status=upstreamStatus>=400&&upstreamStatus<=599?upstreamStatus:(/RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)?429:500);res.status(status).json({error:message,status});}});
app.post('/api/model-check',async(req,res)=>{try{res.json(await probeModel(req.body||{}));}catch(e){res.status(400).json({error:String(e?.message||'model check failed')})}});
export function startApiServer({port=PORT,host='127.0.0.1',token=''}={}){desktopToken=String(token||'');return new Promise((resolve,reject)=>{const server=app.listen(port,host);server.once('listening',()=>resolve(server));server.once('error',reject);});}
// 直接執行（自架網頁版）模式：預設只綁 127.0.0.1（「自架者自己的機器」＝僅本機可用）。
// 要讓同區網的其他裝置連線，必須明確設定 HOST=0.0.0.0（或實際網卡位址），且務必同時
// 設定 API_TOKEN——否則區網內任何裝置（不限瀏覽器）都能直接呼叫 /api，消耗你的 API Key 額度。
// （CORS 白名單只擋瀏覽器；curl 這類非瀏覽器用戶端不受 CORS 限制，所以需要 token。）
if(isDirectRun){const host=String(process.env.HOST||'').trim()||'127.0.0.1';const token=String(process.env.API_TOKEN||'').trim();if(!/^(?:127\.0\.0\.1|localhost|::1|\[::1\])$/i.test(host)&&!token)console.warn(`警告：服務綁定在非本機位址（${host}）且未設定 API_TOKEN，區域網路內任何人都能取用你的 API Key 額度；建議設定 API_TOKEN，或把 HOST 改回 127.0.0.1。`);startApiServer({port:PORT,host,token}).then(()=>console.log(`Claude娘 server listening on ${host}:${PORT}`)).catch(e=>{console.error(e);process.exitCode=1;});}

