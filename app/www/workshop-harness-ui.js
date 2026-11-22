/**
 * workshop-harness-ui.js — 創意工坊「Harness 插件管理」與「後端檢查／VN 除錯面板」UI 模組
 *
 * 從 app.js 獨立抽離以保持主檔案精簡、高內聚：
 * 1. 插件管理面板（#vnPluginPanel）：開關內建與自訂插件、安裝宣告式 JSON 插件、移除自訂插件。
 * 2. 後端檢查與 VN 除錯面板（#vnDebugPanel）：六項系統與 /api/health 診斷、/api/model-check 探測、
 *    淨化除錯報告匯出、claudeBus 即時事件追蹤，以及互動式多角色 VN 劇本解析與逐句試播器。
 */

import { LineRunner } from './line-runner.js';
import { parseVnScript } from './vn-script.js';
import { pluginRegistry } from './plugin-registry.js';
import { backendDebugger } from './backend-debug.js';
import { sceneImageGenerator } from './image-gen.js';

let debugVnPreviewRunner = null;

function $(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

export function createWorkshopHarnessPanels(ctx) {
  const {
    esc,
    uiText,
    getUiLanguage,
    getState,
    defaultCharacterName,
    selectedCharacterCards,
    characterCardsList,
    getGameConfigs,
    audioCoordinator,
    getWebSpeechDiagnostics,
    apiBaseUrl,
    desktopApiHeaders,
    importSceneIllustration,
    activeAiConnection,
    sanitizeExportPayload
  } = ctx;

  function refreshHarnessPluginPanel() {
    const listHost = $('vnPluginList');
    const summaryEl = $('vnPluginSummary');
    if (!listHost) return;
    const lang = getUiLanguage();
    const sum = pluginRegistry.getSummary();
    if (summaryEl) {
      summaryEl.textContent = lang === 'en'
        ? `Registered: ${sum.total} (${sum.enabled} enabled, ${sum.custom} custom, ${sum.totalErrors} errors)`
        : `已註冊 ${sum.total} 個插件（啟用 ${sum.enabled} 個、自訂 ${sum.custom} 個、累計 Hook 錯誤 ${sum.totalErrors} 次）`;
    }
    listHost.replaceChildren();
    for (const p of pluginRegistry.list()) {
      const row = document.createElement('div');
      row.className = 'vn-plugin-row' + (p.enabled ? ' is-enabled' : ' is-disabled');
      const head = document.createElement('div');
      head.className = 'vn-plugin-row-head';
      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'vn-plugin-toggle';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = p.enabled;
      box.onchange = () => {
        pluginRegistry.setEnabled(p.id, box.checked);
        refreshHarnessPluginPanel();
        refreshBackendDebugPanel();
      };
      const title = document.createElement('strong');
      title.textContent = lang === 'en' ? p.nameEn : p.name;
      const badge = document.createElement('span');
      badge.className = 'vn-plugin-badge';
      badge.textContent = (p.builtin ? (lang === 'en' ? 'Core' : '核心') : (lang === 'en' ? 'Custom' : '自訂')) + ' v' + p.version;
      toggleLabel.append(box, title, badge);
      head.append(toggleLabel);
      if (!p.builtin) {
        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'vn-plugin-rm';
        rmBtn.textContent = uiText('移除');
        rmBtn.onclick = () => {
          pluginRegistry.unregister(p.id);
          refreshHarnessPluginPanel();
          refreshBackendDebugPanel();
        };
        head.append(rmBtn);
      }
      const desc = document.createElement('p');
      desc.className = 'note vn-plugin-desc';
      const hooksTxt = p.hookNames.length ? ('Hooks: ' + p.hookNames.join(', ')) : '核心演出模組';
      const errTxt = p.errorCount > 0 ? ` · 錯誤 ${p.errorCount}（${p.lastError || ''}）` : '';
      desc.textContent = `${p.description}｜${hooksTxt}｜呼叫 ${p.invocations} 次${errTxt}`;
      row.append(head, desc);
      listHost.append(row);
    }
  }

  function ensureHarnessPluginPanel() {
    let panel = $('vnPluginPanel');
    if (panel) return panel;
    const host = document.querySelector('#tab-workshop .workshop');
    if (!host) return null;
    panel = document.createElement('details');
    panel.id = 'vnPluginPanel';
    panel.className = 'workshop-section vn-harness-panel';
    panel.innerHTML = `<summary><span class="pm-title">🔌 插件管理（Harness Plugins）</span></summary>
<p class="note">比照 Harness 插件架構集中管理內建與自訂插件；支援生命週期 Hook（onPrompt／onReply／onScriptParsed／onLine／onScene／onTurn）與錯誤隔離。</p>
<p class="pm-summary" id="vnPluginSummary" role="status"></p>
<div id="vnPluginList" class="vn-plugin-list"></div>
<div class="vn-plugin-add">
  <b>＋ 新增／匯入自訂 JSON 插件</b>
  <p class="note">可附加自訂提示詞指令（promptAppend）或逐句關鍵詞演出規則（lineRules），儲存後立即生效並保留於本機。</p>
  <textarea id="vnPluginJsonInput" rows="6" spellcheck="false" placeholder='{"id":"tea-mood","name":"茶香氛圍插件","description":"提到茶香時自動帶出溫柔表情","promptAppend":"偶爾描寫紅茶與舊書頁的氣味細節。","lineRules":[{"keyword":"紅茶","emotion":"tender"}]}'></textarea>
  <div class="workshop-actions">
    <button id="vnPluginSampleBtn" type="button">填入範例插件</button>
    <button id="vnPluginAddBtn" type="button">安裝插件</button>
    <button id="vnPluginImportFileBtn" type="button">⬆ 匯入插件檔 (.json)</button>
    <button id="vnPluginExportBtn" type="button">⬇ 匯出自訂插件</button>
    <input id="vnPluginImportFile" type="file" accept=".json,application/json" hidden>
  </div>
  <p class="note" id="vnPluginStatus" role="status" aria-live="polite"></p>
</div>`;
    host.append(panel);
    const sampleBtn = $('vnPluginSampleBtn');
    if (sampleBtn) sampleBtn.onclick = () => {
      const ta = $('vnPluginJsonInput');
      if (ta) ta.value = JSON.stringify({
        id: 'library-tea-mood',
        name: '茶香氛圍插件',
        version: '1.0.0',
        description: '遇到茶香或暖光關鍵詞時自動微調為 tender 表情，並在提示詞補充細膩感官描寫。',
        promptAppend: '本回合可適度融入古籍紙香與溫熱紅茶的細節氛圍。',
        lineRules: [{ keyword: '紅茶', emotion: 'tender' }, { keyword: '古籍', emotion: 'curious' }]
      }, null, 2);
    };
    const addBtn = $('vnPluginAddBtn');
    if (addBtn) addBtn.onclick = () => {
      const ta = $('vnPluginJsonInput');
      const st = $('vnPluginStatus');
      try {
        const snap = pluginRegistry.importDeclarativePlugin(ta?.value || '');
        if (st) st.textContent = uiText('已安裝插件：') + snap.name + ' (' + snap.id + ')';
        refreshHarnessPluginPanel();
        refreshBackendDebugPanel();
      } catch (err) {
        if (st) st.textContent = uiText('插件安裝失敗：') + (err?.message || err);
      }
    };
    const impBtn = $('vnPluginImportFileBtn');
    const impFile = $('vnPluginImportFile');
    if (impBtn && impFile) {
      impBtn.onclick = () => impFile.click();
      impFile.onchange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const st = $('vnPluginStatus');
        try {
          const parsed = JSON.parse(await file.text());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          let count = 0;
          for (const spec of list) {
            pluginRegistry.importDeclarativePlugin(spec);
            count += 1;
          }
          if (st) st.textContent = `已從檔案匯入並安裝 ${count} 個插件。`;
          refreshHarnessPluginPanel();
          refreshBackendDebugPanel();
        } catch (err) {
          if (st) st.textContent = uiText('插件安裝失敗：') + (err?.message || err);
        }
      };
    }
    const expBtn = $('vnPluginExportBtn');
    if (expBtn) expBtn.onclick = () => {
      const st = $('vnPluginStatus');
      const specs = [...pluginRegistry.plugins.values()]
        .filter((p) => !p.builtin && p.declarativeSpec)
        .map((p) => p.declarativeSpec);
      if (!specs.length) {
        if (st) st.textContent = uiText('目前沒有已安裝的自訂插件可供匯出。');
        return;
      }
      const blob = new Blob([JSON.stringify(specs.length === 1 ? specs[0] : specs, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `claude-harness-plugins-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      if (st) st.textContent = `已匯出 ${specs.length} 個自訂插件規格檔。`;
    };
    panel.addEventListener('toggle', () => { if (panel.open) refreshHarnessPluginPanel(); });
    refreshHarnessPluginPanel();
    return panel;
  }

  function refreshBackendDebugTrace() {
    const pre = $('vnDebugTraceLog');
    if (!pre) return;
    const rows = backendDebugger.getTrace();
    pre.textContent = rows.length
      ? rows.slice(-30).reverse().map((r) => `[${r.ts.slice(11, 19)}] ${r.event} ${r.detail ? JSON.stringify(r.detail) : ''}`).join('\n')
      : uiText('（尚無事件紀錄；切換場景、套用回合或執行診斷後會顯示在此）');
  }

  function refreshBackendDebugPanel() {
    const state = getState();
    const charsEl = $('vnDebugActiveChars');
    if (charsEl) {
      const names = [state.characterName || defaultCharacterName, ...selectedCharacterCards().map((c) => c.name)];
      charsEl.textContent = uiText('目前辨識角色：') + names.join('、');
    }
    refreshBackendDebugTrace();
  }

  function runDebugVnParse(autoPlay) {
    const ta = $('vnDebugScriptInput');
    const listHost = $('vnDebugParseResult');
    const stage = $('vnDebugStagePreview');
    const spEl = $('vnDebugStageSpeaker');
    const badgeEl = $('vnDebugStageBadge');
    const txtEl = $('vnDebugStageText');
    if (!ta || !listHost) return;

    const state = getState();
    const mainName = state.characterName || defaultCharacterName;
    const extraChars = selectedCharacterCards().map((c) => ({ id: c.id, name: c.name }));
    const parsed = parseVnScript(ta.value, {
      charName: mainName,
      extraCharNames: extraChars,
      userName: state.playerName || 'User'
    });
    const hookCtx = { lines: parsed.lines, rawText: ta.value, extraCharNames: extraChars, state };
    pluginRegistry.runHook('onScriptParsed', hookCtx);
    const lines = hookCtx.lines || parsed.lines;

    listHost.replaceChildren();
    if (!lines.length) {
      listHost.textContent = uiText('（尚未解析到有效台詞或旁白）');
      return;
    }
    lines.forEach((line, i) => {
      const item = document.createElement('div');
      item.className = 'vn-debug-parse-row';
      const metaTag = `#${i + 1} [${line.kind}] 說話人=${line.speaker || '旁白'}(${line.speakerRole || 'narration'})`
        + (line.emotion ? ` · 情緒=${line.emotion}(${line.emotionSource || 'tag'})` : '')
        + (line.scene ? ` · 場景=${line.scene}` : '')
        + (line.imagePrompt ? ` · 插圖=${line.imagePrompt}` : '');
      item.innerHTML = `<small>${esc(metaTag)}</small><div>${esc(line.text)}</div>`;
      listHost.append(item);
    });

    if (autoPlay && stage && spEl && badgeEl && txtEl) {
      stage.hidden = false;
      if (!debugVnPreviewRunner) {
        debugVnPreviewRunner = new LineRunner({ speed: 28, autoAdvance: true, autoDelay: 1400 });
      }
      debugVnPreviewRunner.enabled = true;
      debugVnPreviewRunner.start(lines, {
        onLineMeta: (meta, idx, total) => {
          pluginRegistry.runHook('onLine', { meta, index: idx, total, state });
          spEl.textContent = meta.speaker || mainName;
          badgeEl.textContent = `(${idx + 1}/${total})` + (meta.emotion ? ` · ${meta.emotion}` : '') + (meta.scene ? ` · ${meta.scene}` : '');
        },
        onLineChange: (displayed) => {
          txtEl.textContent = displayed;
        },
        onFinish: () => {
          badgeEl.textContent += ' · 播畢';
        }
      });
    }
  }

  async function runBackendDebugDiagnostics() {
    const st = $('vnDebugStatus');
    const checksHost = $('vnDebugChecks');
    if (st) st.textContent = uiText('正在執行六項系統與後端診斷…');
    const cards = characterCardsList();
    const activeCards = selectedCharacterCards();
    const report = await backendDebugger.runDiagnostics({
      apiBase: typeof apiBaseUrl === 'function' ? apiBaseUrl() : '',
      configs: getGameConfigs(),
      pluginRegistry,
      audioCoordinator,
      voiceDiagnostics: getWebSpeechDiagnostics(),
      cardCount: cards.length,
      activeCardCount: activeCards.length
    });
    if (st) {
      st.textContent = `診斷完成（${report.timestamp.slice(11, 19)}）：${report.summary.ok} 正常 / ${report.summary.warn} 提醒 / ${report.summary.fail} 失敗`;
    }
    if (checksHost) {
      checksHost.replaceChildren();
      for (const c of report.checks) {
        const row = document.createElement('div');
        row.className = 'vn-debug-check-row status-' + c.status;
        row.innerHTML = `<span class="vn-debug-pill">${c.status.toUpperCase()}</span><strong>${esc(c.label)}</strong><span class="vn-debug-detail">${esc(c.detail)}</span>`;
        checksHost.append(row);
      }
    }
    refreshBackendDebugTrace();
  }

  function ensureBackendDebugPanel() {
    let panel = $('vnDebugPanel');
    if (panel) return panel;
    const host = document.querySelector('#tab-workshop .workshop');
    if (!host) return null;
    panel = document.createElement('details');
    panel.id = 'vnDebugPanel';
    panel.className = 'workshop-section vn-debug-panel';
    panel.innerHTML = `<summary><span class="pm-title">🛠 後端檢查與 VN 除錯面板（Backend &amp; VN Debug）</span></summary>
<p class="note">即時檢查本機 API 後端健康度、設定檔契約、插件狀態、音訊與儲存空間，並內建多角色 VN 劇本解析與逐句演出試播器。</p>
<div class="workshop-actions">
  <button id="vnDebugRunBtn" type="button">執行後端與系統診斷</button>
  <button id="vnDebugModelProbeBtn" type="button">探測模型介面 (/api/model-check)</button>
  <button id="vnDebugExportBtn" type="button">匯出淨化除錯報告</button>
</div>
<p class="note" id="vnDebugStatus" role="status" aria-live="polite"></p>
<div id="vnDebugChecks" class="vn-debug-checks"></div>
<div class="vn-debug-sub">
  <div class="vn-debug-subhead">
    <b>VN 劇本解析與逐句演出試播器</b>
    <span class="note" id="vnDebugActiveChars"></span>
  </div>
  <textarea id="vnDebugScriptInput" rows="4" spellcheck="false"></textarea>
  <div class="workshop-actions">
    <button id="vnDebugParseBtn" type="button">解析劇本結構</button>
    <button id="vnDebugPlayBtn" type="button">▶ 逐句引擎試播</button>
    <button id="vnDebugStepBtn" type="button">點一下快進／下一句</button>
    <button id="vnDebugGenImgBtn" type="button">✨ 依劇本 &lt;image:...&gt; 生圖匯入</button>
  </div>
  <div id="vnDebugStagePreview" class="vn-debug-stage" hidden>
    <div class="vn-debug-stage-head"><strong id="vnDebugStageSpeaker"></strong><span id="vnDebugStageBadge"></span></div>
    <div id="vnDebugStageText" class="vn-debug-stage-text"></div>
  </div>
  <div id="vnDebugParseResult" class="vn-debug-parse-list"></div>
</div>
<div class="vn-debug-sub">
  <div class="vn-debug-subhead">
    <b>事件匯流排即時追蹤（claudeBus）</b>
    <span>
      <button id="vnDebugRefreshTraceBtn" type="button">重新整理</button>
      <button id="vnDebugClearTraceBtn" type="button">清空紀錄</button>
    </span>
  </div>
  <pre id="vnDebugTraceLog" class="vn-debug-trace"></pre>
</div>`;
    host.append(panel);

    const state = getState();
    const scriptInput = $('vnDebugScriptInput');
    if (scriptInput && !scriptInput.value) {
      const mainName = state.characterName || defaultCharacterName;
      const extra = selectedCharacterCards()[0]?.name || '林曉';
      scriptInput.value = `<image:雨夜古籍閱覽室暖黃燈光下，桌上有熱紅茶與展開的未竟錄><emotion:curious>${mainName}：「雨聲變小了呢，你手上的這本古籍是哪一頁？」\n${extra}：「這是剛修復好的《未竟錄》附頁，請小心翻閱。」\n<emotion:tender>${mainName}：「謝謝你特意送過來。」`;
    }

    const runBtn = $('vnDebugRunBtn');
    if (runBtn) runBtn.onclick = () => { void runBackendDebugDiagnostics(); };

    const probeBtn = $('vnDebugModelProbeBtn');
    if (probeBtn) probeBtn.onclick = async () => {
      const st = $('vnDebugStatus');
      const s = getState();
      if (st) st.textContent = uiText('正在探測後端模型契約 (/api/model-check)…');
      const conn = activeAiConnection?.() || null;
      const res = await backendDebugger.probeModel({
        apiBase: typeof apiBaseUrl === 'function' ? apiBaseUrl() : '',
        provider: s.provider || '',
        model: s.model || '',
        accountProfile: conn?.profileId || ''
      });
      if (st) st.textContent = (res.ok ? '[PASS] ' : '[WARN] ') + res.message + ` (${res.latencyMs} ms)`;
      refreshBackendDebugTrace();
    };

    const exportBtn = $('vnDebugExportBtn');
    if (exportBtn) exportBtn.onclick = () => {
      const report = backendDebugger.buildSanitizedReport({
        plugins: pluginRegistry.list(),
        activeCards: selectedCharacterCards().map((c) => ({ id: c.id, name: c.name, sourceSpec: c.sourceSpec || '' }))
      });
      const clean = sanitizeExportPayload(report);
      const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `claude-debug-report-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      const st = $('vnDebugStatus');
      if (st) st.textContent = uiText('已匯出淨化除錯報告（不含任何 API 金鑰與對話隱私）。');
    };

    const parseBtn = $('vnDebugParseBtn');
    if (parseBtn) parseBtn.onclick = () => runDebugVnParse(false);
    const playBtn = $('vnDebugPlayBtn');
    if (playBtn) playBtn.onclick = () => runDebugVnParse(true);
    const stepBtn = $('vnDebugStepBtn');
    if (stepBtn) stepBtn.onclick = () => { if (debugVnPreviewRunner) debugVnPreviewRunner.advance(); };
    const genImgBtn = $('vnDebugGenImgBtn');
    if (genImgBtn) genImgBtn.onclick = async () => {
      const st = $('vnDebugStatus');
      const s = getState();
      const parsed = parseVnScript($('vnDebugScriptInput')?.value || '', {
        charName: s.characterName || defaultCharacterName,
        extraCharNames: selectedCharacterCards().map((c) => ({ id: c.id, name: c.name })),
        userName: s.playerName || 'User'
      });
      const imgLine = parsed.lines.find((l) => l.imagePrompt);
      const prompt = imgLine?.imagePrompt || parsed.lines.map((l) => l.text).join(' ').slice(0, 300);
      const base = typeof apiBaseUrl === 'function' ? apiBaseUrl() : '';
      genImgBtn.disabled = true;
      try {
        await sceneImageGenerator.generateAndImport({
          prompt,
          apiBase: base,
          headers: typeof desktopApiHeaders === 'function' ? desktopApiHeaders(base) : {},
          accountProfile: activeAiConnection?.()?.profileId || '',
          extraCharNames: selectedCharacterCards().map((c) => c.name),
          importFile: importSceneIllustration,
          onStatus: (msg) => { if (st) st.textContent = msg; }
        });
        refreshBackendDebugTrace();
      } finally {
        genImgBtn.disabled = false;
      }
    };

    const refTrace = $('vnDebugRefreshTraceBtn');
    if (refTrace) refTrace.onclick = () => refreshBackendDebugTrace();
    const clrTrace = $('vnDebugClearTraceBtn');
    if (clrTrace) clrTrace.onclick = () => { backendDebugger.clearTrace(); refreshBackendDebugTrace(); };

    panel.addEventListener('toggle', () => {
      if (panel.open) {
        refreshBackendDebugPanel();
        if (!backendDebugger.lastDiagnostics) void runBackendDebugDiagnostics();
      }
    });
    refreshBackendDebugPanel();
    return panel;
  }

  return {
    ensureHarnessPluginPanel,
    refreshHarnessPluginPanel,
    ensureBackendDebugPanel,
    refreshBackendDebugPanel,
    runBackendDebugDiagnostics
  };
}
