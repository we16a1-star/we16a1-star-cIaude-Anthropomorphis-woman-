import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_VOICE_CONFIG,
  STORAGE_KEY_VOICE_ENABLED,
  STORAGE_KEY_VOICE_CONFIG,
  STORAGE_KEY_VOICE_API_KEY,
  MAX_VOICE_FAILURES,
  normalizeVoiceConfig,
  loadVoiceConfig,
  saveVoiceConfig,
  loadVoiceApiKey,
  saveVoiceApiKey,
  isSafeTtsEndpointUrl,
  computeGlassyProsody,
  sanitizeTextForSpeech,
  looksLikeEnglishSpeech,
  normalizeSpokenEnList,
  voicePromptRule,
  attachSpokenEnToLines,
  pickBestEnGbVoice,
  getWebSpeechDiagnostics,
  buildLocalSovitsRequest,
  buildElevenLabsRequest,
  buildOpenAiCompatRequest,
  VoicePlayer
} from '../../www/voice-tts.js';
import { splitScriptLines } from '../../www/line-split.js';
import { LineRunner } from '../../www/line-runner.js';
import { computeVnControlState } from '../../www/vn-controls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wwwDir = join(__dirname, '../../www');

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

test('D20 預設語音規格：Claude 英文（英國 en-GB）· Glassy · 速度正常 (1.0x)', () => {
  const voiceJson = JSON.parse(readFileSync(join(wwwDir, 'config/voice.json'), 'utf8'));
  assert.equal(voiceJson.profile.language, 'en-GB');
  assert.equal(voiceJson.profile.languageLabel, '英文（英國）');
  assert.equal(voiceJson.profile.style, 'glassy');
  assert.equal(voiceJson.profile.styleLabel, 'Glassy');
  assert.equal(voiceJson.profile.speed, 'normal');
  assert.equal(voiceJson.profile.speedLabel, '正常');
  assert.equal(voiceJson.profile.rate, 1.0);
  assert.equal(voiceJson.playback.bilingualEnglishSpeech, true);
  assert.equal(voiceJson.playback.dialogueOnly, true);

  assert.equal(DEFAULT_VOICE_CONFIG.language, 'en-GB');
  assert.equal(DEFAULT_VOICE_CONFIG.style, 'glassy');
  assert.equal(DEFAULT_VOICE_CONFIG.speed, 'normal');
  assert.equal(DEFAULT_VOICE_CONFIG.bilingualEnglish, true);
  assert.equal(DEFAULT_VOICE_CONFIG.dialogueOnly, true);

  const normalProsody = computeGlassyProsody(DEFAULT_VOICE_CONFIG, 'neutral');
  assert.equal(normalProsody.lang, 'en-GB');
  assert.equal(normalProsody.style, 'glassy');
  assert.equal(normalProsody.rate, 1.0);
  assert.equal(normalProsody.pitch, 1.06);

  const slowProsody = computeGlassyProsody({ ...DEFAULT_VOICE_CONFIG, speed: 'slow' }, 'neutral');
  const fastProsody = computeGlassyProsody({ ...DEFAULT_VOICE_CONFIG, speed: 'fast' }, 'neutral');
  assert.equal(slowProsody.rate, 0.85);
  assert.equal(fastProsody.rate, 1.15);
});

test('D20 設定持久化與金鑰隔離：保留 claude_novel_voice_tts_v21 且 API Key 不進主設定 JSON', () => {
  const store = makeMemoryStorage();
  const saved = saveVoiceConfig({ enabled: true, provider: 'elevenlabs', voiceId: 'voice_gb_1' }, store);
  assert.equal(saved.enabled, true);
  assert.equal(store.getItem(STORAGE_KEY_VOICE_ENABLED), 'true');

  saveVoiceApiKey('sk_test_voice_secret', store);
  assert.equal(loadVoiceApiKey(store), 'sk_test_voice_secret');
  const rawCfg = store.getItem(STORAGE_KEY_VOICE_CONFIG) || '';
  assert.ok(!rawCfg.includes('sk_test_voice_secret'), 'API Key 絕不可混入一般設定 JSON');
  assert.equal(store.getItem(STORAGE_KEY_VOICE_API_KEY), 'sk_test_voice_secret');

  const reloaded = loadVoiceConfig(store);
  assert.equal(reloaded.enabled, true);
  assert.equal(reloaded.provider, 'elevenlabs');
  assert.equal(reloaded.language, 'en-GB');
  assert.equal(reloaded.style, 'glassy');
  assert.equal(reloaded.speed, 'normal');
});

test('D20 中文字幕＋英式英文配音：精準對齊角色對話，略過旁白、動作與玩家台詞', () => {
  const narration =
    '燭火微微搖曳。（她翻開《未竟錄》）「這一段的註腳我核對過兩遍了。」\n' +
    '<我>「辛苦你了，克勞德。」\n' +
    '克勞德：「哼，才不是特意為了你才整理的。」';
  const scriptLines = splitScriptLines(narration, { charName: '克勞德', userName: '旅人' });
  const spokenEn = [
    'I have checked the footnotes on this passage twice already.',
    'Hmph—do not imagine I organised them specially for you.'
  ];
  const aligned = attachSpokenEnToLines(scriptLines, spokenEn, {
    config: { ...DEFAULT_VOICE_CONFIG, enabled: true },
    uiLanguage: 'zh'
  });

  const spokenEntries = aligned.filter((l) => l.spokenText);
  assert.equal(spokenEntries.length, 2, '僅有兩句角色台詞被綁定英文配音');
  assert.equal(spokenEntries[0].spokenText, spokenEn[0]);
  assert.equal(spokenEntries[1].spokenText, spokenEn[1]);
  assert.ok(aligned.filter((l) => l.kind === 'narration' || l.kind === 'action' || l.player).every((l) => !l.spokenText), '旁白、括號動作與玩家句均不發聲');

  // 英文台詞無 spokenEn 時可直接提取英文朗讀；純中文無 spokenEn 時不誤餵 en-GB Web Speech
  const enLines = [{ text: '「Good evening, let us check this folio.」', kind: 'dialogue', player: false }];
  const enAligned = attachSpokenEnToLines(enLines, [], { config: DEFAULT_VOICE_CONFIG, uiLanguage: 'en' });
  assert.equal(enAligned[0].spokenText, 'Good evening, let us check this folio.');

  const zhOnly = [{ text: '「這頁墨跡還沒乾呢。」', kind: 'dialogue', player: false }];
  const zhAligned = attachSpokenEnToLines(zhOnly, [], { config: DEFAULT_VOICE_CONFIG, uiLanguage: 'zh' });
  assert.equal(zhAligned[0].spokenText, null);

  assert.equal(sanitizeTextForSpeech('<emotion:shy>（微紅著臉）「Good evening!」'), 'Good evening!');
  assert.equal(looksLikeEnglishSpeech('Good evening, tea is ready.'), true);
  assert.equal(looksLikeEnglishSpeech('早安，紅茶已經泡好了。'), false);
  assert.deepEqual(normalizeSpokenEnList(['「Hello there.」', '純中文略過', 'Quite so!']), ['Hello there.', 'Quite so!']);

  assert.equal(voicePromptRule('zh', { enabled: false }), '');
  assert.equal(voicePromptRule('en', { enabled: true }), '');
  assert.ok(voicePromptRule('zh', { enabled: true, bilingualEnglish: true }).includes('"spokenEn"'));
});

test('D20 en-GB Glassy 聲線挑選與本機診斷（精準區分真英國腔與美式降級）', () => {
  const winVoicesNoGb = [
    { name: 'Microsoft Hanhan Desktop', lang: 'zh-TW' },
    { name: 'Microsoft Zira Desktop', lang: 'en-US' },
    { name: 'Microsoft David Desktop', lang: 'en-US' }
  ];
  const diagNoGb = getWebSpeechDiagnostics(DEFAULT_VOICE_CONFIG, winVoicesNoGb);
  assert.equal(diagNoGb.isTrueEnGb, false);
  assert.equal(diagNoGb.picked?.name, 'Microsoft Zira Desktop');

  const voicesWithGb = [
    ...winVoicesNoGb,
    { name: 'Microsoft George Desktop', lang: 'en-GB' },
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Google UK English Male', lang: 'en-GB' }
  ];
  const pickGb = pickBestEnGbVoice(voicesWithGb, '', 'en-GB');
  assert.equal(pickGb.isTrueEnGb, true);
  assert.equal(pickGb.voice?.name, 'Microsoft Libby Online (Natural) - English (United Kingdom)');
});

test('D20 外接後端請求建構（GPT-SoVITS / ElevenLabs / OpenAI 相容）與網址安全檢查', () => {
  assert.equal(isSafeTtsEndpointUrl('http://127.0.0.1:9880/tts'), true);
  assert.equal(isSafeTtsEndpointUrl('http://localhost:9880/tts'), true);
  assert.equal(isSafeTtsEndpointUrl('http://192.168.1.50:9880/tts'), true);
  assert.equal(isSafeTtsEndpointUrl('http://gpu-pc.tail123.ts.net:9880/tts'), true);
  assert.equal(isSafeTtsEndpointUrl('https://api.elevenlabs.io/v1'), true);
  assert.equal(isSafeTtsEndpointUrl('http://example.com/tts'), false);
  assert.equal(isSafeTtsEndpointUrl('javascript:alert(1)'), false);
  assert.equal(isSafeTtsEndpointUrl('file:///etc/passwd'), false);

  const sovits = buildLocalSovitsRequest(
    {
      ...DEFAULT_VOICE_CONFIG,
      provider: 'local-sovits',
      endpointUrl: 'http://127.0.0.1:9880/tts',
      refAudioPath: 'D:/AnimaVoice/claude/glassy_en_gb.wav',
      refPromptText: 'Good evening.'
    },
    'Tea is ready.',
    'neutral'
  );
  assert.equal(sovits.body.text_lang, 'en');
  assert.equal(sovits.body.speed_factor, 1.0);
  assert.equal(sovits.body.ref_audio_path, 'D:/AnimaVoice/claude/glassy_en_gb.wav');

  const eleven = buildElevenLabsRequest(
    { ...DEFAULT_VOICE_CONFIG, provider: 'elevenlabs', voiceId: 'abc123' },
    'xi_key_demo',
    'Quite right.',
    'neutral'
  );
  assert.ok(eleven.url.endsWith('/text-to-speech/abc123'));
  assert.equal(eleven.init.headers['xi-api-key'], 'xi_key_demo');
  assert.equal(eleven.body.voice_settings.speed, 1.0);

  const oai = buildOpenAiCompatRequest(
    { ...DEFAULT_VOICE_CONFIG, provider: 'openai-compat', voiceId: 'shimmer', modelId: 'gpt-4o-mini-tts' },
    'sk_demo',
    'Shall we begin?',
    'neutral'
  );
  assert.equal(oai.body.speed, 1.0);
  assert.ok(oai.body.instructions.includes('British English (en-GB)'));
  assert.ok(oai.body.instructions.includes('glassy'));
});

test('D20 VoicePlayer 外接快取、斷線熔斷與 LineRunner 語音禮貌等待整合', async () => {
  const store = makeMemoryStorage();
  let fetchCount = 0;
  let duckEvents = [];
  const fakeBus = {
    context: {
      state: 'running',
      decodeAudioData: async (ab) => ({ duration: 0.1, raw: ab }),
      createBufferSource: () => {
        const node = {
          buffer: null,
          onended: null,
          connect() {},
          disconnect() {},
          stop() {},
          start() {
            setTimeout(() => { if (node.onended) node.onended(); }, 15);
          }
        };
        return node;
      }
    },
    unlock() {},
    setActive() {},
    setLevel() {},
    input() { return {}; },
    duck(ch, on) { duckEvents.push(`${ch}:${on}`); }
  };

  const fakeFetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(64).buffer
    };
  };

  const player = new VoicePlayer({ storage: store, fetch: fakeFetch, audioBus: fakeBus });
  player.updateConfig({ enabled: true, provider: 'local-sovits', endpointUrl: 'http://127.0.0.1:9880/tts' });

  const ok1 = await player.speakLine({ kind: 'dialogue', player: false, text: '「晚安。」', spokenText: 'Good evening.', emotion: 'neutral' });
  assert.equal(ok1, true);
  assert.equal(fetchCount, 1);
  assert.deepEqual(duckEvents, ['voice:true', 'voice:false']);

  // 第二次播放同句命中記憶體快取，不重打網路
  const ok2 = await player.speakLine({ kind: 'dialogue', player: false, text: '「晚安。」', spokenText: 'Good evening.', emotion: 'neutral' });
  assert.equal(ok2, true);
  assert.equal(fetchCount, 1);

  // 旁白不發聲
  const skippedNarration = await player.speakLine({ kind: 'narration', player: false, text: '夜風吹過窗簾。', spokenText: 'The breeze stirred.' });
  assert.equal(skippedNarration, false);

  // 連續 503 失敗 3 次啟動熔斷
  const failingPlayer = new VoicePlayer({
    storage: makeMemoryStorage(),
    fetch: async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) }),
    audioBus: fakeBus
  });
  failingPlayer.updateConfig({ enabled: true, provider: 'local-sovits', endpointUrl: 'http://127.0.0.1:9880/tts' });
  for (let i = 0; i < MAX_VOICE_FAILURES; i += 1) {
    await failingPlayer.speakText(`Line ${i}`, { force: true });
  }
  assert.equal(failingPlayer.getSnapshot().paused, true);

  // LineRunner 自動前進等待語音，手動 nextOrSkip 永遠立即覆蓋
  let voiceBusy = true;
  const runner = new LineRunner({ speed: 10, autoAdvance: true, autoDelay: 20, isVoiceBusy: () => voiceBusy, maxVoiceWaitMs: 5000 });
  runner.enabled = true;
  runner.start([
    { text: '一', kind: 'dialogue', spokenText: 'One.' },
    { text: '二', kind: 'dialogue', spokenText: 'Two.' }
  ]);
  runner.nextOrSkip(); // 完成第一句打字
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(runner.currentIndex, 0, '語音朗讀中應暫停自動前進');
  voiceBusy = false;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(runner.currentIndex, 1, '語音結束後應自動推進下一句');
  runner.stop();
});

test('D20 前端接線與快捷列狀態檢查', () => {
  const st = computeVnControlState({ isPlaying: false, autoAdvance: true, typeSoundId: 'off', voiceEnabled: true, voiceSpeaking: true, lang: 'zh' });
  assert.equal(st.voiceActive, true);
  assert.equal(st.voiceSpeaking, true);
  assert.equal(st.voiceLabel, '朗讀中');

  const stEn = computeVnControlState({ voiceEnabled: true, voiceSpeaking: false, lang: 'en' });
  assert.equal(stEn.voiceLabel, 'Voice ON');

  const appSrc = readFileSync(join(wwwDir, 'app.js'), 'utf8');
  assert.ok(appSrc.includes('vnVoicePanel'));
  assert.ok(appSrc.includes('vnQuickVoice'));
  assert.ok(appSrc.includes('vnVoiceProvider'));
  assert.ok(appSrc.includes('vnVoicePreview'));
  assert.ok(appSrc.includes('attachSpokenEnToLines'));
  assert.ok(appSrc.includes('voicePromptRule'));
  assert.ok(appSrc.includes('claude_novel_voice_tts_v21'));
});
