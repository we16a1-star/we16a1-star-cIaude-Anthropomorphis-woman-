/**
 * memory-system.js
 * 《克勞德》AI 陪伴互動遊戲 - S6 三層記憶系統模組
 * 近期對話窗、長期事實庫、關係事件日誌，支援檢視、編輯、刪除、匯出與召回檢索
 */

import { normalizePlayerName } from './player-name.js';

export class MemorySystem {
  constructor(initialData = {}) {
    // 1. 長期事實庫：存放玩家明說的事實、喜好、承諾、重要日子等
    // 每筆格式：{ id, category, key, value, timestamp, source }
    this.facts = Array.isArray(initialData.facts) ? initialData.facts : [];

    // 2. 關係事件日誌：觸發過的旗標、CG、心動瞬間
    this.eventLogs = Array.isArray(initialData.eventLogs) ? initialData.eventLogs : [];

    // 3. 近期對話摘要
    this.summary = typeof initialData.summary === 'string' ? initialData.summary : '';

    // 基礎設定
    this.playerName = normalizePlayerName(initialData.playerName);
    this.playerNickname = initialData.playerNickname || '';
  }

  /**
   * 寫入或更新長期記憶事實
   * 只記錄玩家明確表達的事實，不記錄猜測或虛構
   */
  setFact(key, value, category = 'preference', source = 'dialogue') {
    if (!key || value === undefined || value === null) return;
    const existingIndex = this.facts.findIndex(f => f.key.toLowerCase() === String(key).toLowerCase());
    const factRecord = {
      id: existingIndex >= 0 ? this.facts[existingIndex].id : 'fact_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      category,
      key: String(key).trim(),
      value: String(value).trim(),
      timestamp: Date.now(),
      source
    };

    if (existingIndex >= 0) {
      this.facts[existingIndex] = factRecord;
    } else {
      this.facts.push(factRecord);
    }
  }

  /**
   * 取得指定鍵的事實值
   */
  getFact(key) {
    const found = this.facts.find(f => f.key.toLowerCase() === String(key).toLowerCase());
    return found ? found.value : null;
  }

  /**
   * 刪除指定事實（玩家控制）
   */
  deleteFact(factId) {
    this.facts = this.facts.filter(f => f.id !== factId && f.key !== factId);
  }

  /**
   * 編輯指定事實（玩家控制）
   */
  updateFact(factId, newValue) {
    const item = this.facts.find(f => f.id === factId || f.key === factId);
    if (item) {
      item.value = String(newValue).trim();
      item.timestamp = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 記錄關係事件
   */
  recordEvent(eventName, details = {}) {
    this.eventLogs.push({
      eventName,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * 召回檢索（供 20 題召回測試與提示詞精準注入）
   * 根據查詢字詞進行比對檢索
   */
  recall(query) {
    if (!query) return [];
    const q = String(query).toLowerCase().trim();
    return this.facts.filter(f => 
      f.key.toLowerCase().includes(q) || 
      f.value.toLowerCase().includes(q) ||
      q.includes(f.key.toLowerCase())
    );
  }

  /**
   * 組裝長期記憶摘要字串（供注入提示詞）
   */
  buildMemoryPrompt() {
    const lines = [];
    if (this.playerName) lines.push(`- 玩家稱呼：${this.playerName}${this.playerNickname ? `（暱稱：${this.playerNickname}）` : ''}`);
    
    // 將事實依類別整理
    const categories = {
      preference: '喜好與習慣',
      promise: '約定與約會',
      boundary: '界線',
      anniversary: '紀念日',
      secret: '共同祕密'
    };

    for (const [catKey, catLabel] of Object.entries(categories)) {
      const items = this.facts.filter(f => f.category === catKey);
      if (items.length > 0) {
        const itemStrs = items.map(it => `${it.key}：${it.value}`).join('；');
        lines.push(`- ${catLabel}：${itemStrs}`);
      }
    }

    if (this.summary) {
      lines.push(`- 前情提要：${this.summary}`);
    }

    return lines.length > 0 ? lines.join('\n') : '目前尚無長期記憶紀錄。';
  }

  /**
   * 匯出記憶為 JSON 物件（玩家控制）
   */
  exportJson() {
    return JSON.stringify({
      version: '2.0',
      exportedAt: new Date().toISOString(),
      playerName: this.playerName,
      playerNickname: this.playerNickname,
      facts: this.facts,
      eventLogs: this.eventLogs,
      summary: this.summary
    }, null, 2);
  }

  /**
   * 匯入記憶（玩家控制）
   */
  importJson(jsonString) {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (data && typeof data === 'object') {
        if (data.playerName) this.playerName = data.playerName;
        if (data.playerNickname) this.playerNickname = data.playerNickname;
        if (Array.isArray(data.facts)) this.facts = data.facts;
        if (Array.isArray(data.eventLogs)) this.eventLogs = data.eventLogs;
        if (typeof data.summary === 'string') this.summary = data.summary;
        return true;
      }
    } catch (e) {
      console.error('Import memory failed:', e);
    }
    return false;
  }
}

