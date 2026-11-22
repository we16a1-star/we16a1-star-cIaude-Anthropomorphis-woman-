/**
 * type-sound.js — 視覺小說逐字打字微音效（Web Audio 即時合成，零外部音檔）
 *
 * Ported from AnimaVN (MIT License, Copyright (c) 2026 JayziLi)
 * Source: frontend/src/debug/vn/typeSound.ts
 *
 * 支援三種零依賴現場合成音色：
 *   - soft：柔和（溫暖正弦微音，適合古典圖書館書寫感）
 *   - click：輕點擊（高通濾波短促羽筆／鍵擊聲）
 *   - 8bit：復古（方波輕擊音）
 */

import { audioBus } from './audio-bus.js';

export const STORAGE_KEY_TYPE_SOUND = 'claude_novel_type_sound_v1';

export const TYPE_SOUNDS = Object.freeze([
  Object.freeze({ id: 'off', name: '關閉' }),
  Object.freeze({ id: 'soft', name: '柔和' }),
  Object.freeze({ id: 'click', name: '輕點擊' }),
  Object.freeze({ id: '8bit', name: '8-bit' })
]);

export const DEFAULT_TYPE_SOUND_PREF = Object.freeze({
  id: 'off',
  volume: 0.35
});

export function loadTypeSoundPreference(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY_TYPE_SOUND);
    if (!raw) return { ...DEFAULT_TYPE_SOUND_PREF };
    const parsed = JSON.parse(raw);
    const id = TYPE_SOUNDS.some(s => s.id === parsed?.id) ? parsed.id : DEFAULT_TYPE_SOUND_PREF.id;
    const vol = Number(parsed?.volume);
    const volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : DEFAULT_TYPE_SOUND_PREF.volume;
    return { id, volume };
  } catch (_) {
    return { ...DEFAULT_TYPE_SOUND_PREF };
  }
}

export function saveTypeSoundPreference(pref, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const id = TYPE_SOUNDS.some(s => s.id === pref?.id) ? pref.id : DEFAULT_TYPE_SOUND_PREF.id;
  const vol = Number(pref?.volume);
  const volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : DEFAULT_TYPE_SOUND_PREF.volume;
  const next = { id, volume };
  try {
    if (storage) storage.setItem(STORAGE_KEY_TYPE_SOUND, JSON.stringify(next));
  } catch (_) {}
  return next;
}

/**
 * 以 Web Audio API 現場合成一聲短促跳字音（不需音訊檔）。
 */
function synthTypeSound(kind, volume, bus = audioBus) {
  const o = bus.shortOut('type');
  if (!o || volume <= 0) return false;
  const { ac, out } = o;
  if (ac.state === 'suspended') {
    if (!bus.mayWake(ac)) return false;
    Promise.resolve(ac.resume?.()).catch(() => undefined);
  }
  const t = ac.currentTime;
  const gain = ac.createGain();
  gain.connect(out);

  if (kind === 'click') {
    const noise = ac.createBuffer(1, 600, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
    }
    const src = ac.createBufferSource();
    src.buffer = noise;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    src.connect(hp);
    hp.connect(gain);
    gain.gain.value = volume * 0.8;
    src.start(t);
    return true;
  }

  const osc = ac.createOscillator();
  osc.type = kind === '8bit' ? 'square' : 'sine';
  osc.frequency.setValueAtTime(kind === '8bit' ? 880 : 740, t);
  osc.connect(gain);
  const peak = volume * (kind === '8bit' ? 0.12 : 0.35);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.start(t);
  osc.stop(t + 0.07);
  return true;
}

/**
 * 播放一次跳字音效；id 為 'off' 或無效時靜默略過。
 */
export function playTypeSound(id, volume = DEFAULT_TYPE_SOUND_PREF.volume, bus = audioBus) {
  if (!id || id === 'off') return false;
  const entry = TYPE_SOUNDS.find(x => x.id === id);
  if (!entry) return false;
  return synthTypeSound(entry.id, Math.max(0, Math.min(1, Number(volume) || 0)), bus);
}
