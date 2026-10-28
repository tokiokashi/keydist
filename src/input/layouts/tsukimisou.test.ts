import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareEvaluationText } from '#input/text/evaluation-text.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Stroke } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';
import { uncoveredKana } from './kana-coverage.ts';
import { faceDisplayCells } from './layers.ts';

const layout = LAYOUT_BY_ID.get('tsukimisou')!;
const geometry = buildGeometry('row-staggered');

interface SourceFace {
  trigger: string[];
  mode: 'prefix' | 'suffix' | 'simultaneous';
  suffixTrigger?: string[];
  rows: string[][];
  sourceRows: string[];
}

/** 出典のスナップショット。定義ファイルから起こした面と、面に入れなかったセルを持つ。 */
const manifest = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/tsukimisou.json', import.meta.url), 'utf8')) as {
  faces: SourceFace[];
};

const ANSI_KEYS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];

/** 面のセルの打鍵の列。前置は先、後置は出力キーの後に打つ。 */
const routeKeys = (face: SourceFace, key: string): string =>
  face.mode === 'suffix' ? `${key}${face.trigger.join('')}` : `${face.trigger.join('')}${key}${(face.suffixTrigger ?? []).join('')}`;

/** 出典の各セルの、出力と打鍵の列（前置・出力キー・後置を順に並べた文字列）。 */
function sourceRoutes(): Array<{ output: string; keys: string }> {
  return manifest.faces.flatMap((face) =>
    face.sourceRows.flatMap((row, r) =>
      row.split('\t').flatMap((output, c) => (output === '' ? [] : [{ output, keys: routeKeys(face, ANSI_KEYS[r]![c]!) }])),
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
  // ゃ ゅ ょ は拗音の後置としてだけ出て、単独で出すキーは無い
  assertKanaLayout(layout, ['ゃ', 'ゅ', 'ょ']);
  assert.deepEqual(uncoveredKana(layout), ['ゃ', 'ゅ', 'ょ']);
});

test('定義ファイルにある154種のかな・句読点・中黒・長音を、すべて打てる', () => {
  const outputs = new Set(sourceRoutes().map((route) => route.output));
  assert.equal(outputs.size, 154);
  const untypable = [...outputs].filter((output) => !layout.canonicalInputs.has(output));
  assert.deepEqual(untypable, []);
  const text = [...outputs].join('');
  assert.equal(typed(text).skipped, 0);
});

test('出典の各セルの打鍵で、そのセルの出力を打てる', () => {
  for (const route of sourceRoutes()) {
    assert.ok(typedKeys(route.output).includes(route.keys), `${route.output} を ${route.keys} で打てない`);
  }
});

test('面から作った打鍵は、出典のセルと過不足なく一致する', () => {
  const fromLayout = [...layout.canonicalInputs].flatMap(([output, alternatives]) =>
    alternatives.map((_, index) => `${output}:${typedKeys(output)[index]}`),
  );
  const expected = sourceRoutes().map((route) => `${route.output}:${route.keys}`);
  assert.deepEqual([...new Set(fromLayout)].sort(), [...new Set(expected)].sort());
});

test('単打のキーは31で、e・s・f・jも単打でかなを出し、yは使わない', () => {
  const singles = [...layout.canonicalInputs].flatMap(([output]) =>
    typedKeys(output)
      .filter((keys) => keys.length === 1)
      .map((keys) => [keys, output]),
  );
  assert.equal(singles.length, 31);
  assert.deepEqual(
    ['e', 's', 'f', 'j'].map((key) => singles.find(([keys]) => keys === key)?.[1]),
    ['、', '・', '。', 'っ'],
  );
  assert.ok(!singles.some(([keys]) => keys === 'y'));
});

test('前置jと出力キーと後置の3打の面は31件で、そのキー列で打てる', () => {
  const threeStroke = (layout.faces ?? []).filter((face) => face.suffixTrigger !== undefined);
  assert.deepEqual(
    threeStroke.map((face) => face.suffixTrigger),
    [['e'], ['s'], ['f']],
  );
  const routes = sourceRoutes().filter((route) => route.keys.length === 3 && route.keys.startsWith('j') && 'esf'.includes(route.keys[2]!));
  assert.equal(routes.length, 31);
  assert.deepEqual(typedKeys('ひゃ'), ['jke']);
  assert.deepEqual(typedKeys('ぢょ'), ['jms']);
  assert.deepEqual(typedKeys('っぷ'), ['jse']);
});

test('っ＋かなの10件は、3打で1つの見出しとして打たれ、確定の打鍵が入らない', () => {
  const ten: Array<[string, string]> = [
    ['っぐ', 'j f s'],
    ['っしぇ', 'j c e'],
    ['っちぇ', 'j x e'],
    ['っぱ', 'j e f'],
    ['っぶ', 'j f e'],
    ['っぷ', 'j s e'],
    ['っへ', 'j e s'],
    ['っぺ', 'j c s'],
    ['っぼ', 'j s f'],
    ['っぽ', 'j x f'],
  ];
  for (const [kana, keys] of ten) {
    assert.deepEqual(strokesOf(kana), keys.split(' '), kana);
  }
});

test('ぎゃ行・じゃ行は、2打の経路と3打の経路を持ち、既存の規則で2打の経路が選ばれる', () => {
  const six: Array<[string, string, string]> = [
    ['ぎゃ', 've', 'jve'],
    ['ぎゅ', 'vf', 'jvf'],
    ['ぎょ', 'vs', 'jvs'],
    ['じゃ', 'pe', 'jae'],
    ['じゅ', 'pf', 'jaf'],
    ['じょ', 'ps', 'jas'],
  ];
  for (const [kana, two, three] of six) {
    assert.deepEqual([...typedKeys(kana)].sort(), [three, two].sort(), kana);
    assert.deepEqual(strokesOf(kana), [two[0], two[1]], kana);
  }
});

test('jの後のe・s・fは、前置jの面のわ・あ・やとして1つの打鍵に数え、後置の面のjのセルは表示だけにする', () => {
  assert.deepEqual(typedKeys('わ'), ['je']);
  assert.deepEqual(typedKeys('あ'), ['js']);
  assert.deepEqual(typedKeys('や'), ['jf']);
  const [, suffixE, suffixS, suffixF, prefixJ] = layout.faces!;
  assert.deepEqual(
    [suffixE, suffixS, suffixF].map((face) => faceDisplayCells(face!).get('j')),
    ['わ', 'あ', 'や'],
  );
  assert.deepEqual(
    [suffixE, suffixS, suffixF].map((face) => face!.rows.flatMap((row) => [...row]).includes('わ')),
    [false, false, false],
  );
  assert.deepEqual(
    ['e', 's', 'f'].map((key) => faceDisplayCells(prefixJ!).get(key)),
    ['わ', 'あ', 'や'],
  );
  assert.deepEqual(strokesOf('わ'), ['j', 'e']);
});

test('確定の打鍵: 後置の側。かの後に句読点fを打つとほと読まれるので、確定を挟んで3打になる。後置sの面にwのセルは無いのでか・には入らない', () => {
  assert.deepEqual(strokesOf('か。'), ['w', 'thumb-r*', 'f']);
  assert.deepEqual(strokesOf('か、'), ['w', 'thumb-r*', 'e']);
  assert.deepEqual(strokesOf('か・'), ['w', 's']);
});

test('確定の打鍵: 前置の側。っの後に、前置jの面の出力キーで始まるかなが続くと確定を挟む', () => {
  assert.deepEqual(strokesOf('っば'), ['j', 'thumb-r*', 'd', 'f']);
  const goodbye = prepareEvaluationText('グッバイ', {
    language: 'ja',
    keepSymbols: false,
    layoutHasChar: (char) => layout.canonicalInputs.has(char),
    layoutHasHeading: (heading) => layout.canonicalInputs.has(heading),
    maxKatakanaHeadingLength: 0,
  });
  assert.equal(goodbye, 'ぐっばい');
  assert.deepEqual(strokesOf(goodbye), ['f', 's', 'j', 'thumb-r*', 'd', 'f', 'k']);
});

test('確定の打鍵: っの後の句読点・中黒にも確定が入る（前置jの面のわ・あ・やと読まれるため）', () => {
  assert.deepEqual(strokesOf('っ、'), ['j', 'thumb-r*', 'e']);
  assert.deepEqual(strokesOf('っ。'), ['j', 'thumb-r*', 'f']);
  assert.deepEqual(strokesOf('っ・'), ['j', 'thumb-r*', 's']);
});

test('確定の打鍵: 直前のかなの最後の打鍵が後置の面の出力キーではない時は入らない', () => {
  assert.deepEqual(strokesOf('きゃ、'), ['u', 'e', 'e']);
  assert.deepEqual(strokesOf('さ。'), ['o', 'f', 'f']);
});

test('確定の打鍵: 確定の打鍵は右親指の1打で、入力文字数は変わらない', () => {
  const trace = typed('か。');
  const commit = trace.strokes.find((stroke) => stroke.commit === true)!;
  assert.deepEqual(
    commit.presses.map((press) => press.keys.map((key) => key.id)),
    [['thumb-r']],
  );
});
