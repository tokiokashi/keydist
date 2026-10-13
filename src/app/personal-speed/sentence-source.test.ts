import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { PersonalSpeedSelection } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import { MEASUREMENT_SENTENCE } from '#editors/personal-speed/calibration-text.ts';
import { sentenceSteps, sentenceUnmeasurable } from '#interpretation/timing/sentence-session.ts';
import { strokeStructureKinds } from '#interpretation/timing/stroke-structure.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

const BASE = { userLayouts: [], userRomajiRules: [], fingerAssignments: [] };

function builderWith(overrides: SettingsCascadeOverrides) {
  return personalSpeedSentenceBuilder({ ...BASE, setupLibrary: { setups: [], overrides } });
}

const SELECTION: PersonalSpeedSelection = { layoutId: 'qwerty', shapeId: 'row-staggered', fingerAssignmentId: 'default' };

function written(overrides: SettingsCascadeOverrides, ...args: Parameters<typeof setSettingsOverride>extends [unknown, ...infer R] ? R : never): SettingsCascadeOverrides {
  const result = setSettingsOverride(overrides, ...args);
  assert.ok(result.ok);
  return result.overrides;
}

test('ローマ字の配列では、訓令式の綴りで打つキーの列になる', () => {
  const result = builderWith(EMPTY_SETTINGS_OVERRIDES)(SELECTION, 'しゃ');
  assert.ok(result.ok);
  const keys = sentenceSteps(result.analysis).map((step) => step.keys.join('+'));
  assert.deepEqual(keys, ['s', 'y', 'a']);
});

test('ローマ字規則は全体の条件に従う', () => {
  const overrides = written(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', 'oonishi');
  const result = builderWith(overrides)(SELECTION, 'しゃ');
  assert.ok(result.ok);
  assert.deepEqual(sentenceSteps(result.analysis).map((step) => step.keys.join('+')), ['s', 'h', 'a']);
});

test('画面で選んだ物理配列を使い、配列のレベルの上書きは読まない', () => {
  const layoutLevel = written(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'qwerty' }, 'defaultShapeId', 'column-staggered');
  const targetOf = (shapeId: string, overrides = EMPTY_SETTINGS_OVERRIDES) => {
    const result = builderWith(overrides)({ ...SELECTION, shapeId }, 'ぜ');
    assert.ok(result.ok);
    return result.analysis.strokes[0].presses[0].target;
  };
  const rowStaggered = targetOf('row-staggered');
  const columnStaggered = targetOf('column-staggered');
  assert.notDeepEqual(rowStaggered, columnStaggered);
  assert.deepEqual(targetOf('row-staggered', layoutLevel), rowStaggered);
  assert.deepEqual(targetOf('column-staggered', layoutLevel), columnStaggered);
});

test('構造は再生と同じ構造解析の結果で、示す文にArpeggio・Chain・その他のどれも出る', () => {
  const result = builderWith(EMPTY_SETTINGS_OVERRIDES)(SELECTION, MEASUREMENT_SENTENCE);
  assert.ok(result.ok);
  const kinds = new Set(strokeStructureKinds(result.analysis));
  assert.deepEqual([...kinds].sort(), ['arpeggio', 'chain', 'other']);
  assert.equal(sentenceUnmeasurable(sentenceSteps(result.analysis)), undefined);
});

test('Spaceや修飾キーを押しながら打つ配列は作れるが、測れない', () => {
  const result = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId: 'nicola' }, MEASUREMENT_SENTENCE);
  assert.ok(result.ok);
  assert.equal(sentenceUnmeasurable(sentenceSteps(result.analysis)), 'uncapturable-key');
});

test('配列が無い、または打てない文字がある時は、打鍵の列を作らず理由を返す', () => {
  const missing = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId: 'no-such-layout' }, 'あ');
  assert.equal(missing.ok, false);
  const unplayable = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId: 'tsuki-2-263' }, '\u{1F642}');
  assert.equal(unplayable.ok, false);
  if (!unplayable.ok) assert.ok(unplayable.message.length > 0);
});
