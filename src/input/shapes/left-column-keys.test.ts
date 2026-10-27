import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANGLE_MOD_FINGER_ASSIGNMENT,
  ANGLE_MOD_JIS_FINGER_ASSIGNMENT,
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  LEFT_COLUMN_KEYS,
  PHYSICAL_SHAPES,
  presetGeometryStandard,
  presetGeometryTopology,
  QWERTY_OPTIMIZED_FINGER_ASSIGNMENT,
  QWERTY_OPTIMIZED_JIS_FINGER_ASSIGNMENT,
  type FingerAssignment,
  type PresetGeometryKind,
} from './geometry.ts';
import { completeLeftColumnKeys } from './user-finger-assignments.ts';
import { fingerAssignmentConsistencyProblem } from './user-finger-assignments.ts';
import { generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { LAYOUT_BY_ID } from '../layouts/index.ts';

const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);

const EXPECTED: Record<string, { x: number; y: number; width?: number }[]> = {
  'row-staggered': [
    { x: -1, y: 0 },
    { x: -0.75, y: 1, width: 1.5 },
    { x: -0.625, y: 2, width: 1.75 },
  ],
  ortholinear: [
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: -1, y: 2 },
  ],
  'split-ortholinear': [
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: -1, y: 2 },
  ],
  'column-staggered': [
    { x: -1, y: 0.34 },
    { x: -1, y: 1.34 },
    { x: -1, y: 2.34 },
  ],
};

for (const kind of Object.keys(PHYSICAL_SHAPES) as PresetGeometryKind[]) {
  test(`${kind}: 左端の列の3つのキーが仕様の位置にあり、組み込みの指の割り当てでは左の小指が担当する`, () => {
    const jis = presetGeometryStandard(kind) === 'jis';
    const assignments = jis
      ? [JIS_FINGER_ASSIGNMENT, QWERTY_OPTIMIZED_JIS_FINGER_ASSIGNMENT, ANGLE_MOD_JIS_FINGER_ASSIGNMENT]
      : [DEFAULT_FINGER_ASSIGNMENT, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, ANGLE_MOD_FINGER_ASSIGNMENT];
    const expected = EXPECTED[presetGeometryTopology(kind)]!;
    for (const assignment of assignments) {
      const geometry = buildGeometry(kind, assignment);
      LEFT_COLUMN_KEYS.forEach((id, index) => {
        const key = geometry.keys.get(id);
        assert.ok(key, `${assignment.id}の${id}`);
        near(key.x, expected[index]!.x, `${id}のx`);
        near(key.y, expected[index]!.y, `${id}のy`);
        assert.equal(key.width, expected[index]!.width, `${id}の幅`);
        assert.equal(key.finger, 'LP');
        assert.deepEqual(geometry.fingerCandidates.get(id), ['LP']);
        assert.equal(
          geometry.grid.flat().some((cell) => cell.id === id),
          false,
          `${id}はgridに入らない`,
        );
      });
    }
  });
}

test('row-staggered: 左端の列のキーと左Shiftは、表示の左端が段によらず揃い、右端が段の最初の文字キーに接する', () => {
  for (const kind of ['row-staggered', 'jis-row-staggered'] as const) {
    const geometry = buildGeometry(kind, kind === 'row-staggered' ? undefined : JIS_FINGER_ASSIGNMENT);
    const rows = [
      ['backquote', 0],
      ['tab', 1],
      ['caps-lock', 2],
      ['shift-l', 3],
    ] as const;
    for (const [id, row] of rows) {
      const key = geometry.keys.get(id)!;
      const width = key.width ?? 1;
      const left = key.x + 0.5 - width / 2;
      near(left, -1, `${kind}の${id}の左端`);
      near(left + width, geometry.grid[row]![0]!.x, `${kind}の${id}の右端は列0の左端`);
    }
  }
});

test('3つのキーを使わない配列の距離・指ごとの距離は、3つのキーを持たない物理配列と同じ', () => {
  const qwerty = LAYOUT_BY_ID.get('qwerty')!;
  const opts = { windowSize: 3, sfbHomeCost: true };
  const withKeys = buildGeometry('row-staggered');
  const without = buildGeometry({ ...PHYSICAL_SHAPES['row-staggered'], extraKeys: [] });
  const sample = 'the quick brown fox jumps over the lazy dog';
  const a = computeMetrics(generateTrace(sample, qwerty, withKeys, opts), withKeys);
  const b = computeMetrics(generateTrace(sample, qwerty, without, opts), without);
  assert.ok(a.totalUnits > 0);
  assert.equal(a.totalUnits, b.totalUnits);
  assert.deepEqual(a.perFinger, b.perFinger);
});

/** 3つのキーを持たない、旧い形の割り当て */
function withoutLeftColumnKeys(): FingerAssignment {
  const old = structuredClone(DEFAULT_FINGER_ASSIGNMENT);
  for (const key of LEFT_COLUMN_KEYS) {
    delete old.baseFinger[key];
    old.fingerKeys.LP = old.fingerKeys.LP.filter((candidate) => candidate !== key);
  }
  return { ...old, id: 'finger-old', name: '旧' };
}

test('3つのキーを持たない割り当ては、組み込みの物理配列を構築できない', () => {
  assert.throws(() => buildGeometry('row-staggered', withoutLeftColumnKeys()), /backquote/);
});

test('completeLeftColumnKeys: 持たないキーだけを左の小指で補い、補った割り当てで物理配列を構築できる', () => {
  const [completed] = completeLeftColumnKeys([withoutLeftColumnKeys()]);
  for (const key of LEFT_COLUMN_KEYS) {
    assert.equal(completed!.baseFinger[key], 'LP');
    assert.ok(completed!.fingerKeys.LP.includes(key));
  }
  assert.equal(fingerAssignmentConsistencyProblem(completed!), undefined);
  for (const kind of Object.keys(PHYSICAL_SHAPES) as PresetGeometryKind[]) {
    if (presetGeometryStandard(kind) === 'jis') continue;
    assert.doesNotThrow(() => buildGeometry(kind, completed), kind);
  }
});

test('completeLeftColumnKeys: 持っているキーの指は変えず、持たないキーだけを補う', () => {
  const partial = withoutLeftColumnKeys();
  partial.baseFinger.tab = 'RP';
  partial.fingerKeys.RP = [...partial.fingerKeys.RP, 'tab'];
  const [completed] = completeLeftColumnKeys([partial]);
  assert.equal(completed!.baseFinger.tab, 'RP');
  assert.equal(completed!.fingerKeys.LP.includes('tab'), false);
  assert.equal(completed!.baseFinger.backquote, 'LP');
  assert.equal(completed!.baseFinger['caps-lock'], 'LP');
});

test('completeLeftColumnKeys: 補うものが無ければ同じ配列を返す', () => {
  const list = [{ ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-x', name: 'x' }];
  assert.equal(completeLeftColumnKeys(list), list);
});
