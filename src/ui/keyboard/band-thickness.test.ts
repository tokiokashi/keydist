import assert from 'node:assert/strict';
import test from 'node:test';
import { bandThicknessRatio } from './band-thickness.ts';

test('各縁に1本の帯は、キーの幅の1/4', () => {
  for (const edge of ['left', 'right', 'bottom'] as const) assert.equal(bandThicknessRatio(edge, 1), 1 / 4);
});

test('左右の縁は、同じ縁の合計が3/8を超えない。下の縁は1/2を超えない', () => {
  for (let count = 1; count <= 8; count++) {
    assert.ok(bandThicknessRatio('left', count) * count <= 3 / 8 + 1e-12, `left ${count}`);
    assert.ok(bandThicknessRatio('right', count) * count <= 3 / 8 + 1e-12, `right ${count}`);
    assert.ok(bandThicknessRatio('bottom', count) * count <= 1 / 2 + 1e-12, `bottom ${count}`);
  }
  assert.equal(bandThicknessRatio('left', 2), 3 / 16);
  assert.equal(bandThicknessRatio('bottom', 2), 1 / 4);
});

test('左右の縁に0〜4本ずつ並べても、塗りが幅の1/4以上残る', () => {
  for (let left = 0; left <= 4; left++) {
    for (let right = 0; right <= 4; right++) {
      const covered = left * bandThicknessRatio('left', left) + right * bandThicknessRatio('right', right);
      assert.ok(1 - covered >= 1 / 4 - 1e-12, `left ${left} right ${right}`);
    }
  }
});
