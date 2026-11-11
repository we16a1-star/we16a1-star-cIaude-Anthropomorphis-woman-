/**
 * state-machine.js
 * 《克勞德》AI 陪伴互動遊戲 - S5 狀態機模組
 * 負責好感度增減、每日上限、階段判定、好感帶計算、降階緩衝與單元驗證
 */

import { ALL_CONFIGS } from './config-loader.js';

const { stages: stagesConfig, affectionBands: bandsConfig } = ALL_CONFIGS;

export class RelationshipStateMachine {
  constructor(initialState = {}) {
    this.affection = typeof initialState.affection === 'number' ? initialState.affection : 0;
    this.stage = initialState.stage || 'A';
    this.band = initialState.band || null;
    this.confessed = !!initialState.confessed; // 旗標「告白成立」(vow_completed)
    this.flags = new Set(Array.isArray(initialState.flags) ? initialState.flags : []);
    this.dailyGain = typeof initialState.dailyGain === 'number' ? initialState.dailyGain : 0;
    this.dailyReconcileGain = typeof initialState.dailyReconcileGain === 'number' ? initialState.dailyReconcileGain : 0;
    this.lastGainDate = initialState.lastGainDate || new Date().toISOString().slice(0, 10);
    this.recalculate();
  }

  /**
   * 檢查並重設跨日額度
   */
  checkNewDay(currentDateStr = new Date().toISOString().slice(0, 10)) {
    if (this.lastGainDate !== currentDateStr) {
      this.dailyGain = 0;
      this.dailyReconcileGain = 0;
      this.lastGainDate = currentDateStr;
    }
  }

  /**
   * 核心狀態計算：依據好感度與告白旗標計算階段與好感帶
   * @param {number} affection 好感度 (0–100)
   * @param {boolean} confessed 告白是否成立
   * @param {string|null} currentStage 當前階段（供降階緩衝判斷）
   * @param {string|null} currentBand 當前好感帶（供緩衝判斷）
   * @returns {{ stage: string, stageName: string, band: string|null, bandName: string|null }}
   */
  static evaluate(affection, confessed, currentStage = null, currentBand = null) {
    const clampedAffection = Math.max(0, Math.min(100, Math.round(affection)));

    // 1. 階段判定
    let stageKey = 'A';
    if (confessed) {
      // 告白成立進入 C 階段，且不降階
      stageKey = 'C';
    } else {
      if (currentStage === 'B') {
        // 若已在 B 階段，需低於 45 (50 - 5 緩衝) 才退回 A
        stageKey = clampedAffection < 45 ? 'A' : 'B';
      } else {
        // A 進入 B 門檻為 50
        stageKey = clampedAffection >= 50 ? 'B' : 'A';
      }
    }

    const stageData = stagesConfig.stages[stageKey];
    const stageName = stageData ? stageData.name : stageKey;

    // 2. 好感帶判定（僅 C 告白後階段使用）
    let bandKey = null;
    let bandName = null;

    if (stageKey === 'C') {
      // 基準門檻：甜 80–100、平穩 50–79、小彆扭 30–49、待和好 0–29
      // 若已有 currentBand，則套用 ±5 緩衝
      if (!currentBand) {
        if (clampedAffection >= 80) bandKey = 'sweet';
        else if (clampedAffection >= 50) bandKey = 'stable';
        else if (clampedAffection >= 30) bandKey = 'awkward';
        else bandKey = 'reconciliation';
      } else {
        // 帶緩衝切換
        if (currentBand === 'sweet') {
          bandKey = clampedAffection < (80 - 5) ? (clampedAffection < 50 ? (clampedAffection < 30 ? 'reconciliation' : 'awkward') : 'stable') : 'sweet';
        } else if (currentBand === 'stable') {
          if (clampedAffection >= (80 + 5)) bandKey = 'sweet';
          else if (clampedAffection < (50 - 5)) bandKey = clampedAffection < 30 ? 'reconciliation' : 'awkward';
          else bandKey = 'stable';
        } else if (currentBand === 'awkward') {
          if (clampedAffection >= (50 + 5)) bandKey = clampedAffection >= 80 ? 'sweet' : 'stable';
          else if (clampedAffection < (30 - 5)) bandKey = 'reconciliation';
          else bandKey = 'awkward';
        } else if (currentBand === 'reconciliation') {
          bandKey = clampedAffection >= (30 + 5) ? (clampedAffection >= 80 ? 'sweet' : (clampedAffection >= 50 ? 'stable' : 'awkward')) : 'reconciliation';
        } else {
          // 未知回退
          if (clampedAffection >= 80) bandKey = 'sweet';
          else if (clampedAffection >= 50) bandKey = 'stable';
          else if (clampedAffection >= 30) bandKey = 'awkward';
          else bandKey = 'reconciliation';
        }
      }

      const bandData = bandsConfig.bands[bandKey];
      bandName = bandData ? bandData.name : bandKey;
    }

    return {
      stage: stageKey,
      stageName,
      band: bandKey,
      bandName
    };
  }

  /**
   * 重新計算當前內部狀態
   */
  recalculate() {
    const res = RelationshipStateMachine.evaluate(this.affection, this.confessed, this.stage, this.band);
    this.stage = res.stage;
    this.band = res.band;
    return res;
  }

  /**
   * 處理 LLM 單回合好感度提議
   * 規則：
   * 1. delta 嚴格夾在 −3～+3
   * 2. 正向增加受每日 +10 總上限約束
   * 3. 負向扣分不受每日增加上限約束
   * 4. 好感度範圍限制在 0～100
   * @param {number} proposedDelta LLM 提議的數值
   * @returns {{ actualDelta: number, newAffection: number }}
   */
  applyTurnDelta(proposedDelta, todayDateStr = new Date().toISOString().slice(0, 10)) {
    this.checkNewDay(todayDateStr);
    const clampedDelta = Math.max(-3, Math.min(3, Math.round(proposedDelta || 0)));
    let effectiveDelta = clampedDelta;

    if (clampedDelta > 0) {
      const allowedGain = Math.max(0, 10 - this.dailyGain);
      effectiveDelta = Math.min(clampedDelta, allowedGain);
      this.dailyGain += effectiveDelta;
    }

    const prev = this.affection;
    this.affection = Math.max(0, Math.min(100, this.affection + effectiveDelta));
    this.recalculate();

    return {
      actualDelta: this.affection - prev,
      newAffection: this.affection
    };
  }

  /**
   * 觸發重大事件扣分（由程式嚴格判定，−5～−10）
   */
  applyMajorPenalty(penalty) {
    const clampedPenalty = Math.max(-10, Math.min(-5, Math.round(penalty || -5)));
    this.affection = Math.max(0, Math.min(100, this.affection + clampedPenalty));
    this.recalculate();
    return this.affection;
  }

  /**
   * 觸發和好回補（由程式判定，+5～+10，受每日和好上限約束）
   */
  applyReconciliation(reward, todayDateStr = new Date().toISOString().slice(0, 10)) {
    this.checkNewDay(todayDateStr);
    const clampedReward = Math.max(5, Math.min(10, Math.round(reward || 5)));
    const allowed = Math.max(0, 10 - this.dailyReconcileGain);
    const effective = Math.min(clampedReward, allowed);
    this.dailyReconcileGain += effective;

    this.affection = Math.max(0, Math.min(100, this.affection + effective));
    this.recalculate();
    return this.affection;
  }

  /**
   * 玩家接受告白，確認交往（設旗標 vow_completed，進入 C 階段）
   */
  acceptConfession() {
    this.confessed = true;
    this.flags.add('vow_completed');
    this.flags.add('confession_accepted');
    this.recalculate();
  }

  /**
   * 設定劇情旗標
   */
  setFlag(flag) {
    if (!flag) return;
    this.flags.add(flag);
    if (flag === 'vow_completed') {
      this.confessed = true;
    }
    this.recalculate();
  }

  /**
   * 取得用於注入提示詞與 UI 的狀態物件
   */
  getStatus() {
    const res = this.recalculate();
    const stageData = stagesConfig.stages[this.stage];
    return {
      affection: this.affection,
      stage: this.stage,
      stageName: res.stageName,
      band: this.band,
      bandName: res.bandName,
      confessed: this.confessed,
      flags: Array.from(this.flags),
      address: stageData ? stageData.address : '{玩家名}',
      tsundereRatio: this.band && bandsConfig.bands[this.band]?.tsundereRatio !== null 
        ? bandsConfig.bands[this.band].tsundereRatio 
        : (stageData?.tsundereRatio ?? 0.5)
    };
  }
}

