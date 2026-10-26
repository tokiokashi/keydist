import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type Finger, type Key } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import { analyzeHandRhythm, type HandRhythmStroke } from '#interpretation/structure/hand-rhythm.ts';
import { generateTrace, type Press, type StrokeParticipation } from '#trace/generate.ts';
import { handRhythmDefinition, handRhythmExtractionOf, lengthCountsOf, type HandRhythmExtracted } from './extract.ts';
import { DEFAULT_HAND_RHYTHM_OPTIONS, handRhythmOptions } from './options.ts';
import { alternationRowsOf, pairRowsOf } from './value-rows.ts';

/**
 * 左右の手の交互の抽出を、実際のengine経路（解決 → Trace → 抽出）で検証する。
 * 数の定義は `interpretation/structure/hand-rhythm.test.ts` が固定しているので、ここでは抽出が集計をそのまま運ぶことと、
 * 長さごとの数の合計が連続の数に一致することを確かめる。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(layoutId: string, text: string, language: 'en' | 'ja' = 'en'): ResolvedInput {
  const shapeId = LAYOUT_BY_ID.get(layoutId)?.requiresJisShape === true ? 'jis-row-staggered' : 'row-staggered';
  const setup: Setup = { id: 'setup-hand-rhythm', number: 1, layoutId, shapeId };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

function extractAndTrace(input: ResolvedInput) {
  const cache = createEngineCache();
  const extracted = cache.getExtraction(input, handRhythmDefinition, DEFAULT_HAND_RHYTHM_OPTIONS).extracted;
  const trace = generateTrace(input.text, input.layout, input.geometry, input.tracePolicy);
  return { extracted, trace };
}

const sum = (items: readonly { readonly count: number }[]) => items.reduce((total, item) => total + item.count, 0);

test('集計はanalyzeHandRhythmの値をそのまま運ぶ', () => {
  const { extracted, trace } = extractAndTrace(resolve('qwerty', 'asdfjkl; the quick brown fox'));
  const expected = analyzeHandRhythm(trace.strokes);
  assert.deepEqual(extracted.aggregate, expected.aggregate);
});

test('長さごとの数の合計は、連続の数と一致する', () => {
  const { extracted, trace } = extractAndTrace(resolve('qwerty', 'asdfjkl; the quick brown fox jumps over the lazy dog'));
  const result = analyzeHandRhythm(trace.strokes);
  assert.equal(sum(extracted.alternationLengths), extracted.aggregate.alternation.runs);
  assert.equal(sum(extracted.alternationLengths), result.alternatingRuns.length);
  assert.equal(sum(extracted.sameHandLengths), result.sameHandRuns.length);
  // 長さに重みを付けた和は、連続が覆う打鍵数と一致する
  const weighted = extracted.alternationLengths.reduce((total, item) => total + item.length * item.count, 0);
  assert.equal(weighted, extracted.aggregate.alternation.coverage.strokes);
  // 同じ手の連続は、片手の打鍵を1つずつ必ずどれかの連続に入れる
  const oneHandStrokes = result.strokes.filter((fact) => fact.kind === 'one-hand').length;
  assert.equal(
    extracted.sameHandLengths.reduce((total, item) => total + item.length * item.count, 0),
    oneHandStrokes,
  );
});

test('長さの昇順に並び、長さは重複しない', () => {
  const { extracted } = extractAndTrace(resolve('qwerty', 'asdfjkl; the quick brown fox jumps over the lazy dog'));
  for (const counts of [extracted.alternationLengths, extracted.sameHandLengths]) {
    const lengths = counts.map((item) => item.length);
    assert.deepEqual(
      lengths,
      [...new Set(lengths)].sort((a, b) => a - b),
    );
  }
});

test('QWERTY: "fjfjfj" は長さ6の交互打鍵の連続が1つ、同じ手の連続は長さ1が6つ', () => {
  const { extracted } = extractAndTrace(resolve('qwerty', 'fjfjfj'));
  assert.deepEqual(extracted.alternationLengths, [{ length: 6, count: 1 }]);
  assert.deepEqual(extracted.sameHandLengths, [{ length: 1, count: 6 }]);
  assert.equal(extracted.aggregate.bothHandStrokes.simultaneous + extracted.aggregate.bothHandStrokes.mixed, 0);
});

test('QWERTY: "asdfjkl;" は交互打鍵の連続が無く、同じ手の連続は長さ4が2つ', () => {
  const { extracted } = extractAndTrace(resolve('qwerty', 'asdfjkl;'));
  assert.deepEqual(extracted.alternationLengths, []);
  assert.deepEqual(extracted.sameHandLengths, [{ length: 4, count: 2 }]);
  assert.equal(extracted.pairCount, 7);
});

test('両手の打鍵を含む組の多い配列: 組の合計は打鍵数から1を引いた値と一致する', () => {
  const { extracted } = extractAndTrace(resolve('shingeta', 'あさ、まどをあけると、やわらかなひかりがへやにひろがります。', 'ja'));
  assert.ok(extracted.aggregate.bothHandPairs > 0);
  assert.equal(extracted.pairCount, extracted.aggregate.strokeCount - 1);
});

test('lengthCountsOfは区間の長さごとに数える', () => {
  assert.deepEqual(
    lengthCountsOf([
      { startStrokeIndex: 0, endStrokeIndex: 3 },
      { startStrokeIndex: 5, endStrokeIndex: 7 },
      { startStrokeIndex: 9, endStrokeIndex: 12 },
    ]),
    [
      { length: 2, count: 1 },
      { length: 3, count: 2 },
    ],
  );
  assert.deepEqual(lengthCountsOf([]), []);
});

const key = (id: string, finger: Finger): Key => ({ id, finger, x: 0, y: 0, row: 2, col: 0 });

/** 指定した指を押す打鍵。`output` が偽の指は、切り替えのキーの役だけを持つ。 */
const stroke = (...entries: readonly { readonly finger: Finger; readonly output?: boolean }[]): HandRhythmStroke => ({
  presses: entries.map(
    (entry): Press => ({
      finger: entry.finger,
      keys: [key(`k-${entry.finger}`, entry.finger)],
      target: { x: 0, y: 0 },
      origin: { at: { x: 0, y: 0 }, from: 'home' },
      gap: 1,
      distance: 0,
      sfb: false,
    }),
  ),
  participations: entries.map(
    (entry): StrokeParticipation => ({
      hand: entry.finger.startsWith('L') ? 'left' : 'right',
      finger: entry.finger,
      keys: [key(`k-${entry.finger}`, entry.finger)],
      roles: entry.output === false ? ['trigger'] : ['output'],
    }),
  ),
});

function syntheticExtraction(): HandRhythmExtracted {
  return handRhythmExtractionOf(
    analyzeHandRhythm([
      stroke({ finger: 'LI' }),
      stroke({ finger: 'RI' }),
      stroke({ finger: 'LM' }),
      stroke({ finger: 'LI' }, { finger: 'RI' }), // 両手で文字を出す
      stroke({ finger: 'RM' }),
      stroke({ finger: 'LT', output: false }, { finger: 'RI' }), // 片手は切り替えのキーだけ
      stroke({ finger: 'RM' }),
    ]),
  );
}

test('合成データ: 両手で文字を出す打鍵と、片手は切り替えのキーだけの打鍵が別の行に出る', () => {
  const rows = new Map(pairRowsOf(syntheticExtraction()).map((row) => [row.id, row.text]));
  assert.equal(rows.get('both-hand-strokes'), '2打鍵');
  assert.equal(rows.get('both-output'), '1打鍵');
  assert.equal(rows.get('both-mixed'), '1打鍵');
  assert.equal(rows.get('strokes'), '7打鍵');
  assert.equal(rows.get('switches'), '2組');
  assert.equal(rows.get('continuations'), '0組');
  assert.equal(rows.get('continuation-rate'), '0.0%');
  assert.equal(rows.get('both-hand-pairs'), '4組（組全体の66.7%）');
});

test('継続率の行のすぐ後ろに、両手の打鍵を含む組の行が並ぶ', () => {
  const ids = pairRowsOf(syntheticExtraction()).map((row) => row.id);
  assert.equal(ids.indexOf('both-hand-pairs'), ids.indexOf('continuation-rate') + 1);
});

test('分母が0の割合は「—」で出す', () => {
  const empty = handRhythmExtractionOf(analyzeHandRhythm([]));
  const rows = new Map([...pairRowsOf(empty), ...alternationRowsOf(empty)].map((row) => [row.id, row.text]));
  assert.equal(rows.get('continuation-rate'), '—');
  assert.equal(rows.get('both-hand-pairs'), '0組（組全体の—）');
  assert.equal(rows.get('alternation-mean'), '—');
  assert.equal(rows.get('alternation-max'), '—');
  assert.equal(rows.get('alternation-coverage'), '—');
});

test('合成データ: 交互打鍵の連続の行', () => {
  const rows = new Map(alternationRowsOf(syntheticExtraction()).map((row) => [row.id, row.text]));
  assert.equal(rows.get('alternation-runs'), '1件');
  assert.equal(rows.get('alternation-mean'), '3.00打鍵');
  assert.equal(rows.get('alternation-max'), '3打鍵');
  assert.equal(rows.get('alternation-coverage'), '42.9%（3 / 7打鍵）');
});

test('解析設定の項目は無い', () => {
  assert.deepEqual(Object.keys(handRhythmOptions.items), []);
  assert.deepEqual(checkOptionsDiscipline(handRhythmOptions, handRhythmDefinition.optionsDiscipline), {
    keyViolations: [],
    viewExtractionViolations: [],
  });
});
