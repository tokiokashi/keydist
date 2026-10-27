import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEAT_BLOB_LEVELS, heatBlobIntensityAt, heatBlobLevel, heatBlobRuns, type HeatBlobSource } from './heatmap-blob.ts';

const RADIUS = 48;

test('塊の中心の強度は、そのキーの強度に等しい', () => {
  assert.equal(heatBlobIntensityAt([{ x: 0, y: 0, intensity: 0.7 }], 0, 0, RADIUS), 0.7);
});

test('中心から離れるほど薄くなり、届く距離で0になる', () => {
  const sources: HeatBlobSource[] = [{ x: 0, y: 0, intensity: 1 }];
  const near = heatBlobIntensityAt(sources, 10, 0, RADIUS);
  const far = heatBlobIntensityAt(sources, 30, 0, RADIUS);
  assert.ok(near > far && far > 0);
  assert.equal(heatBlobIntensityAt(sources, RADIUS, 0, RADIUS), 0);
});

test('押下数0のキーを中心にした塊は描かない', () => {
  assert.equal(heatBlobIntensityAt([{ x: 0, y: 0, intensity: 0 }], 0, 0, RADIUS), 0);
  assert.deepEqual(heatBlobRuns([{ x: 20, y: 20, intensity: 0 }], { minX: 0, minY: 0, maxX: 40, maxY: 40 }, 4, RADIUS), []);
});

test('塊が重なった所の強度は、足さずに重なった塊の強度の最大に等しい', () => {
  const a: HeatBlobSource = { x: 0, y: 0, intensity: 0.6 };
  const b: HeatBlobSource = { x: 30, y: 0, intensity: 0.6 };
  for (const x of [5, 10, 15, 20, 25]) {
    const together = heatBlobIntensityAt([a, b], x, 0, RADIUS);
    const alone = [heatBlobIntensityAt([a], x, 0, RADIUS), heatBlobIntensityAt([b], x, 0, RADIUS)];
    assert.ok(Math.min(...alone) > 0, '重なっている点で検査している');
    assert.equal(together, Math.max(...alone));
    assert.ok(together < alone[0]! + alone[1]!);
  }
});

test('押下数の少ないキーが集まっても、押下数の多いキー1つの強度を超えない', () => {
  const crowd: HeatBlobSource[] = [-20, -10, 0, 10, 20].map((x) => ({
    x,
    y: 0,
    intensity: 0.3,
  }));
  const strong: HeatBlobSource[] = [{ x: 0, y: 0, intensity: 0.4 }];
  const strongCenter = heatBlobIntensityAt(strong, 0, 0, RADIUS);
  for (const x of [-20, -10, 0, 10, 20]) {
    const value = heatBlobIntensityAt(crowd, x, 0, RADIUS);
    assert.ok(value <= 0.3);
    assert.ok(value < strongCenter);
  }
});

test('尺度の上限の強度1を持つ塊が重なっても、1を超えない', () => {
  const sources: HeatBlobSource[] = [
    { x: 0, y: 0, intensity: 1 },
    { x: 10, y: 0, intensity: 1 },
  ];
  for (let x = -10; x <= 20; x += 2) assert.ok(heatBlobIntensityAt(sources, x, 0, RADIUS) <= 1);
});

test('描く矩形の段は強度を丸めた値で、重なった所でも足されない', () => {
  const sources: HeatBlobSource[] = [
    { x: 8, y: 8, intensity: 0.5 },
    { x: 16, y: 8, intensity: 0.5 },
  ];
  const runs = heatBlobRuns(sources, { minX: 0, minY: 0, maxX: 24, maxY: 16 }, 4, RADIUS);
  assert.ok(runs.length > 0);
  assert.ok(runs.every((run) => run.level >= 1 && run.level <= heatBlobLevel(0.5)));
  assert.equal(Math.max(...runs.map((run) => run.level)), Math.round(0.5 * HEAT_BLOB_LEVELS));
});

test('同じ段が横に続く升は1つの矩形にまとめる', () => {
  const runs = heatBlobRuns([{ x: 20, y: 20, intensity: 1 }], { minX: 0, minY: 0, maxX: 40, maxY: 40 }, 4, RADIUS);
  const row = runs.filter((run) => run.y === 20);
  assert.ok(row.length > 0 && row.length < 10);
  assert.ok(row.every((run) => run.x >= 0 && run.x + run.width <= 40));
});
