import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry, type Finger } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type ParticipationRole, type StrokeParticipation, type TriggerOrder } from '#trace/generate.ts';
import { computeTriggerParticipation, type TriggerParticipationStroke } from './trigger-participation.ts';

/**
 * 切り替えのキーの参加率と同手率（仕様 §11.10.1）。
 * 数え方の規則（二重に数えない・同手の判定・保持の分け方）は、参加を手で組んだStrokeで固定し、
 * 実際の配列のTraceでは、参加がRequirementの位置を持つところから行に入るまでを確かめる。
 */

const FINGER_OF = { left: 'LM', right: 'RM' } as const satisfies Record<'left' | 'right', Finger>;

function participation(hand: 'left' | 'right', roles: readonly ParticipationRole[], triggerOrders?: readonly TriggerOrder[]): StrokeParticipation {
  return { hand, finger: FINGER_OF[hand], keys: [], roles, ...(triggerOrders === undefined ? {} : { triggerOrders }) };
}

function stroke(
  selectionIndex: number,
  participations: readonly StrokeParticipation[],
  options: { readonly group?: string; readonly composition?: boolean } = {},
): TriggerParticipationStroke {
  return {
    selectionIndex,
    aggregationGroupId: options.group ?? 'single',
    classifications: options.composition === true ? ['composition'] : [],
    participations,
  };
}

test('triggerが参加しないStrokeは、分母にだけ入る', () => {
  const result = computeTriggerParticipation({
    strokes: [stroke(0, [participation('left', ['output'])]), stroke(1, [participation('right', ['output'])])],
  });
  assert.equal(result.strokes, 2);
  assert.deepEqual(result.all, { participated: 0, sameHand: 0 });
  assert.equal(result.faces.size, 0);
});

test('1つのStrokeで前置と後置のtriggerが成立しても、各行へ1回ずつで、全体へは1回しか数えない', () => {
  // 左手のtrigger（前置）と右手のtrigger（後置）と、左手の出力
  const result = computeTriggerParticipation({
    strokes: [
      stroke(0, [participation('left', ['trigger', 'output'], ['before']), participation('right', ['trigger'], ['after'])], { group: 'layer:A' }),
    ],
  });
  assert.equal(result.strokes, 1);
  assert.equal(result.all.participated, 1);
  assert.equal(result.faces.get('layer:A')?.participated, 1);
  assert.equal(result.orders.before.participated, 1);
  assert.equal(result.orders.after.participated, 1);
  assert.equal(result.orders.overlap.participated, 0);
  // 同じ軸の行の和は、全体より大きくなりうる
  assert.equal(result.orders.before.participated + result.orders.after.participated, 2);
  assert.equal(result.persistence.single.participated, 1);
  assert.equal(result.persistence.held.participated, 0);
});

test('同じ参加が複数のtriggerの順序を持っても、その行へは1回しか数えない', () => {
  const result = computeTriggerParticipation({
    strokes: [stroke(0, [participation('left', ['trigger', 'output'], ['overlap', 'before']), participation('left', ['trigger'], ['before'])])],
  });
  assert.equal(result.orders.overlap.participated, 1);
  assert.equal(result.orders.before.participated, 1);
});

test('同手: triggerと出力が全部同じ手なら数え、手が分かれたら数えない', () => {
  const result = computeTriggerParticipation({
    strokes: [
      stroke(0, [participation('left', ['trigger']), participation('left', ['output'])]),
      stroke(1, [participation('left', ['trigger']), participation('right', ['output'])]),
      stroke(2, [participation('right', ['trigger', 'output'])]),
    ],
  });
  assert.deepEqual(result.all, { participated: 3, sameHand: 2 });
});

test('同手: 保持を続けているtriggerの手も比べ、持続は保持の役があるStrokeだけを保持に分ける', () => {
  const result = computeTriggerParticipation({
    strokes: [
      // 保持を始めたStroke（トリガーと押したままのトリガーの両方）。同じ手の出力
      stroke(0, [participation('left', ['trigger', 'held-trigger', 'output'], ['before'])]),
      // 保持を続けるStroke。triggerは左手で押したまま、出力は右手
      stroke(1, [participation('left', ['held-trigger'], ['before']), participation('right', ['output'])]),
      // 保持の無い単発
      stroke(2, [participation('right', ['trigger', 'output'], ['overlap'])]),
    ],
  });
  assert.deepEqual(result.persistence.held, { participated: 2, sameHand: 1 });
  assert.deepEqual(result.persistence.single, { participated: 1, sameHand: 1 });
  assert.deepEqual(result.all, { participated: 3, sameHand: 2 });
});

test('triggerだけのStrokeは、同じ入力の選択で同じ帰属先の出力のStrokeの手と比べる', () => {
  const result = computeTriggerParticipation({
    strokes: [
      // 前置triggerだけのStrokeと、その出力のStroke。出力は右手なので、triggerの左手とは手が分かれる
      stroke(0, [participation('left', ['trigger'], ['before'])], { group: 'layer:A' }),
      stroke(0, [participation('right', ['output'])], { group: 'layer:A' }),
      // 同じ手のtriggerと出力
      stroke(1, [participation('right', ['trigger'], ['before'])], { group: 'layer:B' }),
      stroke(1, [participation('right', ['output'])], { group: 'layer:B' }),
    ],
  });
  assert.equal(result.strokes, 4);
  assert.deepEqual(result.all, { participated: 2, sameHand: 1 });
  assert.deepEqual(result.faces.get('layer:A'), { participated: 1, sameHand: 0 });
  assert.deepEqual(result.faces.get('layer:B'), { participated: 1, sameHand: 1 });
});

test('別の入力の選択や別の帰属先の出力の手は、同手の判定に使わない', () => {
  const result = computeTriggerParticipation({
    strokes: [
      stroke(0, [participation('left', ['trigger'], ['before'])], { group: 'layer:A' }),
      // 同じ選択でも別の帰属先の出力は比べない（出力が無いので同手に数えない）
      stroke(0, [participation('left', ['output'])], { group: 'single' }),
      // 次の選択の出力は比べない
      stroke(1, [participation('left', ['output'])], { group: 'layer:A' }),
    ],
  });
  assert.deepEqual(result.all, { participated: 1, sameHand: 0 });
});

test('compositionは、帰属先がコンボ枠かどうかで分け、compositionでない面は別の行にする', () => {
  const result = computeTriggerParticipation({
    strokes: [
      stroke(0, [participation('left', ['trigger', 'output'])], { group: 'layer:A', composition: true }),
      stroke(1, [participation('left', ['trigger', 'output'])], { group: 'combo', composition: true }),
      stroke(2, [participation('left', ['trigger', 'output'])], { group: 'layer:B' }),
      stroke(3, [participation('left', ['trigger', 'output'])], { group: 'combo' }),
    ],
  });
  assert.equal(result.composition.layer.participated, 1);
  assert.equal(result.composition.combo.participated, 1);
  assert.equal(result.composition.none.participated, 2);
  assert.equal(result.faces.get('combo')?.participated, 2);
});

const geometry = buildGeometry('row-staggered');

function traceOf(layoutId: string, text: string, useHold = false) {
  const layout = LAYOUT_BY_ID.get(layoutId);
  assert.ok(layout, layoutId);
  const trace = generateTrace(text, layout, geometry, { ...DEFAULT_TRACE_POLICY, triggerRealizationPolicy: { useHold } });
  assert.equal(trace.skipped, 0);
  return trace;
}

test('実際の配列: Shiftは、同時と前置の両方の行へ1回ずつ入り、全体へは1回しか入らない', () => {
  // 「Hello」のHは、左Shiftとhの2つのキーを1ステップで打つ
  const result = computeTriggerParticipation(traceOf('qwerty', 'Hello'));
  assert.equal(result.strokes, 5);
  assert.equal(result.all.participated, 1);
  assert.equal(result.orders.overlap.participated, 1);
  assert.equal(result.orders.before.participated, 1);
  assert.equal(result.orders.after.participated, 0);
  assert.equal(result.faces.get('layer:Shift')?.participated, 1);
  // 右手のhを、反対の手のShiftで打つ
  assert.equal(result.all.sameHand, 0);
});

test('実際の配列: 保持を実現したStrokeだけが、持続の保持の行に入る', () => {
  // 「HELLO」は、Shiftを押したまま続けて打てる
  const single = computeTriggerParticipation(traceOf('qwerty', 'HELLO'));
  assert.equal(single.persistence.held.participated, 0);
  assert.equal(single.persistence.single.participated, single.all.participated);

  const held = computeTriggerParticipation(traceOf('qwerty', 'HELLO', true));
  assert.equal(held.persistence.single.participated, 0);
  assert.equal(held.persistence.held.participated, held.all.participated);
  // 保持の実現は参加するStrokeを増減させず、持続の分け方だけを変える
  assert.equal(held.all.participated, single.all.participated);
  assert.ok(held.all.participated > 1);
});

test('実際の配列: 前置と後置の面は、それぞれの行に入る', () => {
  const prefix = computeTriggerParticipation(traceOf('shin-jis-prefix', 'あいうえお'));
  assert.ok(prefix.orders.before.participated > 0);
  assert.equal(prefix.orders.after.participated, 0);

  const suffix = computeTriggerParticipation(traceOf('tsukimisou-extract', 'あいうえお'));
  assert.ok(suffix.orders.after.participated > 0);
  assert.equal(suffix.orders.before.participated, 0);
});

test('実際の配列: compositionの面は、帰属先の宣言どおりに層とコンボ枠へ分かれる', () => {
  const result = computeTriggerParticipation(traceOf('kawasemi-plus', 'あいく'));
  assert.ok(result.composition.layer.participated > 0);
  assert.ok(result.composition.combo.participated > 0);
  assert.equal(result.composition.combo.participated, result.faces.get('combo')?.participated);
});
