/**
 * ambience.js — BGM-2 零外部音檔之 Web Audio 程序化場景環境音
 *
 * 透過 audio-bus.js 之 `fx` 聲道現場合成：
 *   - `rain`      雨夜細雨（粉紅雜訊＋雙帶通濾波＋柔和雨滴脈衝）
 *   - `fireplace` 夜間壁爐（低頻暖火雜訊＋隨機微弱木柴劈啪）
 *   - `auto`      自動跟隨目前場景（rainy-night → rain；night → fireplace；其餘靜音）
 *   - `off`       關閉
 *
 * 零網路請求、零 404 風險、切至背景隨 audioBus 自動掛起。
 */

import { audioBus } from './audio-bus.js';

export const STORAGE_KEY_AMBIENCE_PREF = 'claude_novel_ambience_v1';
export const AMBIENCE_MODES = Object.freeze([
  { id: 'off', label: '關閉' },
  { id: 'auto', label: '自動跟隨場景（雨夜細雨／夜間壁爐）' },
  { id: 'rain', label: '雨夜細雨（常駐）' },
  { id: 'fireplace', label: '古籍室壁爐（常駐）' }
]);
export const DEFAULT_AMBIENCE_PREF = Object.freeze({ mode: 'off', volume: 0.45 });

const MODE_SET = new Set(AMBIENCE_MODES.map((m) => m.id));

function clamp01(v, fb) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

export function normalizeAmbiencePreference(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: MODE_SET.has(src.mode) ? src.mode : DEFAULT_AMBIENCE_PREF.mode,
    volume: clamp01(src.volume, DEFAULT_AMBIENCE_PREF.volume)
  };
}

export function loadAmbiencePreference(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return { ...DEFAULT_AMBIENCE_PREF };
  try {
    const raw = store.getItem(STORAGE_KEY_AMBIENCE_PREF);
    if (!raw) return { ...DEFAULT_AMBIENCE_PREF };
    return normalizeAmbiencePreference(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_AMBIENCE_PREF };
  }
}

export function saveAmbiencePreference(patch, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const next = normalizeAmbiencePreference({ ...loadAmbiencePreference(store), ...(patch && typeof patch === 'object' ? patch : {}) });
  if (store) {
    try {
      store.setItem(STORAGE_KEY_AMBIENCE_PREF, JSON.stringify(next));
    } catch (_) {}
  }
  return next;
}

export function resolveAmbienceKind(mode, sceneKey) {
  if (mode === 'rain' || mode === 'fireplace') return mode;
  if (mode !== 'auto') return 'off';
  const k = String(sceneKey || '').toLowerCase();
  if (k.includes('rain')) return 'rain';
  if (k.includes('night')) return 'fireplace';
  return 'off';
}

function createPinkNoiseBuffer(ctx, seconds = 3) {
  const len = Math.max(1024, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
      b6 = white * 0.115926;
    }
  }
  return buf;
}

export class AmbienceEngine {
  constructor(options = {}) {
    this.storage = options.storage || null;
    this.bus = options.audioBus || audioBus;
    this.pref = loadAmbiencePreference(this.storage);
    this.sceneKey = 'default';
    this.activeKind = 'off';
    this.nodes = [];
    this.pulseTimer = null;
    this.noiseBuffer = null;
    try {
      this.bus.setLevel('fx', this.pref.volume);
    } catch (_) {}
  }

  getPreference() {
    return { ...this.pref };
  }

  updatePreference(patch) {
    this.pref = saveAmbiencePreference(patch, this.storage);
    try {
      this.bus.setLevel('fx', this.pref.volume);
    } catch (_) {}
    this.sync();
    return this.getPreference();
  }

  setScene(sceneKey) {
    this.sceneKey = String(sceneKey || 'default');
    this.sync();
  }

  stop() {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    for (const n of this.nodes) {
      try { n.stop?.(); } catch (_) {}
      try { n.disconnect?.(); } catch (_) {}
    }
    this.nodes = [];
    this.activeKind = 'off';
  }

  sync() {
    const target = resolveAmbienceKind(this.pref.mode, this.sceneKey);
    if (target === 'off') {
      this.stop();
      return;
    }
    if (target === this.activeKind && this.nodes.length > 0) return;

    this.stop();
    try {
      this.bus.unlock();
      this.bus.setActive(true);
    } catch (_) {}

    const ctx = this.bus.context;
    const fxIn = this.bus.input('fx');
    if (!ctx || !fxIn) return;

    if (!this.noiseBuffer) {
      this.noiseBuffer = createPinkNoiseBuffer(ctx, 3);
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    if (target === 'rain') {
      filter.type = 'bandpass';
      filter.frequency.value = 1150;
      filter.Q.value = 0.65;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.55, now + 0.8);
    } else {
      // fireplace: 溫暖低頻火聲
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.Q.value = 0.8;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.7, now + 0.8);
    }

    src.connect(filter);
    filter.connect(gain);
    gain.connect(fxIn);
    src.start(0);
    this.nodes.push(src, filter, gain);
    this.activeKind = target;

    // 輕微隨機雨滴或壁爐劈啪點綴
    this.pulseTimer = setInterval(() => {
      if (this.activeKind !== target || !this.bus.context || this.bus.context.state !== 'running') return;
      if (Math.random() > (target === 'rain' ? 0.42 : 0.28)) return;
      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = target === 'rain' ? 'sine' : 'triangle';
        const baseFreq = target === 'rain' ? 1600 + Math.random() * 1400 : 120 + Math.random() * 260;
        osc.frequency.setValueAtTime(baseFreq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, baseFreq * 0.5), t + 0.045);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(target === 'rain' ? 0.035 : 0.06, t + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        osc.connect(env);
        env.connect(fxIn);
        osc.start(t);
        osc.stop(t + 0.06);
      } catch (_) {}
    }, 320);
  }
}

export const ambienceEngine = new AmbienceEngine();
