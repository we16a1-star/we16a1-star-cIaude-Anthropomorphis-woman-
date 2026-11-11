// 立繪動畫化（G19）：把故事畫面與開始畫面的靜態立繪，改用 WebGL「網格變形」播放。
// 做法近似 Live2D：同一張圖切成細網格，在頂點著色器裡依位置加上位移，不需要另外切圖層。
//   · 呼吸：上半身微微升降、胸口擴張
//   · 重心微晃：頭部帶動身體輕輕左右擺，頭部以頸為軸微傾
//   · 髮絲：依「橘髮顏色遮罩」只讓頭髮擺動（越靠髮尾越大），帶一點陣風起伏
//   · 裙擺：裙子中段的波浪擺動，靴子與腳底固定
//   · 眨眼（預設關閉，見 ENABLE_BLINK）：在眼睛周圍加一小塊補丁，眼皮由上往下蓋住眼睛（用眼睛正下方的膚色補上，再畫一條睫毛線；
//     隨機 2～6 秒一次，偶爾連眨兩下），網格完全不扭曲，因此沒有撕裂或髮絲錯位
//   · 說話：對話文字更新時頭部輕點（時間依字數）
//   · 視線：滑鼠位置帶動頭部極小幅度轉向
//   · 觸碰（G21）：點（或用手指點）立繪會依位置有不同反應——摸頭＝頭往下壓、歪向觸點再彈回；戳身體＝以觸點為中心凹陷再彈回；
//     碰到髮絲＝髮絲由上往下盪出一圈波；碰到裙子＝裙擺甩一下。只有點在角色有顏色的像素上才算（透明背景不算），
//     滑鼠移到角色身上時游標變成手指；點的地方會冒出一圈金色漣漪＋四芒星（純 CSS，style.css 的 G21 區段）。
//     表情窗（頭旁邊彈出圓形臉部特寫）：G43 起依好感度選四階圖（見 AFF_FACES）；退回時摸頭＝害羞、碰髮絲＝開心、戳身體／裙擺＝驚訝、連點＝暈（表情圖在 assets/expressions/）。
//     表情帶動作：驚訝＝跳兩下（一大一小）、開心＝小跳＋金色星光閃爍、暈＝左右抖動＋頭晃＋三顆星星繞著頭轉。
//     每次觸碰整個人還會「壓扁再彈回」（腳不動，0.62 秒）；摸頭時再浮起三顆愛心。
//     壓扁彈回的關鍵格數值與「摸頭浮出三顆愛心」的點子，參考自 claude-xiaoke（MIT，blackshoretuner），
//     以 WebGL／CSS 重新實作，沒有使用該專案的程式碼檔案或任何圖片；授權聲明見「第三方授權聲明-claude-xiaoke.txt」。
import { normalizeStoryEmotion, normalizeStoryEmotionIntensity } from './story-emotion.js';
//   · 故事畫面新增（G22）：待機時偶爾輕點頭、髮飾閃光；點書本會微傾、碰髮尾會俐落甩動、碰裙擺會短暫旋擺。
//   · 故事觸碰新增：長按立繪 0.65 秒會低頭、髮尾揚起，並在髮飾與臉旁觸發光點。
// 設計原則：
//   · 不動 app.js／app.bundle.js：只接手 #storyPortrait、#startPortrait 兩張 <img>，
//     建一個同 class 的 <canvas> 疊在原位，因此既有 CSS（定位、遮罩、進場動畫、窄視窗版面）全部沿用。
//   · 任何一步失敗（無 WebGL、圖片讀不到、掉幀嚴重、系統要求減少動態）都會退回原本的 <img>。
//   · 只有預設立繪套用髮絲／裙擺／眨眼；使用者換成自訂角色圖時只做呼吸與重心微晃。
const MAX_BACKING_HEIGHT = 1400;      // 畫布內部解析度上限（高）
const MIN_BACKING_HEIGHT = 640;       // 下限（太小會糊）
const FRAME_INTERVAL = 30;            // 毫秒；約 30 fps。動作都很緩慢，30 fps 看不出差別，但 CPU／GPU 與耗電少一半
const PAD_X = 0.025;                  // 左右各留 2.5% 空白，避免髮尾擺出去被裁掉
const PAD_Y = 0.015;                  // 上方留 1.5%，頭部上升不被裁掉
const GRID_X = 56, GRID_Y = 112;      // 網格密度
const MASK_WIDTH = 220;               // 髮絲遮罩取樣寬度
const ALPHA_WIDTH = 200;              // 觸碰判定用的透明度圖取樣寬度（只判斷「點到角色身上沒有」）
const TOUCH_DURATION = 2.6;           // 一次觸碰的反應長度（秒），之後完全回到待機
const TOUCH_MAX = 2;                  // 同時疊加的觸碰數（連點時前一下的餘波不會瞬間被截斷）
const TOUCH_INTERACTIVE = 'button,a,input,select,textarea,label,summary,[role="button"]';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// 眨眼：單張圖用「眼皮覆蓋」的效果還不夠自然（閉眼像貼了一塊膚色），預設關閉。
// 若之後有分層的眼睛素材，或想自行調整 ASSETS 的眼睛座標，把它改成 true 即可。
const ENABLE_BLINK = false;

// 預設立繪的眼睛位置（原圖像素座標，ang 為眼睛傾角，單位：度，順時針為正）
const ASSETS = [
  { key: 'portrait-start.webp', test: /portrait-start\.webp(?:$|\?)/, size: [937, 1673], eyes: [
    { x: 386.5, y: 173.5, a: 30, b: 26, ang: 10 },
    { x: 440, y: 131, a: 30, b: 26, ang: -14 } ], pin: [0.53, 0.055] },
  { key: 'portrait.webp', test: /portrait\.webp(?:$|\?)/, size: [932, 1704], eyes: [
    { x: 426, y: 175, a: 30, b: 26, ang: 8 },
    { x: 494.5, y: 148, a: 30, b: 26, ang: -14 } ],
    // 故事立繪中花飾與書本所在範圍（正規化座標）；只用來定位光點與書本輕傾，不修改原圖。
    pin: [0.59, 0.055], book: [0.23, 0.19, 0.40, 0.34] },
];

const VERT = `
precision highp float;
attribute vec2 aPos;
attribute float aHair;
uniform float uMode;     // 0 主網格，1 眼睛細網格
uniform float uAspect;   // 原圖寬/高
uniform vec2  uPad;
uniform float uTime;
uniform float uBreath;
uniform float uTalk;
uniform float uGust;
uniform float uGeneric;  // 1：不認得的自訂角色圖，只做基本動作
uniform float uStory;    // 1：故事畫面；新增的待機／觸碰動作只在故事畫面播放
uniform vec2  uLook;
uniform vec2  uEyeC;
uniform vec2  uEyeAB;
uniform float uEyeAng;
uniform vec4  uTA;       // 觸碰 A：(觸點 x, 觸點 y, 觸碰後經過的秒數（<0＝沒有）, 觸點偏左(-1)右(+1))
uniform vec4  uKA;       // 觸碰 A 各部位反應強度：(頭, 身體, 髮, 裙)
uniform vec4  uTB;       // 觸碰 B（較早的一下，餘波繼續）
uniform vec4  uKB;
uniform vec4  uMA;       // 觸碰 A 附帶的動作強度：(跳, 左右抖, 頭晃, 故事特效 1書／2髮／3裙)
uniform vec4  uMB;
varying vec2 vTex;
varying vec2 vLocal;
varying vec2 vSkin;

// 壓扁／拉長的五個關鍵格（時間 0、.14、.32、.48、.62 秒，各格之間平滑內插）；v0 固定為 1，回傳值在 .62 秒後恆為 v4。
float squishKeys(float T, float v1, float v2, float v3, float v4) {
  float r = 1.0;
  r = mix(r, v1, smoothstep(0.0, 0.14, T));
  r = mix(r, v2, smoothstep(0.14, 0.32, T));
  r = mix(r, v3, smoothstep(0.32, 0.48, T));
  r = mix(r, v4, smoothstep(0.48, 0.62, T));
  return r;
}

// 跳：兩次（一大一小），0.9 秒，回傳 -1（最高點）～0；抖：左右 0.5 秒。T=0 與播完後都是 0。
float hopCurve(float T) {
  float r = 0.0;
  r = mix(r, -1.0, smoothstep(0.0, 0.22, T));
  r = mix(r, 0.0, smoothstep(0.22, 0.45, T));
  r = mix(r, -0.3, smoothstep(0.45, 0.65, T));
  r = mix(r, 0.0, smoothstep(0.65, 0.90, T));
  return r;
}
float shakeCurve(float T) {
  float r = 0.0;
  r = mix(r, -1.0, smoothstep(0.0, 0.10, T));
  r = mix(r, 1.0, smoothstep(0.10, 0.20, T));
  r = mix(r, -0.6, smoothstep(0.20, 0.30, T));
  r = mix(r, 0.4, smoothstep(0.30, 0.40, T));
  r = mix(r, 0.0, smoothstep(0.40, 0.50, T));
  return r;
}

// 觸碰反應（G21）。位移單位與 warp 相同（0～1 的圖面座標，y 向下為正）；沒有觸碰時直接回傳 0。
vec2 touchDisp(vec2 p, float hair, vec4 tc, vec4 kw, vec4 mo) {
  float T = tc.z;
  if (T < 0.0 || T > 2.6) return vec2(0.0);
  float g = 1.0 - uGeneric;
  float e = exp(-T * 3.0);
  float spr = e * sin(T * 12.0);                                   // 阻尼彈簧：先往一側、再回彈、慢慢停
  float press = (1.0 - exp(-T * 26.0)) * exp(-T * 3.6);            // 約 0.1 秒內壓到最深，之後放開
  float att = 1.0 - exp(-T * 14.0);                                // 波的淡入：觸碰剎那從 0 開始，避免髮絲／裙擺「跳」一下
  vec2 d = vec2(0.0);
  // 整體：壓扁→拉長→回彈（以腳下為支點；幅度取原版的一半，立繪比桌面小人高很多，不然會太誇張）
  float sx = 1.0 + (squishKeys(T, 1.04, 0.98, 1.01, 1.0) - 1.0) * 0.5;
  float sy = 1.0 + (squishKeys(T, 0.94, 1.03, 0.99, 1.0) - 1.0) * 0.5;
  d += vec2((p.x - 0.50) * (sx - 1.0), (p.y - 0.97) * (sy - 1.0));
  // 身體：以觸點為中心向外凹陷，再彈回
  vec2 r = vec2((p.x - tc.x) * uAspect, p.y - tc.y);
  float dist = length(r);
  float fall = exp(-pow(dist / 0.15, 2.0));
  vec2 push = (r / max(dist, 0.0001)) * (0.017 * press + 0.007 * spr) * kw.y * fall;
  d += vec2(push.x / uAspect, push.y);
  // 頭：往觸點那一側歪、往下壓一點，再彈回
  float wH = 1.0 - smoothstep(0.150, 0.235, p.y);
  float hw = wH * g * kw.x;
  float angT = tc.w * 0.060 * spr;
  vec2 hr = vec2((p.x - 0.50) * uAspect, p.y - 0.20);
  vec2 hrr = vec2(hr.x * cos(angT) - hr.y * sin(angT), hr.x * sin(angT) + hr.y * cos(angT));
  d += hw * vec2((hrr.x - hr.x) / uAspect, hrr.y - hr.y);
  d.y += hw * (0.014 * press + 0.005 * spr);
  // 頭晃（暈）：頭繞脖子快速左右擺，很快衰減
  float angW = 0.0; // 故事立繪取消頭部左右抖動
  vec2 hrW = vec2(hr.x * cos(angW) - hr.y * sin(angW), hr.x * sin(angW) + hr.y * cos(angW));
  d += wH * g * vec2((hrW.x - hr.x) / uAspect, hrW.y - hr.y);
  // 跳／抖：整個人一起動（腳也離地；上方留白 PAD_Y 夠放，不會被切到）
  d.y += mo.x * 0.013 * hopCurve(T);
  d.x += mo.y * 0.009 * shakeCurve(T);
  // 髮絲：一圈波由上往下盪出去（越靠髮尾越大）
  float rampH = smoothstep(0.13, 0.52, p.y);
  d.x += hair * rampH * g * kw.z * 0.013 * sin(T * 13.0 - p.y * 15.0 + tc.w) * e * att;
  // 裙擺：甩一下（靴子固定）
  float wSk = smoothstep(0.58, 0.72, p.y) * (1.0 - smoothstep(0.84, 0.92, p.y)) * g * kw.w;
  d.x += wSk * 0.014 * sin(T * 10.0 - p.x * 9.0) * e * att;
  d.y += wSk * 0.0015 * sin(T * 10.0) * e;
  // 故事點擊新反應：書本微傾、髮尾俐落甩動、裙擺短暫旋擺。三者都在 T=0 從靜止開始。
  float story = uStory * g;
  float bookFX = (1.0 - step(1.5, mo.w)) * step(0.5, mo.w);
  float hairFX = (1.0 - step(2.5, mo.w)) * step(1.5, mo.w);
  float skirtFX = step(2.5, mo.w) * (1.0 - step(3.5, mo.w));
  float holdFX = step(3.5, mo.w);
  float local = exp(-pow(dist / 0.075, 2.0));
  float bookAng = 0.13 * sin(T * 14.0) * exp(-T * 3.8) * bookFX * story;
  vec2 br = vec2((p.x - tc.x) * uAspect, p.y - tc.y);
  vec2 brr = vec2(br.x * cos(bookAng) - br.y * sin(bookAng), br.x * sin(bookAng) + br.y * cos(bookAng));
  d += vec2((brr.x - br.x) / uAspect, brr.y - br.y) * local;
  float tip = hair * smoothstep(0.36, 0.68, p.y) * hairFX * story;
  d.x += tip * 0.013 * sin(T * 19.0 + tc.w) * exp(-T * 4.0) * att;
  d.y += tip * 0.002 * sin(T * 19.0) * exp(-T * 4.0) * att;
  float swirl = 0.24 * sin(T * 12.0) * exp(-T * 3.5) * att * skirtFX * story;
  float swirlWeight = wSk * exp(-pow(dist / 0.18, 2.0));
  vec2 srr = vec2(r.x * cos(swirl) - r.y * sin(swirl), r.x * sin(swirl) + r.y * cos(swirl));
  d += vec2((srr.x - r.x) / uAspect, srr.y - r.y) * swirlWeight;
  // 故事立繪長按新動作：先微微低頭，再帶動髮尾柔和揚起。
  float holdBow = smoothstep(0.0, 0.16, T) * (1.0 - smoothstep(0.32, 0.85, T)) * holdFX * story;
  d.y += wH * 0.012 * holdBow;
  float holdHair = hair * smoothstep(0.16, 0.55, p.y) * holdFX * story;
  d.x += holdHair * 0.016 * sin(T * 10.0 - p.y * 11.0 + tc.w) * exp(-T * 1.8) * att;
  return d;
}

vec2 warp(vec2 p, float hair) {
  float t = uTime, x = p.x, y = p.y;
  float g = 1.0 - uGeneric;
  vec2 d = vec2(0.0);

  // 呼吸
  float wUp = 1.0 - smoothstep(0.08, 0.85, y);
  d.y -= uBreath * 0.0040 * wUp;
  float wChest = exp(-pow((y - 0.30) / 0.10, 2.0));
  d.x += (x - 0.5) * 0.012 * uBreath * wChest;

  // 重心微晃（越高越大）
  float sw = 0.6 * sin(t * 0.83) + 0.4 * sin(t * 0.51 + 1.3);
  d.x += 0.0042 * sw * pow(clamp(1.0 - y, 0.0, 1.0), 1.7);

  // 頭：以頸為軸微傾；說話時輕點；滑鼠視線
  float wH = 1.0 - smoothstep(0.150, 0.235, y);
  float nod = uTalk * (0.0065 * sin(t * 7.3) + 0.004 * sin(t * 4.1 + 0.8));
  float nodPhase = mod(t + 1.3, 8.5);
  float idleNod = smoothstep(0.0, 0.20, nodPhase) * (1.0 - smoothstep(0.20, 0.85, nodPhase)) * uStory;
  // 新增閱讀待機：每隔一段時間短暫低頭看書，再柔和抬回視線。
  float readPhase = mod(t + 7.0, 18.0);
  float readDip = smoothstep(0.0, 0.30, readPhase) * (1.0 - smoothstep(1.05, 2.0, readPhase)) * uStory;
  float ang = (0.0085 * sin(t * 0.83 + 0.7) + nod + idleNod * 0.014 + readDip * 0.026 + uLook.x * 0.012) * wH * g;
  vec2 r = vec2((x - 0.50) * uAspect, y - 0.20);
  vec2 rr = vec2(r.x * cos(ang) - r.y * sin(ang), r.x * sin(ang) + r.y * cos(ang));
  d += vec2((rr.x - r.x) / uAspect, rr.y - r.y);
  d.y += wH * g * (uLook.y * 0.0025 + uTalk * 0.0016 * sin(t * 7.3 + 1.0) + idleNod * 0.0022 + readDip * 0.0042);

  // 髮絲
  float rampH = smoothstep(0.13, 0.52, y);
  float ph = t * 1.55 - y * 4.2 + step(0.5, x) * 1.7;
  float hs = sin(ph) + 0.5 * sin(t * 2.9 - y * 8.0 + x * 4.0);
  d.x += hair * rampH * g * (0.0042 + 0.0035 * uGust) * hs;
  d.y += hair * rampH * g * 0.0010 * cos(ph);

  // 裙擺（靴子固定）
  float wSk = smoothstep(0.58, 0.72, y) * (1.0 - smoothstep(0.84, 0.92, y)) * g;
  d.x += wSk * (0.0042 * sin(t * 1.35 + x * 7.0 + y * 2.5) + (x - 0.5) * 0.014 * uBreath);
  d.y += wSk * 0.0007 * sin(t * 1.35 + x * 6.0);
  d += touchDisp(p, hair, uTA, uKA, uMA) + touchDisp(p, hair, uTB, uKB, uMB);
  return p + d;
}

void main() {
  vec2 rest, p;
  float hair = 0.0;
  vec2 skinRest;
  vLocal = vec2(0.0);
  if (uMode < 0.5) {
    rest = aPos; p = aPos; hair = aHair; skinRest = aPos;
  } else {
    float c = cos(uEyeAng), s = sin(uEyeAng);
    mat2 R = mat2(c, s, -s, c);
    vec2 cH = vec2(uEyeC.x * uAspect, uEyeC.y);
    vec2 restH = cH + R * (aPos * uEyeAB);
    rest = vec2(restH.x / uAspect, restH.y);
    p = rest;
    vec2 skinH = cH + R * (vec2(aPos.x, 0.85) * uEyeAB);             // 眼睛正下方固定一排的膚色（只隨左右變化）
    skinRest = vec2(skinH.x / uAspect, skinH.y);
    vLocal = aPos;
  }
  vec2 w = warp(p, hair);
  vec2 q = vec2((w.x + uPad.x) / (1.0 + 2.0 * uPad.x), (w.y + uPad.y) / (1.0 + uPad.y));
  gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);
  vTex = vec2((rest.x + uPad.x) / (1.0 + 2.0 * uPad.x), (rest.y + uPad.y) / (1.0 + uPad.y));
  vSkin = vec2((skinRest.x + uPad.x) / (1.0 + 2.0 * uPad.x), (skinRest.y + uPad.y) / (1.0 + uPad.y));
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform float uMode;
uniform float uBlink;
uniform vec3 uSkin;
varying vec2 vTex;
varying vec2 vLocal;
varying vec2 vSkin;
void main() {
  vec4 col = texture2D(uTex, vTex);
  if (uMode > 0.5 && uBlink > 0.002) {
    float ex = 0.58, ey = 0.36;                 // 眼睛輪廓（補丁座標，含睫毛）
    float nx = vLocal.x / ex;
    float inside = 1.0 - nx * nx;
    if (inside > 0.0) {
      float curve = sqrt(inside);
      float lid = mix(-ey, ey, uBlink) * curve;   // 眼皮邊緣：由上緣掃到下緣，閉合時沿眼睛下緣
      float top = -(ey * curve + 0.10);
      float cover = (1.0 - smoothstep(lid - 0.025, lid + 0.025, vLocal.y)) * smoothstep(top - 0.03, top + 0.03, vLocal.y);
      col = mix(col, vec4(uSkin, 1.0), cover * smoothstep(0.0, 0.30, inside));
      float line = (1.0 - smoothstep(0.030, 0.075, abs(vLocal.y - lid))) * smoothstep(0.0, 0.18, inside) * smoothstep(0.02, 0.15, uBlink);
      col = mix(col, vec4(0.24, 0.12, 0.09, 1.0), line * 0.92);
    }
  }
  gl_FragColor = col;
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader');
  return shader;
}

function buildProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link');
  return program;
}

// 橘髮遮罩：顏色判定橘色，再用位置排除洋裝中央的橘色布料；之後模糊成平滑權重。
function buildHairMask(image, width, height) {
  const mw = MASK_WIDTH, mh = Math.max(8, Math.round(MASK_WIDTH * height / width));
  const canvas = document.createElement('canvas');
  canvas.width = mw; canvas.height = mh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, mw, mh);
  const { data } = ctx.getImageData(0, 0, mw, mh);
  let mask = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    const v = y / mh;
    for (let x = 0; x < mw; x++) {
      const i = (y * mw + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 1e-6 || mx < 0.5 || d / mx < 0.5) continue;
      let hue;
      if (mx === r) hue = 60 * ((((g - b) / d) + 6) % 6);
      else if (mx === g) hue = 60 * (((b - r) / d) + 2);
      else hue = 60 * (((r - g) / d) + 4);
      if (hue < 6 || hue > 40) continue;
      const u = x / mw;
      if (v < 0.46 || (v < 0.70 && (u < 0.31 || u > 0.71))) mask[y * mw + x] = 1;
    }
  }
  const blur = (src, radius) => {
    const out = new Float32Array(src.length), tmp = new Float32Array(src.length);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      let s = 0, n = 0;
      for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx >= 0 && xx < mw) { s += src[y * mw + xx]; n++; } }
      tmp[y * mw + x] = s / n;
    }
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      let s = 0, n = 0;
      for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy >= 0 && yy < mh) { s += tmp[yy * mw + x]; n++; } }
      out[y * mw + x] = s / n;
    }
    return out;
  };
  mask = blur(blur(mask, 2), 2);
  return { mask, mw, mh };
}

// 眼睛周圍「像膚色」的像素平均（偏亮、低飽和、非橘色），眼皮用這個純色蓋住眼睛。
function sampleSkin(canvas, cx, cy, half) {
  const fallback = [0.94, 0.88, 0.85];
  try {
    const x0 = Math.max(0, Math.round(cx - half)), y0 = Math.max(0, Math.round(cy - half));
    const w = Math.min(canvas.width - x0, half * 2), h = Math.min(canvas.height - y0, half * 2);
    if (w < 4 || h < 4) return fallback;
    const { data } = canvas.getContext('2d').getImageData(x0, y0, w, h);
    const px = [];
    for (let i = 0; i < data.length; i += 4) {
      const R = data[i], G = data[i + 1], B = data[i + 2];
      if (data[i + 3] < 250 || Math.min(R, G, B) < 170 || R - B > 60 || G < B - 5) continue;
      px.push([R + G + B, R, G, B]);
    }
    if (px.length < 20) return fallback;
    px.sort((p, q) => q[0] - p[0]);
    const top = px.slice(0, Math.max(10, Math.floor(px.length / 3)));
    let r = 0, g = 0, b = 0;
    for (const p of top) { r += p[1]; g += p[2]; b += p[3]; }
    return [r / top.length / 255, g / top.length / 255, b / top.length / 255];
  } catch { return fallback; }
}

function buildMesh(padX, padY, hairMask) {
  const verts = new Float32Array((GRID_X + 1) * (GRID_Y + 1) * 3);
  let o = 0;
  for (let j = 0; j <= GRID_Y; j++) {
    const v = -padY + (1 + padY) * j / GRID_Y;
    for (let i = 0; i <= GRID_X; i++) {
      const u = -padX + (1 + 2 * padX) * i / GRID_X;
      let h = 0;
      if (hairMask && u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const mx = Math.min(hairMask.mw - 1, Math.round(u * (hairMask.mw - 1)));
        const my = Math.min(hairMask.mh - 1, Math.round(v * (hairMask.mh - 1)));
        h = Math.min(1, hairMask.mask[my * hairMask.mw + mx] * 1.7);
      }
      verts[o++] = u; verts[o++] = v; verts[o++] = h;
    }
  }
  const idx = new Uint16Array(GRID_X * GRID_Y * 6);
  let k = 0;
  for (let j = 0; j < GRID_Y; j++) for (let i = 0; i < GRID_X; i++) {
    const a = j * (GRID_X + 1) + i, b = a + 1, c = a + GRID_X + 1, d = c + 1;
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
  }
  return { verts, idx };
}

function buildEyePatch() {
  const nx = 14, ny = 22;
  const verts = new Float32Array((nx + 1) * (ny + 1) * 3);
  let o = 0;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    verts[o++] = -1 + 2 * i / nx; verts[o++] = -1 + 2 * j / ny; verts[o++] = 0;
  }
  const idx = new Uint16Array(nx * ny * 6);
  let k = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
  }
  return { verts, idx };
}

// 觸碰判定用的透明度圖：點在透明背景上不算觸碰。讀不到像素（例如被視為跨來源）時回傳 null，改成整張圖都算。
function buildAlphaMap(image) {
  const aw = ALPHA_WIDTH, ah = Math.max(8, Math.round(ALPHA_WIDTH * image.naturalHeight / image.naturalWidth));
  const canvas = document.createElement('canvas');
  canvas.width = aw; canvas.height = ah;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, aw, ah);
  try {
    const { data } = ctx.getImageData(0, 0, aw, ah);
    const alpha = new Uint8Array(aw * ah);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return { alpha, aw, ah };
  } catch { return null; }
}

// object-position 的一個方向 → 0～1（computed style 通常是「50% 100%」）；看不懂就用 fallback
function parsePosition(token, fallback) {
  if (!token) return fallback;
  if (token === 'left' || token === 'top') return 0;
  if (token === 'right' || token === 'bottom') return 1;
  if (token === 'center') return 0.5;
  const match = /^(-?\d+(?:\.\d+)?)%$/.exec(token);
  return match ? Number(match[1]) / 100 : fallback;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function holder() {
  let box = document.getElementById('portraitAnimSources');
  if (!box) {
    box = document.createElement('div');
    box.id = 'portraitAnimSources';
    box.hidden = true;
    box.setAttribute('aria-hidden', 'true');
    document.body.appendChild(box);
  }
  return box;
}

class PortraitAnimator {
  constructor(img) {
    this.img = img;
    this.canvas = document.createElement('canvas');
    this.canvas.className = `${img.className} pa-canvas`;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', img.alt || '');
    this.gl = null;
    this.ready = false;
    this.failed = false;
    this.token = 0;
    this.blink = { start: -1, next: 2.5, double: false };
    this.talk = 0; this.look = [0, 0]; this.lookTarget = [0, 0];
    this.talkUntil = 0;
    this.t0 = performance.now();
    this.lastNow = this.t0;
    this.minInterval = FRAME_INTERVAL;
    this.slowFrames = 0; this.frames = 0; this.windowStart = this.t0;
    this.paused = false; this.checkCounter = 0;
    this.touches = []; this.alphaMap = null; this.hairMask = null;
    this.nextPinGlint = performance.now() + 4800 + Math.random() * 3200;
    this.readCycle = -1;
  }

  mount() {
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.fallback(); });
    this.srcObserver = new MutationObserver(() => {
      this.canvas.setAttribute('aria-label', this.img.alt || '');
      const next = this.img.getAttribute('src') || '';
      if (next !== this.loadedSrc) this.load(next);
    });
    this.srcObserver.observe(this.img, { attributes: true, attributeFilter: ['src', 'alt'] });
    // 視窗大小或縮放大幅改變時重建（>30%），其餘情況沿用目前的解析度
    this.onResize = () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const want = Math.max(MIN_BACKING_HEIGHT, Math.min(MAX_BACKING_HEIGHT, Math.round(window.innerHeight * dpr)));
        if (this.ready && this.targetH && Math.abs(want - this.targetH) / this.targetH > 0.3) this.load(this.loadedSrc);
      }, 400);
    };
    window.addEventListener('resize', this.onResize, { passive: true });
    this.load(this.img.getAttribute('src') || '');
  }

  async load(src) {
    const token = ++this.token;
    if (!src) return;
    try {
      const asset = ASSETS.find(item => item.test.test(src)) || null;
      const embedded = asset && window.__portraitAssets && window.__portraitAssets[asset.key];
      const image = new Image();
      image.decoding = 'async';
      image.src = embedded || src;
      await image.decode();
      if (token !== this.token) return;
      this.build(image, asset);
      this.loadedSrc = src;
      this.ready = true;
      this.failed = false;
      this.canvas.hidden = false;
      this.swapIn();
    } catch (error) {
      if (token === this.token) this.fallback();
    }
  }

  build(image, asset) {
    const W = image.naturalWidth, H = image.naturalHeight;
    if (!W || !H) throw new Error('empty image');
    // 內部解析度依螢幕實際大小決定（立繪約佔視窗高度），不再固定 1400：一般 1080p 螢幕約 1000～1100px 高，
    // 貼圖也預先縮到同樣大小（高品質縮小），比讓 GPU 即時縮小更不容易在動作中閃爍。
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetH = Math.max(MIN_BACKING_HEIGHT, Math.min(MAX_BACKING_HEIGHT, Math.round(window.innerHeight * dpr)));
    this.targetH = targetH;
    const scale = Math.min(1, targetH / H);
    const cw = Math.round(W * scale * (1 + 2 * PAD_X)), ch = Math.round(H * scale * (1 + PAD_Y));
    const stage = document.createElement('canvas');
    stage.width = cw; stage.height = ch;
    const sctx = stage.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(image, Math.round(PAD_X * W * scale), Math.round(PAD_Y * H * scale), Math.round(W * scale), Math.round(H * scale));

    this.canvas.width = cw; this.canvas.height = ch;
    if (!this.gl) {
      this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
      if (!this.gl) throw new Error('no webgl');
      this.initGL();
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stage);

    const mask = asset ? buildHairMask(image, W, H) : null;
    const mesh = buildMesh(PAD_X, PAD_Y, mask);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mainVB); gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mainIB); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    this.mainCount = mesh.idx.length;
    this.asset = asset;
    this.hairMask = mask;
    this.alphaMap = buildAlphaMap(image);
    this.touches = [];
    this.eyes = ENABLE_BLINK && asset ? asset.eyes.map(e => ({ cx: e.x / asset.size[0], cy: e.y / asset.size[1], a: e.a / asset.size[1], b: e.b / asset.size[1], ang: e.ang * Math.PI / 180,
      skin: sampleSkin(stage, PAD_X * W * scale + e.x / asset.size[0] * W * scale, PAD_Y * H * scale + e.y / asset.size[1] * H * scale, Math.ceil(e.a * scale)) })) : [];
    this.aspect = W / H;
    gl.viewport(0, 0, cw, ch);
  }

  initGL() {
    const gl = this.gl;
    const program = buildProgram(gl);
    gl.useProgram(program);
    this.program = program;
    this.loc = {};
    for (const name of ['uMode', 'uAspect', 'uPad', 'uTime', 'uBreath', 'uTalk', 'uGust', 'uBlink', 'uGeneric', 'uStory', 'uLook', 'uEyeC', 'uEyeAB', 'uEyeAng', 'uSkin', 'uTA', 'uKA', 'uTB', 'uKB', 'uMA', 'uMB', 'uTex']) this.loc[name] = gl.getUniformLocation(program, name);
    this.aPos = gl.getAttribLocation(program, 'aPos');
    this.aHair = gl.getAttribLocation(program, 'aHair');
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.mainVB = gl.createBuffer(); this.mainIB = gl.createBuffer();
    const patch = buildEyePatch();
    this.eyeVB = gl.createBuffer(); this.eyeIB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.eyeVB); gl.bufferData(gl.ARRAY_BUFFER, patch.verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.eyeIB); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, patch.idx, gl.STATIC_DRAW);
    this.eyeCount = patch.idx.length;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.loc.uTex, 0);
  }

  bindMesh(vb, ib) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.enableVertexAttribArray(this.aPos); gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(this.aHair); gl.vertexAttribPointer(this.aHair, 1, gl.FLOAT, false, 12, 8);
  }

  blinkAmount(t) {
    const b = this.blink;
    if (b.start < 0 && t >= b.next) { b.start = t; b.double = Math.random() < 0.2; b.second = false; }
    if (b.start < 0) return 0;
    const e = t - b.start, close = 0.07, hold = 0.05, open = 0.12, total = close + hold + open;
    let amount;
    if (e < close) amount = e / close;
    else if (e < close + hold) amount = 1;
    else if (e < total) amount = 1 - (e - close - hold) / open;
    else {
      if (b.double && !b.second) { b.second = true; b.start = t; return 0; }
      b.start = -1; b.next = t + 2.2 + Math.random() * 3.8; return 0;
    }
    return amount * amount * (3 - 2 * amount);
  }

  // time：秒；blink／talk 傳入數字可覆蓋（測試用）
  draw(time, overrides = {}) {
    const gl = this.gl;
    if (!gl || !this.ready) return;
    const t = time;
    const a = (t * Math.PI * 2) / 4.4;
    const breath = Math.sin(a) + 0.18 * Math.sin(2 * a + 0.6);
    const gust = (0.5 + 0.5 * Math.sin(t * 0.37)) * (0.5 + 0.5 * Math.sin(t * 0.23 + 2));
    const blink = overrides.blink ?? this.blinkAmount(t);
    const talk = overrides.talk ?? this.talk;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1f(this.loc.uAspect, this.aspect);
    gl.uniform2f(this.loc.uPad, PAD_X, PAD_Y);
    gl.uniform1f(this.loc.uTime, t);
    gl.uniform1f(this.loc.uBreath, breath);
    gl.uniform1f(this.loc.uTalk, talk);
    gl.uniform1f(this.loc.uGust, gust);
    gl.uniform1f(this.loc.uGeneric, this.asset ? 0 : 1);
    gl.uniform1f(this.loc.uStory, this.img.id === 'storyPortrait' ? 1 : 0);
    gl.uniform2f(this.loc.uLook, this.look[0], this.look[1]);
    // 觸碰：最新的一下放 A、前一下放 B（餘波繼續）；沒有觸碰或已播完時傳 T=-1，shader 直接略過
    const touches = overrides.touches || this.touches;
    for (let i = 0; i < TOUCH_MAX; i++) {
      const touch = touches[touches.length - 1 - i];
      const T = touch ? t - touch.at : -1;
      const live = touch && T >= 0 && T <= TOUCH_DURATION;
      gl.uniform4f(i ? this.loc.uTB : this.loc.uTA, live ? touch.u : 0, live ? touch.v : 0, live ? T : -1, live ? touch.dir : 0);
      gl.uniform4f(i ? this.loc.uKB : this.loc.uKA, live ? touch.k[0] : 0, live ? touch.k[1] : 0, live ? touch.k[2] : 0, live ? touch.k[3] : 0);
      const m = (live && touch.m) || [0, 0, 0, 0];
      gl.uniform4f(i ? this.loc.uMB : this.loc.uMA, m[0], m[1], m[2], m[3]);
    }
    gl.uniform1f(this.loc.uBlink, 0);
    gl.uniform1f(this.loc.uMode, 0);
    this.bindMesh(this.mainVB, this.mainIB);
    gl.drawElements(gl.TRIANGLES, this.mainCount, gl.UNSIGNED_SHORT, 0);
    if (this.eyes.length) {
      gl.uniform1f(this.loc.uMode, 1);
      gl.uniform1f(this.loc.uBlink, blink);
      this.bindMesh(this.eyeVB, this.eyeIB);
      for (const eye of this.eyes) {
        gl.uniform2f(this.loc.uEyeC, eye.cx, eye.cy);
        gl.uniform2f(this.loc.uEyeAB, eye.a, eye.b);
        gl.uniform1f(this.loc.uEyeAng, eye.ang);
        gl.uniform3f(this.loc.uSkin, eye.skin[0], eye.skin[1], eye.skin[2]);
        gl.drawElements(gl.TRIANGLES, this.eyeCount, gl.UNSIGNED_SHORT, 0);
      }
    }
  }

  // 畫布內容實際畫在螢幕上的矩形（畫布用 object-fit:contain 放進 CSS 盒子，所以要扣掉留白）。看不到（尚未換上畫布、被隱藏）回傳 null。
  screenGeometry() {
    const canvas = this.canvas;
    if (!this.ready || this.failed || !this.swapped || !canvas.isConnected || canvas.offsetParent === null) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4 || !canvas.width || !canvas.height) return null;
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const dw = canvas.width * scale, dh = canvas.height * scale;
    const pos = (getComputedStyle(canvas).objectPosition || '50% 50%').split(/\s+/);
    return { ox: rect.left + (rect.width - dw) * parsePosition(pos[0], 0.5), oy: rect.top + (rect.height - dh) * parsePosition(pos[1], 0.5), dw, dh };
  }

  // 螢幕座標 → 圖面座標（0～1，與 shader 的 aPos 同一套）。點不到角色身上（畫布外、透明背景、尚未換上畫布）回傳 null。
  // 內容矩形再扣掉左右／上方的留白（PAD_X／PAD_Y）。
  pointerToImage(clientX, clientY) {
    const g = this.screenGeometry();
    if (!g) return null;
    const cu = (clientX - g.ox) / g.dw, cv = (clientY - g.oy) / g.dh;
    if (cu < 0 || cu > 1 || cv < 0 || cv > 1) return null;
    const u = cu * (1 + 2 * PAD_X) - PAD_X, v = cv * (1 + PAD_Y) - PAD_Y;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const map = this.alphaMap;
    if (map) {
      const ax = Math.round(u * (map.aw - 1)), ay = Math.round(v * (map.ah - 1));
      let solid = false;
      for (let dy = -1; dy <= 1 && !solid; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = ax + dx, y = ay + dy;
        if (x >= 0 && x < map.aw && y >= 0 && y < map.ah && map.alpha[y * map.aw + x] > 48) { solid = true; break; }
      }
      if (!solid) return null;
    }
    return { u, v };
  }

  // 圖面座標 → 螢幕座標（pointerToImage 的反運算）
  imageToScreen(u, v, g = this.screenGeometry()) {
    if (!g) return null;
    return [g.ox + (u + PAD_X) / (1 + 2 * PAD_X) * g.dw, g.oy + (v + PAD_Y) / (1 + PAD_Y) * g.dh];
  }

  // 頭的位置（圖面座標）：預設立繪取兩隻眼睛的中點；自訂角色圖不知道頭在哪，抓上方中央
  headUV() {
    const a = this.asset;
    if (!a) return [0.5, 0.12];
    const n = a.eyes.length;
    return [a.eyes.reduce((t, e) => t + e.x, 0) / n / a.size[0], a.eyes.reduce((t, e) => t + e.y, 0) / n / a.size[1]];
  }

  // 表情窗的位置：頭的左側（螢幕座標，已夾在舞臺範圍內）與大小
  faceAnchor(stage) {
    const g = this.screenGeometry();
    if (!g) return null;
    const [hx, hy] = this.imageToScreen(...this.headUV(), g);
    const size = Math.round(Math.max(72, Math.min(112, g.dh * 0.15)));
    const box = stage.getBoundingClientRect();
    const x = hx - g.dw * 0.15 - size * 0.62;
    const left = hx - g.dw * 0.15 - size * 0.62 < box.left + size / 2 + 8;          // 左邊放不下就改放右邊
    const fx = left ? hx + g.dw * 0.15 + size * 0.62 : x;
    return {
      x: Math.min(box.right - size / 2 - 8, Math.max(box.left + size / 2 + 8, fx)),
      y: Math.min(box.bottom - size / 2 - 8, Math.max(box.top + size / 2 + 52, hy)),   // 52：避開頂端的 HUD 列
      size,
    };
  }

  // 觸點所在的部位 → 各部位的反應強度 [頭, 身體, 髮, 裙]。自訂角色圖不認得部位，只做整體「戳一下」。
  touchWeights(u, v) {
    if (!this.asset) return [0, 1, 0, 0];
    const head = 1 - smooth(0.14, 0.26, v);
    const mid = smooth(0.16, 0.30, v) * (1 - smooth(0.62, 0.82, v));
    let hair = 0;
    const m = this.hairMask;
    if (m) {
      const mx = Math.min(m.mw - 1, Math.max(0, Math.round(u * (m.mw - 1))));
      const my = Math.min(m.mh - 1, Math.max(0, Math.round(v * (m.mh - 1))));
      hair = Math.min(1, m.mask[my * m.mw + mx] * 1.7);
    }
    return [head, 0.5 + 0.5 * mid, Math.min(1, hair + head * 0.5), smooth(0.50, 0.66, v)];
  }

  // 登記一次觸碰（u、v 為圖面座標）。at 預設為現在（秒，與 draw 的時間同一個基準）。
  touch(u, v, at) {
    const when = at ?? (performance.now() - this.t0) / 1000;
    const entry = { u, v, at: when, dir: Math.max(-1, Math.min(1, (u - 0.5) * 2)), k: this.touchWeights(u, v), m: [0, 0, 0, 0] };
    if (this.img.id === 'storyPortrait' && this.asset) {
      const region = this.asset.book;
      if (region && u >= region[0] && u <= region[2] && v >= region[1] && v <= region[3]) entry.effect = 1;
      else if (entry.k[2] > 0.55 && v > 0.34) entry.effect = 2;
      else if (entry.k[3] > 0.5) entry.effect = 3;
    }
    this.touches.push(entry);
    while (this.touches.length > TOUCH_MAX) this.touches.shift();
    return entry;
  }

  // 目前是否真的看得到（被 CSS 隱藏、被全螢幕覆蓋層蓋住時不需要繪製）
  shouldRender() {
    if (document.hidden || this.paused === 'forced') return false;
    if (this.canvas.offsetParent === null) return false;
    if (document.querySelector('#gameMenu:not([hidden]), .game-overlay:not([hidden]), #storyExitScreen:not([hidden]), #gameOverScreen:not([hidden]), dialog[open]')) return false;
    return true;
  }

  tick(now, shared) {
    if (!this.ready || this.failed) return;
    const gap = now - this.lastNow;
    const dt = Math.min(0.1, gap / 1000);
    if (gap < this.minInterval) return;
    this.lastNow = now;
    // 視窗被隱藏、最小化或系統休眠後時間差會很大；重新量測，避免把空白時間算成慢幀。
    if (gap > 2000) { this.frames = 0; this.windowStart = now; }
    if (this.checkCounter++ % 12 === 0) this.visible = this.shouldRender();
    if (!this.visible) return;
    const k = 1 - Math.exp(-dt / 0.18);
    this.talk += ((now < this.talkUntil ? 1 : 0) - this.talk) * k;
    const kl = 1 - Math.exp(-dt / 0.35);
    this.look[0] += (shared.look[0] - this.look[0]) * kl;
    this.look[1] += (shared.look[1] - this.look[1]) * kl;
    const clock = (now - this.t0) / 1000;
    this.draw(clock);
    if (this.img.id === 'storyPortrait' && this.asset?.book) {
      const cycle = Math.floor((clock + 7.0) / 18.0), phase = (clock + 7.0) % 18.0;
      if (cycle > this.readCycle && phase >= 0.28 && phase < 1.55) {
        spawnBookPageGlint(this);
        this.readCycle = cycle;
      }
    }
    if (this.img.id === 'storyPortrait' && this.asset?.pin && now >= this.nextPinGlint) {
      spawnHairpinGlint(this);
      this.nextPinGlint = now + 6500 + Math.random() * 5500;
    }
    if (this.touches.length && clock - this.touches[0].at > TOUCH_DURATION) this.touches.shift();
    // 自動保護：平均每幀超過 70 ms（不到 15 fps，通常是沒有 GPU 的電腦）→ 放棄動畫，退回靜態圖
    // 至少先畫滿 120 幀才判斷，避免把啟動時的解碼／著色器編譯時間誤判成慢幀。
    // 視窗在開場動畫後面預載、或被其他視窗蓋住時沒有焦點，rAF 會被節流；這段時間不列入慢幀判斷。
    if (!document.hasFocus()) { this.frames = 0; this.windowStart = now; }
    if (!this.frames) this.windowStart = now;
    this.frames++;
    if (this.frames >= 120 && now - this.windowStart > 2000 && !window.__portraitNoAdapt) {
      const avg = (now - this.windowStart) / this.frames;
      if (avg > 70) this.fallback();
      this.frames = 0; this.windowStart = now;
    }
  }

  // 把畫布換到原圖的位置，原圖移進隱藏容器。不用 CSS／行內樣式隱藏，因為應用程式的其他程式碼會重設圖片的 style；
  // 原圖仍在文件裡（getElementById 找得到），換角色圖時 app.js 照常設定 src，這裡會監看並重新載入。
  swapIn() {
    if (this.swapped || !this.img.parentNode) return;
    // 換上畫布時，延續原圖進場動畫的進度（原圖已播完就直接播完），避免畫布重新淡入造成閃一下
    const before = this.img.getAnimations ? this.img.getAnimations().map(a => [a.playState, a.currentTime]) : [];
    this.img.replaceWith(this.canvas);
    holder().appendChild(this.img);
    this.swapped = true;
    if (this.canvas.getAnimations) {
      this.canvas.getAnimations().forEach((animation, index) => {
        const prev = before[index];
        if (!prev) { if (!before.length) animation.finish(); return; }
        if (prev[0] === 'finished') animation.finish(); else if (prev[1] != null) animation.currentTime = prev[1];
      });
    }
  }

  swapOut() {
    if (!this.swapped) return;
    this.removeHairRibbon();
    this.canvas.replaceWith(this.img);
    this.swapped = false;
  }

  syncHairRibbon() {}

  fallback() {
    this.failed = true; this.ready = false;
    this.swapOut();
    this.canvas.hidden = true;
  }

  destroy() {
    this.token++;
    this.srcObserver?.disconnect();
    clearTimeout(this.resizeTimer);
    window.removeEventListener('resize', this.onResize);
    this.fallback();
  }
}

const state = { animators: [], look: [0, 0], raf: 0, running: false, observer: null, handlers: [], hoverAt: 0, heartAt: 0, touchableStage: null, faceOk: null, affLoaded: new Set(), faceTimer: 0, storyEmotionTimer: 0, emotionGeneration: 0, emotionUntil: 0, lastEmotionAt: 0, lastEmotion: 'neutral', storyEmotion: 'neutral', storyEmotionIntensity: 1, storyEmotionToken: null, pendingEmotion: null, displayedEmotion: null };

function frame(now) {
  if (!state.running) return;
  for (const animator of state.animators) animator.tick(now, state);
  state.raf = requestAnimationFrame(frame);
}

// 這一下點擊／移動落在哪個立繪的哪個位置；點到按鈕等控制項、被對話框或選單蓋住、點在透明背景上都回傳 null。
// 立繪本身是 pointer-events:none（不擋住底下的操作），所以事件的 target 是舞臺（.vn-stage）或它的內容，再用座標自己判斷。
function touchTarget(event) {
  const el = event.target;
  if (!(el instanceof Element) || el.closest(TOUCH_INTERACTIVE)) return null;
  const stage = el.closest('.vn-stage');
  if (!stage) return null;
  for (const animator of state.animators) {
    const hit = animator.pointerToImage(event.clientX, event.clientY);
    if (hit && animator.shouldRender()) return { animator, hit, stage };
  }
  return null;
}

function setTouchable(stage) {
  if (state.touchableStage === stage) return;
  state.touchableStage?.classList.remove('pa-touchable');
  stage?.classList.add('pa-touchable');
  state.touchableStage = stage;
}

// 把一個舞臺內的絕對定位元素放到螢幕座標 (x, y)。介面根節點可能有縮放（CSS zoom，矮視窗時會自動縮小），
// 此時舞臺內 1 個 CSS px ≠ 1 個螢幕 px，所以先量出實際比例再換算，效果才會正好落在點擊的位置。
function placeFx(stage, fx, x, y) {
  fx.style.setProperty('--pa-x', '0px');
  fx.style.setProperty('--pa-y', '0px');
  stage.appendChild(fx);
  const origin = fx.getBoundingClientRect();
  fx.style.setProperty('--pa-x', '100px');
  const k = (fx.getBoundingClientRect().left - origin.left) / 100 || 1;
  fx.style.setProperty('--pa-x', `${Math.round((x - origin.left) / k)}px`);
  fx.style.setProperty('--pa-y', `${Math.round((y - origin.top) / k)}px`);
  return k;
}

// 點擊處的金色漣漪＋四芒星（純 CSS 動畫，style.css 的 G21）；同時最多 4 個，約 0.9 秒後自己移除
function spawnTouchFx(stage, x, y) {
  const fx = document.createElement('span');
  fx.className = 'pa-touch-fx';
  fx.setAttribute('aria-hidden', 'true');
  placeFx(stage, fx, x, y);
  const all = stage.querySelectorAll('.pa-touch-fx');
  for (let i = 0; i < all.length - 4; i++) all[i].remove();
  setTimeout(() => fx.remove(), 900);
}

// ---- 表情窗（G21.4／G43）：點角色時，在頭旁邊彈出圓形的臉部特寫。 ----
// G43 起依好感度選四階圖（WP2）；好感度讀不到或新圖未載入時，退回原本依點擊位置的 pat／happy／surprised／dizzy。
// 表情圖放在 assets/expressions/（來源與授權狀態見該資料夾的 README.txt）；舊表情缺任何一張就整個停用表情窗，其餘觸碰動畫照常。
const FACE_DIR = 'assets/expressions/';
const FACES = ['pat', 'happy', 'surprised', 'dizzy', 'story-daily', 'story-proud', 'story-shy', 'story-focused'];
const FACE_SHOW_MS = 1600;            // 一次表情的停留時間（參考 claude-xiaoke 的摸頭表情 1.6 秒）
const FACE_DIZZY_MS = 2200;
const FACE_BURST = [5, 2200];         // [連點次數, 時間窗(毫秒)]

// G43（WP2）表情窗四階：點角色時改依好感度選圖，門檻照指示書 WP7。
// 0-24＝aff-1（不悅）、25-44＝aff-2（嘟嘴）、45-89＝aff-3（遮臉）、90-100＝aff-4（伸手）。
// size／pos 是 96px 圓窗的裁切參數；臉部已逐張截圖確認沒有被裁掉。
const AFF_FACES = [
  { file: 'g43-face-aff-1.webp', size: '240%', pos: '35% 9%' },
  { file: 'g43-face-aff-2.webp', size: '240%', pos: '50% 18%' },
  { file: 'g43-face-aff-3.webp', size: '240%', pos: '40% 9%' },
  { file: 'g43-face-aff-4.webp', size: '240%', pos: '40% 8%' },
];

function affinityTier(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const v = Math.min(100, Math.max(0, n));
  if (v < 25) return 0;
  if (v < 45) return 1;
  if (v < 90) return 2;
  return 3;
}

// isLoaded 由呼叫端提供，測試可直接注入；回傳 null 代表退回原本的觸碰表情。
function affinityFaceFor(value, isLoaded) {
  const tier = affinityTier(value);
  if (tier === null) return null;
  const face = AFF_FACES[tier];
  return isLoaded(face.file) ? face : null;
}

function affinityFace() {
  const el = document.getElementById('affProgress');
  if (!el) return null;
  return affinityFaceFor(el.value, file => state.affLoaded.has(file));
}

// 各表情帶的動作強度 [跳, 左右抖, 頭晃, 保留]（shader 的 uMA／uMB）
const MOTIONS = { pat: [0.28, 0, 0.6, 0], happy: [0.6, 0, 0, 0], surprised: [1, 0, 0, 0], dizzy: [0, 1, 1, 0] };

function loadFaces() {
  if (state.faceOk !== null) return;
  // 四張好感度表情獨立預載：少任何一張只影響該階，不會讓整個表情窗停用。
  for (const face of AFF_FACES) {
    const img = new Image();
    img.onload = () => state.affLoaded.add(face.file);
    img.onerror = () => state.affLoaded.delete(face.file);
    img.src = `${FACE_DIR}${face.file}`;
  }
  state.faceOk = false;               // 先當作不可用；四張都載入成功才打開，任何一張失敗就永久停用
  let left = FACES.length;
  for (const name of FACES) {
    const img = new Image();
    img.onload = () => { if (--left === 0) { state.faceOk = true; if (state.pendingEmotion) applyStoryEmotionVisual(); } };
    img.onerror = () => { state.faceOk = false; left = Infinity; };
    img.src = `${FACE_DIR}${name}.webp`;
  }
}

function expressionFor(touch, burst) {
  if (burst) return 'dizzy';
  if (touch.k[0] > 0.6) return 'pat';
  if (touch.k[2] > 0.55) return 'happy';
  return 'surprised';
}

function showFace(stage, animator, name, hold, crop = null) {
  if (state.faceOk !== true) return;
  const isStoryPortrait = animator.img.id === 'storyPortrait';
  const anchor = animator.faceAnchor(stage);
  if (!anchor) return;
  let el = stage.querySelector('.pa-face');
  if (!el) {
    el = document.createElement('div');
    el.className = 'pa-face';
    el.setAttribute('aria-hidden', 'true');
  }
  el.classList.remove('pa-story-emotion', 'pa-curious', 'pa-proud', 'pa-shy', 'pa-focused', 'pa-daily');
  el.dataset.face = name;
  el.style.backgroundImage = `url("${FACE_DIR}${name === 'curious' ? 'surprised' : name}.webp")`;
  if (crop) {
    el.style.backgroundSize = crop.size;
    el.style.backgroundPosition = crop.pos;
  } else {
    el.style.removeProperty('background-size');
    el.style.removeProperty('background-position');
  }
  if (name === 'curious') el.classList.add('pa-curious');
  el.style.setProperty('--fs', `${anchor.size}px`);
  el.style.setProperty('--fd', `${hold}ms`);
  placeFx(stage, el, anchor.x, anchor.y);   // 重新放入 DOM → 彈出動畫重新開始，連點時表情會「切換」一次
  clearTimeout(state.faceTimer);
  state.faceTimer = setTimeout(() => { el.remove(); if (isStoryPortrait) { state.displayedEmotion = null; restoreStoryEmotionVisual(); } }, hold + 250);
}

const EMOTION_HOLDS = { neutral: 1800, happy: 2200, proud: 2600, shy: 3500, surprised: 2200, dizzy: 2200, curious: 5000, focused: 9000 };
const EMOTION_CLASSES = ['neutral','happy','proud','shy','surprised','dizzy','curious','focused'];

function clearStoryEmotionVisual() {
  const stage = document.querySelector('.vn-stage');
  for (const key of EMOTION_CLASSES) stage?.classList.remove(`pa-emotion-${key}`);
  stage?.classList.remove('pa-emotion-repeat');
  stage?.style.removeProperty('--story-emotion-intensity');
  stage?.removeAttribute('data-emotion-intensity');
  document.querySelectorAll('.pa-story-emotion').forEach(node => node.remove());
  state.pendingEmotion = null;
  state.displayedEmotion = null;
}

function applyStoryEmotionVisual({ repeat = false } = {}) {
  const emotion = state.storyEmotion;
  const stage = document.querySelector('.vn-stage');
  for (const key of EMOTION_CLASSES) stage?.classList.remove(`pa-emotion-${key}`);
  stage?.classList.remove('pa-emotion-repeat');
  stage?.classList.add(`pa-emotion-${emotion}`);
  if (repeat) stage?.classList.add('pa-emotion-repeat');
  stage?.style.setProperty('--story-emotion-intensity', String(state.storyEmotionIntensity));
  stage?.setAttribute('data-emotion-intensity', String(state.storyEmotionIntensity));
  state.pendingEmotion = emotion;
  if (state.faceOk !== true) return;
  const name = emotion === 'neutral' ? 'story-daily'
    : emotion === 'proud' ? 'story-proud'
    : emotion === 'shy' ? 'story-shy'
    : emotion === 'focused' ? 'story-focused'
    : emotion === 'curious' ? 'curious' : emotion;
  const animator = state.animators.find(item => item.img.id === 'storyPortrait');
  const portraitStage = animator?.img.closest('.vn-stage');
  const anchor = portraitStage && animator.faceAnchor(portraitStage);
  if (!portraitStage || !anchor) return;
  const existing = portraitStage.querySelector('.pa-face');
  clearTimeout(state.faceTimer);
  let el = existing;
  if (!el) {
    el = document.createElement('div');
    el.className = 'pa-face';
    el.setAttribute('aria-hidden', 'true');
  }
  el.classList.add('pa-story-emotion');
  el.classList.toggle('pa-curious', emotion === 'curious');
  el.classList.toggle('pa-proud', emotion === 'proud');
  el.classList.toggle('pa-shy', emotion === 'shy');
  el.classList.toggle('pa-focused', emotion === 'focused');
  el.classList.toggle('pa-daily', emotion === 'neutral');
  el.dataset.face = name;
  el.style.backgroundImage = `url("${FACE_DIR}${name}.webp")`;
  el.style.removeProperty('background-size');
  el.style.removeProperty('background-position');
  el.style.setProperty('--fs', `${anchor.size}px`);
  el.style.removeProperty('--fd');
  placeFx(portraitStage, el, anchor.x, anchor.y);
  state.displayedEmotion = emotion;
}

function restoreStoryEmotionVisual() {
  if (state.emotionUntil > Date.now()) applyStoryEmotionVisual({ repeat: Date.now() - state.lastEmotionAt < 6000 && state.lastEmotion !== 'neutral' });
  else clearStoryEmotionVisual();
}

// AI emotion 是唯一狀態來源；固定停留時間後回日常，同一情緒短時間重複只延長停留、不重播進場。
function setStoryEmotion(value, intensity = 1, token = null) {
  const emotion = normalizeStoryEmotion(value);
  const level = normalizeStoryEmotionIntensity(intensity);
  const normalizedToken = token == null ? null : String(token);
  if (normalizedToken !== null && state.storyEmotionToken === normalizedToken && state.storyEmotion === emotion && state.storyEmotionIntensity === level) return;
  const now = Date.now();
  const repeat = emotion !== 'neutral' && state.lastEmotion === emotion && now - state.lastEmotionAt < 6000;
  state.storyEmotion = emotion;
  state.storyEmotionIntensity = level;
  state.storyEmotionToken = normalizedToken;
  state.lastEmotion = emotion;
  state.lastEmotionAt = now;
  state.emotionGeneration++;
  const generation = state.emotionGeneration;
  clearTimeout(state.storyEmotionTimer);
  clearTimeout(state.faceTimer);
  document.querySelectorAll('.pa-face:not(.pa-story-emotion)').forEach(node => node.remove());
  const hold = (EMOTION_HOLDS[emotion] || 2200) + (level - 1) * 350;
  state.emotionUntil = now + hold;
  const existingStoryFace = document.querySelector('.pa-story-emotion');
  if (repeat && state.displayedEmotion === emotion && existingStoryFace) {
    const stage = existingStoryFace.closest('.vn-stage');
    stage?.classList.add('pa-emotion-repeat');
    stage?.style.setProperty('--story-emotion-intensity', String(level));
    stage?.setAttribute('data-emotion-intensity', String(level));
  } else applyStoryEmotionVisual({ repeat });
  state.storyEmotionTimer = setTimeout(() => {
    if (generation !== state.emotionGeneration) return;
    state.emotionUntil = 0;
    clearStoryEmotionVisual();
  }, hold);
}

// 開心：點擊處周圍閃爍六顆金色星光（錯開 0～0.5 秒，各約 0.9 秒；用 CSS 畫，沒有文字）。同時最多 2 組。
const SPARKLES = [[-58, -30, 16, 0], [44, -52, 12, 0.1], [70, 10, 18, 0.2], [-30, 48, 11, 0.3], [12, -78, 14, 0.4], [-76, 16, 12, 0.5]];
function spawnSparkles(stage, x, y, dir) {
  const group = document.createElement('span');
  group.className = 'pa-sparkles';
  group.setAttribute('aria-hidden', 'true');
  const side = dir < 0 ? -1 : 1;
  for (const [sx, sy, size, delay] of SPARKLES) {
    const star = document.createElement('i');
    star.className = 'pa-sparkle';
    star.style.setProperty('--sx', `${sx * side}px`);
    star.style.setProperty('--sy', `${sy}px`);
    star.style.setProperty('--ss', `${size}px`);
    star.style.setProperty('--sd', `${delay}s`);
    group.appendChild(star);
  }
  placeFx(stage, group, x, y);
  const all = stage.querySelectorAll('.pa-sparkles');
  for (let i = 0; i < all.length - 2; i++) all[i].remove();
  setTimeout(() => group.remove(), 1700);
}

// 暈：三顆星星繞著頭頂轉兩圈（約 2.2 秒）。同時只留一組。
function spawnOrbit(stage, animator) {
  const g = animator.screenGeometry();
  if (!g) return;
  const [hx, hy] = animator.imageToScreen(...animator.headUV(), g);
  const box = stage.getBoundingClientRect();
  const group = document.createElement('span');
  group.className = 'pa-orbit';
  group.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) group.appendChild(document.createElement('i'));
  placeFx(stage, group, Math.min(box.right - 40, Math.max(box.left + 40, hx)), Math.max(box.top + 70, hy - g.dh * 0.06));
  stage.querySelectorAll('.pa-orbit').forEach(old => { if (old !== group) old.remove(); });
  setTimeout(() => group.remove(), 2400);
}

// 故事畫面偶爾讓花飾閃一下；位置按原圖座標換算，縮放／不同視窗尺寸都能跟著立繪。
function spawnHairpinGlint(animator) {
  const stage = animator.img.closest('.vn-stage');
  const g = animator.screenGeometry();
  if (!stage || !g) return;
  const [x, y] = animator.imageToScreen(...animator.asset.pin, g);
  const group = document.createElement('span');
  group.className = 'pa-hairpin-glint';
  group.setAttribute('aria-hidden', 'true');
  group.appendChild(document.createElement('i'));
  placeFx(stage, group, x, y);
  setTimeout(() => group.remove(), 1050);
}

// 閱讀待機時在書頁掠過一線柔光，和 shader 的低頭動作同步出現。
function spawnBookPageGlint(animator) {
  const stage = animator.img.closest('.vn-stage');
  const g = animator.screenGeometry();
  if (!stage || !g || !animator.asset?.book) return;
  const book = animator.asset.book;
  const [x, y] = animator.imageToScreen(book[0] + (book[2] - book[0]) * 0.72, book[1] + (book[3] - book[1]) * 0.28, g);
  const group = document.createElement('span');
  group.className = 'pa-book-page-glint';
  group.setAttribute('aria-hidden', 'true');
  group.appendChild(document.createElement('i'));
  placeFx(stage, group, x, y);
  stage.querySelectorAll('.pa-book-page-glint').forEach(old => { if (old !== group) old.remove(); });
  setTimeout(() => group.remove(), 1250);
}

// 故事觸碰時飄出三片花瓣；使用獨立 SVG 素材並限制同時顯示數量。
function spawnStoryPetals(stage, x, y) {
  const group = document.createElement('span');
  group.className = 'pa-story-petals';
  group.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) {
    const petal = document.createElement('img');
    petal.src = 'assets/story-petal.svg';
    petal.alt = '';
    petal.style.setProperty('--pi', String(i));
    group.appendChild(petal);
  }
  placeFx(stage, group, x, y);
  const groups = stage.querySelectorAll('.pa-story-petals');
  for (let i = 0; i < groups.length - 2; i++) groups[i].remove();
  setTimeout(() => group.remove(), 1450);
}

// 摸頭時浮起三顆愛心（用 CSS 畫的，沒有文字；大小 24／19／15，錯開 0／0.45／0.9 秒，往觸點外側飄）。
// 同時最多 2 組，且 0.7 秒內不重複生成，連點時畫面才不會被愛心淹沒。
const HEARTS = [[46, -34, 24, 0, '#ff7a8a'], [-44, -14, 19, 0.45, '#ff7a8a'], [64, -72, 15, 0.9, '#ff9aaa']];
function spawnHearts(stage, x, y, dir) {
  const now = performance.now();
  if (now - state.heartAt < 700) return;
  state.heartAt = now;
  const group = document.createElement('span');
  group.className = 'pa-hearts';
  group.setAttribute('aria-hidden', 'true');
  const side = dir < 0 ? -1 : 1;
  for (const [hx, hy, size, delay, color] of HEARTS) {
    const heart = document.createElement('i');
    heart.className = 'pa-heart';
    heart.style.setProperty('--hx', `${hx * side}px`);
    heart.style.setProperty('--hy', `${hy}px`);
    heart.style.setProperty('--hs', `${size}px`);
    heart.style.setProperty('--hd', `${delay}s`);
    heart.style.setProperty('--hc', color);
    group.appendChild(heart);
  }
  placeFx(stage, group, x, y);
  const all = stage.querySelectorAll('.pa-hearts');
  for (let i = 0; i < all.length - 2; i++) all[i].remove();
  setTimeout(() => group.remove(), 2900);
}

function start() {
  if (state.running) return;
  const images = [document.getElementById('storyPortrait'), document.getElementById('startPortrait')].filter(el => el && el.tagName === 'IMG' && el.dataset.paStatic !== 'true');
  if (!images.length) return;
  state.animators = images.map(img => new PortraitAnimator(img));
  for (const animator of state.animators) animator.mount();
  state.running = true;
  state.raf = requestAnimationFrame(frame);

  // 說話：對話文字更新 → 頭部輕點，長度依字數
  const dialogue = document.getElementById('dialogueText');
  if (dialogue) {
    state.observer = new MutationObserver(() => {
      const length = (dialogue.textContent || '').trim().length;
      const until = performance.now() + Math.min(7000, Math.max(1200, length * 55));
      for (const animator of state.animators) animator.talkUntil = until;
    });
    state.observer.observe(dialogue, { childList: true, characterData: true, subtree: true });
  }
  // 視線：滑鼠位置帶動頭部極小幅度轉向
  const onMove = event => {
    state.look[0] = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
    state.look[1] = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  state.handlers.push(['pointermove', onMove]);

  loadFaces();
  setStoryEmotion(window.__storyEmotion || 'neutral', window.__storyEmotionIntensity || 1, window.__storyEmotionToken ?? null);

  // 觸碰：點（或手指點）立繪 → 依位置有不同反應；滑鼠移到角色身上時游標變手指（約每 90 ms 判斷一次）
  let holdTimer = 0;
  const onDown = event => {
    clearTimeout(holdTimer);
    holdTimer = 0;
    if (event.button !== 0) return;
    const target = touchTarget(event);
    if (!target) return;
    const touch = target.animator.touch(target.hit.u, target.hit.v);
    spawnTouchFx(target.stage, event.clientX, event.clientY);
    if (target.animator.img.id === 'storyPortrait') spawnStoryPetals(target.stage, event.clientX, event.clientY);
    if (touch.k[0] > 0.6) spawnHearts(target.stage, event.clientX, event.clientY, touch.dir);   // 摸頭才有愛心
    const now = performance.now();
    state.taps = state.taps.filter(t => now - t < FACE_BURST[1]);
    state.taps.push(now);
    const burst = state.taps.length >= FACE_BURST[0];
    if (burst) state.taps = [];
    const expression = expressionFor(touch, burst);
    touch.m = [...MOTIONS[expression]];
    touch.m[3] = touch.effect || 0;
    if (expression === 'happy') spawnSparkles(target.stage, event.clientX, event.clientY, touch.dir);
    if (expression === 'dizzy') spawnOrbit(target.stage, target.animator);
    const affinity = affinityFace();
    showFace(target.stage, target.animator, affinity ? affinity.file.replace(/\.webp$/, '') : expression, burst ? FACE_DIZZY_MS : FACE_SHOW_MS, affinity);
    if (target.animator.img.id === 'storyPortrait') {
      const heldTarget = target;
      holdTimer = setTimeout(() => {
        holdTimer = 0;
        const held = heldTarget.animator.touch(heldTarget.hit.u, heldTarget.hit.v);
        held.m = [0, 0, 0, 4];
        spawnHairpinGlint(heldTarget.animator);
        const [hx, hy] = heldTarget.animator.imageToScreen(...heldTarget.animator.headUV());
        spawnSparkles(heldTarget.stage, hx, hy, touch.dir);
        showFace(heldTarget.stage, heldTarget.animator, 'curious', FACE_SHOW_MS);
      }, 650);
    }
  };
  const onUp = () => { clearTimeout(holdTimer); holdTimer = 0; };
  const onHover = event => {
    if (event.pointerType === 'touch') return;
    const now = performance.now();
    if (now - state.hoverAt < 90) return;
    state.hoverAt = now;
    setTouchable(touchTarget(event)?.stage || null);
  };
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointermove', onHover, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  state.handlers.push(['pointerdown', onDown], ['pointermove', onHover], ['pointerup', onUp], ['pointercancel', onUp]);
}

function stop() {
  state.running = false;
  cancelAnimationFrame(state.raf);
  state.observer?.disconnect(); state.observer = null;
  for (const [type, handler] of state.handlers) window.removeEventListener(type, handler);
  state.handlers = [];
  setTouchable(null);
  clearTimeout(state.faceTimer);
  clearTimeout(state.storyEmotionTimer);
  document.querySelectorAll('.pa-touch-fx,.pa-hearts,.pa-face,.pa-sparkles,.pa-orbit,.pa-hairpin-glint,.pa-book-page-glint,.pa-story-petals').forEach(node => node.remove());
  for (const animator of state.animators) animator.destroy();
  state.animators = [];
}

function init() {
  const query = window.matchMedia ? window.matchMedia(REDUCED_MOTION) : null;
  const apply = () => { if (query && query.matches) stop(); else start(); };
  apply();
  query?.addEventListener?.('change', apply);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

// 測試與除錯用：固定時間繪製單幀，不會進入正式流程。
window.__portraitAnim = {
  get animators() { return state.animators; },
  hitTest(index, x, y) { const a = state.animators[index]; return a ? a.pointerToImage(x, y) : null; },
  touchAt(index, u, v, time) { const a = state.animators[index]; if (a) a.touch(u, v, time); },
  renderAt(index, time, overrides) { const a = state.animators[index]; if (a) { state.running = false; a.visible = true; a.draw(time, overrides); } },
  setStoryEmotion,
  affinityTier,
  affinityFaceFor,
};


