/**
 * plugin-registry.js — Harness 風格可擴充插件註冊表與生命週期 Hook 引擎
 *
 * 設計重點：
 * 1. 單一事實來源（借鏡 AnimaVN plugins/registry.ts）：集中管理所有內建與自訂插件。
 * 2. 完整生命週期 Hook：`onPrompt`、`onReply`、`onScriptParsed`、`onLine`、`onScene`、`onTurn`。
 * 3. 錯誤隔離：單一插件擲出例外不會中斷主故事或演出管線，錯誤會自動計數並廣播至事件匯流排。
 * 4. 宣告式自訂插件（JSON Spec）：使用者可在工坊直接新增／匯入 JSON 插件（附加提示詞指令、
 *    關鍵詞情緒／場景觸發規則），並自動持久化於 localStorage。
 */

import { claudeBus } from './event-bus.js';
import { normalizeStoryEmotion } from './story-emotion.js';

export const STORAGE_KEY_PLUGINS = 'claude_novel_plugins_v1';

export const PLUGIN_HOOK_NAMES = Object.freeze([
  'onPrompt',
  'onReply',
  'onScriptParsed',
  'onLine',
  'onScene',
  'onTurn'
]);

/**
 * 內建核心插件清單（描述性與開關狀態）
 */
export const BUILTIN_PLUGIN_MANIFESTS = Object.freeze([
  {
    id: 'emotion',
    name: '十種情緒立繪演出',
    nameEn: '10-Emotion Portrait Engine',
    version: '2.1.0',
    builtin: true,
    category: 'presentation',
    description: '依 AI 情緒標籤與行內 <emotion:...> 即時切換 10 種情緒差分與立繪節奏。',
    defaultEnabled: true,
    hooks: {}
  },
  {
    id: 'voice',
    name: '英式 Glassy 語音配音（D20）',
    nameEn: 'British Glassy Voice TTS (D20)',
    version: '2.1.0',
    builtin: true,
    category: 'audio',
    description: '中文字幕搭配 en-GB Glassy 聲線角色配音，支援外部神經網路 TTS 與瀏覽器本機語音。',
    defaultEnabled: true,
    hooks: {}
  },
  {
    id: 'bgm',
    name: '原創九首圖書館配樂',
    nameEn: 'Original 9-Track Library BGM',
    version: '2.1.0',
    builtin: true,
    category: 'audio',
    description: '隨場景與時段無縫交叉淡入淡出 9 首原創配樂，語音朗讀時自動壓低音量。',
    defaultEnabled: true,
    hooks: {}
  },
  {
    id: 'ambience',
    name: '程序化環境音景',
    nameEn: 'Procedural Ambience Engine',
    version: '2.1.0',
    builtin: true,
    category: 'audio',
    description: '以 Web Audio 即時合成雨聲、風聲、翻書聲與圖書館夜鐘環境音。',
    defaultEnabled: true,
    hooks: {}
  },
  {
    id: 'worldbook',
    name: '世界書與宏展開引擎',
    nameEn: 'WorldBook & Macro Engine',
    version: '2.1.0',
    builtin: true,
    category: 'prompt',
    description: '關鍵詞命中時動態注入辭典條目，並於提示詞前展開 {{char}} / {{user}} 等宏變數。',
    defaultEnabled: true,
    hooks: {}
  },
  {
    id: 'backlog',
    name: '對話回顧與語音重聽',
    nameEn: 'VN Backlog & Voice Replay',
    version: '2.1.0',
    builtin: true,
    category: 'ui',
    description: '快速鍵 H 開啟最近 30 回合對話紀錄，並支援單句英式配音重聽。',
    defaultEnabled: true,
    hooks: {}
  },
  {
    id: 'cards',
    name: '多角色卡同台演出引擎',
    nameEn: 'Multi-Character Card Stage',
    version: '2.1.0',
    builtin: true,
    category: 'vn',
    description: '匯入 PNG/JSON 角色卡並與 VN 劇本解析器聯動，逐句自動辨識角色說話人與名牌。',
    defaultEnabled: true,
    hooks: {}
  }
]);

function safePluginId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * 將宣告式 JSON 插件規格編譯為可執行的 Hook 物件。
 * 支援欄位：
 * - id, name, version, description
 * - promptAppend: string（於 onPrompt 附加額外導演指示）
 * - lineRules: Array<{ keyword: string, emotion?: string, scene?: string }>
 */
export function compileDeclarativePlugin(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('插件規格必須為 JSON 物件');
  }
  const rawName = String(spec.name || '').trim();
  const id = safePluginId(spec.id) || safePluginId(rawName) || (rawName ? ('custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)) : '');
  if (!id) throw new Error('插件缺少有效的 id 或 name');

  const name = String(spec.name || id).trim().slice(0, 60);
  const version = String(spec.version || '1.0.0').trim().slice(0, 24);
  const description = String(spec.description || '自訂宣告式插件').trim().slice(0, 240);
  const promptAppend = typeof spec.promptAppend === 'string' ? spec.promptAppend.trim().slice(0, 800) : '';
  const lineRules = Array.isArray(spec.lineRules)
    ? spec.lineRules
      .filter((r) => r && typeof r === 'object' && typeof r.keyword === 'string' && r.keyword.trim())
      .slice(0, 24)
      .map((r) => ({
        keyword: r.keyword.trim().slice(0, 40),
        emotion: r.emotion ? normalizeStoryEmotion(r.emotion) : null,
        scene: typeof r.scene === 'string' && r.scene.trim() ? r.scene.trim().slice(0, 40) : null
      }))
    : [];

  const hooks = {};
  if (promptAppend) {
    hooks.onPrompt = (ctx) => {
      if (ctx && Array.isArray(ctx.extraDirectives)) {
        ctx.extraDirectives.push(`[插件:${name}] ${promptAppend}`);
      }
    };
  }
  if (lineRules.length > 0) {
    hooks.onLine = (ctx) => {
      const text = String(ctx?.meta?.text || '');
      if (!text) return;
      for (const rule of lineRules) {
        if (text.includes(rule.keyword)) {
          if (rule.emotion && !ctx.meta.emotion) {
            ctx.meta.emotion = rule.emotion;
            ctx.meta.emotionSource = `plugin:${id}`;
          }
          if (rule.scene && !ctx.meta.scene) {
            ctx.meta.scene = rule.scene;
          }
          break;
        }
      }
    };
  }

  return {
    id,
    name,
    version,
    description,
    builtin: false,
    category: 'custom',
    declarativeSpec: { id, name, version, description, promptAppend, lineRules },
    defaultEnabled: spec.enabled !== false,
    hooks
  };
}

export class PluginRegistry {
  constructor(options = {}) {
    this.storage = options.storage !== undefined
      ? options.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    this.bus = options.bus || claudeBus;
    this.plugins = new Map();
    this.persisted = this._loadPersistedState();

    if (options.registerBuiltins !== false) {
      for (const def of BUILTIN_PLUGIN_MANIFESTS) {
        this.register(def, { silent: true });
      }
    }
    this._restoreDeclarativePlugins();
  }

  _loadPersistedState() {
    const empty = { enabledMap: {}, configs: {}, customSpecs: [] };
    if (!this.storage) return empty;
    try {
      const raw = this.storage.getItem(STORAGE_KEY_PLUGINS);
      if (!raw) return empty;
      const parsed = JSON.parse(raw);
      return {
        enabledMap: parsed && typeof parsed.enabledMap === 'object' && parsed.enabledMap ? { ...parsed.enabledMap } : {},
        configs: parsed && typeof parsed.configs === 'object' && parsed.configs ? { ...parsed.configs } : {},
        customSpecs: Array.isArray(parsed?.customSpecs) ? parsed.customSpecs.slice(0, 24) : []
      };
    } catch (_) {
      return empty;
    }
  }

  _savePersistedState() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY_PLUGINS, JSON.stringify(this.persisted));
    } catch (_) {}
  }

  _restoreDeclarativePlugins() {
    for (const spec of this.persisted.customSpecs) {
      try {
        const compiled = compileDeclarativePlugin(spec);
        this.register(compiled, { silent: true, skipPersistSpec: true });
      } catch (_) {}
    }
  }

  /**
   * 註冊一個插件（內建或自訂）
   */
  register(def, opts = {}) {
    if (!def || typeof def !== 'object') {
      throw new Error('無效的插件定義');
    }
    const id = safePluginId(def.id);
    if (!id) throw new Error('插件 id 不可為空');

    const hooks = {};
    if (def.hooks && typeof def.hooks === 'object') {
      for (const hookName of PLUGIN_HOOK_NAMES) {
        if (typeof def.hooks[hookName] === 'function') {
          hooks[hookName] = def.hooks[hookName];
        }
      }
    }

    const persistedEnabled = Object.prototype.hasOwnProperty.call(this.persisted.enabledMap, id)
      ? Boolean(this.persisted.enabledMap[id])
      : (def.defaultEnabled !== false);

    const record = {
      id,
      name: String(def.name || id).trim().slice(0, 60),
      nameEn: String(def.nameEn || def.name || id).trim().slice(0, 80),
      version: String(def.version || '1.0.0').trim().slice(0, 24),
      description: String(def.description || '').trim().slice(0, 240),
      category: String(def.category || 'custom'),
      builtin: Boolean(def.builtin),
      enabled: persistedEnabled,
      hooks,
      declarativeSpec: def.declarativeSpec || null,
      config: { ...(def.defaultConfig || {}), ...(this.persisted.configs[id] || {}) },
      errorCount: 0,
      lastError: null,
      invocations: 0
    };

    this.plugins.set(id, record);

    if (record.declarativeSpec && !opts.skipPersistSpec) {
      this.persisted.customSpecs = this.persisted.customSpecs.filter((s) => safePluginId(s.id) !== id);
      this.persisted.customSpecs.push(record.declarativeSpec);
      this._savePersistedState();
    }

    if (!opts.silent) {
      this.bus.emit('plugin:registered', { id, name: record.name, builtin: record.builtin });
    }
    return this.getSnapshot(id);
  }

  /**
   * 以 JSON 字串或物件註冊宣告式自訂插件
   */
  importDeclarativePlugin(rawSpec) {
    const parsed = typeof rawSpec === 'string' ? JSON.parse(rawSpec) : rawSpec;
    const compiled = compileDeclarativePlugin(parsed);
    if (this.plugins.has(compiled.id) && this.plugins.get(compiled.id).builtin) {
      throw new Error(`無法覆蓋內建核心插件「${compiled.id}」`);
    }
    return this.register(compiled);
  }

  /**
   * 移除非內建插件
   */
  unregister(id) {
    const safeId = safePluginId(id);
    const rec = this.plugins.get(safeId);
    if (!rec) return false;
    if (rec.builtin) {
      throw new Error('內建核心插件不可刪除，只能切換停用');
    }
    this.plugins.delete(safeId);
    delete this.persisted.enabledMap[safeId];
    delete this.persisted.configs[safeId];
    this.persisted.customSpecs = this.persisted.customSpecs.filter((s) => safePluginId(s.id) !== safeId);
    this._savePersistedState();
    this.bus.emit('plugin:unregistered', { id: safeId, name: rec.name });
    return true;
  }

  /**
   * 切換插件啟用狀態
   */
  setEnabled(id, enabled) {
    const safeId = safePluginId(id);
    const rec = this.plugins.get(safeId);
    if (!rec) return false;
    rec.enabled = Boolean(enabled);
    this.persisted.enabledMap[safeId] = rec.enabled;
    this._savePersistedState();
    this.bus.emit('plugin:toggled', { id: safeId, enabled: rec.enabled, name: rec.name });
    return true;
  }

  isEnabled(id) {
    const rec = this.plugins.get(safePluginId(id));
    return rec ? Boolean(rec.enabled) : false;
  }

  getConfig(id) {
    const rec = this.plugins.get(safePluginId(id));
    return rec ? { ...rec.config } : {};
  }

  setConfig(id, patch) {
    const safeId = safePluginId(id);
    const rec = this.plugins.get(safeId);
    if (!rec || !patch || typeof patch !== 'object') return false;
    rec.config = { ...rec.config, ...patch };
    this.persisted.configs[safeId] = { ...rec.config };
    this._savePersistedState();
    this.bus.emit('plugin:config', { id: safeId });
    return true;
  }

  /**
   * 執行特定生命週期 Hook（具備嚴格錯誤隔離）
   */
  runHook(hookName, ctx = {}) {
    if (!PLUGIN_HOOK_NAMES.includes(hookName)) return ctx;
    for (const rec of this.plugins.values()) {
      if (!rec.enabled) continue;
      const fn = rec.hooks[hookName];
      if (typeof fn !== 'function') continue;
      try {
        rec.invocations += 1;
        fn(ctx, { id: rec.id, config: rec.config, bus: this.bus });
      } catch (err) {
        rec.errorCount += 1;
        rec.lastError = String(err && err.message ? err.message : err);
        this.bus.emit('plugin:error', {
          id: rec.id,
          hook: hookName,
          message: rec.lastError
        });
      }
    }
    return ctx;
  }

  getSnapshot(id) {
    const rec = this.plugins.get(safePluginId(id));
    if (!rec) return null;
    return {
      id: rec.id,
      name: rec.name,
      nameEn: rec.nameEn,
      version: rec.version,
      description: rec.description,
      category: rec.category,
      builtin: rec.builtin,
      enabled: rec.enabled,
      hookNames: Object.keys(rec.hooks),
      errorCount: rec.errorCount,
      lastError: rec.lastError,
      invocations: rec.invocations,
      hasDeclarativeSpec: Boolean(rec.declarativeSpec)
    };
  }

  list() {
    return [...this.plugins.keys()].map((id) => this.getSnapshot(id));
  }

  getSummary() {
    const all = this.list();
    return {
      total: all.length,
      enabled: all.filter((p) => p.enabled).length,
      custom: all.filter((p) => !p.builtin).length,
      totalErrors: all.reduce((sum, p) => sum + p.errorCount, 0)
    };
  }
}

export const pluginRegistry = new PluginRegistry();
