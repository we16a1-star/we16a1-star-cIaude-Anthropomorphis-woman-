/**
 * event-bus.js — 零相依輕量型事件匯流排（解耦視覺、音訊、演出與 UI 層）
 *
 * 標準事件約定：
 *   - `scene:changed`       { sceneKey, tone, background }
 *   - `cg:started`          { id, artId, tone }
 *   - `cg:ended`            {}
 *   - `scenepacks:loaded`   { config }
 *   - `emotion:changed`     { emotion, intensity, token }
 *   - `audio:state`         { masterVolume, masterMuted, bgm, ambience, voice }
 *   - `turn:applied`        { role, emotion, eventFlag, hasSpokenEn }
 *
 * 掛載於 `window.__claudeBus`，讓維持零頂層 import 之 `story-art.js`（相容 CJS 測試）
 * 也能透過統一事件管道與音訊／UI 子系統通訊，不再散落跨模組全域函式呼叫。
 */

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(eventName, handler) {
    const key = String(eventName || '').trim();
    if (!key || typeof handler !== 'function') return () => {};
    let set = this._listeners.get(key);
    if (!set) {
      set = new Set();
      this._listeners.set(key, set);
    }
    set.add(handler);
    return () => this.off(key, handler);
  }

  once(eventName, handler) {
    if (typeof handler !== 'function') return () => {};
    const off = this.on(eventName, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(eventName, handler) {
    const set = this._listeners.get(String(eventName || '').trim());
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._listeners.delete(String(eventName || '').trim());
  }

  emit(eventName, payload) {
    const set = this._listeners.get(String(eventName || '').trim());
    if (!set || set.size === 0) return 0;
    let invoked = 0;
    for (const fn of [...set]) {
      try {
        fn(payload);
        invoked += 1;
      } catch (_) {
        // 單一監聽器例外不阻斷其餘子系統
      }
    }
    return invoked;
  }

  listenerCount(eventName) {
    const set = this._listeners.get(String(eventName || '').trim());
    return set ? set.size : 0;
  }

  clear(eventName) {
    if (eventName) this._listeners.delete(String(eventName).trim());
    else this._listeners.clear();
  }
}

export const claudeBus = new EventBus();
if (typeof window !== 'undefined' && !window.__claudeBus) {
  window.__claudeBus = claudeBus;
}
