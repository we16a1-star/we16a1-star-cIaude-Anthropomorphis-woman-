/**
 * line-runner.js — 逐句演出控制器（借鏡 AnimaVN Galgame 逐句播放器架構）
 * 
 * 支援特性：
 * 1. 逐句推進（Sentence-by-sentence queue）
 * 2. 點擊插話 / 快進（點擊時：若當句未播完則瞬間顯示全句，若已播完則推進到下一句）
 * 3. 播放狀態鎖定（播放中標記，供 UI 禁用選項，播放完畢回呼解鎖）
 * 4. 偏好持久化（可開關逐句演出，若關閉則一次性顯示全部）
 */

const STORAGE_KEY_LINE_MODE = 'claude_novel_line_mode_v1';
const STORAGE_KEY_LINE_SPEED = 'claude_novel_line_speed_v1';

export { STORAGE_KEY_LINE_MODE, STORAGE_KEY_LINE_SPEED };

export class LineRunner {
  constructor(options = {}) {
    this.speed = options.speed || this.loadSpeedPreference(); // 每字毫秒數（D17：預設 35ms）
    this.enabled = this.loadPreference();
    this.lines = [];
    this.currentIndex = -1;
    this.currentText = '';
    this.displayedText = '';
    this.isPlaying = false;
    this.isCharTyping = false;
    this.timer = null;
    this.onLineChange = options.onLineChange || null;
    this.onFinish = options.onFinish || null;
  }

  loadPreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(STORAGE_KEY_LINE_MODE);
        if (val !== null) return val === 'true';
      }
    } catch (_) {}
    return true; // 預設開啟逐句演出
  }

  savePreference(enabled) {
    this.enabled = !!enabled;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LINE_MODE, String(this.enabled));
      }
    } catch (_) {}
  }

  loadSpeedPreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = parseInt(localStorage.getItem(STORAGE_KEY_LINE_SPEED), 10);
        if (Number.isFinite(val) && val >= 10 && val <= 200) return val;
      }
    } catch (_) {}
    return 35; // D17 預設 35ms
  }

  saveSpeedPreference(speed) {
    const val = Math.max(10, Math.min(200, Math.round(Number(speed) || 35)));
    this.speed = val;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LINE_SPEED, String(val));
      }
    } catch (_) {}
  }

  /**
   * 開始播放一組句子
   * @param {string[]} lines 
   * @param {Object} callbacks 
   */
  start(lines, callbacks = {}) {
    this.stop();
    if (callbacks.onLineChange) this.onLineChange = callbacks.onLineChange;
    if (callbacks.onFinish) this.onFinish = callbacks.onFinish;

    if (!Array.isArray(lines) || lines.length === 0) {
      this.lines = [];
      this.currentIndex = -1;
      this.isPlaying = false;
      if (this.onFinish) this.onFinish();
      return;
    }

    this.lines = [...lines];

    // 若關閉了逐句演出，直接展示全部
    if (!this.enabled) {
      this.currentIndex = this.lines.length - 1;
      this.displayedText = this.lines.join('\n');
      this.isPlaying = false;
      if (this.onLineChange) {
        this.onLineChange(this.displayedText, this.currentIndex, this.lines.length, false);
      }
      if (this.onFinish) this.onFinish();
      return;
    }

    this.currentIndex = 0;
    this.isPlaying = true;
    this.playCurrentLine();
  }

  /**
   * 播放當前句子（打字機效果）
   */
  playCurrentLine() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.currentText = this.lines[this.currentIndex] || '';
    let charIndex = 0;
    this.displayedText = '';
    this.isCharTyping = true;

    // 觸發初始回呼
    if (this.onLineChange) {
      this.onLineChange(this.displayedText, this.currentIndex, this.lines.length, true);
    }

    this.timer = setInterval(() => {
      if (charIndex < this.currentText.length) {
        this.displayedText += this.currentText[charIndex];
        charIndex++;
        if (this.onLineChange) {
          this.onLineChange(this.displayedText, this.currentIndex, this.lines.length, true);
        }
      } else {
        this.finishCurrentLineTyping();
      }
    }, this.speed);
  }

  /**
   * 當前句打字完成
   */
  finishCurrentLineTyping() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isCharTyping = false;
    this.displayedText = this.currentText;
    const isLastLine = this.currentIndex >= this.lines.length - 1;

    if (this.onLineChange) {
      this.onLineChange(this.displayedText, this.currentIndex, this.lines.length, false);
    }

    if (isLastLine) {
      this.isPlaying = false;
      if (this.onFinish) this.onFinish();
    }
  }

  /**
   * 使用者點擊插話 / 下一句
   * @returns {boolean} 是否仍有下一句
   */
  nextOrSkip() {
    if (!this.isPlaying && this.currentIndex >= this.lines.length - 1) {
      return false;
    }

    // 若當前句正在打字，直接快進完成當前句
    if (this.isCharTyping) {
      this.finishCurrentLineTyping();
      return true;
    }

    // 若當前句已播完，且還有下一句，播下一句
    if (this.currentIndex < this.lines.length - 1) {
      this.currentIndex++;
      this.playCurrentLine();
      return true;
    }

    // 已經是最後一句了
    this.isPlaying = false;
    if (this.onFinish) this.onFinish();
    return false;
  }

  /**
   * 跳過全部，直接展示整篇
   */
  skipAll() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isCharTyping = false;
    this.isPlaying = false;
    this.currentIndex = this.lines.length - 1;
    this.displayedText = this.lines.join('\n');
    if (this.onLineChange) {
      this.onLineChange(this.displayedText, this.currentIndex, this.lines.length, false);
    }
    if (this.onFinish) this.onFinish();
  }

  /**
   * 停止當前演出
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isCharTyping = false;
    this.isPlaying = false;
  }
}

