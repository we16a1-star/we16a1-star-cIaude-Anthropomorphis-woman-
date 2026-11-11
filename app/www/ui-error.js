// 錯誤訊息英譯（純函式）：用「可翻譯的最長前綴」查表換成英文，查不到就原樣返回。
// 翻譯表與介面共用（app.js 的 UI_EN）；後端訊息找不到對應時維持原語言。
export function translateError(value, language, translations) {
  const source=String(value||'');
  if(language!=='en'||!translations)return source;
  let key='';
  for(const candidate of Object.keys(translations)){
    if(candidate.length>key.length&&source.startsWith(candidate))key=candidate;
  }
  return key?translations[key]+source.slice(key.length):source;
}
