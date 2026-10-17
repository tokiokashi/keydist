import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playbackOptions } from './options.ts';
import { PLAYBACK_FIGURE_GROUPS, PLAYBACK_WINDOW_GROUPS, type PlaybackSettingsGroup } from './settings-sections.ts';

type Place = 'window' | 'figure';

// 数値が変わる項目（extract）は解析設定の小窓、見た目だけの項目（view）は配列図の表示の小窓に、ちょうど1回ずつ置く。
const PLACE_OF_AFFECT: Record<'extract' | 'view', Place> = { extract: 'window', view: 'figure' };

function placements(tables: Readonly<Record<Place, readonly PlaybackSettingsGroup[]>>): Map<string, Place[]> {
  const placed = new Map<string, Place[]>();
  for (const place of ['window', 'figure'] as const) {
    for (const group of tables[place]) {
      for (const key of [...group.keys, ...(group.detail?.keys ?? [])]) placed.set(key, [...(placed.get(key) ?? []), place]);
    }
  }
  return placed;
}

/** 表の置き方が`affects`と合わない項目と理由を返す。合っていれば空。 */
function mismatches(tables: Readonly<Record<Place, readonly PlaybackSettingsGroup[]>>): string[] {
  const placed = placements(tables);
  const items: Readonly<Record<string, { readonly affects: 'extract' | 'view' }>> = playbackOptions.items;
  const problems: string[] = [];
  for (const [key, def] of Object.entries(items)) {
    const actual = placed.get(key) ?? [];
    if (actual.length !== 1 || actual[0] !== PLACE_OF_AFFECT[def.affects]) {
      problems.push(`${key}（${def.affects}）の置き場: ${actual.join('、') || 'なし'}`);
    }
  }
  for (const key of placed.keys()) if (!(key in items)) problems.push(`${key}は項目として存在しない`);
  return problems;
}

const actual = { window: PLAYBACK_WINDOW_GROUPS, figure: PLAYBACK_FIGURE_GROUPS };

test('打鍵再生の項目は、affectsに合う置き場にちょうど1回ずつ置かれる', () => {
  assert.deepEqual(mismatches(actual), []);
});

test('項目をどこにも置かない時・違う所に置いた時・2回置いた時は検査が落ちる', () => {
  const dropped = {
    window: PLAYBACK_WINDOW_GROUPS,
    figure: PLAYBACK_FIGURE_GROUPS.map((group) => ({ ...group, keys: group.keys.filter((key) => key !== 'scale') })),
  };
  assert.equal(mismatches(dropped).length, 1);
  const wrongPlace = {
    window: [...PLAYBACK_WINDOW_GROUPS, { id: 'layoutFigure' as const, title: '', keys: ['scale' as const] }],
    figure: PLAYBACK_FIGURE_GROUPS.map((group) => ({ ...group, keys: group.keys.filter((key) => key !== 'scale') })),
  };
  assert.equal(mismatches(wrongPlace).length, 1);
  const twice = {
    window: [...PLAYBACK_WINDOW_GROUPS, { id: 'layoutFigure' as const, title: '', keys: ['scale' as const] }],
    figure: PLAYBACK_FIGURE_GROUPS,
  };
  assert.equal(mismatches(twice).length, 1);
});

test('小窓のグループは再生の時間・個人速度・読点・句点の待機・速度グラフの平均の順に並ぶ', () => {
  assert.deepEqual(
    PLAYBACK_WINDOW_GROUPS.map((group) => group.title),
    ['再生の時間', '個人速度', '読点・句点の待機', '速度グラフの平均'],
  );
});

test('配列図の表示の小窓のグループは入力の行と状態の行・構造の動的表示・キーと指・配列図の順に並ぶ', () => {
  assert.deepEqual(
    PLAYBACK_FIGURE_GROUPS.map((group) => group.title),
    ['入力の行と状態の行', '構造の動的表示', 'キーと指', '配列図'],
  );
});

test('個人速度のグループは、項目ごとの5つの設定を畳んだ節に置く', () => {
  const group = PLAYBACK_WINDOW_GROUPS.find((candidate) => candidate.id === 'personalSpeed');
  assert.deepEqual(group?.keys, ['applyPersonalSpeed']);
  assert.deepEqual(group?.detail?.keys, ['sameHandSpeed', 'useCrossHandDirection', 'useFingerValues', 'useSimultaneousOverhead', 'useKeystrokeOverhead']);
});
