import test from 'node:test';
import assert from 'node:assert/strict';
import {
  movementPlotExtent,
  movementPlotScale,
} from './movement-profile-scale.ts';

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
});

test('Fixedは最大距離が違っても角度と確率の円の半径が同じで、fitは従来どおり最大距離に追従する', () => {
  const fixed = [1, 2, 4, 5, 6, 9].map((max) => movementPlotScale(max, 'fixed'));
  assert.ok(fixed.every((scale) => scale.polarBaseRadius === fixed[0].polarBaseRadius));
  assert.equal(fixed[0].polarBaseRadius, 129);

  // fitは外周を一定に保つので、円の半径は最大距離によらず同じ（plotRadius固定）。
  // 「fitが従来と変わらない」ことを値で固定する
  assert.equal(movementPlotScale(2, 'fit').polarBaseRadius, 82 + 9);
  assert.equal(movementPlotScale(6, 'fit').halfSize, 82 + 9 + 13);
});

test('Fixedで円より長いベクトルの先端もviewBoxに収まる', () => {
  for (const max of [1, 3, 5, 6, 9, 15]) {
    const scale = movementPlotScale(max, 'fixed');
    assert.ok(scale.halfSize >= max * 24 + 13, `max=${max}`);
    assert.ok(scale.halfSize >= scale.polarBaseRadius + 13, `max=${max}`);
    assert.ok(movementPlotExtent(scale, 0, 1) >= scale.halfSize);
  }
});

test('movement plot scaleはdisplay gainから独立する', () => {
  const scale = movementPlotScale(3, 'fixed');

  assert.equal(scale.scaleMax, 3);
  assert.equal(scale.unitsPerSvgUnit, 24);
  assert.equal(scale.plotRadius, 72);
  assert.equal(scale.polarBaseRadius, 129);
  assert.equal(scale.polarAmplitude, 16);
});

test('polar extentは実densityとdisplay gainに応じてcanvasだけを拡張する', () => {
  const scale = movementPlotScale(3, 'fixed');
  const normal = movementPlotExtent(scale, 1.8, 1);
  const narrowHighPeak = movementPlotExtent(scale, 6.7, 3);

  assert.equal(scale.unitsPerSvgUnit, 24);
  assert.equal(scale.plotRadius, 72);
  assert.equal(scale.polarBaseRadius, 129);
  assert.ok(narrowHighPeak > normal);
  assert.ok(
    Math.abs(
      narrowHighPeak - (scale.polarBaseRadius + 6.7 * scale.polarAmplitude * 3 + 13),
    ) < 1e-12,
  );
});

test('同じdensityとgainならLeft / Rightに依存せず同じextentになる', () => {
  const scale = movementPlotScale(4, 'fit');
  const density = 1.75;
  const gain = 1.4;

  assert.equal(
    movementPlotExtent(scale, density, gain),
    movementPlotExtent(scale, density, gain),
  );
});
