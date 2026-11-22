/**
 * vn-controls.js — 對話框內嵌微控制膠囊（自動播放／跳過本段／打字音效快捷鍵）
 *
 * Ported / adapted from AnimaVN (MIT License, Copyright (c) 2026 JayziLi)
 * Source: frontend/src/debug/vn/skipChip.ts
 *
 * 設計約束（不破壞 9.7／9.9 安全區）：
 *   - 掛載於 `.vn-dialogue-window` 內部右上緣，絕不超出左側 520px 欄寬，絕不遮擋人物。
 *   - 「跳過」按鈕僅於逐句打字進行中（isPlaying）出現；平常僅顯示低干擾「自動」與「音效」微型鈕。
 */

/** 移植自 AnimaVN skipChip.ts：快進提示文字（繁體中文） */
export function skipChipLabel(ctrlHeld = false, lang = 'zh') {
  if (lang === 'en') {
    return ctrlHeld ? 'Skipping · Release Ctrl' : 'Skip Line';
  }
  return ctrlHeld ? '快進中 · 放開 Ctrl 停' : '跳過本段';
}

/**
 * 計算微控制列的三個按鈕顯示狀態（純函式，便於單元測試）。
 */
export function computeVnControlState({
  isPlaying = false,
  autoAdvance = true,
  typeSoundId = 'off',
  ctrlHeld = false,
  lang = 'zh'
} = {}) {
  const soundOn = Boolean(typeSoundId && typeSoundId !== 'off');
  return {
    showSkip: Boolean(isPlaying || ctrlHeld),
    skipLabel: skipChipLabel(Boolean(ctrlHeld), lang),
    autoActive: Boolean(autoAdvance),
    autoLabel: lang === 'en' ? (autoAdvance ? 'Auto ON' : 'Auto') : (autoAdvance ? '自動開' : '自動'),
    soundActive: soundOn,
    soundLabel: lang === 'en' ? (soundOn ? 'SFX ON' : 'SFX') : (soundOn ? '打字音' : '靜音')
  };
}
