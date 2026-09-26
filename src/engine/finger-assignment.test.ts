import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FINGER_ASSIGNMENT, JIS_FINGER_ASSIGNMENT, PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { defaultFingerAssignmentId, resolveFingerAssignment } from './finger-assignment.ts';

test('JIS系プリセット形状はJIS既定の指割り当てになる', () => {
  assert.equal(defaultFingerAssignmentId(PHYSICAL_SHAPES['jis-row-staggered']), JIS_FINGER_ASSIGNMENT.id);
  assert.equal(defaultFingerAssignmentId(PHYSICAL_SHAPES['jis-ortholinear']), JIS_FINGER_ASSIGNMENT.id);
});

test('ANSI系プリセット形状・自作形状は既定（列固定）の指割り当てになる', () => {
  assert.equal(defaultFingerAssignmentId(PHYSICAL_SHAPES['row-staggered']), DEFAULT_FINGER_ASSIGNMENT.id);
  assert.equal(
    defaultFingerAssignmentId({ ...PHYSICAL_SHAPES['row-staggered'], id: 'shape-custom' }),
    DEFAULT_FINGER_ASSIGNMENT.id,
  );
});

test('未登録のidはdefaultへfallbackする', () => {
  assert.equal(resolveFingerAssignment('no-such-id'), DEFAULT_FINGER_ASSIGNMENT);
});

test('登録済みのidはそれぞれの実体を返す', () => {
  assert.equal(resolveFingerAssignment(DEFAULT_FINGER_ASSIGNMENT.id), DEFAULT_FINGER_ASSIGNMENT);
  assert.equal(resolveFingerAssignment(JIS_FINGER_ASSIGNMENT.id), JIS_FINGER_ASSIGNMENT);
});
