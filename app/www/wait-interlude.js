// G43 等待中介畫面：AI 回覆生成期間，舞台改顯示第一章的插畫（書庫寫字）。
// 2026-11-09：日夜一律使用同一張 g43-wait-writing.jpg；舊夜間等待圖 36455_1（g43-wait-night.jpg）不再使用。
// 注意：36455 本體是 P2-11 的夜間事件 CG，與等待圖無關，保留不動。
// 不修改 app.js：render() 在 busy 時會在 #choices 放入 .loading-dot，這裡只監看這個既有標記。
// 若要換圖或調整時間，只改下面的 ART 與 tuning。
const tab = document.getElementById('tab-story');
const stage = document.querySelector('.vn-stage');
const choices = document.getElementById('choices');
if (tab && stage && choices) {
  const tuning = Object.assign({
    showDelay: 350,     // 等待超過這麼久才出現，短回覆不閃一下
    hideDelay: 150,     // 標記短暫消失（重新 render）時不立刻關閉
    minVisible: 700,    // 出現後至少停留
    fade: 260,          // 要與 CSS 的淡入淡出一致
    lineEvery: 2800,    // 動作描寫輪播間隔
    hintAfter: 25000,   // 等太久時顯示提示
  }, window.__WAIT_INTERLUDE_TUNING__ || {});

  // night 設為 null 就會在夜間也使用 day 的圖。
  const ART = {
    day: {
      file: 'g43-wait-writing.jpg', ratio: 'portrait',
      alt: '克勞德坐在書庫的雕花椅上，用羽毛筆寫字',
      lines: {
        zh: ['（拿羽毛筆在《未竟錄》寫下一行）', '（翻過一頁，指尖停在段落上）', '（把落到頰邊的髮絲別到耳後）', '（端起紅茶輕輕吹了吹）'],
        en: ['(She writes a line in her notebook with the quill.)', '(She turns a page, fingertip resting on a paragraph.)', '(She tucks a loose strand of hair behind her ear.)', '(She blows gently on her tea.)'],
      },
    },
    // 夜間等待圖 36455_1 不再使用：night 設為 null，夜間也使用 day 的同一張圖與同一組動作描寫。
    night: null,
  };
  const HINT = {
    zh: '回覆比平常久，請再等一下。網路或模型忙碌時會比較慢。',
    en: 'This is taking longer than usual. Please wait a little; busy networks or models can be slow.',
  };

  const overlay = document.createElement('div');
  overlay.id = 'waitInterlude';
  overlay.className = 'wait-interlude';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  overlay.innerHTML =
    '<img class="wait-bg" alt="" draggable="false">' +
    '<img class="wait-art" alt="" draggable="false">' +
    '<div class="wait-shade"></div>' +
    '<div class="wait-caption"><p class="wait-title"></p><p class="wait-line"></p><p class="wait-hint"></p></div>';
  stage.appendChild(overlay);
  const bg = overlay.querySelector('.wait-bg');
  const art = overlay.querySelector('.wait-art');
  const titleEl = overlay.querySelector('.wait-title');
  const lineEl = overlay.querySelector('.wait-line');
  const hintEl = overlay.querySelector('.wait-hint');

  let showTimer = 0, hideTimer = 0, closeTimer = 0, lineTimer = 0, hintTimer = 0;
  let visibleSince = 0, lineIndex = 0, shown = false, theme = 'day';

  const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'zh');
  const image = file => `assets/${file}`;
  const hasUserOverride = () => tab.classList.contains('has-custom-portrait') ||
    tab.classList.contains('has-scene-image') || tab.classList.contains('text-only');
  const blocked = () => hasUserOverride() || tab.classList.contains('has-bundled-cg');
  const marker = () => choices.querySelector('.loading-dot');
  const pickTheme = () => (tab.dataset.artTone === 'night' && ART.night ? 'night' : 'day');

  function setLine() {
    const set = ART[theme].lines[lang()];
    lineEl.textContent = set[lineIndex % set.length];
    lineEl.classList.remove('is-swapping');
    void lineEl.offsetWidth;
    lineEl.classList.add('is-swapping');
  }
  function syncTitle() {
    const m = marker();
    if (m) titleEl.textContent = String(m.textContent || '').trim();
  }
  function show() {
    if (shown || blocked() || !marker()) return;
    theme = pickTheme();
    const spec = ART[theme];
    const src = image(spec.file);
    if (!art.getAttribute('src') || art.getAttribute('src') !== src) { art.src = src; bg.src = src; }
    art.alt = spec.alt;
    overlay.dataset.ratio = spec.ratio;
    overlay.dataset.theme = theme;
    syncTitle();
    hintEl.textContent = '';
    hintEl.classList.remove('is-on');
    lineIndex = 0;
    setLine();
    overlay.hidden = false;
    shown = true;
    visibleSince = Date.now();
    requestAnimationFrame(() => { if (shown) overlay.classList.add('is-visible'); });
    clearInterval(lineTimer);
    lineTimer = setInterval(() => { lineIndex += 1; setLine(); }, tuning.lineEvery);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (!shown) return;
      hintEl.textContent = HINT[lang()];
      hintEl.classList.add('is-on');
    }, tuning.hintAfter);
  }
  function close() {
    if (!shown) return;
    shown = false;
    clearInterval(lineTimer); clearTimeout(hintTimer);
    overlay.classList.remove('is-visible');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!shown) overlay.hidden = true; }, tuning.fade);
  }
  function sync() {
    if (marker() && !blocked()) {
      clearTimeout(hideTimer); hideTimer = 0;
      if (shown) { syncTitle(); return; }
      if (!showTimer) showTimer = setTimeout(() => { showTimer = 0; show(); }, tuning.showDelay);
    } else {
      clearTimeout(showTimer); showTimer = 0;
      if (shown && !hideTimer) {
        const wait = Math.max(tuning.hideDelay, tuning.minVisible - (Date.now() - visibleSince));
        hideTimer = setTimeout(() => { hideTimer = 0; if (!marker() || blocked()) close(); }, wait);
      }
    }
  }

  new MutationObserver(sync).observe(choices, { childList: true, subtree: true, characterData: true });
  new MutationObserver(sync).observe(tab, { attributes: true, attributeFilter: ['class'] });
  // 預先載入，第一次等待時不會先看到空白。
  const preload = () => Object.values(ART).forEach(spec => { if (spec) { const i = new Image(); i.src = image(spec.file); } });
  (window.requestIdleCallback || (fn => setTimeout(fn, 1500)))(preload);
  sync();
}
