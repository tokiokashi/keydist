import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planSemanticInputActions,
  planSemanticInputSequenceActions,
  type SemanticInput,
} from '../src/core/semantic-input/index.ts';
import { resolveKeyId } from '../src/geometry.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';

const input = (
  physicalKeys: readonly string[],
  requirements: SemanticInput['requirements'],
): SemanticInput => ({
  output: 'x',
  physicalKeys,
  requirements,
  capabilities: [],
  layerId: 'single',
  roles: [],
  faceMemberships: [],
});

const actionKeys = (semantic: SemanticInput): readonly (readonly string[])[] =>
  planSemanticInputActions(semantic).map((action) => action.keys);

test('Requirementなしは全physicalKeysを1 actionにする', () => {
  assert.deepEqual(
    actionKeys(input(['a', 'd'], [])),
    [['a', 'd']],
  );
});

test('overlapは1 actionへまとめる', () => {
  assert.deepEqual(
    actionKeys(input(['d', 'h'], [
      { kind: 'overlap', keys: ['d', 'h'] },
    ])),
    [['d', 'h']],
  );
});

test('prefix型orderはbefore / afterを別actionへする', () => {
  assert.deepEqual(
    actionKeys(input(['d', 'h'], [
      { kind: 'order', before: ['d'], after: ['h'] },
    ])),
    [['d'], ['h']],
  );
});

test('suffix型orderは逆順のaction列になる', () => {
  assert.deepEqual(
    actionKeys(input(['d', 'h'], [
      { kind: 'order', before: ['h'], after: ['d'] },
    ])),
    [['h'], ['d']],
  );
});

test('multi-trigger orderは同一topological levelを1 actionへまとめる', () => {
  assert.deepEqual(
    actionKeys(input(['d', 'j', 'k'], [
      { kind: 'order', before: ['d', 'k'], after: ['j'] },
    ])),
    [['d', 'k'], ['j']],
  );
});

test('overlap + orderはSandSとして1 actionのまま保つ', () => {
  assert.deepEqual(
    actionKeys(input(['j', 'thumb-r'], [
      { kind: 'overlap', keys: ['j', 'thumb-r'] },
      { kind: 'order', before: ['thumb-r'], after: ['j'] },
    ])),
    [['j', 'thumb-r']],
  );
});

test('partial overlap componentをorder DAGのlevelへ展開する', () => {
  assert.deepEqual(
    actionKeys(input(['a', 'd', 'j', 'k'], [
      { kind: 'overlap', keys: ['d', 'k'] },
      { kind: 'order', before: ['a'], after: ['d'] },
      { kind: 'order', before: ['k'], after: ['j'] },
    ])),
    [['a'], ['d', 'k'], ['j']],
  );
});

test('SemanticInput sequenceは各inputのaction列を順番にflattenする', () => {
  const first = input(['d', 'h'], [
    { kind: 'order', before: ['d'], after: ['h'] },
  ]);
  const second = input(['j', 'k'], [
    { kind: 'overlap', keys: ['j', 'k'] },
  ]);

  const actions = planSemanticInputSequenceActions([first, second]);
  assert.deepEqual(actions.map((action) => action.keys), [
    ['d'],
    ['h'],
    ['j', 'k'],
  ]);
  assert.equal(actions[0].input, first);
  assert.equal(actions[1].input, first);
  assert.equal(actions[2].input, second);
});

test('built-in全outputでcanonical base action列がlegacy Layout.mapと一致する', () => {
  for (const layout of LAYOUT_BY_ID.values()) {
    assert.ok(layout.semanticInputSequences, `${layout.id}: semanticInputSequences`);

    for (const [output, legacySequence] of layout.map) {
      const semanticSequence = layout.semanticInputSequences.get(output);
      assert.ok(semanticSequence, `${layout.id}: ${output} canonical sequence`);

      const actions = planSemanticInputSequenceActions(semanticSequence);
      assert.equal(
        actions.length,
        legacySequence.length,
        `${layout.id}: ${output} action count`,
      );

      for (const [index, legacyStep] of legacySequence.entries()) {
        const expected = [...new Set(legacyStep.map(resolveKeyId))].sort();
        const actual = [...actions[index].keys].sort();
        assert.deepEqual(actual, expected, `${layout.id}: ${output} action ${index}`);
      }
    }
  }
});
