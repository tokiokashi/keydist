import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComboSet } from '#input/combo-set/combo-set.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { generateEngineTrace } from './pipeline.ts';
import { comboSetSpellingDiffers, overlaySetupComboSet } from './setup-combo-set.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from './resolved-input.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const SET: ComboSet = {
  id: 'set-a',
  name: '私の組',
  romajiRuleId: 'kunrei',
  combos: [
    { keys: ['s', 't'], output: 'site' },
    { keys: ['d', 's'], output: 'desu' },
  ],
};

const TEXT = 'しています。です。してください。';

function resolve(setup: Setup, text: string, language: 'ja' | 'en', comboSets?: ReadonlyMap<string, ComboSet>): ResolvedInput {
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    comboSets,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  return result.input;
}

function measure(input: ResolvedInput) {
  const { trace } = generateEngineTrace(input);
  const metrics = computeMetrics(trace, input.geometry);
  return { totalUnits: metrics.totalUnits, actions: metrics.actions, comboHits: trace.comboHits };
}

const BASE_SETUP: Setup = { id: 'setup-1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
const WITH_SET: Setup = { ...BASE_SETUP, comboSetId: SET.id };
const SETS = new Map([[SET.id, SET]]);

test('組を選んだSetupは、コンボの有無で数値が変わる', () => {
  const without = measure(resolve(BASE_SETUP, TEXT, 'ja', SETS));
  const withSet = measure(resolve(WITH_SET, TEXT, 'ja', SETS));
  assert.ok(withSet.comboHits.length > 0);
  assert.equal(without.comboHits.length, 0);
  assert.ok(withSet.actions < without.actions, `${withSet.actions} < ${without.actions}`);
  assert.notEqual(withSet.totalUnits, without.totalUnits);
});

test('組を選ばないSetup・組が手持ちに無いSetupは、組を持たない時と同じ入力になる', () => {
  const base = resolve(BASE_SETUP, TEXT, 'ja', undefined);
  const withSets = resolve(BASE_SETUP, TEXT, 'ja', SETS);
  const missing = resolve({ ...BASE_SETUP, comboSetId: 'ない' }, TEXT, 'ja', SETS);
  assert.deepEqual(measure(withSets), measure(base));
  assert.deepEqual(measure(missing), measure(base));
});

test('配列を対象にした計算には、組を重ねない', () => {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'qwerty' },
    setups: new Map([[WITH_SET.id, WITH_SET]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    comboSets: SETS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: TEXT,
    language: 'ja',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(measure(result.input), measure(resolve(BASE_SETUP, TEXT, 'ja', undefined)));
});

test('英文は、ローマ字を経ないので組のコンボが成立せず、組を持たない時と同じ数値になる', () => {
  const text = 'the website is on the site';
  assert.deepEqual(measure(resolve(WITH_SET, text, 'en', SETS)), measure(resolve(BASE_SETUP, text, 'en', undefined)));
});

test('かな配列のSetupには、組を重ねない', () => {
  const kana = LAYOUT_BY_ID.get('nicola')!;
  const overlay = overlaySetupComboSet({ comboSetId: SET.id }, kana, 'kana', SETS);
  assert.equal(overlay.layout, kana);
  assert.equal(overlay.status.kind, 'kana-layout');
});

test('組の基準の綴りとSetupの実効の綴りが違う時だけ、作り直しが要る', () => {
  assert.equal(comboSetSpellingDiffers(SET, 'kunrei'), false);
  assert.equal(comboSetSpellingDiffers(SET, 'oonishi'), true);
  assert.equal(comboSetSpellingDiffers(SET, null), false);
});
