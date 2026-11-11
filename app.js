// ==== SECTION 14｜故事回合（callAI、applyTurn、禮物、資料匯出／匯入）====
let lifeGreetingShown = false;

/** 生活層只在背景推進：換時段才抽新活動，並順便刷新每日計數。 */
function refreshLife(now = new Date()) {
  state.life = advanceLife(state.life, now);
  state.expansion = normalizeExpansionState(state.expansion, now);
  state.touchDaily = normalizeTouchDaily(state.touchDaily, touchDailyKey(state, now));
  state.safety = normalizeSafetySettings(state.safety);
  state.dailyUsage = normalizeDailyUsage(state.dailyUsage, now);
  return state.life;
}

function bootLife() {
  const now = new Date();
  refreshLife(now);
  if (lifeGreetingShown || !state.history.length) return;
  lifeGreetingShown = true;
  storyNoticeText = lifeGreeting(state.life, uiLanguage, {
    stage: relationshipStageForState(state)?.key || 'A',
    playerName: playerAddress(state, uiLanguage),
    now
  });
  if (state.safety.proactiveEnabled && canProactive(state.safety, now)) {
    state.safety = markProactive(state.safety, now);
  }
}

function resumeFromCrisis() {
  state.safety = { ...normalizeSafetySettings(state.safety), crisisMode: false, crisisAcknowledgedAt: Date.now() };
  storyNoticeText = uiText('已回到故事。任何時候都可以再停下來。');
  save();
  render();
}

/** 玩家文字若命中危機關鍵詞：暫停 AI、劇情與好感，先顯示本機求助資訊。 */
function handlePlayerCrisis(text) {
  const check = detectCrisis(text);
  if (!check.crisis) return false;
  state.safety = { ...normalizeSafetySettings(state.safety), crisisMode: true };
  state.history.push({ role: 'safety', text: crisisReply(uiLanguage) });
  state.choices = [];
  state.pendingAction = '';
  storyNoticeText = uiText('已暫停故事與好感變化。你不需要一個人撐著。');
  save();
  render();
  return true;
}

/** 驗證 incoming action：字串、字串陣列或 {tag} 物件。
 * 不在白名單，或與目前位置／活動衝突的動作直接丟棄；全部失敗時只留台詞。 */
function validateLifeAction(value, lifeState, language = 'zh') {
  const life = normalizeLifeState(lifeState);
  const max = Math.max(1, Number(GAME_CONFIG.actions.maxPerReply) || 3);
  const rawList = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const tags = [];
  const lines = [];
  let image = '';
  for (const raw of rawList) {
    const tag = String(raw && typeof raw === 'object' ? raw.tag || raw.action || '' : raw || '').trim();
    if (!tag || tags.includes(tag)) continue;
    const definition = actionDefinition(tag);
    if (!definition) continue;
    if (!definition.locations.includes(life.location)) continue;
    if (!definition.activities.includes('any') && !definition.activities.includes(life.activity)) continue;
    tags.push(tag);
    lines.push(language === 'en' ? definition.en : definition.zh);
    if (!image && definition.image) image = definition.image;
    if (tags.length >= max) break;
  }
  return { tags, lines, text: lines.join(''), image };
}

function applyLifeAction(value, actionResult, now = new Date()) {
  const life = normalizeLifeState(value, now);
  const tags = Array.isArray(actionResult?.tags) ? actionResult.tags.slice(0, GAME_CONFIG.actions.maxPerReply) : [];
  if (!tags.length) return life;
  return {
    ...life,
    lastActions: tags,
    log: life.log.slice(-LIFE_LOG_LIMIT)
  };
}

/** 故事開始前顯示一次性的首次啟動說明。 */
function showFirstRunDisclosure() {
  const safe = normalizeSafetySettings(state.safety);
  if (safe.firstRunSeen) return;
  safe.firstRunSeen = true;
  state.safety = safe;
  showDialog('firstRunDialog');
}

function beginWebTurn(action=null){
  if(busy) return;
  if(state.safety?.crisisMode){storyNoticeText=uiText('目前是安全暫停狀態。請先按「回到故事」再繼續。');render();return;}
  if(action&&handlePlayerCrisis(String(action))) return;
  if(dailyUsageExceeded(state.dailyUsage)){state.lastAiError=uiText('已達今天的回合用量上限。可在 ☰ → 設定調整上限，或明天再繼續。');render();return;}
  refreshLife(new Date());
  webAutoSendArmed=true;
  const previous={...state};
  state.aiMode='web';
  state.pendingAction=action===null?'__OPENING__':String(action).slice(0,2000);
  state.webReply=''; state.lastAiError='正在整理純文字故事提示詞…';
  if(!save()){state=previous;render();return;}
  claimWebAutoTurn();
  busy=true; render();
  try{await prepareWebPrompt(state.pendingAction);}
  catch(e){state.lastAiError=`無法複製提示詞或開啟 AI 網站：${e.message||'請確認系統瀏覽器與剪貼簿權限。'}`;}
  busy=false; save(); render();
}

async function callAI(action=null) {
  if(state.safety?.crisisMode)throw new Error(uiText('目前是安全暫停狀態。請先按「回到故事」再繼續。'));
  if(dailyUsageExceeded(state.dailyUsage))throw new Error(uiText('已達今天的回合用量上限。可在 ☰ → 設定調整上限，或明天再繼續。'));
  refreshLife(new Date());
  if(slotWantsTemporaryChat(activeSlotId))throw new Error(uiText('臨時對話故事只能透過已確認的 ChatGPT 或 Gemini 官網進行；API 模式不會被當成臨時對話。'));
}

// 故事開始前顯示首次啟動說明
showFirstRunDisclosure();

async function continueStory(action){
  if(busy || state.ending) return;
  const playerAction = String(action || '').trim();
  if(state.pendingAction && state.pendingAction!==playerAction) return;
  if(!playerAction) return;
  if(state.safety?.crisisMode){storyNoticeText=uiText('目前是安全暫停狀態。請先按「回到故事」再繼續。');render();return;}
  if(handlePlayerCrisis(playerAction)) return;
  if(state.aiMode==='web') return beginWebTurn(playerAction);
  const playerAction = String(action || '').trim();
  if(state.pendingAction && state.pendingAction!==playerAction) return;
  if(!playerAction) return;
  if(state.safety?.crisisMode){storyNoticeText=uiText('目前是安全暫停狀態。請先按「回到故事」再繼續。');render();return;}
  if(handlePlayerCrisis(playerAction)) return;
  if(state.aiMode==='web') return beginWebTurn(playerAction);
  const previous=snapshotForRollback(state);
  state.pendingAction=playerAction;
  state.lastAiError='';
  if(!save()){state=previous;render();return;}
  busy=true; render();
  try {
    const r=await callAI(playerAction);
    state.history.push({role:'user',text:playerAction});
    applyTurn(r);
    if(!state.ending)refreshGiftConversations();
    state.pendingAction=''; state.lastAiError='';
  } catch(e) {
    state=previous;
    state.pendingAction=playerAction;
    state.lastAiError=aiErrorMessage(e);
  }
  busy=false;
  if(!save()){
    state=previous;
    state.pendingAction=playerAction;
    state.lastAiError='已收到 AI 回覆，但本機存檔空間不足，故事尚未前進。請先匯出存檔或釋出空間，再重試。';
  } else {
    writeAutoSave();
  }
  render();
}

// 追加九：把快照還原到「選擇點」（重寫／刪除上一回合共用）。回傳 false＝快照無效。
function restoreTurnUndo(undo){
  const safe=normalizeLastTurnUndo(undo);
  if(!safe)return false;
  state.history=state.history.slice(0,safe.keepLen);
  state.affection=safe.affection;
  state.affectionPityStart=safe.affectionPityStart;
  state.playerName=safe.playerName;
  state.playerNickname=safe.playerNickname;
  state.confession=safe.confession;
  state.relationshipStage=safe.relationshipStage;
  state.cBand=safe.cBand;
  state.relationshipDaily=safe.relationshipDaily;
  state.miniGameDaily=safe.miniGameDaily;
  state.storyMemory=safe.memory;
  state.memoryStore=safe.memoryStore;
  state.life=safe.life;
  state.expansion=safe.expansion;
  state.touchDaily=safe.touchDaily;
  state.pendingKeyChoice=safe.pendingKeyChoice;
  state.lastTurnUndo=null;
  return true;
}

// 「↩ 重寫上一回合」：還原後用同一個行動重新生成一輪（網頁模式照常自動填入／送出）。
function rewriteLastTurn(){
  if(busy)return;
  const undo=normalizeLastTurnUndo(state.lastTurnUndo);
  if(!undo)return;
  const previous=snapshotForRollback(state);
  const action=undo.action;
  if(!restoreTurnUndo(undo))return;
  state.pendingAction='';
  state.webReply='';
  state.lastAiError='';
  storyNoticeText='';
  if(!save()){state=previous;render();return;}
  writeAutoSave();
  render();
  if(action==='__OPENING__')void opening();
  else void continueStory(action);
}

// 「🗑 刪除上一回合」：還原後停在選擇點（原本的 7 選項復原，可改選）。
function deleteLastTurn(){
  if(busy)return;
  const undo=normalizeLastTurnUndo(state.lastTurnUndo);
  if(!undo)return;
  if(!confirm(uiText('刪除上一回合？故事將回到上一個選擇點；之後可以重新選擇。')))return;
  const previous=snapshotForRollback(state);
  if(!restoreTurnUndo(undo))return;
  state.pendingAction='';
  state.webReply='';
  state.lastAiError='';
  storyNoticeText='';
  if(!save()){state=previous;render();return;}
  writeAutoSave();
  render();
  scrollDialogueIntoView();
}

// ... [其餘 app.js 內容保持不變] ...