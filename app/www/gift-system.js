// 禮物系統（純函式）：抽好感對話與 3 個禮物選項、計算送禮好感增減。
// 機率與分數在最上面（GIFT_* 常數）；調整數值後請跑 npm test（相關測試會驗證規則）。
export const GIFT_SINGLE_CHANCE = 0.03;
export const GIFT_MULTIPLE_CHANCE = 0.0002;
// 好感回饋加大：送對禮物 +1.5、送錯 -1.0，讓互動變化有感（veryEasy 仍不扣分）。
export const GIFT_CORRECT_AFFECTION = 1.5;
export const GIFT_WRONG_AFFECTION = -1.0;

const GIFT_CATALOG = [
  { id: 'bookmark', name: '手繪書籤', nameEn: 'Hand-painted bookmark', hint: '她說最近總在讀到一半時找不到書籤，還提起喜歡親手畫的小圖案。', hintEn: 'She keeps losing her place while reading and mentions that she likes little hand-painted details.' },
  { id: 'warm-tea', name: '桂花熱茶', nameEn: 'Osmanthus tea', hint: '她揉了揉被雨夜吹涼的指尖，說現在最想喝一杯帶著桂花香的熱茶。', hintEn: 'She warms her chilled fingers and says a hot cup of fragrant osmanthus tea sounds perfect.' },
  { id: 'orange-flower', name: '橘花髮飾', nameEn: 'Orange blossom hairpin', hint: '她看著髮間的小花笑了笑，提到很喜歡能別在長髮上的橘色花飾。', hintEn: 'She smiles at the flower in her hair and says she likes orange blossoms she can wear in her long hair.' },
  { id: 'old-poetry', name: '初版詩集', nameEn: 'First-edition poetry book', hint: '她談起最近想讀的書，特別提到一冊保存良好的早期詩集。', hintEn: 'She mentions a book she hopes to read: an early edition of poetry in good condition.' },
  { id: 'caramel-cookie', name: '焦糖餅乾', nameEn: 'Caramel cookies', hint: '她收好修復工具後，提到想配一份微甜的點心繼續夜讀。', hintEn: 'After putting away her tools, she says a lightly sweet snack would be nice for a late-night reading.' },
  { id: 'fountain-pen', name: '鋼筆', nameEn: 'Fountain pen', hint: '她說最近記錄修復筆記時，正想找一支寫起來順手的細尖鋼筆。', hintEn: 'She is looking for a comfortable fine-nib fountain pen for her restoration notes.' },
  { id: 'repair-kit', name: '古書修復工具', nameEn: 'Book restoration kit', hint: '她整理工作桌時提起，缺了一套能細心修補舊書頁角的小工具。', hintEn: 'She notices her workbench is missing a small kit for carefully repairing old page corners.' }
];

function randomIndex(random, length) {
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * length));
}

function makeGiftConversation(random) {
  const favorite = GIFT_CATALOG[randomIndex(random, GIFT_CATALOG.length)];
  const wrongOptions = GIFT_CATALOG.filter(item => item.id !== favorite.id);
  const options = [favorite];
  while (options.length < 3) {
    const candidate = wrongOptions.splice(randomIndex(random, wrongOptions.length), 1)[0];
    options.push(candidate);
  }
  for (let index = options.length - 1; index > 0; index--) {
    const swapIndex = randomIndex(random, index + 1);
    [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
  }
  return {
    id: `gift_${Date.now()}_${Math.floor(random() * 1e9)}`,
    hint: favorite.hint,
    hintEn: favorite.hintEn,
    correctOptionId: favorite.id,
    options: options.map(({ id, name, nameEn }) => ({ id, name, nameEn }))
  };
}

/** One roll per successfully completed dialogue. Multiple conversations use the rarer subrange. */
export function rollGiftConversations(random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  if (roll >= GIFT_SINGLE_CHANCE) return [];
  const count = roll < GIFT_MULTIPLE_CHANCE ? 2 + randomIndex(random, 2) : 1;
  return Array.from({ length: count }, () => makeGiftConversation(random));
}

export function normalizeGiftConversations(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-24).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const options = Array.isArray(item.options)
      ? item.options.filter(option => option && typeof option.id === 'string' && typeof option.name === 'string')
        .slice(0, 3).map(option => ({ id: option.id.slice(0, 40), name: option.name.slice(0, 40), nameEn: String(option.nameEn || option.name).slice(0, 60) }))
      : [];
    const correctOptionId = String(item.correctOptionId || '').slice(0, 40);
    if (options.length !== 3 || !options.some(option => option.id === correctOptionId)) return [];
    return [{
      id: String(item.id || '').slice(0, 80) || `gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      hint: String(item.hint || '').slice(0, 240),
      hintEn: String(item.hintEn || item.hint || '').slice(0, 240),
      correctOptionId,
      options
    }];
  });
}

export function resolveGiftAffection(conversation, optionId, difficulty = 'normal') {
  if (!conversation?.options?.some(option => option.id === optionId)) return null;
  const correct = optionId === conversation.correctOptionId;
  // 各難度禮物回饋：只有非常簡單免扣；簡單減半；困難／非常困難加重。
  if (correct) {
    // 非常困難送對也只 +1，其他難度 +1.5。
    return {correct, delta: difficulty === 'veryHard' ? 1 : GIFT_CORRECT_AFFECTION};
  }
  if (difficulty === 'veryEasy') return {correct, delta: 0};
  const lossScale = difficulty === 'easy' ? 0.5 : difficulty === 'hard' ? 1.5 : difficulty === 'veryHard' ? 2 : 1;
  return {correct, delta: Math.round(GIFT_WRONG_AFFECTION * lossScale * 100) / 100};
}

export function normalizeDifficulty(value) {
  return ['veryEasy', 'easy', 'normal', 'hard', 'veryHard'].includes(value) ? value : 'normal';
}
