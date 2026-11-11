// 圖片處理（人物圖＋場景插圖）：容量與尺寸上限定義在最上面。場景圖優先壓成 WebP，
// 瀏覽器不支援時自動退回 JPEG；超過容量先降畫質、再縮尺寸（最多 8 次）。
// 純前端（canvas）產生 Blob／DataURL，後續由 app.js 寫入存檔或 IndexedDB。
export const MAX_CHARACTER_PORTRAIT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SCENE_IMAGE_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_SCENE_IMAGE_BLOB_BYTES = 900 * 1024;
const MAX_SCENE_DIMENSION = 1600;

// 場景插圖：優先編成 WebP（同畫質約比 JPEG 小三成），瀏覽器不支援 WebP 編碼時自動退回 JPEG；
// 超過容量就先降畫質、再縮小尺寸，最多試 8 次。
const SCENE_WEBP_QUALITY = [0.86, 0.8, 0.74, 0.68];
const SCENE_JPEG_QUALITY = [0.9, 0.86, 0.82, 0.78];

export async function encodeSceneIllustration(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('請選擇圖片檔案。');
  if (String(file.type || '').toLowerCase() === 'image/svg+xml') throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
  if (file.size > MAX_SCENE_IMAGE_FILE_BYTES) throw new Error('圖片太大，請選擇 12 MB 以下的檔案。');
  if (typeof createImageBitmap !== 'function') throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');

  let bitmap = null;
  try {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
    }
    if (!bitmap.width || !bitmap.height) throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('目前無法處理這張圖片。');

    let format = 'image/webp';
    let scale = Math.min(1, MAX_SCENE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#f5efe3';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const step = Math.min(attempt, 3);
      let blob = await canvasToBlob(canvas, format, format === 'image/webp' ? SCENE_WEBP_QUALITY[step] : SCENE_JPEG_QUALITY[step]);
      if (blob && format === 'image/webp' && blob.type !== 'image/webp') {   // 不支援 WebP 編碼：退回 JPEG
        format = 'image/jpeg';
        blob = await canvasToBlob(canvas, format, SCENE_JPEG_QUALITY[step]);
      }
      if (!blob) throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
      if (blob.size <= MAX_SCENE_IMAGE_BLOB_BYTES) return blob;
      if (attempt >= 3) scale *= 0.85;   // 前 4 次只降畫質，之後才縮小尺寸
    }
    throw new Error('圖片壓縮後仍超過存檔容量，請選擇較小圖片。');
  } finally {
    bitmap?.close?.();
  }
}
function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
export const MAX_CHARACTER_PORTRAIT_DATA_URL_LENGTH = 280 * 1024;
const MAX_PORTRAIT_BYTES = 200 * 1024;

export function normalizeCharacterPortrait(value) {
  if (typeof value !== 'string' || value.length > MAX_CHARACTER_PORTRAIT_DATA_URL_LENGTH) return '';
  return /^data:image\/(?:jpe?g|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。'));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function encodeCharacterPortrait(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('請選擇圖片檔案。');
  if (String(file.type || '').toLowerCase() === 'image/svg+xml') throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
  if (file.size > MAX_CHARACTER_PORTRAIT_FILE_BYTES) throw new Error('圖片太大，請選擇 20 MB 以下的檔案。');
  if (typeof createImageBitmap !== 'function') throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('目前無法處理這張圖片。');

    let scale = Math.min(1, 960 / bitmap.width, 1280 / bitmap.height);
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#f5efe3';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = [0.86, 0.78, 0.70, 0.62][Math.min(attempt, 3)];
      const blob = await canvasToJpeg(canvas, quality);
      if (!blob) throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
      if (blob.size <= MAX_PORTRAIT_BYTES) {
        const dataUrl = await blobToDataUrl(blob);
        if (normalizeCharacterPortrait(dataUrl)) return dataUrl;
        throw new Error('圖片壓縮後仍超過存檔容量。');
      }
      scale *= attempt >= 3 ? 0.78 : 1;
    }
    throw new Error('圖片壓縮後仍超過存檔容量，請選擇較小圖片。');
  } catch (error) {
    if (error instanceof Error && /圖片|存檔容量|無法處理/.test(error.message)) throw error;
    throw new Error('圖片格式無法讀取，請改用 JPG、PNG 或 WebP。');
  } finally {
    bitmap?.close?.();
  }
}
