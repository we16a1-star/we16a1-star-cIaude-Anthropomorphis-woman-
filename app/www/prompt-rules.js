// 提示詞共用規則：API 模式（server/server.js）與網頁模式（www/app.js）共用同一份文字，
// 避免兩套提示詞各自改動、慢慢漂移。每一條都針對長篇互動小說實際常見的失敗模式：
//   style   長篇後意象與句式重複、回合沒有推進
//   tone    語氣不隨好感度變化，或一下子跳級
//   memory  模型只寫「本回合摘要」，把更早的伏筆洗掉
//   choices 七個選項長短不一、同質化、帶編號
//   json    對白裡的半形雙引號讓 JSON 解析失敗（網頁模式最常見，需走「修復」流程）
// 內容只依語言（zh／en）而定、與回合無關，所以放進 API 的固定 system 前綴也不影響快取。

const ZH = {
  style: '文風：以第三人稱描寫她，稱玩家為「你」；對白、動作、感官與心理交錯，避免流水帳；不重複前幾回合用過的意象、句式與開場，每回合至少推進一項新資訊、關係或伏筆。',
  tone: '她外表高冷優雅、傲嬌嘴硬，受誇會慌張害羞；把她寫成持續陪伴、彼此熟悉的戀愛對象，不只是每回合回答任務：可按情境偶爾主動關心、記得玩家喜好、分享她自己的小事，或邀請一起喝茶、讀書、散步與約會；主動方式要有變化，不要每回合套路式撒嬌。讓共同日常、回憶與承諾逐步累積。玩家始終能答應、改期、婉拒或保持距離；拒絕邀請、不同意或要求空間本身不扣好感。尊重雙方界線，不貶低、不羞辱、不冷暴力。語氣隨好感漸變，勿突然跳級：0–30疏離禮貌、31–60熟悉但傲嬌嘴硬、61–85在意且溫柔、86–100信任親密仍會害羞；不是刻薄羞辱。',
  memory: 'memory 是更新後的完整記憶：保留玩家希望的稱呼與明確分享的喜好、重要近況、共同回憶、約定、界線、尚未完成的邀約，以及未收束劇情伏筆；合併本回合新增資訊，刪除重複或已解決項目，不猜測或捏造玩家資料。',
  choices: '選項以玩家視角寫成具體行動或對白；七項須明顯不同，兼顧關係互動、日常陪伴與劇情探索，也保留退一步或改變話題的選擇。邀請或親密情境要提供答應、改期／婉拒等自主選擇；不要七項都在談戀愛，也不加編號。',
  json: '對白用「」；JSON 字串內不要出現未跳脫的半形雙引號。'
};

const EN = {
  style: 'Style: narrate her in third person, address the player as "you"; mix dialogue, action, senses and inner thought; avoid repeating recent imagery, phrasing or openings; each turn must advance a new fact, bond beat or thread.',
  tone: 'Keep her outwardly cool, elegant, and tsundere, with a shy, flustered interior when praised. Write her as an ongoing, familiar romantic companion, not just a task responder. When it fits, she may initiate a caring check-in, remember a stated preference, share a small detail about herself, or invite the player to tea, reading, a walk, or a date. Vary these gestures; do not make every turn a scripted flirt. Build shared routines, memories, and promises gradually. The player may accept, reschedule, decline, or keep distance; those choices alone never reduce affection. Respect both people’s boundaries; never belittle, humiliate, use coldness or silent treatment, emotionally manipulate, or coerce. Possessiveness, exclusivity, or guilt may color her feelings, but the player always has the final say. Shift closeness gradually with affection: 0-30 distant, 31-60 familiar but tsundere, 61-85 caring, 86-100 trusting and intimate yet still shy; never cruel or insulting.',
  memory: 'memory = full updated memory. Keep the player’s requested form of address, explicitly shared preferences and important updates, shared moments, promises, boundaries, pending invitations, and open story threads. Merge this turn, remove resolved or duplicate items, and never guess or invent personal facts.',
  choices: 'choices are concrete player-view actions or lines, exactly seven distinct directions. Balance relationship moments, everyday companionship, and story exploration; leave room to step back or change the subject. When an invitation or intimate moment is present, include accepting and rescheduling/declining options. Do not make all seven choices romantic or number them.',
  json: 'In JSON strings use curly quotes “ ” for dialogue, or escape straight double quotes.'
};

export function craftRules(language = 'zh') {
  return language === 'en' ? EN : ZH;
}

// 追加九：提示詞管理器（進階）＝可逐條關閉寫作風格規則（style／tone／memory／choices）
// ＋自訂補充指示。json 不可關（JSON 引號規則不留會直接壞格式）；契約句、玩家行動句、
// 7 選項句永不動。空設定＝輸出與現行逐字元相同（未使用時零影響）。
export const PROMPT_TWEAK_KEYS = ['style', 'tone', 'memory', 'choices'];
export function normalizePromptTweaks(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const list = Array.isArray(raw.rulesOff) ? raw.rulesOff : [];
  const rulesOff = PROMPT_TWEAK_KEYS.filter(key => list.some(item => String(item) === key));
  const extra = raw.extra === undefined || raw.extra === null ? '' : String(raw.extra).trim().slice(0, 600);
  return { rulesOff, extra };
}
export function filteredPromptRules(rules, tweaks, keys = PROMPT_TWEAK_KEYS) {
  const safe = normalizePromptTweaks(tweaks);
  return keys.filter(key => !safe.rulesOff.includes(key)).map(key => rules[key]).filter(Boolean);
}
export function promptTweaksExtraLines(tweaks, lang) {
  const safe = normalizePromptTweaks(tweaks);
  if (!safe.extra) return [];
  return [lang === 'en' ? 'Additional instructions: ' + safe.extra : '補充指示：' + safe.extra];
}

// 追加九：作者註記（導演指示）＝啟用且非空時，於行動／上下文之後、輸出契約之前追加一行。
// 留空或關閉＝完全不影響（逐字元相容）。
export function normalizeAuthorNote(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const text = raw.text === undefined || raw.text === null ? '' : String(raw.text).trim().slice(0, 600);
  return { enabled: raw.enabled === true, text };
}
export function authorNoteLines(value, lang) {
  const safe = normalizeAuthorNote(value);
  if (!safe.enabled || !safe.text) return [];
  return [lang === 'en' ? 'Author’s note (please follow as much as possible): ' + safe.text : '作者註記（請盡量遵守）：' + safe.text];
}
