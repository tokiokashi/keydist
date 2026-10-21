import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluationBoundaries, prepareEvaluationText } from './evaluation-text.ts';
import { convertToReading, type ReadingToken } from './reading.ts';
import { mapBoundariesToReading, offsetsOfChunks } from './segmentation.ts';

const encoder = new TextEncoder();

function tokensOf(text: string, words: readonly (readonly [surface: string, reading: string | null])[]): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  let cursor = 0;
  for (const [surface, reading] of words) {
    const index = text.indexOf(surface, cursor);
    assert.ok(index >= 0, `${surface} が原文に無い`);
    const byteStart = encoder.encode(text.slice(0, index)).length;
    tokens.push({ surface, byteStart, byteEnd: byteStart + encoder.encode(surface).length, reading, isUnknown: false });
    cursor = index + surface.length;
  }
  return tokens;
}

test('分割器の断片から、先頭と末尾を含まない区切りの位置を作る', () => {
  assert.deepEqual(offsetsOfChunks(['私は', '猫で', 'ある']), [2, 4]);
  assert.deepEqual(offsetsOfChunks(['私は猫である']), []);
  assert.deepEqual(offsetsOfChunks([]), []);
});

test('漢字を含まない原文の区切りは、前処理の対応だけで写り、位置は変わらない', () => {
  assert.deepEqual(mapBoundariesToReading('わがはいはねこである', [], [6]), [6]);
});

test('区切りが読みに直した語の途中に来たら、その語の後ろの境目へ寄せる', () => {
  const text = '吾輩は猫である';
  const tokens = tokensOf(text, [
    ['吾輩', 'ワガハイ'],
    ['は', 'ハ'],
    ['猫', 'ネコ'],
    ['で', 'デ'],
    ['ある', 'アル'],
  ]);
  // 読みのテキスト: わがはいはねこである（吾輩→わがはい 4字、猫→ねこ 2字）
  assert.equal(convertToReading(text, tokens).text, 'わがはいはねこである');
  // 「吾|輩は」の途中（1）は語の後ろ（読みの4）へ寄る。「吾輩は|猫」（3）は語の境目なので読みの5
  assert.deepEqual(mapBoundariesToReading(text, tokens, [1, 3]), [4, 5]);
  // 「猫で」の中ではなく、語の境目の猫|で（4）は読みの7
  assert.deepEqual(mapBoundariesToReading(text, tokens, [4]), [7]);
});

test('寄せて重なった区切りは1つにし、先頭と末尾に来た区切りは除く', () => {
  const text = '吾輩は猫';
  const tokens = tokensOf(text, [
    ['吾輩', 'ワガハイ'],
    ['は', 'ハ'],
    ['猫', 'ネコ'],
  ]);
  // 1と2は同じ語「吾輩」の途中で、どちらも読みの4へ寄る。0は先頭、4は末尾
  assert.deepEqual(mapBoundariesToReading(text, tokens, [0, 1, 2, 4]), [4]);
  // 語の後ろへ寄せた先が末尾なら除く（猫の途中は無いが、最後の語の途中に来る場合）
  const single = tokensOf('猫猫', [['猫猫', 'ネコネコ']]);
  assert.deepEqual(mapBoundariesToReading('猫猫', single, [1]), []);
});

test('利用者の読みの直しで読みの文字数が変わっても、区切りは語の境目に載る', () => {
  const text = '吾輩は猫';
  const tokens = tokensOf(text, [
    ['吾輩', 'ワガハイ'],
    ['は', 'ハ'],
    ['猫', 'ネコ'],
  ]);
  // 吾輩を「われ」（2字）に直すと、読みのテキストは「われはねこ」
  const corrections = { 吾輩: 'われ' };
  assert.equal(convertToReading(text, tokens, corrections).text, 'われはねこ');
  assert.deepEqual(mapBoundariesToReading(text, tokens, [3], corrections), [3]);
  assert.deepEqual(mapBoundariesToReading(text, tokens, [1], corrections), [2]);
  // 直しが無ければ、同じ区切りが別の位置に写る
  assert.deepEqual(mapBoundariesToReading(text, tokens, [3]), [5]);
});

test('語の間に残る文字（解析が返さない空白）は、そのまま数える', () => {
  const text = '猫 犬';
  const tokens = tokensOf(text, [
    ['猫', 'ネコ'],
    ['犬', 'イヌ'],
  ]);
  assert.equal(convertToReading(text, tokens).text, 'ねこ いぬ');
  assert.deepEqual(mapBoundariesToReading(text, tokens, [2]), [3]);
});

test('サロゲートペアを含む原文でも、UTF-16の区切りをコードポイントの位置に写す', () => {
  // 𠮷はUTF-16で2、コードポイントで1
  assert.deepEqual(mapBoundariesToReading('𠮷あいう', [], [3]), [2]);
});

test('評価に渡すテキストへの写しは、取り除いた記号の数だけ前へ詰め、重なった区切りと端の区切りを除く', () => {
  const options = { language: 'ja', keepSymbols: false } as const;
  const text = 'あ「い」う、え';
  const prepared = prepareEvaluationText(text, { ...options, layoutHasChar: () => false, layoutHasHeading: () => false, maxKatakanaHeadingLength: 0 });
  assert.equal(prepared, 'あいう、え');
  // 区切り3（い|」）と4（」|う）は、「」を取り除くと同じ位置2に重なる。0と7は端
  assert.deepEqual(evaluationBoundaries(text, [0, 2, 3, 4, 6, 7], options), [1, 2, 4]);
  // 取り除いた記号の直後が末尾なら、その区切りは末尾に当たって除く
  assert.deepEqual(evaluationBoundaries('あい」', [2, 3], options), []);
  // 記号をすべて残す設定では位置は変わらない
  assert.deepEqual(evaluationBoundaries(text, [2, 3, 4], { language: 'ja', keepSymbols: true }), [2, 3, 4]);
  // 区切りの位置までの前処理後の文字数と一致する
  for (const boundary of [1, 2, 3, 4, 5, 6]) {
    const head = prepareEvaluationText([...text].slice(0, boundary).join(''), {
      ...options,
      layoutHasChar: () => false,
      layoutHasHeading: () => false,
      maxKatakanaHeadingLength: 0,
    });
    const mapped = evaluationBoundaries(text, [boundary], options);
    if (mapped.length > 0) assert.equal(mapped[0], [...head].length, `区切り${boundary}`);
  }
});

test('半角の , . は1文字を1文字に書き換えるので、位置が変わらない。英語のテキストは何も変えない', () => {
  assert.deepEqual(evaluationBoundaries('あ,い.う', [2, 4], { language: 'ja', keepSymbols: false }), [2, 4]);
  assert.deepEqual(evaluationBoundaries('a「b', [2], { language: 'en', keepSymbols: false }), [2]);
});
