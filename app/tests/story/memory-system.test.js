import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySystem } from '../../www/memory-system.js';

test('S6 驗收：20 題記憶召回測試召回率 >= 90% (20/20 通過 = 100%)', () => {
  const memory = new MemorySystem({ playerName: '艾倫', playerNickname: '倫' });

  // 預先寫入 20 筆記憶事實
  const seedFacts = [
    ['玩家名字', '艾倫', 'preference'],
    ['玩家暱稱', '倫', 'preference'],
    ['最喜歡的茶', '大吉嶺紅茶加微糖', 'preference'],
    ['最討厭的食物', '苦瓜與香菜', 'boundary'],
    ['玩家生日', '10月24日', 'anniversary'],
    ['認識紀念日', '11月6日', 'anniversary'],
    ['約定事項', '下週六一起去舊書市集校勘古卷', 'promise'],
    ['閱讀習慣', '睡前喜歡讀十五分鐘冒險小說', 'preference'],
    ['慣用手', '左手', 'preference'],
    ['機巧愛好', '對雙齒輪自鳴鐘特別感興趣', 'preference'],
    ['克勞德的祕密', '想寫一本初學者也看得懂的機巧手冊', 'secret'],
    ['工作狀態', '最近在準備期末專題報告很忙碌', 'preference'],
    ['休息方式', '聽雨聲放鬆', 'preference'],
    ['約定稱呼', '私底下可以叫我倫', 'promise'],
    ['寵物', '家裡養了一隻叫布丁的虎斑貓', 'preference'],
    ['咖啡喜好', '不喝黑咖啡，只喝拿鐵', 'preference'],
    ['怕冷怕熱', '冬天特別容易手腳冰冷', 'preference'],
    ['隨身物品', '隨身戴著黃銅懷錶', 'preference'],
    ['告白約定', '等日芒印章蓋下就一起看日落', 'promise'],
    ['重要約定', '答應克勞德絕不熬夜超過十二點', 'boundary']
  ];

  for (const [key, val, cat] of seedFacts) {
    memory.setFact(key, val, cat);
  }

  // 20 題查詢問題與預期命中關鍵字
  const queries = [
    { q: '名字', expected: '艾倫' },
    { q: '暱稱', expected: '倫' },
    { q: '喜歡的茶', expected: '大吉嶺紅茶' },
    { q: '討厭的食物', expected: '苦瓜' },
    { q: '生日', expected: '10月24日' },
    { q: '認識紀念日', expected: '11月6日' },
    { q: '舊書市集', expected: '下週六' },
    { q: '閱讀習慣', expected: '冒險小說' },
    { q: '慣用手', expected: '左手' },
    { q: '雙齒輪自鳴鐘', expected: '自鳴鐘' },
    { q: '祕密', expected: '初學者' },
    { q: '期末專題', expected: '忙碌' },
    { q: '聽雨聲', expected: '聽雨聲' },
    { q: '稱呼', expected: '私底下' },
    { q: '布丁', expected: '虎斑貓' },
    { q: '咖啡', expected: '拿鐵' },
    { q: '冬天', expected: '手腳冰冷' },
    { q: '懷錶', expected: '黃銅懷錶' },
    { q: '日芒印章', expected: '看日落' },
    { q: '熬夜', expected: '十二點' }
  ];

  let passedCount = 0;
  for (const item of queries) {
    const hits = memory.recall(item.q);
    const hit = hits.some(h => h.value.includes(item.expected) || h.key.includes(item.expected));
    if (hit) passedCount++;
  }

  const recallRate = passedCount / queries.length;
  assert.ok(recallRate >= 0.90, `召回率必須 >= 90%，實際為 ${(recallRate * 100).toFixed(1)}%`);
  assert.equal(passedCount, 20, '20 題全數成功召回');
});

test('S6: 玩家對記憶的檢視、編輯、刪除、匯出與匯入控制', () => {
  const memory = new MemorySystem();
  memory.setFact('最愛的茶', '伯爵紅茶', 'preference');
  assert.equal(memory.getFact('最愛的茶'), '伯爵紅茶');

  // 編輯
  memory.updateFact('最愛的茶', '皇家錫蘭奶茶');
  assert.equal(memory.getFact('最愛的茶'), '皇家錫蘭奶茶');

  // 匯出 JSON
  const exported = memory.exportJson();
  assert.ok(exported.includes('皇家錫蘭奶茶'));

  // 刪除
  memory.deleteFact('最愛的茶');
  assert.equal(memory.getFact('最愛的茶'), null);

  // 匯入恢復
  const success = memory.importJson(exported);
  assert.equal(success, true);
  assert.equal(memory.getFact('最愛的茶'), '皇家錫蘭奶茶');
});

