import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultUiState,
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
  };
  value.conditions.perLayout = {
    oonishi: { geometry: 'ortholinear', windowSize: 7, sfbHomeCost: false },
    removed: { windowSize: 9 },
    invalid: { windowSize: 99 },
  };
  (value.conditions.perLayout.invalid as Record<string, unknown>).preferOppositeThumb = 'yes';

  const state = sanitizeUiState(value, fallback, choices);

  assert.deepEqual(Object.keys(state).sort(), ['conditions', 'ui', 'version']);
  assert.deepEqual(state.conditions.defaults, value.conditions.defaults);
  assert.deepEqual(state.conditions.perLayout, {
    oonishi: { geometry: 'ortholinear', windowSize: 7, sfbHomeCost: false },
  });
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
