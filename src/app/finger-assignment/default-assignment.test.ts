import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FINGER_ASSIGNMENT, JIS_FINGER_ASSIGNMENT, PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { defaultFingerAssignmentOf } from './default-assignment.ts';

const SHAPES = Object.values(PHYSICAL_SHAPES);

test('物理配列の規格から既定の割り当てを引く: ANSIは列固定の既定、JISはJIS既定', () => {
  assert.equal(SHAPES.length, 8);
  for (const shape of SHAPES) {
    const expected = shape.id.startsWith('jis-') ? JIS_FINGER_ASSIGNMENT : DEFAULT_FINGER_ASSIGNMENT;
    assert.equal(defaultFingerAssignmentOf(shape.id, SHAPES), expected, shape.id);
  }
  assert.equal(defaultFingerAssignmentOf('no-such-shape', SHAPES), DEFAULT_FINGER_ASSIGNMENT);
});
