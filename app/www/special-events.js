// 約會型特殊事件（純函式）：每回合成功後抽一次，8% 機率在下一回合安排特殊橋段。
// 三種來源都保留：
//   date      = 隨機約會事件（喝茶、散步、逛書店、短程外出……）
//   free      = 由 AI 自行安排不同於日常的特別橋段
//   milestone = 關係里程碑（好感跨階段時，由既有 pendingMilestone 提示觸發）
export const SPECIAL_EVENT_CHANCE = 0.08;
export const SPECIAL_EVENT_KEYS = ['date', 'free', 'milestone'];

export function normalizeSpecialEventKey(value) {
  return SPECIAL_EVENT_KEYS.includes(value) ? value : '';
}

function clampRoll(value) {
  return Math.max(0, Math.min(0.999999999, Number(value) || 0));
}

/** One roll per successfully completed turn. Returns '' when no event. */
export function rollSpecialEvent(random = Math.random) {
  if (clampRoll(random()) >= SPECIAL_EVENT_CHANCE) return '';
  // 70% 明確的約會／出遊，30% 交給 AI 自行安排；兩者都是「像約會那種」的特殊事件。
  return clampRoll(random()) < 0.7 ? 'date' : 'free';
}

/** Prompt lines shared by the API server and the web-mode prompt builder. */
export function specialEventPromptLines(key, language = 'zh') {
  const event = normalizeSpecialEventKey(key);
  if (!event) return [];
  if (language === 'en') {
    if (event === 'date') return [
      'Special event (date-style, flexible): naturally arrange a date or outing that fits the current relationship stage (for example tea together, browsing a bookshop, a walk after rain, or a short trip). Do not force a confession or a major decision; the seven choices should include accepting, rescheduling, and declining. Declining, rescheduling, or setting a boundary alone must not reduce affection. If the scene does not suit it, use a rare private moment instead. Do not tell the player this was system-arranged.'
    ];
    if (event === 'free') return [
      'Special event (your call): arrange a scene different from the usual routine; the form is yours to decide (a date, a small unexpected incident, or doing something together all count). Keep it naturally connected to the main story. Do not tell the player this was system-arranged.'
    ];
    return [
      'Special event (relationship milestone): the bond has just crossed a stage. If it fits, present this milestone as a date, an outing, or a rare private moment; the form and scale are yours to decide. If the current scene does not suit it, continue as usual. Do not tell the player this was system-arranged.'
    ];
  }
  if (event === 'date') return [
    '特殊事件（約會型，彈性安排）：本回合請自然安排一段與目前關係階段相稱的約會或出遊（例如一起喝茶、逛書店、雨後散步、短程外出）。不要強迫玩家告白或做重大決定；七個選項要有接受、改期、婉拒等不同走向。婉拒、改期或表達界線本身不扣好感。若目前場景不適合，改成兩人獨處的難得時光；不要向玩家說明這是系統安排。'
  ];
  if (event === 'free') return [
    '特殊事件（由你安排）：本回合請安排一段不同於日常的特別橋段，形式由你決定（約會、突發小插曲、共同完成一件事皆可），並與主線自然相關；不要向玩家說明這是系統安排。'
  ];
  return [
    '特殊事件（關係里程碑）：兩人的關係剛跨過一個階段。若劇情合適，請以約會、共同外出或一段難得的獨處時光呈現這個里程碑；形式與規模由你決定。若目前場景不適合，照常推進即可；不要向玩家說明這是系統安排。'
  ];
}
