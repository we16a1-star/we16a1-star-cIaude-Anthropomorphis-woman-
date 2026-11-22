/**
 * scene-atmosphere.js — 遊戲中背景光影、動態環境粒子與電影感微視差優化引擎
 *
 * 設計重點：
 * 1. 依場景鍵（default / soft-morning / evening-reading / night / rainy-night）即時切換
 *    對應光束層（#sceneLightLayer）與 Canvas 環境粒子（陽光浮塵、暮色金粉、夜光星塵、雨夜細雨）。
 * 2. 左暗護字、右亮透人：透過柔和漸層暗角保護左側選項與對話框可讀性，同時保持右側角色清透立體。
 * 3. 極柔和的微呼吸景深＋桌面滑鼠阻尼視差（±6px，絕不露黑邊），完整尊重 prefers-reduced-motion。
 * 4. 智慧省電：視窗隱藏、離開故事頁或停用特效時自動暫停 requestAnimationFrame。
 * 5. 在「🖼 場景與插圖」內提供五大場景一鍵預覽切換與氛圍開關，偏好持久化於 localStorage。
 */

import { claudeBus } from './event-bus.js';

export const STORAGE_KEY_BG_ATMOSPHERE = 'claude_novel_bg_atmosphere_v1';

export const SCENE_ATMOSPHERE_PRESETS = Object.freeze({
  default: {
    id: 'day-default',
    label: '白天',
    labelEn: 'Day',
    effectClass: 'scene-fx-warm-sun',
    particleMode: 'dust-gold',
    particleCount: 28
  },
  'soft-morning': {
    id: 'morning-soft',
    label: '晨光',
    labelEn: 'Morning',
    effectClass: 'scene-fx-morning-glow',
    particleMode: 'dust-morning',
    particleCount: 24
  },
  'evening-reading': {
    id: 'evening-reading',
    label: '傍晚',
    labelEn: 'Evening',
    effectClass: 'scene-fx-sunset-dusk',
    particleMode: 'dust-sunset',
    particleCount: 26
  },
  night: {
    id: 'night-magic',
    label: '夜間',
    labelEn: 'Night',
    effectClass: 'scene-fx-moonlight',
    particleMode: 'firefly-moon',
    particleCount: 30
  },
  'rainy-night': {
    id: 'rainy-night',
    label: '雨夜',
    labelEn: 'Rainy Night',
    effectClass: 'scene-fx-rainy-night',
    particleMode: 'rain-candle',
    particleCount: 54
  }
});

const ALL_EFFECT_CLASSES = Object.values(SCENE_ATMOSPHERE_PRESETS).map((p) => p.effectClass);

const DEFAULT_PREFS = Object.freeze({
  atmosphereFx: true,
  depthMotion: true,
  readabilityVignette: true
});

export function resolveAtmospherePreset(sceneKey) {
  const k = String(sceneKey || '').trim().toLowerCase();
  if (SCENE_ATMOSPHERE_PRESETS[k]) return { key: k, ...SCENE_ATMOSPHERE_PRESETS[k] };
  if (k.includes('rain')) return { key: 'rainy-night', ...SCENE_ATMOSPHERE_PRESETS['rainy-night'] };
  if (k.includes('night') || k.includes('moon')) return { key: 'night', ...SCENE_ATMOSPHERE_PRESETS.night };
  if (k.includes('evening') || k.includes('dusk') || k.includes('sunset')) return { key: 'evening-reading', ...SCENE_ATMOSPHERE_PRESETS['evening-reading'] };
  if (k.includes('morning')) return { key: 'soft-morning', ...SCENE_ATMOSPHERE_PRESETS['soft-morning'] };
  return { key: 'default', ...SCENE_ATMOSPHERE_PRESETS.default };
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

export class SceneAtmosphereEngine {
  constructor(options = {}) {
    this.storage = options.storage !== undefined
      ? options.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    this.bus = options.bus || claudeBus;
    this.prefs = this._loadPrefs();
    this.sceneKey = 'default';
    this.preset = resolveAtmospherePreset('default');
    this.stage = null;
    this.tab = null;
    this.lightLayer = null;
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.rafId = 0;
    this.lastFrameTs = 0;
    this.targetPx = 0;
    this.targetPy = 0;
    this.curPx = 0;
    this.curPy = 0;
    this._mounted = false;
    this._unsubBus = null;
  }

  _loadPrefs() {
    const out = { ...DEFAULT_PREFS };
    if (!this.storage) return out;
    try {
      const raw = this.storage.getItem(STORAGE_KEY_BG_ATMOSPHERE);
      if (!raw) return out;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.atmosphereFx === 'boolean') out.atmosphereFx = parsed.atmosphereFx;
        if (typeof parsed.depthMotion === 'boolean') out.depthMotion = parsed.depthMotion;
        if (typeof parsed.readabilityVignette === 'boolean') out.readabilityVignette = parsed.readabilityVignette;
      }
    } catch (_) {}
    return out;
  }

  getPrefs() {
    return { ...this.prefs };
  }

  setPrefs(patch = {}) {
    const next = { ...this.prefs };
    if (typeof patch.atmosphereFx === 'boolean') next.atmosphereFx = patch.atmosphereFx;
    if (typeof patch.depthMotion === 'boolean') next.depthMotion = patch.depthMotion;
    if (typeof patch.readabilityVignette === 'boolean') next.readabilityVignette = patch.readabilityVignette;
    this.prefs = next;
    if (this.storage) {
      try { this.storage.setItem(STORAGE_KEY_BG_ATMOSPHERE, JSON.stringify(next)); } catch (_) {}
    }
    this.applyDomClasses();
    this._syncLoop();
    return this.getPrefs();
  }

  mount() {
    if (this._mounted || typeof document === 'undefined') return false;
    this.tab = document.getElementById('tab-story');
    this.stage = document.querySelector('#tab-story .vn-stage');
    if (!this.tab || !this.stage) return false;

    const grade = document.getElementById('storyArtGrade');

    let light = document.getElementById('sceneLightLayer');
    if (!light) {
      light = document.createElement('div');
      light.id = 'sceneLightLayer';
      light.className = 'scene-light-layer';
      light.setAttribute('aria-hidden', 'true');
      if (grade && grade.parentNode === this.stage) {
        grade.insertAdjacentElement('afterend', light);
      } else {
        this.stage.appendChild(light);
      }
    }
    this.lightLayer = light;

    let canvas = document.getElementById('sceneAtmosphereCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'sceneAtmosphereCanvas';
      canvas.className = 'scene-atmosphere-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      this.lightLayer.insertAdjacentElement('afterend', canvas);
    }
    this.canvas = canvas;
    try {
      this.ctx = canvas.getContext('2d');
    } catch (_) {
      this.ctx = null;
    }

    this._resizeCanvas();
    this._bindEvents();
    this._unsubBus = this.bus.on('scene:changed', (payload) => {
      if (payload && payload.sceneKey) {
        this.setScene(payload.sceneKey);
      }
    });

    const initialKey = this.stage.dataset.sceneKey || document.getElementById('storyDefaultArt')?.dataset?.art || 'default';
    this._mounted = true;
    this.setScene(initialKey);
    return true;
  }

  _bindEvents() {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', () => this._resizeCanvas(), { passive: true });
    document.addEventListener('visibilitychange', () => this._syncLoop());
    window.addEventListener('pointermove', (ev) => {
      if (!this.prefs.depthMotion || prefersReducedMotion()) return;
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      if (!this.tab?.classList.contains('active')) return;
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 780;
      const nx = (ev.clientX / w - 0.5) * 2; // -1..1
      const ny = (ev.clientY / h - 0.5) * 2;
      this.targetPx = Math.max(-1, Math.min(1, nx)) * -6;
      this.targetPy = Math.max(-1, Math.min(1, ny)) * -4;
    }, { passive: true });
  }

  _resizeCanvas() {
    if (!this.canvas || !this.stage) return;
    const rect = this.stage.getBoundingClientRect?.() || { width: 1280, height: 780 };
    const w = Math.max(320, Math.round(rect.width || window.innerWidth || 1280));
    const h = Math.max(240, Math.round(rect.height || window.innerHeight || 780));
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.ctx && typeof this.ctx.setTransform === 'function') {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this._viewW = w;
    this._viewH = h;
    if (this.particles.length === 0) {
      this._seedParticles();
    }
  }

  setScene(sceneKey) {
    const resolved = resolveAtmospherePreset(sceneKey);
    const changed = resolved.key !== this.sceneKey || !this.particles.length;
    this.sceneKey = resolved.key;
    this.preset = resolved;
    this.applyDomClasses();
    if (changed) {
      this._seedParticles();
    }
    this._syncLoop();
    this.syncPresetButtons();
  }

  applyDomClasses() {
    if (!this.tab || !this.stage) return;
    for (const cls of ALL_EFFECT_CLASSES) {
      this.stage.classList.remove(cls);
    }
    if (this.prefs.atmosphereFx) {
      this.stage.classList.add(this.preset.effectClass);
    }
    this.stage.dataset.sceneKey = this.sceneKey;
    this.tab.classList.toggle('bg-fx-enabled', Boolean(this.prefs.atmosphereFx));
    this.tab.classList.toggle('bg-depth-motion', Boolean(this.prefs.depthMotion && !prefersReducedMotion()));
    this.tab.classList.toggle('bg-readability-vignette', Boolean(this.prefs.readabilityVignette));
    if (this.canvas) {
      this.canvas.hidden = !this.prefs.atmosphereFx || prefersReducedMotion();
    }
    if (!this.prefs.depthMotion || prefersReducedMotion()) {
      this.stage.style.setProperty('--bg-parallax-x', '0px');
      this.stage.style.setProperty('--bg-parallax-y', '0px');
    }
  }

  _seedParticles() {
    const w = this._viewW || 1280;
    const h = this._viewH || 780;
    const mode = this.preset.particleMode;
    const count = this.preset.particleCount;
    const list = [];
    for (let i = 0; i < count; i += 1) {
      if (mode === 'rain-candle') {
        list.push({
          kind: i < count - 10 ? 'rain' : 'ember',
          x: Math.random() * (w + 160) - 80,
          y: Math.random() * h,
          len: 14 + Math.random() * 20,
          vx: -1.8 - Math.random() * 1.1,
          vy: 11 + Math.random() * 6,
          r: 1.2 + Math.random() * 2.2,
          alpha: 0.14 + Math.random() * 0.24,
          phase: Math.random() * Math.PI * 2
        });
      } else {
        list.push({
          kind: mode,
          x: Math.random() * w,
          y: Math.random() * h,
          r: (mode === 'firefly-moon' ? 1.4 : 1.0) + Math.random() * 2.4,
          vx: (Math.random() - 0.35) * 0.28,
          vy: mode === 'firefly-moon' ? (-0.25 - Math.random() * 0.35) : (-0.08 - Math.random() * 0.2),
          alpha: 0.16 + Math.random() * 0.38,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.1
        });
      }
    }
    this.particles = list;
  }

  _shouldAnimate() {
    if (!this._mounted || prefersReducedMotion()) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    if (!this.prefs.atmosphereFx && !this.prefs.depthMotion) return false;
    return true;
  }

  _syncLoop() {
    if (this._shouldAnimate()) {
      if (!this.rafId && typeof requestAnimationFrame === 'function') {
        this.lastFrameTs = performance.now();
        const tick = (now) => {
          this.rafId = 0;
          if (!this._shouldAnimate()) return;
          const dt = Math.min(0.05, Math.max(0.008, (now - this.lastFrameTs) / 1000));
          this.lastFrameTs = now;
          this._step(dt, now * 0.001);
          this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
      }
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  _step(dt, tSec) {
    // 1. 柔和阻尼滑鼠視差
    if (this.prefs.depthMotion && this.stage) {
      const ease = Math.min(1, dt * 4.2);
      this.curPx += (this.targetPx - this.curPx) * ease;
      this.curPy += (this.targetPy - this.curPy) * ease;
      this.stage.style.setProperty('--bg-parallax-x', `${this.curPx.toFixed(2)}px`);
      this.stage.style.setProperty('--bg-parallax-y', `${this.curPy.toFixed(2)}px`);
    }

    // 2. Canvas 環境粒子（僅於故事分頁啟用且開啟動態氛圍時繪製）
    if (!this.prefs.atmosphereFx || !this.ctx || !this.tab?.classList.contains('active')) return;
    const w = this._viewW || 1280;
    const h = this._viewH || 780;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    for (const p of this.particles) {
      if (p.kind === 'rain') {
        p.x += p.vx * (dt * 60);
        p.y += p.vy * (dt * 60);
        if (p.y > h + 30 || p.x < -100) {
          p.x = Math.random() * (w + 180);
          p.y = -20 - Math.random() * 60;
        }
        ctx.strokeStyle = `rgba(186, 214, 245, ${p.alpha.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 1.6, p.y + p.len);
        ctx.stroke();
        continue;
      }

      if (p.kind === 'ember') {
        p.y -= 0.25 * (dt * 60);
        p.x += Math.sin(tSec * 1.4 + p.phase) * 0.28;
        if (p.y < h * 0.45) {
          p.y = h + 10;
          p.x = Math.random() * w * 0.55;
        }
        const glow = p.alpha * (0.55 + 0.45 * Math.sin(tSec * 2.2 + p.phase));
        ctx.fillStyle = `rgba(255, 204, 128, ${glow.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      p.x += (p.vx + Math.sin(tSec * p.speed + p.phase) * 0.14) * (dt * 60);
      p.y += p.vy * (dt * 60);
      if (p.y < -12) { p.y = h + 12; p.x = Math.random() * w; }
      if (p.x < -12) p.x = w + 12;
      if (p.x > w + 12) p.x = -12;

      const twinkle = p.alpha * (0.45 + 0.55 * Math.sin(tSec * p.speed * 1.4 + p.phase));
      let fill = `rgba(255, 232, 178, ${twinkle.toFixed(3)})`;
      if (p.kind === 'dust-morning') fill = `rgba(255, 246, 222, ${twinkle.toFixed(3)})`;
      else if (p.kind === 'dust-sunset') fill = `rgba(255, 198, 132, ${twinkle.toFixed(3)})`;
      else if (p.kind === 'firefly-moon') fill = (p.phase > Math.PI ? `rgba(176, 214, 255, ${twinkle.toFixed(3)})` : `rgba(255, 219, 148, ${twinkle.toFixed(3)})`);

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  syncPresetButtons() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('#bgScenePresetBar .bg-preset-pill').forEach((btn) => {
      const active = btn.dataset.sceneKey === this.sceneKey;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /**
   * 掛載到故事選單「🖼 場景與插圖」內的 #bgAdjustBox
   */
  mountControlsUi(getUiLanguage = () => 'zh') {
    if (typeof document === 'undefined') return null;
    const host = document.getElementById('bgAdjustBox');
    if (!host || document.getElementById('bgAtmosphereControls')) return null;

    const wrap = document.createElement('div');
    wrap.id = 'bgAtmosphereControls';
    wrap.className = 'bg-atmosphere-controls';

    const presetTitle = document.createElement('div');
    presetTitle.className = 'bg-adjust-note';
    presetTitle.textContent = '📚 切換圖書館時段背景（即時聯動光影、粒子與環境音）';

    const bar = document.createElement('div');
    bar.id = 'bgScenePresetBar';
    bar.className = 'bg-preset-bar';
    const order = ['soft-morning', 'default', 'evening-reading', 'night', 'rainy-night'];
    for (const key of order) {
      const preset = SCENE_ATMOSPHERE_PRESETS[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bg-preset-pill';
      btn.dataset.sceneKey = key;
      btn.textContent = getUiLanguage() === 'en' ? preset.labelEn : preset.label;
      btn.onclick = () => {
        const applied = window.__storyArt?.applyScenePack?.(key, { respectTimeGroup: false });
        if (!applied) {
          this.setScene(key);
        }
        this.syncPresetButtons();
      };
      bar.appendChild(btn);
    }

    const mkToggle = (id, label, checked, onChange) => {
      const row = document.createElement('label');
      row.className = 'api-img-check bg-atmo-check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = id;
      box.checked = checked;
      box.onchange = () => onChange(box.checked);
      const span = document.createElement('span');
      span.textContent = label;
      row.append(box, span);
      return row;
    };

    wrap.append(
      presetTitle,
      bar,
      mkToggle('bgAtmosphereFxToggle', '動態光影與環境粒子（陽光浮塵／月光微粒／細雨）', this.prefs.atmosphereFx, (v) => this.setPrefs({ atmosphereFx: v })),
      mkToggle('bgDepthMotionToggle', '電影感微呼吸景深與柔和滑鼠視差', this.prefs.depthMotion, (v) => this.setPrefs({ depthMotion: v })),
      mkToggle('bgReadabilityVignetteToggle', '左側文字保護暗角（左暗護字・右亮透人）', this.prefs.readabilityVignette, (v) => this.setPrefs({ readabilityVignette: v }))
    );

    host.appendChild(wrap);
    this.syncPresetButtons();
    return wrap;
  }
}

export const sceneAtmosphere = new SceneAtmosphereEngine();
