import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReadingToken } from '#input/text/reading.ts';
import { computeSegmentation, type BunsetsuSource } from './segmentation.ts';
import { segmentationBasisOf, type PaneText } from './reading-evaluation.ts';

const encoder = new TextEncoder();
const source: BunsetsuSource = {
  info: { name: 'テスト用', version: '1' },
  split: async () => ['吾', '輩は', '猫で', 'ある'],
};

test('分割器の区切りを語の境目へ寄せ、読みのテキストの位置にして、分割器の名前と版を添える', async () => {
  const text = '吾輩は猫である';
  const words: [string, string][] = [
    ['吾輩', 'ワガハイ'],
    ['は', 'ハ'],
    ['猫', 'ネコ'],
    ['で', 'デ'],
    ['ある', 'アル'],
  ];
  let cursor = 0;
  const tokens: ReadingToken[] = words.map(([surface, reading]) => {
    const byteStart = encoder.encode(text.slice(0, cursor)).length;
    cursor += surface.length;
    return { surface, byteStart, byteEnd: byteStart + encoder.encode(surface).length, reading, isUnknown: false };
  });
  const input = await computeSegmentation(source, { sourceText: text, tokens, corrections: {}, origin: 'dictionary' });
  // 分割器の区切り 1（吾|輩）は語「吾輩」の途中なので読みの4へ寄り、3（は|猫）は5、5（で|ある）は8
  assert.deepEqual(input.boundaries, [4, 5, 8]);
  assert.equal(input.origin, 'dictionary');
  assert.deepEqual(input.splitter, { name: 'テスト用', version: '1' });
});

test('漢字を含まないテキストと辞書を読めなかったテキストは、語の列なしの材料になり、日本語以外は材料を持たない', () => {
  const base = { ref: { kind: 'builtin', id: 'x' }, text: 'あいう', language: 'ja', isBuiltin: true, name: 'x' } as unknown as PaneText;
  assert.equal(segmentationBasisOf(base)?.origin, 'kana-only');
  assert.equal(segmentationBasisOf(base)?.tokens.length, 0);
  const failed = {
    ...base,
    reading: { status: 'unavailable', dictionary: { name: 'a', version: '1' }, library: { name: 'b', version: '1' }, corrections: [] },
  } as PaneText;
  assert.equal(segmentationBasisOf(failed)?.origin, 'dictionary-unavailable');
  assert.equal(segmentationBasisOf({ ...base, language: 'en' } as PaneText), undefined);
});
