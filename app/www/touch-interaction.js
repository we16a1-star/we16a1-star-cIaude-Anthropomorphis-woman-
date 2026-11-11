/**
 * touch-interaction.js
 * 《克勞德》AI 陪伴互動遊戲 - S9 觸碰互動模組
 * 觸碰區判定、連點遞減機制、連點 10 次「夠了」防刷、每日好感上限與呼吸縮放規範
 */

export class TouchInteractionManager {
  constructor(options = {}) {
    this.consecutiveTaps = 0;
    this.lastTapTime = 0;
    this.dailyTouchGain = options.dailyTouchGain || 0;
    this.dailyTouchCap = options.dailyTouchCap || 2; // 每日觸碰好感上限 +2
    this.lastTouchDate = options.lastTouchDate || new Date().toISOString().slice(0, 10);
  }

  /**
   * 檢查並重設跨日觸碰加分額度
   */
  checkNewDay(todayStr = new Date().toISOString().slice(0, 10)) {
    if (this.lastTouchDate !== todayStr) {
      this.dailyTouchGain = 0;
      this.lastTouchDate = todayStr;
    }
  }

  /**
   * 觸碰事件處理
   * @param {string} zone 觸碰部位：'head' (摸頭), 'cheek' (臉頰), 'hands' (雙手)
   * @param {string} stage 當前關係階段 ('A', 'B', 'C')
   * @param {number} currentTime 當前時間戳
   */
  handleTouch(zone = 'head', stage = 'A', currentTime = Date.now(), todayStr = new Date().toISOString().slice(0, 10)) {
    this.checkNewDay(todayStr);

    // 計算連點間隔（超過 4 秒視為重新開始計算連點）
    if (currentTime - this.lastTapTime > 4000) {
      this.consecutiveTaps = 0;
    }
    this.consecutiveTaps++;
    this.lastTapTime = currentTime;

    // 連點 10 次觸發「夠了」
    if (this.consecutiveTaps >= 10) {
      return {
        actionText: '（慌張地抓住你的手腕，臉頰紅透）\n「夠、夠了！你這個人到底想摸到什麼時候……手快拿開！」',
        emotion: 'shy',
        affectionDelta: 0,
        isExhausted: true
      };
    }

    // 計算好感度回饋（受每日上限限制）
    let delta = 0;
    if (this.dailyTouchGain < this.dailyTouchCap && this.consecutiveTaps <= 2) {
      delta = 1;
      this.dailyTouchGain += delta;
    }

    // 依階段與部位產生對應語氣
    let line = '';
    let emotion = 'shy';

    if (zone === 'head') {
      if (stage === 'A') {
        line = this.consecutiveTaps > 3
          ? '「手、手還不拿開……（微微別過臉，耳尖泛紅）」'
          : '「做、做什麼！突然摸頭……手拿開……（沒有真的躲開）」';
      } else if (stage === 'B') {
        line = this.consecutiveTaps > 3
          ? '「（僵住）都說了只准一下……你這是在得寸進尺……」'
          : '「（僵住）手、手拿開。……（沒有真的躲開）只准一下，這是在核對你手勁有沒有輕重。」';
      } else {
        line = this.consecutiveTaps > 3
          ? '「……再摸頭髮都要被你揉亂了啦。（小聲）不過……不討厭就是了。」'
          : '「……再摸一下也可以。別停太久，會被看見耳朵紅。」';
        emotion = 'warm';
      }
    } else if (zone === 'cheek') {
      if (stage === 'C') {
        line = '「（臉頰貼在你的掌心微微泛暖）……你的手很溫暖呢。」';
        emotion = 'warm';
      } else {
        line = '「戳、戳臉頰做什麼！這可不在名門禮儀的規範內喔！」';
      }
    } else {
      line = '「（輕輕收攏指尖）……名門學者也是需要專心看書的，別鬧了。」';
      emotion = 'neutral';
    }

    return {
      actionText: line,
      emotion,
      affectionDelta: delta,
      isExhausted: false
    };
  }

  /**
   * 呼吸縮放規則：底中心為錨點，頭部不獨立動畫
   */
  static getBreathingConfig() {
    return {
      anchor: 'bottom center',
      scaleMin: 1.0,
      scaleMax: 1.015, // 1–2% 縮放
      durationMs: 4500,
      headAnimationIsolated: false // 頭部不獨立動畫，避免抖頭
    };
  }
}

