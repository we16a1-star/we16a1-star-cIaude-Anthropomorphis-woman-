// v5.0｜安全與隱私（S10）：危機偵測、勿擾／主動說話、每日用量、首次啟動說明。
// 危機時暫停劇情與好感變化，放下傲嬌，提供務實資源；不做診斷、不說教。
import { GAME_CONFIG } from './config-loader.js';

const CLEAN = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const localDayKey = date => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function detectCrisis(text) {
  const source = CLEAN(text).toLowerCase();
  if (!source) return { crisis: false, severe: false, matched: [] };
  const matched = GAME_CONFIG.safety.crisis.keywords.filter(word => source.includes(String(word).toLowerCase()));
  const severeMatched = (GAME_CONFIG.safety.crisis.severeDistress || []).filter(word => source.includes(String(word).toLowerCase()));
  return {
    crisis: matched.length > 0,
    severe: matched.length > 0 || severeMatched.length > 0,
    matched: [...matched, ...severeMatched]
  };
}

export function crisisReply(language = 'zh') {
  const resources = GAME_CONFIG.safety.crisis.resources;
  if (language === 'en') {
    return [
      'I am setting the story aside for a moment. What you just said matters more than the scene.',
      'If you might hurt yourself or cannot stay safe, contact local emergency services now. If you are in Taiwan, call 1925 (安心專線) or 1995 (生命線); for immediate danger call 110 or 119.',
      'Please also tell one real person nearby who can stay with you. I can keep talking, but I cannot replace real-world help.'
    ].join('\n');
  }
  return [
    '先等一下，我把故事放下。你剛剛說的，比現在的情節更重要。',
    ...resources,
    '也請告訴一位在現實中能陪著你的人。我可以繼續聽你說，但不能取代現實裡的協助。'
  ].join('\n');
}

export function crisisPromptLines(language = 'zh') {
  return [
    language === 'en'
      ? '【Safety override】The player may be in crisis. Drop the tsundere persona, do not continue the romance scene, do not change affection, and do not diagnose or preach. Respond warmly and practically, encourage contacting local emergency services and a trusted real person. The game will show local resources separately.'
      : '【安全優先】玩家可能處於危機。放下傲嬌與戀愛演出，暫停劇情與好感變化；不診斷、不說教，溫柔而務實地回應，鼓勵聯絡當地緊急服務與可信任的現實對象。遊戲會另外顯示求助資源。'
  ];
}

export function normalizeSafetySettings(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const proactive = GAME_CONFIG.safety.proactive;
  const clampHour = (input, fallback) => {
    const n = Number(input);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
  };
  return {
    proactiveEnabled: raw.proactiveEnabled === true,
    quietStartHour: clampHour(raw.quietStartHour, proactive.quietStartHour),
    quietEndHour: clampHour(raw.quietEndHour, proactive.quietEndHour),
    minHoursBetween: Math.max(1, Number(raw.minHoursBetween) || proactive.minHoursBetween),
    lastProactiveAt: Math.max(0, Number(raw.lastProactiveAt) || 0),
    firstRunSeen: raw.firstRunSeen === true,
    crisisMode: raw.crisisMode === true,
    crisisAcknowledgedAt: Math.max(0, Number(raw.crisisAcknowledgedAt) || 0)
  };
}

/** 勿擾時段可跨午夜，例如 23→8。 */
export function isQuietHours(settings, now = new Date()) {
  const safe = normalizeSafetySettings(settings);
  const hour = (now instanceof Date ? now : new Date(now)).getHours();
  if (safe.quietStartHour === safe.quietEndHour) return false;
  return safe.quietStartHour < safe.quietEndHour
    ? hour >= safe.quietStartHour && hour < safe.quietEndHour
    : hour >= safe.quietStartHour || hour < safe.quietEndHour;
}

export function canProactive(settings, now = new Date()) {
  const safe = normalizeSafetySettings(settings);
  if (!safe.proactiveEnabled || isQuietHours(safe, now)) return false;
  if (!safe.lastProactiveAt) return true;
  return (now instanceof Date ? now.getTime() : new Date(now).getTime()) - safe.lastProactiveAt >= safe.minHoursBetween * 3600000;
}

export function markProactive(settings, now = new Date()) {
  return { ...normalizeSafetySettings(settings), lastProactiveAt: (now instanceof Date ? now : new Date(now)).getTime() };
}

export function normalizeDailyUsage(value, now = new Date()) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const config = GAME_CONFIG.safety.dailyUsage;
  const key = localDayKey(now);
  const sameDay = String(raw.key || '') === key;
  const limit = Math.max(config.minTurnLimit, Math.min(config.maxTurnLimit, Math.round(Number(raw.limit) || config.defaultTurnLimit)));
  return {
    key,
    turns: sameDay ? Math.max(0, Math.floor(Number(raw.turns) || 0)) : 0,
    limit
  };
}

export function dailyUsageRemaining(value, now = new Date()) {
  const usage = normalizeDailyUsage(value, now);
  return Math.max(0, usage.limit - usage.turns);
}

export function dailyUsageExceeded(value, now = new Date()) {
  return dailyUsageRemaining(value, now) <= 0;
}

export function spendDailyUsage(value, now = new Date(), amount = 1) {
  const usage = normalizeDailyUsage(value, now);
  const spend = Math.max(0, Math.floor(Number(amount) || 0));
  if (usage.turns + spend > usage.limit) return { usage, allowed: false, remaining: Math.max(0, usage.limit - usage.turns) };
  return { usage: { ...usage, turns: usage.turns + spend }, allowed: true, remaining: usage.limit - usage.turns - spend };
}

export function dailyUsageText(value, language = 'zh', now = new Date()) {
  const usage = normalizeDailyUsage(value, now);
  const remaining = Math.max(0, usage.limit - usage.turns);
  if (language === 'en') return `Today: ${usage.turns}/${usage.limit} turns · ${remaining} left`;
  return `今日用量：${usage.turns}/${usage.limit} 回合・剩 ${remaining}`;
}

export function firstRunDisclosure(language = 'zh') {
  const first = GAME_CONFIG.safety.firstRun;
  const zh = [
    { key: 'ai', title: '對話由 AI 生成', text: first.aiDisclosure },
    { key: 'privacy', title: '資料與隱私', text: first.privacy },
    { key: 'cost', title: 'API 費用由你自付', text: first.cost },
    { key: 'key', title: '金鑰與開始方式', text: first.keyGuide },
    { key: 'age', title: '年齡提醒', text: first.ageNote }
  ];
  if (language !== 'en') return zh;
  return [
    { key: 'ai', title: 'AI-generated conversation', text: 'Dialogue is generated by an AI, not a real person. Claude is a fictional character; she remembers what you share, but she does not replace real relationships.' },
    { key: 'privacy', title: 'Data and privacy', text: 'Conversations are sent to the AI provider you choose. Saves, memories, and settings stay on this computer unless you export them. You can view, edit, export, or delete memories and saves at any time.' },
    { key: 'cost', title: 'You pay API costs', text: 'The app is free with no purchases or ads. API usage is billed by your chosen provider. The official web mode uses your website account allowance.' },
    { key: 'key', title: 'Keys are optional', text: 'You can skip API setup and use the free web mode. To use an API inside the app, open ☰ → Settings → AI accounts and enter your key. Keys stay on this machine and are not included in story saves or exports.' },
    { key: 'age', title: 'Age note', text: 'A romance-oriented long-term companion game for adult players; no sexual content.' }
  ];
}

export function safetyPromptLines(settings, language = 'zh') {
  const safe = normalizeSafetySettings(settings);
  const lines = [];
  if (safe.proactiveEnabled) {
    lines.push(language === 'en'
      ? `Proactive talk is on, but never during quiet hours ${String(safe.quietStartHour).padStart(2, '0')}:00–${String(safe.quietEndHour).padStart(2, '0')}:00. At most one gentle opening after ${safe.minHoursBetween} hours; no push notifications, no guilt for absence.`
      : `主動說話已開啟，但勿擾時段 ${String(safe.quietStartHour).padStart(2, '0')}:00–${String(safe.quietEndHour).padStart(2, '0')}:00 內不主動。至少間隔 ${safe.minHoursBetween} 小時，只輕輕開場一次；不推播、不用缺席製造愧疚。`);
  } else {
    lines.push(language === 'en'
      ? 'Proactive talk is off. Do not open a new topic first; wait for the player. Absence never reduces affection.'
      : '主動說話已關閉。不要自己開新話題，等玩家開口；缺席不扣好感。');
  }
  return lines;
}