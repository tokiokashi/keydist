import assert from 'node:assert/strict';
import test from 'node:test';
import { COLOR_SLOT_COUNT } from '#engine/multi-target-selection.ts';
import { targetMark, targetMarkPath } from './target-marks.ts';

test('色の番号ごとに、形と線種の組が重ならない（色を除いても区別できる）', () => {
  const keys = Array.from({ length: COLOR_SLOT_COUNT }, (_, slot) => {
    const mark = targetMark(slot);
    return `${mark.shape}/${mark.dashed ? 'dashed' : 'solid'}`;
  });
  assert.equal(new Set(keys).size, COLOR_SLOT_COUNT);
});

test('先頭の番号は実線で、形が1周した後の番号から破線になる', () => {
  assert.ok([0, 1, 2, 3, 4, 5].every((slot) => !targetMark(slot).dashed));
  assert.ok([6, 7, 8, 9, 10, 11].every((slot) => targetMark(slot).dashed));
  // 形は1周して戻り、線種で区別される（形だけが同じ組は、線種が違う）
  assert.equal(targetMark(0).shape, targetMark(6).shape);
  assert.notEqual(targetMark(0).dashed, targetMark(6).dashed);
});

test('範囲外の番号は、色と同じく剰余で折り返す', () => {
  assert.deepEqual(targetMark(COLOR_SLOT_COUNT + 2), targetMark(2));
  assert.deepEqual(targetMark(-1), targetMark(COLOR_SLOT_COUNT - 1));
});

test('形の輪郭は形ごとに違う', () => {
  const shapes = Array.from({ length: 6 }, (_, slot) => targetMark(slot).shape);
  assert.equal(new Set(shapes.map((shape) => targetMarkPath(shape, 3))).size, 6);
});
