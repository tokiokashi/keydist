import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEAT_BLOB_LEVELS,
  HEAT_BLOB_RADIUS_KEYS,
  HEAT_BLOB_SIGMA_KEYS,
  heatBlobIntensityAt,
  heatBlobLevel,
  heatBlobProfile,
  heatBlobRuns,
  type HeatBlobSource,
} from './heatmap-blob.ts';

const KEY = 30;

test('塊の断面は、半径の円にガウスぼかしを掛けた形。中心で1、円の縁で0.5弱、縁から標準偏差の4倍外で0', () => {
  assert.ok(heatBlobProfile(0) > 0.999);
  // 円の縁は直線ではなく曲がっているので、半分より少し小さい
  assert.ok(heatBlobProfile(HEAT_BLOB_RADIUS_KEYS) > 0.4 && heatBlobProfile(HEAT_BLOB_RADIUS_KEYS) < 0.5);
  assert.ok(heatBlobProfile(HEAT_BLOB_RADIUS_KEYS - 2 * HEAT_BLOB_SIGMA_KEYS) > 0.95);
  assert.ok(heatBlobProfile(HEAT_BLOB_RADIUS_KEYS + 2 * HEAT_BLOB_SIGMA_KEYS) < 0.05);
  assert.equal(heatBlobProfile(HEAT_BLOB_RADIUS_KEYS + 5 * HEAT_BLOB_SIGMA_KEYS), 0);
});

test('塊の断面は、heatmap.jsの手順（円を描いて標準偏差7.5の影を付ける）を直接数えた値と合う', () => {
  // キーの辺50・半径30・標準偏差7.5。円の上の点から、中心との距離 d の点へのガウス分布の密度を、細かい升で足す
  const radius = 30;
  const sigma = 7.5;
  const step = 0.25;
  for (const d of [0, 15, 30, 40]) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += step) {
      for (let y = -radius; y <= radius; y += step) {
        if (Math.hypot(x, y) > radius) continue;
        sum += Math.exp(-((x - d) ** 2 + y ** 2) / (2 * sigma * sigma)) * step * step;
      }
    }
    const direct = Math.min(1, sum / (2 * Math.PI * sigma * sigma));
    assert.ok(Math.abs(heatBlobProfile(d / 50) - direct) < 0.01, `d=${d}: ${heatBlobProfile(d / 50)} と ${direct}`);
  }
});

test('塊の中心の強度は、そのキーの強度に等しい', () => {
  assert.ok(Math.abs(heatBlobIntensityAt([{ x: 0, y: 0, intensity: 0.7 }], 0, 0, KEY) - 0.7) < 0.001);
});

test('押下数0のキーを中心にした塊は描かない', () => {
  assert.equal(heatBlobIntensityAt([{ x: 0, y: 0, intensity: 0 }], 0, 0, KEY), 0);
  assert.deepEqual(heatBlobRuns([{ x: 20, y: 20, intensity: 0 }], { minX: 0, minY: 0, maxX: 40, maxY: 40 }, 4, KEY), []);
});

test('塊が重なった所の強度は 1 − (1 − a)(1 − b) で積み上がり、足し合わせた値より小さく、重なる前のどちらより大きい', () => {
  const a: HeatBlobSource = { x: 0, y: 0, intensity: 0.6 };
  const b: HeatBlobSource = { x: 24, y: 0, intensity: 0.5 };
  for (const x of [6, 10, 12, 14, 18]) {
    const alone = [heatBlobIntensityAt([a], x, 0, KEY), heatBlobIntensityAt([b], x, 0, KEY)] as const;
    assert.ok(Math.min(...alone) > 0.05, '重なっている点で検査している');
    const together = heatBlobIntensityAt([a, b], x, 0, KEY);
    assert.ok(Math.abs(together - (1 - (1 - alone[0]) * (1 - alone[1]))) < 1e-12);
    assert.ok(together > Math.max(...alone));
    assert.ok(together < alone[0] + alone[1]);
  }
});

test('押下数の少ないキーが集まった所は、押下数の多いキー1つの所より濃くなりうる', () => {
  const crowd: HeatBlobSource[] = [-12, 0, 12].map((x) => ({ x, y: 0, intensity: 0.3 }));
  const strong: HeatBlobSource[] = [{ x: 0, y: 0, intensity: 0.4 }];
  assert.ok(heatBlobIntensityAt(crowd, 0, 0, KEY) > heatBlobIntensityAt(strong, 0, 0, KEY));
});

test('尺度の上限の強度1を持つ塊が重なっても、1を超えない', () => {
  const sources: HeatBlobSource[] = [
    { x: 0, y: 0, intensity: 1 },
    { x: 10, y: 0, intensity: 1 },
    { x: 5, y: 8, intensity: 1 },
  ];
  for (let x = -10; x <= 20; x += 2) assert.ok(heatBlobIntensityAt(sources, x, 0, KEY) <= 1);
});

test('描く矩形の段は強度を丸めた値で、重なった所は積み上がった強度の段になる', () => {
  const sources: HeatBlobSource[] = [
    { x: 8, y: 8, intensity: 0.5 },
    { x: 16, y: 8, intensity: 0.5 },
  ];
  const area = { minX: 0, minY: 0, maxX: 24, maxY: 16 };
  const runs = heatBlobRuns(sources, area, 2, KEY);
  assert.ok(runs.length > 0);
  const top = Math.max(...runs.map((run) => run.level));
  // 中心の間（x=12）は2つの塊が積み上がり、1つ分の強度0.5の段を超える
  assert.ok(top > Math.round(0.5 * HEAT_BLOB_LEVELS));
  assert.equal(top, heatBlobLevel(heatBlobIntensityAt(sources, 12, 9, KEY)));
  assert.ok(runs.every((run) => run.level >= 1 && run.level <= HEAT_BLOB_LEVELS));
});

test('同じ段が横に続く升は1つの矩形にまとめる', () => {
  const runs = heatBlobRuns([{ x: 30, y: 30, intensity: 1 }], { minX: 0, minY: 0, maxX: 60, maxY: 60 }, 2, KEY);
  const row = runs.filter((run) => run.y === 30);
  assert.ok(row.length > 0 && row.length < 30);
  assert.ok(row.every((run) => run.x >= 0 && run.x + run.width <= 60));
});
