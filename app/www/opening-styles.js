// 序章風格資料檔：每個風格有 id、中英 label 與中英開場指示；resolveOpeningStyle／
// openingStylePrompt 供 app.js 抽選與組提示詞。新增風格照既有格式補一筆（中英都要）。
export const RANDOM_OPENING_STYLE = 'random';
export const AI_RANDOM_OPENING_STYLE = 'ai_random';
export const CUSTOM_OPENING_STYLE = 'custom';

export const OPENING_STYLES = [
  {
    id: 'rainy_first_meeting',
    label: { zh: '雨夜初遇 · 經典書庫', en: 'First Meeting · Rainy Archive' },
    prompt: {
      zh: '從雨夜的古籍閱覽室展開初遇。用一件正在發生的小事讓兩人自然交談；氛圍安靜、含蓄，避免用長篇背景介紹開場。',
      en: 'Open with a first meeting in the archive on a rainy night. Let a small event in progress naturally bring the two characters into conversation. Keep the mood quiet and restrained; avoid a long block of background exposition.'
    }
  },
  {
    id: 'after_hours_visitor',
    label: { zh: '閉館後訪客 · 懸疑', en: 'After-Hours Visitor · Mystery' },
    prompt: {
      zh: '閉館後，主角在不對外開放的書庫遇見守書人。讓一張掉落的借閱紙條或一扇未鎖的門引出短小懸疑；兩人仍是初次相識，先建立好奇與戒心。',
      en: 'After closing, the protagonist meets the keeper in a normally restricted archive. Use a misplaced call slip or an unlocked door to introduce a small mystery. They are strangers; begin with curiosity and caution.'
    }
  },
  {
    id: 'missing_forbidden_book',
    label: { zh: '禁書失竊 · 緊張追查', en: 'Missing Forbidden Book · Investigation' },
    prompt: {
      zh: '以一本禁書剛剛失蹤、館內警報留下異常痕跡作為第一幕。讓玩家到訪恰好撞上事件，守書人提出一個具體、可拒絕的協助請求；節奏緊湊但不替玩家決定行動。',
      en: 'Begin just after a forbidden book has vanished, with an unexplained trace left by the archive alarm. The protagonist arrives as it happens. The keeper makes a concrete, optional request for help. Keep the pace brisk without choosing the player’s actions.'
    }
  },
  {
    id: 'storm_blackout',
    label: { zh: '暴雨停電 · 意外合作', en: 'Storm Blackout · Unexpected Teamwork' },
    prompt: {
      zh: '暴雨讓知識之塔短暫停電，兩人在昏暗書架間為保護一冊正在修復的古書而合作。從聲音、微光與臨場分工建立畫面，不要預設玩家已和守書人熟識。',
      en: 'A storm briefly cuts the Tower of Knowledge power. The two characters meet while working together to protect a manuscript under repair. Build the scene through sound, small sources of light, and immediate teamwork; do not assume they already know each other.'
    }
  },
  {
    id: 'unsigned_letter',
    label: { zh: '無名來信 · 命運伏筆', en: 'Unsigned Letter · A Thread of Fate' },
    prompt: {
      zh: '以一封沒有署名、卻準確寫著玩家姓名的信開始。守書人正在辨認信上的舊式印記，信中線索把兩人帶往圖書館一處少有人知的角落；保持神秘但不要過早揭曉答案。',
      en: 'Start with an unsigned letter addressed unmistakably to the player. The keeper is examining an old seal on it, and a clue leads them toward a little-known corner of the library. Keep the mystery alive without revealing its answer too soon.'
    }
  },
  {
    id: 'dawn_observatory',
    label: { zh: '黎明觀星室 · 靜謐奇幻', en: 'Dawn Observatory · Quiet Fantasy' },
    prompt: {
      zh: '在黎明前的塔頂觀星室初遇。一本古老星圖出現與當夜天空不符的新記號，守書人正試著確認它是否會移動；以靜謐奇幻感開場，讓異象成為第一個共同謎題。',
      en: 'Set the first meeting in the tower observatory just before dawn. A new mark has appeared on an old star chart that does not match the sky, and the keeper is checking whether it moves. Begin with quiet fantasy and let the anomaly become their first shared puzzle.'
    }
  },
  {
    id: 'garden_repair',
    label: { zh: '溫室修書 · 溫柔日常', en: 'Greenhouse Book Repair · Gentle Slice of Life' },
    prompt: {
      zh: '春日清晨，玩家在塔內溫室撞見守書人晾乾一本被雨水濺濕的舊書。從植物、修復小意外與一杯茶開始對話；走溫暖日常路線，保留自然的初識距離。',
      en: 'On a spring morning, the player finds the keeper drying an old book splashed by rain in the tower greenhouse. Let plants, a small repair mishap, and a cup of tea begin the conversation. Keep it warm and everyday, with the natural distance of a first meeting.'
    }
  },
  {
    id: 'lantern_book_fair',
    label: { zh: '燈火書市 · 熱鬧相遇', en: 'Lantern Book Fair · Lively Meeting' },
    prompt: {
      zh: '知識之塔舉辦夜間舊書市集，守書人正阻止一本會自己翻頁的古書混進攤位。讓人聲與燈火襯出兩人的相遇，帶一點輕快和奇幻。',
      en: 'An evening book fair fills the Tower of Knowledge. The keeper is trying to stop a book that turns its own pages from slipping into a stall. Let the lanterns and bustle frame a light, fantastical first meeting.'
    }
  },
  {
    id: 'hidden_staircase',
    label: { zh: '藏書後的階梯 · 探索', en: 'Stair Behind the Shelves · Discovery' },
    prompt: {
      zh: '一排書架移位，露出地圖上沒有標示的階梯；守書人正檢查牆上的新鮮刮痕。以探索與共同解謎開場，不預設玩家已踏進階梯。',
      en: 'A shifted bookcase reveals stairs missing from every map. The keeper is inspecting fresh marks on the wall. Begin with discovery and a shared puzzle without assuming the player has entered the passage.'
    }
  },
  {
    id: 'returning_book',
    label: { zh: '遲來的還書 · 微妙日常', en: 'A Very Late Return · Quiet Everyday' },
    prompt: {
      zh: '一本逾期多年的書被送回知識之塔，書頁間夾著仍然鮮活的花瓣與一張未完成的便條。守書人邀玩家一起辨認來源，氣氛溫柔、帶些好奇。',
      en: 'A book overdue by many years is returned to the Tower of Knowledge. Between its pages are a still-fresh petal and an unfinished note. The keeper invites the player to help identify their origin; keep the mood gentle and curious.'
    }
  },
  {
    id: 'living_footnotes',
    label: { zh: '會移動的註記 · 奇幻謎團', en: 'Moving Footnotes · Fantasy Mystery' },
    prompt: {
      zh: '守書人發現古籍裡的註記正從一頁移到另一頁，像在回應窗外的鐘聲。讓這個小異象帶出初次交談與第一個線索，不急著解釋原因。',
      en: 'The keeper notices annotations moving from page to page, as if answering the bell outside. Let the small anomaly spark their first conversation and a clue; do not explain its cause too soon.'
    }
  },
  {
    id: 'tea_room_mixup',
    label: { zh: '茶室送錯的書 · 輕鬆誤會', en: 'The Wrong Book in the Tea Room · Light Mix-Up' },
    prompt: {
      zh: '茶室送來的不是茶，而是一本寫著守書人名字、卻封面全新的陌生書。兩人都不知道送件者是誰，從一場禮貌又略帶尷尬的誤會開始。',
      en: 'The tea room delivers no tea, only a new-looking book addressed to the keeper. Neither character knows who sent it. Start with a polite, slightly awkward mix-up.'
    }
  },
  {
    id: 'tomorrows_catalogue',
    label: { zh: '明日的目錄 · 命運懸念', en: 'Tomorrow’s Catalogue · A Hint of Fate' },
    prompt: {
      zh: '新編的館藏目錄裡，出現一筆日期是明天、內容卻提到玩家將會找到某本書的紀錄。守書人邀玩家一同確認，懸念克制，不宣告命運已被決定。',
      en: 'A freshly written catalogue contains an entry dated tomorrow, describing a book the player will supposedly find. The keeper invites them to investigate. Keep the suspense subtle and do not imply that fate is fixed.'
    }
  },
  {
    id: 'wind_court_reading',
    label: { zh: '風庭朗讀會 · 共同創作', en: 'Reading in the Wind Court · Shared Creativity' },
    prompt: {
      zh: '塔內庭院臨時舉辦朗讀會，一陣風把未完成的故事稿吹散。守書人正拾起最後一頁，邀玩家一起決定怎麼找回缺失的段落；以輕柔、可互動的場面展開。',
      en: 'A pop-up reading is under way in the tower courtyard when a gust scatters an unfinished story. The keeper catches the last page and invites the player to help recover what is missing. Open on a gentle, interactive scene.'
    }
  },
  {
    id: AI_RANDOM_OPENING_STYLE,
    label: { zh: '完全隨機 · 交給 AI 自由創作', en: 'Fully Random · Let AI Create the Opening' },
    prompt: {
      zh: '完全自由創作一個原創序章：由 AI 自行選擇新鮮的地點、正在發生的事件、故事氣氛與相遇方式，不套用任何預設序章。遵守角色與世界設定，直接開始故事，不預設玩家已採取行動；照常生成恰好七個不同選項。',
      en: 'Create a fully original prologue. Choose a fresh place, unfolding event, mood, and way for the characters to meet; do not reuse a preset opening. Follow the character and world settings, begin the story directly without assuming player actions, and still provide exactly seven distinct choices.'
    }
  }
];

export function resolveOpeningStyle(id, random = Math.random) {
  if (id === CUSTOM_OPENING_STYLE) return id;
  if (OPENING_STYLES.some(style => style.id === id)) return id;
  if (id !== RANDOM_OPENING_STYLE) return OPENING_STYLES[0].id;
  return OPENING_STYLES[Math.floor(random() * OPENING_STYLES.length)].id;
}

export function openingStylePrompt(id, language = 'zh') {
  if (id === CUSTOM_OPENING_STYLE) return language === 'en'
    ? 'Use the player’s optional opening idea if provided. Otherwise invent a fresh opening from the character and world settings. Preserve the story rules and do not assume the player has acted.'
    : '若玩家提供了自訂方向，請以此作為序章靈感；若留白，便從角色與世界設定中自由創作新鮮開場。遵守故事規則，不預設玩家已採取行動。';
  return OPENING_STYLES.find(style => style.id === id)?.prompt[language === 'en' ? 'en' : 'zh'] || OPENING_STYLES[0].prompt[language === 'en' ? 'en' : 'zh'];
}
