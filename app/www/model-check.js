// 模型通用性檢測（純函式）：把模型回覆轉成可顯示的逐項檢查。
// 伺服器用它檢查解析後的物件；畫面只負責把 checks 畫成 ✓／✗。
// connected=false 代表請求根本沒成功（金鑰、額度、網路……），其餘契約檢查一律視為未通過。
export function evaluateModelCheck(story, { provider = '', model = '', latencyMs = 0, connected = true, error = '', parseError = '' } = {}) {
  const checks = [];
  const add = (key, labelZh, labelEn, ok, detailZh = '', detailEn = '') => checks.push({ key, labelZh, labelEn, ok: Boolean(ok), detail: detailEn, detailZh, detailEn });
  const safeStory = connected && story && typeof story === 'object' && !Array.isArray(story) ? story : null;
  const choices = Array.isArray(safeStory?.choices) ? safeStory.choices : [];
  const distinct = new Set(choices.map(item => String(item || '').trim().toLowerCase()).filter(Boolean));
  const narrationOk = typeof safeStory?.narration === 'string' && Boolean(safeStory.narration.trim());
  add('connection', 'API 連線成功', 'API connection OK', connected,
    connected ? '' : (error || 'AI 服務沒有回應。'),
    connected ? '' : (error || 'No response from the AI service.'));
  add('json', '回傳可解析 JSON', 'Returned parseable JSON', Boolean(safeStory),
    safeStory ? '' : (parseError || '回覆不是單一有效的 JSON 物件。'),
    safeStory ? '' : (parseError || 'The reply was not a single valid JSON object.'));
  add('narration', '旁白非空', 'Narration is not empty', narrationOk,
    narrationOk ? '' : 'narration 必須是非空字串。',
    narrationOk ? '' : 'narration must be a non-empty string.');
  add('choices', '恰好 7 個不同選項', 'Exactly 7 distinct choices', choices.length === 7 && distinct.size === 7,
    choices.length !== 7 ? `收到 ${choices.length} 個；必須恰好 7 個。` : (distinct.size === 7 ? '' : '有空白或重複的選項。'),
    choices.length !== 7 ? `Found ${choices.length}; expected exactly 7.` : (distinct.size === 7 ? '' : 'Some choices are empty or duplicated.'));
  const affectionOk = Number.isFinite(Number(safeStory?.affectionDelta));
  const emotionOk = ['neutral', 'happy', 'proud', 'shy', 'surprised', 'dizzy', 'curious', 'focused'].includes(String(safeStory?.emotion || '').toLowerCase());
  add('affection', '好感度格式正確', 'Affection format is valid', affectionOk,
    affectionOk ? '' : 'affectionDelta 必須是數字。',
    affectionOk ? '' : 'affectionDelta must be a number.');
  add('emotion', '表情欄位正確', 'Emotion field is valid', emotionOk,
      emotionOk ? '' : 'emotion 必須是 neutral、happy、proud、shy、surprised、dizzy、curious、focused 其中一個。',
      emotionOk ? '' : 'emotion must be neutral, happy, proud, shy, surprised, dizzy, curious, or focused.');
  const intensity = Number(safeStory?.intensity);
  const intensityOk = Number.isInteger(intensity) && intensity >= 1 && intensity <= 3;
  add('intensity', '情緒強度為 1～3', 'Emotion intensity is 1-3', intensityOk,
    intensityOk ? '' : 'intensity 必須是 1～3 的整數。',
    intensityOk ? '' : 'intensity must be an integer from 1 to 3.');
  const memoryOk = typeof safeStory?.memory === 'string';
  add('memory', '記憶欄位正確', 'Memory field is valid', memoryOk,
    memoryOk ? '' : 'memory 必須是字串。',
    memoryOk ? '' : 'memory must be a string.');
  return { ok: checks.every(check => check.ok), provider, model, latencyMs, checks };
}
