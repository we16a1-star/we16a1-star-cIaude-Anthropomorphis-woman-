// ─────────────────────────────────────────────────────────────────────────────
// 中端（橋接層）：畫面（app\www）與主程序（electron-main.cjs）之間唯一的通道。
// 這裡只把「主程序允許的操作」用最小權限暴露成 window.claudeDesktop.*；
// 不要暴露 ipcRenderer 本體，也不要加萬用 invoke(channel, ...)。
// 每個方法都對應 electron-main.cjs 裡同名頻道的 ipcMain.handle；新增功能時兩邊都要加，
// 權限檢查留在主程序。分組：
//   帳號金鑰庫  vaultAvailable／listCredentials／saveCredential／removeCredential／testAiConnection（ai-vault:*）
//   官網網頁    openAiWebsite／listWebAiModels／selectWebAiModel／fillWebAiPrompt／copyWebPrompt／
//               readPendingClipboard／readManualClipboard／setWebCompanionLayout／
//               restoreWebCompanionLayout／setWebAutoFlow／webAutoHealth／onWebAutoReply／
//               onWebAutoStatus（ai-web:*）
//   創意工坊    readWorkshopSource／listWorkshopSources／workshopSourceInfo／exportWorkshopCode／
//               applyWorkshopCode／rebuildFromWorkshop（workshop-code:*）
//   場景插圖    startSceneIllustration／readLatestDownloadedImage／onSceneImageDownloaded（scene-image:*）
// ─────────────────────────────────────────────────────────────────────────────
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('claudeDesktop', {
  isDesktop: true,
  vaultAvailable: () => ipcRenderer.invoke('ai-vault:available'),
  listCredentials: () => ipcRenderer.invoke('ai-vault:list'),
  saveCredential: value => ipcRenderer.invoke('ai-vault:save', value),
  removeCredential: value => ipcRenderer.invoke('ai-vault:remove', value),
  testAiConnection: payload => ipcRenderer.invoke('ai-vault:test', payload),
  openAiWebsite: (provider, mode) => ipcRenderer.invoke('ai-web:open', provider, mode),
  getWebLoginCredential: provider => ipcRenderer.invoke('ai-web:login-credential:get', provider),
  saveWebLoginCredential: payload => ipcRenderer.invoke('ai-web:login-credential:save', payload),
  clearWebLoginCredential: provider => ipcRenderer.invoke('ai-web:login-credential:clear', provider),
  listWebAiModels: options => ipcRenderer.invoke('ai-web:model-list', options),
  selectWebAiModel: (modelName, options) => ipcRenderer.invoke('ai-web:model-select', modelName, options),
  fillWebAiPrompt: prompt => ipcRenderer.invoke('ai-web:fill-prompt', prompt),
  copyWebPrompt: prompt => ipcRenderer.invoke('ai-web:copy-prompt', prompt),
  readPendingClipboard: () => ipcRenderer.invoke('ai-web:read-pending-clipboard'),
  readManualClipboard: () => ipcRenderer.invoke('ai-web:read-manual-clipboard'),
  setWebCompanionLayout: () => ipcRenderer.invoke('ai-web:side-by-side'),
  restoreWebCompanionLayout: () => ipcRenderer.invoke('ai-web:restore-window'),
  ensureTemporaryChat: payload => ipcRenderer.invoke('ai-web:temporary-chat', payload),
  setWebAutoFlow: payload => ipcRenderer.invoke('ai-web:auto-flow', payload),
  webAutoHealth: payload => ipcRenderer.invoke('ai-web:auto-health', payload),
  reconnectAutomationBrowser: payload => ipcRenderer.invoke('ai-web:automation-reconnect', payload),
  restartAutomationBrowser: payload => ipcRenderer.invoke('ai-web:automation-restart', payload),
  setDesktopHelper: enabled => ipcRenderer.invoke('ai-web:desktop-helper', enabled),
  focusAutomationBrowser: payload => ipcRenderer.invoke('ai-web:focus-browser', payload),
  setAskGoogleAccount: value => ipcRenderer.invoke('ai-web:set-ask-account', value),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  onWindowFullscreen: callback => {
    const handler = (event, fullscreen) => callback(!!fullscreen);
    ipcRenderer.on('window:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
  },
  onWebAutoReply: callback => {
    const handler = (event, text) => callback(String(text || ''));
    ipcRenderer.on('ai-web:auto-reply', handler);
    return () => ipcRenderer.removeListener('ai-web:auto-reply', handler);
  },
  onWebAutoStatus: callback => {
    const handler = (event, payload) => callback(payload && typeof payload === 'object' ? payload : {});
    ipcRenderer.on('ai-web:auto-status', handler);
    return () => ipcRenderer.removeListener('ai-web:auto-status', handler);
  },
  onGoogleSignInHandoff: callback => {
    const handler = (event, payload) => callback(payload && typeof payload === 'object' ? payload : {});
    ipcRenderer.on('ai-web:google-sign-in-handoff', handler);
    return () => ipcRenderer.removeListener('ai-web:google-sign-in-handoff', handler);
  },
  readWorkshopSource: sourcePath => ipcRenderer.invoke('workshop-code:read', sourcePath),
  listWorkshopSources: () => ipcRenderer.invoke('workshop-code:list'),
  workshopSourceInfo: () => ipcRenderer.invoke('workshop-code:info'),
  exportWorkshopCode: files => ipcRenderer.invoke('workshop-code:export', files),
  applyWorkshopCode: files => ipcRenderer.invoke('workshop-code:apply', files),
  rebuildFromWorkshop: () => ipcRenderer.invoke('workshop-code:rebuild'),
  startSceneIllustration: (prompt, mode, provider) => ipcRenderer.invoke('scene-image:start', prompt, mode, provider),
  readLatestDownloadedImage: () => ipcRenderer.invoke('scene-image:latest-download'),
  onSceneImageDownloaded: callback => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('scene-image:downloaded', handler);
    return () => ipcRenderer.removeListener('scene-image:downloaded', handler);
  }
});
