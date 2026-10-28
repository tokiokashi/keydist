import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { prepareEvaluationText } from '#input/text/evaluation-text.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Stroke } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';
import { uncoveredKana } from './kana-coverage.ts';

const layout = LAYOUT_BY_ID.get('tsukimisou-extract')!;
const geometry = buildGeometry('row-staggered');

interface SourceFace {
  trigger: string[];
  mode: 'prefix' | 'suffix' | 'simultaneous';
  rows: string[][];
  sourceRows: string[];
}

/** 出典のスナップショット。定義ファイルから起こした面を持つ。 */
const manifest = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/tsukimisou-extract.json', import.meta.url), 'utf8')) as {
  faces: SourceFace[];
  omissions: unknown[];
};

const ANSI_KEYS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];

/** 出典の各セルの、出力と打鍵の列（出力キーの後にトリガーを打つ）。 */
function sourceRoutes(): Array<{ output: string; keys: string }> {
  return manifest.faces.flatMap((face) =>
    face.sourceRows.flatMap((row, r) =>
      row.split('\t').flatMap((output, c) => (output === '' ? [] : [{ output, keys: `${ANSI_KEYS[r]![c]!}${face.trigger.join('')}` }])),
    ),
  );
}

/** そのかなを打つ全ての経路を、打鍵の列（キーを順に並べた文字列）で返す。 */
function typedKeys(kana: string): string[] {
  return (layout.canonicalInputs.get(kana) ?? []).map((alternative) =>
    alternative.baseRealizations
      .flatMap((realization) => realization.actions)
      .map((step) => step.join(''))
      .join(''),
  );
}

const keysOf = (stroke: Stroke): string => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join('+');
const typed = (text: string) => generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
/** 打鍵の列。確定の打鍵には末尾に`*`を付ける。 */
const strokesOf = (text: string): string[] => typed(text).strokes.map((stroke) => keysOf(stroke) + (stroke.commit === true ? '*' : ''));

test('定義の全セルが出典から作った面と一致し、標準的なかなを打てる', () => {
  assertKanaLayoutFixture(layout);
  assertKanaLayout(layout);
  assert.deepEqual(uncoveredKana(layout), []);
  assert.deepEqual(manifest.omissions, []);
});

test('定義ファイルにある155種のかな・句読点・中黒・長音・記号を、すべて打てる', () => {
  const routes = sourceRoutes();
  assert.equal(routes.length, 160);
  const outputs = new Set(routes.map((route) => route.output));
  assert.equal(outputs.size, 155);
  const untypable = [...outputs].filter((output) => !layout.canonicalInputs.has(output));
  assert.deepEqual(untypable, []);
  assert.equal(typed([...outputs].join('')).skipped, 0);
});

test('出典の各セルの打鍵で、そのセルの出力を打てる', () => {
  for (const route of sourceRoutes()) {
    assert.ok(typedKeys(route.output).includes(route.keys), `${route.output} を ${route.keys} で打てない`);
  }
});

test('面から作った打鍵は、出典のセルと過不足なく一致する', () => {
  const fromLayout = [...layout.canonicalInputs].flatMap(([output]) => typedKeys(output).map((keys) => `${output}:${keys}`));
  const expected = sourceRoutes().map((route) => `${route.output}:${route.keys}`);
  assert.deepEqual([...new Set(fromLayout)].sort(), [...new Set(expected)].sort());
});

test('単打のキーは32で、後置のトリガーe i o s fも単打で ゃ ぃ ぇ ょ ゅ を出す', () => {
  const singles = [...layout.canonicalInputs].flatMap(([output]) =>
    typedKeys(output)
      .filter((keys) => keys.length === 1)
      .map((keys) => [keys, output]),
  );
  assert.equal(singles.length, 32);
  assert.deepEqual(
    ['e', 'i', 'o', 's', 'f'].map((key) => singles.find(([keys]) => keys === key)?.[1]),
    ['ゃ', 'ぃ', 'ぇ', 'ょ', 'ゅ'],
  );
  assert.deepEqual(typedKeys('ゃ').sort(), ['de', 'e']);
});

test('後置の面は5枚で、前置の面と3打の面は無い', () => {
  assert.deepEqual(
    (layout.faces ?? []).map((face) => [face.trigger, face.mode, face.suffixTrigger]),
    [
      [[], 'prefix', undefined],
      [['e'], 'suffix', undefined],
      [['i'], 'suffix', undefined],
      [['o'], 'suffix', undefined],
      [['s'], 'suffix', undefined],
      [['f'], 'suffix', undefined],
    ],
  );
});

test('数字段の記号7セルを、文字キーの後にトリガーを打って出せる', () => {
  assert.deepEqual(strokesOf('！？・「」（）'), ['2', 'i', '3', 'i', '4', 'i', '8', 'e', '-', 'e', '9', 'e', '0', 'e']);
});

test('ヴは片仮名で、単打と後置に持つ', () => {
  assert.deepEqual(typedKeys('ヴ'), ['y']);
  assert.deepEqual(typedKeys('ヴぁ'), ['ye']);
  assert.ok(!layout.canonicalInputs.has('ゔ'));
});

test('定義の無いセルは、トリガーを単打として続けて打つ', () => {
  // ceは定義の無いセル。はとゃを続けて打つ
  assert.deepEqual(strokesOf('はゃ'), ['c', 'e']);
  assert.deepEqual(strokesOf('ゃゃ'), ['e', 'e']);
});

test('確定の打鍵: 直前の文字のキーとトリガーが後置の面のセルに読める継ぎ目に入る', () => {
  assert.deepEqual(strokesOf('かゃ'), ['w', 'thumb-r*', 'e']);
  assert.deepEqual(strokesOf('か。'), ['w', '.']);
  assert.deepEqual(strokesOf('。ゃ'), ['.', 'thumb-r*', 'e']);
});

test('確定の打鍵: 直前のかなの最後の打鍵が後置の面の出力キーではない時は入らない', () => {
  assert.deepEqual(strokesOf('きゃゃ'), ['z', 'e', 'e']);
  assert.deepEqual(strokesOf('ーか'), ['q', 'w']);
});

test('確定の打鍵は右親指の1打で、入力文字数は変わらない', () => {
  const trace = typed('かゃ');
  const commit = trace.strokes.find((stroke) => stroke.commit === true)!;
  assert.deepEqual(
    commit.presses.map((press) => press.keys.map((key) => key.id)),
    [['thumb-r']],
  );
});

test('日本語サンプルは、確定の打鍵が入らずに打てる', () => {
  const text = prepareEvaluationText(SAMPLE_TEXT_JA, {
    language: 'ja',
    keepSymbols: false,
    layoutHasChar: (char) => layout.canonicalInputs.has(char),
    layoutHasHeading: (heading) => layout.canonicalInputs.has(heading),
    maxKatakanaHeadingLength: 0,
  });
  const trace = typed(text);
  assert.equal(trace.strokes.length, 2283);
  assert.equal(trace.strokes.filter((stroke) => stroke.commit === true).length, 0);
});
