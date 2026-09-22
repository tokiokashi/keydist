import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConditions, setLayoutGeometryOverride } from '../src/condition-resolution.ts';
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
    triggerRealizationPolicy: { useHold: false },
    actionRealizationPolicy: { triggerActivation: 'combined', triggerActivationOverrides: [] },
  });
  assert.deepEqual(resolved.chainPolicy, DEFAULT_CONDITION_DEFAULTS.chain);
  assert.deepEqual(resolved.arpeggioPolicy, DEFAULT_CONDITION_DEFAULTS.arpeggioPolicy);
  assert.deepEqual(resolved.triggerRealizationPolicy, DEFAULT_CONDITION_DEFAULTS.triggerRealization);
  assert.deepEqual(resolved.actionRealizationPolicy, { triggerActivation: 'combined', triggerActivationOverrides: [] });
});

test('ActionRealizationPolicyはconditionからevaluate optionsへそのまま渡す', () => {
  const separated = resolveConditions(DEFAULT_CONDITION_DEFAULTS, {
    actionRealization: { triggerActivation: 'separate', triggerActivationOverrides: [] },
  });
  assert.deepEqual(separated.actionRealizationPolicy, { triggerActivation: 'separate', triggerActivationOverrides: [] });
  assert.deepEqual(separated.options.actionRealizationPolicy, { triggerActivation: 'separate', triggerActivationOverrides: [] });
});

test('配列別条件が空なら既定値と同じになる', () => {
  assert.deepEqual(
    resolveConditions(DEFAULT_CONDITION_DEFAULTS, undefined),
    resolveConditions(DEFAULT_CONDITION_DEFAULTS, {}),
  );
});

test('詳細画面で形状を既定へ戻しても他の配列別条件を消さない', () => {
  const perLayout = { qwerty: { romajiRule: 'azik', windowSize: 7 } };
  setLayoutGeometryOverride(perLayout, 'qwerty', 'row-staggered', 'ortholinear');
  assert.deepEqual(perLayout.qwerty, { romajiRule: 'azik', windowSize: 7, geometry: 'row-staggered' });

  setLayoutGeometryOverride(perLayout, 'qwerty', 'ortholinear', 'ortholinear');
  assert.deepEqual(perLayout.qwerty, { romajiRule: 'azik', windowSize: 7 });
});

test('個別設定がオンの空オブジェクトは形状を既定へ戻しても残る', () => {
  const perLayout = { qwerty: {} };
  setLayoutGeometryOverride(perLayout, 'qwerty', 'row-staggered', 'row-staggered');
  assert.deepEqual(perLayout.qwerty, {});
});
