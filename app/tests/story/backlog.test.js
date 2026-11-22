import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BACKLOG_LIMIT, buildBacklogEntries } from '../../www/backlog.js';
import { computeVnControlState } from '../../www/vn-controls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wwwDir = join(__dirname, '../../www');

test('UI-3 Backlog: 區分角色／玩家／系統條目、保留英文重聽與 200 回合效能 < 100ms', () => {
  assert.equal(DEFAULT_BACKLOG_LIMIT, 30);

  const history = [];
  for (let i = 1; i <= 200; i += 1) {
    history.push({ role: 'user', text: `第 ${i} 輪玩家選擇` });
    history.push({
      role: 'ai',
      text: `第 ${i} 輪克勞德回覆。`,
      spokenEn: i === 200 ? ['Good evening.', 'Let us continue reading.'] : undefined
    });
  }
  history.push({ role: 'gift', text: '送出一盒伯爵紅茶' });

  const t0 = performance.now();
  const entries = buildBacklogEntries(history, { limit: 30, characterName: '克勞德', playerName: '旅人' });
  const elapsed = performance.now() - t0;

  assert.equal(entries.length, 30, '預設只取最近 30 筆');
  assert.ok(elapsed < 100, `200 回合擷取耗時 ${elapsed.toFixed(2)}ms 應遠小於 100ms`);
  assert.equal(entries[entries.length - 1].kind, 'system');
  assert.equal(entries[entries.length - 2].kind, 'character');
  assert.equal(entries[entries.length - 2].spokenText, 'Good evening. Let us continue reading.');
  assert.equal(entries[entries.length - 3].kind, 'player');
  assert.equal(entries[entries.length - 3].speaker, '旅人');
});

test('UI-1 / UI-2 / UI-3 / UI-4: 快捷列聲音總開關與設定頁三分組接線完整', () => {
  const muted = computeVnControlState({ masterMuted: true, bgmEnabled: true, voiceEnabled: true, lang: 'zh' });
  assert.equal(muted.soundActive, false);
  assert.equal(muted.soundLabel, '已靜音');
  assert.equal(muted.voiceActive, false);

  const active = computeVnControlState({ masterMuted: false, bgmEnabled: true, lang: 'zh' });
  assert.equal(active.soundActive, true);
  assert.equal(active.soundLabel, '聲音開');

  const appSrc = readFileSync(join(wwwDir, 'app.js'), 'utf8');
  assert.ok(appSrc.includes('claude_novel_settings_sections_v1'), '含設定三分組持久化 Key');
  assert.ok(appSrc.includes('vnMasterVolume'), '含主音量控制');
  assert.ok(appSrc.includes('vnBgmToggle'), '含 BGM 開關');
  assert.ok(appSrc.includes('vnAmbienceMode'), '含環境音選單');
  assert.ok(appSrc.includes('vnAudioPopover'), '含快捷列聲音子選單');
  assert.ok(appSrc.includes('vnBacklogModal'), '含對話回顧視窗');
  assert.ok(appSrc.includes('vnVoiceLiveRegion'), '含語音無障礙 aria-live 區');
});
