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
/** 入力の意味（面の編集画面の「入力の意味」）。合成は計上先で分ける。 */
export type TriggerMeaning = 'layer' | 'modifier' | 'composition-layer' | 'composition-combo';

export interface TriggerParticipation {
  /** 全Stroke数（分母） */
  readonly strokes: number;
  /** triggerが参加したStrokeの行 */
  readonly all: TriggerCounts;
  /** 面（層・コンボ枠）のid → 行。trigger参加のあるStrokeが現れた帰属先だけを持つ */
  readonly faces: ReadonlyMap<string, TriggerCounts>;
  readonly orders: Readonly<Record<TriggerOrder, TriggerCounts>>;
  readonly persistence: Readonly<Record<TriggerPersistence, TriggerCounts>>;
  readonly meaning: Readonly<Record<TriggerMeaning, TriggerCounts>>;
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

type Hand = StrokeParticipation['hand'];

/** Strokeの、役に「出力」を持つ参加の手。 */
function outputHandsOf(stroke: TriggerParticipationStroke): Set<Hand> {
  return new Set(stroke.participations.filter((participation) => participation.roles.includes('output')).map((participation) => participation.hand));
}

/**
 * triggerが参加したStrokeの、比べる出力の手。
 * 出力を持つStrokeは自分の出力とだけ比べる。triggerだけのStrokeは、同じ入力の選択・同じ帰属先のすぐ隣の出力のStrokeと比べる
 * 前置と、分けた実現で出力のStrokeより前に置かれる同時はすぐ後、後置はすぐ前と比べる。
 */
function comparedOutputHands(strokes: readonly TriggerParticipationStroke[], index: number, orders: ReadonlySet<TriggerOrder>): Set<Hand> {
  const stroke = strokes[index]!;
  const own = outputHandsOf(stroke);
  if (own.size > 0) return own;
  const hands = new Set<Hand>();
  const take = (neighbor: TriggerParticipationStroke | undefined): void => {
    if (neighbor === undefined || neighbor.selectionIndex !== stroke.selectionIndex || neighbor.aggregationGroupId !== stroke.aggregationGroupId) return;
    for (const hand of outputHandsOf(neighbor)) hands.add(hand);
  };
  if (orders.has('before') || orders.has('overlap')) take(strokes[index + 1]);
  if (orders.has('after')) take(strokes[index - 1]);
  return hands;
}

export function computeTriggerParticipation(trace: { readonly strokes: readonly TriggerParticipationStroke[] }): TriggerParticipation {
  const all = newCounts();
  const faces = new Map<string, MutableCounts>();
  const orders: Record<TriggerOrder, MutableCounts> = { overlap: newCounts(), before: newCounts(), after: newCounts() };
  const persistence: Record<TriggerPersistence, MutableCounts> = { single: newCounts(), held: newCounts() };
  const meaning: Record<TriggerMeaning, MutableCounts> = {
    layer: newCounts(),
    modifier: newCounts(),
    'composition-layer': newCounts(),
    'composition-combo': newCounts(),
  };

  const { strokes } = trace;
  strokes.forEach((stroke, index) => {
    const triggers = stroke.participations.filter(isTriggerParticipation);
    if (triggers.length === 0) return;

    const strokeOrders = new Set(triggers.flatMap((participation) => participation.triggerOrders ?? []));
    const hands = new Set(triggers.map((participation) => participation.hand));
    const outputs = comparedOutputHands(strokes, index, strokeOrders);
    for (const hand of outputs) hands.add(hand);
    const sameHand = outputs.size > 0 && hands.size === 1;

    add(all, sameHand);
    const face = faces.get(stroke.aggregationGroupId) ?? newCounts();
    add(face, sameHand);
    faces.set(stroke.aggregationGroupId, face);

    for (const order of strokeOrders) add(orders[order], sameHand);

    const held = stroke.participations.some((participation) => participation.roles.includes('held-trigger'));
    add(held ? persistence.held : persistence.single, sameHand);

    const kind: TriggerMeaning = stroke.classifications.includes('composition')
      ? stroke.aggregationGroupId === COMBO_LAYER_ID
        ? 'composition-combo'
        : 'composition-layer'
      : triggers.some((participation) => participation.modifier === true)
        ? 'modifier'
        : 'layer';
    add(meaning[kind], sameHand);
  });

  return { strokes: strokes.length, all, faces, orders, persistence, meaning };
}
