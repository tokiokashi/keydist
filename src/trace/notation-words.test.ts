import assert from 'node:assert/strict';
import test from 'node:test';
import { withCombos } from '#input/layouts/types.ts';
import { toLayout, type FaceUserLayout } from '#input/layouts/user-layouts.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import type { NotationWord } from '#input/text/notation-words.ts';
import { strokeEndsOf } from '#interpretation/selection-ends.ts';
import { playbackInputPreview } from '#interpretation/timing/playback.ts';
import { generateTrace } from './generate.ts';

/** 漢字の見出しを2つ（漢・字）と、かな（あ・い・か・ん）を持つ、小さな漢直の配列。 */
const KANJI_LAYOUT_SOURCE: FaceUserLayout = {
  kind: 'kana',
  id: 'kanji-small',
  name: '漢直の小さな配列',
  faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'い', d: '漢', f: '字', j: 'か', k: 'ん' } }],
  composition: { dakuten: false, handakuten: false },
};

const kanjiLayout = toLayout(KANJI_LAYOUT_SOURCE);
const geometry = buildGeometry('row-staggered');
const policy = { windowSize: 3, sfbHomeCost: true };

function trace(text: string, notationWords: readonly NotationWord[] = [], comboBarriers: readonly number[] = [], layout = kanjiLayout) {
  return generateTrace(text, layout, geometry, policy, undefined, comboBarriers, notationWords);
}

const summary = (strokes: ReturnType<typeof trace>['strokes']) =>
  strokes.map((stroke) => ({ char: stroke.char, inputChar: stroke.inputChar, start: stroke.kanaStart, end: stroke.kanaEnd }));

test('表記を見出しに切り分けられる語は表記で打ち、どの入力も語の読みの範囲全体を覆う', () => {
  // 読み「かんじ」（位置1〜3）を、表記「漢字」の見出し2つで打つ。「ん」「じ」は配列に無いので、読みで打つと打てない文字が出る
  const result = trace('あかんじい', [{ start: 1, end: 4, surface: '漢字' }]);
  assert.equal(result.skipped, 0);
  assert.equal(result.inputChars, 5);
  assert.deepEqual(summary(result.strokes), [
    { char: 'あ', inputChar: 'あ', start: 0, end: 0 },
    { char: '漢', inputChar: '漢', start: 1, end: 3 },
    { char: '字', inputChar: '字', start: 1, end: 3 },
    { char: 'い', inputChar: 'い', start: 4, end: 4 },
  ]);
  // 見出しごとに別の入力で、入力単位の番号が重ならない
  assert.equal(new Set(result.strokes.map((stroke) => stroke.inputIndex)).size, 4);
  assert.equal(new Set(result.strokes.map((stroke) => stroke.selectionIndex)).size, 4);
});

test('表記を切り分けられない字が1字でも残る語は、語全体を読みで打つ', () => {
  // 「山」は見出しに無いので、読み「かんい」で打つ
  const result = trace('あかんいあ', [{ start: 1, end: 4, surface: '漢山' }]);
  assert.equal(result.skipped, 0);
  assert.deepEqual(
    result.strokes.map((stroke) => stroke.char),
    ['あ', 'か', 'ん', 'い', 'あ'],
  );
});

test('語を渡さなければ、表記の字は読みの範囲に現れず、読みで打つ', () => {
  const result = trace('かんじ');
  assert.deepEqual(
    result.strokes.map((stroke) => stroke.char),
    ['か', 'ん'],
  );
  // 配列に無い「じ」は打てない文字に数える
  assert.equal(result.skipped, 1);
});

test('語の内側の位置は、どの入力の開始にもならず、次の入力は読みの範囲の次から始まる', () => {
  const result = trace('かんじあ', [{ start: 0, end: 3, surface: '漢字' }]);
  const starts = new Set(result.strokes.map((stroke) => stroke.kanaStart));
  assert.deepEqual([...starts].sort(), [0, 3]);
  // 語を打つ2つの入力は、同じ範囲を覆うので、選択の位置eは語の読みの最後の位置1つになる
  assert.deepEqual(strokeEndsOf(result.strokes, result.inputChars), [2, 2, 3]);
});

test('語の表記は語の内側だけで切り出し、語の外の字とは組み合わせない', () => {
  // 「字あ」を1つの見出し（コンボ）に持つ配列。語の後ろの「あ」とは組み合わせず、「字」と「あ」を別々に打つ
  const combo = withCombos('kanji-combo', '字あのコンボ', kanjiLayout, [['字あ', ['字', 'あ']]]);
  const crossing = trace('かんじあ', [{ start: 0, end: 3, surface: '漢字' }], [], combo);
  assert.deepEqual(crossing.comboHits, []);
  assert.deepEqual(
    crossing.strokes.map((stroke) => stroke.char),
    ['漢', '字', 'あ'],
  );
  // 語でなく、テキストに残った漢字（未知語）なら、後ろの字と組み合わせて見出しに当たる
  assert.deepEqual(trace('漢字あ', [], [], combo).comboHits, ['字あ']);
});

test('語の読みの範囲の内側に来たコンボを止める境は置かない', () => {
  // 表記「漢字」を1つの見出し（コンボ）で打つ。読み「かんじ」の内側の境（位置1）では止めない
  const combo = withCombos('kanji-combo', '漢字のコンボ', kanjiLayout, [['漢字', ['漢', '字']]]);
  const words: NotationWord[] = [{ start: 0, end: 3, surface: '漢字' }];
  assert.deepEqual(trace('かんじ', words, [1], combo).comboHits, ['漢字']);
  // 境を置く字の並びなら、境をまたぐコンボ枠の見出しは当たらない（境の効果を測る基準）
  assert.deepEqual(trace('漢字', [], [1], combo).comboHits, []);
  assert.deepEqual(trace('漢字', [], [], combo).comboHits, ['漢字']);
});

test('語の前後の境は、表記で打つ語があっても置く', () => {
  // 「あ」と「い」の間の境（位置1）で、語の前の「あい」のコンボを止める
  const combo = withCombos('kanji-combo', 'あいのコンボ', kanjiLayout, [['あい', ['あ', 'い']]]);
  const words: NotationWord[] = [{ start: 2, end: 5, surface: '漢字' }];
  assert.deepEqual(trace('あいかんじ', words, [], combo).comboHits, ['あい']);
  assert.deepEqual(trace('あいかんじ', words, [1], combo).comboHits, []);
});

test('辞書に読みが無く表記のまま残った漢字は、見出しにあれば打ち、無ければ打てない漢字に数える', () => {
  const result = trace('あ漢山');
  assert.deepEqual(
    result.strokes.map((stroke) => stroke.char),
    ['あ', '漢'],
  );
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.skippedByKind, { kanji: 1, symbol: 0, other: 0 });
  assert.deepEqual(result.skippedPositions, [2]);
});

test('表記で打つ語の外側の打てない文字の位置は、読みのテキストの位置のまま', () => {
  const result = trace('あかんじ山', [{ start: 1, end: 4, surface: '漢字' }]);
  assert.deepEqual(result.skippedPositions, [4]);
});

test('打鍵再生が読む入力の列に、表記で打つ語は表記で出る', () => {
  const result = trace('あかんじい', [{ start: 1, end: 4, surface: '漢字' }]);
  // 2打目（「漢」を打った直後）の現在の入力は「漢」で、先読みの入力は「字」と「い」
  const preview = playbackInputPreview(result.strokes, 2, 3);
  assert.deepEqual(
    preview.map((segment) => [segment.kind, segment.text]),
    [
      ['completed', 'あ'],
      ['current', '漢'],
      ['planned', '字'],
      ['planned', 'い'],
    ],
  );
});
