import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FINGER_ASSIGNMENT, JIS_FINGER_ASSIGNMENT, PHYSICAL_SHAPES, type FingerAssignment } from '#input/shapes/geometry.ts';
import { defaultFingerAssignmentId, resolveFingerAssignment } from './finger-assignment.ts';

test('JIS系プリセット物理配列はJIS既定の指割り当てになる', () => {
  assert.equal(defaultFingerAssignmentId(PHYSICAL_SHAPES['jis-row-staggered']), JIS_FINGER_ASSIGNMENT.id);
  assert.equal(defaultFingerAssignmentId(PHYSICAL_SHAPES['jis-ortholinear']), JIS_FINGER_ASSIGNMENT.id);
});

test('ANSI系プリセット物理配列・自作物理配列は既定（列固定）の指割り当てになる', () => {
  assert.equal(defaultFingerAssignmentId(PHYSICAL_SHAPES['row-staggered']), DEFAULT_FINGER_ASSIGNMENT.id);
  assert.equal(
    defaultFingerAssignmentId({ ...PHYSICAL_SHAPES['row-staggered'], id: 'shape-custom' }),
    DEFAULT_FINGER_ASSIGNMENT.id,
  );
});

test('未登録のidはdefaultへfallbackし、診断を返す', () => {
  const result = resolveFingerAssignment('no-such-id');
  assert.equal(result.assignment, DEFAULT_FINGER_ASSIGNMENT);
  assert.equal(result.diagnostic?.kind, 'invalid-fallback');
});

test('登録済みのidはそれぞれの実体を返し、診断は無い', () => {
  assert.deepEqual(resolveFingerAssignment(DEFAULT_FINGER_ASSIGNMENT.id), { assignment: DEFAULT_FINGER_ASSIGNMENT });
  assert.deepEqual(resolveFingerAssignment(JIS_FINGER_ASSIGNMENT.id), { assignment: JIS_FINGER_ASSIGNMENT });
});

test('自作の指割り当ては手持ち（customAssignments）から見つかれば診断なしで返す', () => {
  const custom: FingerAssignment = { ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-abc', name: '自作' };
  const catalog = new Map([[custom.id, custom]]);

  const found = resolveFingerAssignment(custom.id, catalog);
  assert.equal(found.assignment, custom);
  assert.equal(found.diagnostic, undefined);
});

test('自作の手持ちにも組み込みにも無いidはfallback引数へ戻り、診断を持つ', () => {
  const result = resolveFingerAssignment('finger-no-such', new Map(), JIS_FINGER_ASSIGNMENT);
  assert.equal(result.assignment, JIS_FINGER_ASSIGNMENT);
  assert.equal(result.diagnostic?.kind, 'invalid-fallback');
});
