// 存檔快照（回滾用）：複製 state 的深層可變欄位，讓「存檔失敗就還原」不會污染原資料。
// 純函式、不碰 DOM，可單獨測試；新增 state 陣列／物件欄位時，考慮是否也納入複製。
export function snapshotForRollback(state) {
  return {
    ...state,
    history: Array.isArray(state.history) ? state.history.map(entry => ({...entry})) : [],
    promptHistory: Array.isArray(state.promptHistory) ? state.promptHistory.map(entry => ({...entry})) : [],
    choices: Array.isArray(state.choices) ? state.choices.slice() : [],
    giftConversations: Array.isArray(state.giftConversations) ? state.giftConversations.map(item => ({...item, options:Array.isArray(item.options)?item.options.map(option=>({...option})):[]})) : []
  };
}
