import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_EMOTIONS, normalizeStoryEmotion, normalizeStoryEmotionIntensity } from '../../www/story-emotion.js';

test('story-emotion: 白名單包含 worried 與 tender', () => {
  assert.ok(STORY_EMOTIONS.includes('worried'));
  assert.ok(STORY_EMOTIONS.includes('tender'));
});

test('story-emotion: worried 別名正常規範化', () => {
  assert.equal(normalizeStoryEmotion('worried'), 'worried');
  assert.equal(normalizeStoryEmotion('擔憂'), 'worried');
  assert.equal(normalizeStoryEmotion('心疼'), 'worried');
  assert.equal(normalizeStoryEmotion('anxious'), 'worried');
  assert.equal(normalizeStoryEmotion('concerned'), 'worried');
});

test('story-emotion: tender 別名正常規範化', () => {
  assert.equal(normalizeStoryEmotion('tender'), 'tender');
  assert.equal(normalizeStoryEmotion('溫柔'), 'tender');
  assert.equal(normalizeStoryEmotion('眷戀'), 'tender');
  assert.equal(normalizeStoryEmotion('gentle'), 'tender');
  assert.equal(normalizeStoryEmotion('warm'), 'tender');
});

test('story-emotion: 未知情緒回退 neutral', () => {
  assert.equal(normalizeStoryEmotion('unknown_emotion_xyz'), 'neutral');
  assert.equal(normalizeStoryEmotion(''), 'neutral');
  assert.equal(normalizeStoryEmotion(null), 'neutral');
});

test('story-emotion: 強度 clamp 範圍 1~3', () => {
  assert.equal(normalizeStoryEmotionIntensity(0), 1);
  assert.equal(normalizeStoryEmotionIntensity(2), 2);
  assert.equal(normalizeStoryEmotionIntensity(5), 3);
  assert.equal(normalizeStoryEmotionIntensity('invalid', 2), 2);
});

