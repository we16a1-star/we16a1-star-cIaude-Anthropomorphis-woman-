/**
 * config-loader.js
 * 《克勞德》AI 陪伴互動遊戲 - S1 設定檔載入器與完整性驗證
 * 支援瀏覽器 (window / file:// / fetch) 與 Node.js (fs / vm) 雙環境
 */

import characterConfig from './config/character.json' with { type: 'json' };
import stagesConfig from './config/stages.json' with { type: 'json' };
import affectionBandsConfig from './config/affection_bands.json' with { type: 'json' };
import emotionsConfig from './config/emotions.json' with { type: 'json' };
import artDistributionConfig from './config/art_distribution.json' with { type: 'json' };
import anchorsCroppingConfig from './config/anchors_cropping.json' with { type: 'json' };
import transitionsConfig from './config/transitions.json' with { type: 'json' };
import uiContrastConfig from './config/ui_contrast.json' with { type: 'json' };
import scheduleConfig from './config/schedule.json' with { type: 'json' };
import actionsConfig from './config/actions.json' with { type: 'json' };
import eventsConfig from './config/events.json' with { type: 'json' };
import extensionsConfig from './config/extensions.json' with { type: 'json' };
import crisisConfig from './config/crisis.json' with { type: 'json' };
import dialogueFallbackConfig from './config/dialogue_fallback.json' with { type: 'json' };
import replyProtocolConfig from './config/reply_protocol.json' with { type: 'json' };
import scenePacksConfig from './config/scenePacks.json' with { type: 'json' };

export const ALL_CONFIGS = {
  character: characterConfig,
  stages: stagesConfig,
  affectionBands: affectionBandsConfig,
  emotions: emotionsConfig,
  artDistribution: artDistributionConfig,
  anchorsCropping: anchorsCroppingConfig,
  transitions: transitionsConfig,
  uiContrast: uiContrastConfig,
  schedule: scheduleConfig,
  actions: actionsConfig,
  events: eventsConfig,
  extensions: extensionsConfig,
  crisis: crisisConfig,
  dialogueFallback: dialogueFallbackConfig,
  replyProtocol: replyProtocolConfig
};

/**
 * D18 擴充：BGM 與場景包設定（獨立載入，不污染核心 15 份設定檔）
 */
export { scenePacksConfig };

export function loadScenePacks() {
  validateScenePacks();
  return scenePacksConfig;
}

export function validateScenePacks(cfg = scenePacksConfig) {
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('[ConfigLoaderError] scenePacks 設定檔無效');
  }
  if (!Array.isArray(cfg.scenePacks)) {
    throw new Error('[ConfigLoaderError] scenePacks 必須為陣列');
  }
  if (typeof cfg.bgmEnabled !== 'boolean') {
    throw new Error('[ConfigLoaderError] bgmEnabled 必須為布林值');
  }
  return true;
}

/**
 * 欄位完整性驗證規則
 */
const REQUIRED_FIELDS_SCHEMA = {
  'character.json': {
    target: characterConfig,
    required: ['name', 'specialties', 'secretGoal', 'designAdjustments', 'basePrompt'],
    nested: {
      'designAdjustments.noGlasses': () => characterConfig.designAdjustments?.noGlasses === true,
      'designAdjustments.noPasta': () => characterConfig.designAdjustments?.noPasta === true,
      'designAdjustments.focusExpression': () => typeof characterConfig.designAdjustments?.focusExpression === 'string'
    }
  },
  'stages.json': {
    target: stagesConfig,
    required: ['parameters', 'stages'],
    nested: {
      'parameters.maxAffection': () => stagesConfig.parameters?.maxAffection === 100,
      'parameters.dailyAffectionGainCap': () => stagesConfig.parameters?.dailyAffectionGainCap === 10,
      'stages.A': () => !!stagesConfig.stages?.A,
      'stages.B': () => !!stagesConfig.stages?.B,
      'stages.C': () => !!stagesConfig.stages?.C
    }
  },
  'affection_bands.json': {
    target: affectionBandsConfig,
    required: ['buffer', 'bands'],
    nested: {
      'bands.sweet': () => !!affectionBandsConfig.bands?.sweet,
      'bands.stable': () => !!affectionBandsConfig.bands?.stable,
      'bands.awkward': () => !!affectionBandsConfig.bands?.awkward,
      'bands.reconciliation': () => !!affectionBandsConfig.bands?.reconciliation
    }
  },
  'emotions.json': {
    target: emotionsConfig,
    required: ['whitelist', 'defaultEmotion'],
    nested: {
      'whitelist.hasNeutral': () => emotionsConfig.whitelist?.includes('neutral'),
      'whitelist.hasShy': () => emotionsConfig.whitelist?.includes('shy')
    }
  },
  'art_distribution.json': {
    target: artDistributionConfig,
    required: ['entries', 'defaultDayArt', 'defaultNightArt', 'openingArt'],
    nested: {
      'entries.36377': () => !!artDistributionConfig.entries?.['36377'],
      'entries.36378': () => !!artDistributionConfig.entries?.['36378'],
      'entries.36376': () => !!artDistributionConfig.entries?.['36376'],
      'entries.v5.newTen': () => ['36621', '36622', '36623', '36624', '36625', '36626', '36627', '36628', '36629', '36632'].every(id => !!artDistributionConfig.entries?.[id]),
      'entries.v5.unusedNoFile': () => ['36623', '36624', '36625'].every(id => artDistributionConfig.entries?.[id]?.file === null && artDistributionConfig.entries[id].level === '不使用' && artDistributionConfig.entries[id].autoSwitch === false),
      'entries.v5.pending': () => artDistributionConfig.entries?.['36621']?.autoSwitch === false && String(artDistributionConfig.entries['36621'].trigger || '').includes('去背') && artDistributionConfig.entries?.['36629']?.autoSwitch === false && String(artDistributionConfig.entries['36629'].trigger || '').includes('預設不用'),
      'entries.v5.portraitSizes': () => {
        const expected = { '36621': [1086, 1448], '36622': [941, 1672], '36626': [940, 1672], '36627': [941, 1672], '36628': [1024, 1536], '36629': [1024, 1536], '36632': [1199, 1312] };
        return Object.entries(expected).every(([id, [width, height]]) => artDistributionConfig.entries?.[id]?.width === width && artDistributionConfig.entries[id].height === height);
      },
      'entries.36455.file': () => artDistributionConfig.entries?.['36455']?.file === 'g43-cg-bed-goodnight.jpg'
    }
  },
  'anchors_cropping.json': {
    target: anchorsCroppingConfig,
    required: ['targetAspectWidth', 'targetAspectHeight', 'anchors'],
    nested: {
      'targetAspectWidth.16': () => anchorsCroppingConfig.targetAspectWidth === 16,
      'targetAspectHeight.9': () => anchorsCroppingConfig.targetAspectHeight === 9
    }
  },
  'transitions.json': {
    target: transitionsConfig,
    required: ['timings', 'rules'],
    nested: {
      'timings.sameGroupCrossfade': () => !!transitionsConfig.timings?.sameGroupCrossfade,
      'rules.minCgHoldSeconds': () => transitionsConfig.rules?.minCgHoldSeconds >= 5
    }
  },
  'ui_contrast.json': {
    target: uiContrastConfig,
    required: ['dayTextBox', 'nightTextBox', 'openingTitle36377'],
    nested: {
      'dayTextBox.bgColor': () => uiContrastConfig.dayTextBox?.bgColor === '#2B1A12',
      'openingTitle36377.textColor': () => uiContrastConfig.openingTitle36377?.textColor === '#3A2316'
    }
  },
  'schedule.json': {
    target: scheduleConfig,
    required: ['parameters', 'periods'],
    nested: {
      'periods.length.6': () => Array.isArray(scheduleConfig.periods) && scheduleConfig.periods.length === 6,
      'parameters.maxRecentLogs': () => scheduleConfig.parameters?.maxRecentLogs === 5,
      'life.timeBase.story': () => scheduleConfig.life?.timeBase === 'story',
      'life.realModeEnabled': () => scheduleConfig.life?.realModeEnabled === true
    }
  },
  'actions.json': {
    target: actionsConfig,
    required: ['whitelist', 'actions'],
    nested: {
      'whitelist.length.14': () => Array.isArray(actionsConfig.whitelist) && actionsConfig.whitelist.length === 14
    }
  },
  'events.json': {
    target: eventsConfig,
    required: ['mainChapters', 'heartbeatMoments', 'dailyEvents'],
    nested: {
      'mainChapters.length.4': () => Array.isArray(eventsConfig.mainChapters) && eventsConfig.mainChapters.length === 4
    }
  },
  'extensions.json': {
    target: extensionsConfig,
    required: ['rules', 'mechanisms'],
    nested: {
      'mechanisms.length.11': () => Array.isArray(extensionsConfig.mechanisms) && extensionsConfig.mechanisms.length === 11,
      'expansion.dailyBonusCap': () => extensionsConfig.expansion?.dailyBonusCap === 3,
      'usage.dailyCap.disabledByDefault': () => extensionsConfig.usage?.dailyCap?.enabled === false
    }
  },
  'crisis.json': {
    target: crisisConfig,
    required: ['crisisKeywords', 'lowMoodKeywords', 'supportHotlines', 'safetyResponseTemplate', 'safetyResponseTemplateEn'],
    nested: {
      'crisisKeywords.nonEmpty': () => Array.isArray(crisisConfig.crisisKeywords) && crisisConfig.crisisKeywords.length >= 14,
      'lowMoodKeywords.nonEmpty': () => Array.isArray(crisisConfig.lowMoodKeywords) && crisisConfig.lowMoodKeywords.length >= 20,
      'supportHotlines.has1925': () => crisisConfig.supportHotlines?.some(h => h.number === '1925'),
      'supportHotlines.has1995': () => crisisConfig.supportHotlines?.some(h => h.number === '1995'),
      'supportHotlines.has1980': () => crisisConfig.supportHotlines?.some(h => h.number === '1980'),
      'safetyResponseTemplate.hasHotlines': () => ['1925', '1995', '1980'].every(n => String(crisisConfig.safetyResponseTemplate || '').includes(n)),
      'safetyResponseTemplateEn.hasHotlines': () => ['1925', '1995', '1980'].every(n => String(crisisConfig.safetyResponseTemplateEn || '').includes(n))
    }
  },
  'dialogue_fallback.json': {
    target: dialogueFallbackConfig,
    required: ['offlineGreetings', 'situationDialogues'],
    nested: {
      'offlineGreetings.ABC': () => !!dialogueFallbackConfig.offlineGreetings?.A && !!dialogueFallbackConfig.offlineGreetings?.B && !!dialogueFallbackConfig.offlineGreetings?.C
    }
  },
  'reply_protocol.json': {
    target: replyProtocolConfig,
    required: ['fields', 'outputFormat', 'promptSectionTemplate', 'retryRule', 'fallbackRule'],
    nested: {
      'fields.text.required': () => replyProtocolConfig.fields?.text?.required === true,
      'fields.action.onInvalid.discard': () => replyProtocolConfig.fields?.action?.onInvalid === 'discard',
      'fields.affection_delta.range': () => replyProtocolConfig.fields?.affection_delta?.min === -3 && replyProtocolConfig.fields?.affection_delta?.max === 3
    }
  }
};

/**
 * 執行驗證，若有欄位缺漏報錯並指出檔名
 * @returns {boolean} 驗證通過回傳 true，否則拋出例外
 */
export function validateConfigs(customSchema = REQUIRED_FIELDS_SCHEMA) {
  for (const [filename, schema] of Object.entries(customSchema)) {
    const { target, required, nested } = schema;
    if (!target || typeof target !== 'object') {
      throw new Error(`[ConfigLoaderError] 設定檔遺失或非有效物件: ${filename}`);
    }
    for (const field of required) {
      if (target[field] === undefined || target[field] === null) {
        throw new Error(`[ConfigLoaderError] 設定檔 ${filename} 缺少必要頂層欄位: '${field}'`);
      }
    }
    if (nested) {
      for (const [subfield, validator] of Object.entries(nested)) {
        if (!validator()) {
          throw new Error(`[ConfigLoaderError] 設定檔 ${filename} 的欄位校驗失敗: '${subfield}'`);
        }
      }
    }
  }
  return true;
}

/**
 * 載入並驗證所有設定檔
 */
export function loadConfigs() {
  validateConfigs();
  return ALL_CONFIGS;
}

