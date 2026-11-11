// G43：整張帶背景的插畫採單圖淡出／淡入；劇情 CG 只接受遊戲核准的結構化事件旗標。
const tab = document.getElementById('tab-story');
const stage = document.querySelector('.vn-stage');
const defaultArt = document.getElementById('storyDefaultArt');
const cgArt = document.getElementById('bundledStoryCg');
const grade = document.getElementById('storyArtGrade');
const transition = document.getElementById('storySceneTransition');
const dialogue = document.getElementById('dialogueText');
if (tab && stage && defaultArt && cgArt && grade && transition && dialogue) {
  const image = name => `assets/${name}`;
  // v5 Step 2：ratio＝16:9 或 portrait；portrait 由 CSS 以前景完整＋背景模糊呈現。
  const cgEvents = [
    { flag: 'moon_bird', id: 'moon-bird', artId: '36372', file: 'g43-cg-moon-bird.jpg', alt: '月夜中發光信鳥送來書信的劇情 CG', once: true, tone: 'night', ratio: '16:9', blurBg: false },
    { flag: 'outing_memory', id: 'outing-memory', artId: '36369', file: 'g43-cg-outing-memory.jpg', alt: '克勞德在向日葵田閱讀的外出回憶 CG', once: true, tone: 'none', ratio: '16:9', blurBg: false },
    { flag: 'magic_touch', id: 'magic-touch', artId: '36374', file: 'g43-cg-magic-touch.jpg', alt: '克勞德觸碰發光面板的劇情 CG', once: true, tone: 'warm', ratio: '16:9', blurBg: false },
    { flag: 'vow', id: 'vow', artId: '36375', file: 'g43-cg-vow.jpg', alt: '克勞德感動祈願的劇情 CG', once: true, tone: 'none', ratio: '16:9', blurBg: false },
    { flag: 'letter', id: 'letter', artId: '36371', file: 'g43-cg-letter.jpg', alt: '克勞德燭光下閱讀信件的插入 CG', once: false, tone: 'none', ratio: '16:9', blurBg: false },
    { flag: 'goodnight', id: 'bed-goodnight', artId: '36455', file: 'g43-cg-bed-goodnight.jpg', alt: '夜晚臥室中克勞德趴在床上、羽毛筆指向畫面的晚安 CG', once: false, tone: 'night', ratio: '16:9', blurBg: false, textBoxPos: 'bottom-short' },
    { flag: 'goodnight', id: 'goodnight-reading', artId: '36628', file: 'g43-cg-goodnight-reading.jpg', alt: '克勞德夜裡蓋著被子讀書的晚安 CG', once: false, tone: 'night', ratio: 'portrait', blurBg: true, textBoxPos: 'bottom-dark' },
    { flag: 'night_chat_reading', id: 'goodnight-reading', artId: '36628', file: 'g43-cg-goodnight-reading.jpg', alt: '克勞德夜裡蓋著被子讀書的夜間聊天 CG', once: false, tone: 'night', ratio: 'portrait', blurBg: true, textBoxPos: 'bottom-dark' },
    { flag: 'cheek_pinch', id: 'cheek-pinch', artId: '36627', file: 'g43-cg-cheek-pinch.jpg', alt: '克勞德被捏臉頰、鼓起臉頰瞪人的觸碰反應 CG', once: false, tone: 'warm', ratio: 'portrait', blurBg: true },
    // G43（WP5）：36685 只由 app.js 的本機判定呼叫，不開放 AI eventFlag；一出現在同一回合就不再排隊。
    { id: 'rare-goodnight', artId: '36685', file: 'g43-cg-goodnight.jpg', alt: '克勞德枕上閉眼大笑的稀有晚安 CG', once: false, tone: 'night', ratio: '16:9', blurBg: false, fadeMs: 400, clickToClose: true },
    // G43（WP6）：36629 臥室 CG，只供 WP7 本機條件呼叫；不掛 flag，不作預設或唯一素材。
    { id: 'nightgown', artId: '36629', file: 'g43-cg-goodnight-nightgown.jpg', alt: '克勞德夜裡穿著睡袍的臥室 CG', once: false, tone: 'night', ratio: 'portrait', blurBg: true },
    { flag: 'lakeside_sunset', id: 'lakeside-sunset', artId: '36622', file: 'g43-cg-lakeside.jpg', alt: '夕陽下湖畔的克勞德外出回憶 CG', once: true, tone: 'warm', ratio: 'portrait', blurBg: true },
  ];

  // D16：晚安事件依設定偏好選擇 36455 臥室主 CG 或 36628 蓋被讀書 CG。
  function goodnightPreference() {
    try {
      const saved = localStorage.getItem('claude_novel_goodnight_cg_pref_v1');
      return saved === '36455' || saved === '36628' ? saved : 'both';
    } catch (_) {
      return 'both';
    }
  }

  function cgEventForFlag(flag) {
    if (flag === 'goodnight') {
      const bed = cgEvents.find(item => item.flag === 'goodnight' && item.id === 'bed-goodnight');
      const reading = cgEvents.find(item => item.flag === 'goodnight' && item.id === 'goodnight-reading');
      const preference = goodnightPreference();
      if (preference === '36455') return bed;
      if (preference === '36628') return reading;
      return Math.random() < 0.5 ? bed : reading;
    }
    return cgEvents.find(item => item.flag === flag);
  }

  let timeGroup = 'day';
  let currentScene = '';
  let activeCg = '';
  let lastDialogue = '';
  let lastEmotionToken = '';
  let neutralTurns = 0;
  let cgTimer = 0;
  let transitionTimer = 0;
  let cgTransitionTimer = 0;
  let openingFlashTimer = 0;
  let artGeneration = 0;
  let cgGeneration = 0;
  let cgStartedAt = 0;
  let pendingCg = null;
  let lastStoryEventToken = stage.dataset.storyEventToken || '';

  const hasUserOverride = () => tab.classList.contains('has-custom-portrait') ||
    tab.classList.contains('has-scene-image') || tab.classList.contains('text-only');

  // G43（WP5）：稀有晚安 CG 的 400ms 淡入淡出；系統開啟「減少動態」時直接切換。
  function prefersReducedMotion() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }

  function setTone(tone) {
    grade.dataset.tone = tone || 'none';
    tab.dataset.artTone = tone || 'none';
  }

  function setStoryArt(file, alt, scene = '', tone = 'none') {
    if (hasUserOverride() || tab.classList.contains('has-bundled-cg')) return;
    const src = image(file);
    currentScene = scene;
    if (defaultArt.getAttribute('src') === src) {
      defaultArt.alt = alt;
      defaultArt.dataset.art = scene || 'default';
      setTone(tone);
      return;
    }
    const generation = ++artGeneration;
    clearTimeout(transitionTimer);
    defaultArt.style.opacity = '0';
    defaultArt.onload = () => {
      if (generation !== artGeneration) return;
      requestAnimationFrame(() => {
        if (generation !== artGeneration) return;
        defaultArt.style.opacity = '1';
        defaultArt.alt = alt;
        defaultArt.dataset.art = scene || 'default';
        setTone(tone);
      });
    };
    defaultArt.src = src;
    if (defaultArt.complete && defaultArt.naturalWidth) defaultArt.onload();
  }

  function returnToTimeDefault() {
    if (timeGroup === 'night') setStoryArt('g43-cg-magic-light.jpg', '夜色中克勞德手托微光，作為夜間獨處場景', 'night', 'night');
    else setStoryArt('g43-story-default.jpg', '克勞德站在窗前，日間故事預設立繪', 'default', 'warm');
  }

  function applyEmotionArt() {
    if (hasUserOverride() || tab.classList.contains('has-bundled-cg') || tab.classList.contains('g43-story-opening')) return;
    if (timeGroup === 'night') {
      setStoryArt('g43-cg-magic-light.jpg', '夜色中克勞德手托微光，夜間立繪', 'night', 'night');
      return;
    }
    const emotion = stage.dataset.storyEmotion || 'neutral';
    if (emotion === 'shy' || emotion === 'curious') {
      setStoryArt('g43-story-soft-morning.jpg', '克勞德在日光中溫柔傾聽', 'soft-morning', 'warm');
    } else {
      setStoryArt('g43-story-default.jpg', '克勞德站在窗前，日間故事預設立繪', 'default', 'warm');
    }
  }

  function finishCg() {
    clearTimeout(cgTimer);
    clearTimeout(cgTransitionTimer);
    cgTimer = 0;
    const generation = ++cgGeneration;
    tab.classList.remove('has-bundled-cg');
    tab.classList.remove('has-portrait-cg');
    tab.style.removeProperty('--cg-bg-url');
    tab.removeAttribute('data-cg-id');
    transition.classList.remove('is-active');
    transition.removeAttribute('data-mode');
    cgArt.style.opacity = '0';
    transitionTimer = setTimeout(() => {
      if (generation !== cgGeneration) return;
      cgArt.hidden = true;
      cgArt.removeAttribute('src');
      cgArt.removeAttribute('data-cg');
      cgArt.removeAttribute('data-ratio');
      cgArt.style.removeProperty('opacity');
      cgArt.style.removeProperty('transition');
      cgArt.style.removeProperty('pointer-events');
      cgArt.style.removeProperty('cursor');
      transition.style.removeProperty('transition');
      activeCg = '';
      applyEmotionArt();
      if (pendingCg) { const next = pendingCg; pendingCg = null; showCg(next); }
    }, 500);
  }

  function openingFlash() {
    clearTimeout(openingFlashTimer);
    transition.dataset.mode = 'opening-flash';
    transition.classList.add('is-active');
    openingFlashTimer = setTimeout(() => {
      transition.classList.remove('is-active');
      transition.removeAttribute('data-mode');
    }, 250);
  }

  function showCg(event) {
    if (!event) return;
    if (hasUserOverride()) return;
    if (activeCg) { pendingCg = event; return; }
    clearTimeout(cgTimer);
    clearTimeout(transitionTimer);
    clearTimeout(cgTransitionTimer);
    const generation = ++cgGeneration;
    activeCg = event.id;
    cgStartedAt = Date.now();
    // G43（WP5）：只有標了 fadeMs 的 CG（稀有晚安）改用 400ms；其餘維持原本 700ms 暗轉。
    const fadeMs = Math.max(0, Number(event.fadeMs) || 0);
    const reduced = fadeMs > 0 && prefersReducedMotion();
    if (fadeMs > 0) {
      cgArt.style.transition = reduced ? 'none' : `opacity ${fadeMs}ms ease-out`;
      transition.style.transition = reduced ? 'none' : `opacity ${fadeMs}ms ease`;
    } else {
      cgArt.style.removeProperty('transition');
      transition.style.removeProperty('transition');
    }
    if (event.clickToClose) {
      cgArt.style.pointerEvents = 'auto';
      cgArt.style.cursor = 'pointer';
    } else {
      cgArt.style.removeProperty('pointer-events');
      cgArt.style.removeProperty('cursor');
    }
    transition.dataset.mode = 'cg-dark';
    transition.classList.add('is-active');
    setTone(event.tone);
    cgArt.style.opacity = '0';
    cgArt.hidden = false;
    cgArt.alt = event.alt;
    cgArt.dataset.cg = event.id;
    // v5 Step 2：直式版型（前景完整）＋背景模糊層；橫式維持原本 cover。
    cgArt.dataset.ratio = event.ratio || '16:9';
    tab.classList.toggle('has-portrait-cg', event.ratio === 'portrait' && event.blurBg !== false);
    if (event.ratio === 'portrait' && event.blurBg !== false) {
      tab.style.setProperty('--cg-bg-url', `url("${image(event.file)}")`);
    } else {
      tab.style.removeProperty('--cg-bg-url');
    }
    if (event.artId) tab.dataset.cgId = event.artId;
    cgArt.onload = () => {
      if (generation !== cgGeneration) return;
      cgTransitionTimer = setTimeout(() => {
        if (generation !== cgGeneration) return;
        tab.classList.add('has-bundled-cg');
        cgArt.style.opacity = '1';
        transition.classList.remove('is-active');
        transition.removeAttribute('data-mode');
        cgTimer = setTimeout(finishCg, 5000);
      }, fadeMs > 0 ? (reduced ? 0 : fadeMs) : 700);
    };
    cgArt.onerror = () => {
      if (generation !== cgGeneration) return;
      finishCg();
    };
    cgArt.src = image(event.file);
    if (cgArt.complete && cgArt.naturalWidth) cgArt.onload();
  }

  // G43（WP5）：36685 只由 app.js 在成功回合後呼叫；已有一般 CG、自訂立繪或場景圖時不插隊。
  // 回傳 true 代表這一回合真的開始顯示，app.js 才寫入 24 小時冷卻與相簿解鎖。
  function showRareGoodnight() {
    if (hasUserOverride()) return false;
    if (activeCg || tab.classList.contains('has-bundled-cg')) return false;
    const event = cgEvents.find(item => item.id === 'rare-goodnight');
    if (!event) return false;
    showCg(event);
    return true;
  }

  // G43（WP6）：臥室場景 CG（36628／36629）的呈現入口；WP7 本機條件滿足時呼叫。
  // 不掛 AI eventFlag、不作預設； portrait＋blurBg 由既有 CSS 規則處理；已有 CG 時不插隊。
  function showBedroomScene(artId) {
    if (hasUserOverride()) return false;
    if (activeCg || tab.classList.contains('has-bundled-cg')) return false;
    const event = cgEvents.find(item => item.artId === String(artId));
    if (!event || (event.id !== 'goodnight-reading' && event.id !== 'nightgown')) return false;
    showCg(event);
    return true;
  }

  // 稀有晚安 CG 一點即關；其他 CG 維持原本 5 秒自動結束，不攔截點擊。
  cgArt.addEventListener('click', () => {
    if (activeCg === 'rare-goodnight') finishCg();
  });

  function receiveStoryEvent() {
    const token = stage.dataset.storyEventToken || '';
    if (!token || token === lastStoryEventToken) return;
    lastStoryEventToken = token;
    const flag = stage.dataset.storyEvent || '';
    const event = cgEventForFlag(flag);
    if (event) showCg(event);
  }

  function updateTimeGroup(text) {
    const before = timeGroup;
    if (/夜晚|深夜|入夜|月夜|月色|月光|星空|燭光/.test(text)) {
      if (timeGroup !== 'night') { timeGroup = 'night'; currentScene = ''; }
    } else if (/清晨|早晨|日出|晨光|白天|日間|午後|太陽升起/.test(text)) {
      if (timeGroup !== 'day') { timeGroup = 'day'; currentScene = ''; }
    }
    return before !== timeGroup;
  }

  function inspectDialogue() {
    if (tab.classList.contains('story-empty') || tab.classList.contains('g43-story-opening')) return;
    const text = String(dialogue.textContent || '').trim();
    if (!text || text === lastDialogue || /AI 正在構思故事/.test(text)) return;
    lastDialogue = text;
    const timeChanged = updateTimeGroup(text);
    if (timeChanged) returnToTimeDefault();

    // 36370（只保留 36370_1）：傍晚讀書、白鴿停窗台的鋪梗場景；非情緒切換。
    if (/傍晚|暮色|夕陽|日落/.test(text) && /白鴿|鴿子|鳥停在窗台|窗台.{0,8}白鳥/.test(text)) {
      setStoryArt('g43-story-reading.jpg', '傍晚的克勞德與窗台白鴿，為夜間信鳥故事鋪梗', 'evening-reading', 'warm');
    } else if (timeGroup === 'night' && currentScene !== 'night') {
      returnToTimeDefault();
    }

    const emotionToken = stage.dataset.storyEmotionToken || '';
    if (emotionToken && emotionToken !== lastEmotionToken) {
      lastEmotionToken = emotionToken;
      const emotion = stage.dataset.storyEmotion || 'neutral';
      if (emotion === 'neutral') {
        neutralTurns++;
        if (neutralTurns >= 3) { currentScene = ''; applyEmotionArt(); }
      } else {
        neutralTurns = 0;
        if (!currentScene || currentScene === 'default' || currentScene === 'soft-morning' || currentScene === 'night') applyEmotionArt();
      }
    }

    // 劇情 CG 不依旁白猜測，改由 JSON eventFlag 經遊戲端核准後觸發。
    if (activeCg) {
      if (Date.now() - cgStartedAt < 5700) return;
      finishCg();
    }
  }

  new MutationObserver(() => { if (!hasUserOverride()) applyEmotionArt(); }).observe(stage, { attributes: true, attributeFilter: ['data-story-emotion','data-story-emotion-token'] });
  new MutationObserver(receiveStoryEvent).observe(stage, { attributes: true, attributeFilter: ['data-story-event','data-story-event-token'] });
  new MutationObserver(inspectDialogue).observe(dialogue, { childList: true, subtree: true, characterData: true });
  new MutationObserver(records => {
    for (const record of records) {
      const wasOpening = String(record.oldValue || '').split(/\s+/).includes('g43-story-opening');
      const isOpening = tab.classList.contains('g43-story-opening');
      if (wasOpening && !isOpening) openingFlash();
    }
    if (!hasUserOverride()) applyEmotionArt();
    inspectDialogue();
  }).observe(tab, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  applyEmotionArt();
  inspectDialogue();
  // 測試與 app.js 的顯示入口；只暴露這兩個唯讀／顯示方法。
  window.__storyArt = { showRareGoodnight, showBedroomScene, isCgActive: () => !!activeCg };
}
