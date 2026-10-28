import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Stroke } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';
import { uncoveredKana } from './kana-coverage.ts';

const layout = LAYOUT_BY_ID.get('tsuki-ex')!;
const geometry = buildGeometry('row-staggered');

interface SourceFace {
  trigger: string[];
  mode: 'prefix' | 'suffix' | 'simultaneous';
  rows: string[][];
  sourceRows: string[];
}

/** 出典のスナップショット。定義ファイルから起こした面と、面に入れなかったセルを持つ。 */
const manifest = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/tsuki-ex.json', import.meta.url), 'utf8')) as {
  faces: SourceFace[];
  omissions: unknown[];
};

const ANSI_KEYS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];

/** 出典の各セルの、出力と打鍵の列（前置のキー、出力キーの順に並べた文字列）。 */
function sourceRoutes(): Array<{ output: string; keys: string }> {
  return manifest.faces.flatMap((face) =>
    face.sourceRows.flatMap((row, r) =>
      row.split('\t').flatMap((output, c) => (output === '' ? [] : [{ output, keys: `${face.trigger.join('')}${ANSI_KEYS[r]![c]!}` }])),
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
  // ゎ は定義ファイルに無い
  assertKanaLayout(layout, ['ゎ']);
  assert.deepEqual(uncoveredKana(layout), []);
});

test('面は単打と前置のd・k・lの4枚で、単打は33キー、前置の面は31・30・23キー', () => {
  assert.deepEqual(
    (layout.faces ?? []).map((face) => [face.trigger.join(''), face.rows.flat().filter((cell) => cell !== '').length]),
    [
      ['', 33],
      ['d', 31],
      ['k', 30],
      ['l', 23],
    ],
  );
});

test('定義ファイルの全ての出力（かな・句読点・記号）を、入れた経路で打てる', () => {
  const outputs = new Set(sourceRoutes().map((route) => route.output));
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

test('面に入れなかったセルは無い。配列図にだけある ゑ ゐ は打てない', () => {
  assert.deepEqual(manifest.omissions, []);
  assert.deepEqual(typedKeys('ゑ'), []);
  assert.deepEqual(typedKeys('ゐ'), []);
});

test('d・k・lは単打で、。？を出し、ょは単打で、ゃゅはD面、ぁぃぅぇぉはK面にある', () => {
  assert.deepEqual([strokesOf('、'), strokesOf('。'), strokesOf('？')], [['d'], ['k'], ['l']]);
  assert.deepEqual(typedKeys('ょ'), ['t']);
  assert.deepEqual(typedKeys('ゃ'), ['dn']);
  assert.deepEqual(typedKeys('ゅ'), ['di']);
  assert.deepEqual(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ'].flatMap(typedKeys), ['ku', 'ko', 'kn', 'km', 'k.']);
  assert.deepEqual(typedKeys('ー').sort(), ['-', '/']);
});

test('同じ句読点の経路は、単打を先頭にし、面の経路は代替の経路に残る', () => {
  assert.deepEqual(typedKeys('、'), ['d', 'df']);
  assert.deepEqual(typedKeys('。'), ['k', 'kj']);
  assert.deepEqual(typedKeys('？'), ['l', 'k;']);
  for (const [mark, single] of [
    ['、', ['d']],
    ['。', ['k']],
    ['？', ['l']],
  ] as const) {
    assert.deepEqual(strokesOf(mark), single);
  }
});

test('日本語サンプルで、句読点に2打の経路が選ばれた回数は0', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const marks = [...text].filter((char) => char === '、' || char === '。');
  assert.ok(marks.length > 0);
  // 入力の打鍵数が、全ての文字を先頭の経路で打った時の打鍵数と一致し、句読点の先頭の経路は1打
  const routeLength = (char: string) => typedKeys(char)[0]!.length;
  const inputs = strokesOf(text).filter((stroke) => stroke !== 'thumb-r*');
  assert.equal(
    inputs.length,
    [...text].reduce((sum, char) => sum + layout.canonicalInputs.get(char)![0]!.baseRealizations.flatMap((r) => r.actions).length, 0),
  );
  assert.deepEqual([...new Set(marks.map(routeLength))], [1]);
});

test('D面とK面は、反対の手のキーにも同じ手のキーにも文字を持つ', () => {
  // dは左手の中指。左手のキー（同手）と右手のキー（逆手）の両方に文字がある
  assert.deepEqual(typedKeys('づ'), ['dw']);
  assert.deepEqual(typedKeys('ぐ'), ['dy']);
  // kは右手の中指
  assert.deepEqual(typedKeys('ぬ'), ['kq']);
  assert.deepEqual(typedKeys('ぁ'), ['ku']);
});

test('確定の打鍵: 、の後にD面の出力キーで打つかなが続くと入る', () => {
  assert.deepEqual(strokesOf('、か'), ['d', 'thumb-r*', 'f']);
  assert.deepEqual(strokesOf('、き'), ['d', 'thumb-r*', ',']);
  assert.deepEqual(strokesOf('い、い'), ['i', 'd', 'thumb-r*', 'i']);
});

test('確定の打鍵: 、の後にD面に無いキーで打つかなが続くと入らない', () => {
  // D面に文字の無いキーはq・e・b・x・cとd自身
  assert.deepEqual(strokesOf('、わ'), ['d', 'q']);
  assert.deepEqual(strokesOf('、っ'), ['d', 'e']);
  assert.deepEqual(strokesOf('、さ'), ['d', 'b']);
  assert.deepEqual(strokesOf('、は'), ['d', 'x']);
  assert.deepEqual(strokesOf('、に'), ['d', 'c']);
  assert.deepEqual(strokesOf('、、'), ['d', 'd']);
});

test('確定の打鍵: 出力が記号のセルも継ぎ目を決める（D面で！「（）を出すキーで打つかな）', () => {
  const symbolCells: Array<[string, string]> = [
    ['の', 'a'],
    ['と', 's'],
    ['す', 'z'],
    ['で', 'v'],
  ];
  const faceD = manifest.faces[1]!;
  for (const [kana, key] of symbolCells) {
    const [row, column] = [1, 2, 3].map((r) => [r, ANSI_KEYS[r]!.indexOf(key)] as const).find(([, c]) => c >= 0)!;
    assert.match(faceD.sourceRows[row]!.split('\t')[column]!, /^[！「（）]$/, `D面の${key}`);
    assert.deepEqual(strokesOf(`、${kana}`), ['d', 'thumb-r*', key], kana);
  }
});

test('確定の打鍵: 。と？の後も、K面・L面の出力キーなら入り、無いキーなら入らない', () => {
  assert.deepEqual(strokesOf('。と'), ['k', 'thumb-r*', 's']);
  assert.deepEqual(strokesOf('。い'), ['k', 'i']);
  assert.deepEqual(strokesOf('。。'), ['k', 'k']);
  assert.deepEqual(strokesOf('。、'), ['k', 'thumb-r*', 'd']);
  assert.deepEqual(strokesOf('？の'), ['l', 'thumb-r*', 'a']);
  assert.deepEqual(strokesOf('？し'), ['l', 'o']);
  assert.deepEqual(strokesOf('？ー'), ['l', '-']);
});

test('確定の打鍵: 前置の面の2打で出した文字の後や、単打の文字の後に句読点が続く時は入らない', () => {
  assert.deepEqual(strokesOf('いえ、'), ['i', 'k', 'a', 'd']);
  assert.deepEqual(strokesOf('かな。'), ['f', ';', 'k']);
});

test('確定の打鍵: 右親指の1打で、入力文字数は変わらない', () => {
  const trace = typed('、か');
  const commit = trace.strokes.find((stroke) => stroke.commit === true)!;
  assert.deepEqual(
    commit.presses.map((press) => press.keys.map((key) => key.id)),
    [['thumb-r']],
  );
});
