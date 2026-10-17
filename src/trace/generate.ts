import { ALL_FINGERS, resolveKeyId, type Finger, type Geometry, type Key, type Point } from '#input/shapes/geometry.ts';
import {
  decidePress,
  selectFingers,
  strokeFingerChoices,
  targetOf,
  type PlannedInput,
  type PlannedStroke,
} from './finger-selection.ts';
import {
  COMBO_LAYER_ID,
  SINGLE_LAYER_ID,
  type HoldPhase,
  type LayerDefinition,
  type Layout,
  withoutRomajiOnlyCombos,
} from '#input/layouts/types.ts';
import { layerDefinitionsWithLabels } from '#input/layouts/layers.ts';
import { kanaToRomajiChunks, type RomajiChunk } from '#input/romaji/kunrei.ts';
import {
  applyActionRealizationPolicy,
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  inputAlternativeSelectionIdentity,
  isComboFrameAlternative,
  realizeTriggerActions,
  type ActionRealizationPolicy,
  type InputAlternative,
  type InputAlternativeSet,
  type RealizedSemanticAction,
  type InputClassification,
  type InputContextRequirement,
  type TriggerHoldState,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';

export interface TracePolicy {
  /** 先読みNかな。テキストのかなの位置でN文字先まで残す候補を比較する（仕様 §7 R3） */
  windowSize: number;
  /**
   * 同指連続（g=0）で打鍵先がその指のホームキー自身のとき、移動を加算するか。
   * falseにすると距離0として扱う。
  */
  sfbHomeCost: boolean;
  /** 親指シフトを出力キーと反対側の親指へ振り替えるか。 */
  preferOppositeThumb?: boolean;
  /** hold-capable triggerを実際の連続保持へrealizeする条件。 */
  triggerRealizationPolicy?: TriggerRealizationPolicy;
  /** Trigger realization後のaction grouping。 */
  actionRealizationPolicy?: ActionRealizationPolicy;
}

export const DEFAULT_TRACE_POLICY: TracePolicy = {
  windowSize: 3,
  sfbHomeCost: true,
  preferOppositeThumb: false,
  triggerRealizationPolicy: { ...DEFAULT_TRIGGER_REALIZATION_POLICY },
  actionRealizationPolicy: { ...DEFAULT_ACTION_REALIZATION_POLICY },
};

export type ParticipationRole = 'output' | 'trigger' | 'held-trigger';

export interface StrokeParticipation {
  hand: 'left' | 'right';
  finger: Finger;
  keys: readonly Key[];
  roles: readonly ParticipationRole[];
  holdPhase?: HoldPhase;
}

/** 距離が採用した候補の起点。 */
export interface PressOrigin {
  /** 起点の位置。`from` が `previous` ならその指の直前の位置、`home` ならその指のホーム */
  at: Point;
  from: 'previous' | 'home';
}

/** 1ステップの中の1指分の押下 */
export interface Press {
  finger: Finger;
  /** この指が同時に押すキー。1本の指でキーの間を押す場合は複数になる */
  keys: Key[];
  /** 指の目標位置。キーが複数なら重心（§4.2） */
  target: Point;
  /** 前回この指を使ってから挟まったrealized Stroke数。SFB判定用。 */
  gap: number;
  /**
   * 今の入力の開始が、前回この指が参加した入力の終わりから何かな先か。N判定用。重なる時は0、参加が初めてなら無限大。
   * generateTrace生成時は必ず入る。
   */
  inputDistance?: number;
  /** この押下で計上された移動距離 [u] */
  distance: number;
  /**
   * 距離が採用した候補の起点（仕様 §9, §11.11）。
   * 候補が同値の時は直前の位置（`from: 'previous'`）を採る。
   */
  origin: PressOrigin;
  /**
   * 同指連続（same finger bigram）。
   * 同じ指で**異なる位置**を続けて打った場合のみ真。
   * 同じキーの連打や、押しっぱなしの修飾キー（センターシフト等）は含まない。
   */
  sfb: boolean;
}

/**
 * 1ステップ。同時押しは1ステップに複数の押下を持つ。
 * 順次打鍵（前置・後置シフト等）はステップが分かれる。
 */
export interface Stroke {
  /** ステップの通し番号 */
  index: number;
  char: string;
  /** ローマ字展開前の入力単位。かな配列では char と同じ */
  inputChar: string;
  /** 展開後の入力列における入力単位の開始位置。同じかなを複数ステップで打つ場合も共有する */
  inputIndex: number;
  /** この入力が覆うテキストの最初の文字の位置（評価に渡すテキストの文字で数える。仕様 §7 R3） */
  kanaStart: number;
  /** この入力が覆うテキストの最後の文字の位置。その文字を含む */
  kanaEnd: number;
  /**
   * `char`を決めた1回の入力の選択の通し番号。1つの選択が複数のストロークになる時は、それらが共有する。
   * `inputIndex`はローマ字の配列で別の選択（「きょう」の`k`とコンボ`you`）とも共有されるので、選択の区別には使えない。
   */
  selectionIndex: number;
  /** このステップに含まれるキー押下のaggregation帰属先。入力成立semanticではない。 */
  aggregationGroupId: string;
  /** authoring由来のcanonical classification。 */
  classifications: readonly InputClassification[];
  /** このステップで層操作として押したキー。出力キーとの色分けに使う */
  triggerKeys: readonly string[];
  /** 同じ層の文字トリガーを複数同時押下したキー。表示色の例外に使う */
  pairedTriggerKeys: readonly string[];
  /** 後段解析がlayout idを見ずに使う正規化済み参加意味。 */
  participations: readonly StrokeParticipation[];
  presses: Press[];
  /** ステップ内の押下距離の合計 [u] */
  distance: number;
  /** 押下直後の全指位置 */
  positions: Record<Finger, Point>;
}

export interface Trace {
  strokes: Stroke[];
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /**
   * 入力文字数（ローマ字展開・コンボ結合の前、原文の文字数）。
   * 打鍵数（ステップ数）は配列で変わるが、これは変わらないので
   * 「1文字あたり」の分母に使える（仕様 §11.4）。
   */
  inputChars: number;
  /** コンボ枠の見出しのうち、評価中に命中した見出し（命中ごとに1件） */
  comboHits: string[];
  /** コンボ枠の見出しの数（コンボ定義と、コンボ枠に計上する面の出力） */
  comboDefinitions: number;
  /** 層・コンボの定義。評価対象外の未使用層も含む */
  layerDefinitions: LayerDefinition[];
  /** 配列定義の不備。同一ステップ内で同じ指が複数のキーを要求された場合など */
  errors: string[];
}

/**
 * コンボ枠の見出しの数（仕様 §11.8の `B`）。コンボ定義の数に、コンボ枠に帰属する面の出力のうち
 * コンボ定義の見出しと重ならないものを見出しごとに1件足す。
 */
function comboFrameHeadingCount(layout: Layout): number {
  const definitions = layout.resolvedComboDefinitions ?? [];
  const definedHeadings = new Set(definitions.map((combo) => combo.output));
  let faceHeadings = 0;
  for (const [output, alternatives] of layout.canonicalInputs) {
    if (definedHeadings.has(output)) continue;
    if (alternatives.some((alternative) =>
      alternative.origin === 'face' && isComboFrameAlternative(alternative))) {
      faceHeadings++;
    }
  }
  return definitions.length + faceHeadings;
}

/**
 * 仕様 §9。テキストを打鍵ステップ列へ展開し、各押下の移動距離を求める。
 *
 * realized Stroke gap = 0 → d_stay（同指連続。戻る時間がない）
 * ΔI ≤ N（かなの位置の差） → min(d_stay, d_home)
 * ΔI > N                   → d_home
 *
 * ホームへの復帰移動そのものは計上しない（§7 R2）。
 * 同時押しステップは1ステップとして数え、距離は各指の単純和を採る。
 */
export function generateTrace(
  text: string,
  sourceLayout: Layout,
  geometry: Geometry,
  options: TracePolicy = DEFAULT_TRACE_POLICY,
  /**
   * ローマ字の配列で、かなの区切りと綴りを呼び出し側が決める時の列。渡すと、配列のローマ字表でかなを展開する代わりに
   * この列を打つ。配列がローマ字表を持たない時は読まない。
   */
  romajiChunks?: readonly RomajiChunk[],
): Trace {
  // 仕様 §4.3。ローマ字を経ない打ち方ではromajiOnlyのコンボを配列に無いものとして扱う。
  // 見出し探索だけでなく定義数B（§11.8）とコンボ枠の有無も揃えるため、alternativeの
  // filterだけで済ませず、評価前に配列ごと外す。
  const layout = sourceLayout.romajiTable ? sourceLayout : withoutRomajiOnlyCombos(sourceLayout);
  const prev = {} as Record<Finger, Point>;
  const last = {} as Record<Finger, number>;
  const lastInputEnd = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    prev[finger] = geometry.homes[finger];
    last[finger] = Number.NEGATIVE_INFINITY;
    lastInputEnd[finger] = Number.NEGATIVE_INFINITY;
  }

  const strokes: Stroke[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const comboHits: string[] = [];
  const comboDefinitions = comboFrameHeadingCount(layout);
  const layerDefinitions: LayerDefinition[] = layout.layerDefinitions === undefined
    ? [{ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' }]
    : layerDefinitionsWithLabels(layout);
  if (comboDefinitions > 0 && !layerDefinitions.some((definition) => definition.id === COMBO_LAYER_ID)) {
    layerDefinitions.push({ id: COMBO_LAYER_ID, kind: 'combo', label: 'コンボ' });
  }
  let skipped = 0;
  let index = 0;
  let inputOrdinal = 0;
  let triggerHoldState: TriggerHoldState | undefined;
  const inputs: PlannedGeneratedInput[] = [];

  // ローマ字配列はかなテキストを展開してから打つ。コンボの誤命中を防ぐため、
  // 展開前の単位も残しておく。かな配列はそのまま打つ。
  const rawChars = [...text];
  const chunks = layout.romajiTable ? (romajiChunks ?? kanaToRomajiChunks(text, layout.romajiTable)) : undefined;
  const chars = (chunks
    ? chunks.flatMap((chunk) => [...chunk.roman])
    : rawChars)
    .map(normalizeEvaluationChar);
  const chunkRanges: RomajiChunkRange[] = [];
  if (chunks) {
    let start = 0;
    let kanaStart = 0;
    for (const chunk of chunks) {
      const length = [...chunk.roman].length;
      chunkRanges.push({
        start,
        end: start + length,
        kana: chunk.kana,
        fromTable: chunk.fromTable,
        kanaStart,
        kanaLength: [...chunk.kana].length,
      });
      start += length;
      kanaStart += [...chunk.kana].length;
    }
  }
  // 見出し探索のauthorityもcanonicalInputs。legacy Layout.map由来の長さmetadataへ依存しない。
  const maxLen = Math.max(
    1,
    ...[...layout.canonicalInputs.keys()].map((output) => [...output].length),
  );

  for (let cursor = 0; cursor < chars.length; ) {
    let alternatives: InputAlternativeSet | undefined;
    let char = chars[cursor];
    let consumed = 1;

    for (let len = Math.min(maxLen, chars.length - cursor); len >= 1; len--) {
      const candidate = chars.slice(cursor, cursor + len).join('');
      const found = layout.canonicalInputs.get(candidate);
      const eligible = found?.filter((alternative) =>
        alternativeContextSatisfied(
          alternative.contextRequirements,
          cursor,
          cursor + len,
          chars,
          chunkRanges,
          chunks !== undefined,
        ));
      if (eligible && eligible.length > 0) {
        alternatives = eligible;
        char = candidate;
        consumed = len;
        break;
      }
    }

    if (!alternatives) {
      skipped++;
      cursor++;
      continue;
    }
    const currentInputOrdinal = inputOrdinal++;
    const inputStart = cursor;
    const inputEnd = cursor + consumed;
    const inputChar = chunks
      ? chunkRanges
        .filter((range) => range.start < inputEnd && inputStart < range.end)
        .map((range) => range.kana)
        .join('')
      : rawChars.slice(inputStart, inputEnd).join('');
    const inputIndex = chunks
      ? chunkRanges.find((range) => range.start < inputEnd && inputStart < range.end)?.start ?? inputStart
      : inputStart;
    // 入力が覆うテキストの範囲。ローマ字配列は、覆う英字を含む綴りの単位のかなの範囲
    let kanaStart = inputStart;
    let kanaEnd = inputEnd - 1;
    if (chunks) {
      const covered = chunkRanges.filter((range) => range.start < inputEnd && inputStart < range.end);
      const first = covered[0];
      const lastCovered = covered[covered.length - 1];
      if (first && lastCovered) {
        kanaStart = first.kanaStart;
        kanaEnd = lastCovered.kanaStart + lastCovered.kanaLength - 1;
      }
    }
    cursor += consumed;

    const selectedAlternative = selectInputAlternative(
      alternatives,
      layout,
      geometry,
      options,
    );
    if (isComboFrameAlternative(selectedAlternative)) comboHits.push(char);

    const realized = realizeTriggerActions(
      selectedAlternative.baseRealizations,
      options.triggerRealizationPolicy ?? DEFAULT_TRIGGER_REALIZATION_POLICY,
      triggerHoldState,
    );
    triggerHoldState = realized.holdState;
    const actions = applyActionRealizationPolicy(
      realized.actions,
      options.actionRealizationPolicy ?? DEFAULT_ACTION_REALIZATION_POLICY,
    );

    const plannedActions: PlannedAction[] = [];
    for (const action of actions) {
      const keys: Key[] = [];
      for (const id of action.keys) {
        const key = geometry.keys.get(resolveKeyId(id));
        if (!key) {
          record(errors, seen, `キー ${id} が物理配列に存在しない（文字「${char}」）`);
          continue;
        }
        keys.push(key);
      }
      if (keys.length === 0) continue;
      plannedActions.push({
        action,
        stroke: {
          keys,
          candidates: keys.map((key) => geometry.fingerCandidates.get(key.id) ?? [key.finger]),
          heldKeys: action.heldKeys.map(resolveKeyId),
        },
      });
    }
    inputs.push({
      char,
      inputChar,
      inputIndex,
      ordinal: currentInputOrdinal,
      start: kanaStart,
      end: kanaEnd,
      actions: plannedActions,
      strokes: plannedActions.map((planned) => planned.stroke),
      ambiguous: plannedActions.some((planned) =>
        planned.stroke.candidates.some((fingers) => fingers.length > 1)),
    });
  }

  // 担当する指が2本以上のキーを含む入力では、Nかな先までの範囲で指を選ぶ（仕様 §9.1）。
  // 指が決まった入力から順に、状態を進めて打鍵を作る。
  const selectionPolicy = { windowSize: options.windowSize, sfbHomeCost: options.sfbHomeCost };
  const holders = new Map<string, Finger>();
  for (let inputPosition = 0; inputPosition < inputs.length; inputPosition++) {
    const input = inputs[inputPosition];
    const currentInputOrdinal = input.ordinal;
    const chosen = input.ambiguous
      ? selectFingers(
        geometry,
        selectionPolicy,
        { prev, last, lastInputEnd, nextStrokeIndex: index, position: input.start, holders },
        inputs,
        inputPosition,
      ).strokes
      : undefined;

    input.actions.forEach((planned, actionPosition) => {
      const { action, stroke: plannedStroke } = planned;
      const { char, inputChar, inputIndex } = input;
      const fingers = chosen?.[actionPosition]
        ?? strokeFingerChoices(plannedStroke, holders)[0];
      const triggerKeys = action.triggerKeys;
      const aggregationGroupId = action.input.aggregationGroupId;
      const modifierKeys = new Set(
        action.input.roles
          .filter((role) => role.role === 'modifier')
          .map((role) => resolveKeyId(role.key)),
      );
      const pressedModifierKeys = [...new Set(action.keys.map(resolveKeyId))]
        .filter((key) => modifierKeys.has(key));
      const pairedTriggerKeys = pressedModifierKeys.length >= 2
        ? triggerKeys.filter((key) => modifierKeys.has(resolveKeyId(key)))
        : [];
      const byFinger = new Map<Finger, Key[]>();
      plannedStroke.keys.forEach((key, slot) => {
        const finger = fingers[slot];
        const group = byFinger.get(finger);
        if (group) group.push(key);
        else byFinger.set(finger, [key]);
      });

      const inputDistanceByFinger = new Map<Finger, number>();
      const presses: Press[] = [...byFinger].map(([finger, keys]) => {
        const target = targetOf(finger, keys);
        const gap = index - last[finger] - 1;
        const previousInputEnd = lastInputEnd[finger];
        const inputDistance = Number.isFinite(previousInputEnd)
          ? Math.max(0, input.start - previousInputEnd)
          : Number.POSITIVE_INFINITY;
        inputDistanceByFinger.set(finger, inputDistance);
        const at = prev[finger];
        return {
          finger,
          keys,
          target,
          gap,
          inputDistance,
          distance: 0,
          // 仮の値。距離と同時に採用した候補の起点で置き換える
          origin: { at: target, from: 'home' as const },
          sfb: gap === 0 && (at.x !== target.x || at.y !== target.y),
        };
      });

      // 押さえ続けているキーを押した指。この打鍵で押すキーはこの打鍵の指、前から押さえているキーは前に押した指
      const heldFingerOf = (id: string): Finger | undefined => {
        const slot = plannedStroke.keys.findIndex((key) => key.id === id);
        if (slot >= 0) return fingers[slot];
        return holders.get(id) ?? geometry.keys.get(id)?.finger;
      };

      const participations = normalizeParticipations(
        presses,
        action.outputKeys,
        action.triggerKeys,
        action.heldKeys,
        action.holdPhase,
        geometry,
        heldFingerOf,
      );

      let total = 0;
      for (const press of presses) {
        const decision = decidePress(
          press.finger,
          press.target,
          prev[press.finger],
          geometry.homes[press.finger],
          press.gap === 0,
          inputDistanceByFinger.get(press.finger) ?? Number.POSITIVE_INFINITY,
          selectionPolicy,
        );
        press.distance = decision.distance;
        press.origin = decision.stay
          ? { at: { ...prev[press.finger] }, from: 'previous' }
          : { at: { ...geometry.homes[press.finger] }, from: 'home' };
        if (decision.stay) {
          restoreStaySnapshots(
            strokes,
            last[press.finger],
            index,
            press.finger,
            prev[press.finger],
          );
        }
        total += press.distance;
      }
      for (const press of presses) {
        prev[press.finger] = press.target;
        last[press.finger] = index;
        lastInputEnd[press.finger] = input.end;
      }

      const heldByFinger = new Map<Finger, Key[]>();
      const nextHolders = new Map<string, Finger>();
      for (const heldId of action.heldKeys) {
        const id = resolveKeyId(heldId);
        const key = geometry.keys.get(id);
        const finger = heldFingerOf(id);
        if (key === undefined || finger === undefined) continue;
        nextHolders.set(id, finger);
        const keys = heldByFinger.get(finger);
        if (keys) keys.push(key);
        else heldByFinger.set(finger, [key]);
      }
      const pressedFingers = new Set(presses.map((press) => press.finger));
      for (const [finger, keys] of heldByFinger) {
        if (pressedFingers.has(finger)) continue;
        prev[finger] = targetOf(finger, keys);
        last[finger] = index;
        lastInputEnd[finger] = input.end;
      }
      holders.clear();
      for (const [id, finger] of nextHolders) holders.set(id, finger);

      const positions = snapshot(prev, last, index, geometry);
      strokes.push({
        index,
        char,
        inputChar,
        inputIndex,
        kanaStart: input.start,
        kanaEnd: input.end,
        selectionIndex: currentInputOrdinal,
        aggregationGroupId,
        classifications: action.input.classifications,
        triggerKeys,
        pairedTriggerKeys,
        participations,
        presses,
        distance: total,
        positions,
      });
      index++;
    });
  }

  return {
    strokes,
    skipped,
    inputChars: [...text].length,
    comboHits,
    comboDefinitions,
    layerDefinitions,
    errors,
  };
}

interface PlannedAction {
  readonly action: RealizedSemanticAction;
  readonly stroke: PlannedStroke;
}

interface PlannedGeneratedInput extends PlannedInput {
  readonly char: string;
  readonly inputChar: string;
  readonly inputIndex: number;
  readonly ordinal: number;
  readonly actions: readonly PlannedAction[];
}

function normalizeParticipations(
  presses: readonly Press[],
  outputKeys: readonly string[],
  triggerKeys: readonly string[],
  heldTriggerKeys: readonly string[],
  holdPhase: HoldPhase | undefined,
  geometry: Geometry,
  heldFingerOf: (id: string) => Finger | undefined,
): readonly StrokeParticipation[] {
  const outputs = new Set(outputKeys.map(resolveKeyId));
  const triggers = new Set(triggerKeys.map(resolveKeyId));
  const held = new Set(heldTriggerKeys.map(resolveKeyId));
  const byFinger = new Map<Finger, { keys: Key[]; roles: Set<ParticipationRole> }>();

  const entry = (finger: Finger) => {
    const existing = byFinger.get(finger);
    if (existing) return existing;
    const created = { keys: [] as Key[], roles: new Set<ParticipationRole>() };
    byFinger.set(finger, created);
    return created;
  };

  for (const press of presses) {
    const current = entry(press.finger);
    for (const key of press.keys) {
      if (!current.keys.some((candidate) => candidate.id === key.id)) current.keys.push(key);
      if (outputs.has(key.id)) current.roles.add('output');
      if (triggers.has(key.id)) current.roles.add('trigger');
      if (held.has(key.id)) current.roles.add('held-trigger');
    }
  }

  for (const keyId of held) {
    const key = geometry.keys.get(keyId);
    const finger = heldFingerOf(keyId);
    if (!key || finger === undefined) continue;
    const current = entry(finger);
    if (!current.keys.some((candidate) => candidate.id === key.id)) current.keys.push(key);
    current.roles.add('held-trigger');
  }

  return [...byFinger].map(([finger, value]) => ({
    hand: finger.startsWith('L') ? 'left' : 'right',
    finger,
    keys: value.keys,
    roles: [...value.roles],
    ...(value.roles.has('held-trigger') && holdPhase !== undefined ? { holdPhase } : {}),
  }));
}

/**
 * logical outputの合法なcanonical path群から今回のphysical realizationを選ぶ。
 * authoring defaultは先頭。preferOppositeThumbはkey rewriteせずpath selectionとして適用する。
 */
function thumbVariantSignature(
  alternative: InputAlternative,
  thumbKeys: ReadonlySet<string>,
): string {
  return inputAlternativeSelectionIdentity(
    alternative,
    (key) => thumbKeys.has(resolveKeyId(key)) ? '<thumb>' : resolveKeyId(key),
  );
}

/**
 * authoring defaultを基準に、同じpathの合法なthumb variantだけを比較する。
 * non-thumb alternativeや別方式alternativeはpreferOppositeThumbでは選ばない。
 */
function shiftVariantSignature(
  alternative: InputAlternative,
  shiftKeys: ReadonlySet<string>,
): string {
  return inputAlternativeSelectionIdentity(
    alternative,
    (key) => shiftKeys.has(resolveKeyId(key)) ? '<shift>' : resolveKeyId(key),
  );
}

function oppositeHandShiftScore(
  alternative: InputAlternative,
  shiftKeys: ReadonlySet<string>,
  geometry: Geometry,
): number {
  let value = 0;
  for (const realization of alternative.baseRealizations) {
    const triggerShifts = (realization.defaultTriggerKeys ?? [])
      .map(resolveKeyId)
      .filter((key) => shiftKeys.has(key));
    if (triggerShifts.length === 0) continue;

    const outputHands = nonThumbHands(
      realization.defaultOutputKeys
        .map(resolveKeyId)
        .filter((key) => !shiftKeys.has(key)),
      geometry,
    );
    if (outputHands.size !== 1) continue;
    const outputHand = [...outputHands][0];

    for (const shift of triggerShifts) {
      const finger = geometry.keys.get(shift)?.finger;
      if (finger === undefined) continue;
      const shiftHand = finger.startsWith('L') ? 'left' : 'right';
      value += shiftHand !== outputHand ? 1 : -1;
    }
  }
  return value;
}

function selectInputAlternative(
  alternatives: InputAlternativeSet,
  layout: Layout,
  geometry: Geometry,
  options: TracePolicy,
): InputAlternative {
  let fallback = alternatives[0];
  if (!fallback) throw new Error('canonical input alternativeが空');

  const shiftKeys = new Set((layout.shiftKeys ?? []).map(resolveKeyId));
  if (shiftKeys.size >= 2) {
    const family = shiftVariantSignature(fallback, shiftKeys);
    let selected = fallback;
    let bestScore = oppositeHandShiftScore(fallback, shiftKeys, geometry);
    for (const alternative of alternatives.slice(1)) {
      if (shiftVariantSignature(alternative, shiftKeys) !== family) continue;
      const score = oppositeHandShiftScore(alternative, shiftKeys, geometry);
      if (score > bestScore) {
        selected = alternative;
        bestScore = score;
      }
    }
    fallback = selected;
  }

  const thumbKeys = new Set((layout.thumbShiftKeys ?? []).map(resolveKeyId));
  if (!options.preferOppositeThumb || thumbKeys.size < 2) return fallback;

  const score = (alternative: InputAlternative): number => {
    let value = 0;
    for (const realization of alternative.baseRealizations) {
      const triggerThumbs = (realization.defaultTriggerKeys ?? [])
        .map(resolveKeyId)
        .filter((key) => thumbKeys.has(key));
      if (triggerThumbs.length === 0) continue;

      const outputHands = nonThumbHands(
        realization.defaultOutputKeys
          .map(resolveKeyId)
          .filter((key) => !thumbKeys.has(key)),
        geometry,
      );
      if (outputHands.size !== 1) continue;
      const outputHand = [...outputHands][0];

      for (const thumb of triggerThumbs) {
        const finger = geometry.keys.get(thumb)?.finger;
        if (finger !== 'LT' && finger !== 'RT') continue;
        const thumbHand = finger === 'LT' ? 'left' : 'right';
        value += thumbHand !== outputHand ? 1 : -1;
      }
    }
    return value;
  };

  if (score(fallback) > 0) return fallback;

  const fallbackSignature = thumbVariantSignature(fallback, thumbKeys);
  let selected = fallback;
  let bestOppositeScore = score(fallback);

  for (const alternative of alternatives) {
    if (thumbVariantSignature(alternative, thumbKeys) !== fallbackSignature) continue;
    const candidateScore = score(alternative);
    if (candidateScore > bestOppositeScore) {
      selected = alternative;
      bestOppositeScore = candidateScore;
    }
  }
  return selected;
}

function nonThumbHands(
  keys: readonly string[],
  geometry: Geometry,
): Set<'left' | 'right'> {
  return new Set(
    keys
      .map((key) => geometry.keys.get(resolveKeyId(key))?.finger)
      .filter((finger): finger is Finger => finger !== undefined && finger !== 'LT' && finger !== 'RT')
      .map((finger) => finger.startsWith('L') ? 'left' as const : 'right' as const),
  );
}

interface RomajiChunkRange {
  start: number;
  end: number;
  kana: string;
  /** ローマ字テーブルの見出しに当たって展開された塊か（かな由来） */
  fromTable: boolean;
  /** 綴りの単位の最初のかなの、テキストの中の位置 */
  kanaStart: number;
  kanaLength: number;
}

function alternativeContextSatisfied(
  requirements: readonly InputContextRequirement[],
  cursor: number,
  end: number,
  chars: string[],
  chunks: RomajiChunkRange[],
  romajiInput: boolean,
): boolean {
  return requirements.every((requirement) => {
    if (requirement.kind === 'youon-only') {
      return canFireYouonOnlyCombo(cursor, chars, chunks);
    }
    if (requirement.kind === 'romaji-input') {
      // 入力が覆う塊がすべてかな由来の時だけ成立する（仕様 §4.3）。
      // ローマ字を経ない打ち方では配列ごと外すのが主経路で、ここは二重の守り。
      return romajiInput && coveredByKana(cursor, end, chunks);
    }
    return false;
  });
}

function coveredByKana(start: number, end: number, chunks: RomajiChunkRange[]): boolean {
  return chunks
    .filter((chunk) => chunk.start < end && start < chunk.end)
    .every((chunk) => chunk.fromTable);
}

function canFireYouonOnlyCombo(cursor: number, chars: string[], chunks: RomajiChunkRange[]): boolean {
  if (cursor === 0 || !/[bcdfghjklmnpqrstvwxyz]/.test(chars[cursor - 1])) return false;
  return chunks.some((chunk) => chunk.kanaLength > 1 && chunk.start < cursor && cursor < chunk.end);
}

const EVALUATION_CHAR_ALIASES: Readonly<Record<string, string>> = {
  '！': '!',
  '？': '?',
};

const normalizeEvaluationChar = (char: string): string =>
  EVALUATION_CHAR_ALIASES[char] ?? char;

function record(errors: string[], seen: Set<string>, message: string) {
  if (seen.has(message)) return;
  seen.add(message);
  errors.push(message);
}

/**
 * 仕様 §10。ステップiの押下直後の全指位置。
 * そのステップで押した指は目標位置、それ以外はホームを既定とする。
 * 後続の同指打鍵で「残す」が選ばれた区間だけ、先行スナップショットを
 * restoreStaySnapshotsが前回キーへ戻す。
 */
function snapshot(
  prev: Record<Finger, Point>,
  last: Record<Finger, number>,
  index: number,
  geometry: Geometry,
): Record<Finger, Point> {
  const out = {} as Record<Finger, Point>;
  for (const finger of ALL_FINGERS) {
    out[finger] = last[finger] === index ? prev[finger] : geometry.homes[finger];
  }
  return out;
}

/** 後続の同指打鍵で残留が確定した区間を、前回キー位置へ戻す。 */
function restoreStaySnapshots(
  strokes: Stroke[],
  previousIndex: number,
  currentIndex: number,
  finger: Finger,
  position: Point,
): void {
  if (!Number.isFinite(previousIndex)) return;
  for (const stroke of strokes) {
    if (stroke.index <= previousIndex) continue;
    if (stroke.index >= currentIndex) break;
    stroke.positions[finger] = position;
  }
}
