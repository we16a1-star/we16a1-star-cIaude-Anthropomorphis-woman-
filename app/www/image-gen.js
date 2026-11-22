/**
 * image-gen.js — API 場景圖片生成與自動匯入舞台模組
 *
 * 功能：
 * 1. 透過本機 Express 後端 `POST /api/image` 支援 Gemini / Imagen、OpenAI Images
 *    與自訂相容端點（OpenAI 相容或本機 SD WebUI / Forge `/sdapi/v1/txt2img`）。
 * 2. 自動附上 Claude娘官方三視圖外觀鎖定與日系古籍圖書館畫風一致性提示詞（無眼鏡）。
 * 3. 將 API 回傳的 Base64 Data URL 轉成標準 File/Blob，直接交給 `importSceneIllustration`
 *    自動套用至目前故事舞台並保存於 IndexedDB。
 * 4. 支援與 VN 劇本解析器（vn-script.js）及逐句演出引擎（LineRunner）聯動：
 *    當劇本出現 `<image:...>` 或 `<cg:...>` 標籤時可自動觸發生成與匯入（內建去重與防重入鎖）。
 */

import { claudeBus } from './event-bus.js';

export const STORAGE_KEY_IMAGE_GEN = 'claude_novel_image_gen_v1';

export const IMAGE_GEN_PROVIDERS = Object.freeze([
  { id: 'gemini', label: 'Gemini / Imagen API', defaultModel: 'gemini-2.5-flash-image' },
  { id: 'openai', label: 'OpenAI Images API', defaultModel: 'gpt-image-1' },
  { id: 'compatible', label: '自訂相容端點 / 本機 SD WebUI', defaultModel: 'flux' }
]);

export const IMAGE_GEN_SIZES = Object.freeze([
  { id: '1536x1024', label: '橫式舞台（1536×1024 · 推薦）' },
  { id: '1024x1024', label: '方形插圖（1024×1024）' },
  { id: '1024x1536', label: '直式特寫（1024×1536）' }
]);

const DEFAULT_CONFIG = Object.freeze({
  provider: 'gemini',
  model: 'gemini-2.5-flash-image',
  size: '1536x1024',
  baseUrl: '',
  autoOnVnTag: false,
  lockCharacterDesign: true
});

// 依官方三視圖與 7 張原版立繪／CG 鎖定 Claude娘外觀與眼型神韻，防止畫風甜妹化、服裝跑偏或誤加眼鏡
const CLAUDE_DESIGN_LOCK =
  'Refined Japanese visual-novel anime illustration with ultra-fine delicate warm-brown lineart and luminous soft watercolor-cel shading. ' +
  'Character Claude-chan (slender mature 18yo young woman, cool-intellectual librarian aura): ' +
  'delicate pointed oval face, pale porcelain-ivory skin with seamless soft airbrushed peach-pink blush (NO anime hatch/slash lines), ' +
  'sleek narrow almond-shaped cool amber-gold eyes with crisp horizontal upper lashes and restrained poised expression (NOT oversized round moe eyes), ' +
  'small dainty refined mouth, NO GLASSES, vibrant copper-orange long wavy hair with wispy center-parted bangs and long cheek-framing strands, ' +
  'orange sun-daisy hair ornament with black silk bow and gold-beaded cream ribbon tassel on her left side, ' +
  'dainty hanging diamond-gem gold tassel drop earrings, ' +
  'cream-white Victorian ruffled high-collar blouse and capelet with orange sunburst shoulder embroidery, orange sun-daisy throat brooch, and gold-trimmed black silk ribbon cravat.';

function getStorage(storageOpt) {
  if (storageOpt !== undefined) return storageOpt;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/**
 * 將 data:image/...;base64,... 安全轉成 File（瀏覽器）或 Blob 結構（Node 測試環境）
 */
export function dataUrlToImageFile(dataUrl, filename = 'api-scene.png') {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('回傳的圖片資料不是有效的 Base64 Image Data URL');
  }
  const mime = match[1].toLowerCase();
  const b64 = match[2].replace(/\s+/g, '');
  let bytes;
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  } else {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  }
  if (typeof File === 'function') {
    return new File([bytes], filename, { type: mime });
  }
  return new Blob([bytes], { type: mime });
}

/**
 * 依三視圖設定與場景描述組裝最終 API 生圖提示詞
 */
export function buildEnhancedImagePrompt(scenePrompt, { lockCharacterDesign = true, extraCharNames = [] } = {}) {
  const core = String(scenePrompt || '').trim();
  if (!core) return '';
  const bits = [];
  if (lockCharacterDesign) bits.push(CLAUDE_DESIGN_LOCK);
  if (Array.isArray(extraCharNames) && extraCharNames.length > 0) {
    bits.push(`Co-starring characters present if mentioned: ${extraCharNames.join(', ')}.`);
  }
  bits.push(`Scene & mood: ${core}`);
  bits.push('No text, no speech bubbles, no UI, no watermarks.');
  return bits.join('\n');
}

export class SceneImageGenerator {
  constructor(options = {}) {
    this.storage = getStorage(options.storage);
    this.bus = options.bus || claudeBus;
    this.busy = false;
    this.lastPromptKey = '';
    this.config = this._loadConfig();
  }

  _loadConfig() {
    const base = { ...DEFAULT_CONFIG };
    if (!this.storage) return base;
    try {
      const raw = this.storage.getItem(STORAGE_KEY_IMAGE_GEN);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (IMAGE_GEN_PROVIDERS.some((p) => p.id === parsed.provider)) base.provider = parsed.provider;
        if (typeof parsed.model === 'string' && parsed.model.trim()) base.model = parsed.model.trim().slice(0, 80);
        if (IMAGE_GEN_SIZES.some((s) => s.id === parsed.size)) base.size = parsed.size;
        if (typeof parsed.baseUrl === 'string') base.baseUrl = parsed.baseUrl.trim().slice(0, 240);
        if (typeof parsed.autoOnVnTag === 'boolean') base.autoOnVnTag = parsed.autoOnVnTag;
        if (typeof parsed.lockCharacterDesign === 'boolean') base.lockCharacterDesign = parsed.lockCharacterDesign;
      }
    } catch (_) {}
    return base;
  }

  getConfig() {
    return { ...this.config };
  }

  saveConfig(patch = {}) {
    const next = { ...this.config };
    if (patch.provider && IMAGE_GEN_PROVIDERS.some((p) => p.id === patch.provider)) {
      const changed = patch.provider !== next.provider;
      next.provider = patch.provider;
      if (changed && !patch.model) {
        const def = IMAGE_GEN_PROVIDERS.find((p) => p.id === next.provider);
        if (def) next.model = def.defaultModel;
      }
    }
    if (typeof patch.model === 'string' && patch.model.trim()) next.model = patch.model.trim().slice(0, 80);
    if (patch.size && IMAGE_GEN_SIZES.some((s) => s.id === patch.size)) next.size = patch.size;
    if (typeof patch.baseUrl === 'string') next.baseUrl = patch.baseUrl.trim().slice(0, 240);
    if (typeof patch.autoOnVnTag === 'boolean') next.autoOnVnTag = patch.autoOnVnTag;
    if (typeof patch.lockCharacterDesign === 'boolean') next.lockCharacterDesign = patch.lockCharacterDesign;
    this.config = next;
    if (this.storage) {
      try { this.storage.setItem(STORAGE_KEY_IMAGE_GEN, JSON.stringify(next)); } catch (_) {}
    }
    return this.getConfig();
  }

  /**
   * 呼叫後端 POST /api/image 生圖並透過 importFile 回呼自動匯入舞台
   */
  async generateAndImport({
    prompt,
    apiBase = '',
    headers = {},
    accountProfile = '',
    extraCharNames = [],
    importFile = null,
    onStatus = null,
    fetchImpl = null,
    dedupeKey = ''
  } = {}) {
    if (this.busy) {
      return { ok: false, skipped: true, error: '目前已有圖片正在生成中，請稍候。' };
    }
    if (dedupeKey && dedupeKey === this.lastPromptKey) {
      return { ok: true, skipped: true };
    }
    const finalPrompt = buildEnhancedImagePrompt(prompt, {
      lockCharacterDesign: this.config.lockCharacterDesign,
      extraCharNames
    });
    if (!finalPrompt) {
      return { ok: false, error: '缺少圖片生成提示詞' };
    }

    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) return { ok: false, error: '目前環境不支援 fetch' };

    const url = `${String(apiBase || '').replace(/\/+$/, '')}/api/image`;
    this.busy = true;
    if (typeof onStatus === 'function') {
      onStatus(`正在透過 ${this.config.provider} (${this.config.model}) 生成場景插圖…`);
    }

    try {
      const res = await fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          provider: this.config.provider,
          model: this.config.model,
          size: this.config.size,
          baseUrl: this.config.provider === 'compatible' ? this.config.baseUrl : '',
          accountProfile,
          prompt: finalPrompt
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.dataUrl) {
        const msg = data?.error || `圖片生成 API 回傳 HTTP ${res.status}`;
        if (typeof onStatus === 'function') onStatus(`API 生圖失敗：${msg}`);
        this.bus.emit('image:error', { provider: this.config.provider, message: msg });
        return { ok: false, error: msg };
      }

      const file = dataUrlToImageFile(data.dataUrl, `api-scene-${Date.now()}.png`);
      if (typeof importFile === 'function') {
        await importFile(file, 'api');
      }
      if (dedupeKey) this.lastPromptKey = dedupeKey;
      const msg = `已完成 API 生圖並匯入舞台（${data.provider}/${data.model}，${data.latencyMs || 0} ms）`;
      if (typeof onStatus === 'function') onStatus(msg);
      this.bus.emit('image:generated', {
        provider: data.provider,
        model: data.model,
        latencyMs: data.latencyMs || 0,
        size: this.config.size
      });
      return { ok: true, file, dataUrl: data.dataUrl, latencyMs: data.latencyMs || 0, message: msg };
    } catch (err) {
      const msg = String(err?.message || err);
      if (typeof onStatus === 'function') onStatus(`API 生圖連線錯誤：${msg}`);
      this.bus.emit('image:error', { provider: this.config.provider, message: msg });
      return { ok: false, error: msg };
    } finally {
      this.busy = false;
    }
  }
}

export const sceneImageGenerator = new SceneImageGenerator();

/**
 * 於故事選單「🖼 場景與插圖」（#gmMenuScene）掛載 API 圖片生成與自動匯入面板
 */
export function ensureSceneApiImageGenUi(ctx) {
  if (typeof document === 'undefined') return null;
  let box = document.getElementById('apiImageGenBox');
  if (box) return box;
  const host = document.getElementById('gmMenuScene');
  if (!host) return null;

  const cfg = sceneImageGenerator.getConfig();
  box = document.createElement('div');
  box.id = 'apiImageGenBox';
  box.className = 'bg-adjust api-image-gen-box';
  box.innerHTML = `
<b class="bg-adjust-title">✨ API 圖片生成並自動匯入</b>
<p class="bg-adjust-note">直接呼叫本機後端 <code>/api/image</code> 生成插圖並套用到目前舞台，亦支援 VN 劇本 <code>&lt;image:...&gt;</code> 逐句標籤觸發。</p>
<label class="api-img-field">生圖供應商
  <select id="apiImageProvider">
    ${IMAGE_GEN_PROVIDERS.map((p) => `<option value="${p.id}"${p.id === cfg.provider ? ' selected' : ''}>${p.label}</option>`).join('')}
  </select>
</label>
<label class="api-img-field">模型名稱
  <input id="apiImageModel" type="text" maxlength="80" value="${cfg.model}" placeholder="gemini-2.5-flash-image">
</label>
<label class="api-img-field" id="apiImageBaseUrlRow"${cfg.provider === 'compatible' ? '' : ' hidden'}>自訂端點網址
  <input id="apiImageBaseUrl" type="url" maxlength="240" value="${cfg.baseUrl}" placeholder="http://127.0.0.1:7860/sdapi/v1/txt2img 或 https://.../v1">
</label>
<label class="api-img-field">畫幅比例
  <select id="apiImageSize">
    ${IMAGE_GEN_SIZES.map((s) => `<option value="${s.id}"${s.id === cfg.size ? ' selected' : ''}>${s.label}</option>`).join('')}
  </select>
</label>
<label class="api-img-field">自訂場景描述（留空＝自動依目前故事場景生成）
  <textarea id="apiImagePromptInput" rows="2" maxlength="800" placeholder="例如：雨夜古籍閱覽室，Claude娘提著煤油燈望向窗外"></textarea>
</label>
<label class="api-img-check"><input id="apiImageLockDesign" type="checkbox"${cfg.lockCharacterDesign ? ' checked' : ''}><span>鎖定三視圖外觀（奶油白披肩＋太陽菊頭飾＋無眼鏡）</span></label>
<label class="api-img-check"><input id="apiImageAutoVnTag" type="checkbox"${cfg.autoOnVnTag ? ' checked' : ''}><span>VN 逐句演出遇到 &lt;image:...&gt; 標籤時自動 API 生圖匯入</span></label>
<div class="bg-adjust-row">
  <button id="apiImageGenerateBtn" type="button">✨ API 生成並匯入舞台</button>
</div>
<p class="bg-adjust-note" id="apiImageGenStatus" role="status" aria-live="polite"></p>`;

  const bgBox = document.getElementById('bgAdjustBox');
  if (bgBox && bgBox.parentNode === host) {
    host.insertBefore(box, bgBox);
  } else {
    host.append(box);
  }

  const provEl = document.getElementById('apiImageProvider');
  const modelEl = document.getElementById('apiImageModel');
  const baseRow = document.getElementById('apiImageBaseUrlRow');
  const baseEl = document.getElementById('apiImageBaseUrl');
  const sizeEl = document.getElementById('apiImageSize');
  const lockEl = document.getElementById('apiImageLockDesign');
  const autoEl = document.getElementById('apiImageAutoVnTag');
  const promptEl = document.getElementById('apiImagePromptInput');
  const genBtn = document.getElementById('apiImageGenerateBtn');
  const statusEl = document.getElementById('apiImageGenStatus');

  const syncSave = () => {
    const updated = sceneImageGenerator.saveConfig({
      provider: provEl?.value,
      model: modelEl?.value,
      size: sizeEl?.value,
      baseUrl: baseEl?.value,
      lockCharacterDesign: Boolean(lockEl?.checked),
      autoOnVnTag: Boolean(autoEl?.checked)
    });
    if (baseRow) baseRow.hidden = updated.provider !== 'compatible';
  };

  if (provEl) provEl.onchange = () => {
    const def = IMAGE_GEN_PROVIDERS.find((p) => p.id === provEl.value);
    if (def && modelEl) modelEl.value = def.defaultModel;
    syncSave();
  };
  if (modelEl) modelEl.onchange = syncSave;
  if (baseEl) baseEl.onchange = syncSave;
  if (sizeEl) sizeEl.onchange = syncSave;
  if (lockEl) lockEl.onchange = syncSave;
  if (autoEl) autoEl.onchange = syncSave;

  if (genBtn) {
    genBtn.onclick = async () => {
      syncSave();
      genBtn.disabled = true;
      try {
        const manual = String(promptEl?.value || '').trim();
        const promptText = manual || ctx.buildDefaultScenePrompt();
        await sceneImageGenerator.generateAndImport({
          prompt: promptText,
          apiBase: ctx.apiBaseUrl(),
          headers: ctx.desktopApiHeaders(ctx.apiBaseUrl()),
          accountProfile: ctx.getAccountProfile(),
          extraCharNames: ctx.getExtraCharNames(),
          importFile: ctx.importSceneIllustration,
          onStatus: (msg) => {
            if (statusEl) statusEl.textContent = msg;
            const mainStatus = document.getElementById('sceneImageStatus');
            if (mainStatus) mainStatus.textContent = msg;
          }
        });
      } finally {
        genBtn.disabled = false;
      }
    };
  }

  return box;
}
