import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { PersonalSpeedSelection } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import { MEASUREMENT_SENTENCES } from '#editors/personal-speed/calibration-text.ts';
import { calibrationKeyLabel } from '#interpretation/timing/calibration-session.ts';
import {
  SENTENCE_ROUNDS,
  pressSentenceKey,
  pressSentenceSessionKey,
  sentenceRunFinished,
  sentenceSessionFinished,
  sentenceSteps,
  sentenceUnmeasurable,
  startSentenceRun,
  startSentenceSession,
  stepsSentencePlan,
  type SentenceStep,
} from '#interpretation/timing/sentence-session.ts';
import { strokeStructureKinds } from '#interpretation/timing/stroke-structure.ts';
import { paneCatalog } from '../standalone/catalog.ts';
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

test('示す文は6本以上で、どれもかな15〜25文字の短い文', () => {
  assert.ok(MEASUREMENT_SENTENCES.length >= 6);
  for (const sentence of MEASUREMENT_SENTENCES) {
    const length = [...sentence].length;
    assert.ok(length >= 15 && length <= 25, `${sentence}: ${length}`);
  }
});

/** 各文の1回分の打鍵の列で、最初のストロークと同指連続を含むストロークを除いて数えた、種類ごとの打鍵の数の合計。 */
function countedPerKind(layoutId: string) {
  const counts = { arpeggio: 0, chain: 0, other: 0 };
  for (const sentence of MEASUREMENT_SENTENCES) {
    const result = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId }, sentence);
    assert.ok(result.ok, `${layoutId}: ${sentence}`);
    assert.equal(sentenceUnmeasurable(sentenceSteps(result.analysis)), undefined, layoutId);
    const kinds = strokeStructureKinds(result.analysis);
    result.analysis.strokes.forEach((stroke, index) => {
      if (index === 0 || stroke.presses.some((press) => press.sfb)) return;
      counts[kinds[index]] += 1;
    });
  }
  return counts;
}

test('確かめる配列のそれぞれで、示す文の全文の合計がArpeggio・Chain・その他のどれも10打以上になる', () => {
  // QWERTYは訓令式の綴り。かなの配列は、組み込みのうち測定できるもの。
  for (const layoutId of ['qwerty', 'shingeta', 'tsuki-2-263']) {
    const counts = countedPerKind(layoutId);
    for (const kind of ['arpeggio', 'chain', 'other'] as const) {
      assert.ok(counts[kind] >= 10, `${layoutId} ${kind}: ${counts[kind]}`);
    }
  }
});

test('Spaceや修飾キーを押しながら打つ配列は作れるが、測れない', () => {
  const result = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId: 'nicola' }, MEASUREMENT_SENTENCES[0]);
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

/** キーのidの物理位置（`event.code`）。 */
function codeOfKeyId(id: string): string {
  if (/^[a-z]$/i.test(id)) return `Key${id.toUpperCase()}`;
  if (/^[0-9]$/.test(id)) return `Digit${id}`;
  const named: Record<string, string> = {
    ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash',
    '[': 'BracketLeft', ']': 'BracketRight', '-': 'Minus', '=': 'Equal',
  };
  return named[id] ?? id;
}

/**
 * 1ステップを打つ押下の列。画面と同じ刻印（`calibrationKeyLabel`）で照合する。
 * `output`が真なら、コンボは出力の文字を、それ以外は刻印の文字を送り、`code`は送る文字の位置にする。
 * 偽なら、`key`に刻印の文字、`code`にキーのidの物理位置を送る。
 */
function pressesOf(step: SentenceStep, output: boolean, keyLabel: (id: string) => string) {
  return output && step.outputChars !== undefined
    ? step.outputChars.map((char) => ({ key: char, code: codeOfKeyId(char) }))
    : step.keys.map((id) => (output
      ? { key: keyLabel(id), code: codeOfKeyId(keyLabel(id).toLowerCase()) }
      : { key: keyLabel(id), code: codeOfKeyId(id) }));
}

function tkContext(texts: readonly string[]) {
  const layout = paneCatalog(BASE).setupCatalog.layouts.get('oonishi-custom');
  assert.ok(layout !== undefined);
  const keyLabel = (id: string) => calibrationKeyLabel(layout.legends, id);
  const stepsOf = texts.map((text) => {
    const result = builderWith(EMPTY_SETTINGS_OVERRIDES)({ ...SELECTION, layoutId: 'oonishi-custom' }, text);
    assert.ok(result.ok);
    const steps = sentenceSteps(result.analysis);
    assert.equal(sentenceUnmeasurable(steps), undefined);
    return steps;
  });
  return { keyLabel, stepsOf };
}

/** TK音直入力法で`text`を1回打つ。 */
function playTkText(text: string, output: boolean) {
  const { keyLabel, stepsOf } = tkContext([text]);
  const steps = stepsOf[0];
  let run = startSentenceRun(stepsSentencePlan(steps, () => undefined));
  const outcomes: string[] = [];
  let atMs = 0;
  for (const step of steps) {
    for (const event of pressesOf(step, output, keyLabel)) {
      atMs += 100;
      const pressed = pressSentenceKey(run, event, atMs, keyLabel);
      run = pressed.run;
      outcomes.push(pressed.outcome.kind);
    }
  }
  return { steps, run, outcomes };
}

/** TK音直入力法で、示す文の全部を、文ごとに続けて回数分打つ（測定の進行と同じ）。 */
function playTkSession(texts: readonly string[], output: boolean) {
  const { keyLabel, stepsOf } = tkContext(texts);
  let session = startSentenceSession(stepsOf.map((steps) => stepsSentencePlan(steps, () => undefined)));
  const outcomes: string[] = [];
  let atMs = 0;
  for (const steps of stepsOf) {
    for (let round = 0; round < SENTENCE_ROUNDS; round++) {
      for (const step of steps) {
        for (const event of pressesOf(step, output, keyLabel)) {
          atMs += 100;
          const pressed = pressSentenceSessionKey(session, event, atMs, keyLabel);
          session = pressed.session;
          outcomes.push(pressed.outcome.kind);
        }
      }
    }
  }
  return { session, outcomes };
}

test('TK音直入力法の示す文は、押すキーでも出力の文字でも、違うキーを出さずに全文を回数分、最後まで進む', () => {
  for (const output of [false, true]) {
    const { session, outcomes } = playTkSession(MEASUREMENT_SENTENCES, output);
    assert.ok(!outcomes.includes('wrong-key'), `output=${output}`);
    assert.ok(sentenceSessionFinished(session), `output=${output}`);
    assert.equal(session.records.length, MEASUREMENT_SENTENCES.length * SENTENCE_ROUNDS);
    assert.ok(session.records.every((record) => record.taps.every((tap) => tap.clean)), `output=${output}`);
  }
});

test('TK音直入力法の示す文に、出力の文字で打つコンボがあり、aeの並びは無い', () => {
  assert.ok(MEASUREMENT_SENTENCES.every((sentence) => !sentence.includes('あえ')));
  const { stepsOf } = tkContext(MEASUREMENT_SENTENCES);
  assert.ok(stepsOf.flat().some((step) => step.outputChars !== undefined));
});

test('TK音直入力法で、先に出力の文字で打ったコンボの後は、aeの後に押すキーの残りと同じ文字が続いても違うキーを出さない', () => {
  // 「よう」は出力の文字でしか打てない読み方に決まるコンボを含み、その後の「あえ」に続く文字が押すキーの残りと一致する。
  for (const text of ['ようあえいおう', 'ようあえさ', 'ようかえす', 'ようまえさき', 'ようあえい']) {
    for (const output of [false, true]) {
      const { run, outcomes } = playTkText(text, output);
      assert.ok(!outcomes.includes('wrong-key'), `${text} output=${output}`);
      assert.ok(sentenceRunFinished(run), `${text} output=${output}`);
    }
  }
});
