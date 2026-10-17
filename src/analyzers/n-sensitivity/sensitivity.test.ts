import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID, withRomaji } from '#input/layouts/index.ts';
import { nSensitivity } from './sensitivity.ts';

const geometry = buildGeometry('row-staggered');
const OPTIONS = { windowSize: 3, sfbHomeCost: true };

test('N=0は、同じかなの中だけ指を残す候補を持つ', () => {
  // 「あ」をu・x・uと打つ表。三つ目のuは、同じかなの中で一つ目のuを打った指が、間にxを挟んで再び打つ。
  // 同じかなの中なのでN=0でも残る候補があり、ホームから来るより短い
  const sameKana = withRomaji(LAYOUT_BY_ID.get('qwerty')!, new Map([['あ', 'uxu']]));
  const [zero, one] = nSensitivity('あ', sameKana, geometry, OPTIONS, [0, 1]);
  assert.equal(zero.totalUnits, one.totalUnits, '同じかなの中は、N=0とN=1で変わらない');

  // 隣のかなの中のuは、N=0では範囲の外でホームから来る。N=1では範囲の中で残る
  const nextKana = withRomaji(
    LAYOUT_BY_ID.get('qwerty')!,
    new Map([
      ['い', 'u'],
      ['う', 'xu'],
    ]),
  );
  const [nextZero, nextOne] = nSensitivity('いう', nextKana, geometry, OPTIONS, [0, 1]);
  assert.ok(nextOne.totalUnits < nextZero.totalUnits, 'N=1で残る候補が増えて短くなる');

  // 同じかなの中のuは、隣のかなの中のuより、N=0の時点で短い
  assert.ok(zero.totalUnits < nextZero.totalUnits);
});
