import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConditions } from '../src/condition-resolution.ts';
import { DEFAULT_CONDITION_DEFAULTS } from '../src/ui-state.ts';

test('配列別条件は既定値へ部分的に重なる', () => {
  const resolved = resolveConditions(DEFAULT_CONDITION_DEFAULTS, {
    geometry: 'ortholinear',
    windowSize: 7,
  });

  assert.equal(resolved.geometry, 'ortholinear');
  assert.deepEqual(resolved.options, {
    windowSize: 7,
    sfbHomeCost: true,
    preferOppositeThumb: false,
  });
});

test('配列別条件が空なら既定値と同じになる', () => {
  assert.deepEqual(
    resolveConditions(DEFAULT_CONDITION_DEFAULTS, undefined),
    resolveConditions(DEFAULT_CONDITION_DEFAULTS, {}),
  );
});
