/**
 * life-simulator.js
 * 《克勞德》AI 陪伴互動遊戲 - S7 生活模擬器模組
 * 負責 24 小時作息排程、離線補算、活動日誌、精力／專注度計算、
 * 動作白名單驗證、深夜勸休息與生活層提示詞組裝
 */

import { ALL_CONFIGS } from './config-loader.js';

const { schedule: scheduleConfig, actions: actionsConfig } = ALL_CONFIGS;

export class LifeSimulator {
  constructor(initialData = {}) {
    this.energy = typeof initialData.energy === 'number' ? initialData.energy : 80;
    this.manualProgress = typeof initialData.manualProgress === 'number' ? initialData.manualProgress : 15;
    this.recentLogs = Array.isArray(initialData.recentLogs) ? initialData.recentLogs.slice(-5) : [];
    this.lastActiveTime = initialData.lastActiveTime || Date.now();
    this.nightSleepAdvisedDate = initialData.nightSleepAdvisedDate || '';
    this.currentPeriod = null;
    this.refreshCurrentPeriod();
  }

  /**
   * 根據指定小時數（0–23）或當前本地時間獲取所屬時段
   */
  getPeriodForHour(hour = new Date().getHours()) {
    const periods = scheduleConfig.periods;
    for (const p of periods) {
      if (p.startHour < p.endHour) {
        if (hour >= p.startHour && hour < p.endHour) return p;
      } else {
        // 跨午夜時段，例如深夜 23–6
        if (hour >= p.startHour || hour < p.endHour) return p;
      }
    }
    return periods[0];
  }

  /**
   * 刷新當前時段與生活狀態
   */
  refreshCurrentPeriod(now = new Date()) {
    const period = this.getPeriodForHour(now.getHours());
    this.currentPeriod = period;
    return period;
  }

  /**
   * 離線補算機制：依據離線時長補算各時段活動、日誌、精力與手冊進度
   * @param {number} currentTime 當前時間戳
   */
  processOfflineTime(currentTime = Date.now(), stage = 'A') {
    const elapsedMs = currentTime - this.lastActiveTime;
    const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));

    if (elapsedHours >= 1) {
      const now = new Date(currentTime);
      const past = new Date(this.lastActiveTime);
      
      // 依經過的時段生成合理活動日誌
      const hoursToSimulate = Math.min(elapsedHours, 24);
      let stepTime = new Date(past.getTime() + 60 * 60 * 1000);
      let simulatedLogs = [];

      for (let h = 0; h < hoursToSimulate; h += 3) {
        const p = this.getPeriodForHour(stepTime.getHours());
        simulatedLogs.push(`在${p.location}${p.activity}`);
        stepTime = new Date(stepTime.getTime() + 3 * 60 * 60 * 1000);
      }

      for (const log of simulatedLogs) {
        this.addLog(log);
      }

      // 手冊進度由她自己推進，離線有適度成長
      const progressGain = Math.min(10, Math.floor(elapsedHours * 0.5));
      this.manualProgress = Math.min(100, this.manualProgress + progressGain);

      // 依當前時段重設精力
      const currentP = this.refreshCurrentPeriod(now);
      this.energy = currentP.energy;
    } else {
      this.refreshCurrentPeriod(new Date(currentTime));
    }

    this.lastActiveTime = currentTime;
    return this.generateOfflineGreeting(elapsedHours, stage);
  }

  /**
   * 新增一筆活動日誌（嚴格最多保留 5 筆）
   */
  addLog(logText) {
    if (!logText) return;
    this.recentLogs.push(String(logText));
    if (this.recentLogs.length > 5) {
      this.recentLogs = this.recentLogs.slice(-5);
    }
  }

  /**
   * 產生離線回歸問候語
   * （D13 修訂）等待／愧疚句無限制：不再過濾此類字眼
   */
  generateOfflineGreeting(offlineHours, stage = 'A') {
    const period = this.currentPeriod || this.getPeriodForHour();
    const lastLog = this.recentLogs.length > 0 ? this.recentLogs[this.recentLogs.length - 1] : period.activity;

    let greeting = '';
    if (stage === 'C') {
      greeting = period.greetingSampleC || `你回來了！剛剛我正在${lastLog}呢。今晚換我陪你聊聊吧。`;
    } else if (stage === 'B') {
      greeting = `（翻書翻得很快）……你來啦。剛好把茶泡了兩杯，順手而已，別誤會。我剛剛正忙著${lastLog}呢。`;
    } else {
      greeting = period.greetingSampleA || `你還知道要來啊。我剛剛正在${lastLog}，可不是特意在等你。`;
    }

    return greeting;
  }

  /**
   * 檢查深夜時段是否需要溫柔勸休息（23:00–05:00）
   */
  checkNightSleepAdvice(currentHour = new Date().getHours(), todayStr = new Date().toISOString().slice(0, 10)) {
    const isLateNight = currentHour >= 23 || currentHour < 5;
    if (isLateNight && this.nightSleepAdvisedDate !== todayStr) {
      this.nightSleepAdvisedDate = todayStr;
      return {
        shouldAdvise: true,
        message: '（掩著嘴打了個哈欠，用手揉了揉眼睛）\n已經很晚了呢……研究或工作再重要，也沒有身體重要喔。快去休息吧，明天我依然在這裡。'
      };
    }
    return { shouldAdvise: false, message: '' };
  }

  /**
   * 驗證動作標籤是否在動作庫白名單內
   */
  validateAction(actionTag) {
    if (!actionTag) return null;
    return actionsConfig.whitelist.includes(actionTag) ? actionTag : null;
  }

  /**
   * 取得指定動作標籤的詳細資訊（描寫文字、對應圖）
   */
  getActionInfo(actionTag) {
    const tag = this.validateAction(actionTag);
    if (!tag) return null;
    return actionsConfig.actions[tag] || null;
  }

  /**
   * 組裝【生活層】提示詞區塊
   */
  buildLivingSectionPrompt() {
    const p = this.currentPeriod || this.getPeriodForHour();
    const logsStr = this.recentLogs.length > 0 ? this.recentLogs.join('；') : p.activity;

    return scheduleConfig.promptLivingSectionTemplate
      .replace('{periodName}', p.name)
      .replace('{location}', p.location)
      .replace('{activity}', p.activity)
      .replace('{energy}', this.energy)
      .replace('{focus}', p.focus)
      .replace('{recentLogs}', logsStr);
  }

  /**
   * 序列化生活狀態
   */
  serialize() {
    return {
      energy: this.energy,
      manualProgress: this.manualProgress,
      recentLogs: this.recentLogs,
      lastActiveTime: this.lastActiveTime,
      nightSleepAdvisedDate: this.nightSleepAdvisedDate
    };
  }
}

