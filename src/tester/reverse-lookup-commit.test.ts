import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { longestReverseLookupRoute, reverseLookup, reverseLookupGuideActionHighlightKeys, reverseLookupGuideActions } from './reverse-lookup.ts';

test('確定の打鍵が要る継ぎ目では、次のstepの先頭に右親指のキーのactionが入り、案内が右親指のキーを示す', () => {
  const yumi = LAYOUT_BY_ID.get('yumi');
  assert.ok(yumi !== undefined);
  const withCommit = longestReverseLookupRoute(reverseLookup(yumi, 'くゃ', 3));
  assert.ok(withCommit !== undefined);
  const actions = reverseLookupGuideActions(withCommit);
  assert.deepEqual(
    actions.map((action) => action.keys),
    [['n'], ['thumb-r'], ['b']],
  );
  assert.equal(withCommit.steps[1].commitBefore, true);
  assert.deepEqual(
    actions.map((action) => reverseLookupGuideActionHighlightKeys(yumi, action)),
    [['n'], ['thumb-r'], ['b']],
  );
});

test('確定の打鍵が要らない並びには、右親指のキーのactionは入らない', () => {
  const yumi = LAYOUT_BY_ID.get('yumi');
  assert.ok(yumi !== undefined);
  const plain = longestReverseLookupRoute(reverseLookup(yumi, 'きゃく', 3));
  assert.ok(plain !== undefined);
  assert.ok(plain.steps.every((step) => step.commitBefore === undefined));
});
