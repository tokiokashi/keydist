import test from 'node:test';
import assert from 'node:assert/strict';
import { inputAlternativeSelectionIdentity } from '../src/core/semantic-input/index.ts';
import type { InputAlternativeOrigin } from '../src/core/semantic-input/types.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';
import {
  longestReverseLookupRoute,
  reverseLookup,
  reverseLookupGuideActionHighlightKeys,
  reverseLookupGuideActionLabel,
  reverseLookupGuideActionMatchesKeys,
  reverseLookupGuideActionTriggerOnlyKeys,
  reverseLookupGuideActions,
  reverseLookupGuideIndexForText,
  reverseLookupRouteLabel,
  reverseLookupStepLabel,
  reverseLookupStepMatchesRecognition,
  type ReverseLookupRoute,
} from '../src/features/input-converter/reverse-lookup.ts';

/** テスト用に最小限のReverseLookupRouteを組み立てる。1step・1actionだけを持つ単純な経路。 */
function fixtureRoute(
  output: string,
  actions: readonly (readonly string[])[],
  origin: InputAlternativeOrigin = 'sequence',
): ReverseLookupRoute {
  return {
    steps: [{
      output,
      actions,
      actionKeyAlternatives: actions.map((action) => [action]),
      actionParticipationAlternatives: actions.map((action) => [[{
        outputKeys: action,
        triggerKeys: [],
      }]]),
      origin,
      aggregationGroupIds: [],
      acceptedAlternativeSelectionIdentities: [],
    }],
    actionCount: actions.length,
    keyCount: actions.reduce((total, action) => total + action.length, 0),
  };
}

test('reverseLookupは薙刀式の複合かなをcanonical actionから逆引きする', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const routes = reverseLookup(layout, 'ぎゃ');
  assert.ok(routes.length > 0);
  assert.equal(routes[0]?.steps.length, 1);
  assert.equal(routes[0]?.steps[0]?.output, 'ぎゃ');
  assert.match(reverseLookupRouteLabel(layout, routes[0]!), /H|J|W/);
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
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  assert.equal(reverseLookupRouteLabel(layout, {
    actionCount: 2,
    keyCount: 3,
    steps: [{
      output: 'x',
      origin: 'face',
      actions: [['thumb-r'], ['h', 'j']],
      aggregationGroupIds: ['layer:test'],
      actionKeyAlternatives: [[['thumb-r']], [['h', 'j']]],
      actionParticipationAlternatives: [
        [[{ outputKeys: [], triggerKeys: ['thumb-r'] }]],
        [[{ outputKeys: ['h', 'j'], triggerKeys: [] }]],
      ],
      acceptedAlternativeSelectionIdentities: ['test-alternative'],
    }],
  }), '右親指 → H + J');
});


test('reverseLookupStepLabelは1入力単位のaction順を表示する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  assert.equal(reverseLookupStepLabel(layout, {
    output: 'x',
    origin: 'face',
    actions: [['thumb-r'], ['h', 'j']],
    aggregationGroupIds: ['layer:test'],
    actionKeyAlternatives: [[['thumb-r']], [['h', 'j']]],
    actionParticipationAlternatives: [
      [[{ outputKeys: [], triggerKeys: ['thumb-r'] }]],
      [[{ outputKeys: ['h', 'j'], triggerKeys: [] }]],
    ],
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

test('guide participationは対象semanticだけを見てtrigger-onlyを判定する', () => {
  const layout = LAYOUT_BY_ID.get('shingeta');
  assert.ok(layout);

  // Kは中指シフト全体では「れ」のoutputにもなるが、「ご」ではtrigger専用。
  const go = reverseLookup(layout, 'ご')[0];
  assert.ok(go);
  const goAction = reverseLookupGuideActions(go)[0];
  assert.ok(goAction);
  assert.deepEqual(reverseLookupGuideActionTriggerOnlyKeys(goAction), ['k']);

  // 相互シフト「れ」は同じsemantic内でD/Kの両方がtrigger兼output。
  const re = reverseLookup(layout, 'れ')[0];
  assert.ok(re);
  const reAction = reverseLookupGuideActions(re)[0];
  assert.ok(reAction);
  assert.deepEqual(reverseLookupGuideActionTriggerOnlyKeys(reAction), []);
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
  assert.equal(reverseLookupGuideActionLabel(layout, thumbAction), 'Space + F');
  assert.deepEqual(
    new Set(reverseLookupGuideActionHighlightKeys(layout, thumbAction)),
    new Set(['thumb-r', 'thumb-l', 'f']),
  );
  assert.deepEqual(
    new Set(reverseLookupGuideActionTriggerOnlyKeys(thumbAction)),
    new Set(['thumb-r', 'thumb-l']),
  );
  assert.equal(reverseLookupRouteLabel(layout, shifted).includes('右親指'), false);
  assert.equal(reverseLookupRouteLabel(layout, shifted).includes('左親指'), false);
});


test('reverseLookupGuideIndexForTextは正しいprefixだけをguide進捗として数える', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const route = reverseLookup(layout, 'かな')[0];
  assert.ok(route);
  const actions = reverseLookupGuideActions(route);
  const secondStepIndex = actions.findIndex((action) => action.routeStepIndex === 1);
  assert.ok(secondStepIndex > 0);

  assert.equal(reverseLookupGuideIndexForText(layout, route, ''), 0);
  assert.equal(reverseLookupGuideIndexForText(layout, route, 'か'), secondStepIndex);
  assert.equal(reverseLookupGuideIndexForText(layout, route, 'かけ'), secondStepIndex);
  assert.equal(reverseLookupGuideIndexForText(layout, route, 'け'), 0);
  assert.equal(reverseLookupGuideIndexForText(layout, route, 'かな'), actions.length - 1);
});

test('reverseLookupGuideIndexForTextはromaji配列でも表示かなをlogical入力へ変換する', () => {
  const layout = LAYOUT_BY_ID.get('dvorak');
  assert.ok(layout);
  assert.ok(layout.romajiTable);
  const route = reverseLookup(layout, 'かな')[0];
  assert.ok(route);
  const actions = reverseLookupGuideActions(route);

  const indexAfterKa = reverseLookupGuideIndexForText(layout, route, 'か');
  assert.ok(indexAfterKa > 0);
  assert.ok(indexAfterKa < actions.length);
  assert.equal(reverseLookupGuideIndexForText(layout, route, 'かの'), indexAfterKa);
  assert.equal(reverseLookupGuideIndexForText(layout, route, 'かな'), actions.length - 1);
});

test('longestReverseLookupRouteは薙刀式で「にゅ」を1stepでまとめて打つ経路を選ぶ', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const routes = reverseLookup(layout, 'にゅ', 5);
  assert.ok(routes.length >= 2, 'この検証は「にゅ」が複数経路を持つことが前提');

  const longest = longestReverseLookupRoute(routes);
  assert.ok(longest);
  assert.equal(longest.steps.length, 1);
  assert.equal(longest.steps[0]?.output, 'にゅ');
  // reverseLookupが返す並び順の先頭とも一致する（並び順への暗黙依存を避けつつ選択結果は揃う）。
  assert.equal(longest, routes[0]);
});

test('longestReverseLookupRouteはstep数が同じなら少ないaction数を優先する', () => {
  const twoActions = fixtureRoute('ab', [['x'], ['y']]);
  const oneAction = fixtureRoute('ab', [['z']]);
  assert.equal(longestReverseLookupRoute([twoActions, oneAction]), oneAction);
  // 引数の並び順を入れ替えても結果は変わらない。
  assert.equal(longestReverseLookupRoute([oneAction, twoActions]), oneAction);
});

test('longestReverseLookupRouteはstep数・action数・key数すべて同点ならcompareRoutesと同じ既存の並び順で決める', () => {
  // reverseLookupが最終的に返す並びと同じtie-break（routeSignatureの辞書順）を使うため、
  // 呼び出し側が渡す配列の順序には依存しない。
  const first = fixtureRoute('あ', [['a']]);
  const second = fixtureRoute('い', [['i']]);
  assert.deepEqual(first.steps.length, second.steps.length);
  assert.deepEqual(first.actionCount, second.actionCount);
  assert.deepEqual(first.keyCount, second.keyCount);

  assert.equal(longestReverseLookupRoute([first, second]), first);
  assert.equal(longestReverseLookupRoute([second, first]), first);
});

test('longestReverseLookupRouteは空配列でundefinedを返す', () => {
  assert.equal(longestReverseLookupRoute([]), undefined);
});
