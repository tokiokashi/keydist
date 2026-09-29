import test from 'node:test';
import assert from 'node:assert/strict';
import { movementPlotScale } from './movement-profile-scale.ts';

test('1uの描画長は解析対象が変わっても固定で、目盛りだけが最長ベクトルに追従する', () => {
  const twoUnits = movementPlotScale(2);
  const fourUnits = movementPlotScale(4);

  assert.equal(twoUnits.unitsPerSvgUnit, 24);
  assert.equal(fourUnits.unitsPerSvgUnit, twoUnits.unitsPerSvgUnit);
  assert.equal(twoUnits.scaleMax, 2);
  assert.equal(fourUnits.plotRadius, twoUnits.plotRadius * 2);
});

test('最大距離が違っても角度と確率の円の半径とviewBoxは同じ（画面上の大きさが動かない）', () => {
  const base = movementPlotScale(3);
  for (const max of [0, 1, 5, 6, 9, 15]) {
    const scale = movementPlotScale(max);
    assert.equal(scale.polarBaseRadius, base.polarBaseRadius);
    assert.equal(scale.halfSize, base.halfSize);
    assert.equal(scale.viewSize, base.viewSize);
  }
  assert.equal(base.polarBaseRadius, 129);
  assert.equal(base.halfSize, 129 + 13);
});

test('scaleは最大距離だけの関数で、表示倍率や密度を受け取らない', () => {
  assert.equal(movementPlotScale.length, 1);
  assert.equal(movementPlotScale(3).polarAmplitude, 16);
});
