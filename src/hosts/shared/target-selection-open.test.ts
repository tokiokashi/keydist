import assert from 'node:assert/strict';
import test from 'node:test';
import { claimTargetSelection, openTargetSelectionId, releaseTargetSelection, subscribeTargetSelection } from './target-selection-open.ts';

test('開いている選択は1つだけで、別の選択が押さえると購読者へ知らせる', () => {
  const seen: (string | undefined)[] = [];
  const unsubscribe = subscribeTargetSelection(() => seen.push(openTargetSelectionId()));
  assert.equal(openTargetSelectionId(), undefined);
  claimTargetSelection('a');
  claimTargetSelection('a');
  claimTargetSelection('b');
  assert.deepEqual(seen, ['a', 'b']);
  // 先に開いていた選択の後始末は、今開いている選択を外さない
  releaseTargetSelection('a');
  assert.equal(openTargetSelectionId(), 'b');
  releaseTargetSelection('b');
  assert.equal(openTargetSelectionId(), undefined);
  unsubscribe();
  claimTargetSelection('c');
  assert.deepEqual(seen, ['a', 'b', undefined]);
  releaseTargetSelection('c');
});
