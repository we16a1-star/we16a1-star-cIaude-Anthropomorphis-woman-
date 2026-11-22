'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../agent-desktop-bridge.cjs');

test('只允許 Chrome 與 Edge', () => {
  assert.equal(bridge.isAllowedApp('chrome.exe'), true);
  assert.equal(bridge.isAllowedApp('MSEDGE.EXE'), true);
  assert.equal(bridge.isAllowedApp('notepad.exe'), false);
  assert.equal(bridge.isAllowedApp(''), false);
});

test('filterWindows 只留下指定 PID 的 Chrome／Edge 視窗', () => {
  const windows = [
    {id: 'w1', app_name: 'chrome.exe', pid: 101, visible: true, minimized: false},
    {id: 'w2', app_name: 'msedge.exe', pid: 202, visible: true, minimized: true},
    {id: 'w3', app_name: 'notepad.exe', pid: 101, visible: true, minimized: false},
    {id: 'w4', app_name: 'chrome.exe', pid: 303, visible: true, minimized: false}
  ];
  const result = bridge.filterWindows(windows, [101, 202]);
  assert.deepEqual(result.map(item => item.id), ['w1', 'w2']);
});

test('listWindows 會對 Chrome 與 Edge 各呼叫一次', async () => {
  const calls = [];
  const runner = async args => {
    calls.push(args);
    return {ok: true, data: [{id: args[1] === '--app' ? args[2] : 'x'}]};
  };
  const result = await bridge.listWindows(runner);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['list-windows', '--app', 'chrome.exe']);
  assert.deepEqual(calls[1], ['list-windows', '--app', 'msedge.exe']);
  assert.equal(result.length, 2);
});

test('focusFirstWindow 會先還原最小化視窗，再聚焦', async () => {
  const calls = [];
  const runner = async args => {
    calls.push(args);
    if (args[0] === 'list-windows') {
      return {ok: true, data: [{id: 'w-min', app_name: 'chrome.exe', pid: 123, visible: true, minimized: true, title: 'Google Chrome'}]};
    }
    if (args[0] === 'restore') return {ok: true, data: {}};
    if (args[0] === 'focus-window') return {ok: true, data: {focused: {is_focused: true}}};
    throw new Error('unexpected command: ' + args[0]);
  };
  const result = await bridge.focusFirstWindow([123], {runner});
  assert.equal(result.ok, true);
  assert.equal(result.pid, 123);
  assert.equal(result.title, 'Google Chrome');
  assert.ok(calls.some(args => args[0] === 'restore' && args.includes('--headed')));
  assert.ok(calls.some(args => args[0] === 'focus-window' && args.includes('--headed')));
});

test('focusFirstWindow 拒絕非 Chrome／Edge 視窗', async () => {
  const runner = async args => {
    if (args[0] === 'list-windows') {
      return {ok: true, data: [{id: 'w1', app_name: 'notepad.exe', pid: 123, visible: true}]};
    }
    throw new Error('should not run ' + args[0]);
  };
  const result = await bridge.focusFirstWindow([123], {runner});
  assert.equal(result.ok, false);
  assert.match(result.error, /Chrome／Edge/);
});

test('focusFirstWindow 拒絕空 PID 清單', async () => {
  const result = await bridge.focusFirstWindow([], {runner: async () => ({ok: true, data: []})});
  assert.equal(result.ok, false);
});

test('parseEnvelope 可處理 BOM 與前後空白', () => {
  const parsed = bridge.parseEnvelope('\uFEFF\n{"ok":true,"data":{"value":1}}\n');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.value, 1);
});
