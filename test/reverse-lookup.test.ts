import test from 'node:test';
import assert from 'node:assert/strict';
import { inputAlternativeSelectionIdentity } from '../src/core/semantic-input/index.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';
import {
  reverseLookup,
  reverseLookupGuideActionMatchesKeys,
  reverseLookupGuideActions,
  reverseLookupRouteLabel,
  reverseLookupStepLabel,
  reverseLookupStepMatchesRecognition,
} from '../src/features/input-converter/reverse-lookup.ts';

test('reverseLookupは薙刀式の複合かなをcanonical actionから逆引きする', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const routes = reverseLookup(layout, 'ぎゃ');
  assert.ok(routes.length > 0);
  assert.equal(routes[0]?.steps.length, 1);
  assert.equal(routes[0]?.steps[0]?.output, 'ぎゃ');
  assert.match(reverseLookupRouteLabel(routes[0]!), /H|J|W/);
});

test('reverseLookupはTK音直の語彙comboを通常打鍵より優先する', () => {
  const layout = LAYOUT_BY_ID.get('oonishi-custom-combo');
  assert.ok(layout);
  const routes = reverseLookup(layout, 'です');
  assert.ok(routes.length > 0);
  assert.equal(routes[0]?.steps.length, 1);
  assert.equal(routes[0]?.steps[0]?.output, 'desu');
  assert.equal(routes[0]?.steps[0]?.origin, 'combo');
});

test('reverseLookupはTK音直のyouon-only comboを前置子音がある場合だけ使う', () => {
  const layout = LAYOUT_BY_ID.get('oonishi-custom-combo');
  assert.ok(layout);

  const kya = reverseLookup(layout, 'きゃ');
  assert.ok(kya.some((route) =>
    route.steps.some((step) => step.output === 'ya' && step.origin === 'combo')));

  const ya = reverseLookup(layout, 'や');
  assert.equal(
    ya.some((route) => route.steps.some((step) => step.output === 'ya' && step.origin === 'combo')),
    false,
  );
});

test('reverseLookupRouteLabelはchordとsequenceを区別して表示する', () => {
  assert.equal(reverseLookupRouteLabel({
    actionCount: 2,
    keyCount: 3,
    steps: [{
      output: 'x',
      origin: 'face',
      actions: [['thumb-r'], ['h', 'j']],
      aggregationGroupIds: ['layer:test'],
      actionKeyAlternatives: [[['thumb-r']], [['h', 'j']]],
      acceptedAlternativeSelectionIdentities: ['test-alternative'],
    }],
  }), '右親指 → H + J');
});


test('reverseLookupStepLabelは1入力単位のaction順を表示する', () => {
  assert.equal(reverseLookupStepLabel({
    output: 'x',
    origin: 'face',
    actions: [['thumb-r'], ['h', 'j']],
    aggregationGroupIds: ['layer:test'],
    actionKeyAlternatives: [[['thumb-r']], [['h', 'j']]],
    acceptedAlternativeSelectionIdentities: ['test-alternative'],
  }), '右親指 → H + J');
});

test('reverseLookupStepMatchesRecognitionは同じcanonical alternativeだけを一致扱いする', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const route = reverseLookup(layout, 'かな')[0];
  assert.ok(route);
  const step = route.steps[0];
  assert.ok(step);

  const exact = layout.canonicalInputs.get(step.output)?.find((alternative) =>
    step.acceptedAlternativeSelectionIdentities.includes(
      inputAlternativeSelectionIdentity(alternative),
    ));
  assert.ok(exact);

  assert.equal(reverseLookupStepMatchesRecognition(step, {
    output: step.output,
    alternative: exact,
  }), true);
  assert.equal(reverseLookupStepMatchesRecognition(step, {
    output: '別',
    alternative: exact,
  }), false);
});


test('reverseLookupGuideActionsは逐次入力をaction単位へ展開する', () => {
  const layout = LAYOUT_BY_ID.get('tsuki-2-263');
  assert.ok(layout);
  const route = reverseLookup(layout, 'よ')[0];
  assert.ok(route);

  const actions = reverseLookupGuideActions(route);
  assert.ok(actions.length >= 2);
  assert.equal(actions[0]?.routeStepIndex, 0);
  assert.equal(actions[0]?.actionIndex, 0);
  assert.equal(actions.at(-1)?.finalInRouteStep, true);
});

test('reverseLookupは明示された親指shift alternativeだけを同じ表示routeへ畳む', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const routes = reverseLookup(layout, 'ま', 10);
  assert.ok(routes.length > 0);

  const shifted = routes.find((route) =>
    route.steps[0]?.actions.some((action) =>
      action.includes('thumb-r') || action.includes('thumb-l')));
  assert.ok(shifted);
  const step = shifted.steps[0]!;
  assert.ok(step.acceptedAlternativeSelectionIdentities.length >= 2);

  const guide = reverseLookupGuideActions(shifted);
  const thumbAction = guide.find((action) =>
    action.keyAlternatives.some((variant) =>
      variant.includes('thumb-r') || variant.includes('thumb-l')));
  assert.ok(thumbAction);
  assert.equal(reverseLookupGuideActionMatchesKeys(thumbAction, ['thumb-r', 'f']), true);
  assert.equal(reverseLookupGuideActionMatchesKeys(thumbAction, ['thumb-l', 'f']), true);
});
