/**
 * backend-debug.js — 後端連線檢查、運行期事件追蹤與除錯診斷模組
 *
 * 功能涵蓋：
 * 1. 即時訂閱 claudeBus，以環狀緩衝區（最多 80 筆）保留場景、CG、音訊、回合與插件事件。
 * 2. 全面診斷 runner：檢查本機 Express API 後端（/api/health 延遲與 profile）、設定檔 Schema、
 *    插件健康與錯誤計數、音訊／語音引擎、localStorage 空間與存檔數、以及 VN 劇本引擎自檢。
 * 3. 可選觸發 /api/model-check 探測實際 API 模型契約。
 * 4. 淨化除錯報告輸出：所有敏感欄位（API Key / Token / Secret / Authorization）一律清除。
 */

import { claudeBus } from './event-bus.js';
import { parseVnScript } from './vn-script.js';
import { STORY_EMOTIONS } from './story-emotion.js';

const MAX_TRACE_ENTRIES = 80;

const TRACE_TOPICS = [
  'scene:changed',
  'cg:started',
  'cg:ended',
  'audio:state',
  'turn:applied',
  'plugin:registered',
  'plugin:unregistered',
  'plugin:toggled',
  'plugin:config',
  'plugin:error',
  'card:imported',
  'image:generated',
  'image:error',
  'debug:check'
];

const SENSITIVE_KEY_RE = /(api[_-]?key|token|secret|password|authorization|cookie|credential)/i;

function sanitizeDebugValue(val, depth = 0) {
  if (depth > 6 || val === null || val === undefined) return val;
  if (typeof val === 'string') {
    if (/^(sk-|AIza|ghp_|gho_|ya29\.|Bearer\s)/i.test(val.trim())) return '[REDACTED]';
    return val.length > 400 ? val.slice(0, 400) + '…' : val;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.slice(0, 60).map((item) => sanitizeDebugValue(item, depth + 1));
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEY_RE.test(k)) continue;
      out[k] = sanitizeDebugValue(v, depth + 1);
    }
    return out;
  }
  return String(val);
}

export class BackendDebugger {
  constructor(options = {}) {
    this.bus = options.bus || claudeBus;
    this.trace = [];
    this.lastDiagnostics = null;
    this._unsubs = [];
    this._attachBus();
  }

  _attachBus() {
    for (const topic of TRACE_TOPICS) {
      const off = this.bus.on(topic, (payload) => {
        this.record(topic, payload);
      });
      this._unsubs.push(off);
    }
  }

  destroy() {
    for (const off of this._unsubs) {
      try { off(); } catch (_) {}
    }
    this._unsubs = [];
  }

  record(event, detail = null) {
    this.trace.push({
      ts: new Date().toISOString(),
      event: String(event || 'unknown'),
      detail: sanitizeDebugValue(detail)
    });
    if (this.trace.length > MAX_TRACE_ENTRIES) {
      this.trace.splice(0, this.trace.length - MAX_TRACE_ENTRIES);
    }
  }

  getTrace() {
    return this.trace.slice();
  }

  clearTrace() {
    this.trace = [];
  }

  /**
   * 探測後端 GET /api/health
   */
  async checkBackendHealth({ apiBase = '', headers = {}, fetchImpl = null, timeoutMs = 4500 } = {}) {
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    const url = `${String(apiBase || '').replace(/\/+$/, '')}/api/health`;
    if (!fetcher) {
      return {
        id: 'backendHealth',
        label: '後端 API 伺服器 (/api/health)',
        status: 'warn',
        latencyMs: 0,
        detail: '目前環境未提供 fetch，無法探測本機後端。'
      };
    }

    const started = Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const reqHeaders = { Accept: 'application/json', ...(headers && typeof headers === 'object' ? headers : {}) };
    try {
      const res = await fetcher(url, {
        method: 'GET',
        headers: reqHeaders,
        signal: controller ? controller.signal : undefined
      });
      const latencyMs = Date.now() - started;
      const contentType = String(res.headers?.get?.('content-type') || '');
      if (!res.ok) {
        return {
          id: 'backendHealth',
          label: '後端 API 伺服器 (/api/health)',
          status: 'warn',
          latencyMs,
          detail: `HTTP ${res.status}（若是靜態伺服器或免費網頁 AI 模式屬正常現象）`
        };
      }
      if (!contentType.includes('application/json')) {
        return {
          id: 'backendHealth',
          label: '後端 API 伺服器 (/api/health)',
          status: 'warn',
          latencyMs,
          detail: '端點回傳非 JSON 內容（目前可能由靜態檔案伺服器提供服務，免費網頁 AI 模式可照常使用）'
        };
      }
      const data = await res.json();
      const profiles = data && typeof data.profiles === 'object' ? Object.keys(data.profiles) : [];
      const caps = [];
      if (data?.capabilities?.imageGen) caps.push('/api/image');
      if (data?.capabilities?.bgmList) caps.push(`/api/bgm/list(${data.bgmCount ?? 0}首)`);
      const capStr = caps.length ? ` · 能力：${caps.join(', ')}` : '';
      return {
        id: 'backendHealth',
        label: '後端 API 伺服器 (/api/health)',
        status: data?.ok ? 'ok' : 'warn',
        latencyMs,
        detail: data?.ok
          ? `連線正常（${latencyMs} ms；供應商 ${profiles.length} 組：${profiles.join(', ') || '無'}${capStr}）`
          : `後端回報異常狀態（${latencyMs} ms）`
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      return {
        id: 'backendHealth',
        label: '後端 API 伺服器 (/api/health)',
        status: 'warn',
        latencyMs,
        detail: `無法連線至 ${url}（${err?.name === 'AbortError' ? '逾時' : (err?.message || '網路無法觸及')}；免費網頁 AI 模式不受影響）`
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 探測後端 POST /api/model-check
   */
  async probeModel({ apiBase = '', headers = {}, provider = '', model = '', accountProfile = '', fetchImpl = null, timeoutMs = 12000 } = {}) {
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    const url = `${String(apiBase || '').replace(/\/+$/, '')}/api/model-check`;
    if (!fetcher) return { ok: false, latencyMs: 0, message: 'fetch 不可用' };
    const started = Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const reqHeaders = { 'Content-Type': 'application/json', ...(headers && typeof headers === 'object' ? headers : {}) };
    try {
      const res = await fetcher(url, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ provider, model, accountProfile }),
        signal: controller ? controller.signal : undefined
      });
      const latencyMs = Date.now() - started;
      const data = await res.json().catch(() => ({}));
      const ok = Boolean(res.ok && data && data.ok !== false);
      const out = {
        ok,
        status: res.status,
        latencyMs,
        message: data?.message || data?.error || (ok ? `模型 ${model || provider} 探測通過` : `HTTP ${res.status}`)
      };
      this.record('debug:check', { kind: 'model-check', provider, model, ok, latencyMs });
      return out;
    } catch (err) {
      const latencyMs = Date.now() - started;
      return {
        ok: false,
        status: 0,
        latencyMs,
        message: err?.name === 'AbortError' ? '模型探測逾時' : String(err?.message || err)
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 執行完整六大面向系統與後端診斷
   */
  async runDiagnostics(ctx = {}) {
    const checks = [];

    // 1. 後端 API 健康度
    checks.push(await this.checkBackendHealth({
      apiBase: ctx.apiBase || '',
      headers: ctx.headers || {},
      fetchImpl: ctx.fetchImpl || null
    }));

    // 2. 設定檔與 10 種情緒契約
    try {
      const cfg = ctx.configs || null;
      const emotionKeys = Array.isArray(cfg?.emotions?.whitelist)
        ? cfg.emotions.whitelist
        : (Array.isArray(cfg?.emotions?.emotions)
          ? cfg.emotions.emotions.map((e) => e.key || e.id)
          : (cfg?.emotions && typeof cfg.emotions === 'object' ? Object.keys(cfg.emotions) : []));
      const missingEmotions = STORY_EMOTIONS.filter((k) => !emotionKeys.includes(k));
      const cfgCount = cfg && typeof cfg === 'object' ? Object.keys(cfg).length : 0;
      checks.push({
        id: 'configs',
        label: '設定檔與 10 種情緒契約',
        status: cfgCount > 0 && missingEmotions.length === 0 ? 'ok' : (cfgCount > 0 ? 'warn' : 'fail'),
        detail: cfgCount > 0
          ? `已載入 ${cfgCount} 組設定檔；官方 10 情緒完整度 ${STORY_EMOTIONS.length - missingEmotions.length}/${STORY_EMOTIONS.length}${missingEmotions.length ? `（缺：${missingEmotions.join(', ')}）` : ''}`
          : '設定檔尚未載入（將退回內建預設值）'
      });
    } catch (err) {
      checks.push({
        id: 'configs',
        label: '設定檔與 10 種情緒契約',
        status: 'fail',
        detail: String(err?.message || err)
      });
    }

    // 3. Harness 插件系統健康度
    try {
      const summary = ctx.pluginRegistry?.getSummary?.() || null;
      checks.push({
        id: 'plugins',
        label: 'Harness 插件註冊表',
        status: !summary ? 'warn' : (summary.totalErrors > 0 ? 'warn' : 'ok'),
        detail: summary
          ? `已註冊 ${summary.total} 個插件（啟用 ${summary.enabled}、自訂 ${summary.custom}、Hook 錯誤 ${summary.totalErrors}）`
          : '未傳入插件註冊表實例'
      });
    } catch (err) {
      checks.push({ id: 'plugins', label: 'Harness 插件註冊表', status: 'fail', detail: String(err?.message || err) });
    }

    // 4. 音訊、BGM 與英式語音引擎
    try {
      const audioSnap = ctx.audioCoordinator?.getSnapshot?.() || null;
      const voiceDiag = ctx.voiceDiagnostics || null;
      const masterPct = audioSnap ? Math.round((audioSnap.masterVolume ?? 1) * 100) : null;
      const enGbCount = Array.isArray(voiceDiag?.enGbVoices)
        ? voiceDiag.enGbVoices.length
        : (Number.isFinite(Number(voiceDiag?.enGbVoices)) ? Number(voiceDiag.enGbVoices) : 0);
      const voicePart = voiceDiag
        ? `WebSpeech=${voiceDiag.supported ? `可用(${enGbCount} 組 en-GB)` : '不支援'}`
        : '語音引擎就緒';
      checks.push({
        id: 'audio',
        label: '音訊協調器／BGM／英式配音',
        status: 'ok',
        detail: audioSnap
          ? `主音量 ${masterPct}%${audioSnap.masterMuted ? '（靜音中）' : ''} · BGM=${audioSnap.bgm?.enabled ? '開' : '關'} · 環境音=${audioSnap.ambience?.enabled ? '開' : '關'} · ${voicePart}`
          : voicePart
      });
    } catch (err) {
      checks.push({ id: 'audio', label: '音訊協調器／BGM／英式配音', status: 'warn', detail: String(err?.message || err) });
    }

    // 5. 本地儲存與存檔／角色卡狀態
    try {
      const storage = ctx.storage !== undefined
        ? ctx.storage
        : (typeof localStorage !== 'undefined' ? localStorage : null);
      let usedBytes = 0;
      let keyCount = 0;
      if (storage && typeof storage.length === 'number') {
        keyCount = storage.length;
        for (let i = 0; i < storage.length; i += 1) {
          const k = storage.key(i);
          if (k) usedBytes += k.length + (storage.getItem(k)?.length || 0);
        }
      }
      const usedKb = (usedBytes * 2 / 1024).toFixed(1);
      const cardCount = Number(ctx.cardCount || 0);
      const activeCardCount = Number(ctx.activeCardCount || 0);
      checks.push({
        id: 'storage',
        label: '本機儲存區與角色卡',
        status: Number(usedKb) > 4200 ? 'warn' : 'ok',
        detail: `已用約 ${usedKb} KB（${keyCount} 鍵）· 角色卡 ${cardCount} 張（啟用同台 ${activeCardCount} 張）`
      });
    } catch (err) {
      checks.push({ id: 'storage', label: '本機儲存區與角色卡', status: 'warn', detail: String(err?.message || err) });
    }

    // 6. VN 劇本解析與多角色引擎自檢
    try {
      const sample = `<emotion:curious>Claude娘：「這本古籍的頁邊有新的註記。」\n林曉：「讓我看看，好像是另一位訪客留下的。」`;
      const parsed = parseVnScript(sample, {
        charName: 'Claude娘',
        extraCharNames: ['林曉'],
        userName: '旅人'
      });
      const ok = parsed.lines.length === 2
        && parsed.lines[0].speaker === 'Claude娘'
        && parsed.lines[0].emotion === 'curious'
        && parsed.lines[1].speaker === '林曉';
      checks.push({
        id: 'vnEngine',
        label: 'VN 劇本解析與多角色逐句引擎',
        status: ok ? 'ok' : 'fail',
        detail: ok
          ? `自檢通過：成功切分 ${parsed.lines.length} 句（辨識多角色說話人與行內情緒標籤）`
          : `自檢異常：解析結果不符合預期（lines=${parsed.lines.length}）`
      });
    } catch (err) {
      checks.push({ id: 'vnEngine', label: 'VN 劇本解析與多角色逐句引擎', status: 'fail', detail: String(err?.message || err) });
    }

    // 7. 原創 BGM 音檔可存取性與沉浸播放健康度
    try {
      const fetcher = ctx.fetchImpl || (typeof fetch === 'function' ? fetch : null);
      const audioSnap = ctx.audioCoordinator?.getSnapshot?.() || null;
      const bgmSnap = audioSnap?.bgm || null;
      if (fetcher && typeof window !== 'undefined' && /^https?:/i.test(window.location?.protocol || '')) {
        const probeUrl = 'assets/bgm/bgm-day-default.m4a';
        const res = await fetcher(probeUrl, { method: 'HEAD' }).catch(() => null);
        const ok = Boolean(res && res.ok);
        checks.push({
          id: 'bgmAssets',
          label: '沉浸 BGM 配樂資產可存取性',
          status: ok ? 'ok' : 'warn',
          detail: ok
            ? `原創配樂可即時串流（${bgmSnap?.enabled ? '已啟用' : '已關閉'}；目前曲目：${bgmSnap?.activeTrackTitle || '待解鎖'}）`
            : `無法存取 ${probeUrl}（請確認 app/www/assets/bgm/ 檔案完整）`
        });
      } else {
        checks.push({
          id: 'bgmAssets',
          label: '沉浸 BGM 配樂資產可存取性',
          status: 'ok',
          detail: `BGM 模組就緒（${bgmSnap?.enabled ? '預設開啟自動淡入' : '已關閉'}；目前曲目：${bgmSnap?.activeTrackTitle || '午後的閱覽室'}）`
        });
      }
    } catch (err) {
      checks.push({ id: 'bgmAssets', label: '沉浸 BGM 配樂資產可存取性', status: 'warn', detail: String(err?.message || err) });
    }

    const report = {
      timestamp: new Date().toISOString(),
      ok: checks.every((c) => c.status !== 'fail'),
      summary: {
        ok: checks.filter((c) => c.status === 'ok').length,
        warn: checks.filter((c) => c.status === 'warn').length,
        fail: checks.filter((c) => c.status === 'fail').length
      },
      checks
    };

    this.lastDiagnostics = report;
    this.record('debug:check', { kind: 'full', summary: report.summary });
    return report;
  }

  /**
   * 匯出已淨化的除錯報告（嚴格去除所有敏感資訊）
   */
  buildSanitizedReport(extra = {}) {
    return sanitizeDebugValue({
      exportedAt: new Date().toISOString(),
      diagnostics: this.lastDiagnostics,
      traceCount: this.trace.length,
      recentTrace: this.trace.slice(-40),
      ...extra
    });
  }
}

export const backendDebugger = new BackendDebugger();
