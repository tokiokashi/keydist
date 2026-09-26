import test from 'node:test';
import assert from 'node:assert/strict';
import { movementPlotScale } from '../src/features/bigram-vector/movement-profile-scale.ts';

test('Auto fitは最大距離に合わせつつ左右共通range内でplot radiusを一定にする', () => {
  const twoUnits = movementPlotScale(2, 'fit');
  const fourUnits = movementPlotScale(4, 'fit');

  assert.equal(twoUnits.scaleMax, 2);
  assert.equal(fourUnits.scaleMax, 4);
  assert.equal(twoUnits.plotRadius, fourUnits.plotRadius);
  assert.equal(twoUnits.unitsPerSvgUnit, fourUnits.unitsPerSvgUnit * 2);
});

test('Fixed u scaleは解析対象が変わっても1uの描画長を固定する', () => {
  const twoUnits = movementPlotScale(2, 'fixed');
  const fourUnits = movementPlotScale(4, 'fixed');

  assert.equal(twoUnits.unitsPerSvgUnit, fourUnits.unitsPerSvgUnit);
  assert.equal(fourUnits.plotRadius, twoUnits.plotRadius * 2);
  assert.ok(fourUnits.viewSize > twoUnits.viewSize);
});


test('movement plot scaleはdisplay gainから独立する', () => {
  const scale = movementPlotScale(3, 'fixed');

  assert.equal(scale.scaleMax, 3);
  assert.equal(scale.unitsPerSvgUnit, 24);
  assert.equal(scale.plotRadius, 72);
  assert.equal(scale.polarBaseRadius, 81);
  assert.equal(scale.polarAmplitude, 16);
});
