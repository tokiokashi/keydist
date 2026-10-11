import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import { JIS_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { initialSingleTargetSelection } from '#engine/single-target-selection.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import { initialPersonalSpeedSelection, personalSpeedCatalog } from './personal-speed-setup.ts';

const ROWS: UserLayout['rows'] = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
const USER_LAYOUT: UserLayout = { id: 'user-mine', name: '自作の配列', rows: ROWS, romaji: 'kunrei' };
const USER_ASSIGNMENT: FingerAssignment = { ...JIS_FINGER_ASSIGNMENT, id: 'user-assignment', name: '自作の運指' };

const BASE = { userLayouts: [USER_LAYOUT], userRomajiRules: [], fingerAssignments: [USER_ASSIGNMENT] };
const CATALOG = personalSpeedCatalog(BASE);

function overridesWith(shapeId?: string, fingerAssignmentId?: string): SettingsCascadeOverrides {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [item, value] of [['defaultShapeId', shapeId], ['fingerAssignmentId', fingerAssignmentId]] as const) {
    if (value === undefined) continue;
    const written = setSettingsOverride(overrides, { kind: 'global' }, item, value);
    assert.ok(written.ok);
    overrides = written.overrides;
  }
  return overrides;
}

function assets(overrides: SettingsCascadeOverrides, single = initialSingleTargetSelection()) {
  return { singleTargetSelection: single, setupLibrary: { setups: [], overrides } };
}

test('測るキーの候補は、組み込みに自作の配列と指の割り当てを足す', () => {
  assert.ok(CATALOG.layouts.some((layout) => layout.id === 'qwerty'));
  assert.ok(CATALOG.layouts.some((layout) => layout.id === 'user-mine'));
  assert.equal(CATALOG.shapes.length, 8);
  const assignmentIds = CATALOG.fingerAssignments.map((assignment) => assignment.id);
  assert.ok(assignmentIds.includes('user-assignment'));
  assert.ok(assignmentIds.length >= 3);
});

test('何も選んでいなければ、QWERTYと既定の物理配列・指の割り当てで開く', () => {
  const selection = initialPersonalSpeedSelection(assets(overridesWith()), CATALOG);
  assert.deepEqual(selection, { layoutId: 'qwerty', shapeId: 'row-staggered', fingerAssignmentId: 'default' });
});

test('配列はSingleの対象、物理配列と指の割り当ては条件の全体の値で開く', () => {
  const selection = initialPersonalSpeedSelection(
    assets(overridesWith('column-staggered', 'user-assignment'), { target: { kind: 'layout', layoutId: 'user-mine' } }),
    CATALOG,
  );
  assert.deepEqual(selection, { layoutId: 'user-mine', shapeId: 'column-staggered', fingerAssignmentId: 'user-assignment' });
});

test('指の割り当てを上書きしていなければ、物理配列の既定の指の割り当てで開く', () => {
  const selection = initialPersonalSpeedSelection(assets(overridesWith('jis-row-staggered')), CATALOG);
  assert.equal(selection.shapeId, 'jis-row-staggered');
  assert.equal(selection.fingerAssignmentId, JIS_FINGER_ASSIGNMENT.id);
});

test('Setupを対象にしていれば、そのSetupの配列で開く', () => {
  const setup = { id: 's1', number: 1, layoutId: 'user-mine', shapeId: 'ortholinear' };
  const selection = initialPersonalSpeedSelection(
    {
      singleTargetSelection: { target: { kind: 'setup', setupId: 's1' } },
      setupLibrary: { setups: [setup], overrides: overridesWith() },
    },
    CATALOG,
  );
  assert.equal(selection.layoutId, 'user-mine');
  // 物理配列はSetupのものではなく、条件の全体の値
  assert.equal(selection.shapeId, 'row-staggered');
});

test('候補に無い配列・指の割り当てを指していれば、既定に戻す', () => {
  const selection = initialPersonalSpeedSelection(
    assets(overridesWith('row-staggered', 'deleted-assignment'), { target: { kind: 'layout', layoutId: 'deleted-layout' } }),
    CATALOG,
  );
  assert.deepEqual(selection, { layoutId: 'qwerty', shapeId: 'row-staggered', fingerAssignmentId: 'default' });
});
