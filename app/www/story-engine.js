/**
 * story-engine.js
 * 《克勞德》AI 陪伴互動遊戲 - S8 劇情與事件引擎
 * 主線四章、三大心動瞬間、日常事件池、關鍵事件選項與全階段（A→B→C）走通
 */

import { ALL_CONFIGS } from './config-loader.js';

const { events: eventsConfig } = ALL_CONFIGS;

export class StoryEngine {
  constructor(stateMachine, memorySystem) {
    this.sm = stateMachine;
    this.memory = memorySystem;
    this.activeChapter = 1;
    this.completedChapters = new Set();
    this.seenFlags = new Set();
    this.completedHeartbeats = new Set();
    this.lastGoodnightDate = '';
  }

  /**
   * 檢查當前主線章節進度與推進條件
   */
  evaluateMainStory() {
    const affection = this.sm.affection;
    const stage = this.sm.stage;

    // 第 1 章：窗前的初見
    if (this.activeChapter === 1) {
      if (affection >= 50 && !this.completedChapters.has(1)) {
        this.completedChapters.add(1);
        this.seenFlags.add('chapter1_completed');
        this.activeChapter = 2;
        return {
          trigger: true,
          chapter: 2,
          title: '傍晚的白鴿',
          art: '36370',
          cgArt: '36371',
          description: '傍晚的窗台上停著一隻銜著古老信箋的白鴿。克勞德停下手中的筆，驚訝地望向窗外。'
        };
      }
    }

    // 第 2 章：傍晚的白鴿 -> 進入曖昧期
    if (this.activeChapter === 2) {
      if (this.seenFlags.has('first_letter_read') && !this.completedChapters.has(2)) {
        this.completedChapters.add(2);
        this.seenFlags.add('chapter2_completed');
        this.activeChapter = 3;
        return {
          trigger: true,
          chapter: 3,
          title: '月夜的信鳥',
          art: '36376',
          cgArt: '36372',
          description: '夜幕低垂，發光的信鳥落在厚重典籍之上，月光如水灑在兩人的身側。'
        };
      }
    }

    // 第 3 章：月夜的信鳥 (需 3 個心動瞬間且好感 >= 75)
    if (this.activeChapter === 3) {
      const heartbeatsDone = this.completedHeartbeats.size >= 3;
      if (affection >= 75 && heartbeatsDone && !this.completedChapters.has(3)) {
        this.completedChapters.add(3);
        this.seenFlags.add('chapter3_completed');
        this.activeChapter = 4;
        return {
          trigger: true,
          chapter: 4,
          title: '日芒印章',
          art: '36378',
          cgArt: '36375',
          description: '《未竟錄》的最後一頁，日芒印章終於被鄭重蓋下。'
        };
      }
    }

    // 第 4 章：告白事件
    if (this.activeChapter === 4 && this.sm.confessed) {
      if (!this.completedChapters.has(4)) {
        this.completedChapters.add(4);
        this.seenFlags.add('vow_completed');
      }
    }

    return { trigger: false };
  }

  /**
   * 觸發心動瞬間
   * @param {number} index 心動瞬間編號 (1, 2, 3)
   */
  triggerHeartbeat(index) {
    if (index < 1 || index > 3) return null;
    const hb = eventsConfig.heartbeatMoments[index - 1];
    if (!hb) return null;

    if (!this.completedHeartbeats.has(hb.id)) {
      this.completedHeartbeats.add(hb.id);
      this.seenFlags.add(hb.flag);
      this.sm.setFlag(hb.flag);
      this.memory.recordEvent('heartbeat_moment', { id: hb.id, title: hb.title });
      return hb;
    }
    return null;
  }

  /**
   * 選擇關鍵事件選項
   * @param {object} heartbeatEvent 心動瞬間事件物件
   * @param {string} optionId 選項代碼
   */
  chooseOption(heartbeatEvent, optionId) {
    if (!heartbeatEvent || !heartbeatEvent.options) return null;
    const opt = heartbeatEvent.options.find(o => o.id === optionId);
    if (!opt) return null;

    // 套用小幅好感變動 (-1～+3)
    this.sm.applyTurnDelta(opt.delta);
    return {
      delta: opt.delta,
      response: opt.response,
      newAffection: this.sm.affection
    };
  }

  /**
   * 觸發告白事件（Chapter 4）
   * 玩家可選擇「接受」或「延後」
   */
  triggerConfessionEvent() {
    return {
      title: '日芒印章的承諾',
      art: '36375',
      dialogue: '「……這一次，我想親自把日芒印章蓋在我們的約定上。\n名門不出半成品……我對你的心意也是一樣。\n你……願意一直在這本書的下一頁，陪著我嗎？」',
      options: [
        {
          id: 'accept',
          text: '「我願意，克勞德。日芒印章已經核對完成了。」',
          delta: 3
        },
        {
          id: 'delay',
          text: '「再給我一點時間好嗎？我希望能更慎重地面對妳的心意。」',
          delta: 0
        }
      ]
    };
  }

  /**
   * 處理告白選項結果
   */
  resolveConfession(choiceId) {
    if (choiceId === 'accept') {
      this.sm.acceptConfession(); // 設旗標 vow_completed，進入 C 階段
      this.completedChapters.add(4);
      this.seenFlags.add('vow_completed');
      this.memory.recordEvent('confession_accepted', { timestamp: Date.now() });
      return {
        accepted: true,
        response: '「……（閉上雙眼，雙手輕輕貼在胸口，微風揚起漫天花瓣）\n謝謝你。那麼，日芒印章，正式蓋下——此生不渝。」',
        cg: '36375'
      };
    } else {
      return {
        accepted: false,
        response: '「……（輕咬下唇，隨後微微一笑）嗯，我知道了。這份心意值得我們更慎重地核對。我會一直等你想好的那一天。」',
        cg: null
      };
    }
  }

  /**
   * 晚安時刻事件（C 階段專屬，D16：36455 晚安主 CG 與 36628 夜間聊天 CG 皆可用）
   * @param {string} todayStr - YYYY-MM-DD
   * @param {'36455'|'36628'|'random'|'both'} preference - CG 偏好
   */
  triggerGoodnightEvent(todayStr = new Date().toISOString().slice(0, 10), preference = '36455') {
    if (this.sm.stage !== 'C') return null;
    const band = this.sm.band;
    if (band !== 'sweet' && band !== 'stable') return null;

    // 檢查每 7 夜最多一次
    if (this.lastGoodnightDate) {
      const diffDays = Math.floor((new Date(todayStr) - new Date(this.lastGoodnightDate)) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) return null;
    }

    this.lastGoodnightDate = todayStr;

    let selectedArt = '36455';
    if (preference === '36628') {
      selectedArt = '36628';
    } else if (preference === 'random' || preference === 'both') {
      selectedArt = Math.random() < 0.5 ? '36455' : '36628';
    }

    if (selectedArt === '36628') {
      return {
        art: '36628',
        cgArt: '36628',
        ratio: 'portrait',
        blurBg: true,
        dialogue: '（夜裡她靠在床頭裹著被子，懷裡抱著鯨魚玩偶，抬頭向你溫柔微笑）\n「這一段正好讀完……今晚能和你聊這麼久，我很開心。做個好夢，晚安。」'
      };
    }

    return {
      art: '36455',
      cgArt: '36455',
      ratio: '16:9',
      blurBg: false,
      dialogue: '（夜晚臥室中，她趴在鬆軟的寢具上，羽毛筆尖調皮地指向畫面）\n「很晚了喔，今晚……就這樣陪著我聊到睡著吧。晚安。」'
    };
  }

  /**
   * 夜間聊天 CG 事件（D16：36628 床上蓋被讀書）
   */
  triggerNightChatEvent() {
    if (this.sm.stage === 'A') return null;
    return {
      art: '36628',
      cgArt: '36628',
      ratio: 'portrait',
      blurBg: true,
      dialogue: '（床頭的柔和夜燈下，她裹著暖和的被子翻閱書卷，看見你走近，輕聲說道）\n「睡不著嗎？正好，這本筆記裡有些有趣的心得，一起看吧。」'
    };
  }

  /**
   * 觸碰捏臉反應 CG 事件（36627 第一人稱捏臉）
   */
  triggerCheekPinchEvent() {
    return {
      art: '36627',
      cgArt: '36627',
      ratio: 'portrait',
      blurBg: true,
      dialogue: '「你、你突然捏我的臉做什麼！（鼓起臉頰瞪著你，耳尖微紅）……名門的威嚴都要被你捏沒了！」'
    };
  }

  /**
   * 湖畔夕陽回憶 CG 事件（36622 直式夕陽湖畔）
   */
  triggerLakesideEvent() {
    return {
      art: '36622',
      cgArt: '36622',
      ratio: 'portrait',
      blurBg: true,
      dialogue: '（夕陽灑在微波粼粼的湖面上，她赤足輕晃，水花映出細碎的金光）\n「偶爾離開書庫出來走走，感覺……真的很愜意呢。」'
    };
  }
}

