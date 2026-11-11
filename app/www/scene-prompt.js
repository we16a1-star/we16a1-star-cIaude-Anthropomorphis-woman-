// 場景插圖提示詞（純函式，可單獨測試）。
// 修正兩個問題：①原本寫死預設女主角與「雨夜圖書館」，自訂人設／世界觀後插圖會和故事矛盾；
// ②原本直接貼整段旁白（最多 1800 字）又沒指定構圖，網站常產生方形圖，被舞台裁切。

export const SCENE_NARRATION_CHARS = 800;   // 只取旁白結尾：那是「目前場景」的狀態
const CUSTOM_PROFILE_CHARS = 600;
const CUSTOM_WORLD_CHARS = 300;

const DEFAULT_APPEARANCE_ZH = '女主角是成年女性，固定外觀為極長暖橘紅色長髮、琥珀棕眼睛、橘色花朵髮飾搭配黑色蝴蝶結與流蘇、白色高領荷葉邊古典洋裝、黑色腰封、黑橘拼接長裙、白色繫帶短靴，手持深褐色皮革厚書。';
const DEFAULT_APPEARANCE_EN = 'the adult heroine keeps the same design: very long warm auburn hair, amber-brown eyes, orange flower hair ornament with black bow and tassels, white high-neck ruffled classical dress, black waist sash, long black-and-orange skirt, white lace-up ankle boots, holding a thick dark-brown leather-bound book.';
const DEFAULT_MOOD_ZH = '營造雨夜古老圖書館的浪漫氛圍';
const DEFAULT_MOOD_EN = 'Romantic old-library atmosphere with rainy-night window light';

// 取旁白結尾並從乾淨的句子開頭起算，避免半句話開頭。
export function condenseScene(narration, limit = SCENE_NARRATION_CHARS) {
  const text = String(narration ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const tail = text.slice(-limit);
  const boundary = /[。！？!?…」』）)]\s*/.exec(tail);
  return (boundary && boundary.index < limit * 0.4 ? tail.slice(boundary.index + boundary[0].length) : tail).trim();
}

const isCustom = (value, fallback) => {
  const text = String(value ?? '').trim();
  return Boolean(text) && text !== String(fallback ?? '').trim();
};

export function buildSceneImagePrompt({
  language = 'zh', narration = '', characterName = '',
  characterProfile = '', defaultProfile = '', worldSetting = '', defaultWorld = ''
} = {}) {
  const scene = condenseScene(narration) || (language === 'en' ? 'A rainy night in an old library reading room' : '雨夜中的古老圖書館閱覽室');
  const customCharacter = isCustom(characterProfile, defaultProfile);
  const customWorld = isCustom(worldSetting, defaultWorld);
  const name = String(characterName ?? '').trim().slice(0, 60);
  const profile = String(characterProfile ?? '').trim().slice(0, CUSTOM_PROFILE_CHARS);
  const world = String(worldSetting ?? '').trim().slice(0, CUSTOM_WORLD_CHARS);

  if (language === 'en') {
    const character = customCharacter
      ? `All characters are adults. Character design${name ? ` for ${name}` : ''}, follow this closely: ${profile}`
      : `Keep ${DEFAULT_APPEARANCE_EN} Do not invent extra accessories or change her outfit.`;
    const mood = customWorld ? `World and mood: ${world}` : DEFAULT_MOOD_EN + '.';
    return `Create one polished visual-novel scene illustration for this exact story moment. One complete image only. No lettering, captions, speech bubbles, logos, or watermark. ${character} ${mood} Detailed painterly anime illustration in a wide landscape composition (about 3:2): keep the characters and the key action near the center, with room to crop the top and bottom edges. Story scene: ${scene}`;
  }
  const character = customCharacter
    ? `所有角色皆為成年人。角色${name ? `「${name}」` : ''}的外觀與氣質請嚴格依照以下設定：${profile}`
    : `${DEFAULT_APPEARANCE_ZH}不可任意改變服裝或增加不存在的配件。`;
  const mood = customWorld ? `世界觀與氛圍：${world}` : DEFAULT_MOOD_ZH;
  return `請為這段故事情境生成一張戀愛文字小說用的場景插圖。只生成一張完整插圖，不要文字、字幕、對話框、標誌或浮水印。${character}${mood}，以細膩插畫風格呈現，橫向寬幅構圖（約 3:2），人物與重點動作放在畫面中央，上下邊緣留白以便裁切。故事情境：${scene}`;
}
