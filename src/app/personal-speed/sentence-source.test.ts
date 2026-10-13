import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { PersonalSpeedSelection } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import { MEASUREMENT_SENTENCE } from '#editors/personal-speed/calibration-text.ts';
import { pressSentenceKey, sentenceRunFinished, sentenceSteps, sentenceUnmeasurable, startSentenceRun, stepsSentencePlan } from '#interpretation/timing/sentence-session.ts';
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

test('コンボで打つストロークだけが出力の文字を持ち、同じ入力単位の別のストロークは持たない', () => {
  const build = (layoutId: string, text: string) => {
    const result = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId }, text);
    assert.ok(result.ok);
    return sentenceSteps(result.analysis);
  };
  // 「きょう」は、kと、コンボyouの2ストロークで、同じ入力単位を打つkは出力の文字を持たない。
  const combo = build('oonishi-custom', 'きょう');
  assert.deepEqual(combo.map((step) => step.outputChars), [undefined, ['y', 'o', 'u']]);
  assert.equal(combo[1].keys.length, 3);
  assert.equal(combo[0].inputIndex, combo[1].inputIndex);
  // コンボを含まない配列と、かなの同時押しの配列は、どのストロークも持たない。
  assert.ok(build('qwerty', 'きょう').every((step) => step.outputChars === undefined));
  assert.ok(build('nicola', 'きょう').every((step) => step.outputChars === undefined));
});

test('TK音直入力法の示す文のコンボのストロークは、出力の文字の押下だけでも最後まで進む', () => {
  const result = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId: 'oonishi-custom' }, MEASUREMENT_SENTENCE);
  assert.ok(result.ok);
  const steps = sentenceSteps(result.analysis);
  assert.equal(sentenceUnmeasurable(steps), undefined);
  assert.ok(steps.some((step) => step.outputChars !== undefined));
  for (const useOutput of [false, true]) {
    let run = startSentenceRun(stepsSentencePlan(steps, () => undefined));
    let atMs = 0;
    for (const step of steps) {
      for (const key of useOutput && step.outputChars !== undefined ? step.outputChars : step.keys) {
        atMs += 100;
        run = pressSentenceKey(run, { key, code: 'Digit9' }, atMs, (id) => id).run;
      }
    }
    assert.ok(sentenceRunFinished(run));
    assert.ok(run.taps.every((tap) => tap.clean));
  }
});
