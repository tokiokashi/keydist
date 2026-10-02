import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  elideMiddle,
  estimateTextWidth,
  fitLabels,
  LEGEND_MAX_LABEL_WIDTH,
  placeLegend,
  segmentIntersectsRect,
  type BelowArea,
  type Point,
  type Rect,
} from './legend-placement.ts';

const PLOT: Rect = { x: 48, y: 16, width: 400, height: 150 };
const LEFT = PLOT.x;
const RIGHT = PLOT.x + PLOT.width;
const TOP = PLOT.y;
const BOTTOM = PLOT.y + PLOT.height;
const BELOW: BelowArea = { x: 8, y: 200, width: 480 };
const measure = estimateTextWidth;

/** 左上から右下へ下がる線（N感度の線の形）。 */
const descending: Point[] = [{ x: LEFT, y: TOP }, { x: LEFT + 60, y: TOP }, { x: RIGHT, y: TOP + 60 }];

function place(lines: Point[][], labels: string[], plot: Rect = PLOT, below: BelowArea = BELOW) {
  return placeLegend(plot, lines, labels, measure, below);
}

function within(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

test('線分と矩形の交差: 内側・貫通・かすめない・縁', () => {
  const rect: Rect = { x: 10, y: 10, width: 20, height: 20 };
  assert.equal(segmentIntersectsRect({ x: 15, y: 15 }, { x: 16, y: 16 }, rect), true);
  assert.equal(segmentIntersectsRect({ x: 0, y: 20 }, { x: 40, y: 20 }, rect), true);
  assert.equal(segmentIntersectsRect({ x: 0, y: 0 }, { x: 40, y: 5 }, rect), false);
  assert.equal(segmentIntersectsRect({ x: 0, y: 0 }, { x: 5, y: 40 }, rect), false);
  assert.equal(segmentIntersectsRect({ x: 30, y: 0 }, { x: 30, y: 40 }, rect), true);
});

test('左上から右下へ下がる線なら、左下に置く', () => {
  const placement = place([descending], ['QWERTY', 'Dvorak']);
  assert.equal(placement.corner, 'bottom-left');
  assert.equal(placement.overlaps, 0);
});

test('左下が線で塞がれていれば右上へ移す', () => {
  const low: Point[] = [{ x: LEFT, y: BOTTOM - 10 }, { x: RIGHT, y: BOTTOM - 10 }];
  assert.equal(place([low], ['QWERTY', 'Dvorak']).corner, 'top-right');
});

test('左下・右上が塞がれていれば、空いている別の隅へ移す', () => {
  const lowLeft: Point[] = [{ x: LEFT, y: BOTTOM - 10 }, { x: LEFT + 200, y: BOTTOM - 10 }];
  const highRight: Point[] = [{ x: RIGHT - 200, y: TOP + 10 }, { x: RIGHT, y: TOP + 10 }];
  assert.equal(place([lowLeft, highRight], ['QWERTY']).corner, 'bottom-right');
});

test('四隅が塞がれていて、辺の中央が空いていれば中央へ置く', () => {
  const corner = (x: number, y: number): Point[] => [{ x: x - 60, y }, { x: x + 60, y }];
  const blockers = [corner(LEFT + 40, BOTTOM - 10), corner(RIGHT - 40, TOP + 10), corner(RIGHT - 40, BOTTOM - 10), corner(LEFT + 40, TOP + 10)];
  const placement = place(blockers, ['QWERTY']);
  assert.equal(placement.corner, 'right-middle');
  assert.ok(within(placement.rect, PLOT));
});

test('プロット領域より大きい枠は候補にせず、プロットの下へ置く（枠は図の幅に収まる）', () => {
  const labels = Array.from({ length: 17 }, (_, i) => `配列の名前${i}`);
  const plot: Rect = { x: 48, y: 16, width: 250, height: 144 };
  const below: BelowArea = { x: 8, y: 200, width: 300 };
  const placement = place([descending], labels, plot, below);
  assert.equal(placement.corner, 'below');
  assert.ok(placement.rect.x >= below.x && placement.rect.x + placement.rect.width <= below.x + below.width);
  assert.equal(placement.rect.y, below.y);
});

test('置き場は、どんな大きさ・対象数でもプロットに収まるか、プロットの下に幅内で置かれる', () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let trial = 0; trial < 300; trial += 1) {
    const plot: Rect = { x: 48, y: 16, width: 120 + random() * 700, height: 100 + random() * 300 };
    const count = 1 + Math.floor(random() * 17);
    const labels = Array.from({ length: count }, (_, i) => `配列${i}${'x'.repeat(Math.floor(random() * 12))}`);
    const lines: Point[][] = Array.from({ length: count }, () => {
      const start = plot.y + random() * plot.height;
      return [{ x: plot.x, y: start }, { x: plot.x + plot.width, y: start + random() * (plot.y + plot.height - start) }];
    });
    const below: BelowArea = { x: 8, y: plot.y + plot.height + 40, width: plot.width + 90 };
    const placement = place(lines, labels, plot, below);
    if (placement.corner === 'below') {
      assert.ok(placement.rect.x + placement.rect.width <= below.x + below.width + 1e-9 || placement.columns === 1, `trial ${trial}`);
    } else {
      assert.ok(within(placement.rect, plot), `trial ${trial}: 枠がプロットに収まる`);
      for (const line of lines) {
        assert.equal(segmentIntersectsRect(line[0]!, line[1]!, placement.rect), false, `trial ${trial}: 線と交わらない`);
      }
    }
  }
});

test('中央を省いた名前は幅に収まり、短い名前はそのまま', () => {
  assert.equal(elideMiddle('QWERTY', LEGEND_MAX_LABEL_WIDTH), 'QWERTY');
  const cut = elideMiddle('とても長い名前の配列とても長い名前の配列（Setup 1）', LEGEND_MAX_LABEL_WIDTH);
  assert.ok(cut.includes('…'));
  assert.ok(cut.endsWith('（Setup 1）') || cut.endsWith('1）'));
  assert.ok(estimateTextWidth(cut) <= LEGEND_MAX_LABEL_WIDTH);
});

test('省いた後も、別の対象が同じ名前にならない（区別の部分が中央にある場合も、末尾の札の場合も）', () => {
  const head = 'NICOLA / とても長い物理配列の名前がここに入る';
  const tail = 'とても長い名前の続き（ANSI）';
  const cases: string[][] = [
    [`${head} A ${tail}`, `${head} B ${tail}`, `${head} C ${tail}`],
    ['とても長い名前の配列とても長い名前の配列（Setup 1）', 'とても長い名前の配列とても長い名前の配列（Setup 2）'],
    ['QWERTY', 'Dvorak', 'Colemak-DH'],
    [`${head}${tail}`, `${head}x${tail}`],
  ];
  for (const labels of cases) {
    const fitted = fitLabels(labels, measure, LEGEND_MAX_LABEL_WIDTH, 600);
    assert.equal(new Set(fitted).size, labels.length, labels.join(' | '));
    assert.equal(fitted.length, labels.length);
  }
});

test('全対象が共有する部分を先に省き、区別の部分（ANSI・JISなど）を残す', () => {
  const labels = [
    'カラムスタッガード（ANSI・分割想定）',
    'カラムスタッガード（JIS・分割想定）',
    'カラムスタッガード（ISO・分割想定）',
  ];
  const fitted = fitLabels(labels, measure, LEGEND_MAX_LABEL_WIDTH, 300);
  assert.ok(fitted[0]!.includes('ANSI'));
  assert.ok(fitted[1]!.includes('JIS'));
  assert.ok(fitted[2]!.includes('ISO'));
  assert.ok(fitted.every((label) => estimateTextWidth(label) <= LEGEND_MAX_LABEL_WIDTH));
});

test('NICOLAのSetup 4件: 物理配列を区別する語（ロウ/カラム・ANSI/JIS）が、省いた名前にも残る', () => {
  const labels = [
    'ロウスタッガード（ANSI）',
    'ロウスタッガード（JIS）',
    'カラムスタッガード（ANSI・分割想定）',
    'カラムスタッガード（JIS・分割想定）',
  ];
  for (const hardMax of [270, 400]) {
    const fitted = fitLabels(labels, measure, LEGEND_MAX_LABEL_WIDTH, hardMax);
    const words = [['ロウ', 'ANSI'], ['ロウ', 'JIS'], ['カラム', 'ANSI'], ['カラム', 'JIS']];
    words.forEach(([kind, size], i) => {
      assert.ok(fitted[i]!.includes(kind!) && fitted[i]!.includes(size!), `${hardMax}: ${fitted[i]}`);
    });
    assert.equal(new Set(fitted).size, 4);
    // 違いが1文字（「I」）だけ残るような省き方をしない
    assert.ok(!fitted.some((text) => text.includes('…I・')));
  }
});

test('互いに全く共有しない名前は、長くても上限で省く（区別の条件にしない）', () => {
  const fitted = fitLabels(['とても長い名前の配列その一その一その一', 'Dvorak'], measure, LEGEND_MAX_LABEL_WIDTH, 300);
  assert.ok(estimateTextWidth(fitted[0]!) <= LEGEND_MAX_LABEL_WIDTH);
  assert.equal(fitted[1], 'Dvorak');
});

test('名前が収まる幅の上限内なら、省くのは上限までで、全文が上限内なら全文を返す', () => {
  const labels = ['あ'.repeat(30), 'い'.repeat(30)];
  const fitted = fitLabels(labels, measure, LEGEND_MAX_LABEL_WIDTH, 400);
  assert.ok(fitted.every((label) => estimateTextWidth(label) <= 400));
  assert.equal(new Set(fitted).size, 2);
});
