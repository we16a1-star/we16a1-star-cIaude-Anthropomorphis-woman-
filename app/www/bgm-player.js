/**
 * bgm-player.js — BGM-2 背景音樂播放引擎（對接 audio-bus.js bgm 聲道）
 *
 * 設計重點：
 *   1. `config/scenePacks.json` 之 `bgmEnabled: false` 保留為出廠預設語意（由 v5-art-step2.test.js 斷言），
 *      實際開關與音量由本機偏好 `claude_novel_bgm_v1` 控制，絕不改動 config 固定欄位。
 *   2. 換場 1.2 秒交叉淡入淡出；同曲不重播；支援 loopStart / loopEnd 精準循環。
 *   3. 音檔缺失或解碼失敗時靜默降級並記憶失敗清單，絕不拋錯、絕不造成重複 404 洪水。
 *   4. 全程經由 `audioBus.input('bgm')` 出聲，與 D20 語音自動壓低（35%）及切背景掛起無縫整合。
 */

import { audioBus } from './audio-bus.js';

export const STORAGE_KEY_BGM_PREF = 'claude_novel_bgm_v1';
// 以「讓用戶帶入遊戲」為優先：預設開啟柔和配樂，並在首次點擊／按鍵互動時自動解鎖淡入（不違反瀏覽器自動播放政策）
export const DEFAULT_BGM_PREF = Object.freeze({ enabled: true, volume: 0.62, emotionReactive: true });
export const BGM_CROSSFADE_SEC = 1.2;

/** 九首完整原創配樂清單（供沉浸音樂盒選曲與後端健檢使用） */
export const BGM_TRACK_LIST = Object.freeze([
  { key: 'title',           id: 'bgm-title',           title: '書頁之間（主題曲）',   mood: '開局與門廊', file: 'assets/bgm/bgm-title.m4a' },
  { key: 'soft-morning',    id: 'bgm-morning-soft',    title: '晨光與紅茶',           mood: '清晨日常',   file: 'assets/bgm/bgm-morning-soft.m4a' },
  { key: 'default',         id: 'bgm-day-default',     title: '午後的閱覽室',         mood: '日間書庫',   file: 'assets/bgm/bgm-day-default.m4a' },
  { key: 'evening-reading', id: 'bgm-evening-reading', title: '暮色與白鴿',           mood: '傍晚餘暉',   file: 'assets/bgm/bgm-evening-reading.m4a' },
  { key: 'night',           id: 'bgm-night-magic',     title: '掌心的微光',           mood: '深夜獨處',   file: 'assets/bgm/bgm-night-magic.m4a' },
  { key: 'rainy-night',     id: 'bgm-rainy-night',     title: '雨聲裡的燭火',         mood: '雨夜書桌',   file: 'assets/bgm/bgm-rainy-night.m4a' },
  { key: 'goodnight',       id: 'bgm-event-tender',    title: '沒說出口的那一頁',     mood: '溫柔深情',   file: 'assets/bgm/bgm-event-tender.m4a' },
  { key: 'cheek_pinch',     id: 'bgm-event-playful',   title: '才不是故意的',         mood: '俏皮傲嬌',   file: 'assets/bgm/bgm-event-playful.m4a' },
  { key: 'wait',            id: 'bgm-wait',            title: '羽毛筆書寫中',         mood: '等待思索',   file: 'assets/bgm/bgm-wait.m4a' }
]);

/** 場景鍵與事件旗標對應之預設曲目註冊表（可由 scenePacks.json 覆寫） */
export const DEFAULT_BGM_CATALOG = Object.freeze({
  'title':              { id: 'bgm-title',           title: '書頁之間（主題曲）',   file: 'assets/bgm/bgm-title.m4a' },
  'default':            { id: 'bgm-day-default',     title: '午後的閱覽室',         file: 'assets/bgm/bgm-day-default.m4a' },
  'day-default':        { id: 'bgm-day-default',     title: '午後的閱覽室',         file: 'assets/bgm/bgm-day-default.m4a' },
  'soft-morning':       { id: 'bgm-morning-soft',    title: '晨光與紅茶',           file: 'assets/bgm/bgm-morning-soft.m4a' },
  'morning-soft':       { id: 'bgm-morning-soft',    title: '晨光與紅茶',           file: 'assets/bgm/bgm-morning-soft.m4a' },
  'evening-reading':    { id: 'bgm-evening-reading', title: '暮色與白鴿',           file: 'assets/bgm/bgm-evening-reading.m4a' },
  'night':              { id: 'bgm-night-magic',     title: '掌心的微光',           file: 'assets/bgm/bgm-night-magic.m4a' },
  'night-magic':        { id: 'bgm-night-magic',     title: '掌心的微光',           file: 'assets/bgm/bgm-night-magic.m4a' },
  'rainy-night':        { id: 'bgm-rainy-night',     title: '雨聲裡的燭火',         file: 'assets/bgm/bgm-rainy-night.m4a' },
  'goodnight':          { id: 'bgm-event-tender',    title: '沒說出口的那一頁',     file: 'assets/bgm/bgm-event-tender.m4a' },
  'rare-goodnight':     { id: 'bgm-event-tender',    title: '沒說出口的那一頁',     file: 'assets/bgm/bgm-event-tender.m4a' },
  'goodnight-reading':  { id: 'bgm-event-tender',    title: '沒說出口的那一頁',     file: 'assets/bgm/bgm-event-tender.m4a' },
  'nightgown':          { id: 'bgm-event-tender',    title: '沒說出口的那一頁',     file: 'assets/bgm/bgm-event-tender.m4a' },
  'vow':                { id: 'bgm-event-tender',    title: '沒說出口的那一頁',     file: 'assets/bgm/bgm-event-tender.m4a' },
  'night_chat_reading': { id: 'bgm-event-tender',    title: '沒說出口的那一頁',     file: 'assets/bgm/bgm-event-tender.m4a' },
  'cheek_pinch':        { id: 'bgm-event-playful',   title: '才不是故意的',         file: 'assets/bgm/bgm-event-playful.m4a' },
  'outing_memory':      { id: 'bgm-event-playful',   title: '才不是故意的',         file: 'assets/bgm/bgm-event-playful.m4a' },
  'lakeside_sunset':    { id: 'bgm-event-playful',   title: '才不是故意的',         file: 'assets/bgm/bgm-event-playful.m4a' },
  'wait':               { id: 'bgm-wait',            title: '羽毛筆書寫中',         file: 'assets/bgm/bgm-wait.m4a' }
});

function clamp01(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

export function normalizeBgmPreference(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: src.enabled === undefined ? DEFAULT_BGM_PREF.enabled : Boolean(src.enabled),
    volume: clamp01(src.volume, DEFAULT_BGM_PREF.volume),
    emotionReactive: src.emotionReactive === undefined ? DEFAULT_BGM_PREF.emotionReactive : Boolean(src.emotionReactive)
  };
}

export function loadBgmPreference(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return { ...DEFAULT_BGM_PREF };
  try {
    const raw = store.getItem(STORAGE_KEY_BGM_PREF);
    if (!raw) return { ...DEFAULT_BGM_PREF };
    return normalizeBgmPreference(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_BGM_PREF };
  }
}

export function saveBgmPreference(patch, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const next = normalizeBgmPreference({ ...loadBgmPreference(store), ...(patch && typeof patch === 'object' ? patch : {}) });
  if (store) {
    try {
      store.setItem(STORAGE_KEY_BGM_PREF, JSON.stringify(next));
    } catch (_) {}
  }
  return next;
}

export class BgmPlayer {
  constructor(options = {}) {
    this.storage = options.storage || null;
    this.bus = options.audioBus || audioBus;
    this.fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.crossfadeSec = Number.isFinite(Number(options.crossfadeSec)) ? Math.max(0, Number(options.crossfadeSec)) : BGM_CROSSFADE_SEC;
    this.pref = loadBgmPreference(this.storage);
    this.catalog = { ...DEFAULT_BGM_CATALOG };
    this.bufferCache = new Map();
    this.missingUrls = new Set();
    this.currentSceneKey = 'default';
    this.overrideEventKey = '';
    this.manualTrackKey = '';
    this.emotionTrackKey = '';
    this.isWaitingMode = false;
    this.customTrack = null; // { id, title, buffer }
    this.activeTrackId = '';
    this.activeTrackTitle = '';
    this.activeVoice = null; // { source, gain, trackId }
    this.switchToken = 0;
    this.listeners = new Set();
    try {
      this.bus.setLevel('bgm', this.pref.volume);
    } catch (_) {}
  }

  listDistinctTracks() {
    const out = BGM_TRACK_LIST.map((t) => ({ ...t }));
    if (this.customTrack) {
      out.unshift({ key: '__custom__', id: this.customTrack.id, title: this.customTrack.title, mood: '自訂音樂', file: '__custom__' });
    }
    return out;
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
    const target = this.resolveTargetTrack();
    return {
      enabled: this.pref.enabled,
      volume: this.pref.volume,
      emotionReactive: this.pref.emotionReactive,
      sceneKey: this.currentSceneKey,
      eventKey: this.overrideEventKey,
      manualTrackKey: this.manualTrackKey,
      isWaiting: this.isWaitingMode,
      hasCustomTrack: Boolean(this.customTrack),
      activeTrackId: this.activeTrackId,
      activeTrackTitle: this.activeTrackTitle || target?.title || '',
      isPlaying: Boolean(this.activeVoice),
      missingCount: this.missingUrls.size
    };
  }

  /** 由 scenePacks.json 動態同步各場景包的 bgm 設定（若為物件或字串路徑皆支援） */
  registerScenePacks(scenePacksData) {
    const packs = Array.isArray(scenePacksData?.scenePacks) ? scenePacksData.scenePacks : [];
    for (const p of packs) {
      if (!p || !p.bgm) continue;
      const entry = typeof p.bgm === 'string'
        ? { id: p.id || p.sceneKey, title: p.name || p.id, file: p.bgm }
        : {
            id: p.bgm.id || p.id || p.sceneKey,
            title: p.bgm.title || p.name || p.id,
            file: p.bgm.file || '',
            loopStart: Number(p.bgm.loopStart) || 0,
            loopEnd: Number(p.bgm.loopEnd) || 0
          };
      if (!entry.file) continue;
      if (p.id) this.catalog[p.id] = entry;
      if (p.sceneKey) this.catalog[p.sceneKey] = entry;
    }
    this.emit();
  }

  updatePreference(patch) {
    this.pref = saveBgmPreference(patch, this.storage);
    try {
      this.bus.setLevel('bgm', this.pref.volume);
    } catch (_) {}
    if (!this.pref.enabled) {
      this.stop(0.35);
    } else {
      void this.syncPlayback();
    }
    this.emit();
    return { ...this.pref };
  }

  resolveTargetTrack() {
    if (this.manualTrackKey === '__custom__' && this.customTrack) {
      return { id: this.customTrack.id, title: this.customTrack.title, file: '__custom__', buffer: this.customTrack.buffer };
    }
    if (this.manualTrackKey && this.catalog[this.manualTrackKey]) {
      return this.catalog[this.manualTrackKey];
    }
    if (this.overrideEventKey && this.catalog[this.overrideEventKey]) {
      return this.catalog[this.overrideEventKey];
    }
    if (this.isWaitingMode && this.catalog.wait) {
      return this.catalog.wait;
    }
    if (this.pref.emotionReactive && this.emotionTrackKey && this.catalog[this.emotionTrackKey]) {
      return this.catalog[this.emotionTrackKey];
    }
    if (this.currentSceneKey && this.catalog[this.currentSceneKey]) {
      return this.catalog[this.currentSceneKey];
    }
    return this.catalog.default || null;
  }

  /** 手動鎖定指定曲目（例如從沉浸音樂盒點選）；傳入空字串即回到跟隨劇情自動配樂 */
  setManualTrack(trackKey) {
    const key = String(trackKey || '').trim();
    this.manualTrackKey = key;
    if (key && !this.pref.enabled) {
      this.pref = saveBgmPreference({ enabled: true }, this.storage);
    }
    if (this.pref.enabled) {
      void this.syncPlayback();
    } else {
      this.emit();
    }
  }

  clearManualTrack() {
    if (!this.manualTrackKey) return;
    this.manualTrackKey = '';
    if (this.pref.enabled) void this.syncPlayback();
    else this.emit();
  }

  /** 依當回合情緒柔和帶動配樂氛圍（tender→溫柔深情、proud→俏皮傲嬌，其餘回歸場景主旋律） */
  applyStoryEmotion(emotion) {
    const e = String(emotion || '').trim().toLowerCase();
    let nextKey = '';
    if (e === 'tender') nextKey = 'goodnight';
    else if (e === 'proud') nextKey = 'cheek_pinch';
    if (nextKey === this.emotionTrackKey) return;
    this.emotionTrackKey = nextKey;
    if (this.pref.enabled && this.pref.emotionReactive && !this.manualTrackKey && !this.overrideEventKey) {
      void this.syncPlayback();
    } else {
      this.emit();
    }
  }

  /** 等待 AI 回覆時柔和切入《羽毛筆書寫中》，回覆到達即淡回劇情配樂 */
  setWaiting(waiting) {
    const next = Boolean(waiting);
    if (next === this.isWaitingMode) return;
    this.isWaitingMode = next;
    if (this.pref.enabled && !this.manualTrackKey && !this.overrideEventKey) {
      void this.syncPlayback();
    } else {
      this.emit();
    }
  }

  /** 匯入使用者本機音檔（MP3/M4A/OGG/WAV）作為沉浸自訂背景音樂 */
  async loadCustomAudioFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('請選擇有效的音訊檔案（MP3 / M4A / OGG / WAV）');
    }
    try {
      this.bus.unlock();
      this.bus.setActive(true);
    } catch (_) {}
    const ctx = this.bus.context;
    if (!ctx) throw new Error('目前環境不支援 Web Audio 解碼');
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch (_) {}
    }
    const ab = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    const title = String(file.name || '自訂音樂').replace(/\.[^.]+$/, '').slice(0, 48);
    this.customTrack = { id: 'custom-' + Date.now(), title: `自訂：${title}`, buffer: decoded };
    this.manualTrackKey = '__custom__';
    this.pref = saveBgmPreference({ enabled: true }, this.storage);
    await this.syncPlayback(true);
    return { title: this.customTrack.title, duration: decoded.duration || 0 };
  }

  setScene(sceneKey) {
    const key = String(sceneKey || '').trim();
    if (!key) return;
    this.currentSceneKey = key;
    if (this.pref.enabled && !this.overrideEventKey) {
      void this.syncPlayback();
    } else {
      this.emit();
    }
  }

  setEvent(eventKey) {
    const key = String(eventKey || '').trim();
    this.overrideEventKey = key;
    if (this.pref.enabled) {
      void this.syncPlayback();
    } else {
      this.emit();
    }
  }

  clearEvent() {
    if (!this.overrideEventKey) return;
    this.overrideEventKey = '';
    if (this.pref.enabled) {
      void this.syncPlayback();
    } else {
      this.emit();
    }
  }

  async loadBuffer(fileUrl) {
    if (!fileUrl || this.missingUrls.has(fileUrl)) return null;
    if (this.bufferCache.has(fileUrl)) return this.bufferCache.get(fileUrl);
    if (!this.fetchImpl) return null;

    const ctx = this.bus.context;
    if (!ctx) return null;

    try {
      const res = await this.fetchImpl(fileUrl);
      if (!res || !res.ok) {
        this.missingUrls.add(fileUrl);
        return null;
      }
      const ab = await res.arrayBuffer();
      if (!ab || ab.byteLength < 64) {
        this.missingUrls.add(fileUrl);
        return null;
      }
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      this.bufferCache.set(fileUrl, decoded);
      return decoded;
    } catch (_) {
      this.missingUrls.add(fileUrl);
      return null;
    }
  }

  fadeOutVoice(voice, fadeSec) {
    if (!voice) return;
    const ctx = this.bus.context;
    const dur = Math.max(0.02, Number(fadeSec) || 0.25);
    if (ctx && voice.gain?.gain) {
      try {
        const now = ctx.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + dur);
      } catch (_) {}
      setTimeout(() => {
        try { voice.source.stop(); } catch (_) {}
        try { voice.source.disconnect(); } catch (_) {}
        try { voice.gain.disconnect(); } catch (_) {}
      }, Math.round(dur * 1000) + 40);
    } else {
      try { voice.source.stop(); } catch (_) {}
      try { voice.source.disconnect(); } catch (_) {}
      try { voice.gain?.disconnect?.(); } catch (_) {}
    }
  }

  stop(fadeSec = 0.35) {
    this.switchToken += 1;
    if (this.activeVoice) {
      const prev = this.activeVoice;
      this.activeVoice = null;
      this.fadeOutVoice(prev, fadeSec);
    }
    this.activeTrackId = '';
    this.emit();
  }

  async syncPlayback(forcePreview = false) {
    if (!forcePreview && !this.pref.enabled) return false;
    const target = this.resolveTargetTrack();
    if (!target || !target.file) return false;

    // 同一首已在播放則不重播
    if (this.activeVoice && this.activeTrackId === target.id) {
      return true;
    }

    try {
      this.bus.unlock();
      this.bus.setActive(true);
    } catch (_) {}

    const ctx = this.bus.context;
    const bgmIn = this.bus.input('bgm');
    if (!ctx || !bgmIn) return false;
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch (_) {}
    }

    const token = ++this.switchToken;
    const buffer = target.buffer ? target.buffer : await this.loadBuffer(target.file);
    if (!buffer || token !== this.switchToken) return false;

    const fadeSec = this.crossfadeSec;
    const prev = this.activeVoice;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fadeSec));
    gain.connect(bgmIn);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (Number(target.loopStart) > 0) source.loopStart = Number(target.loopStart);
    if (Number(target.loopEnd) > Number(target.loopStart || 0)) source.loopEnd = Number(target.loopEnd);
    source.connect(gain);
    source.start(0);

    this.activeVoice = { source, gain, trackId: target.id };
    this.activeTrackId = target.id;
    this.activeTrackTitle = target.title || target.id;

    if (prev) this.fadeOutVoice(prev, fadeSec);
    this.emit();
    return true;
  }

  async previewCurrentScene() {
    this.missingUrls.clear();
    return this.syncPlayback(true);
  }
}

export const bgmPlayer = new BgmPlayer();
