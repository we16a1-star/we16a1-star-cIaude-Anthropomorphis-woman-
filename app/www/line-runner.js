/**
 * line-runner.js — 逐句演出控制器（借鏡 AnimaVN Galgame 逐句播放器架構）
 *
 * 支援特性：
 * 1. 逐句推進（Sentence-by-sentence queue），同時相容純字串陣列 string[] 與結構化 VNLine[]
 * 2. 句級演出元資料回呼（onLineMeta）：支援逐句動態情緒、場景與說話人提示
 * 3. 點擊插話 / 快進（點擊時：若當句未播完則瞬間顯示全句，若已播完則推進到下一句）
 * 4. 插話截斷點查詢（getTruncatedEndOffset / getVisibleLines）
 * 5. 播放狀態鎖定與偏好持久化（逐句模式、打字速度、自動播放、句間停留時間）
 */

const STORAGE_KEY_LINE_MODE = 'claude_novel_line_mode_v1';
const STORAGE_KEY_LINE_SPEED = 'claude_novel_line_speed_v1';
const STORAGE_KEY_LINE_AUTOPLAY = 'claude_novel_line_autoplay_v1';
const STORAGE_KEY_LINE_AUTO_DELAY = 'claude_novel_line_autodelay_v1';

export { STORAGE_KEY_LINE_MODE, STORAGE_KEY_LINE_SPEED, STORAGE_KEY_LINE_AUTOPLAY, STORAGE_KEY_LINE_AUTO_DELAY };

function normalizeEntry(entry) {
  if (typeof entry === 'string') {
    return { text: entry, speaker: null, kind: 'narration', emotion: null, scene: null, player: false, spokenText: null, endOffset: null };
  }
  if (entry && typeof entry === 'object') {
    return {
      text: String(entry.text || ''),
      speaker: entry.speaker ?? null,
      kind: entry.kind || 'narration',
      emotion: entry.emotion || null,
      emotionSource: entry.emotionSource || null,
      scene: entry.scene || null,
      player: Boolean(entry.player),
      spokenText: typeof entry.spokenText === 'string' && entry.spokenText.trim() ? entry.spokenText.trim() : null,
      endOffset: Number.isFinite(Number(entry.endOffset)) ? Number(entry.endOffset) : null
    };
  }
  return { text: '', speaker: null, kind: 'narration', emotion: null, scene: null, player: false, spokenText: null, endOffset: null };
}

export class LineRunner {
  constructor(options = {}) {
    this.speed = options.speed || this.loadSpeedPreference(); // 每字毫秒數（D17：預設 35ms）
    this.enabled = this.loadPreference();
    // 自動播放：預設開啟；每句打字完成後停留 autoDelay 毫秒再自動接下一句。
    this.autoAdvance = options.autoAdvance !== undefined
      ? !!options.autoAdvance
      : this.loadAutoAdvancePreference();
    this.autoDelay = Number.isFinite(Number(options.autoDelay))
      ? Math.max(0, Math.round(Number(options.autoDelay)))
      : this.loadAutoDelayPreference();
    this.lines = [];
    this.entries = [];
    this.currentIndex = -1;
    this.currentText = '';
    this.displayedText = '';
    this.isPlaying = false;
    this.isCharTyping = false;
    this.timer = null;
    this.autoTimer = null;
    this.onLineChange = options.onLineChange || null;
    this.onLineMeta = options.onLineMeta || null;
    this.onFinish = options.onFinish || null;
    this.isVoiceBusy = typeof options.isVoiceBusy === 'function' ? options.isVoiceBusy : null;
    this.maxVoiceWaitMs = Number.isFinite(Number(options.maxVoiceWaitMs))
      ? Math.max(0, Math.round(Number(options.maxVoiceWaitMs)))
      : 15000;
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

  loadAutoAdvancePreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(STORAGE_KEY_LINE_AUTOPLAY);
        if (val !== null) return val === 'true';
      }
    } catch (_) {}
    return true; // 預設開啟自動播放
  }

  saveAutoAdvancePreference(enabled) {
    this.autoAdvance = !!enabled;
    if (!this.autoAdvance) this.clearAutoTimer();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LINE_AUTOPLAY, String(this.autoAdvance));
      }
    } catch (_) {}
  }

  loadAutoDelayPreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = parseInt(localStorage.getItem(STORAGE_KEY_LINE_AUTO_DELAY), 10);
        if (Number.isFinite(val) && val >= 500 && val <= 6000) return val;
      }
    } catch (_) {}
    return 1800; // 預設每句停留 1.8 秒
  }

  saveAutoDelayPreference(delay) {
    const val = Math.max(500, Math.min(6000, Math.round(Number(delay) || 1800)));
    this.autoDelay = val;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LINE_AUTO_DELAY, String(val));
      }
    } catch (_) {}
  }

  clearAutoTimer() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  getCurrentMeta() {
    if (this.currentIndex < 0 || this.currentIndex >= this.entries.length) return null;
    return this.entries[this.currentIndex] || null;
  }

  /**
   * 回傳目前播放句的原文結束位移（給插話／分叉存檔截斷用；無結構化位移則回傳 null）。
   */
  getTruncatedEndOffset() {
    const meta = this.getCurrentMeta();
    return meta && Number.isFinite(meta.endOffset) ? meta.endOffset : null;
  }

  /**
   * 回傳截至目前為止已顯示的句子陣列。
   */
  getVisibleLines() {
    if (this.currentIndex < 0) return [];
    return this.lines.slice(0, this.currentIndex + 1);
  }

  notifyLineMeta() {
    if (typeof this.onLineMeta === 'function') {
      const meta = this.getCurrentMeta();
      if (meta) {
        try {
          this.onLineMeta(meta, this.currentIndex, this.lines.length);
        } catch (_) {}
      }
    }
  }

  /**
   * 目前句子播完後，若自動播放開啟且還有下一句，排定自動前進。
   * 若語音仍在朗讀，自動播放會禮貌等待配音結束（最長 maxVoiceWaitMs）；
   * 手動點擊／跳過會先清除這個計時器，確保使用者操作永遠優先。
   */
  scheduleAutoAdvance() {
    this.clearAutoTimer();
    if (!this.autoAdvance || !this.enabled || !this.isPlaying) return;
    if (this.currentIndex >= this.lines.length - 1) return;

    const waitedStart = Date.now();
    const tick = () => {
      this.autoTimer = null;
      if (!this.autoAdvance || !this.isPlaying || this.isCharTyping) return;
      if (this.currentIndex >= this.lines.length - 1) return;
      if (this.isVoiceBusy && this.isVoiceBusy() && (Date.now() - waitedStart) < this.maxVoiceWaitMs) {
        this.autoTimer = setTimeout(tick, 250);
        return;
      }
      this.currentIndex++;
      this.playCurrentLine();
    };

    this.autoTimer = setTimeout(tick, this.autoDelay);
  }

  /**
   * 開始播放一組句子（接受 string[] 或 VNLine[]）
   * @param {Array<string|object>} lines
   * @param {Object} callbacks
   */
  start(lines, callbacks = {}) {
    this.stop();
    if (callbacks.onLineChange) this.onLineChange = callbacks.onLineChange;
    if (callbacks.onLineMeta) this.onLineMeta = callbacks.onLineMeta;
    if (callbacks.onFinish) this.onFinish = callbacks.onFinish;

    if (!Array.isArray(lines) || lines.length === 0) {
      this.lines = [];
      this.entries = [];
      this.currentIndex = -1;
      this.isPlaying = false;
      if (this.onFinish) this.onFinish();
      return;
    }

    this.entries = lines.map(normalizeEntry).filter(e => e.text.length > 0);
    this.lines = this.entries.map(e => e.text);

    if (this.lines.length === 0) {
      this.currentIndex = -1;
      this.isPlaying = false;
      if (this.onFinish) this.onFinish();
      return;
    }

    // 若關閉了逐句演出，直接展示全部
    if (!this.enabled) {
      this.currentIndex = this.lines.length - 1;
      this.displayedText = this.lines.join('\n');
      this.isPlaying = false;
      this.notifyLineMeta();
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
    this.clearAutoTimer();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.currentText = this.lines[this.currentIndex] || '';
    let charIndex = 0;
    this.displayedText = '';
    this.isCharTyping = true;

    this.notifyLineMeta();

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
    } else {
      this.scheduleAutoAdvance();
    }
  }

  /**
   * 使用者點擊插話 / 下一句
   * @returns {boolean} 是否仍有下一句
   */
  nextOrSkip() {
    this.clearAutoTimer();
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
    this.clearAutoTimer();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isCharTyping = false;
    this.isPlaying = false;
    this.currentIndex = this.lines.length - 1;
    this.displayedText = this.lines.join('\n');
    this.notifyLineMeta();
    if (this.onLineChange) {
      this.onLineChange(this.displayedText, this.currentIndex, this.lines.length, false);
    }
    if (this.onFinish) this.onFinish();
  }

  /**
   * 停止當前演出
   */
  stop() {
    this.clearAutoTimer();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isCharTyping = false;
    this.isPlaying = false;
  }
}
