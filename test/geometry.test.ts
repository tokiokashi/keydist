import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeometry,
  columnFingerAssignment,
  DEFAULT_FINGER_ASSIGNMENT,
  keyId,
  PHYSICAL_SHAPES,
  type Finger,
  type NonThumb,
  type PhysicalShape,
} from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUT_BY_ID, type Layout } from '../src/layouts/index.ts';

const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

const opts = { windowSize: 3, sfbHomeCost: true };
const qwerty = LAYOUT_BY_ID.get('qwerty')!;

test('既定の指割り当てでは列ごとに同じ指になる（上段・ホーム段・下段）', () => {
  const geometry = buildGeometry('row-staggered');
  for (const id of ['q', 'a', 'z']) assert.equal(geometry.keys.get(id)!.finger, 'LP');
});

test('既定のホームは ASDF JKL; の座標になる', () => {
  const geometry = buildGeometry('row-staggered');
  const f = geometry.keys.get('f')!;
  const j = geometry.keys.get('j')!;
  near(geometry.homes.LI.x, f.x, 'LI home x');
  near(geometry.homes.LI.y, f.y, 'LI home y');
  near(geometry.homes.RI.x, j.x, 'RI home x');
  near(geometry.homes.RI.y, j.y, 'RI home y');
});

test('geometry.assignment に既定の割り当てが記録される', () => {
  const geometry = buildGeometry('row-staggered');
  assert.equal(geometry.assignment, DEFAULT_FINGER_ASSIGNMENT);
  assert.equal(geometry.assignment.id, 'default');
});

test('metrics の出力に使用した指割り当てが併記される（仕様 §4.2）', () => {
  const geometry = buildGeometry('row-staggered');
  const m = computeMetrics(evaluate('asdf', qwerty, geometry, opts), geometry);
  assert.equal(m.fingerAssignmentId, 'default');
  assert.equal(m.fingerAssignmentName, geometry.assignment.name);
});

/**
 * 小指を使わない割り当て。列 0（小指列）と列 9〜12（右外側の小指列）を薬指に回す。
 * ホームキー自体は変えない（薬指のホームは引き続き s / l）。
 */
function noPinkyAssignment() {
  const columnFinger: Finger[] = [
    'LR', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RR', 'RR', 'RR', 'RR',
  ];
  const homeColumn: Record<NonThumb, number> = {
    LP: 1, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 8,
  };
  return columnFingerAssignment('no-pinky', '小指を使わない', columnFinger, homeColumn);
}

test('割り当てを差し替えるとキーの担当指が変わる', () => {
  const assignment = noPinkyAssignment();
  const geometry = buildGeometry('row-staggered', assignment);
  assert.equal(geometry.keys.get('a')!.finger, 'LR');
  assert.equal(geometry.keys.get('q')!.finger, 'LR');
  // 右側の外側列（小指の既定領域）も薬指に回っている
  assert.equal(geometry.keys.get('p')!.finger, 'RR');
});

test('ホームキーを変えなければ、列の再割り当てをしてもその指のホーム位置は動かない', () => {
  const assignment = noPinkyAssignment();
  const geometry = buildGeometry('row-staggered', assignment);
  const s = geometry.keys.get('s')!;
  near(geometry.homes.LR.x, s.x, 'LR home x');
  near(geometry.homes.LR.y, s.y, 'LR home y');
});

test('ホームキーの割り当てを変えると H_f の座標も連動する（仕様 §3）', () => {
  // 人差し指のホームを標準の f / j から d / k へ動かす
  const homeColumn: Record<NonThumb, number> = {
    LP: 0, LR: 1, LM: 2, LI: 2, RI: 7, RM: 7, RR: 8, RP: 9,
  };
  const columnFinger: Finger[] = [
    'LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP',
  ];
  const assignment = columnFingerAssignment('shifted-home', 'ホームずらし', columnFinger, homeColumn);
  const geometry = buildGeometry('row-staggered', assignment);
  const d = geometry.keys.get('d')!;
  const k = geometry.keys.get('k')!;
  near(geometry.homes.LI.x, d.x, 'LI home x');
  near(geometry.homes.LI.y, d.y, 'LI home y');
  near(geometry.homes.RI.x, k.x, 'RI home x');
  near(geometry.homes.RI.y, k.y, 'RI home y');
});

test('割り当てを変えると同指連続の数が変わりうる（配列間比較は同じ割り当ての中でのみ成立する）', () => {
  // 'aq' は既定では LP→LP（同指連続）。no-pinky では LR→LR で依然として同指連続だが、
  // 'as' は既定では LP→LR（異指）、no-pinky では LR→LR（同指連続）に変わる
  const defaultGeometry = buildGeometry('row-staggered');
  const noPinkyGeometry = buildGeometry('row-staggered', noPinkyAssignment());

  const defaultMetrics = computeMetrics(evaluate('as', qwerty, defaultGeometry, opts), defaultGeometry);
  const noPinkyMetrics = computeMetrics(evaluate('as', qwerty, noPinkyGeometry, opts), noPinkyGeometry);

  assert.equal(defaultMetrics.sameFinger, 0);
  assert.equal(noPinkyMetrics.sameFinger, 1);
});

test('割り当てに無いキーで geometry を作ろうとすると例外になる', () => {
  const incomplete = columnFingerAssignment(
    'broken',
    '不完全',
    ['LP'], // 1 列分しか無い
    { LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9 },
  );
  assert.throws(() => buildGeometry('row-staggered', incomplete), /キー .* が無い/);
});

test('ホームキーが存在しない割り当ては例外になる', () => {
  const columnFinger: Finger[] = [
    'LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP',
  ];
  const assignment = columnFingerAssignment('broken-home', '不完全なホーム', columnFinger, {
    LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 99, // 存在しない列
  });
  assert.throws(() => buildGeometry('row-staggered', assignment), /ホームキー/);
});

// ---- 物理形状（issue #15。仕様 §3・§3.1） ----

test('metrics の出力に使用した物理形状が併記される（仕様 §3）', () => {
  const geometry = buildGeometry('column-staggered');
  const m = computeMetrics(evaluate('asdf', qwerty, geometry, opts), geometry);
  assert.equal(m.geometryId, 'column-staggered');
  assert.equal(m.geometryName, geometry.name);
});

test('GeometryKind 文字列は PHYSICAL_SHAPES から解決される。直接渡しても同じ形状になる', () => {
  const byKind = buildGeometry('row-staggered');
  const byShape = buildGeometry(PHYSICAL_SHAPES['row-staggered']);
  assert.equal(byKind.id, byShape.id);
  near(byKind.keys.get('a')!.x, byShape.keys.get('a')!.x);
  near(byKind.homes.RT.x, byShape.homes.RT.x);
});

test('QWERTY 刻印の範囲を超える列は r{row}c{col} の id になる', () => {
  assert.equal(keyId(0, 0), '1');
  assert.equal(keyId(0, 12), 'r0c12');
});

test('ピッチ（pitch_mm）は形状ごとにカスタムできる', () => {
  const shape: PhysicalShape = { ...PHYSICAL_SHAPES.ortholinear, id: 'custom-pitch', pitchMm: 17 };
  const geometry = buildGeometry(shape);
  assert.equal(geometry.pitchMm, 17);
  const m = computeMetrics(evaluate('h', qwerty, geometry, opts), geometry);
  near(m.totalMm, m.totalUnits * 17, 'totalMm');
});

test('段ずれ量（段ごとの x オフセット）は形状ごとにカスタムできる', () => {
  const shape: PhysicalShape = {
    ...PHYSICAL_SHAPES.ortholinear,
    id: 'custom-row-stagger',
    rowStagger: [0, 1, 2, 3],
  };
  const geometry = buildGeometry(shape);
  near(geometry.grid[0][0].x, 0, 'row0');
  near(geometry.grid[1][0].x, 1, 'row1');
  near(geometry.grid[2][0].x, 2, 'row2');
  near(geometry.grid[3][0].x, 3, 'row3');
});

test('列ごとの y オフセット（column-staggered）は形状ごとにカスタムできる', () => {
  const shape: PhysicalShape = {
    ...PHYSICAL_SHAPES.ortholinear,
    id: 'custom-column-stagger',
    columnStagger: [0, 0.5],
  };
  const geometry = buildGeometry(shape);
  near(geometry.grid[0][0].y, 0, 'col0');
  near(geometry.grid[0][1].y, 0.5, 'col1');
  // 配列の長さを超える列は最後の値を使う
  near(geometry.grid[0][5].y, 0.5, 'col5（はみ出し）');
});

/** 10 列 × 4 段のコンパクトな形状用の割り当て。ホーム位置の考え方は既定と同じ */
function compactAssignment() {
  const columnFinger: Finger[] = ['LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP'];
  const homeColumn: Record<NonThumb, number> = {
    LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9,
  };
  return columnFingerAssignment('compact', 'コンパクト', columnFinger, homeColumn, [10, 10, 10, 10]);
}

test('段に置けるキー数は形状定義（rowWidths）から導かれる', () => {
  const shape: PhysicalShape = {
    ...PHYSICAL_SHAPES.ortholinear,
    id: 'compact-shape',
    name: 'コンパクト形状',
    rowWidths: [10, 10, 10, 10],
  };
  const geometry = buildGeometry(shape, compactAssignment());
  assert.equal(geometry.grid[1].length, 10);
  assert.equal(geometry.keys.has('p'), true);
  // 既定の ANSI 形状（12 列）にはある右外側の列が、この10列の形状には無い
  assert.equal(geometry.keys.has('['), false);
  assert.equal(geometry.keys.has(']'), false);
});

test('親指キーが1つの手はそのキーが自動でホームになり、移動距離は常に0になる（仕様 §3.1）', () => {
  const geometry = buildGeometry('row-staggered');
  assert.equal(geometry.thumbs.LT.id, 'thumb-l');
  assert.equal(geometry.thumbs.RT.id, 'space');
  near(geometry.homes.RT.x, geometry.thumbs.RT.x);
  near(geometry.homes.RT.y, geometry.thumbs.RT.y);
});

/** 右手に親指キーを2つ持つ形状（薙刀式のセンターシフトのような構成を想定） */
function dualThumbShape(thumbHome?: Partial<Record<'LT' | 'RT', string>>): PhysicalShape {
  return {
    ...PHYSICAL_SHAPES['row-staggered'],
    id: 'dual-thumb',
    thumbs: [
      { id: 'thumb-l', finger: 'LT', col: 3.5, y: 4 },
      { id: 'space', finger: 'RT', col: 5.5, y: 4 },
      { id: 'thumb-r2', finger: 'RT', col: 6.5, y: 4 }, // ホームの 1u 右
    ],
    thumbHome,
  };
}

test('親指キーが手ごとに複数ある形状は thumbHome を明示しないと例外になる', () => {
  assert.throws(() => buildGeometry(dualThumbShape()), /thumbHome/);
});

test('thumbHome を指定すると複数の親指キーを持つ形状を構築できる', () => {
  const geometry = buildGeometry(dualThumbShape({ RT: 'space' }));
  assert.equal(geometry.thumbs.RT.id, 'space');
  near(geometry.homes.RT.x, geometry.keys.get('space')!.x);
});

test('複数ある親指キーの間の移動は他の指と同じ規則で距離が計上される（仕様 §3.1）', () => {
  const geometry = buildGeometry(dualThumbShape({ RT: 'space' }));
  const l: Layout = {
    id: 't', name: 't',
    map: new Map([['x', [['thumb-r2']]]]),
    legends: new Map(),
  };
  const t = evaluate('x', l, geometry, opts);
  // ホーム（space）から thumb-r2（1u 右）までの初回移動
  near(t.strokes[0].distance, 1, 'thumb-r2 まで 1u');
});
