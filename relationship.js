// v5.0｜關係狀態（A/B/C階段）與 C 好感帶 — 唯一來源：config/stages.json
import { normalizeStoryClock } from './story-clock.js';
import { GAME_CONFIG } from './config-loader.js';

export const RELATIONSHIP_STAGE_KEYS = ['A', 'B', 'C'];
export const RELATIONSHIP_STAGES = GAME_CONFIG.stages.stages;
export const RELATIONSHIP_THRESHOLDS = GAME_CONFIG.stages.thresholds;
export const C_AFFECTION_BANDS = GAME_CONFIG.stages.bands;

// 玩家稱呼支援
export function normalizePlayerNickname(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
}

export function playerAddress(state = {}, language = 'zh') {
  const name = playerNameOrFallback(state.playerName, language);
  return normalizePlayerNickname(state.playerNickname) || name;
}

// stageBlock 現在接受 nickname 參數
function stageBlock(stage, name, language, nickname = name) {
  const english = language === 'en';
  // 從 config 讀取階段文案，只替換名字與暱稱
  const configured = (GAME_CONFIG.stages.stagePrompt?.[stage.key]?.[english ? 'en' : 'zh'] || [])
    .map(line => String(line).replaceAll('{name}', name).replaceAll('{nickname}', nickname));
  const header = english
    ? stage.key === 'A' ? '【Relationship stage: A · Guarded (decided by the system; never change it yourself)】'
      : stage.key === 'B' ? '【Relationship stage: B · Ambiguous (decided by the system; never change it yourself)】'
      : '【Relationship stage: C · Together (decided by the system; this stage never downgrades)】'
    : stage.key === 'A' ? '【關係階段：A 嘴硬期｜由程式判定，不可自行改階段】'
      : stage.key === 'B' ? '【關係階段：B 曖昧期｜由程式判定，不可自行改階段】'
      : '【關係階段：C 告白後｜由程式判定，永不降階】';
  return [header, ...configured.map(line => `- ${line}`)].join('\n');
}

function bandBlock(band, language) {
  const english = language === 'en';
  const index = { sweet: 0, steady: 1, sulky: 2, reconcile: 3 }[band.key] ?? 3;
  const line = GAME_CONFIG.stages.bandPrompt?.[english ? 'en' : 'zh']?.[index] || '';
  return [
    english ? `【C affection band: ${band.en} (decided by the system; never change it yourself)】`
      : `【C 好感帶：${band.zh}｜由程式判定，你不能自行改好感帶】`,
    `- ${line}`,
    english ? '- No band permits humiliation or guilt; if the player is genuinely hurt or in crisis, drop the act.'
      : '- 任何好感帶都不貶低、不勒索愧疚；對方出現真實痛苦或危機時，放下傲嬌。'
  ].join('\n');
}

function compactRelationshipLines(stage, band, name, language, nickname = name) {
  if (language === 'en') {
    const stageLine = stage.key === 'A'
      ? `【Relationship A · Guarded; system-decided, do not change】Affection 0–49, no confession yet. Deny first, then let the crack show; about 70% stubborn lines. Call the player "${name}".`
      : stage.key === 'B'
        ? `【Relationship B · Ambiguous; system-decided, do not change】Affection 50–100, no confession yet. She denies it, but the sentence betrays her; about 50% stubborn lines. Call the player "${name}".`
        : `【Relationship C · Together; never downgrades】You are together. Act first, then get stubborn; about 30% stubborn lines. Call the player "${nickname}".`;
    const bandLine = band
      ? `【C affection band: ${band.en}】${band.key === 'sweet' ? 'Soften the ending.' : band.key === 'steady' ? 'Everyday tone, about 40% stubborn lines.' : band.key === 'sulky' ? 'Short lines, fewer words; no outbursts or silent treatment; show care instead of blame.' : 'Say what is bothering her; accept a sincere apology, stay stubborn for one beat, then soften.'}`
      : '';
    return [stageLine, ...(bandLine ? [bandLine] : []),
      'Affection, stage, and band are saved by the system. Describe reactions only; never announce numbers, promotions, demotions, or change them. affectionDelta is an integer -3 to +3. No cold violence, humiliation, or guilt-based retention.'].join('\n');
  }
  const stageLine = stage.key === 'A'
    ? `【關係 A 嘴硬期｜程式判定，不可自行改】好感 0–49，尚未告白；先否認後破綻，嘴硬約七成；稱呼玩家「${name}」。`
    : stage.key === 'B'
      ? `【關係 B 曖昧期｜程式判定，不可自行改】好感 50–100，尚未告白；嘴上否認但句子露出破綻，嘴硬約五成；稱呼玩家「${name}」。`
      : `【關係 C 告白後｜永不降階】已交往；先行動後嘴硬，嘴硬約三成；稱呼玩家「${nickname}」。`;
  const bandLine = band
    ? `【C 好感帶：${band.zh}】${band.key === 'sweet' ? '句尾放軟。' : band.key === 'steady' ? '日常語氣，嘴硬約四成。' : band.key === 'sulky' ? '短句、少話，不說氣話、不冷戰；用在意代替責備。' : '主動說出在意什麼；真誠道歉就接受，嘴硬一秒再軟下來。'}`
    : '';
  return [stageLine, ...(bandLine ? [bandLine] : []),
    '好感、階段與好感帶由程式保存；只描寫反應，不宣告數值或升降階。affectionDelta 為 -3～+3 整數；不冷暴力、不羞辱、不用愧疚留人。'].join('\n');
}

// 共用提示詞：網頁模式與 API 模式都使用同一份文字，避免兩邊規則漂移。
export function relationshipPromptLines(state = {}, language = 'zh', options = {}) {
  const stage = relationshipStageForState(state);
  const band = stage?.key === 'C' ? cBandForState(state) : null;
  const name = playerNameOrFallback(state.playerName, language);
  const nickname = normalizePlayerNickname(state.playerNickname) || name;
  if (options.compact) return compactRelationshipLines(stage, band, name, language, nickname);
  const lines = [
    stageBlock(stage, name, language, nickname),
    ...(band ? [bandBlock(band, language)] : []),
    language === 'en'
      ? [
        '【Relationship rules】',
        '- Affection, stage, and band are saved by the system. Describe reactions only; never announce numbers, promotions, demotions, or change the stage/band yourself.',
        '- affectionDelta must be an integer from -3 to +3. The system applies its own daily gain cap, deduction rules, and reconciliation recovery.',
        `- In the "Needs reconciliation" band, accept a sincere apology: stay stubborn for one beat, then soften. No silent treatment, humiliation, or guilt-based retention.`,
        '- memory is the complete updated memory: keep the player’s preferred name, stated preferences, important recent events, shared memories, promises, boundaries, unfinished invitations, and unresolved threads. Do not invent player data.',
        '- One-shot story flags are proposals only: heart_kept_words, heart_secret, and heart_focus_gaze are B-stage moments; vow is the confession milestone (affection >= 75) and locks stage C. The game validates them.'
      ].join('\n')
      : [
        '【關係與好感規則】',
        '- 好感、階段與好感帶由程式保存；你只能描寫反應，不能宣告數值、升階、降階，也不能自行改階段或好感帶。',
        '- affectionDelta 必須是 -3～+3 的整數；每日加分上限、扣分規則與和好回補由程式套用。',
        '- 待和好時，玩家真誠道歉就接受：嘴硬一秒後軟下來；不冷戰、不羞辱、不用愧疚留人。',
        '- memory 是更新後的完整記憶：保留玩家希望的稱呼、明確分享的喜好、重要近況、共同回憶、約定、界線、尚未完成的邀約與未收束伏筆；不猜測或捏造玩家資料。',
        '- 一次性劇情旗標只是提議：heart_kept_words、heart_secret、heart_focus_gaze 是 B 階段的心動瞬間；vow 是告白里程碑（好感至少 75），成立後鎖定 C。遊戲端會驗證。'
      ].join('\n')
  ];
  return lines;
}