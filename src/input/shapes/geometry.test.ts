import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeometry,
  columnFingerAssignment,
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  keyId,
  makeFingerAssignment,
  PHYSICAL_SHAPES,
  presetGeometryKind,
  QWERTY_OPTIMIZED_FINGER_ASSIGNMENT,
  presetGeometryStandard,
  presetGeometryTopology,
  type Finger,
  type NonThumb,
  type PhysicalShape,
} from './geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { fromKana, LAYOUT_BY_ID } from '../layouts/index.ts';

const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

const opts = { windowSize: 3, sfbHomeCost: true };
const qwerty = LAYOUT_BY_ID.get('qwerty')!;

test('既定の指割り当てでは列ごとに同じ指になる（上段・ホーム段・下段）', () => {
  const geometry = buildGeometry('row-staggered');
  for (const id of ['q', 'a', 'z']) assert.equal(geometry.keys.get(id)!.finger, 'LP');
});

test('既定のホームはASDF JKL; の座標になる', () => {
  const geometry = buildGeometry('row-staggered');
  const f = geometry.keys.get('f')!;
  const j = geometry.keys.get('j')!;
  near(geometry.homes.LI.x, f.x, 'LI home x');
  near(geometry.homes.LI.y, f.y, 'LI home y');
  near(geometry.homes.RI.x, j.x, 'RI home x');
  near(geometry.homes.RI.y, j.y, 'RI home y');
});

test('geometry.assignmentに既定の割り当てが記録される', () => {
  const geometry = buildGeometry('row-staggered');
  assert.equal(geometry.assignment, DEFAULT_FINGER_ASSIGNMENT);
  assert.equal(geometry.assignment.id, 'default');
});

test('metricsの出力に使用した指割り当てが併記される（仕様 §4.2）', () => {
  const geometry = buildGeometry('row-staggered');
  const m = computeMetrics(generateTrace('asdf', qwerty, geometry, opts), geometry);
  assert.equal(m.fingerAssignmentId, 'default');
  assert.equal(m.fingerAssignmentName, geometry.assignment.name);
});

/**
 * 小指を使わない割り当て。列0（小指列）と列9〜12（右外側の小指列）を薬指に回す。
 * ホームキー自体は変えない（薬指のホームは引き続きs / l）。
 */
function noPinkyAssignment() {
  const columnFinger: NonThumb[] = [
    'LR', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RR', 'RR', 'RR', 'RR',
  ];
  const homeColumn: Record<NonThumb, number> = {
    LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9,
  };
  // 小指が担当するのはホームキーだけにする
  const { baseFinger } = columnFingerAssignment('no-pinky', '小指を使わない', columnFinger, homeColumn);
  return makeFingerAssignment(
    'no-pinky',
    '小指を使わない',
    { ...baseFinger, a: 'LP', ';': 'RP' },
    { LP: 'a', LR: 's', LM: 'd', LI: 'f', RI: 'j', RM: 'k', RR: 'l', RP: ';' },
  );
}

test('割り当てを差し替えるとキーの担当指が変わる', () => {
  const assignment = noPinkyAssignment();
  const geometry = buildGeometry('row-staggered', assignment);
  assert.equal(geometry.keys.get('a')!.finger, 'LP');
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

test('ホームキーの割り当てを変えるとH_fの座標も連動する（仕様 §3）', () => {
  // 人差し指のホームを標準のf / jからg / hへ動かす
  const homeColumn: Record<NonThumb, number> = {
    LP: 0, LR: 1, LM: 2, LI: 4, RI: 5, RM: 7, RR: 8, RP: 9,
  };
  const columnFinger: NonThumb[] = [
    'LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP',
  ];
  const assignment = columnFingerAssignment('shifted-home', 'ホームずらし', columnFinger, homeColumn);
  const geometry = buildGeometry('row-staggered', assignment);
  const g = geometry.keys.get('g')!;
  const h = geometry.keys.get('h')!;
  near(geometry.homes.LI.x, g.x, 'LI home x');
  near(geometry.homes.LI.y, g.y, 'LI home y');
  near(geometry.homes.RI.x, h.x, 'RI home x');
  near(geometry.homes.RI.y, h.y, 'RI home y');
});

test('割り当てを変えると同指連続の数が変わりうる（測定条件は数値に付随する。仕様 §12.3）', () => {
  // 'sq' は既定ではLR→LP（異指）、no-pinkyではLR→LR（同指連続）に変わる
  const defaultGeometry = buildGeometry('row-staggered');
  const noPinkyGeometry = buildGeometry('row-staggered', noPinkyAssignment());

  const defaultMetrics = computeMetrics(generateTrace('sq', qwerty, defaultGeometry, opts), defaultGeometry);
  const noPinkyMetrics = computeMetrics(generateTrace('sq', qwerty, noPinkyGeometry, opts), noPinkyGeometry);

  assert.equal(defaultMetrics.sameFinger, 0);
  assert.equal(noPinkyMetrics.sameFinger, 1);
});

test('割り当てに無いキーでgeometryを作ろうとすると例外になる', () => {
  const incomplete = columnFingerAssignment(
    'broken',
    '不完全',
    ['LP'], // 1列分しか無い
    { LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9 },
  );
  assert.throws(() => buildGeometry('row-staggered', incomplete), /キー .* が無い/);
});

test('ホームキーが存在しない割り当ては例外になる', () => {
  const columnFinger: NonThumb[] = [
    'LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP',
  ];
  const assignment = columnFingerAssignment('broken-home', '不完全なホーム', columnFinger, {
    LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 99, // 存在しない列
  });
  assert.throws(() => buildGeometry('row-staggered', assignment), /ホームキー/);
});

// ---- 物理配列（仕様 §3・§3.1） ----

test('metricsの出力に使用した物理配列が併記される（仕様 §3）', () => {
  const geometry = buildGeometry('column-staggered');
  const m = computeMetrics(generateTrace('asdf', qwerty, geometry, opts), geometry);
  assert.equal(m.geometryId, 'column-staggered');
  assert.equal(m.geometryName, geometry.name);
});

test('GeometryKind文字列はPHYSICAL_SHAPESから解決される。直接渡しても同じ物理配列になる', () => {
  const byKind = buildGeometry('row-staggered');
  const byShape = buildGeometry(PHYSICAL_SHAPES['row-staggered']);
  assert.equal(byKind.id, byShape.id);
  near(byKind.keys.get('a')!.x, byShape.keys.get('a')!.x);
  near(byKind.homes.RT.x, byShape.homes.RT.x);
});

test('US/JIS × row/column/ortho/split-orthoの8 presetを相互変換できる', () => {
  const topologies = [
    'row-staggered',
    'column-staggered',
    'ortholinear',
    'split-ortholinear',
  ] as const;

  for (const topology of topologies) {
    const ansi = presetGeometryKind('ansi', topology);
    const jis = presetGeometryKind('jis', topology);
    assert.equal(presetGeometryStandard(ansi), 'ansi');
    assert.equal(presetGeometryStandard(jis), 'jis');
    assert.equal(presetGeometryTopology(ansi), topology);
    assert.equal(presetGeometryTopology(jis), topology);

    const ansiGeometry = buildGeometry(ansi, DEFAULT_FINGER_ASSIGNMENT);
    const jisGeometry = buildGeometry(jis, JIS_FINGER_ASSIGNMENT);
    assert.deepEqual(ansiGeometry.grid.map((row) => row.length), [12, 12, 11, 10]);
    assert.deepEqual(jisGeometry.grid.map((row) => row.length), [13, 12, 12, 11]);
  }
});

test('JIS 109 presetはANSI外の3キー位置を持つ', () => {
  const geometry = buildGeometry('jis-row-staggered', JIS_FINGER_ASSIGNMENT);
  assert.deepEqual(geometry.grid.map((row) => row.length), [13, 12, 12, 11]);
  assert.equal(geometry.keys.has('r0c12'), true);
  assert.equal(geometry.keys.has('r2c11'), true);
  assert.equal(geometry.keys.has('r3c10'), true);
});

test('QWERTY刻印の範囲を超える列はr{row}c{col} のidになる', () => {
  assert.equal(keyId(0, 0), '1');
  assert.equal(keyId(0, 12), 'r0c12');
});

test('ピッチ（pitch_mm）は物理配列ごとにカスタムできる', () => {
  const shape: PhysicalShape = { ...PHYSICAL_SHAPES.ortholinear, id: 'custom-pitch', pitchMm: 17 };
  const geometry = buildGeometry(shape);
  assert.equal(geometry.pitchMm, 17);
  const m = computeMetrics(generateTrace('h', qwerty, geometry, opts), geometry);
  near(m.totalMm, m.totalUnits * 17, 'totalMm');
});

test('段ずれ量（段ごとのxオフセット）は物理配列ごとにカスタムできる', () => {
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

test('列ごとのyオフセット（column-staggered）は物理配列ごとにカスタムできる', () => {
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

/** 10列 × 4段のコンパクトな物理配列用の割り当て。ホーム位置の考え方は既定と同じ */
function compactAssignment() {
  const columnFinger: NonThumb[] = ['LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP'];
  const homeColumn: Record<NonThumb, number> = {
    LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9,
  };
  return columnFingerAssignment('compact', 'コンパクト', columnFinger, homeColumn, [10, 10, 10, 10]);
}

test('段に置けるキー数は物理配列定義（rowWidths）から導かれる', () => {
  const shape: PhysicalShape = {
    ...PHYSICAL_SHAPES.ortholinear,
    id: 'compact-shape',
    name: 'コンパクト物理配列',
    rowWidths: [10, 10, 10, 10],
  };
  const geometry = buildGeometry(shape, compactAssignment());
  assert.equal(geometry.grid[1].length, 10);
  assert.equal(geometry.keys.has('p'), true);
  // 既定のANSI物理配列（12列）にはある右外側の列が、この10列の物理配列には無い
  assert.equal(geometry.keys.has('['), false);
  assert.equal(geometry.keys.has(']'), false);
});

test('親指キーが1つの手はそのキーが自動でホームになり、移動距離は常に0になる（仕様 §3.1）', () => {
  const geometry = buildGeometry('row-staggered');
  assert.equal(geometry.thumbs.LT.id, 'thumb-l');
  assert.equal(geometry.thumbs.RT.id, 'thumb-r');
  near(geometry.homes.RT.x, geometry.thumbs.RT.x);
  near(geometry.homes.RT.y, geometry.thumbs.RT.y);
});

/** 右手に親指キーを2つ持つ物理配列（薙刀式のセンターシフトのような構成を想定） */
function dualThumbShape(thumbHome?: Partial<Record<'LT' | 'RT', string>>): PhysicalShape {
  return {
    ...PHYSICAL_SHAPES['row-staggered'],
    id: 'dual-thumb',
    thumbs: [
      { id: 'thumb-l', finger: 'LT', col: 3.5, y: 4 },
      { id: 'space', finger: 'RT', col: 5.5, y: 4 },
      { id: 'thumb-r2', finger: 'RT', col: 6.5, y: 4 }, // ホームの1u右
    ],
    thumbHome,
  };
}

test('親指キーが手ごとに複数ある物理配列はthumbHomeを明示しないと例外になる', () => {
  assert.throws(() => buildGeometry(dualThumbShape()), /thumbHome/);
});

test('thumbHomeを指定すると複数の親指キーを持つ物理配列を構築できる', () => {
  const geometry = buildGeometry(dualThumbShape({ RT: 'space' }));
  assert.equal(geometry.thumbs.RT.id, 'space');
  near(geometry.homes.RT.x, geometry.keys.get('space')!.x);
});

test('複数ある親指キーの間の移動は他の指と同じ規則で距離が計上される（仕様 §3.1）', () => {
  const geometry = buildGeometry(dualThumbShape({ RT: 'space' }));
  const l = fromKana('t', 't', { x: [['thumb-r2']] });
  const t = generateTrace('x', l, geometry, opts);
  // ホーム（space）からthumb-r2（1u右）までの初回移動
  near(t.strokes[0].distance, 1, 'thumb-r2まで1u');
});

test('split-ortholinearはortholinearに分割だけを足した座標になり、同じ手の中の距離は変わらない', () => {
  for (const [plain, split, assignment] of [
    ['ortholinear', 'split-ortholinear', DEFAULT_FINGER_ASSIGNMENT],
    ['jis-ortholinear', 'jis-split-ortholinear', JIS_FINGER_ASSIGNMENT],
  ] as const) {
    const a = buildGeometry(plain, assignment);
    const b = buildGeometry(split, assignment);
    assert.equal(b.pitchMm, a.pitchMm);
    for (const [id, key] of a.keys) {
      const moved = b.keys.get(id)!;
      near(moved.y, key.y, `${id}.y`);
      assert.equal(moved.finger, key.finger);
      // 列5以降（右手側）だけが分割の間隔2uの分だけ右へ動く
      const isRight = key.finger.startsWith('R');
      near(moved.x, key.x + (isRight ? 2 : 0), `${id}.x`);
    }
    // 左手どうし・右手どうしのキー間隔は変わらない
    const dist = (g: typeof a, p: string, q: string) =>
      Math.hypot(g.keys.get(p)!.x - g.keys.get(q)!.x, g.keys.get(p)!.y - g.keys.get(q)!.y);
    near(dist(b, 'f', 'g'), dist(a, 'f', 'g'));
    near(dist(b, 'j', 'k'), dist(a, 'j', 'k'));
    // 左右の境目（列4と列5）だけが2u開く
    near(b.keys.get('h')!.x - b.keys.get('g')!.x, 3);
  }
});

test('split-ortholinearの既定の指割り当て（列固定）は分割の位置で左右に分かれ、親指は分割に従って動く', () => {
  for (const [kind, assignment] of [
    ['split-ortholinear', DEFAULT_FINGER_ASSIGNMENT],
    ['jis-split-ortholinear', JIS_FINGER_ASSIGNMENT],
  ] as const) {
    const g = buildGeometry(kind, assignment);
    const split = PHYSICAL_SHAPES[kind].splitAt!;
    for (const row of g.grid) {
      for (const key of row) {
        assert.equal(key.finger.startsWith('L'), key.col < split, `${key.id}`);
      }
    }
    near(g.thumbs.LT.x, 3.5);
    near(g.thumbs.RT.x, 5.5 + 2);
    near(g.thumbs.LT.y, g.thumbs.RT.y);
    // 左右のホームの間隔は、分割しない場合より分割の間隔の分だけ広い
    const plain = buildGeometry(kind.replace('split-', '') as 'ortholinear', assignment);
    near(g.homes.RI.x - g.homes.LI.x, plain.homes.RI.x - plain.homes.LI.x + 2);
  }
});

/** 基本の指は既定の列固定のまま、指定したキーだけ追加の担当を足した割り当て */
function withExtra(
  extra: Record<string, readonly Finger[]>,
  base: Record<string, NonThumb> = DEFAULT_FINGER_ASSIGNMENT.baseFinger,
) {
  return makeFingerAssignment('extra', 'extra', base, DEFAULT_FINGER_ASSIGNMENT.homeKey, extra);
}

test('分割する物理配列では、キーと反対側の手の追加の担当（親指を含む）が候補から外れる', () => {
  const assignment = withExtra({
    b: ['LM', 'RI', 'RT'],
    h: ['LI', 'RM'],
    y: ['LI'],
  });
  const jisAssignment = withExtra({
    b: ['LM', 'RI', 'RT'],
    h: ['LI', 'RM'],
    y: ['LI'],
  }, JIS_FINGER_ASSIGNMENT.baseFinger);
  for (const shape of ['split-ortholinear', 'column-staggered', 'jis-split-ortholinear', 'jis-column-staggered'] as const) {
    const geometry = buildGeometry(shape, shape.startsWith('jis') ? jisAssignment : assignment);
    assert.deepEqual(geometry.fingerCandidates.get('b'), ['LM', 'LI'], `${shape} b`);
    assert.deepEqual(geometry.fingerCandidates.get('h'), ['RI', 'RM'], `${shape} h`);
    assert.deepEqual(geometry.fingerCandidates.get('y'), ['RI'], `${shape} y`);
  }
});

test('分割する物理配列でも、同じ側の手の追加の担当は残る', () => {
  const geometry = buildGeometry('split-ortholinear', withExtra({ t: ['LM'], j: ['RM'] }));
  assert.deepEqual(geometry.fingerCandidates.get('t'), ['LM', 'LI']);
  assert.deepEqual(geometry.fingerCandidates.get('j'), ['RI', 'RM']);
});

test('基本の指がキーと反対側の手にあっても、分割する物理配列で基本の指は候補に残る', () => {
  const assignment = withExtra({ y: ['RI'] }, { ...DEFAULT_FINGER_ASSIGNMENT.baseFinger, y: 'LI' });
  const geometry = buildGeometry('split-ortholinear', assignment);
  assert.equal(geometry.keys.get('y')!.finger, 'LI');
  // 反対側の手の基本の指（LI）は残り、同じ側の追加の担当（RI）も残る
  assert.deepEqual(geometry.fingerCandidates.get('y'), ['LI', 'RI']);
});

test('分割しない物理配列と、分割の間隔が0の物理配列では、反対側の追加の担当も候補に残る', () => {
  const assignment = withExtra({ b: ['LM', 'RI', 'RT'], h: ['LI', 'RM'] });
  const rowStaggered = buildGeometry('row-staggered', assignment);
  assert.deepEqual(rowStaggered.fingerCandidates.get('b'), ['LM', 'LI', 'RT', 'RI']);
  assert.deepEqual(rowStaggered.fingerCandidates.get('h'), ['LI', 'RI', 'RM']);
  const noGap = buildGeometry({ ...PHYSICAL_SHAPES['split-ortholinear'], splitGap: 0 }, assignment);
  assert.deepEqual(noGap.fingerCandidates.get('b'), ['LM', 'LI', 'RT', 'RI']);
});

test('組み込みのQWERTY最適化で、分割する物理配列は反対側の手の指を選ばない', () => {
  const geometry = buildGeometry('split-ortholinear', QWERTY_OPTIMIZED_FINGER_ASSIGNMENT);
  for (const [id, candidates] of geometry.fingerCandidates) {
    const key = geometry.keys.get(id)!;
    if (key.row === 4 || id.startsWith('shift')) continue;
    const side = key.col >= 5 ? 'R' : 'L';
    for (const finger of candidates) assert.ok(finger.startsWith(side), `${id}: ${finger}`);
  }
  const trace = generateTrace('きょう', qwerty, geometry, opts);
  for (const stroke of trace.strokes) for (const press of stroke.presses) for (const key of press.keys) {
    assert.ok(press.finger.startsWith(key.col >= 5 ? 'R' : 'L'), `${key.id}: ${press.finger}`);
  }
});
