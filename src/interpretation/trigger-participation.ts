import { COMBO_LAYER_ID } from '#input/layouts/types.ts';
import type { Stroke, StrokeParticipation, TriggerOrder } from '#trace/generate.ts';

/**
 * 切り替えのキー（trigger）の参加率と同手率（仕様 §11.10.1）。
 *
 * 単位はStroke。各Strokeを、行ごとに高々1回だけ数える。1つのStrokeで複数の役が成立しても、同じ行へ二重に入れない。
 * 配列名や面の名前から意味を推測せず、Traceが持つ参加の役・Requirement上の位置・`classifications`・`aggregationGroupId` だけで決める。
 */

/** 集計が読むStrokeの項目。 */
export type TriggerParticipationStroke = Pick<Stroke, 'selectionIndex' | 'aggregationGroupId' | 'classifications' | 'participations'>;

/** 行1つぶんの回数。 */
export interface TriggerCounts {
  /** その行の条件に当たるStrokeの数 */
  readonly participated: number;
  /** そのうち、triggerと出力が同じ手のStrokeの数 */
  readonly sameHand: number;
}

export type TriggerPersistence = 'single' | 'held';
export type TriggerComposition = 'layer' | 'combo' | 'none';

export interface TriggerParticipation {
  /** 全Stroke数（分母） */
  readonly strokes: number;
  /** triggerが参加したStrokeの行 */
  readonly all: TriggerCounts;
  /** 面（層・コンボ枠）のid → 行。trigger参加のあるStrokeが現れた帰属先だけを持つ */
  readonly faces: ReadonlyMap<string, TriggerCounts>;
  readonly orders: Readonly<Record<TriggerOrder, TriggerCounts>>;
  readonly persistence: Readonly<Record<TriggerPersistence, TriggerCounts>>;
  readonly composition: Readonly<Record<TriggerComposition, TriggerCounts>>;
}

interface MutableCounts {
  participated: number;
  sameHand: number;
}

const newCounts = (): MutableCounts => ({ participated: 0, sameHand: 0 });

const add = (counts: MutableCounts, sameHand: boolean): void => {
  counts.participated++;
  if (sameHand) counts.sameHand++;
};

const isTriggerParticipation = (participation: StrokeParticipation): boolean =>
  participation.roles.includes('trigger') || participation.roles.includes('held-trigger');

/** 同じ入力の選択の中で、帰属先ごとの出力の手。 */
function outputHandsByGroup(run: readonly TriggerParticipationStroke[]): Map<string, Set<StrokeParticipation['hand']>> {
  const byGroup = new Map<string, Set<StrokeParticipation['hand']>>();
  for (const stroke of run) {
    for (const participation of stroke.participations) {
      if (!participation.roles.includes('output')) continue;
      const hands = byGroup.get(stroke.aggregationGroupId) ?? new Set();
      hands.add(participation.hand);
      byGroup.set(stroke.aggregationGroupId, hands);
    }
  }
  return byGroup;
}

export function computeTriggerParticipation(trace: { readonly strokes: readonly TriggerParticipationStroke[] }): TriggerParticipation {
  const all = newCounts();
  const faces = new Map<string, MutableCounts>();
  const orders: Record<TriggerOrder, MutableCounts> = { overlap: newCounts(), before: newCounts(), after: newCounts() };
  const persistence: Record<TriggerPersistence, MutableCounts> = { single: newCounts(), held: newCounts() };
  const composition: Record<TriggerComposition, MutableCounts> = { layer: newCounts(), combo: newCounts(), none: newCounts() };

  const { strokes } = trace;
  let start = 0;
  while (start < strokes.length) {
    // 同じ入力の選択（`selectionIndex`）のStrokeは続けて並ぶ
    let end = start + 1;
    while (end < strokes.length && strokes[end]!.selectionIndex === strokes[start]!.selectionIndex) end++;
    const run = strokes.slice(start, end);
    start = end;

    if (!run.some((stroke) => stroke.participations.some(isTriggerParticipation))) continue;
    const outputHands = outputHandsByGroup(run);

    for (const stroke of run) {
      const triggers = stroke.participations.filter(isTriggerParticipation);
      if (triggers.length === 0) continue;

      const hands = new Set(triggers.map((participation) => participation.hand));
      const outputs = outputHands.get(stroke.aggregationGroupId) ?? new Set();
      for (const hand of outputs) hands.add(hand);
      const sameHand = outputs.size > 0 && hands.size === 1;

      add(all, sameHand);
      const face = faces.get(stroke.aggregationGroupId) ?? newCounts();
      add(face, sameHand);
      faces.set(stroke.aggregationGroupId, face);

      const strokeOrders = new Set(triggers.flatMap((participation) => participation.triggerOrders ?? []));
      for (const order of strokeOrders) add(orders[order], sameHand);

      const held = stroke.participations.some((participation) => participation.roles.includes('held-trigger'));
      add(held ? persistence.held : persistence.single, sameHand);

      const kind: TriggerComposition = !stroke.classifications.includes('composition')
        ? 'none'
        : stroke.aggregationGroupId === COMBO_LAYER_ID
          ? 'combo'
          : 'layer';
      add(composition[kind], sameHand);
    }
  }

  return { strokes: strokes.length, all, faces, orders, persistence, composition };
}
