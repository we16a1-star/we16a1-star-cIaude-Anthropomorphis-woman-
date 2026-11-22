/**
 * audio-bus.js — 視覺小說多聲道音訊總線（全域單例）
 *
 * Ported from AnimaVN (MIT License, Copyright (c) 2026 JayziLi)
 * Source: frontend/src/debug/vn/audioBus.ts
 *
 * 聲道架構：
 *   bgm   背景音樂         ─┐
 *   voice 語音             ─┤  每條聲道：音量 → 壓低（Ducking） → 總音量 → 揚聲器
 *   fx    立繪／互動音效   ─┤
 *   type  打字跳字音效     ─┘
 *
 * 特性：
 *   - 單一 AudioContext 手勢解鎖（unlock），切至背景自動掛起（visibilitychange）。
 *   - 說話／播放語音時自動平滑壓低背景音樂（nextDuck / duckRamp）。
 *   - 短音效解碼快取與失敗 30 秒退避，避免高頻打字觸發重複請求。
 */

export const CHANNELS = Object.freeze(['bgm', 'voice', 'fx', 'type']);

/** 預設壓低規則：語音出聲時自動壓低背景音樂 */
export const DUCKS = Object.freeze({ voice: Object.freeze(['bgm']) });

/** 語音出聲時背景音樂預設壓至原音量 35% */
export const DEFAULT_DUCK_LEVEL = 0.35;

const DUCK_DOWN = 0.08;
const DUCK_UP = 0.15;
const LEVEL_SMOOTH = 0.05;
const RETRY_AFTER_MS = 30000;

/**
 * 純函式：計算某條聲道開始／結束出聲後的壓低狀態表。
 * @param {Map<string, Set<string>>} state
 * @param {string} by
 * @param {boolean} on
 * @param {Record<string, readonly string[]>} [rules]
 * @returns {Map<string, Set<string>>}
 */
export function nextDuck(state, by, on, rules = DUCKS) {
  const next = new Map();
  for (const [ch, set] of state) next.set(ch, new Set(set));
  const targets = rules[by] || [];
  for (const target of targets) {
    const set = next.get(target) || new Set();
    if (on) set.add(by);
    else set.delete(by);
    if (set.size > 0) next.set(target, set);
    else next.delete(target);
  }
  return next;
}

/**
 * 純函式：計算該聲道應淡至的目標倍率與平滑時間常數（秒）。
 * @param {Map<string, Set<string>>} state
 * @param {string} channel
 * @param {number} level
 * @returns {{ target: number, timeConstant: number }}
 */
export function duckRamp(state, channel, level) {
  const count = state.get(channel)?.size || 0;
  return count > 0
    ? { target: level, timeConstant: DUCK_DOWN }
    : { target: 1, timeConstant: DUCK_UP };
}

function browserContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function browserDocument() {
  return typeof document !== 'undefined' ? document : null;
}

export class AudioBus {
  constructor(deps = {}) {
    this.createContext = deps.createContext || browserContext;
    this.doc = deps.document === undefined ? browserDocument() : deps.document;
    this.sfxBase = typeof deps.sfxBase === 'string' ? deps.sfxBase : 'assets/sfx/';
    this.ctx = null;
    this.master = null;
    this.nodes = null;
    this.levels = new Map(CHANNELS.map(ch => [ch, 1]));
    this.duckLevel = DEFAULT_DUCK_LEVEL;
    this.ducks = new Map();
    this.isActive = false;
    this.suspendTimer = null;
    this.unlockListeners = new Set();
    this.shortCtx = null;
    this.clips = new Map();
    this.clipFailedAt = new Map();

    if (this.doc && typeof this.doc.addEventListener === 'function') {
      const doc = this.doc;
      doc.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (doc.hidden) {
          Promise.resolve(this.ctx.suspend?.()).catch(() => {});
        } else if (this.isActive) {
          Promise.resolve(this.ctx.resume?.()).catch(() => {});
        }
      });
    }
  }

  get hidden() {
    return Boolean(this.doc && this.doc.hidden);
  }

  get context() {
    return this.ctx;
  }

  get active() {
    return this.isActive;
  }

  input(channel) {
    return this.nodes?.get(channel)?.input || null;
  }

  onUnlock(fn) {
    this.unlockListeners.add(fn);
    return () => this.unlockListeners.delete(fn);
  }

  /**
   * 於使用者點擊／按鍵手勢內呼叫：首次建立 AudioContext 並佈線四聲道，之後確保恢復運行。
   */
  unlock() {
    if (!this.ctx) {
      const ctx = this.createContext();
      if (!ctx) return;
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      const nodes = new Map();
      for (const ch of CHANNELS) {
        const input = ctx.createGain();
        input.gain.value = this.levels.get(ch) ?? 1;
        const duck = ctx.createGain();
        input.connect(duck);
        duck.connect(this.master);
        nodes.set(ch, { input, duck });
      }
      this.nodes = nodes;
    }
    if (this.ctx.state !== 'running' && !this.hidden) {
      Promise.resolve(this.ctx.resume?.()).catch(() => {});
    }
    for (const fn of this.unlockListeners) {
      try { fn(); } catch (_) {}
    }
  }

  /**
   * 切換故事演出啟用狀態；關閉時於延遲淡出後自動掛起，不佔用音效裝置。
   */
  setActive(on, suspendAfterMs = 1800) {
    this.isActive = Boolean(on);
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (this.isActive) {
      if (this.ctx && this.ctx.state !== 'running' && !this.hidden) {
        Promise.resolve(this.ctx.resume?.()).catch(() => {});
      }
      return;
    }
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.isActive && this.ctx) {
        Promise.resolve(this.ctx.suspend?.()).catch(() => {});
      }
    }, Math.max(0, Number(suspendAfterMs) || 0));
  }

  setLevel(channel, level) {
    const safe = Math.max(0, Math.min(1, Number(level) || 0));
    this.levels.set(channel, safe);
    const node = this.nodes?.get(channel);
    if (this.ctx && node) {
      node.input.gain.setTargetAtTime(safe, this.ctx.currentTime, LEVEL_SMOOTH);
    }
  }

  setDuckLevel(v) {
    this.duckLevel = Math.min(1, Math.max(0, Number(v) || 0));
    for (const ch of this.ducks.keys()) this.applyDuck(ch);
  }

  duck(by, on) {
    this.ducks = nextDuck(this.ducks, by, Boolean(on));
    for (const target of DUCKS[by] || []) this.applyDuck(target);
  }

  applyDuck(channel) {
    const node = this.nodes?.get(channel);
    if (!this.ctx || !node) return;
    const g = node.duck.gain;
    const now = this.ctx.currentTime;
    const { target, timeConstant } = duckRamp(this.ducks, channel, this.duckLevel);
    g.cancelScheduledValues(now);
    g.setTargetAtTime(target, now, timeConstant);
  }

  shortContext() {
    if (this.ctx) return this.ctx;
    if (!this.shortCtx) this.shortCtx = this.createContext();
    return this.shortCtx;
  }

  shortOut(channel) {
    const ac = this.shortContext();
    if (!ac) return null;
    const out = ac === this.ctx ? this.input(channel) : null;
    return { ac, out: out || ac.destination };
  }

  mayWake(ac) {
    return !(ac === this.ctx && this.hidden);
  }

  loadClip(file) {
    let p = this.clips.get(file);
    if (!p) {
      const failed = this.clipFailedAt.get(file);
      if (failed !== undefined && Date.now() - failed < RETRY_AFTER_MS) {
        return Promise.resolve(null);
      }
      const ac = this.shortContext();
      p = (ac && typeof fetch === 'function')
        ? fetch(this.sfxBase + file)
            .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then(buf => ac.decodeAudioData(buf))
            .catch(() => null)
        : Promise.resolve(null);
      this.clips.set(file, p);
      const mine = p;
      mine.then(buf => {
        if (buf !== null) {
          this.clipFailedAt.delete(file);
        } else if (this.clips.get(file) === mine) {
          this.clips.delete(file);
          this.clipFailedAt.set(file, Date.now());
        }
      });
    }
    return p;
  }

  preloadClips(files) {
    if (!Array.isArray(files)) return;
    for (const f of files) {
      if (f) void this.loadClip(f);
    }
  }

  async playClip(channel, file, volume) {
    const o = this.shortOut(channel);
    if (!o || volume <= 0) return;
    const { ac, out } = o;
    if (ac.state === 'suspended') {
      if (!this.mayWake(ac)) return;
      await Promise.resolve(ac.resume?.()).catch(() => undefined);
    }
    const buf = await this.loadClip(file);
    if (!buf) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(out);
    src.start();
  }
}

export const audioBus = new AudioBus();
