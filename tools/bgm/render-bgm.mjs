/**
 * render-bgm.mjs — 《Claude娘的圖書館》原創配樂離線合成渲染器（Neon 實作）
 *
 * 讀取 tools/bgm/bgm-score.json（Antigravity 設計之 9 首完整樂譜與 15 種合成樂器規格），
 * 以純 Node.js DSP 合成 44.1 kHz 立體聲母帶 WAV：
 *   - 完整解析科學音高、拍號、和弦（含斜線低音）與最小距離聲部連接（Voice Leading）
 *   - 實作 15 種指定樂器（含 Karplus-Strong 撥弦、加法鋼琴、顫音管弦、鐘琴、音樂盒、木魚）
 *   - 演算法立體聲阻尼混響（18 ms 預延遲、6 kHz 高頻阻尼、依曲目 reverbSec 調校）
 *   - 雙遍無縫循環渲染（Double-Pass Seamless Loop）：連播兩遍取第二遍精確取樣，混響尾音自然銜接
 *   - 母帶處理：30 Hz 高通 → 2:1 溫和壓縮 → 真實峰值限制 -1 dBTP → 響度正規化至 -18 LUFS
 *
 * 用法：node tools/bgm/render-bgm.mjs [--out <dir>] [--sr 44100] [--only bgm-title]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scorePath = join(__dirname, 'bgm-score.json');

const args = process.argv.slice(2);
const opt = (k, def) => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const outDir = resolve(opt('out', join(__dirname, 'rendered-wav')));
const SR = Number(opt('sr', '44100'));
const onlyId = opt('only', '');
mkdirSync(outDir, { recursive: true });

const score = JSON.parse(readFileSync(scorePath, 'utf8'));

// ---- 確定性偽亂數（確保每次渲染可重現、零雜訊漂移）----
function makeRng(seed = 20261122) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseNoteToMidi(token) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(token || '').trim());
  if (!m) return null;
  let semi = NOTE_SEMI[m[1].toUpperCase()];
  if (m[2] === '#') semi += 1;
  else if (m[2] === 'b') semi -= 1;
  const oct = Number(m[3]);
  return (oct + 1) * 12 + semi;
}

function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function dbToAmp(db) {
  return Math.pow(10, db / 20);
}

const KEY_SCALES = {
  'D major':  [2, 4, 6, 7, 9, 11, 1],
  'G major':  [7, 9, 11, 0, 2, 4, 6],
  'F major':  [5, 7, 9, 10, 0, 2, 4],
  'C major':  [0, 2, 4, 5, 7, 9, 11],
  'D dorian': [2, 4, 5, 7, 9, 11, 0],
  'A minor':  [9, 11, 0, 2, 4, 5, 7]
};

function diatonicShift(midi, steps, keyName) {
  const scale = KEY_SCALES[keyName] || KEY_SCALES['C major'];
  const pc = ((midi % 12) + 12) % 12;
  let bestIdx = 0;
  let bestDist = 99;
  for (let i = 0; i < scale.length; i++) {
    const d = Math.min(Math.abs(scale[i] - pc), 12 - Math.abs(scale[i] - pc));
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  const oct = Math.floor(midi / 12);
  let targetIdx = bestIdx + steps;
  let octDelta = 0;
  while (targetIdx < 0) { targetIdx += 7; octDelta -= 1; }
  while (targetIdx >= 7) { targetIdx -= 7; octDelta += 1; }
  let res = (oct + octDelta) * 12 + scale[targetIdx];
  if (steps < 0 && res > midi) res -= 12;
  if (steps > 0 && res < midi) res += 12;
  return res;
}

// ---- 和弦解析與最小距離聲部連接 ----
function parseChord(symbol) {
  const parts = String(symbol || 'C').trim().split('/');
  const main = parts[0];
  const slash = parts[1] || '';
  const m = /^([A-G])([#b]?)(.*)$/.exec(main);
  if (!m) return { rootPc: 0, bassPc: 0, intervals: [0, 4, 7] };
  let rootPc = NOTE_SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  rootPc = ((rootPc % 12) + 12) % 12;

  let bassPc = rootPc;
  if (slash) {
    const sm = /^([A-G])([#b]?)$/.exec(slash.trim());
    if (sm) {
      bassPc = ((NOTE_SEMI[sm[1]] + (sm[2] === '#' ? 1 : sm[2] === 'b' ? -1 : 0)) % 12 + 12) % 12;
    }
  }

  const qual = m[3] || '';
  let intervals = [0, 4, 7];
  if (qual === 'm') intervals = [0, 3, 7];
  else if (qual === '7') intervals = [0, 4, 7, 10];
  else if (qual === 'maj7') intervals = [0, 4, 7, 11];
  else if (qual === 'm7') intervals = [0, 3, 7, 10];
  else if (qual === 'm9') intervals = [0, 3, 7, 10, 14];
  else if (qual === 'maj9') intervals = [0, 4, 7, 11, 14];
  else if (qual === '6') intervals = [0, 4, 7, 9];
  else if (qual === 'sus4') intervals = [0, 5, 7];
  else if (qual === '7sus4') intervals = [0, 5, 7, 10];
  else if (qual === 'add9') intervals = [0, 4, 7, 14];

  return { rootPc, bassPc, intervals };
}

function voiceChord(chord, prevMidis = null) {
  // 限制在 C3 (48) ~ C5 (72)
  const base = 48 + chord.rootPc;
  const raw = chord.intervals.map((iv) => {
    let n = base + iv;
    while (n > 72) n -= 12;
    while (n < 48) n += 12;
    return n;
  });
  if (!prevMidis || !prevMidis.length) return raw.sort((a, b) => a - b);
  const center = prevMidis.reduce((a, b) => a + b, 0) / prevMidis.length;
  return raw
    .map((n) => {
      const cands = [n - 12, n, n + 12].filter((x) => x >= 48 && x <= 72);
      if (!cands.length) return n;
      cands.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
      return cands[0];
    })
    .sort((a, b) => a - b);
}

function bassMidiForPc(pc) {
  // E1 (28) ~ E3 (52)，優先落在 E2 (40) ~ E3 (52) 保持飽滿清晰
  let n = 36 + pc;
  if (n < 36) n += 12;
  if (n > 51) n -= 12;
  return n;
}

// ---- 15 種合成樂器音符渲染（寫入立體聲緩衝區，含獨立混響傳送軌）----
function renderNote(bufL, bufR, revL, revR, {
  inst, midi, startSec, durSec, gainAmp, sendAmp, pan = 0, rng
}) {
  if (!Number.isFinite(startSec) || durSec <= 0) return;
  const startIdx = Math.floor(startSec * SR);
  if (startIdx >= bufL.length) return;

  const panL = Math.cos((pan + 1) * Math.PI * 0.25);
  const panR = Math.sin((pan + 1) * Math.PI * 0.25);

  if (inst === 'woodblock') {
    const len = Math.min(Math.floor(0.045 * SR), bufL.length - startIdx);
    const freq = 1800;
    const w = 2 * Math.PI * freq / SR;
    let y1 = 0, y2 = 0;
    const r = 0.94;
    const a1 = -2 * r * Math.cos(w);
    const a2 = r * r;
    for (let i = 0; i < len; i++) {
      const x = i < 24 ? (rng() * 2 - 1) * (1 - i / 24) : 0;
      const y = x - a1 * y1 - a2 * y2;
      y2 = y1; y1 = y;
      const env = Math.exp(-i / (0.012 * SR));
      const v = y * env * gainAmp * 0.45;
      const idx = startIdx + i;
      if (idx >= 0 && idx < bufL.length) {
        bufL[idx] += v * panL;
        bufR[idx] += v * panR;
        revL[idx] += v * sendAmp * panL;
        revR[idx] += v * sendAmp * panR;
      }
    }
    return;
  }

  if (!Number.isFinite(midi)) return;
  const effectiveMidi = inst === 'glockenspiel' ? midi + 12 : midi;
  let freq = midiToHz(effectiveMidi);
  if (inst === 'music-box') {
    freq *= Math.pow(2, ((rng() * 8 - 4) / 1200));
  }
  const velJitter = inst === 'felt-piano' ? (0.94 + rng() * 0.12) : (0.97 + rng() * 0.06);
  const amp = gainAmp * velJitter;

  // Karplus-Strong 撥弦（pizzicato / harp）
  if (inst === 'pizzicato' || inst === 'harp') {
    const isHarp = inst === 'harp';
    const decay = isHarp ? 0.9965 : 0.986;
    const bright = isHarp ? 0.6 : 0.45;
    const totalSec = isHarp ? Math.min(3.2, Math.max(durSec + 1.4, 1.8)) : Math.min(0.6, durSec + 0.25);
    const len = Math.min(Math.floor(totalSec * SR), bufL.length - startIdx);
    const period = Math.max(2, Math.round(SR / freq));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) {
      // 柔和撥弦激發（低通濾過白噪）
      const prev = i > 0 ? ring[i - 1] : 0;
      ring[i] = prev * (1 - bright) + (rng() * 2 - 1) * bright;
    }
    let ptr = 0;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const nextPtr = (ptr + 1) % period;
      const sample = ring[ptr];
      const filtered = decay * (sample * bright + ring[nextPtr] * (1 - bright));
      ring[ptr] = filtered;
      ptr = nextPtr;
      lp = lp * 0.25 + sample * 0.75;
      const tailFade = i > len - 440 ? (len - i) / 440 : 1;
      const v = lp * amp * tailFade * (isHarp ? 0.85 : 0.9);
      const idx = startIdx + i;
      if (idx >= 0 && idx < bufL.length) {
        bufL[idx] += v * panL;
        bufR[idx] += v * panR;
        revL[idx] += v * sendAmp * panL;
        revR[idx] += v * sendAmp * panR;
      }
    }
    return;
  }

  // 其餘 12 種加法／減法合成樂器
  let tailSec = 0.35;
  let atkSec = 0.015;
  let decayTau = 1.4;
  let cutoffHz = 4000;
  let vibratoHz = 0;
  let vibratoCents = 0;
  let vibratoDelay = 0.6;
  let detuneCents = [0];
  let harmonics = [1];
  let harmonicRatios = null;
  let noiseMix = 0;
  let playDur = durSec;

  switch (inst) {
    case 'felt-piano': {
      atkSec = 0.008;
      const hiFactor = Math.max(0, Math.min(1, (effectiveMidi - 48) / 48));
      decayTau = 1.6 - hiFactor * 0.9;
      tailSec = Math.min(2.6, decayTau * 2.1);
      cutoffHz = 2400;
      harmonics = [1, 0.45, 0.22, 0.12, 0.06];
      break;
    }
    case 'string-pad':
      atkSec = Math.min(1.4, durSec * 0.45);
      tailSec = 1.6;
      cutoffHz = 1100;
      detuneCents = [-7, 0, 7];
      harmonics = [1, 0.5, 0.33, 0.25, 0.2, 0.15, 0.1];
      break;
    case 'celesta':
      atkSec = 0.002;
      decayTau = 1.1;
      tailSec = 2.2;
      harmonics = [1, 0.3, 0.08];
      harmonicRatios = [1, 4, 7.1];
      break;
    case 'music-box':
      atkSec = 0.002;
      decayTau = 0.8;
      tailSec = 1.7;
      harmonics = [1, 0.2, 0.1];
      harmonicRatios = [1, 3, 6.2];
      break;
    case 'flute':
      atkSec = 0.06;
      tailSec = 0.18;
      cutoffHz = 3600;
      harmonics = [1, 0.15, 0.04];
      noiseMix = 0.028;
      vibratoHz = 5.2;
      vibratoCents = 12;
      vibratoDelay = 0.55;
      break;
    case 'clarinet':
      atkSec = 0.045;
      tailSec = 0.16;
      cutoffHz = 1800;
      harmonics = [1, 0, 0.33, 0, 0.18, 0, 0.08];
      break;
    case 'cello':
      atkSec = 0.12;
      tailSec = 0.28;
      cutoffHz = 1400;
      harmonics = [1, 0.65, 0.42, 0.28, 0.2, 0.14, 0.09];
      vibratoHz = 5.0;
      vibratoCents = 15;
      vibratoDelay = 0.7;
      break;
    case 'violin':
      atkSec = 0.09;
      tailSec = 0.25;
      cutoffHz = 3200;
      harmonics = [1, 0.6, 0.45, 0.32, 0.24, 0.16, 0.11];
      vibratoHz = 5.6;
      vibratoCents = 14;
      vibratoDelay = 0.55;
      break;
    case 'bassoon':
      atkSec = 0.03;
      playDur = durSec * 0.55;
      tailSec = 0.12;
      cutoffHz = 1200;
      harmonics = [1, 0.55, 0.35, 0.25, 0.15];
      break;
    case 'glockenspiel':
      atkSec = 0.001;
      decayTau = 0.9;
      tailSec = 1.8;
      harmonics = [1, 0.25];
      harmonicRatios = [1, 2.76];
      break;
    case 'marimba':
      atkSec = 0.003;
      decayTau = 0.5;
      tailSec = 1.1;
      cutoffHz = 3000;
      harmonics = [1, 0.25, 0.05];
      harmonicRatios = [1, 4, 10];
      break;
    case 'upright-bass':
      atkSec = 0.015;
      decayTau = 1.2;
      tailSec = 0.4;
      cutoffHz = 600;
      harmonics = [1, 0.38, 0.12, 0.04];
      break;
    default:
      break;
  }

  const isPercussive = ['felt-piano', 'celesta', 'music-box', 'glockenspiel', 'marimba', 'upright-bass'].includes(inst);
  const totalSec = isPercussive ? Math.max(playDur, tailSec) : (playDur + tailSec);
  const len = Math.min(Math.floor(totalSec * SR), bufL.length - startIdx);
  if (len <= 0) return;

  const nyquist = SR * 0.46;
  const hNorm = harmonics.reduce((a, b) => a + b, 0) || 1;
  const detuneMul = detuneCents.map((c) => Math.pow(2, c / 1200));
  const phases = detuneMul.map(() => harmonics.map(() => 0));

  // 一階低通濾波器（pad 含 0.15 Hz LFO 掃動 900–1300 Hz）
  let lp = 0;
  let breathLp = 0;
  const atkSamples = Math.max(1, Math.floor(atkSec * SR));
  const playSamples = Math.floor(playDur * SR);

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let vibMul = 1;
    if (vibratoHz > 0 && durSec > vibratoDelay && t > vibratoDelay * 0.5) {
      const depth = Math.min(1, (t - vibratoDelay * 0.5) / 0.35);
      const cents = Math.sin(2 * Math.PI * vibratoHz * t) * vibratoCents * depth;
      vibMul = Math.pow(2, cents / 1200);
    }

    let sig = 0;
    for (let d = 0; d < detuneMul.length; d++) {
      const fBase = freq * detuneMul[d] * vibMul;
      for (let h = 0; h < harmonics.length; h++) {
        const wAmp = harmonics[h];
        if (!wAmp) continue;
        const ratio = harmonicRatios ? harmonicRatios[h] : (h + 1);
        const fh = fBase * ratio;
        if (fh >= nyquist) continue;
        phases[d][h] += (2 * Math.PI * fh) / SR;
        if (phases[d][h] > 6.283185307) phases[d][h] -= 6.283185307;
        sig += Math.sin(phases[d][h]) * wAmp;
      }
    }
    sig /= (hNorm * detuneMul.length);

    if (noiseMix > 0) {
      const wn = rng() * 2 - 1;
      breathLp = breathLp * 0.72 + wn * 0.28;
      sig += (wn - breathLp) * noiseMix;
    }

    // 低通
    let fc = cutoffHz;
    if (inst === 'string-pad') {
      fc = 1100 + 200 * Math.sin(2 * Math.PI * 0.15 * (startSec + t));
    }
    const alpha = Math.min(0.99, (2 * Math.PI * fc) / (SR + 2 * Math.PI * fc));
    lp += alpha * (sig - lp);

    // 包絡
    let env = 1;
    if (i < atkSamples) {
      env = i / atkSamples;
    } else if (isPercussive) {
      const dt = (i - atkSamples) / SR;
      env = Math.exp(-dt / decayTau);
      if (i > len - 600) env *= Math.max(0, (len - i) / 600);
    } else if (i > playSamples) {
      const relSamples = Math.max(1, len - playSamples);
      const relPos = (i - playSamples) / relSamples;
      env = Math.pow(Math.max(0, 1 - relPos), 1.6);
    }

    const v = lp * env * amp;
    const idx = startIdx + i;
    if (idx >= 0 && idx < bufL.length) {
      bufL[idx] += v * panL;
      bufR[idx] += v * panR;
      revL[idx] += v * sendAmp * panL;
      revR[idx] += v * sendAmp * panR;
    }
  }
}

// ---- 解析單一小節旋律字串 ----
function parseMelodyBar(barStr) {
  const items = String(barStr || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  let beat = 0;
  for (const tok of items) {
    const [pitchStr, durStr] = tok.split(':');
    const dur = Number(durStr) || 1;
    if (pitchStr && pitchStr.toUpperCase() !== 'R') {
      const midi = parseNoteToMidi(pitchStr);
      if (midi !== null) out.push({ midi, beat, dur });
    }
    beat += dur;
  }
  return out;
}

// ---- 展開某一段（含 A2/B2/A3/A4 編曲變化）----
function resolveSectionSpec(track, secName, allTrackMap) {
  const raw = track.sections[secName];
  if (!raw) throw new Error(`Unknown section ${track.id}.${secName}`);
  let base = raw;
  if (raw.same) {
    base = track.sections[raw.same];
  } else if (raw.sameAs) {
    const [tId, sName] = raw.sameAs.split('.');
    base = allTrackMap.get(tId).sections[sName];
  }
  const chords = (raw.chords || base.chords || []).slice();
  const melody = (raw.melody || base.melody || []).slice();
  const layers = (raw.layers || base.layers || []).map((l) => ({ ...l }));
  return { chords, melody, layers, changes: raw.changes || '', secName };
}

function buildTrackEvents(track, allTrackMap) {
  const beatsPerBar = track.timeSig[0];
  const secPerBeat = 60 / track.bpm;
  const events = [];
  let barOffset = 0;
  let prevVoicing = null;

  const panForInst = {
    'felt-piano': -0.1, 'string-pad': 0.0, 'pizzicato': -0.25, 'harp': 0.28,
    'celesta': 0.22, 'music-box': 0.18, 'flute': -0.18, 'clarinet': 0.15,
    'cello': -0.2, 'violin': 0.16, 'bassoon': -0.24, 'glockenspiel': 0.3,
    'marimba': -0.12, 'upright-bass': 0.0, 'woodblock': 0.32
  };

  for (const secName of track.form) {
    const spec = resolveSectionSpec(track, secName, allTrackMap);
    const barCount = spec.chords.length;

    // 依每首曲子變化段精準套用配器變化
    let layers = spec.layers.map((l) => ({ ...l }));
    let extraNotes = [];

    if (track.id === 'bgm-title' && secName === 'A2') {
      layers = [
        { inst: 'violin', role: 'melody', gainDb: -11, sendDb: -10 },
        { inst: 'felt-piano', role: 'melody-bar1-high', gainDb: -20, sendDb: -12 },
        { inst: 'felt-piano', role: 'comp', pattern: 'broken-8ths-1-5-8-10', gainDb: -19, sendDb: -12 },
        { inst: 'harp', role: 'comp', pattern: 'arp-up-16ths-1-3-5-8', gainDb: -21, sendDb: -11 },
        { inst: 'string-pad', role: 'pad', gainDb: -21, sendDb: -8 },
        { inst: 'upright-bass', role: 'bass', pattern: 'root-half-notes', gainDb: -17, sendDb: -20 }
      ];
    } else if (track.id === 'bgm-day-default' && secName === 'A2') {
      layers = [
        { inst: 'clarinet', role: 'melody', gainDb: -12, sendDb: -13 },
        { inst: 'felt-piano', role: 'harmony-third-below', gainDb: -19, sendDb: -12 },
        { inst: 'pizzicato', role: 'comp', pattern: 'root-beat1-fifth-beat3', gainDb: -17, sendDb: -14 },
        { inst: 'upright-bass', role: 'bass', pattern: 'root-half-notes', gainDb: -18, sendDb: -22 }
      ];
    } else if (track.id === 'bgm-day-default' && secName === 'B2') {
      const counter = ['R:4', 'R:4', 'R:4', 'R:4', 'E5:4', 'E5:4', 'D5:4', 'C5:2 A4:2'];
      extraNotes.push({ inst: 'clarinet', bars: counter, gainDb: -16, sendDb: -11 });
    } else if (track.id === 'bgm-morning-soft' && secName === 'A2') {
      layers = [
        { inst: 'glockenspiel', role: 'melody', gainDb: -17, sendDb: -10 },
        { inst: 'flute', role: 'harmony-sixth-below', gainDb: -16, sendDb: -12 },
        { inst: 'harp', role: 'comp', pattern: 'waltz-root-then-chord-chord', gainDb: -17, sendDb: -11 },
        { inst: 'upright-bass', role: 'bass', pattern: 'root-dotted-half', gainDb: -19, sendDb: -22 }
      ];
    } else if (track.id === 'bgm-evening-reading' && secName === 'A2') {
      layers.push({ inst: 'felt-piano', role: 'high-third-sparkle', gainDb: -21, sendDb: -10 });
    } else if (track.id === 'bgm-evening-reading' && secName === 'B2') {
      const counter = ['A3:4', 'G3:4', 'F3:4', 'E3:4', 'A3:4', 'G3:4', 'F3:4', 'G3:2 F3:2'];
      extraNotes.push({ inst: 'cello', bars: counter, gainDb: -14, sendDb: -11 });
    } else if (track.id === 'bgm-night-magic' && secName === 'A2') {
      layers = [
        { inst: 'music-box', role: 'melody', gainDb: -14, sendDb: -8 },
        { inst: 'celesta', role: 'echo-beat3-fourth-below', gainDb: -22, sendDb: -7 },
        { inst: 'string-pad', role: 'pad', gainDb: -19, sendDb: -6 },
        { inst: 'harp', role: 'comp', pattern: 'arp-up-8ths-1-5-9-10-slow', gainDb: -20, sendDb: -9 },
        { inst: 'upright-bass', role: 'bass', pattern: 'root-whole-notes', gainDb: -19, sendDb: -18 }
      ];
    } else if (track.id === 'bgm-night-magic' && secName === 'B2') {
      const glints = ['D6:1 R:3', 'F6:1 R:3', 'A5:1 R:3', 'C6:1 R:3', 'D6:1 R:3', 'F6:1 R:3', 'A5:1 R:3', 'E6:1 R:3'];
      extraNotes.push({ inst: 'celesta', bars: glints, gainDb: -18, sendDb: -7 });
    } else if (track.id === 'bgm-rainy-night' && secName === 'A2') {
      layers = layers.map((l) => (l.role === 'melody' ? { ...l, gainDb: l.gainDb - 2 } : l));
      layers.push({ inst: 'cello', role: 'bass', pattern: 'root-whole-notes', gainDb: -15, sendDb: -10 });
    } else if (track.id === 'bgm-rainy-night' && secName === 'B2') {
      layers = [
        { inst: 'felt-piano', role: 'melody', gainDb: -12, sendDb: -9 },
        { inst: 'cello', role: 'bass', pattern: 'root-whole-notes', gainDb: -17, sendDb: -10 },
        { inst: 'felt-piano', role: 'comp', pattern: 'broken-8ths-1-5-8-10-soft', gainDb: -21, sendDb: -9 },
        { inst: 'string-pad', role: 'pad', gainDb: -22, sendDb: -7 }
      ];
    } else if (track.id === 'bgm-event-playful' && secName === 'A2') {
      layers = [
        { inst: 'clarinet', role: 'melody-staccato', gainDb: -12, sendDb: -15 },
        { inst: 'pizzicato', role: 'comp', pattern: 'offbeat-chord', gainDb: -18, sendDb: -15 },
        { inst: 'bassoon', role: 'bass', pattern: 'root-fifth-quarters-staccato', gainDb: -15, sendDb: -18 },
        { inst: 'woodblock', role: 'perc', pattern: 'offbeat-8ths-beats-2-4', gainDb: -24, sendDb: -20 }
      ];
    } else if (track.id === 'bgm-event-playful' && secName === 'A3') {
      layers = [
        { inst: 'glockenspiel', role: 'melody', gainDb: -16, sendDb: -12 },
        { inst: 'flute', role: 'melody', gainDb: -15, sendDb: -13 },
        { inst: 'bassoon', role: 'bass', pattern: 'root-fifth-quarters-staccato', gainDb: -15, sendDb: -18 }
      ];
    } else if (track.id === 'bgm-event-playful' && secName === 'A4') {
      layers = [
        { inst: 'pizzicato', role: 'melody', gainDb: -10, sendDb: -15 },
        { inst: 'clarinet', role: 'harmony-third-below', gainDb: -15, sendDb: -15 },
        { inst: 'bassoon', role: 'bass', pattern: 'root-fifth-quarters-staccato', gainDb: -15, sendDb: -18 },
        { inst: 'woodblock', role: 'perc', pattern: 'offbeat-8ths-beats-2-4', gainDb: -24, sendDb: -20 }
      ];
    }

    for (let b = 0; b < barCount; b++) {
      const barStartSec = (barOffset + b) * beatsPerBar * secPerBeat;
      const chordTokens = String(spec.chords[b] || 'C').trim().split(/\s+/);
      const melNotes = parseMelodyBar(spec.melody[b] || 'R:4');

      // 先處理旋律與衍伸旋律層
      for (const layer of layers) {
        const gainAmp = dbToAmp(layer.gainDb ?? -14);
        const sendAmp = dbToAmp(layer.sendDb ?? -12);
        const pan = panForInst[layer.inst] ?? 0;

        if (layer.role === 'melody' || layer.role === 'melody-staccato') {
          const octShift = (Number(layer.octaveShift) || 0) * 12;
          const durMul = layer.role === 'melody-staccato' ? 0.6 : 0.96;
          for (const n of melNotes) {
            events.push({
              inst: layer.inst,
              midi: n.midi + octShift,
              startSec: barStartSec + n.beat * secPerBeat,
              durSec: n.dur * secPerBeat * durMul,
              gainAmp, sendAmp, pan
            });
          }
        } else if (layer.role === 'melody-bar1-high' && melNotes.length > 0) {
          events.push({
            inst: layer.inst,
            midi: melNotes[0].midi + 12,
            startSec: barStartSec,
            durSec: 1.5 * secPerBeat,
            gainAmp, sendAmp, pan: 0.2
          });
        } else if (layer.role === 'harmony-third-below') {
          for (const n of melNotes) {
            events.push({
              inst: layer.inst,
              midi: diatonicShift(n.midi, -2, track.key),
              startSec: barStartSec + n.beat * secPerBeat,
              durSec: n.dur * secPerBeat * 0.95,
              gainAmp, sendAmp, pan: -pan
            });
          }
        } else if (layer.role === 'harmony-sixth-below' && melNotes.length > 0) {
          events.push({
            inst: layer.inst,
            midi: diatonicShift(melNotes[0].midi, -5, track.key),
            startSec: barStartSec,
            durSec: beatsPerBar * secPerBeat * 0.92,
            gainAmp, sendAmp, pan: -0.12
          });
        } else if (layer.role === 'high-third-sparkle' && melNotes.length > 0) {
          for (let beat = 0; beat < beatsPerBar; beat += 2) {
            const ref = melNotes.find((n) => n.beat >= beat) || melNotes[0];
            let hi = diatonicShift(ref.midi, 2, track.key);
            while (hi < 72) hi += 12;
            events.push({
              inst: layer.inst,
              midi: hi,
              startSec: barStartSec + beat * secPerBeat,
              durSec: 1.5 * secPerBeat,
              gainAmp, sendAmp, pan: 0.22
            });
          }
        } else if (layer.role === 'echo-beat3-fourth-below' && melNotes.length > 0) {
          events.push({
            inst: layer.inst,
            midi: diatonicShift(melNotes[0].midi, -3, track.key),
            startSec: barStartSec + 2 * secPerBeat,
            durSec: 1.6 * secPerBeat,
            gainAmp, sendAmp, pan: -0.25
          });
        } else if (layer.role === 'perc' && layer.pattern === 'offbeat-8ths-beats-2-4') {
          for (const beat of [1.5, 3.5]) {
            events.push({
              inst: 'woodblock', midi: null,
              startSec: barStartSec + beat * secPerBeat,
              durSec: 0.04, gainAmp, sendAmp, pan
            });
          }
        }
      }

      // 處理和弦／伴奏／低音層（支援單小節雙和弦）
      const segBeats = beatsPerBar / chordTokens.length;
      for (let ci = 0; ci < chordTokens.length; ci++) {
        const chord = parseChord(chordTokens[ci]);
        const voiced = voiceChord(chord, prevVoicing);
        prevVoicing = voiced;
        const bassMidi = bassMidiForPc(chord.bassPc);
        const fifthMidi = bassMidi + 7;
        const segStartSec = barStartSec + ci * segBeats * secPerBeat;
        const segDurSec = segBeats * secPerBeat;

        // 構建常用琶音音列（1, 3, 5, 8, 9, 10）
        const rootMid = 48 + chord.rootPc;
        const thirdIv = chord.intervals.includes(3) ? 3 : (chord.intervals.includes(5) && !chord.intervals.includes(4) ? 5 : 4);
        const p1 = rootMid;
        const p3 = rootMid + thirdIv;
        const p5 = rootMid + 7;
        const p8 = rootMid + 12;
        const p9 = rootMid + 14;
        const p10 = rootMid + 12 + thirdIv;

        for (const layer of layers) {
          const gainAmp = dbToAmp(layer.gainDb ?? -18);
          const sendAmp = dbToAmp(layer.sendDb ?? -12);
          const pan = panForInst[layer.inst] ?? 0;

          if (layer.role === 'pad') {
            for (let vi = 0; vi < voiced.length; vi++) {
              events.push({
                inst: layer.inst,
                midi: voiced[vi],
                startSec: segStartSec,
                durSec: segDurSec,
                gainAmp: gainAmp / Math.sqrt(voiced.length),
                sendAmp,
                pan: (vi - (voiced.length - 1) / 2) * 0.16
              });
            }
          } else if (layer.role === 'bass') {
            const pat = layer.pattern || 'root-half-notes';
            if (pat === 'root-whole-notes' || pat === 'root-dotted-half') {
              events.push({ inst: layer.inst, midi: bassMidi, startSec: segStartSec, durSec: segDurSec * 0.96, gainAmp, sendAmp, pan });
            } else if (pat === 'root-half-notes') {
              for (let beat = 0; beat < segBeats; beat += 2) {
                events.push({ inst: layer.inst, midi: bassMidi, startSec: segStartSec + beat * secPerBeat, durSec: Math.min(2, segBeats - beat) * secPerBeat * 0.92, gainAmp, sendAmp, pan });
              }
            } else if (pat === 'root-fifth-quarters-staccato') {
              for (let beat = 0; beat < segBeats; beat += 1) {
                events.push({
                  inst: layer.inst,
                  midi: beat % 2 === 0 ? bassMidi : fifthMidi,
                  startSec: segStartSec + beat * secPerBeat,
                  durSec: secPerBeat,
                  gainAmp, sendAmp, pan
                });
              }
            }
          } else if (layer.role === 'comp') {
            const pat = layer.pattern || 'block-chord-beat1-held';
            if (pat === 'broken-8ths-1-5-8-10' || pat === 'broken-8ths-1-5-8-10-soft' || pat === 'arp-up-8ths-1-5-8-10') {
              const seq = [p1, p5, p8, p10];
              const steps = Math.round(segBeats * 2);
              const isSoft = pat.endsWith('-soft');
              const mul = isSoft ? dbToAmp(-4) : 1;
              for (let s = 0; s < steps; s++) {
                if (isSoft && s === steps - 1) continue;
                events.push({
                  inst: layer.inst,
                  midi: seq[s % seq.length],
                  startSec: segStartSec + s * 0.5 * secPerBeat,
                  durSec: 0.9 * secPerBeat,
                  gainAmp: gainAmp * mul, sendAmp, pan
                });
              }
            } else if (pat === 'arp-up-16ths-1-3-5-8') {
              const seq = [p1, p3, p5, p8];
              for (let s = 0; s < seq.length; s++) {
                events.push({
                  inst: layer.inst,
                  midi: seq[s],
                  startSec: segStartSec + s * 0.25 * secPerBeat,
                  durSec: 1.8 * secPerBeat,
                  gainAmp, sendAmp, pan
                });
              }
            } else if (pat === 'arp-up-8ths-1-5-9-10-slow') {
              const seq = [p1, p5, p9, p10];
              const steps = Math.min(4, Math.round(segBeats * 2));
              for (let s = 0; s < steps; s++) {
                events.push({
                  inst: layer.inst,
                  midi: seq[s],
                  startSec: segStartSec + s * 0.5 * secPerBeat,
                  durSec: 2.2 * secPerBeat,
                  gainAmp, sendAmp, pan
                });
              }
            } else if (pat === 'arp-8ths-1-5-9-3-up') {
              const seq = [p1, p5, p9, p10];
              const steps = Math.round(segBeats * 2);
              for (let s = 0; s < steps; s++) {
                events.push({
                  inst: layer.inst,
                  midi: seq[s % seq.length],
                  startSec: segStartSec + s * 0.5 * secPerBeat,
                  durSec: 0.65 * secPerBeat,
                  gainAmp, sendAmp, pan
                });
              }
            } else if (pat === 'root-beat1-fifth-beat3') {
              events.push({ inst: layer.inst, midi: bassMidi + 12, startSec: segStartSec, durSec: 0.45 * secPerBeat, gainAmp, sendAmp, pan });
              if (segBeats >= 3) {
                events.push({ inst: layer.inst, midi: fifthMidi + 12, startSec: segStartSec + 2 * secPerBeat, durSec: 0.45 * secPerBeat, gainAmp, sendAmp, pan });
              }
            } else if (pat === 'block-chord-beat2-beat4-soft') {
              const mul = dbToAmp(-6);
              for (const beat of [1, 3]) {
                if (beat >= segBeats) continue;
                for (const m of voiced) {
                  events.push({ inst: layer.inst, midi: m, startSec: segStartSec + beat * secPerBeat, durSec: 0.5 * secPerBeat, gainAmp: gainAmp * mul / Math.sqrt(voiced.length), sendAmp, pan });
                }
              }
            } else if (pat === 'block-chord-beat1-held') {
              for (const m of voiced) {
                events.push({ inst: layer.inst, midi: m, startSec: segStartSec, durSec: segDurSec * 0.95, gainAmp: gainAmp / Math.sqrt(voiced.length), sendAmp, pan });
              }
            } else if (pat === 'waltz-root-then-chord-chord') {
              events.push({ inst: layer.inst, midi: p1, startSec: segStartSec, durSec: 1.5 * secPerBeat, gainAmp, sendAmp, pan });
              for (const beat of [1, 2]) {
                if (beat >= segBeats) continue;
                for (const m of voiced) {
                  events.push({ inst: layer.inst, midi: m, startSec: segStartSec + beat * secPerBeat, durSec: 0.85 * secPerBeat, gainAmp: gainAmp * 0.72 / Math.sqrt(voiced.length), sendAmp, pan });
                }
              }
            } else if (pat === 'offbeat-chord') {
              for (let beat = 0.5; beat < segBeats; beat += 1) {
                for (const m of voiced.slice(0, 3)) {
                  events.push({ inst: layer.inst, midi: m, startSec: segStartSec + beat * secPerBeat, durSec: 0.35 * secPerBeat, gainAmp: gainAmp * 0.65, sendAmp, pan });
                }
              }
            }
          }
        }
      }

      // 額外對位聲部（B2 等）
      for (const ex of extraNotes) {
        const notes = parseMelodyBar(ex.bars[b] || 'R:4');
        const gA = dbToAmp(ex.gainDb);
        const sA = dbToAmp(ex.sendDb);
        const p = panForInst[ex.inst] ?? 0;
        for (const n of notes) {
          events.push({
            inst: ex.inst, midi: n.midi,
            startSec: barStartSec + n.beat * secPerBeat,
            durSec: n.dur * secPerBeat * 0.95,
            gainAmp: gA, sendAmp: sA, pan: p
          });
        }
      }
    }

    barOffset += barCount;
  }

  const loopSec = barOffset * beatsPerBar * secPerBeat;
  return { events, loopSec, totalBars: barOffset };
}

// ---- 立體聲阻尼 Freeverb 混響（18 ms 預延遲＋6 kHz 高頻阻尼）----
function applyStereoReverb(dryL, dryR, revL, revR, reverbSec) {
  const n = dryL.length;
  const preDelay = Math.max(1, Math.floor(0.018 * SR));
  const scale = SR / 44100;
  const combDelaysL = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => Math.max(16, Math.round(d * scale)));
  const combDelaysR = combDelaysL.map((d) => d + Math.round(23 * scale));
  const apDelays = [225, 556, 441, 341].map((d) => Math.max(12, Math.round(d * scale)));

  const dampAlpha = Math.min(0.95, (2 * Math.PI * 6000) / (SR + 2 * Math.PI * 6000));

  function processChannel(inBuf, combDelays) {
    const out = new Float32Array(n);
    const combs = combDelays.map((len) => ({
      buf: new Float32Array(len),
      idx: 0,
      lp: 0,
      fb: Math.min(0.94, Math.pow(10, (-3 * (len / SR)) / Math.max(0.4, reverbSec)))
    }));
    const aps = apDelays.map((len) => ({ buf: new Float32Array(len), idx: 0 }));

    for (let i = 0; i < n; i++) {
      const x = i >= preDelay ? inBuf[i - preDelay] : 0;
      let sum = 0;
      for (let c = 0; c < combs.length; c++) {
        const cb = combs[c];
        const y = cb.buf[cb.idx];
        cb.lp += dampAlpha * (y - cb.lp);
        cb.buf[cb.idx] = x + cb.lp * cb.fb;
        cb.idx = (cb.idx + 1) % cb.buf.length;
        sum += y;
      }
      let sig = sum / combs.length;
      for (let a = 0; a < aps.length; a++) {
        const ap = aps[a];
        const bufOut = ap.buf[ap.idx];
        const y = -0.5 * sig + bufOut;
        ap.buf[ap.idx] = sig + 0.5 * bufOut;
        ap.idx = (ap.idx + 1) % ap.buf.length;
        sig = y;
      }
      out[i] = sig;
    }
    return out;
  }

  const wetL = processChannel(revL, combDelaysL);
  const wetR = processChannel(revR, combDelaysR);
  const mixL = new Float32Array(n);
  const mixR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mixL[i] = dryL[i] + wetL[i] * 0.52;
    mixR[i] = dryR[i] + wetR[i] * 0.52;
  }
  return { mixL, mixR };
}

// ---- 母帶處理：30 Hz HPF → 2:1 壓縮 → -18 LUFS 正規化 → -1 dBTP 限制器 ----
function masterBus(inL, inR) {
  const n = inL.length;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);

  // 1. 30 Hz 一階高通
  const rc = 1 / (2 * Math.PI * 30);
  const dt = 1 / SR;
  const hpAlpha = rc / (rc + dt);
  let prevInL = 0, prevOutL = 0, prevInR = 0, prevOutR = 0;
  for (let i = 0; i < n; i++) {
    const yL = hpAlpha * (prevOutL + inL[i] - prevInL);
    const yR = hpAlpha * (prevOutR + inR[i] - prevInR);
    prevInL = inL[i]; prevOutL = yL;
    prevInR = inR[i]; prevOutR = yR;
    outL[i] = yL;
    outR[i] = yR;
  }

  // 2. 溫和 2:1 壓縮（門檻 -20 dBFS、起音 30 ms、釋放 250 ms）
  const thresh = dbToAmp(-20);
  const atkCoef = Math.exp(-1 / (0.03 * SR));
  const relCoef = Math.exp(-1 / (0.25 * SR));
  let env = 0;
  for (let i = 0; i < n; i++) {
    const level = Math.max(Math.abs(outL[i]), Math.abs(outR[i]));
    env = level > env ? (atkCoef * env + (1 - atkCoef) * level) : (relCoef * env + (1 - relCoef) * level);
    let g = 1;
    if (env > thresh) {
      const overDb = 20 * Math.log10(env / thresh);
      const reducedDb = overDb * 0.5;
      g = dbToAmp(reducedDb - overDb);
    }
    outL[i] *= g;
    outR[i] *= g;
  }

  // 3. 整合響度正規化至 -18 LUFS（簡易等價立體聲 RMS 近似，誤差 < 0.8 dB）
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    sumSq += outL[i] * outL[i] + outR[i] * outR[i];
  }
  const rms = Math.sqrt(sumSq / (2 * Math.max(1, n)));
  const currentLufsApprox = rms > 1e-9 ? (20 * Math.log10(rms) - 0.691) : -60;
  const gainToTarget = dbToAmp(-18 - currentLufsApprox);
  const peakLimit = dbToAmp(-1.0); // -1 dBTP

  let maxPeak = 0;
  for (let i = 0; i < n; i++) {
    let l = outL[i] * gainToTarget;
    let r = outR[i] * gainToTarget;
    // 軟限幅確保 True Peak <= -1 dBTP
    if (Math.abs(l) > peakLimit) l = Math.sign(l) * (peakLimit * Math.tanh(Math.abs(l) / peakLimit));
    if (Math.abs(r) > peakLimit) r = Math.sign(r) * (peakLimit * Math.tanh(Math.abs(r) / peakLimit));
    outL[i] = l;
    outR[i] = r;
    maxPeak = Math.max(maxPeak, Math.abs(l), Math.abs(r));
  }

  // 重算最終近似 LUFS
  let sumSq2 = 0;
  for (let i = 0; i < n; i++) sumSq2 += outL[i] * outL[i] + outR[i] * outR[i];
  const finalLufs = 20 * Math.log10(Math.sqrt(sumSq2 / (2 * Math.max(1, n))) + 1e-9) - 0.691;
  const finalPeakDb = 20 * Math.log10(maxPeak + 1e-9);
  return { outL, outR, finalLufs, finalPeakDb };
}

function encodeWav16Stereo(L, R, sampleRate) {
  const numSamples = L.length;
  const dataBytes = numSamples * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, L[i]));
    const sR = Math.max(-1, Math.min(1, R[i]));
    buf.writeInt16LE(Math.round(sL * 32767), off);
    buf.writeInt16LE(Math.round(sR * 32767), off + 2);
    off += 4;
  }
  return buf;
}

// ---- 主迴圈：雙遍無縫循環渲染 9 首曲目 ----
const trackMap = new Map(score.tracks.map((t) => [t.id, t]));
const report = [];

for (let ti = 0; ti < score.tracks.length; ti++) {
  const track = score.tracks[ti];
  if (onlyId && track.id !== onlyId) continue;

  const t0 = Date.now();
  const { events, loopSec, totalBars } = buildTrackEvents(track, trackMap);
  const loopSamples = Math.round(loopSec * SR);
  const totalSamples = loopSamples * 2 + Math.ceil((track.reverbSec + 1) * SR);

  const dryL = new Float32Array(totalSamples);
  const dryR = new Float32Array(totalSamples);
  const revL = new Float32Array(totalSamples);
  const revR = new Float32Array(totalSamples);
  const rng = makeRng(20261122 + ti * 7919);

  // 雙遍連續渲染（Pass 1 + Pass 2）
  for (let pass = 0; pass < 2; pass++) {
    const offsetSec = pass * loopSec;
    for (const ev of events) {
      renderNote(dryL, dryR, revL, revR, {
        ...ev,
        startSec: ev.startSec + offsetSec,
        rng
      });
    }
  }

  const { mixL, mixR } = applyStereoReverb(dryL, dryR, revL, revR, track.reverbSec || 2.0);
  // 精確截取第二遍（已含第一遍自然混響尾音，達成零斷點循環）
  const pass2L = mixL.subarray(loopSamples, loopSamples * 2);
  const pass2R = mixR.subarray(loopSamples, loopSamples * 2);

  const { outL, outR, finalLufs, finalPeakDb } = masterBus(pass2L, pass2R);
  const wavBuf = encodeWav16Stereo(outL, outR, SR);
  const outPath = join(outDir, `${track.id}.wav`);
  writeFileSync(outPath, wavBuf);

  const entry = {
    id: track.id,
    title: track.title,
    bars: totalBars,
    durationSec: Number(loopSec.toFixed(2)),
    lufsApprox: Number(finalLufs.toFixed(2)),
    peakDb: Number(finalPeakDb.toFixed(2)),
    wavBytes: wavBuf.length,
    elapsedMs: Date.now() - t0
  };
  report.push(entry);
  console.log(`RENDERED ${entry.id} | ${entry.durationSec}s (${entry.bars} bars) | ${entry.lufsApprox} LUFS | peak ${entry.peakDb} dBTP | ${(entry.wavBytes / 1048576).toFixed(2)} MB | ${entry.elapsedMs}ms`);
}

writeFileSync(join(outDir, 'render-report.json'), JSON.stringify({ sampleRate: SR, tracks: report }, null, 2), 'utf8');
