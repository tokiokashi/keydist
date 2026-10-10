import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import { resolvePaneInput, type PaneCatalog } from './resolve-pane-input.ts';
import { setTargetFigureState, setTargetsBesideSingle } from './set-target-figures.ts';

const CATALOG: PaneCatalog = {
  setupCatalog: {
    layouts: LAYOUT_BY_ID,
    shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
  },
  userLayouts: new Map(),
};

const EN_TEXT: ResolvedText = {
  ref: { kind: 'user', id: 'test-text' },
  name: 'テスト用テキスト',
  text: 'hello world',
  language: 'en',
  languageOverride: undefined,
  isBuiltin: false,
};

const layoutTarget = (layoutId: string): AnalysisTarget => ({ kind: 'layout', layoutId });
const resolve = (target: AnalysisTarget) => resolvePaneInput(target, new Map(), CATALOG, EMPTY_SETTINGS_OVERRIDES, EN_TEXT);

test('Singleの対象と同じ対象は並べる対象から除き、残りは集合の順のまま', () => {
  const set = [layoutTarget('dvorak'), layoutTarget('qwerty'), layoutTarget('colemak-dh')];
  assert.deepEqual(setTargetsBesideSingle(set, layoutTarget('qwerty')), [layoutTarget('dvorak'), layoutTarget('colemak-dh')]);
});

test('集合が空、またはSingleの対象だけなら、並べる対象は無い', () => {
  assert.deepEqual(setTargetsBesideSingle([], layoutTarget('qwerty')), []);
  assert.deepEqual(setTargetsBesideSingle([layoutTarget('qwerty')], layoutTarget('qwerty')), []);
});

test('Singleの対象と違う1件だけの集合は、その1件を並べる', () => {
  assert.deepEqual(setTargetsBesideSingle([layoutTarget('dvorak')], layoutTarget('qwerty')), [layoutTarget('dvorak')]);
});

test('解決できて抽出が済んだ対象は、図の材料を持つ', () => {
  const resolution = resolve(layoutTarget('qwerty'));
  assert.ok(resolution.ok);
  const state = setTargetFigureState(resolution, { status: 'ready', value: { extracted: 'x' } as never });
  assert.equal(state.status, 'ready');
  if (state.status === 'ready') {
    assert.equal(state.layout, resolution.input.layout);
    assert.equal(state.geometry, resolution.input.geometry);
    assert.equal(state.extracted, 'x');
  }
});

test('抽出が済むまで、および直前の結果を持つだけの間は計算中', () => {
  const resolution = resolve(layoutTarget('qwerty'));
  assert.deepEqual(setTargetFigureState(resolution, undefined), { status: 'computing' });
  assert.deepEqual(setTargetFigureState(resolution, { status: 'computing' }), { status: 'computing' });
  assert.deepEqual(setTargetFigureState(resolution, { status: 'stale', value: { extracted: 'x' } as never }), { status: 'computing' });
});

test('このテキストで使えない配列は、使えないことを文で持つ', () => {
  const resolution = resolve(layoutTarget('shingeta'));
  assert.equal(resolution.ok, false);
  const state = setTargetFigureState(resolution, undefined);
  assert.equal(state.status, 'failed');
  if (state.status === 'failed') assert.match(state.message, /使えません/);
});
