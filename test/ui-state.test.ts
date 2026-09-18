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

test('保存形式はuiとconditionsに分かれ、既存配列の条件だけ復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.conditions.defaults = {
    geometry: 'column-staggered',
    windowSize: 5,
    sfbHomeCost: false,
    preferOppositeThumb: true,
    arpeggio: fallback.conditions.defaults.arpeggio,
  };
  value.conditions.perLayout = {
    oonishi: { geometry: 'ortholinear', windowSize: 7, sfbHomeCost: false, romajiRule: 'azik' },
    qwerty: {},
    removed: { windowSize: 9 },
    invalid: { windowSize: 99 },
  };
  (value.conditions.perLayout.invalid as Record<string, unknown>).preferOppositeThumb = 'yes';

  const state = sanitizeUiState(value, fallback, choices);

  assert.deepEqual(Object.keys(state).sort(), ['conditions', 'ui', 'version']);
  assert.deepEqual(state.conditions.defaults, value.conditions.defaults);
  assert.deepEqual(state.conditions.perLayout, {
    oonishi: { geometry: 'ortholinear', windowSize: 7, sfbHomeCost: false, romajiRule: 'azik' },
    qwerty: {},
  });
});

test('アルペジオ条件は数値範囲とnullを保ったまま保存・復元する', () => {
  const fallback = defaults();
  const value = structuredClone(fallback);
  value.conditions.defaults.arpeggio = {
    minHorizontalSpread: 1.5,
    maxRowReversal: null,
    maxRowStep: 1,
    includeThumb: true,
    breakOnOppositeHand: true,
  };
  const state = sanitizeUiState(value, fallback, choices);
  assert.deepEqual(state.conditions.defaults.arpeggio, value.conditions.defaults.arpeggio);

  const invalid = structuredClone(value);
  invalid.conditions.defaults.arpeggio.minHorizontalSpread = 99;
  invalid.conditions.defaults.arpeggio.maxRowStep = -1;
  const sanitized = sanitizeUiState(invalid, fallback, choices);
  assert.equal(sanitized.conditions.defaults.arpeggio.minHorizontalSpread, fallback.conditions.defaults.arpeggio.minHorizontalSpread);
  assert.equal(sanitized.conditions.defaults.arpeggio.maxRowStep, fallback.conditions.defaults.arpeggio.maxRowStep);
  assert.equal(sanitized.conditions.defaults.arpeggio.maxRowReversal, null);
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
    oonishi: { playback: { stepsPerSecond: 4.5, showChain: true, showSameFingerMotion: true } },
  });
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
      playback.showChain = savedShowChain;
      if (legacyDisplay === undefined) delete playback.arpeggioDisplay;
      else playback.arpeggioDisplay = legacyDisplay;

      const state = sanitizeUiState(value, fallback, choices);
      assert.deepEqual(
        {
          showChain: state.ui.playback.showChain,
          showArpeggio: state.ui.playback.showArpeggio,
        },
        {
          showChain: legacyDisplay === 'arpeggio' ? false : savedShowChain,
          showArpeggio: savedShowChain
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
    ['stepsPerSecond', 'speedMultiplier', 'sameFingerDelay', 'useCalibration'],
  );
  assert.equal(result.find((condition) => condition.key === 'stepsPerSecond')?.value, '3 ステップ/秒');
  assert.equal(result.find((condition) => condition.key === 'stepsPerSecond')?.differsFromDefault, true);
  assert.equal(result.find((condition) => condition.key === 'sameFingerDelay')?.value, '有効');
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
      },
    },
    conditions: {
      defaults: {
        ...fallback.conditions.defaults,
        windowSize: 99,
      },
      perLayout: {},
    },
  }, fallback, choices);

  assert.equal(state.ui.input.mode, fallback.ui.input.mode);
  assert.equal(state.ui.input.geometry, fallback.ui.input.geometry);
  assert.equal(state.conditions.defaults.windowSize, fallback.conditions.defaults.windowSize);
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
});

test('未知のバージョンと壊れたJSONは既定値へ戻す', () => {
  assert.deepEqual(sanitizeUiState({ version: 999 }, defaults(), choices), defaults());

  const storage = new MemoryStorage();
  storage.data.set(UI_STATE_STORAGE_KEY, '{broken');
  assert.deepEqual(loadUiState(storage, defaults(), choices).state, defaults());
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
