/**
 * stacked-layers.js — 無閃爍雙層疊圖過場狀態機（純 JS，零框架依賴）
 *
 * Ported from AnimaVN (MIT License, Copyright (c) 2026 JayziLi)
 * Source: frontend/src/debug/vn/stackedLayers.ts
 *
 * 設計重點：
 *   1. 新圖疊在舊圖上淡入，底層舊圖維持不透明，切換瞬間絕不露出黑底或產生雙半透明重影。
 *   2. 頂層淡入結束後立即回收舊層並卸載 entering 狀態，避免整屏背景長期佔用 GPU 合成層導致掉幀。
 *   3. instant 模式（快進／減少動態）直接落定為單層，不疊圖、不延遲。
 */

export const SPRITE_FADE_MS = 200;
export const BG_FADE_MS = 420;

export class StackedLayerController {
  constructor(initialView = null, options = {}) {
    this.fadeMs = Number.isFinite(Number(options.fadeMs)) ? Math.max(0, Number(options.fadeMs)) : BG_FADE_MS;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.seq = 0;
    this.timer = null;
    this.layers = initialView
      ? [{ id: 0, view: initialView, enter: Boolean(options.firstEnter), at: this.now() }]
      : [];
  }

  getLayers() {
    return this.layers.slice();
  }

  getTop() {
    return this.layers.length ? this.layers[this.layers.length - 1] : null;
  }

  _emit() {
    if (this.onChange) {
      try { this.onChange(this.getLayers()); } catch (_) {}
    }
  }

  _clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  _scheduleCleanup() {
    this._clearTimer();
    const top = this.getTop();
    if (!top) return;
    if (this.layers.length < 2 && !top.enter) return;
    const wait = top.enter ? Math.max(0, this.fadeMs - (this.now() - top.at)) + 40 : 0;
    const targetId = top.id;
    this.timer = setTimeout(() => {
      this.timer = null;
      const curTop = this.getTop();
      if (curTop && curTop.id === targetId) {
        this.layers = [{ ...curTop, enter: false }];
        this._emit();
      }
    }, wait);
  }

  /**
   * 推入新視圖（需含唯一識別鍵 `key`）。
   * @param {{ key: string, [k: string]: any }} view
   * @param {{ instant?: boolean }} [opts]
   */
  push(view, opts = {}) {
    if (!view || !view.key) return this.getLayers();
    const instant = Boolean(opts.instant || this.fadeMs <= 0);
    const top = this.getTop();

    if (!top) {
      this.layers = [{ id: ++this.seq, view, enter: !instant, at: this.now() }];
      this._emit();
      this._scheduleCleanup();
      return this.getLayers();
    }

    if (top.view.key === view.key) {
      // 同圖僅更新附屬屬性，不重播淡入
      this.layers = this.layers.map((item, idx) => (idx === this.layers.length - 1 ? { ...item, view } : item));
      this._emit();
      return this.getLayers();
    }

    const nextLayer = { id: ++this.seq, view, enter: !instant, at: this.now() };
    this.layers = instant ? [nextLayer] : [...this.layers, nextLayer];
    this._emit();
    this._scheduleCleanup();
    return this.getLayers();
  }

  /**
   * 立即落定為最頂層單一靜止圖並釋放底層（釋放合成層與計時器）。
   */
  settle() {
    this._clearTimer();
    const top = this.getTop();
    if (!top) return this.getLayers();
    if (this.layers.length < 2 && !top.enter) return this.getLayers();
    this.layers = [{ ...top, enter: false }];
    this._emit();
    return this.getLayers();
  }

  dispose() {
    this._clearTimer();
  }
}
