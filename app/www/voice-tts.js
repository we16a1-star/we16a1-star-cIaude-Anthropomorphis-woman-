/**
 * voice-tts.js — D20 雙軌語音合成引擎（Claude 英文 · 英國腔 en-GB · Glassy · 正常速度）
 *
 * 播放佇列、記憶體 LRU 快取、連續失敗熔斷與 AudioBus 語音聲道壓低設計，
 * 借鏡自 AnimaVN（https://github.com/JayziLi/AnimaVN，MIT License）
 * 之 `frontend/src/debug/vn/voice.ts` 與 `useVoiceLine.ts`，由本專案獨立改寫為零相依 ESM。
 *
 * 雙軌引擎支援：
 *   1. webspeech      — 瀏覽器／系統 Web Speech API（免金鑰，en-GB 女聲優先匹配＋Glassy 語調調校）
 *   2. local-sovits   — 本機聲紋克隆服務（GPT-SoVITS api_v2 / IndexTTS，支援使用者自備 Claude Glassy 參考音檔）
 *   3. elevenlabs     — ElevenLabs 官方 TTS API（BYOK，支援 eleven_multilingual_v2 與自訂 Voice ID）
 *   4. openai-compat  — OpenAI / Kokoro-FastAPI / Fish Speech 相容 `/v1/audio/speech` API
 *
 * 預設配音規格：
 *   - 口說語言：英文（英國） `en-GB`
 *   - 風格：`Glassy` (`glassy`)
 *   - 速度：正常 (`normal` / `1.0`)
 *   - 字幕搭配：中文字幕＋英式英文配音（僅念角色引號台詞，不念旁白與玩家）
 */

import { audioBus } from './audio-bus.js';

/** 保留 D20 既有啟用開關 Key，確保既有存檔與測試完全相容 */
export const STORAGE_KEY_VOICE_ENABLED = 'claude_novel_voice_tts_v21';
/** 語音設定檔（不含 API Key，可安全讀寫） */
export const STORAGE_KEY_VOICE_CONFIG = 'claude_novel_voice_config_v1';
/** 外接 TTS API Key 專用本機儲存 Key（絕不寫入遊戲存檔，亦不隨匯出檔輸出） */
export const STORAGE_KEY_VOICE_API_KEY = 'claude_novel_voice_api_key_v1';

export const MAX_VOICE_CLIPS = 32;
export const MAX_VOICE_FAILURES = 3;

export const VOICE_PREVIEW_SAMPLE_EN =
  'Good evening. I have checked every footnote twice—do let me know if you would like to read the next page together.';

export const VOICE_PROVIDERS = Object.freeze([
  { id: 'webspeech', label: '瀏覽器／系統內建（Web Speech · 免金鑰）' },
  { id: 'local-sovits', label: '本機聲紋克隆（GPT-SoVITS / IndexTTS）' },
  { id: 'elevenlabs', label: 'ElevenLabs API（高擬真英式語音）' },
  { id: 'openai-compat', label: 'OpenAI 相容 TTS API（OpenAI / Kokoro）' }
]);

export const VOICE_LANGUAGES = Object.freeze([
  { id: 'en-GB', label: '英文（英國） en-GB' },
  { id: 'en-US', label: '英文（美國） en-US' }
]);

export const VOICE_STYLES = Object.freeze({
  glassy: Object.freeze({
    id: 'glassy',
    label: 'Glassy（清亮知性 · glassy）',
    pitch: 1.06,
    rateMultiplier: 1.0,
    preferredWebVoices: Object.freeze([
      'Google UK English Female',
      'Microsoft Libby Online (Natural) - English (United Kingdom)',
      'Microsoft Sonia Online (Natural) - English (United Kingdom)',
      'Microsoft Maisie Online (Natural) - English (United Kingdom)',
      'Microsoft AdaMultilingual Online (Natural) - English (United Kingdom)',
      'Microsoft Hazel Desktop - English (Great Britain)',
      'Microsoft Hazel - English (United Kingdom)',
      'Serena',
      'Martha',
      'Kate'
    ]),
    elevenLabs: Object.freeze({
      modelId: 'eleven_multilingual_v2',
      stability: 0.58,
      similarityBoost: 0.8,
      style: 0.25,
      useSpeakerBoost: true
    }),
    openai: Object.freeze({
      model: 'gpt-4o-mini-tts',
      voice: 'shimmer',
      instructions:
        'Speak in crisp, bright, clear British English (en-GB), glassy and articulate with warm scholarly poise at a normal pace.'
    })
  })
});

export const VOICE_SPEEDS = Object.freeze({
  slow: Object.freeze({ id: 'slow', label: '較慢（0.85x）', rate: 0.85 }),
  normal: Object.freeze({ id: 'normal', label: '正常（1.0x）', rate: 1.0 }),
  fast: Object.freeze({ id: 'fast', label: '較快（1.15x）', rate: 1.15 })
});

/** 細微情緒語調微調（以 Glassy 正常語速為基準，幅度克制以維持角色清亮感） */
const EMOTION_VOICE_NUANCE = Object.freeze({
  neutral:   { pitchDelta: 0.00, rateMul: 1.00 },
  happy:     { pitchDelta: 0.03, rateMul: 1.03 },
  proud:     { pitchDelta: 0.02, rateMul: 1.01 },
  shy:       { pitchDelta: 0.02, rateMul: 0.96 },
  surprised: { pitchDelta: 0.04, rateMul: 1.04 },
  dizzy:     { pitchDelta: -0.02, rateMul: 0.94 },
  curious:   { pitchDelta: 0.03, rateMul: 1.01 },
  focused:   { pitchDelta: -0.02, rateMul: 0.98 },
  gentle:    { pitchDelta: -0.01, rateMul: 0.97 },
  tender:    { pitchDelta: -0.01, rateMul: 0.96 },
  worried:   { pitchDelta: -0.03, rateMul: 0.95 },
  sad:       { pitchDelta: -0.04, rateMul: 0.93 },
  tease:     { pitchDelta: 0.03, rateMul: 1.02 }
});

export const DEFAULT_VOICE_CONFIG = Object.freeze({
  enabled: false,
  provider: 'webspeech',
  language: 'en-GB',
  style: 'glassy',
  speed: 'normal',
  volume: 0.9,
  bilingualEnglish: true,
  dialogueOnly: true,
  interruptOnAdvance: true,
  webVoiceName: '',
  endpointUrl: 'http://127.0.0.1:9880/tts',
  voiceId: 'shimmer',
  modelId: 'gpt-4o-mini-tts',
  refAudioPath: '',
  refPromptText: '',
  refPromptLang: 'en'
});

const PROVIDER_ID_SET = new Set(VOICE_PROVIDERS.map((p) => p.id));
const LANGUAGE_ID_SET = new Set(VOICE_LANGUAGES.map((l) => l.id));
const MALE_VOICE_HINT_RE = /\b(male|george|ryan|daniel|arthur|malcolm|oliver|david|mark|richard|guy|christopher|eric|roger|steffan|thomas|alfie)\b/i;
const FEMALE_VOICE_HINT_RE = /\b(female|libby|sonia|maisie|ada|hazel|serena|martha|kate|susan|fiona|victoria|emily|charlotte|claire|alice|zira|aria|jenny|samantha)\b/i;

function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeVoiceConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const provider = PROVIDER_ID_SET.has(src.provider) ? src.provider : DEFAULT_VOICE_CONFIG.provider;
  const language = LANGUAGE_ID_SET.has(src.language) ? src.language : DEFAULT_VOICE_CONFIG.language;
  const style = Object.prototype.hasOwnProperty.call(VOICE_STYLES, src.style)
    ? src.style
    : DEFAULT_VOICE_CONFIG.style;
  const speed = Object.prototype.hasOwnProperty.call(VOICE_SPEEDS, src.speed)
    ? src.speed
    : DEFAULT_VOICE_CONFIG.speed;
  const volume = Number.isFinite(Number(src.volume))
    ? Math.round(clamp(Number(src.volume), 0, 1) * 100) / 100
    : DEFAULT_VOICE_CONFIG.volume;

  let defaultEndpoint = DEFAULT_VOICE_CONFIG.endpointUrl;
  if (provider === 'elevenlabs') defaultEndpoint = 'https://api.elevenlabs.io/v1';
  else if (provider === 'openai-compat') defaultEndpoint = 'https://api.openai.com/v1/audio/speech';

  return {
    enabled: Boolean(src.enabled),
    provider,
    language,
    style,
    speed,
    volume,
    bilingualEnglish: src.bilingualEnglish !== undefined ? Boolean(src.bilingualEnglish) : true,
    dialogueOnly: src.dialogueOnly !== undefined ? Boolean(src.dialogueOnly) : true,
    interruptOnAdvance: src.interruptOnAdvance !== undefined ? Boolean(src.interruptOnAdvance) : true,
    webVoiceName: typeof src.webVoiceName === 'string' ? src.webVoiceName.trim().slice(0, 140) : '',
    endpointUrl: typeof src.endpointUrl === 'string' && src.endpointUrl.trim()
      ? src.endpointUrl.trim().slice(0, 300)
      : defaultEndpoint,
    voiceId: typeof src.voiceId === 'string' ? src.voiceId.trim().slice(0, 120) : DEFAULT_VOICE_CONFIG.voiceId,
    modelId: typeof src.modelId === 'string' ? src.modelId.trim().slice(0, 120) : DEFAULT_VOICE_CONFIG.modelId,
    refAudioPath: typeof src.refAudioPath === 'string' ? src.refAudioPath.trim().slice(0, 260) : '',
    refPromptText: typeof src.refPromptText === 'string' ? src.refPromptText.trim().slice(0, 300) : '',
    refPromptLang: typeof src.refPromptLang === 'string' && src.refPromptLang.trim()
      ? src.refPromptLang.trim().slice(0, 16)
      : 'en'
  };
}

export function loadVoiceConfig(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  let parsed = {};
  let enabledFlag = null;
  if (store) {
    try {
      const rawCfg = store.getItem(STORAGE_KEY_VOICE_CONFIG);
      if (rawCfg) parsed = JSON.parse(rawCfg) || {};
    } catch (_) {}
    try {
      const rawEnabled = store.getItem(STORAGE_KEY_VOICE_ENABLED);
      if (rawEnabled !== null) enabledFlag = rawEnabled === 'true';
    } catch (_) {}
  }
  const merged = { ...DEFAULT_VOICE_CONFIG, ...parsed };
  if (enabledFlag !== null) merged.enabled = enabledFlag;
  return normalizeVoiceConfig(merged);
}

export function saveVoiceConfig(patch, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const current = loadVoiceConfig(store);
  const next = normalizeVoiceConfig({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
  if (store) {
    try {
      store.setItem(STORAGE_KEY_VOICE_ENABLED, String(next.enabled));
    } catch (_) {}
    try {
      store.setItem(STORAGE_KEY_VOICE_CONFIG, JSON.stringify(next));
    } catch (_) {}
  }
  return next;
}

export function loadVoiceApiKey(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return '';
  try {
    return String(store.getItem(STORAGE_KEY_VOICE_API_KEY) || '').trim();
  } catch (_) {
    return '';
  }
}

export function saveVoiceApiKey(key, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const clean = String(key || '').trim();
  if (store) {
    try {
      if (clean) store.setItem(STORAGE_KEY_VOICE_API_KEY, clean);
      else store.removeItem(STORAGE_KEY_VOICE_API_KEY);
    } catch (_) {}
  }
  return clean;
}

/**
 * 檢查外接 TTS 服務位址安全性：
 * 允許 https://，或本機／區網／Tailscale 的 http://（比照 AnimaVN 區域網路語音服務規格），
 * 封鎖 javascript: / file: / data: 與公開網際網路明文 http://。
 */
export function isSafeTtsEndpointUrl(urlString) {
  const raw = String(urlString || '').trim();
  if (!raw) return false;
  let u;
  try {
    u = new URL(raw);
  } catch (_) {
    return false;
  }
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.ts.net')) return true;
  return false;
}

/**
 * 計算 Glassy 風格於不同語速與情緒下的最終語速／音高參數。
 */
export function computeGlassyProsody(config = DEFAULT_VOICE_CONFIG, emotion = 'neutral') {
  const cfg = normalizeVoiceConfig(config);
  const stylePreset = VOICE_STYLES[cfg.style] || VOICE_STYLES.glassy;
  const speedPreset = VOICE_SPEEDS[cfg.speed] || VOICE_SPEEDS.normal;
  const nuance = EMOTION_VOICE_NUANCE[emotion] || EMOTION_VOICE_NUANCE.neutral;
  const rate = Math.round(clamp(speedPreset.rate * stylePreset.rateMultiplier * nuance.rateMul, 0.65, 1.5) * 100) / 100;
  const pitch = Math.round(clamp(stylePreset.pitch + nuance.pitchDelta, 0.85, 1.25) * 100) / 100;
  return {
    lang: cfg.language,
    style: cfg.style,
    speed: cfg.speed,
    rate,
    pitch,
    volume: cfg.volume
  };
}

/**
 * 清理台詞字串以供語音朗讀：移除行內標籤、括號動作描寫、前後引號與 Markdown 標記。
 */
export function sanitizeTextForSpeech(text) {
  let s = String(text || '');
  s = s.replace(/<(emotion|sprite|scene|bg)\s*[:：][^>\n]{1,40}>/gi, ' ');
  s = s.replace(/\[(emotion|sprite|scene|bg)\s*[:：][^\]\n]{1,40}\]/gi, ' ');
  s = s.replace(/[<＜]\s*我\s*[>＞]/g, ' ');
  s = s.replace(/（[^（）]{1,80}）/g, ' ');
  s = s.replace(/\([^()]{1,80}\)/g, ' ');
  s = s.replace(/[*_`~]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[「『“"']+|[」』”"']+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * 判斷文本是否以英文口語為主（避免把純中文誤送進 en-GB Web Speech 造成無聲或逐字唸錯）。
 */
export function looksLikeEnglishSpeech(text) {
  const clean = sanitizeTextForSpeech(text);
  if (!clean) return false;
  const latin = (clean.match(/[A-Za-z]/g) || []).length;
  const cjk = (clean.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  if (latin < 2) return false;
  if (cjk === 0) return true;
  return latin / (latin + cjk) >= 0.45;
}

/**
 * 正規化 AI 回傳的可選 `spokenEn` 欄位（支援 string[] 或換行分隔字串；缺失回空陣列，絕不報錯）。
 */
export function normalizeSpokenEnList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => sanitizeTextForSpeech(typeof item === 'string' ? item : ''))
      .filter((s) => s.length > 0 && looksLikeEnglishSpeech(s));
  }
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n+/)
      .map((part) => sanitizeTextForSpeech(part))
      .filter((s) => s.length > 0 && looksLikeEnglishSpeech(s));
  }
  return [];
}

/**
 * 產生附帶於提示詞的可選英文口白指示（僅於繁中介面且開啟「中文字幕＋英式英文配音」時附掛）。
 */
export function voicePromptRule(uiLanguage = 'zh', config = DEFAULT_VOICE_CONFIG) {
  const cfg = normalizeVoiceConfig(config);
  if (!cfg.enabled || !cfg.bilingualEnglish) return '';
  if (uiLanguage === 'en') return '';
  return '（語音配音已啟用：請於 JSON 額外附帶可選欄位 "spokenEn"，為字串陣列，依序對應本回合克勞德「引號內說出口的每一句台詞」之自然英式英文（en-GB，Glassy 清亮口吻）翻譯，不含旁白、括號動作或玩家台詞；句數與角色對話句對齊。）';
}

/**
 * 將 `spokenEn` 陣列精準對齊至結構化 `VNLine[]`（僅對齊角色對話句，跳過旁白、動作與玩家句）。
 * - 英文劇情或已含英文台詞：若無 spokenEn，直接採用乾淨後的英文原句。
 * - 繁中劇情＋有 spokenEn：逐句綁定至 `kind === 'dialogue' && !player` 的句子。
 * - 若 spokenEn 條數多於對話句數，剩餘英文句會平滑合併至最後一句對話；若較少，未配對句留空不重複念。
 */
export function attachSpokenEnToLines(lines, spokenEnRaw = [], options = {}) {
  if (!Array.isArray(lines)) return [];
  const cfg = normalizeVoiceConfig(options.config || DEFAULT_VOICE_CONFIG);
  const uiLanguage = options.uiLanguage === 'en' ? 'en' : 'zh';
  const spokenList = normalizeSpokenEnList(spokenEnRaw);

  const normalized = lines.map((entry) => {
    if (typeof entry === 'string') {
      return { text: entry, speaker: null, kind: 'narration', emotion: null, scene: null, player: false, spokenText: null };
    }
    return { ...entry, spokenText: entry.spokenText || null };
  });

  const dialogueIndices = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const line = normalized[i];
    if (line.player) continue;
    const isDialogue = line.kind === 'dialogue';
    if (cfg.dialogueOnly && !isDialogue) continue;
    dialogueIndices.push(i);
  }

  if (spokenList.length > 0 && dialogueIndices.length > 0) {
    for (let k = 0; k < dialogueIndices.length; k += 1) {
      const targetIdx = dialogueIndices[k];
      if (k < spokenList.length) {
        if (k === dialogueIndices.length - 1 && spokenList.length > dialogueIndices.length) {
          normalized[targetIdx].spokenText = spokenList.slice(k).join(' ');
        } else {
          normalized[targetIdx].spokenText = spokenList[k];
        }
      }
    }
    return normalized;
  }

  // 無外部 spokenEn 時（例如英文介面或 AI 省略該欄位）：僅針對英文對話直接提煉朗讀文本
  for (const idx of dialogueIndices) {
    const clean = sanitizeTextForSpeech(normalized[idx].text);
    if (!clean) continue;
    if (uiLanguage === 'en' || looksLikeEnglishSpeech(clean)) {
      normalized[idx].spokenText = clean;
    } else if (!cfg.bilingualEnglish && cfg.provider !== 'webspeech') {
      // 玩家主動關閉「中字英配」且使用支援多語系的外接引擎時，直接送原句
      normalized[idx].spokenText = clean;
    }
  }

  return normalized;
}

/**
 * 自系統／瀏覽器可用語音清單中挑出最適合「en-GB · Glassy」的英式女聲。
 */
export function pickBestEnGbVoice(voices = [], preferredName = '', targetLang = 'en-GB') {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return { voice: null, isTrueEnGb: false, matchReason: 'no-voices' };

  const normLang = (v) => String(v.lang || '').replace('_', '-').toLowerCase();
  const targetLower = String(targetLang || 'en-GB').replace('_', '-').toLowerCase();

  // 1. 使用者明確指定的聲線
  if (preferredName) {
    const exact = list.find((v) => v.name === preferredName);
    if (exact) {
      return {
        voice: exact,
        isTrueEnGb: normLang(exact).startsWith('en-gb'),
        matchReason: 'user-selected'
      };
    }
  }

  // 2. Glassy 偏好英式女聲名單精準匹配
  const preferredNames = VOICE_STYLES.glassy.preferredWebVoices;
  for (const wanted of preferredNames) {
    const wantedLower = wanted.toLowerCase();
    const hit = list.find((v) => String(v.name || '').toLowerCase() === wantedLower);
    if (hit) {
      return {
        voice: hit,
        isTrueEnGb: normLang(hit).startsWith('en-gb'),
        matchReason: 'glassy-preferred-exact'
      };
    }
  }

  // 3. 目標語系（預設 en-GB）評分挑選：偏好自然線上女聲與已知英式女聲，排除男聲
  const targetCandidates = list.filter((v) => normLang(v).startsWith(targetLower));
  if (targetCandidates.length > 0) {
    const scored = targetCandidates
      .map((v) => {
        const name = String(v.name || '');
        let score = 10;
        if (/online|natural|google/i.test(name)) score += 6;
        if (FEMALE_VOICE_HINT_RE.test(name)) score += 8;
        if (MALE_VOICE_HINT_RE.test(name)) score -= 10;
        return { voice: v, score };
      })
      .sort((a, b) => b.score - a.score);
    return {
      voice: scored[0].voice,
      isTrueEnGb: normLang(scored[0].voice).startsWith('en-gb'),
      matchReason: 'target-locale-best'
    };
  }

  // 4. 退回一般英文女聲（清楚標註 isTrueEnGb = false，供設定面板提示安裝英國語音包）
  const englishCandidates = list.filter((v) => normLang(v).startsWith('en'));
  if (englishCandidates.length > 0) {
    const scored = englishCandidates
      .map((v) => {
        const name = String(v.name || '');
        let score = 5;
        if (/online|natural|google/i.test(name)) score += 4;
        if (FEMALE_VOICE_HINT_RE.test(name)) score += 6;
        if (MALE_VOICE_HINT_RE.test(name)) score -= 8;
        return { voice: v, score };
      })
      .sort((a, b) => b.score - a.score);
    return {
      voice: scored[0].voice,
      isTrueEnGb: false,
      matchReason: 'fallback-en-other'
    };
  }

  return { voice: null, isTrueEnGb: false, matchReason: 'no-english-voice' };
}

/**
 * 回傳本機 Web Speech 語音診斷資訊（供設定頁顯示目前配對聲線與 en-GB 安裝引導）。
 */
export function getWebSpeechDiagnostics(config = DEFAULT_VOICE_CONFIG, voicesOverride = null) {
  const cfg = normalizeVoiceConfig(config);
  const supported = Boolean(
    voicesOverride !== null ||
    (typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function')
  );
  if (!supported) {
    return {
      supported: false,
      totalVoices: 0,
      enGbVoices: [],
      englishVoices: [],
      picked: null,
      isTrueEnGb: false,
      matchReason: 'unsupported'
    };
  }
  const voices = Array.isArray(voicesOverride)
    ? voicesOverride
    : (window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : []);
  const norm = (v) => String(v?.lang || '').replace('_', '-').toLowerCase();
  const enGbVoices = voices.filter((v) => norm(v).startsWith('en-gb'));
  const englishVoices = voices.filter((v) => norm(v).startsWith('en'));
  const pick = pickBestEnGbVoice(voices, cfg.webVoiceName, cfg.language);
  return {
    supported: true,
    totalVoices: voices.length,
    enGbVoices,
    englishVoices,
    picked: pick.voice,
    isTrueEnGb: pick.isTrueEnGb,
    matchReason: pick.matchReason
  };
}

/**
 * 建構本機 GPT-SoVITS api_v2 / IndexTTS 請求物件（AnimaVN 相容介面）。
 */
export function buildLocalSovitsRequest(config, text, emotion = 'neutral') {
  const cfg = normalizeVoiceConfig(config);
  if (!isSafeTtsEndpointUrl(cfg.endpointUrl)) {
    throw new Error('語音服務網址不安全或格式無效（僅允許 https:// 或本機／區域網路 http://）。');
  }
  const prosody = computeGlassyProsody(cfg, emotion);
  const body = {
    text: String(text || '').trim(),
    text_lang: cfg.language.toLowerCase().startsWith('en') ? 'en' : 'zh',
    ref_audio_path: cfg.refAudioPath,
    prompt_text: cfg.refPromptText,
    prompt_lang: cfg.refPromptLang || 'en',
    speed_factor: prosody.rate,
    media_type: 'wav',
    streaming_mode: false
  };
  return {
    url: cfg.endpointUrl,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    body
  };
}

/**
 * 建構 ElevenLabs 官方 TTS 請求物件（Glassy 風格參數調校）。
 */
export function buildElevenLabsRequest(config, apiKey, text, emotion = 'neutral') {
  const cfg = normalizeVoiceConfig(config);
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('使用 ElevenLabs 配音前，請先在語音設定填寫 ElevenLabs API Key。');
  const voiceId = String(cfg.voiceId || '').trim();
  if (!voiceId) throw new Error('請先填寫 ElevenLabs Voice ID。');
  const base = (cfg.endpointUrl || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
  if (!isSafeTtsEndpointUrl(base)) {
    throw new Error('ElevenLabs 服務網址格式無效（需為 https://）。');
  }
  const prosody = computeGlassyProsody(cfg, emotion);
  const preset = VOICE_STYLES.glassy.elevenLabs;
  const body = {
    text: String(text || '').trim(),
    model_id: cfg.modelId || preset.modelId,
    voice_settings: {
      stability: preset.stability,
      similarity_boost: preset.similarityBoost,
      style: preset.style,
      use_speaker_boost: preset.useSpeakerBoost,
      speed: prosody.rate
    }
  };
  return {
    url: `${base}/text-to-speech/${encodeURIComponent(voiceId)}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': key
      },
      body: JSON.stringify(body)
    },
    body
  };
}

/**
 * 建構 OpenAI / Kokoro-FastAPI / Fish Speech 相容 `/v1/audio/speech` 請求物件。
 */
export function buildOpenAiCompatRequest(config, apiKey, text, emotion = 'neutral') {
  const cfg = normalizeVoiceConfig(config);
  const url = cfg.endpointUrl || 'https://api.openai.com/v1/audio/speech';
  if (!isSafeTtsEndpointUrl(url)) {
    throw new Error('OpenAI 相容 TTS 服務網址格式無效。');
  }
  const key = String(apiKey || '').trim();
  const isOfficialOpenAi = /^https:\/\/api\.openai\.com\//i.test(url);
  if (isOfficialOpenAi && !key) {
    throw new Error('呼叫 OpenAI 官方 TTS API 需要填寫 API Key。');
  }
  const prosody = computeGlassyProsody(cfg, emotion);
  const preset = VOICE_STYLES.glassy.openai;
  const model = cfg.modelId || preset.model;
  const body = {
    model,
    voice: cfg.voiceId || preset.voice,
    input: String(text || '').trim(),
    speed: prosody.rate,
    response_format: 'mp3'
  };
  if (/gpt-4o.*tts/i.test(model)) {
    body.instructions = preset.instructions;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  return {
    url,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    },
    body
  };
}

function makeClipKey(cfg, text, emotion) {
  return [cfg.provider, cfg.language, cfg.style, cfg.speed, cfg.voiceId, cfg.modelId, cfg.refAudioPath, emotion || 'neutral', text].join('|');
}

export class VoicePlayer {
  constructor(options = {}) {
    this.storage = options.storage || null;
    this.fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.bus = options.audioBus || audioBus;
    this.config = loadVoiceConfig(this.storage);
    this.clips = new Map();
    this.prefetchQueue = [];
    this.prefetchBusy = false;
    this.currentSource = null;
    this.currentUtterance = null;
    this.currentToken = 0;
    this.speaking = false;
    this.failures = 0;
    this.lastError = '';
    this.lastSpokenRequest = null;
    this.listeners = new Set();
    try {
      this.bus.setLevel('voice', this.config.volume);
    } catch (_) {}
  }

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      try { fn(snap); } catch (_) {}
    }
  }

  getSnapshot() {
    return {
      config: { ...this.config },
      speaking: this.speaking,
      failures: this.failures,
      paused: this.failures >= MAX_VOICE_FAILURES,
      lastError: this.lastError,
      cachedCount: this.clips.size,
      hasLastLine: Boolean(this.lastSpokenRequest)
    };
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(patch) {
    const prev = this.config;
    this.config = saveVoiceConfig(patch, this.storage);
    try {
      this.bus.setLevel('voice', this.config.volume);
    } catch (_) {}
    if (!this.config.enabled) {
      this.stop();
    }
    if (
      prev.provider !== this.config.provider ||
      prev.language !== this.config.language ||
      prev.style !== this.config.style ||
      prev.speed !== this.config.speed ||
      prev.voiceId !== this.config.voiceId ||
      prev.endpointUrl !== this.config.endpointUrl ||
      prev.refAudioPath !== this.config.refAudioPath
    ) {
      this.clips.clear();
      this.failures = 0;
      this.lastError = '';
    }
    this.emit();
    return this.getConfig();
  }

  isEnabled() {
    return Boolean(this.config.enabled);
  }

  isSpeaking() {
    return Boolean(this.speaking);
  }

  resetFailures() {
    this.failures = 0;
    this.lastError = '';
    this.emit();
  }

  stop() {
    this.currentToken += 1;
    if (this.currentSource) {
      try { this.currentSource.onended = null; } catch (_) {}
      try { this.currentSource.stop(); } catch (_) {}
      try { this.currentSource.disconnect(); } catch (_) {}
      this.currentSource = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    this.currentUtterance = null;
    if (this.speaking) {
      this.speaking = false;
      try { this.bus.duck('voice', false); } catch (_) {}
    }
    this.emit();
  }

  /**
   * 預先合成接下來幾句英文角色台詞（僅外接引擎需要；串列執行避免打爆本機顯卡／API）。
   */
  prefetchLines(lines = []) {
    if (!this.config.enabled || this.config.provider === 'webspeech') return;
    if (this.failures >= MAX_VOICE_FAILURES) return;
    const reqs = [];
    for (const line of Array.isArray(lines) ? lines : []) {
      if (!line || line.player) continue;
      if (this.config.dialogueOnly && line.kind !== 'dialogue') continue;
      const text = sanitizeTextForSpeech(line.spokenText || '');
      if (!text) continue;
      const emotion = line.emotion || 'neutral';
      const key = makeClipKey(this.config, text, emotion);
      if (!this.clips.has(key)) reqs.push({ key, text, emotion });
    }
    this.prefetchQueue = reqs.slice(0, 6);
    void this.pumpPrefetch();
  }

  async pumpPrefetch() {
    if (this.prefetchBusy) return;
    this.prefetchBusy = true;
    try {
      while (this.prefetchQueue.length > 0) {
        if (!this.config.enabled || this.config.provider === 'webspeech' || this.failures >= MAX_VOICE_FAILURES) {
          this.prefetchQueue = [];
          break;
        }
        const job = this.prefetchQueue.shift();
        if (!job || this.clips.has(job.key)) continue;
        try {
          const buf = await this.fetchExternalAudio(job.text, job.emotion);
          this.putClip(job.key, buf);
          this.failures = 0;
          this.lastError = '';
        } catch (err) {
          this.recordExternalFailure(err);
        }
      }
    } finally {
      this.prefetchBusy = false;
    }
  }

  putClip(key, arrayBuffer) {
    if (this.clips.has(key)) this.clips.delete(key);
    this.clips.set(key, arrayBuffer);
    while (this.clips.size > MAX_VOICE_CLIPS) {
      const oldest = this.clips.keys().next().value;
      if (oldest === undefined) break;
      this.clips.delete(oldest);
    }
  }

  recordExternalFailure(err) {
    const msg = err instanceof Error ? err.message : String(err || '語音合成失敗');
    this.lastError = msg;
    const status = Number(err?.status) || 0;
    if (status === 0 || status >= 500 || status === 429) {
      this.failures += 1;
    }
    this.emit();
  }

  async fetchExternalAudio(text, emotion = 'neutral') {
    if (!this.fetchImpl) throw new Error('目前執行環境不支援 fetch 語音請求。');
    const apiKey = loadVoiceApiKey(this.storage);
    let req;
    if (this.config.provider === 'local-sovits') {
      req = buildLocalSovitsRequest(this.config, text, emotion);
    } else if (this.config.provider === 'elevenlabs') {
      req = buildElevenLabsRequest(this.config, apiKey, text, emotion);
    } else if (this.config.provider === 'openai-compat') {
      req = buildOpenAiCompatRequest(this.config, apiKey, text, emotion);
    } else {
      throw new Error(`不支援的外接語音引擎：${this.config.provider}`);
    }

    const res = await this.fetchImpl(req.url, req.init);
    if (!res || !res.ok) {
      const err = new Error(`語音服務回應錯誤（HTTP ${res ? res.status : '網路中斷'}）`);
      err.status = res ? res.status : 0;
      throw err;
    }
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 32) {
      throw new Error('語音服務回傳空白音訊。');
    }
    return buf;
  }

  async playArrayBuffer(arrayBuffer, token) {
    try {
      this.bus.unlock();
      this.bus.setActive(true);
    } catch (_) {}
    const ctx = this.bus.context;
    const voiceInput = this.bus.input('voice');
    if (!ctx || !voiceInput) {
      throw new Error('音訊引擎尚未就緒，請先點擊畫面任意位置。');
    }
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch (_) {}
    }
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (token !== this.currentToken) return false;

    if (this.currentSource) {
      try { this.currentSource.onended = null; } catch (_) {}
      try { this.currentSource.stop(); } catch (_) {}
      try { this.currentSource.disconnect(); } catch (_) {}
      this.currentSource = null;
    }

    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(voiceInput);
    this.currentSource = src;
    this.speaking = true;
    try { this.bus.duck('voice', true); } catch (_) {}
    this.emit();

    return new Promise((resolve) => {
      src.onended = () => {
        if (this.currentSource === src) {
          this.currentSource = null;
          this.speaking = false;
          try { this.bus.duck('voice', false); } catch (_) {}
          this.emit();
        }
        resolve(true);
      };
      src.start(0);
    });
  }

  speakWithWebSpeech(text, emotion, token) {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      this.lastError = '目前瀏覽器不支援 Web Speech 語音合成。';
      this.emit();
      return Promise.resolve(false);
    }
    const synth = window.speechSynthesis;
    const voices = synth.getVoices ? synth.getVoices() : [];
    const pick = pickBestEnGbVoice(voices, this.config.webVoiceName, this.config.language);
    const prosody = computeGlassyProsody(this.config, emotion);

    const utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = prosody.lang;
    utter.rate = prosody.rate;
    utter.pitch = prosody.pitch;
    utter.volume = prosody.volume;
    if (pick.voice) utter.voice = pick.voice;

    this.currentUtterance = utter;
    this.lastError = '';
    try { synth.cancel(); } catch (_) {}

    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        if (this.currentUtterance === utter) {
          this.currentUtterance = null;
          this.speaking = false;
          try { this.bus.duck('voice', false); } catch (_) {}
          this.emit();
        }
        resolve(ok);
      };
      utter.onstart = () => {
        if (token !== this.currentToken) return;
        this.speaking = true;
        try { this.bus.duck('voice', true); } catch (_) {}
        this.emit();
      };
      utter.onend = () => done(true);
      utter.onerror = (ev) => {
        if (ev && ev.error && ev.error !== 'interrupted' && ev.error !== 'canceled') {
          this.lastError = `Web Speech 播放失敗：${ev.error}`;
        }
        done(false);
      };
      try {
        synth.speak(utter);
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        done(false);
      }
    });
  }

  /**
   * 播放單句結構化台詞（遵從「僅念角色台詞、不念旁白與玩家」及中字英配規則）。
   */
  async speakLine(meta, options = {}) {
    const force = Boolean(options.force);
    if (!force && !this.config.enabled) return false;
    if (!meta || typeof meta !== 'object') return false;
    if (meta.player) return false;
    if (this.config.dialogueOnly && meta.kind && meta.kind !== 'dialogue') return false;

    const rawText = meta.spokenText
      ? String(meta.spokenText)
      : (looksLikeEnglishSpeech(meta.text) || (!this.config.bilingualEnglish && this.config.provider !== 'webspeech')
          ? String(meta.text || '')
          : '');
    const cleanText = sanitizeTextForSpeech(rawText);
    if (!cleanText) return false;

    return this.speakText(cleanText, { emotion: meta.emotion || 'neutral', force });
  }

  /**
   * 朗讀指定文字（支援試聽與重念）。
   */
  async speakText(text, options = {}) {
    const force = Boolean(options.force);
    if (!force && !this.config.enabled) return false;
    const clean = sanitizeTextForSpeech(text);
    if (!clean) return false;

    const emotion = options.emotion || 'neutral';
    this.lastSpokenRequest = { text: clean, emotion };

    if (this.config.interruptOnAdvance || force) {
      this.stop();
    }
    const token = ++this.currentToken;

    if (this.config.provider === 'webspeech') {
      return this.speakWithWebSpeech(clean, emotion, token);
    }

    // 外接引擎連續斷線超過上限時，自動安全降級至 Web Speech（若為英文文本）
    if (this.failures >= MAX_VOICE_FAILURES) {
      if (looksLikeEnglishSpeech(clean)) {
        return this.speakWithWebSpeech(clean, emotion, token);
      }
      return false;
    }

    const key = makeClipKey(this.config, clean, emotion);
    let audioBuf = this.clips.get(key) || null;
    if (!audioBuf) {
      try {
        audioBuf = await this.fetchExternalAudio(clean, emotion);
        this.putClip(key, audioBuf);
        this.failures = 0;
        this.lastError = '';
      } catch (err) {
        this.recordExternalFailure(err);
        if (looksLikeEnglishSpeech(clean)) {
          return this.speakWithWebSpeech(clean, emotion, token);
        }
        return false;
      }
    }

    if (token !== this.currentToken) return false;
    try {
      return await this.playArrayBuffer(audioBuf, token);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
      return false;
    }
  }

  preview() {
    this.resetFailures();
    return this.speakText(VOICE_PREVIEW_SAMPLE_EN, { emotion: 'neutral', force: true });
  }

  replayLast() {
    if (!this.lastSpokenRequest) return this.preview();
    return this.speakText(this.lastSpokenRequest.text, {
      emotion: this.lastSpokenRequest.emotion,
      force: true
    });
  }
}

export const voicePlayer = new VoicePlayer();
