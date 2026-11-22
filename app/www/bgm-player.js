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
export const DEFAULT_BGM_PREF = Object.freeze({ enabled: false, volume: 0.65 });
export const BGM_CROSSFADE_SEC = 1.2;

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
    enabled: Boolean(src.enabled),
    volume: clamp01(src.volume, DEFAULT_BGM_PREF.volume)
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
    this.activeTrackId = '';
    this.activeTrackTitle = '';
    this.activeVoice = null; // { source, gain, trackId }
    this.switchToken = 0;
    this.listeners = new Set();
    try {
      this.bus.setLevel('bgm', this.pref.volume);
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
    const target = this.resolveTargetTrack();
    return {
      enabled: this.pref.enabled,
      volume: this.pref.volume,
      sceneKey: this.currentSceneKey,
      eventKey: this.overrideEventKey,
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
    if (this.overrideEventKey && this.catalog[this.overrideEventKey]) {
      return this.catalog[this.overrideEventKey];
    }
    if (this.currentSceneKey && this.catalog[this.currentSceneKey]) {
      return this.catalog[this.currentSceneKey];
    }
    return this.catalog.default || null;
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
    const buffer = await this.loadBuffer(target.file);
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
