/**
 * audio-coordinator.js — 統一音訊協調層（單一真實來源）
 *
 * 整合五大音訊子系統：
 *   1. audioBus       — 四聲道 Web Audio 總線與主音量／靜音控制
 *   2. bgmPlayer      — 原創九首無縫循環背景音樂（1.2s 交叉淡入淡出）
 *   3. ambienceEngine — 零音檔程序化場景環境音（雨夜細雨／夜間壁爐）
 *   4. voicePlayer    — D20 Claude 英文（en-GB · Glassy · 正常）雙軌配音
 *   5. typeSound      — 現場合成打字跳字音效
 *
 * 透過 claudeBus 訂閱 `scene:changed`、`cg:started`、`cg:ended`、`scenepacks:loaded`，
 * 讓視覺層與音訊層徹底解耦，不再由 app.js 與 story-art.js 分散維護狀態。
 */

import { audioBus } from './audio-bus.js';
import { bgmPlayer } from './bgm-player.js';
import { ambienceEngine } from './ambience.js';
import { voicePlayer } from './voice-tts.js';
import { TYPE_SOUNDS, loadTypeSoundPreference, saveTypeSoundPreference, playTypeSound } from './type-sound.js';
import { claudeBus } from './event-bus.js';

export const STORAGE_KEY_MASTER_VOL = 'claude_novel_master_vol_v1';
export const STORAGE_KEY_MASTER_MUTED = 'claude_novel_master_muted_v1';

export class AudioCoordinator {
  constructor(options = {}) {
    this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.bus = options.audioBus || audioBus;
    this.bgm = options.bgmPlayer || bgmPlayer;
    this.ambience = options.ambienceEngine || ambienceEngine;
    this.voice = options.voicePlayer || voicePlayer;
    this.events = options.eventBus || claudeBus;
    this.masterVolume = 1;
    this.masterMuted = false;
    this._unsubs = [];
    this._gestureBound = false;

    this._loadMasterState();
    this._applyMasterState();
    this._bindEvents();
  }

  _loadMasterState() {
    if (!this.storage) return;
    try {
      const rawMv = this.storage.getItem(STORAGE_KEY_MASTER_VOL);
      if (rawMv !== null && rawMv !== '') {
        const mv = Number(rawMv);
        if (Number.isFinite(mv) && mv >= 0 && mv <= 1) {
          this.masterVolume = Math.round(mv * 100) / 100;
        }
      }
      this.masterMuted = this.storage.getItem(STORAGE_KEY_MASTER_MUTED) === 'true';
    } catch (_) {}
  }

  _applyMasterState() {
    try {
      this.bus.setMasterVolume(this.masterMuted ? 0 : this.masterVolume);
    } catch (_) {}
    if (this.masterMuted) {
      try { this.voice.stop(); } catch (_) {}
    }
  }

  _bindEvents() {
    this._unsubs.push(
      this.events.on('scene:changed', (ev) => {
        const key = String(ev?.sceneKey || 'default');
        try { this.bgm.setScene(key); } catch (_) {}
        try { this.ambience.setScene(key); } catch (_) {}
      }),
      this.events.on('cg:started', (ev) => {
        if (ev?.id) {
          try { this.bgm.setEvent(ev.id); } catch (_) {}
        }
      }),
      this.events.on('cg:ended', () => {
        try { this.bgm.clearEvent(); } catch (_) {}
      }),
      this.events.on('scenepacks:loaded', (ev) => {
        if (ev?.config) {
          try { this.bgm.registerScenePacks(ev.config); } catch (_) {}
        }
      })
    );

    if (typeof this.voice.subscribe === 'function') {
      this._unsubs.push(this.voice.subscribe(() => this.notifyState()));
    }
    if (typeof this.bgm.subscribe === 'function') {
      this._unsubs.push(this.bgm.subscribe(() => this.notifyState()));
    }
  }

  bindFirstGestureUnlock(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc || this._gestureBound) return;
    this._gestureBound = true;
    const unlockOnce = () => {
      this.unlock();
      if (this.bgm.getSnapshot().enabled) void this.bgm.syncPlayback();
      if (this.ambience.getPreference().mode !== 'off') this.ambience.sync();
      doc.removeEventListener('pointerdown', unlockOnce);
      doc.removeEventListener('keydown', unlockOnce);
    };
    doc.addEventListener('pointerdown', unlockOnce, { passive: true });
    doc.addEventListener('keydown', unlockOnce, { passive: true });
  }

  unlock() {
    try {
      this.bus.unlock();
      this.bus.setActive(true);
    } catch (_) {}
  }

  setMasterVolume(vol) {
    const n = Number(vol);
    this.masterVolume = Number.isFinite(n) ? Math.max(0, Math.min(1, Math.round(n * 100) / 100)) : 1;
    this.masterMuted = this.masterVolume === 0;
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY_MASTER_VOL, String(this.masterVolume));
        this.storage.setItem(STORAGE_KEY_MASTER_MUTED, String(this.masterMuted));
      } catch (_) {}
    }
    this._applyMasterState();
    this.notifyState();
    return this.getSnapshot();
  }

  toggleMasterMute() {
    this.unlock();
    this.masterMuted = !this.masterMuted;
    if (!this.masterMuted && this.masterVolume === 0) {
      this.masterVolume = 1;
      if (this.storage) {
        try { this.storage.setItem(STORAGE_KEY_MASTER_VOL, '1'); } catch (_) {}
      }
    }
    if (this.storage) {
      try { this.storage.setItem(STORAGE_KEY_MASTER_MUTED, String(this.masterMuted)); } catch (_) {}
    }
    this._applyMasterState();
    this.notifyState();
    return this.masterMuted;
  }

  getTypeSound() {
    return loadTypeSoundPreference();
  }

  saveTypeSound(patch) {
    const next = saveTypeSoundPreference(patch);
    this.notifyState();
    return next;
  }

  playTypeClick(id, volume) {
    if (this.masterMuted) return;
    playTypeSound(id, volume);
  }

  getSnapshot() {
    return {
      masterVolume: this.masterVolume,
      masterMuted: this.masterMuted,
      bgm: this.bgm.getSnapshot(),
      ambience: this.ambience.getPreference(),
      voice: this.voice.getSnapshot(),
      typeSound: loadTypeSoundPreference(),
      typeSoundPresets: TYPE_SOUNDS
    };
  }

  notifyState() {
    this.events.emit('audio:state', this.getSnapshot());
  }

  dispose() {
    for (const off of this._unsubs) {
      try { off(); } catch (_) {}
    }
    this._unsubs = [];
  }
}

export const audioCoordinator = new AudioCoordinator();
