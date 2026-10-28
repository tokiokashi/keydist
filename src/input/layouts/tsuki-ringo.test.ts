import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace, type Stroke } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';
import { uncoveredKana } from './kana-coverage.ts';
import { faceCells } from './face-geometry.ts';
import { fromFaces } from './types.ts';

const layout = LAYOUT_BY_ID.get('tsuki-ringo')!;
const geometry = buildGeometry('row-staggered');

interface SourceFace {
  trigger: string[];
  mode: 'prefix' | 'suffix' | 'simultaneous';
  extraCells?: Record<string, string>;
  rows: string[][];
  sourceRows: string[];
}

/** 出典のスナップショット。定義ファイルから起こした面を持つ。 */
const manifest = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/tsuki-ringo.json', import.meta.url), 'utf8')) as {
  faces: SourceFace[];
};

const ANSI_KEYS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];

/** 面のセルの打鍵の列。後置の面は出力キーの後にトリガーを打つ。 */
const routeKeys = (face: SourceFace, key: string): string => (face.mode === 'suffix' ? [key, ...face.trigger] : [...face.trigger, key]).join(' ');

/** 出典の各セルの、出力と打鍵の列（キーを空白で区切った文字列）。格子の外のキーのセルも含む。 */
function sourceRoutes(): Array<{ output: string; keys: string }> {
  return manifest.faces.flatMap((face) => [
    ...face.sourceRows.flatMap((row, r) =>
      row.split('\t').flatMap((output, c) => (output === '' ? [] : [{ output, keys: routeKeys(face, ANSI_KEYS[r]![c]!) }])),
    ),
    ...Object.entries(face.extraCells ?? {}).map(([key, output]) => ({ output, keys: routeKeys(face, key) })),
  ]);
}

/** そのかなを打つ全ての経路を、打鍵の列（キーを空白で区切った文字列）で返す。 */
function typedKeys(kana: string): string[] {
  return (layout.canonicalInputs.get(kana) ?? []).map((alternative) =>
    alternative.baseRealizations
      .flatMap((realization) => realization.actions)
      .map((step) => step.join('+'))
      .join(' '),
  );
}

const keysOf = (stroke: Stroke): string => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join('+');
const typed = (text: string) => generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
/** 打鍵の列。確定の打鍵には末尾に`*`を付ける。 */
const strokesOf = (text: string): string[] => typed(text).strokes.map((stroke) => keysOf(stroke) + (stroke.commit === true ? '*' : ''));

test('定義の全セルが出典から作った面と一致し、標準的なかなを打てる', () => {
  assertKanaLayoutFixture(layout);
  // 作者の定義は ゔ を持ち、ヴ を持たない
  assertKanaLayout(layout, ['ヴ']);
  assert.deepEqual(uncoveredKana(layout), []);
});

test('定義ファイルから面にした88種のかな・句読点・長音・中黒・全角のwを、すべて打てる', () => {
  const outputs = new Set(sourceRoutes().map((route) => route.output));
  assert.equal(outputs.size, 88);
  const untypable = [...outputs].filter((output) => !layout.canonicalInputs.has(output));
  assert.deepEqual(untypable, []);
  assert.equal(typed([...outputs].join('')).skipped, 0);
});

test('出典の各セルの打鍵で、そのセルの出力を打てる', () => {
  for (const route of sourceRoutes()) {
    assert.ok(typedKeys(route.output).includes(route.keys), `${route.output} を ${route.keys} で打てない`);
  }
});

test('面から作った打鍵は、出典のセルと過不足なく一致し、出力ごとに経路は1つ', () => {
  const fromLayout = [...layout.canonicalInputs].flatMap(([output]) => typedKeys(output).map((keys) => `${output}:${keys}`));
  const expected = sourceRoutes().map((route) => `${route.output}:${route.keys}`);
  assert.deepEqual([...fromLayout].sort(), [...expected].sort());
  assert.equal(new Set(fromLayout).size, layout.canonicalInputs.size);
});

test('単打のキーは33で、eは ょ、iは ゛、caps-lockは き を単打で出す', () => {
  const singles = [...layout.canonicalInputs].flatMap(([output]) =>
    typedKeys(output)
      .filter((keys) => !keys.includes(' '))
      .map((keys) => [keys, output] as const),
  );
  assert.equal(singles.length, 33);
  assert.deepEqual(
    ['e', 'i', 'caps-lock', '[', "'"].map((key) => singles.find(([keys]) => keys === key)?.[1]),
    ['ょ', '゛', 'き', 'ー', 'っ'],
  );
});

test('caps-lockの位置の き ぎ は、Trace生成でcaps-lockのキーとして打たれる', () => {
  assert.deepEqual(strokesOf('き'), ['caps-lock']);
  assert.deepEqual(strokesOf('ぎ'), ['caps-lock', 'i']);
  assert.deepEqual(strokesOf('きょ'), ['caps-lock', 'e']);
  assert.deepEqual(strokesOf('ぎょ'), ['caps-lock', 'i', 'e']);
  const [base, , dakuten] = layout.faces!;
  assert.equal(faceCells(base!).get('caps-lock'), 'き');
  assert.equal(faceCells(dakuten!).get('caps-lock'), 'ぎ');
});

test('キー・e・iの3打の経路になる7字（げ ぼ ぶ ぱ べ ぽ ぞ）は、キー・iの2打の経路だけを持つ', () => {
  const seven: Array<[string, string]> = [
    ['げ', 'r'],
    ['ぼ', 'y'],
    ['ぶ', 'a'],
    ['ぱ', 'k'],
    ['べ', ';'],
    ['ぽ', 'v'],
    ['ぞ', 'n'],
  ];
  for (const [kana, key] of seven) {
    assert.deepEqual(typedKeys(kana), [`${key} i`], kana);
    assert.deepEqual(strokesOf(kana), [key, 'i'], kana);
  }
});

test('3打の経路を表すには、出力キーを前置のトリガーにする面が要り、後置の面に後置を重ねる面は作れない', () => {
  const [base, suffixE] = layout.faces!;
  assert.throws(
    () =>
      fromFaces('ringo-three-stroke', 'x', [
        base!,
        suffixE!,
        { trigger: ['e'], mode: 'suffix', suffixTrigger: ['i'], rows: ['', '', 'ああ', ''], inputRole: 'layer', triggerPersistence: 'single' },
      ]),
    /suffixTriggerを持てるのはmode=prefixの面だけ/,
  );
});

test('確定の打鍵: eの後置の面にセルを持つキーで出すかなの後に ょ が続くと入り、セルを持たないキーの後には入らない', () => {
  // れ（a）・ら（r）・ゃ（p）・ゅ（b）は、eの後置の面にセル（ふ け ぉ ひ）を持つ
  assert.deepEqual(strokesOf('れょ'), ['a', 'thumb-r*', 'e']);
  assert.deepEqual(strokesOf('らょ'), ['r', 'thumb-r*', 'e']);
  assert.deepEqual(strokesOf('ゃょ'), ['p', 'thumb-r*', 'e']);
  assert.deepEqual(strokesOf('ゅょ'), ['b', 'thumb-r*', 'e']);
  // し（s）・ち（z）・に（c）・き（caps-lock）はセルを持たず、しょ・ちょ・にょ・きょ は2打
  assert.deepEqual(strokesOf('しょ'), ['s', 'e']);
  assert.deepEqual(strokesOf('ちょ'), ['z', 'e']);
  assert.deepEqual(strokesOf('にょ'), ['c', 'e']);
  assert.deepEqual(strokesOf('きょ'), ['caps-lock', 'e']);
});

test('確定の打鍵: eの後置の面で出したかなの後の ょ は、末尾のeが出力キーではないので入らない', () => {
  assert.deepEqual(strokesOf('みょ'), ['o', 'e', 'e']);
  assert.deepEqual(strokesOf('ひょ'), ['b', 'e', 'e']);
  assert.deepEqual(strokesOf('ぎょ'), ['caps-lock', 'i', 'e']);
});

test('確定の打鍵: iの後置の面にセルを持つキーで出すかなの後に ゛ が続くと入り、セルを持たないキーの後には入らない', () => {
  // れ（a）・し（s）・き（caps-lock）は、iの後置の面にセル（ぶ じ ぎ）を持つ
  assert.deepEqual(strokesOf('れ゛'), ['a', 'thumb-r*', 'i']);
  assert.deepEqual(strokesOf('し゛'), ['s', 'thumb-r*', 'i']);
  assert.deepEqual(strokesOf('き゛'), ['caps-lock', 'thumb-r*', 'i']);
  // お（,）はiの後置の面にセルを持たない
  assert.deepEqual(strokesOf('お゛'), [',', 'i']);
});

test('単打の ゛ を面から外すと、iは単打で文字を出さず、単打のキーは32になる', () => {
  const faces = layout.faces!.map((face, index) =>
    index === 0 ? { ...face, rows: face.rows.map((row) => [...row].map((cell) => (cell === '゛' ? '' : cell))) } : face,
  );
  const withoutDakuten = fromFaces('ringo-without-dakuten', 'x', faces);
  assert.equal(withoutDakuten.canonicalInputs.has('゛'), false);
  assert.equal(withoutDakuten.canonicalInputs.size, layout.canonicalInputs.size - 1);
  assert.deepEqual(
    generateTrace('れょ', withoutDakuten, geometry, DEFAULT_TRACE_POLICY).strokes.map((stroke) => keysOf(stroke) + (stroke.commit === true ? '*' : '')),
    ['a', 'thumb-r*', 'e'],
  );
});
