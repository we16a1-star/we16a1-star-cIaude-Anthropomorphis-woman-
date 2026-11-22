/**
 * character-card-importer.js — 角色卡匯入、解析與快速建立模組
 *
 * 解析規範借鏡 SillyTavern / AnimaVN `importer/cards.py`（MIT License），
 * 以純瀏覽器與 Node 雙棲 Uint8Array / DataView 獨立實作（零外部相依）：
 * 1. PNG 角色卡（支援 `ccv3` 與 `chara` tEXt / iTXt chunk Base64 UTF-8 JSON，自動擷取縮圖）
 * 2. JSON 角色卡（支援 SillyTavern V1 / V2 / V3 結構與本作角色卡格式）
 * 3. 自動抽取內嵌世界書（character_book.entries）供一鍵匯入辭典
 * 4. 內建快速建卡器與角色卡 VN 開場台詞產出器
 */

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_INLINE_AVATAR_BYTES = 512 * 1024; // 512 KB 上限，避免塞爆 localStorage

function bytesToLatin1(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return out;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64');
  }
  return btoa(bytesToLatin1(bytes));
}

function decodeBase64Utf8(b64) {
  const cleaned = String(b64 || '').replace(/\s+/g, '');
  if (!cleaned) throw new Error('角色卡 Base64 資料為空');
  const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4);
  let bytes;
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    bytes = new Uint8Array(Buffer.from(padded, 'base64'));
  } else {
    const bin = atob(padded);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return text.replace(/^\uFEFF/, '');
}

/**
 * 檢查是否為合法 PNG 檔頭
 */
export function isPngBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== PNG_SIG[i]) return false;
  }
  return true;
}

/**
 * 解析 PNG 檔內嵌的 `ccv3` / `chara` 角色卡 JSON
 * @param {ArrayBuffer|Uint8Array} rawBytes
 * @returns {{ raw: object, spec: string, chunkKey: string, avatarDataUrl: string }}
 */
export function parsePngCharacterCard(rawBytes) {
  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes || 0);
  if (!isPngBytes(bytes)) {
    throw new Error('檔案不是有效的 PNG 圖片格式');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  const textChunks = new Map();

  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos, false);
    const type = bytesToLatin1(bytes.subarray(pos + 4, pos + 8));
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;

    if (type === 'tEXt') {
      const payload = bytes.subarray(dataStart, dataEnd);
      const nul = payload.indexOf(0);
      if (nul > 0) {
        const key = bytesToLatin1(payload.subarray(0, nul)).toLowerCase();
        const val = bytesToLatin1(payload.subarray(nul + 1));
        if (key === 'ccv3' || key === 'chara') {
          textChunks.set(key, val);
        }
      }
    } else if (type === 'iTXt') {
      const payload = bytes.subarray(dataStart, dataEnd);
      const nul = payload.indexOf(0);
      if (nul > 0 && nul + 3 < payload.length) {
        const key = bytesToLatin1(payload.subarray(0, nul)).toLowerCase();
        const compFlag = payload[nul + 1];
        if ((key === 'ccv3' || key === 'chara') && compFlag === 0) {
          // 跳過 language tag 與 translated keyword 兩個 NUL 分隔欄位
          let idx = nul + 3;
          const nul2 = payload.indexOf(0, idx);
          if (nul2 !== -1) {
            const nul3 = payload.indexOf(0, nul2 + 1);
            if (nul3 !== -1) {
              const val = new TextDecoder('utf-8').decode(payload.subarray(nul3 + 1));
              textChunks.set(key, val);
            }
          }
        }
      }
    } else if (type === 'IEND') {
      break;
    }

    pos = dataEnd + 4; // 跳過 CRC
  }

  const chunkKey = textChunks.has('ccv3') ? 'ccv3' : (textChunks.has('chara') ? 'chara' : '');
  if (!chunkKey) {
    throw new Error('這張 PNG 沒有內嵌角色卡資料（找不到 ccv3 或 chara 區塊）');
  }

  const rawPayload = textChunks.get(chunkKey);
  let jsonText = rawPayload.trim();
  if (!jsonText.startsWith('{')) {
    jsonText = decodeBase64Utf8(jsonText);
  }
  const raw = JSON.parse(jsonText);
  const avatarDataUrl = bytes.length <= MAX_INLINE_AVATAR_BYTES
    ? `data:image/png;base64,${bytesToBase64(bytes)}`
    : '';

  return {
    raw,
    spec: detectCardSpec(raw, chunkKey),
    chunkKey,
    avatarDataUrl
  };
}

/**
 * 解析 JSON 格式角色卡（支援 V1/V2/V3 與本作角色卡格式）
 */
export function parseJsonCharacterCard(rawTextOrObj) {
  const raw = typeof rawTextOrObj === 'string'
    ? JSON.parse(rawTextOrObj.replace(/^\uFEFF/, ''))
    : rawTextOrObj;
  if (!raw || typeof raw !== 'object') {
    throw new Error('角色卡 JSON 必須為物件格式');
  }
  return {
    raw,
    spec: detectCardSpec(raw),
    chunkKey: 'json',
    avatarDataUrl: typeof raw.avatar === 'string' && raw.avatar.startsWith('data:image/')
      ? raw.avatar
      : (typeof raw.data?.avatar === 'string' && raw.data.avatar.startsWith('data:image/') ? raw.data.avatar : '')
  };
}

function detectCardSpec(raw, hint = '') {
  if (typeof raw?.spec === 'string' && raw.spec.includes('v3')) return 'V3';
  if (typeof raw?.spec === 'string' && raw.spec.includes('v2')) return 'V2';
  if (hint === 'ccv3') return 'V3';
  if (raw?.data && typeof raw.data === 'object' && typeof raw.data.name === 'string') return 'V2';
  if (Array.isArray(raw?.sections) || Array.isArray(raw?.stats)) return 'ClaudeVN';
  return 'V1';
}

function extractWorldBookEntries(book) {
  if (!book || typeof book !== 'object') return [];
  const rawList = Array.isArray(book.entries)
    ? book.entries
    : (book.entries && typeof book.entries === 'object' ? Object.values(book.entries) : []);
  const out = [];
  for (const item of rawList.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const content = String(item.content || '').trim();
    if (!content) continue;
    const keys = Array.isArray(item.keys)
      ? item.keys.map((k) => String(k || '').trim()).filter(Boolean)
      : (Array.isArray(item.key) ? item.key.map((k) => String(k || '').trim()).filter(Boolean) : []);
    const title = String(item.name || item.comment || keys[0] || '匯入條目').trim().slice(0, 60);
    out.push({
      title,
      keys: keys.slice(0, 12),
      content: content.slice(0, 2000),
      constant: Boolean(item.constant),
      enabled: item.enabled !== false && item.disable !== true
    });
  }
  return out;
}

/**
 * 將解析後的 SillyTavern / AnimaVN / ClaudeVN 角色卡正規化為本作 `state.characterCards` 條目
 */
export function toGameCharacterCard(parsed) {
  const raw = parsed?.raw || parsed;
  if (!raw || typeof raw !== 'object') {
    throw new Error('無法轉換空白角色卡');
  }
  const spec = parsed?.spec || detectCardSpec(raw);
  const avatar = String(parsed?.avatarDataUrl || raw.avatar || '');

  // 本作原生格式直通
  if (spec === 'ClaudeVN') {
    const name = String(raw.name || '匯入角色').trim().slice(0, 60);
    return {
      id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name,
      tagline: String(raw.tagline || '').trim().slice(0, 120),
      quote: String(raw.quote || '').trim().slice(0, 240),
      stats: Array.isArray(raw.stats) ? raw.stats.slice(0, 12).map((s) => ({
        label: String(s?.label || '').trim().slice(0, 30),
        value: String(s?.value || '').trim().slice(0, 200)
      })).filter((s) => s.label || s.value) : [],
      sections: Array.isArray(raw.sections) ? raw.sections.slice(0, 12).map((s) => ({
        title: String(s?.title || '').trim().slice(0, 40),
        body: String(s?.body || '').trim().slice(0, 4000)
      })).filter((s) => s.title || s.body) : [],
      firstMes: String(raw.firstMes || raw.first_mes || '').trim().slice(0, 1600),
      avatar: avatar.startsWith('data:image/') ? avatar : '',
      sourceSpec: spec,
      worldBookEntries: extractWorldBookEntries(raw.character_book || raw.worldBook)
    };
  }

  // SillyTavern V1 / V2 / V3 格式
  const data = (raw.data && typeof raw.data === 'object') ? raw.data : raw;
  const name = String(data.name || raw.name || '未命名角色').trim().slice(0, 60);
  const creator = String(data.creator || raw.creator || '').trim();
  const tags = Array.isArray(data.tags) ? data.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : [];
  const description = String(data.description || '').trim();
  const personality = String(data.personality || '').trim();
  const scenario = String(data.scenario || '').trim();
  const firstMes = String(data.first_mes || '').trim();
  const mesExample = String(data.mes_example || '').trim();
  const systemPrompt = String(data.system_prompt || '').trim();

  const tagline = (personality || description.split(/\n+/)[0] || `${spec} 匯入角色卡`).slice(0, 120);
  const quote = firstMes ? firstMes.split(/\n+/)[0].slice(0, 200) : '';

  const stats = [];
  if (creator) stats.push({ label: '作者', value: creator.slice(0, 60) });
  if (tags.length) stats.push({ label: '標籤', value: tags.join(' / ').slice(0, 140) });
  stats.push({ label: '規格', value: `Character Card ${spec}` });

  const sections = [];
  if (description) sections.push({ title: '角色設定與外觀', body: description.slice(0, 4000) });
  if (personality) sections.push({ title: '性格特質', body: personality.slice(0, 2000) });
  if (scenario) sections.push({ title: '背景情境', body: scenario.slice(0, 2000) });
  if (mesExample) sections.push({ title: '對話範例', body: mesExample.slice(0, 2000) });
  if (systemPrompt) sections.push({ title: '補充演出指示', body: systemPrompt.slice(0, 1200) });

  const worldBookEntries = extractWorldBookEntries(data.character_book || raw.character_book);

  return {
    id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name,
    tagline,
    quote,
    stats,
    sections,
    firstMes: firstMes.slice(0, 1600),
    avatar: avatar.startsWith('data:image/') ? avatar : '',
    sourceSpec: spec,
    worldBookEntries
  };
}

/**
 * 快速建立一張可直接參與同台與 VN 試播的角色卡
 */
export function createQuickCharacterCard({
  name = '',
  tagline = '',
  personality = '',
  speakingStyle = '',
  firstMes = ''
} = {}) {
  const cleanName = String(name || '').trim().slice(0, 60);
  if (!cleanName) throw new Error('請輸入角色名稱');
  const cleanTagline = String(tagline || '').trim().slice(0, 120) || '圖書館的新訪客';
  const cleanPersonality = String(personality || '').trim().slice(0, 2000);
  const cleanStyle = String(speakingStyle || '').trim().slice(0, 800);
  const cleanFirstMes = String(firstMes || '').trim().slice(0, 1600)
    || `<emotion:curious>${cleanName}：「你好，這座圖書館比傳聞中還要安靜呢。」`;

  const stats = [{ label: '來源', value: '快速建卡' }];
  if (cleanStyle) stats.push({ label: '口吻', value: cleanStyle.slice(0, 120) });

  const sections = [];
  if (cleanPersonality) sections.push({ title: '性格與背景', body: cleanPersonality });
  if (cleanStyle) sections.push({ title: '說話風格', body: cleanStyle });

  return {
    id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: cleanName,
    tagline: cleanTagline,
    quote: cleanFirstMes.replace(/<[^>]+>/g, '').slice(0, 200),
    stats,
    sections,
    firstMes: cleanFirstMes,
    avatar: '',
    sourceSpec: 'QuickCard',
    worldBookEntries: []
  };
}

/**
 * 角色頁的角色卡匯入（PNG/JSON）、快速建卡與 VN 逐句試播控制器
 */
export function createCharacterCardUiController(ctx) {
  const {
    $,
    uiText,
    getState,
    defaultCharacterName,
    characterCardsList,
    usedCharacterCardIds,
    selectedCharacterCards,
    normalizeWorldBook,
    mergeWorldBookEntries,
    save,
    render,
    claudeBus,
    pluginRegistry,
    parseVnScript,
    LineRunner
  } = ctx;

  let auditionRunner = null;

  async function importCharacterCardFile(file) {
    const statusEl = $('sheetCardIoStatus');
    if (!file) return;
    const cards = characterCardsList();
    if (cards.length >= 12) {
      if (statusEl) statusEl.textContent = uiText('角色卡最多 12 張，請先刪除不需要的。');
      return;
    }
    try {
      const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
      const parsed = isPng
        ? parsePngCharacterCard(await file.arrayBuffer())
        : parseJsonCharacterCard(await file.text());
      const card = toGameCharacterCard(parsed);
      const wbEntries = Array.isArray(card.worldBookEntries) ? card.worldBookEntries : [];
      const cleanCard = { ...card };
      delete cleanCard.worldBookEntries;
      const state = getState();
      state.characterCards = [...cards, cleanCard];
      const used = usedCharacterCardIds();
      used.add(cleanCard.id);
      state.characterCardIds = [...used];
      let wbAdded = 0;
      if (wbEntries.length) {
        const currentWb = normalizeWorldBook(state.worldBook);
        const merged = mergeWorldBookEntries(currentWb.entries, wbEntries);
        wbAdded = Math.max(0, merged.length - currentWb.entries.length);
        state.worldBook = { ...currentWb, enabled: true, entries: merged };
      }
      save();
      render();
      claudeBus.emit('card:imported', { name: cleanCard.name, spec: cleanCard.sourceSpec, wbAdded });
      if (statusEl) {
        statusEl.textContent = `已匯入角色卡「${cleanCard.name}」（${cleanCard.sourceSpec}）並加入同台演出`
          + (wbAdded ? `，同時匯入 ${wbAdded} 筆內嵌世界書條目` : '') + '。';
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = uiText('匯入角色卡失敗：') + (err?.message || err);
    }
  }

  function toggleQuickCardBox(forceOpen) {
    const box = $('sheetQuickCardBox');
    if (!box) return;
    const next = typeof forceOpen === 'boolean' ? forceOpen : box.hidden;
    box.hidden = !next;
    if (next) $('quickCardName')?.focus();
  }

  function submitQuickCharacterCard() {
    const statusEl = $('sheetCardIoStatus');
    const cards = characterCardsList();
    if (cards.length >= 12) {
      if (statusEl) statusEl.textContent = uiText('角色卡最多 12 張，請先刪除不需要的。');
      return;
    }
    try {
      const card = createQuickCharacterCard({
        name: $('quickCardName')?.value || '',
        tagline: $('quickCardTagline')?.value || '',
        personality: $('quickCardPersonality')?.value || '',
        speakingStyle: $('quickCardStyle')?.value || '',
        firstMes: $('quickCardFirstMes')?.value || ''
      });
      delete card.worldBookEntries;
      const state = getState();
      state.characterCards = [...cards, card];
      const used = usedCharacterCardIds();
      used.add(card.id);
      state.characterCardIds = [...used];
      save();
      render();
      toggleQuickCardBox(false);
      ['quickCardName', 'quickCardTagline', 'quickCardPersonality', 'quickCardStyle', 'quickCardFirstMes'].forEach((id) => {
        const el = $(id);
        if (el) el.value = '';
      });
      claudeBus.emit('card:imported', { name: card.name, spec: card.sourceSpec, wbAdded: 0 });
      if (statusEl) statusEl.textContent = `已建立並啟用角色卡「${card.name}」，可按「▶ VN 逐句試播」立即預覽演出。`;
    } catch (err) {
      if (statusEl) statusEl.textContent = uiText('建立角色卡失敗：') + (err?.message || err);
    }
  }

  function auditionCharacterCard() {
    const box = $('sheetCardAuditionBox');
    const spEl = $('sheetAuditionSpeaker');
    const metaEl = $('sheetAuditionMeta');
    const txtEl = $('sheetAuditionText');
    if (!box || !spEl || !metaEl || !txtEl) return;
    const state = getState();
    const active = selectedCharacterCards();
    const all = characterCardsList();
    const target = active[active.length - 1] || all[all.length - 1] || null;
    const mainName = state.characterName || defaultCharacterName;
    const script = target
      ? (target.firstMes || `<emotion:curious>${target.name}：「${target.quote || target.tagline || '初次見面，請多指教。'}」\n<emotion:tender>${mainName}：「歡迎來到知識之塔的圖書館，${target.name}。」`)
      : `<emotion:curious>${mainName}：「還沒有新增角色卡喔？試著匯入 PNG／JSON 角色卡或使用快速建卡，我就能與新夥伴同台演出。」`;
    const parsed = parseVnScript(script, {
      charName: mainName,
      extraCharNames: all.map((c) => ({ id: c.id, name: c.name })),
      userName: state.playerName || 'User'
    });
    box.hidden = false;
    if (!auditionRunner) {
      auditionRunner = new LineRunner({ speed: 28, autoAdvance: true, autoDelay: 1600 });
    }
    auditionRunner.enabled = true;
    txtEl.onclick = () => auditionRunner?.advance();
    auditionRunner.start(parsed.lines, {
      onLineMeta: (meta, idx, total) => {
        pluginRegistry.runHook('onLine', { meta, index: idx, total, state });
        spEl.textContent = meta.speaker || mainName;
        metaEl.textContent = `(${idx + 1}/${total}) · ${meta.kind}` + (meta.emotion ? ` · ${meta.emotion}` : '');
      },
      onLineChange: (displayed) => { txtEl.textContent = displayed; },
      onFinish: () => { metaEl.textContent += ' · 試播完成'; }
    });
  }

  function stopAudition() {
    auditionRunner?.stop();
  }

  return { importCharacterCardFile, toggleQuickCardBox, submitQuickCharacterCard, auditionCharacterCard, stopAudition };
}

