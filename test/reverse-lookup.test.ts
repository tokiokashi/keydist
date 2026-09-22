import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';
import {
  reverseLookup,
  reverseLookupRouteLabel,
} from '../src/features/input-converter/reverse-lookup.ts';

test('reverseLookupは薙刀式の複合かなをcanonical actionから逆引きする', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const routes = reverseLookup(layout, 'ぎゃ');
  assert.ok(routes.length > 0);
  assert.ok(routes.some((route) =>
    route.steps.some((step) => step.output === 'ぎゃ')
    && /H|J|W/.test(reverseLookupRouteLabel(route))));
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
    }],
  }), '右親指 → H + J');
});
