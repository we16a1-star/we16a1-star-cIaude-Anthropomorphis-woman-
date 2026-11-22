/**
 * bgm-immersion-ui.js — 沉浸式圖書館音樂帶入系統與快捷選曲音樂盒 UI
 *
 * 以「讓用戶一進入遊戲即自然帶入情境」為核心設計：
 * 1. 首次使用者互動（點擊開始故事、對話框、選項或按鍵）時自動解鎖 Web Audio，
 *    依當下畫面狀態柔和淡入《書頁之間（主題曲）》或當前時段書庫配樂，並同步啟動場景環境音。
 * 2. 故事畫面下方提供低調優雅的「🎵 正在播放」微膠囊（不遮擋人物與選項）：
 *    點擊即可開啟「圖書館沉浸音樂盒」，自由切換 9 首原創配樂、開啟「跟隨劇情／情緒自動切歌」、
 *    或直接匯入使用者自己的本地音檔（MP3 / M4A / OGG / WAV）。
 * 3. 自動監看等待中狀態（#choices .loading-dot），長等待超過 1.8 秒時柔和切換《羽毛筆書寫中》，
 *    回覆到達後無縫淡回劇情配樂；回合結束時依情緒微調配樂氛圍。
 */

import { claudeBus } from './event-bus.js';

export function mountBgmImmersionUi({ bgmPlayer, ambienceEngine, audioBus, getUiLanguage = () => 'zh' } = {}) {
  if (typeof document === 'undefined' || !bgmPlayer) return null;
  if (document.getElementById('vnBgmNowPlayingBtn')) return document.getElementById('vnBgmNowPlayingBtn');

  let unlockedOnce = false;
  let waitTimer = 0;

  // 1. 首次任意點擊／按鍵互動自動解鎖並柔和淡入當前配樂，讓玩家一進門就被帶入圖書館
  const unlockAndFadeIn = () => {
    if (unlockedOnce) return;
    unlockedOnce = true;
    try {
      audioBus?.unlock?.();
      audioBus?.setActive?.(true);
    } catch (_) {}
    const tab = document.getElementById('tab-story');
    const isOpening = tab?.classList.contains('story-empty') || tab?.classList.contains('g43-story-opening');
    if (isOpening) {
      bgmPlayer.setScene('title');
    } else {
      const sceneKey = document.querySelector('#tab-story .vn-stage')?.dataset?.sceneKey || 'default';
      bgmPlayer.setScene(sceneKey);
    }
    if (bgmPlayer.getSnapshot().enabled) {
      void bgmPlayer.syncPlayback();
    }
    try { ambienceEngine?.sync?.(); } catch (_) {}
    syncUi();
  };

  window.addEventListener('pointerdown', unlockAndFadeIn, { once: true, passive: true });
  window.addEventListener('keydown', unlockAndFadeIn, { once: true, passive: true });

  // 2. 監看開局進入故事：從標題曲無縫交叉淡入當前場景書庫配樂
  const storyTab = document.getElementById('tab-story');
  if (storyTab && typeof MutationObserver === 'function') {
    let wasOpening = storyTab.classList.contains('story-empty') || storyTab.classList.contains('g43-story-opening');
    new MutationObserver(() => {
      const nowOpening = storyTab.classList.contains('story-empty') || storyTab.classList.contains('g43-story-opening');
      if (wasOpening && !nowOpening) {
        const sceneKey = document.querySelector('#tab-story .vn-stage')?.dataset?.sceneKey || 'default';
        bgmPlayer.setScene(sceneKey);
        if (bgmPlayer.getSnapshot().enabled) void bgmPlayer.syncPlayback();
      }
      wasOpening = nowOpening;
    }).observe(storyTab, { attributes: true, attributeFilter: ['class'] });
  }

  // 3. 監看 AI 等待狀態：等待超過 1.8 秒自動柔和過渡至《羽毛筆書寫中》，結束即淡回劇情配樂
  const choicesEl = document.getElementById('choices');
  if (choicesEl && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      const loading = Boolean(choicesEl.querySelector('.loading-dot'));
      clearTimeout(waitTimer);
      if (loading) {
        waitTimer = setTimeout(() => {
          if (choicesEl.querySelector('.loading-dot')) bgmPlayer.setWaiting(true);
        }, 1800);
      } else {
        bgmPlayer.setWaiting(false);
      }
    }).observe(choicesEl, { childList: true, subtree: true });
  }

  // 4. 訂閱回合情緒與場景變化
  claudeBus.on('turn:applied', (payload) => {
    bgmPlayer.setWaiting(false);
    if (payload?.emotion) bgmPlayer.applyStoryEmotion(payload.emotion);
  });

  // 5. 在故事畫面底部狀態列右側掛載「🎵 正在播放」微膠囊＋「圖書館沉浸音樂盒」浮窗
  const statusBar = document.querySelector('#tab-story .story-tool-status');
  const host = statusBar || document.querySelector('#tab-story .game-screen');
  if (!host) return null;

  const pill = document.createElement('button');
  pill.id = 'vnBgmNowPlayingBtn';
  pill.type = 'button';
  pill.className = 'vn-bgm-now-pill';
  pill.setAttribute('aria-expanded', 'false');
  pill.title = '開啟圖書館沉浸音樂盒（切換九首原創配樂或匯入自訂背景音樂）';
  host.appendChild(pill);

  const drawer = document.createElement('div');
  drawer.id = 'vnBgmJukeboxPopover';
  drawer.className = 'vn-bgm-jukebox';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', '圖書館沉浸音樂盒');
  drawer.hidden = true;
  drawer.innerHTML = `
<div class="vn-bgm-jukebox-head">
  <strong>🎵 圖書館沉浸音樂盒</strong>
  <button id="vnBgmJukeboxClose" type="button" aria-label="關閉音樂盒">✕</button>
</div>
<div class="vn-bgm-jukebox-toggles">
  <label class="bg-atmo-check"><input id="vnBgmBoxEnable" type="checkbox"><span>啟用背景音樂（自動隨場景柔和淡入）</span></label>
  <label class="bg-atmo-check"><input id="vnBgmBoxEmotion" type="checkbox"><span>隨劇情情緒自動微調配樂（溫柔／俏皮）</span></label>
  <label class="vn-bgm-jukebox-vol">音樂音量
    <input id="vnBgmBoxVol" type="range" min="0" max="100" step="5">
    <span id="vnBgmBoxVolVal">62%</span>
  </label>
</div>
<div class="vn-bgm-jukebox-actions">
  <button id="vnBgmBoxAutoBtn" type="button">↺ 跟隨劇情自動配樂</button>
  <button id="vnBgmBoxUploadBtn" type="button">⬆ 匯入自訂音樂</button>
  <input id="vnBgmBoxUploadFile" type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav" hidden>
</div>
<div id="vnBgmTrackList" class="vn-bgm-track-list"></div>
<p class="note vn-bgm-jukebox-status" id="vnBgmBoxStatus" role="status" aria-live="polite"></p>`;
  document.querySelector('#tab-story .game-screen')?.appendChild(drawer);

  const closeBtn = drawer.querySelector('#vnBgmJukeboxClose');
  const enBox = drawer.querySelector('#vnBgmBoxEnable');
  const emoBox = drawer.querySelector('#vnBgmBoxEmotion');
  const volRange = drawer.querySelector('#vnBgmBoxVol');
  const volVal = drawer.querySelector('#vnBgmBoxVolVal');
  const autoBtn = drawer.querySelector('#vnBgmBoxAutoBtn');
  const uploadBtn = drawer.querySelector('#vnBgmBoxUploadBtn');
  const uploadFile = drawer.querySelector('#vnBgmBoxUploadFile');
  const listEl = drawer.querySelector('#vnBgmTrackList');
  const statusEl = drawer.querySelector('#vnBgmBoxStatus');

  function renderTrackList(snap) {
    if (!listEl) return;
    listEl.replaceChildren();
    for (const track of bgmPlayer.listDistinctTracks()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = snap.activeTrackId === track.id || (snap.manualTrackKey && snap.manualTrackKey === track.key);
      btn.className = 'vn-bgm-track-item' + (isActive ? ' is-active' : '');
      btn.innerHTML = `<span class="vn-bgm-track-title">${isActive && snap.isPlaying ? '♪ ' : ''}${track.title}</span><small>${track.mood}</small>`;
      btn.onclick = () => {
        unlockedOnce = true;
        try { audioBus?.unlock?.(); audioBus?.setActive?.(true); } catch (_) {}
        bgmPlayer.setManualTrack(track.key);
        if (statusEl) statusEl.textContent = `已切換為「${track.title}」（鎖定中；按「跟隨劇情自動配樂」恢復自動）`;
      };
      listEl.appendChild(btn);
    }
  }

  function syncUi() {
    const snap = bgmPlayer.getSnapshot();
    const isEn = getUiLanguage() === 'en';
    if (!snap.enabled) {
      pill.textContent = isEn ? '♪ BGM Off' : '🎵 配樂：關';
      pill.classList.remove('is-playing');
    } else if (snap.isPlaying) {
      pill.textContent = `🎵 ${snap.activeTrackTitle || (isEn ? 'Playing' : '播放中')}`;
      pill.classList.add('is-playing');
    } else {
      pill.textContent = isEn ? '🎵 Tap to Play BGM' : `🎵 ${snap.activeTrackTitle || '點擊開啟配樂'}`;
      pill.classList.remove('is-playing');
    }
    if (enBox) enBox.checked = snap.enabled;
    if (emoBox) emoBox.checked = snap.emotionReactive;
    const pct = Math.round((snap.volume ?? 0.62) * 100);
    if (volRange) volRange.value = String(pct);
    if (volVal) volVal.textContent = `${pct}%`;
    if (autoBtn) autoBtn.disabled = !snap.manualTrackKey;
    if (!drawer.hidden) renderTrackList(snap);
  }

  pill.onclick = (e) => {
    e.stopPropagation();
    unlockedOnce = true;
    try { audioBus?.unlock?.(); audioBus?.setActive?.(true); } catch (_) {}
    if (bgmPlayer.getSnapshot().enabled && !bgmPlayer.getSnapshot().isPlaying) {
      void bgmPlayer.syncPlayback();
    }
    const nextOpen = drawer.hidden;
    drawer.hidden = !nextOpen;
    pill.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (nextOpen) renderTrackList(bgmPlayer.getSnapshot());
  };

  if (closeBtn) closeBtn.onclick = () => {
    drawer.hidden = true;
    pill.setAttribute('aria-expanded', 'false');
  };

  if (enBox) enBox.onchange = () => {
    unlockedOnce = true;
    bgmPlayer.updatePreference({ enabled: enBox.checked });
  };
  if (emoBox) emoBox.onchange = () => {
    bgmPlayer.updatePreference({ emotionReactive: emoBox.checked });
  };
  if (volRange) volRange.oninput = () => {
    const v = Math.max(0, Math.min(100, Number(volRange.value) || 0)) / 100;
    if (volVal) volVal.textContent = `${Math.round(v * 100)}%`;
    bgmPlayer.updatePreference({ volume: v });
  };
  if (autoBtn) autoBtn.onclick = () => {
    bgmPlayer.clearManualTrack();
    if (statusEl) statusEl.textContent = '已恢復依劇情時段與情緒自動切換配樂。';
  };
  if (uploadBtn && uploadFile) {
    uploadBtn.onclick = () => uploadFile.click();
    uploadFile.onchange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (statusEl) statusEl.textContent = `正在載入自訂音樂「${file.name}」…`;
      try {
        const res = await bgmPlayer.loadCustomAudioFile(file);
        if (statusEl) statusEl.textContent = `已帶入並循環播放「${res.title}」（${Math.round(res.duration)} 秒）。`;
      } catch (err) {
        if (statusEl) statusEl.textContent = `載入自訂音樂失敗：${err?.message || err}`;
      }
    };
  }

  document.addEventListener('pointerdown', (ev) => {
    if (drawer.hidden) return;
    if (drawer.contains(ev.target) || pill.contains(ev.target)) return;
    drawer.hidden = true;
    pill.setAttribute('aria-expanded', 'false');
  });

  bgmPlayer.subscribe(syncUi);
  syncUi();
  return pill;
}
