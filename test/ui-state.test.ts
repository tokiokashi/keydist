import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultUiState,
  DEFAULT_CONDITION_DEFAULTS,
  LEGACY_SELECTION_KEY,
  LEGACY_TEXT_COLLAPSED_KEY,
  LEGACY_THEME_KEY,
  loadUiState,
  MAX_SAVED_TEXT_LENGTH,
  sanitizeUiState,
  saveUiState,
  UI_STATE_STORAGE_KEY,
  type UiStateChoices,
  type UiStateStorage,
} from '../src/ui-state.ts';
import { describeConditions, describePlaybackConditions } from '../src/condition-description.ts';

class MemoryStorage implements UiStateStorage {
  readonly data = new Map<string, string>();
  throwOnGet = false;
  throwOnSet = false;
  throwOnRemove = false;

  getItem(key: string): string | null {
    if (this.throwOnGet) throw new Error('getItem unavailable');
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new Error('setItem unavailable');
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    if (this.throwOnRemove) throw new Error('removeItem unavailable');
    this.data.delete(key);
  }
}

const choices: UiStateChoices = {
  layouts: {
    en: ['qwerty', 'dvorak'],
    ja: ['qwerty', 'oonishi'],
  },
  samples: {
    en: ['default'],
    ja: ['modern', 'legacy'],
  },
};

const defaults = () => createDefaultUiState({
  textPanelOpen: true,
  usePlaybackCalibration: false,
  selectedLayouts: {
    en: ['qwerty', 'dvorak'],
    ja: ['qwerty', 'oonishi'],
  },
});

test('画面状態を単一キーで保存・復元する', () => {
  const storage = new MemoryStorage();
  const state = defaults();
  state.ui.theme = 'dark';
  state.ui.input.mode = 'en';
  state.ui.input.customText = 'edited';
  state.ui.layouts.selectedByMode.ja = [];
  state.ui.playback.stepsPerSecond = 3.2;
  state.ui.playback.fingerPreparationSeconds = 0.35;
  state.ui.playback.keyFeedbackStyle = 'bounce';
  state.ui.playback.showChain = true;
  state.ui.playback.showChainOnRateChart = false;
  state.ui.playback.showArpeggio = false;
  state.ui.playback.showArpeggioOnRateChart = true;
  state.conditions.defaults.playbackRateWindow = 24;
  state.ui.playback.allFingerMovementDelay = true;
  state.conditions.perLayout.oonishi = {
    playback: {
      stepsPerSecond: 4.5,
    },
  };
  state.ui.panels.playback = true;

  assert.equal(saveUiState(storage, state), true);
  assert.deepEqual(loadUiState(storage, defaults(), choices).state, state);
  assert.equal(storage.data.size, 1);
});

test('全指移動律速は既定OFFでbooleanだけ復元する', () => {
  const fallback = defaults();
  assert.equal(fallback.ui.playback.allFingerMovementDelay, false);

  const value = structuredClone(fallback) as unknown as Record<string, any>;
  value.ui.playback.allFingerMovementDelay = true;
  assert.equal(sanitizeUiState(value, fallback, choices).ui.playback.allFingerMovementDelay, true);

  value.ui.playback.allFingerMovementDelay = 'yes';
  assert.equal(sanitizeUiState(value, fallback, choices).ui.playback.allFingerMovementDelay, false);
});

test('キー入力パターンのガイド表示は既定ONでbooleanだけ復元する', () => {
  const fallback = defaults();
  assert.equal(fallback.ui.layers.keyPatternGuide, true);

  const value = structuredClone(fallback) as unknown as Record<string, any>;
  value.ui.layers.keyPatternGuide = false;
  assert.equal(sanitizeUiState(value, fallback, choices).ui.layers.keyPatternGuide, false);

  value.ui.layers.keyPatternGuide = 'yes';
  assert.equal(sanitizeUiState(value, fallback, choices).ui.layers.keyPatternGuide, true);
});

test('旧comboGuide設定はkeyPatternGuideへ互換移行する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback) as unknown as Record<string, any>;
  delete value.ui.layers.keyPatternGuide;
  value.ui.layers.comboGuide = false;

  assert.equal(sanitizeUiState(value, fallback, choices).ui.layers.keyPatternGuide, false);
});

test('指位置の準備時間は非負の有限値だけ復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.ui.playback.fingerPreparationSeconds = 0.4;
  assert.equal(sanitizeUiState(value, fallback, choices).ui.playback.fingerPreparationSeconds, 0.4);

  value.ui.playback.fingerPreparationSeconds = -1;
  assert.equal(sanitizeUiState(value, fallback, choices).ui.playback.fingerPreparationSeconds, 0);

  value.ui.playback.fingerPreparationSeconds = Number.POSITIVE_INFINITY;
  assert.equal(sanitizeUiState(value, fallback, choices).ui.playback.fingerPreparationSeconds, 0);
});

test('キー押下フィードバックは選択肢だけ復元し既定はフェード', () => {
  const fallback = defaults();
  assert.equal(fallback.ui.playback.keyFeedbackStyle, 'fade');

  const value = structuredClone(fallback) as unknown as Record<string, any>;
  value.ui.playback.keyFeedbackStyle = 'pulse';
  assert.equal(sanitizeUiState(value, fallback, choices).ui.playback.keyFeedbackStyle, 'pulse');

  value.ui.playback.keyFeedbackStyle = 'spin';
  assert.equal(sanitizeUiState(value, fallback, choices).ui.playback.keyFeedbackStyle, 'fade');
});

test('速度の移動平均窓は1〜50の整数だけ復元する', () => {
  const fallback = defaults();
  assert.equal(fallback.conditions.defaults.playbackRateWindow, 10);

  const value = structuredClone(fallback);
  value.conditions.defaults.playbackRateWindow = 25;
  assert.equal(sanitizeUiState(value, fallback, choices).conditions.defaults.playbackRateWindow, 25);

  value.conditions.defaults.playbackRateWindow = 0;
  assert.equal(sanitizeUiState(value, fallback, choices).conditions.defaults.playbackRateWindow, 10);

  value.conditions.defaults.playbackRateWindow = 51;
  assert.equal(sanitizeUiState(value, fallback, choices).conditions.defaults.playbackRateWindow, 10);

  value.conditions.defaults.playbackRateWindow = 2.5;
  assert.equal(sanitizeUiState(value, fallback, choices).conditions.defaults.playbackRateWindow, 10);
});

test('速度平均方式とEWMA半減期は有効範囲だけ復元する', () => {
  const fallback = defaults();
  assert.equal(fallback.conditions.defaults.playbackRateAverage, 'sma');
  assert.equal(fallback.conditions.defaults.playbackRateHalfLifeSeconds, 1);

  const value = structuredClone(fallback) as unknown as Record<string, any>;
  value.conditions.defaults.playbackRateAverage = 'ewma';
  value.conditions.defaults.playbackRateHalfLifeSeconds = 2.5;
  const valid = sanitizeUiState(value, fallback, choices);
  assert.equal(valid.conditions.defaults.playbackRateAverage, 'ewma');
  assert.equal(valid.conditions.defaults.playbackRateHalfLifeSeconds, 2.5);

  value.conditions.defaults.playbackRateAverage = 'median';
  value.conditions.defaults.playbackRateHalfLifeSeconds = 0;
  const invalid = sanitizeUiState(value, fallback, choices);
  assert.equal(invalid.conditions.defaults.playbackRateAverage, 'sma');
  assert.equal(invalid.conditions.defaults.playbackRateHalfLifeSeconds, 1);
});

test('保存形式はuiとconditionsに分かれ、canonical条件だけ復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.conditions.defaults = {
    geometry: 'column-staggered',
    windowSize: 5,
    playbackRateAverage: 'ewma',
    playbackRateWindow: 20,
    playbackRateHalfLifeSeconds: 1.5,
    sfbHomeCost: false,
    preferOppositeThumb: true,
    chain: {
      breakOnSameFinger: false,
      breakOnTriggerOnly: true,
      breakOnThumbOnly: false,
      breakOnOppositeHandSimultaneous: true,
    },
    arpeggioPolicy: {
      includeThumb: true,
      bridgeSameFinger: true,
      includeSingleRedirectTail: false,
    },
    triggerRealization: { useHold: true },
    actionRealization: { holdStart: 'separate' },
  };
  value.conditions.perLayout = {
    oonishi: { geometry: 'ortholinear', windowSize: 7, sfbHomeCost: false, romajiRule: 'azik' },
    qwerty: {},
    removed: { windowSize: 9 },
    invalid: { windowSize: 99 },
  };
  (value.conditions.perLayout.invalid as Record<string, unknown>).preferOppositeThumb = 'yes';
  (value.conditions.perLayout.oonishi as Record<string, unknown>).playbackRateAverage = 'ewma';
  (value.conditions.perLayout.oonishi as Record<string, unknown>).playbackRateWindow = 40;
  (value.conditions.perLayout.oonishi as Record<string, unknown>).playbackRateHalfLifeSeconds = 2;

  const state = sanitizeUiState(value, fallback, choices);

  assert.deepEqual(Object.keys(state).sort(), ['conditions', 'ui', 'version']);
  assert.deepEqual(state.conditions.defaults, value.conditions.defaults);
  assert.deepEqual(state.conditions.perLayout, {
    oonishi: { geometry: 'ortholinear', windowSize: 7, sfbHomeCost: false, romajiRule: 'azik' },
    qwerty: {},
  });
  assert.equal('playbackRateAverage' in state.conditions.perLayout.oonishi, false);
  assert.equal('playbackRateWindow' in state.conditions.perLayout.oonishi, false);
  assert.equal('playbackRateHalfLifeSeconds' in state.conditions.perLayout.oonishi, false);
});
test('旧Chain UI設定はChainPolicyへ移行し旧playback fieldを保存しない', () => {
  const fallback = defaults();
  const value = structuredClone(fallback) as unknown as Record<string, any>;
  delete value.conditions.defaults.chain;
  value.ui.playback.chainIncludeSameFinger = true;
  value.ui.playback.chainIncludeLayerKeys = false;
  value.conditions.perLayout.oonishi = {
    playback: {
      chainIncludeSameFinger: false,
      chainIncludeLayerKeys: false,
    },
  };

  const state = sanitizeUiState(value, fallback, choices);
  assert.deepEqual(state.conditions.defaults.chain, {
    breakOnSameFinger: false,
    breakOnTriggerOnly: true,
    breakOnThumbOnly: true,
    breakOnOppositeHandSimultaneous: false,
  });
  assert.deepEqual(state.conditions.perLayout.oonishi.chain, {
    breakOnSameFinger: true,
    breakOnTriggerOnly: true,
    breakOnThumbOnly: true,
    breakOnOppositeHandSimultaneous: false,
  });
  assert.equal('chainIncludeSameFinger' in state.ui.playback, false);
  assert.equal('chainIncludeLayerKeys' in state.ui.playback, false);
  assert.equal('chainIncludeSameFinger' in (state.conditions.perLayout.oonishi.playback ?? {}), false);
});
test('ArpeggioPolicyはcanonical条件として保存・復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.conditions.defaults.arpeggioPolicy = {
    includeThumb: true,
    bridgeSameFinger: true,
    includeSingleRedirectTail: true,
  };
  value.conditions.perLayout.oonishi = {
    arpeggioPolicy: {
      includeThumb: false,
      bridgeSameFinger: true,
      includeSingleRedirectTail: false,
    },
  };

  const state = sanitizeUiState(value, fallback, choices);
  assert.deepEqual(state.conditions.defaults.arpeggioPolicy, value.conditions.defaults.arpeggioPolicy);
  assert.deepEqual(
    state.conditions.perLayout.oonishi.arpeggioPolicy,
    value.conditions.perLayout.oonishi.arpeggioPolicy,
  );
  assert.equal('arpeggio' in state.conditions.defaults, false);
});
test('TriggerRealizationPolicyはglobal / per-layoutで保存・復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.conditions.defaults.triggerRealization = { useHold: true };
  value.conditions.perLayout.oonishi = {
    triggerRealization: { useHold: false },
  };

  const state = sanitizeUiState(value, fallback, choices);
  assert.deepEqual(state.conditions.defaults.triggerRealization, { useHold: true });
  assert.deepEqual(state.conditions.perLayout.oonishi.triggerRealization, { useHold: false });
});

test('ActionRealizationPolicyはglobal / per-layoutで保存・復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.conditions.defaults.actionRealization = { holdStart: 'separate' };
  value.conditions.perLayout.oonishi = {
    actionRealization: { holdStart: 'combined' },
  };

  const state = sanitizeUiState(value, fallback, choices);
  assert.deepEqual(state.conditions.defaults.actionRealization, { holdStart: 'separate' });
  assert.deepEqual(state.conditions.perLayout.oonishi.actionRealization, { holdStart: 'combined' });
});

test('旧ArpeggioConditionsはincludeThumbだけ新Policyへ移し幾何条件を破棄する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback) as unknown as Record<string, any>;
  delete value.conditions.defaults.arpeggioPolicy;
  value.conditions.defaults.arpeggio = {
    minHorizontalSpread: 1.5,
    maxRowReversal: null,
    maxRowStep: 1,
    includeThumb: true,
    breakOnOppositeHand: true,
  };

  const state = sanitizeUiState(value, fallback, choices);
  assert.deepEqual(state.conditions.defaults.arpeggioPolicy, {
    includeThumb: true,
    bridgeSameFinger: false,
    includeSingleRedirectTail: false,
  });
  assert.equal('arpeggio' in state.conditions.defaults, false);
  assert.equal('minHorizontalSpread' in state.conditions.defaults.arpeggioPolicy, false);
  assert.equal('breakOnOppositeHand' in state.conditions.defaults.arpeggioPolicy, false);
});
test('配列固有の打鍵再生設定は既定値からの差分だけ復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.conditions.perLayout = {
    oonishi: { playback: { stepsPerSecond: 4.5, showChain: true, showSameFingerMotion: true } },
    removed: { playback: { stepsPerSecond: 6 } },
  };

  const state = sanitizeUiState(value, fallback, choices);

  assert.deepEqual(state.conditions.perLayout, {
    oonishi: {
      playback: {
        stepsPerSecond: 4.5,
        showChain: true,
        showChainOnRateChart: true,
        showSameFingerMotion: true,
      },
    },
  });
});

test('配列固有の旧共有構造表示だけを対応するグラフ表示へ移行する', () => {
  const fallback = defaults();
  fallback.ui.playback.showChain = false;
  fallback.ui.playback.showArpeggio = true;
  fallback.ui.playback.showChainOnRateChart = false;
  fallback.ui.playback.showArpeggioOnRateChart = true;

  const value = structuredClone(fallback);
  value.conditions.perLayout = {
    oonishi: {
      playback: {
        showChain: true,
        showChainOnRateChart: false,
        showArpeggio: false,
      },
    },
  };

  const state = sanitizeUiState(value, fallback, choices);
  assert.deepEqual(state.conditions.perLayout.oonishi.playback, {
    showChain: true,
    showChainOnRateChart: false,
    showArpeggio: false,
    showArpeggioOnRateChart: false,
  });
});

test('配列図と速度グラフの構造表示は独立して保存・復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.ui.playback.showChain = true;
  value.ui.playback.showArpeggio = false;
  value.ui.playback.showChainOnRateChart = false;
  value.ui.playback.showArpeggioOnRateChart = true;

  const state = sanitizeUiState(value, fallback, choices);
  assert.equal(state.ui.playback.showChain, true);
  assert.equal(state.ui.playback.showArpeggio, false);
  assert.equal(state.ui.playback.showChainOnRateChart, false);
  assert.equal(state.ui.playback.showArpeggioOnRateChart, true);
});

test('独立設定導入前の構造表示はグラフ側にも同じ実効値を引き継ぐ', () => {
  const fallback = defaults();
  const value = structuredClone(fallback) as unknown as Record<string, any>;
  delete value.ui.playback.showChainOnRateChart;
  delete value.ui.playback.showArpeggioOnRateChart;
  value.ui.playback.showChain = true;
  value.ui.playback.showArpeggio = false;

  const state = sanitizeUiState(value, fallback, choices);
  assert.equal(state.ui.playback.showChainOnRateChart, true);
  assert.equal(state.ui.playback.showArpeggioOnRateChart, false);
});

test('同指移動の表示設定はモデル設定と独立して保存・復元する', () => {
  const fallback = defaults();
  assert.equal(fallback.ui.playback.sameFingerDelay, true);
  assert.equal(fallback.ui.playback.showSameFingerMotion, false);

  const value = structuredClone(fallback);
  value.ui.playback.sameFingerDelay = true;
  value.ui.playback.showSameFingerMotion = true;

  const state = sanitizeUiState(value, fallback, choices);
  assert.equal(state.ui.playback.sameFingerDelay, true);
  assert.equal(state.ui.playback.showSameFingerMotion, true);

  value.ui.playback.sameFingerDelay = false;
  value.ui.playback.showSameFingerMotion = true;
  const modelOff = sanitizeUiState(value, fallback, choices);
  assert.equal(modelOff.ui.playback.sameFingerDelay, false);
  assert.equal(modelOff.ui.playback.showSameFingerMotion, true);
});

test('旧アルペジオ表示範囲は実効表示を保ったまま個別表示へ移行する', () => {
  const legacyDisplays = [undefined, 'chain', 'arpeggio', 'both'] as const;
  for (const legacyDisplay of legacyDisplays) {
    for (const savedShowChain of [false, true]) {
      const fallback = defaults();
      const value = structuredClone(fallback);
      const playback = value.ui.playback as unknown as Record<string, unknown>;
      delete playback.showArpeggio;
      delete playback.showChainOnRateChart;
      delete playback.showArpeggioOnRateChart;
      playback.showChain = savedShowChain;
      if (legacyDisplay === undefined) delete playback.arpeggioDisplay;
      else playback.arpeggioDisplay = legacyDisplay;

      const state = sanitizeUiState(value, fallback, choices);
      assert.deepEqual(
        {
          showChain: state.ui.playback.showChain,
          showArpeggio: state.ui.playback.showArpeggio,
          showChainOnRateChart: state.ui.playback.showChainOnRateChart,
          showArpeggioOnRateChart: state.ui.playback.showArpeggioOnRateChart,
        },
        {
          showChain: legacyDisplay === 'arpeggio' ? false : savedShowChain,
          showArpeggio: savedShowChain
            && (legacyDisplay === undefined
              || legacyDisplay === 'arpeggio'
              || legacyDisplay === 'both'),
          showChainOnRateChart: legacyDisplay === 'arpeggio' ? false : savedShowChain,
          showArpeggioOnRateChart: savedShowChain
            && (legacyDisplay === undefined
              || legacyDisplay === 'arpeggio'
              || legacyDisplay === 'both'),
        },
        `${String(legacyDisplay)} / showChain=${savedShowChain}`,
      );
    }
  }
});

test('条件説明は既定値にある条件をすべて説明する', () => {
  const result = describeConditions({
    defaults: DEFAULT_CONDITION_DEFAULTS,
    current: DEFAULT_CONDITION_DEFAULTS,
    perLayout: {},
  });

  assert.deepEqual(
    result.conditions.map((condition) => condition.key),
    Object.keys(DEFAULT_CONDITION_DEFAULTS),
  );
});

test('条件説明は変更値と配列ごとの上書きを表現する', () => {
  const result = describeConditions({
    defaults: DEFAULT_CONDITION_DEFAULTS,
    current: { ...DEFAULT_CONDITION_DEFAULTS, windowSize: 7 },
    perLayout: { oonishi: { sfbHomeCost: false } },
    layoutNames: { oonishi: '大西配列' },
  });

  assert.equal(result.conditions.find((condition) => condition.key === 'windowSize')?.differsFromDefault, true);
  assert.equal(result.conditions.find((condition) => condition.key === 'sfbHomeCost')?.differsFromDefault, false);
  assert.deepEqual(result.overrides, [{
    layoutId: 'oonishi',
    layoutName: '大西配列',
    conditions: [{
      key: 'sfbHomeCost',
      label: '同指連続のホームコスト',
      value: '加算しない',
      defaultValue: '加算する',
      differsFromDefault: true,
      effect: '同じ指でホームキーを打つ移動を距離へ加算するかどうかです。オフならホームキー上の移動は0として扱います。',
    }],
  }]);
});

test('ArpeggioPolicyの条件説明はsemantic comparatorで差分判定する', () => {
  const same = describeConditions({
    defaults: DEFAULT_CONDITION_DEFAULTS,
    current: {
      ...DEFAULT_CONDITION_DEFAULTS,
      arpeggioPolicy: { ...DEFAULT_CONDITION_DEFAULTS.arpeggioPolicy },
    },
    perLayout: {},
  });
  assert.equal(
    same.conditions.find((condition) => condition.key === 'arpeggioPolicy')?.differsFromDefault,
    false,
  );

  const changed = describeConditions({
    defaults: DEFAULT_CONDITION_DEFAULTS,
    current: {
      ...DEFAULT_CONDITION_DEFAULTS,
      arpeggioPolicy: {
        ...DEFAULT_CONDITION_DEFAULTS.arpeggioPolicy,
        bridgeSameFinger: true,
      },
    },
    perLayout: {},
  });
  assert.equal(
    changed.conditions.find((condition) => condition.key === 'arpeggioPolicy')?.differsFromDefault,
    true,
  );
});

test('条件説明は打鍵再生の条件も既定値との差分を表現する', () => {
  const fallback = defaults();
  const result = describePlaybackConditions({
    defaults: fallback.ui.playback,
    current: {
      ...fallback.ui.playback,
      stepsPerSecond: 3,
      sameFingerDelay: true,
    },
  });

  assert.deepEqual(
    result.map((condition) => condition.key),
    ['stepsPerSecond', 'speedMultiplier', 'sameFingerDelay', 'allFingerMovementDelay', 'useCalibration'],
  );
  assert.equal(result.find((condition) => condition.key === 'stepsPerSecond')?.value, '3 ステップ/秒');
  assert.equal(result.find((condition) => condition.key === 'stepsPerSecond')?.differsFromDefault, true);
  assert.equal(result.find((condition) => condition.key === 'sameFingerDelay')?.value, '有効');
  assert.equal(result.find((condition) => condition.key === 'allFingerMovementDelay')?.value, '無効');
  assert.equal(result.find((condition) => condition.key === 'useCalibration')?.differsFromDefault, false);
});

test('無効な値は項目ごとに既定値へ戻す', () => {
  const fallback = defaults();
  const state = sanitizeUiState({
    ...fallback,
    ui: {
      ...fallback.ui,
      input: {
        ...fallback.ui.input,
        mode: 'unknown',
        geometry: 'curved',
        selectedSampleByMode: { en: 'removed', ja: 'legacy' },
      },
      layouts: {
        selectedByMode: { en: [], ja: ['removed'] },
        detailByMode: { en: 'removed', ja: 'oonishi' },
      },
      comparison: {
        ...fallback.ui.comparison,
        chartColumn: 99,
        sort: { column: -1, direction: 'asc' },
        baselineByMode: { en: 'removed', ja: 'oonishi' },
      },
      playback: {
        ...fallback.ui.playback,
        trailTau: 0,
        scale: 10,
        stepsPerSecond: 0,
        speedMultiplier: Number.NaN,
        keyFeedbackStyle: 'spin' as never,
      },
    },
    conditions: {
      defaults: {
        ...fallback.conditions.defaults,
        windowSize: 99,
        playbackRateAverage: 'median' as never,
        playbackRateWindow: 0,
        playbackRateHalfLifeSeconds: 0,
      },
      perLayout: {},
    },
  }, fallback, choices);

  assert.equal(state.ui.input.mode, fallback.ui.input.mode);
  assert.equal(state.ui.input.geometry, fallback.ui.input.geometry);
  assert.equal(state.conditions.defaults.windowSize, fallback.conditions.defaults.windowSize);
  assert.equal(state.conditions.defaults.playbackRateAverage, fallback.conditions.defaults.playbackRateAverage);
  assert.equal(state.conditions.defaults.playbackRateWindow, fallback.conditions.defaults.playbackRateWindow);
  assert.equal(state.conditions.defaults.playbackRateHalfLifeSeconds, fallback.conditions.defaults.playbackRateHalfLifeSeconds);
  assert.equal(state.ui.input.selectedSampleByMode.en, 'default');
  assert.equal(state.ui.input.selectedSampleByMode.ja, 'legacy');
  assert.deepEqual(state.ui.layouts.selectedByMode.en, []);
  assert.deepEqual(state.ui.layouts.selectedByMode.ja, fallback.ui.layouts.selectedByMode.ja);
  assert.deepEqual(state.ui.layouts.detailByMode, { ja: 'oonishi' });
  assert.deepEqual(state.ui.comparison.baselineByMode, { ja: 'oonishi' });
  assert.equal(state.ui.comparison.chartColumn, fallback.ui.comparison.chartColumn);
  assert.equal(state.ui.comparison.sort, null);
  assert.equal(state.ui.playback.trailTau, fallback.ui.playback.trailTau);
  assert.equal(state.ui.playback.scale, fallback.ui.playback.scale);
  assert.equal(state.ui.playback.stepsPerSecond, fallback.ui.playback.stepsPerSecond);
  assert.equal(state.ui.playback.speedMultiplier, fallback.ui.playback.speedMultiplier);
  assert.equal(state.ui.playback.keyFeedbackStyle, fallback.ui.playback.keyFeedbackStyle);
});

test('未知のバージョンと壊れたJSONは既定値へ戻す', () => {
  assert.deepEqual(sanitizeUiState({ version: 999 }, defaults(), choices), defaults());

  const storage = new MemoryStorage();
  storage.data.set(UI_STATE_STORAGE_KEY, '{broken');
  assert.deepEqual(loadUiState(storage, defaults(), choices).state, defaults());
});

test('旧Chain UI fieldだけのmigrationではArpeggio刷新通知を出さない', () => {
  const storage = new MemoryStorage();
  const legacy = structuredClone(defaults()) as unknown as Record<string, any>;
  delete legacy.conditions.defaults.chain;
  legacy.ui.playback.chainIncludeSameFinger = true;
  legacy.ui.playback.chainIncludeLayerKeys = false;
  storage.data.set(UI_STATE_STORAGE_KEY, JSON.stringify(legacy));

  const loaded = loadUiState(storage, defaults(), choices);
  assert.equal(loaded.migratedArpeggioModel, false);
  assert.deepEqual(loaded.state.conditions.defaults.chain, {
    breakOnSameFinger: false,
    breakOnTriggerOnly: true,
    breakOnThumbOnly: true,
    breakOnOppositeHandSimultaneous: false,
  });

  const saved = JSON.parse(storage.data.get(UI_STATE_STORAGE_KEY)!) as Record<string, any>;
  assert.equal('chainIncludeSameFinger' in saved.ui.playback, false);
  assert.equal('chainIncludeLayerKeys' in saved.ui.playback, false);
});

test('旧Arpeggio保存値は初回だけmigration通知対象になりcanonical stateへ再保存する', () => {
  const storage = new MemoryStorage();
  const legacy = structuredClone(defaults()) as unknown as Record<string, any>;
  legacy.ui.theme = 'dark';
  legacy.ui.panels.playback = true;
  legacy.ui.playback.arpeggioEnabled = true;
  legacy.ui.playback.arpeggioDelayMode = 'distributed';
  legacy.conditions.defaults.arpeggio = {
    minHorizontalSpread: 2,
    maxRowReversal: 1,
    maxRowStep: 2,
    includeThumb: true,
    breakOnOppositeHand: true,
  };
  legacy.conditions.perLayout.oonishi = {
    arpeggio: {
      minHorizontalSpread: 3,
      maxRowReversal: 0,
      maxRowStep: 1,
      includeThumb: false,
      breakOnOppositeHand: false,
    },
  };
  storage.data.set(UI_STATE_STORAGE_KEY, JSON.stringify(legacy));

  const first = loadUiState(storage, defaults(), choices);
  assert.equal(first.migratedArpeggioModel, true);
  assert.equal(first.state.ui.theme, 'dark');
  assert.equal(first.state.ui.panels.playback, true);
  assert.equal('arpeggioEnabled' in first.state.ui.playback, false);
  assert.equal('arpeggioDelayMode' in first.state.ui.playback, false);
  assert.deepEqual(first.state.conditions.defaults.arpeggioPolicy, {
    includeThumb: true,
    bridgeSameFinger: false,
    includeSingleRedirectTail: false,
  });
  assert.deepEqual(first.state.conditions.perLayout.oonishi.arpeggioPolicy, {
    includeThumb: false,
    bridgeSameFinger: false,
    includeSingleRedirectTail: false,
  });

  const saved = JSON.parse(storage.data.get(UI_STATE_STORAGE_KEY)!) as Record<string, any>;
  assert.equal('arpeggio' in saved.conditions.defaults, false);
  assert.equal('arpeggioEnabled' in saved.ui.playback, false);
  assert.equal('arpeggioDelayMode' in saved.ui.playback, false);

  const second = loadUiState(storage, defaults(), choices);
  assert.equal(second.migratedArpeggioModel, false);
  assert.deepEqual(second.state, first.state);
});

test('旧キーを初回読み込み時に移行して削除する', () => {
  const storage = new MemoryStorage();
  storage.data.set(LEGACY_THEME_KEY, 'dark');
  storage.data.set(LEGACY_TEXT_COLLAPSED_KEY, 'true');
  storage.data.set(LEGACY_SELECTION_KEY, JSON.stringify({ en: [], ja: ['oonishi'] }));

  const loaded = loadUiState(storage, defaults(), choices);

  assert.equal(loaded.migratedLegacy, true);
  assert.equal(loaded.state.ui.theme, 'dark');
  assert.equal(loaded.state.ui.panels.text, false);
  assert.deepEqual(loaded.state.ui.layouts.selectedByMode, { en: [], ja: ['oonishi'] });
  assert.ok(storage.data.has(UI_STATE_STORAGE_KEY));
  assert.equal(storage.data.has(LEGACY_THEME_KEY), false);
  assert.equal(storage.data.has(LEGACY_TEXT_COLLAPSED_KEY), false);
  assert.equal(storage.data.has(LEGACY_SELECTION_KEY), false);
});

test('新形式を保存できなければ旧キーを削除しない', () => {
  const storage = new MemoryStorage();
  storage.data.set(LEGACY_THEME_KEY, 'dark');
  storage.throwOnSet = true;

  const loaded = loadUiState(storage, defaults(), choices);

  assert.equal(loaded.state.ui.theme, 'dark');
  assert.equal(loaded.migratedLegacy, false);
  assert.equal(storage.data.get(LEGACY_THEME_KEY), 'dark');
});

test('旧キーの削除に失敗しても移行済みの状態を使う', () => {
  const storage = new MemoryStorage();
  storage.data.set(LEGACY_THEME_KEY, 'dark');
  storage.throwOnRemove = true;

  const loaded = loadUiState(storage, defaults(), choices);

  assert.equal(loaded.state.ui.theme, 'dark');
  assert.equal(loaded.migratedLegacy, true);
  assert.ok(storage.data.has(UI_STATE_STORAGE_KEY));
});

test('localStorageの読み書きが失敗しても既定状態で動く', () => {
  const storage = new MemoryStorage();
  storage.throwOnGet = true;
  assert.deepEqual(loadUiState(storage, defaults(), choices).state, defaults());

  storage.throwOnGet = false;
  storage.throwOnSet = true;
  assert.equal(saveUiState(storage, defaults()), false);
});

test('上限を超える本文だけを破棄し、他の設定は復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.ui.theme = 'dark';
  value.ui.input.customText = 'あ'.repeat(MAX_SAVED_TEXT_LENGTH + 1);

  const state = sanitizeUiState(value, fallback, choices);
  assert.equal(state.ui.input.customText, undefined);
  assert.equal(state.ui.theme, 'dark');

  const storage = new MemoryStorage();
  assert.equal(saveUiState(storage, value), true);
  const saved = JSON.parse(storage.data.get(UI_STATE_STORAGE_KEY)!) as { ui: { customText?: string; input: { customText?: string } } };
  assert.equal(saved.ui.input.customText, undefined);
});
