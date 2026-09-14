import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeometry,
  columnFingerAssignment,
  DEFAULT_FINGER_ASSIGNMENT,
  type Finger,
  type NonThumb,
} from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';

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
