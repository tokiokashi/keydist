import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { generateTrace } from './generate.ts';

const geometry = buildGeometry('row-staggered');
const trace = (layoutId: string, text: string) => generateTrace(text, LAYOUT_BY_ID.get(layoutId)!, geometry, { windowSize: 3, sfbHomeCost: true });

test('打てなかった文字を、漢字・記号・それ以外の文字に分けて数える', () => {
  // かなを直接打つ配列で、漢字（々を含む）・記号・改行と、ひらがなにした ゔ が打てない文字になる
  const result = trace('nicola', 'あ漢字々い「」!ゔ\nう');
  assert.equal(result.skipped, result.skippedByKind.kanji + result.skippedByKind.symbol + result.skippedByKind.other);
  assert.deepEqual(result.skippedByKind, { kanji: 3, symbol: 3, other: 2 });
  assert.equal(result.skipped, 8);
});

test('打てない文字が無ければ、内訳もすべて0', () => {
  const result = trace('nicola', 'あいう');
  assert.deepEqual(result.skippedByKind, { kanji: 0, symbol: 0, other: 0 });
  assert.equal(result.skipped, 0);
});

test('漢字は言語の判定によらず、文字そのもので漢字に数える', () => {
  const result = trace('qwerty', 'abc漢字');
  assert.deepEqual(result.skippedByKind, { kanji: 2, symbol: 0, other: 0 });
});
