// API 模式的 token 預算旋鈕：每回合「送出多少」與「要求回傳多少」集中在這一份，要調整只改這裡
// （創意工坊的程式碼編輯器可直接編輯）。數字單位是「字元數」，不是 token；中文約 1 字 ≈ 1～1.5 token，依模型而異。
//
// 每回合的花費 ≈ 固定 system（可被快取）＋ 記憶 ＋ 最近對話 ＋ 玩家行動（輸入）
//              ＋ 旁白 ＋ 7 個選項 ＋ 完整改寫後的記憶（輸出，單價通常比輸入高數倍）。
// 記憶每回合「讀一次、又重寫一次」，所以 memoryChars 同時影響輸入與輸出。

export const TOKEN_BUDGET = {
  // historyEntries：帶入最近幾則對話（玩家行動與旁白各算一則）
  // aiChars：最新一則旁白保留「結尾」多少字（場景銜接最需要結尾）
  // olderAiChars：更早的旁白只留結尾多少字（劇情已濃縮在記憶裡）
  // userChars：上一回合玩家行動最多保留多少字（取開頭）
  // memoryChars：記憶上限；同時寫進提示詞，要求模型照這個上限重寫
  fast:    {historyEntries: 2, aiChars: 600, olderAiChars: 300, userChars: 300, memoryChars: 600},
  quality: {historyEntries: 4, aiChars: 900, olderAiChars: 350, userChars: 400, memoryChars: 1000}
};

// 英文一個字元的資訊量遠低於中文，同樣字元數會少掉很多內容，所以英文版預算放大 2 倍。
const ENGLISH_SCALE = 2;

// ── 輸出端：每回合要模型「寫多少」──────────────────────────────
// 這裡是省 token 最大的槓桿。輸出單價通常是輸入的數倍，而舊提示詞寫的是
// 「至少500字，可以更長」——模型為了保險常寫到 800～1200 字，多出來的尾段全是錢。
//   narrationMin/Max：寫進提示詞的明確區間（要模型照這個寫）
//   narrationHard   ：警戒線，只寫進提示詞（「最多不要超過」）
//   驗證器（server.js 的 parse）只強制 min，不因超過 max 而拒絕：
//   一旦拒絕，整個回合要重打一次，反而花兩倍，得不償失。
export const OUTPUT_TARGET = {
  narrationMin: 500,
  narrationMax: 700,
  narrationHard: 800,
  choiceMin: 15,
  choiceMax: 40,
  choiceHard: 60,
  // max_tokens 必須大於「最低需求」，否則 JSON 會被截斷→整回合失敗→手動重打＝雙倍花費。
  // 上限本身不計費（只計實際輸出），所以留足餘裕比把數字壓小更有價值。
  //   最低需求（含記憶改寫）≈ 旁白500 + 選項7×15 + 記憶(600/1000) + JSON骨架
  //     快速 ≈ 1,800 tokens／詳細 ≈ 2,400 tokens
  //   典型最大輸出（旁白700 + 選項7×40 + 記憶上限 + JSON）≈ 2,400／3,000 tokens
  // 取 3000／3600：連「模型寫到硬上限」都還有空間，不需要使用者重打整個回合。
  maxTokens: {fast: 3000, quality: 3600}
};

export function outputTargetLines(language = 'zh') {
  const t = OUTPUT_TARGET;
  return language === 'en'
    ? {
        length: `Narration ${t.narrationMin}-${t.narrationMax} characters per turn (never above ${t.narrationHard}); be concise rather than padding for length.`,
        choices: `Each choice ${t.choiceMin}-${t.choiceMax} words, never above ${t.choiceHard}.`,
        memory: 'Rewrite memory as short bullet lines, one fact per line, without decorative wording.'
      }
    : {
        length: `narration 每回合 ${t.narrationMin}～${t.narrationMax} 字（含標點，不計JSON、選項與記憶），最多不要超過 ${t.narrationHard} 字；寧可精煉，不要為了湊長度拖戲。`,
        choices: `每個選項 ${t.choiceMin}～${t.choiceMax} 字，不要超過 ${t.choiceHard} 字。`,
        memory: 'memory 以條列式精簡改寫，每項一句，省略修飾詞。'
      };
}

// ── 網頁自動化的「節省模式」──────────────────────────────────
// 免費網站常有輸入長度上限，提示詞太長容易被截斷或直接失敗；節省模式把
// 「帶入的上下文」與「固定規則文字」縮到最小，輸出契約（旁白長度、7 個選項、
// JSON 欄位）完全不變——所以存檔格式、驗證器與模型輸出都不用跟著改。
// 想自己調：改這裡的數字，工坊的程式碼編輯器可直接編輯本檔。
export const WEB_PROMPT_TARGET = {
  // 標準模式＝原本的長度；節省模式約可少一半輸入（實測見 v4.4.0-優化紀錄.txt）。
  standard: {
    historyEntries: {fast: 2, quality: 4},
    transcriptChars: {fast: 900, quality: 1500},
    geminiTranscriptChars: 700,
    memoryChars: {fast: 500, quality: 700}
  },
  saving: {
    historyEntries: {fast: 1, quality: 2},
    transcriptChars: {fast: 420, quality: 700},
    geminiTranscriptChars: 360,
    memoryChars: {fast: 240, quality: 340}
  }
};

export function webPromptBudget(mode, saving = false) {
  const table = saving ? WEB_PROMPT_TARGET.saving : WEB_PROMPT_TARGET.standard;
  const key = mode === 'quality' ? 'quality' : 'fast';
  return {
    historyEntries: table.historyEntries[key],
    transcriptChars: table.transcriptChars[key],
    geminiTranscriptChars: table.geminiTranscriptChars,
    memoryChars: table.memoryChars[key]
  };
}

// Anthropic：把固定的 system 前綴標成可快取（命中時該段輸入以低價計）。
// 低於該模型的最小可快取長度時會被自動忽略，不會報錯。
export const ANTHROPIC_CACHE_SYSTEM = true;

// OpenAI GPT-5.6／6 的推理強度。推理 token 以輸出價計費，而且會吃掉 max_output_tokens；
// 寫小說不需要很高的強度，'high' 容易讓 JSON 在推理後被截斷、整回合重打。
export const OPENAI_REASONING_EFFORT = {fast: 'low', quality: 'medium'};

export function budgetFor(mode, language = 'zh') {
  const base = TOKEN_BUDGET[mode === 'fast' ? 'fast' : 'quality'];
  if (language !== 'en') return base;
  const scaled = {...base};
  for (const key of ['aiChars', 'olderAiChars', 'userChars', 'memoryChars']) scaled[key] = base[key] * ENGLISH_SCALE;
  return scaled;
}

export function clipTail(text, limit) {
  const value = String(text ?? '').trim();
  return value.length <= limit ? value : '…' + value.slice(-limit).trim();
}

export function clipHead(text, limit) {
  const value = String(text ?? '').trim();
  return value.length <= limit ? value : value.slice(0, limit).trim() + '…';
}
