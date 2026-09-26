import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_POLAR_DISPLAY_DENSITY,
  MAX_POLAR_DISPLAY_GAIN,
  movementPlotScale,
  polarDisplayDensity,
  polarDisplayRadius,
} from '../src/features/bigram-vector/movement-profile-scale.ts';

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


test('最小bandwidthの理論peakでも最大gain時に確保済み外周領域を超えない', () => {
  const scale = movementPlotScale(3, 'fixed');
  const radius = polarDisplayRadius(
    scale.polarBaseRadius,
    scale.polarAmplitude,
    MAX_POLAR_DISPLAY_DENSITY,
    MAX_POLAR_DISPLAY_GAIN,
  );
  const maxExpected = scale.polarBaseRadius
    + scale.polarAmplitude * MAX_POLAR_DISPLAY_GAIN;

  assert.ok(Math.abs(radius - maxExpected) < 1e-12);
  assert.ok(radius < scale.halfSize);
});

test('display scaleはdensity値そのものを変更せず固定基準で写像する', () => {
  const density = MAX_POLAR_DISPLAY_DENSITY / 2;
  const displayDensity = polarDisplayDensity(density);

  assert.equal(density, MAX_POLAR_DISPLAY_DENSITY / 2);
  assert.ok(Math.abs(displayDensity - 0.5) < 1e-12);
});

test('同じdensityはLeft / Rightに依存せず同じ描画長へ写像される', () => {
  const scale = movementPlotScale(4, 'fit');
  const density = MAX_POLAR_DISPLAY_DENSITY * 0.4;
  const leftRadius = polarDisplayRadius(
    scale.polarBaseRadius,
    scale.polarAmplitude,
    density,
    1.75,
  );
  const rightRadius = polarDisplayRadius(
    scale.polarBaseRadius,
    scale.polarAmplitude,
    density,
    1.75,
  );

  assert.equal(leftRadius, rightRadius);
});
