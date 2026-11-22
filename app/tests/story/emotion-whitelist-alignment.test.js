import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STORY_EMOTIONS, normalizeStoryEmotion } from '../../www/story-emotion.js';
import { resolveEmotionWithFallback } from '../../www/emotion-fallback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wwwDir = join(__dirname, '../../www');

test('ART-1 / D21: emotions.json、story-emotion.js、app.js AI 提示詞三方 10 大情緒完全對齊', () => {
  const emotionsCfg = JSON.parse(readFileSync(join(wwwDir, 'config/emotions.json'), 'utf8'));
  const expected = ['neutral', 'happy', 'proud', 'shy', 'surprised', 'dizzy', 'curious', 'focused', 'worried', 'tender'];

  assert.deepEqual(emotionsCfg.whitelist, expected, 'emotions.json 白名單為完整 10 情緒');
  assert.deepEqual([...STORY_EMOTIONS], expected, 'STORY_EMOTIONS 與 emotions.json 完全一致');

  for (const tag of expected) {
    assert.equal(normalizeStoryEmotion(tag), tag, `normalizeStoryEmotion 接受正式情緒 ${tag}`);
    assert.ok(emotionsCfg.descriptions[tag], `emotions.json 含 ${tag} 說明`);
  }

  // 歷史別名收斂
  assert.equal(normalizeStoryEmotion('warm'), 'tender');
  assert.equal(normalizeStoryEmotion('sad'), 'worried');
  assert.equal(normalizeStoryEmotion('angry'), 'proud');
  assert.equal(resolveEmotionWithFallback('warm', '平淡台詞'), 'tender');

  // app.js 中英文 AI 輸出協議皆涵蓋 10 大情緒
  const appSrc = readFileSync(join(wwwDir, 'app.js'), 'utf8');
  assert.ok(
    appSrc.includes('neutral|happy|proud|shy|surprised|dizzy|curious|focused|worried|tender'),
    'app.js 英文提示詞含完整 10 情緒'
  );
  assert.ok(
    appSrc.includes('neutral／happy／proud／shy／surprised／dizzy／curious／focused／worried／tender'),
    'app.js 中文提示詞含完整 10 情緒'
  );
});

test('ART-1 / D26: portrait-anim.js 全部 10 情緒皆有存在之表情窗圖檔（零 404）', () => {
  const portraitSrc = readFileSync(join(wwwDir, 'portrait-anim.js'), 'utf8');
  assert.ok(portraitSrc.includes('resolveExpressionFaceAsset'), 'portrait-anim.js 含安全圖檔解析函式');
  assert.ok(portraitSrc.includes("'worried'") && portraitSrc.includes("'tender'"), 'EMOTION_CLASSES 含 worried 與 tender');

  const requiredAssets = [
    'story-daily.webp',
    'story-proud.webp',
    'story-shy.webp',
    'story-focused.webp',
    'happy.webp',
    'surprised.webp',
    'dizzy.webp',
    'pat.webp',
    'g43-face-aff-1.webp',
    'g43-face-aff-2.webp',
    'g43-face-aff-3.webp',
    'g43-face-aff-4.webp'
  ];
  for (const file of requiredAssets) {
    assert.ok(existsSync(join(wwwDir, 'assets/expressions', file)), `表情資源存在：${file}`);
  }
});
