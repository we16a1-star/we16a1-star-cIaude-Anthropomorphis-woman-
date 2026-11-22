import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  evaluateMacros,
  createMacroEnv,
  formatDate,
  humanizeDuration,
  rollDice
} from '../../www/macro-engine.js';
import { StackedLayerController } from '../../www/stacked-layers.js';
import { skipChipLabel, computeVnControlState } from '../../www/vn-controls.js';
import { worldBookPromptLines } from '../../www/world-book.js';

const here = dirname(fileURLToPath(import.meta.url));
const wwwDir = join(here, '..', '..', 'www');

test('AnimaVN MacroEngine: 角色／玩家／時間／條件／變數／骰子與防卡死上限', () => {
  const fixedDate = new Date(2026, 10, 22, 14, 5, 9); // 2026-11-22 14:05:09 星期日
  const env = createMacroEnv({
    char: 'Claude娘',
    user: '艾倫',
    nickname: '倫',
    now: () => fixedDate,
    random: () => 0.5,
    idleMs: 12 * 60 * 1000
  });

  assert.equal(formatDate(fixedDate, 'YYYY/MM/DD dddd HH:mm'), '2026/11/22 星期日 14:05');
  assert.equal(humanizeDuration(12 * 60 * 1000), '12 分鐘');
  assert.equal(evaluateMacros('{{char}}對{{user}}（{暱稱}）說：現在是{{weekday}} {{time}}。', env), 'Claude娘對艾倫（倫）說：現在是星期日 14:05。');
  assert.equal(evaluateMacros('{{setvar::tea::紅茶}}{{addvar::cups::2}}{{getvar::tea}}×{{getvar::cups}}', env), '紅茶×2');
  assert.equal(evaluateMacros('{{if 1}}打開{{else}}關閉{{/if}} / {{if 0}}打開{{else}}關閉{{/if}}', env), '打開 / 關閉');
  assert.equal(evaluateMacros('骰子：{{roll::2d6+1}}', env), '骰子：9');
  assert.equal(rollDice('99999d6'), null, '超過 1000 顆骰子必須安全拒絕防卡死');

  // {{pick}} 對同一文本與位移應具決定性
  const p1 = evaluateMacros('今日花茶：{{pick::大吉嶺::伯爵::洋甘菊}}', env);
  const p2 = evaluateMacros('今日花茶：{{pick::大吉嶺::伯爵::洋甘菊}}', env);
  assert.equal(p1, p2);

  // 巢狀展開 + 註解移除
  assert.equal(evaluateMacros('{{// 內部註解}}早安，{{random::{{user}}::{{char}}}}', env), '早安，Claude娘');
});

test('AnimaVN MacroEngine × WorldBook: 世界書條目支援宏展開且無宏時逐字保持不變', () => {
  const env = createMacroEnv({ char: 'Claude娘', user: '艾倫' });
  const book = {
    enabled: true,
    entries: [{
      id: 'greet',
      enabled: true,
      keywords: ['紅茶'],
      text: '{{char}}記得{{user}}喜歡大吉嶺紅茶。',
      priority: 'high'
    }]
  };
  const lines = worldBookPromptLines(book, '來一杯紅茶吧', 'zh', {
    substitute: (t) => evaluateMacros(t, env)
  });
  assert.equal(lines[1], 'Claude娘記得艾倫喜歡大吉嶺紅茶。');

  // 未提供 substitute 時保留原字串（向下相容）
  const rawLines = worldBookPromptLines(book, '來一杯紅茶吧', 'zh');
  assert.equal(rawLines[1], '{{char}}記得{{user}}喜歡大吉嶺紅茶。');
});

test('AnimaVN StackedLayerController: 雙層無閃爍疊圖、淡入完回收底層與 instant 切換', async () => {
  const ctl = new StackedLayerController({ key: 'day', src: 'a.jpg' }, { fadeMs: 40 });
  assert.equal(ctl.getLayers().length, 1);

  // 切換至新圖：底層保留舊圖、頂層為 entering
  ctl.push({ key: 'night', src: 'b.jpg' });
  assert.equal(ctl.getLayers().length, 2);
  assert.equal(ctl.getLayers()[0].view.key, 'day');
  assert.equal(ctl.getLayers()[1].view.key, 'night');
  assert.equal(ctl.getLayers()[1].enter, true);

  // 等待淡入結束自動回收底層（釋放合成層）
  await new Promise(r => setTimeout(r, 110));
  assert.equal(ctl.getLayers().length, 1);
  assert.equal(ctl.getLayers()[0].view.key, 'night');
  assert.equal(ctl.getLayers()[0].enter, false);

  // instant 切換不疊圖
  ctl.push({ key: 'morning', src: 'c.jpg' }, { instant: true });
  assert.equal(ctl.getLayers().length, 1);
  assert.equal(ctl.getLayers()[0].enter, false);
  ctl.dispose();
});

test('AnimaVN VnControls & 前端接線: 快進膠囊狀態機、無閃爍底墊與設定頁跳字音控制', () => {
  assert.equal(skipChipLabel(false, 'zh'), '跳過本段');
  assert.equal(skipChipLabel(true, 'zh'), '快進中 · 放開 Ctrl 停');
  const playing = computeVnControlState({ isPlaying: true, autoAdvance: true, typeSoundId: 'soft' });
  assert.equal(playing.showSkip, true);
  assert.equal(playing.autoActive, true);
  assert.equal(playing.soundActive, true);
  const idle = computeVnControlState({ isPlaying: false, autoAdvance: false, typeSoundId: 'off' });
  assert.equal(idle.showSkip, false);
  assert.equal(idle.autoActive, false);
  assert.equal(idle.soundActive, false);

  const appSrc = readFileSync(join(wwwDir, 'app.js'), 'utf8');
  assert.ok(appSrc.includes('ensureVnQuickBar'));
  assert.ok(appSrc.includes('vnTypeSoundSelect'));
  assert.ok(appSrc.includes('vnTypeSoundPreview'));
  assert.ok(appSrc.includes('scheduleDialogueScroll'));

  const artSrc = readFileSync(join(wwwDir, 'story-art.js'), 'utf8');
  assert.ok(artSrc.includes('story-art-underlay'), 'story-art.js 含無閃爍雙層疊圖底墊');
});
