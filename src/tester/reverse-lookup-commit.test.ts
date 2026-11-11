import test from 'node:test';
import assert from 'node:assert/strict';
import { faceFromEntries, fromFaces, LAYOUT_BY_ID, type Face } from '#input/layouts/index.ts';
import { TypingInputEngine } from './engine/index.ts';
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

test('右親指のキーが前置トリガーでもある配列で、直前の入力が確定の打鍵として受ける形なら、案内は確定の打鍵と右親指のキーの2打を示し、Testerの入力と一致する', () => {
  const single: Face = { ...faceFromEntries([], 'simultaneous', { a: 'あ', k: 'か', e: 'を' }), inputRole: 'layer' };
  const suffixE: Face = { ...faceFromEntries(['e'], 'suffix', { k: 'け' }), inputRole: 'layer', triggerPersistence: 'single' };
  const spacePrefix: Face = { ...faceFromEntries(['space'], 'prefix', { a: 'ア', k: 'カ' }), inputRole: 'layer', triggerPersistence: 'single' };
  const layout = fromFaces('thumb-prefix-suffix', 'thumb-prefix-suffix', [single, suffixE, spacePrefix]);

  const route = longestReverseLookupRoute(reverseLookup(layout, 'かカ', 3));
  assert.ok(route !== undefined);
  const keys = reverseLookupGuideActions(route).map((action) => action.keys.join('+'));
  assert.deepEqual(keys, ['k', 'thumb-r', 'thumb-r', 'k']);

  // 案内の打鍵の列をTesterの入力エンジンへ流すと、練習文と同じ文字になる
  const engine = new TypingInputEngine(layout.canonicalInputs, { commitKey: 'thumb-r' });
  const outputs: string[] = [];
  for (const key of keys) {
    for (const type of ['down', 'up'] as const) outputs.push(...engine.handle({ type, key }).recognized.map((entry) => entry.output));
  }
  outputs.push(...engine.flush().recognized.map((entry) => entry.output));
  assert.deepEqual(outputs, ['か', 'カ']);
});
