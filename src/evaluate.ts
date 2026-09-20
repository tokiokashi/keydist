import { ALL_FINGERS, dist, resolveKeyId, type Finger, type Geometry, type Key, type Point } from './geometry.ts';
import {
  COMBO_LAYER_ID,
  SINGLE_LAYER_ID,
  type HoldPhase,
  type LayerDefinition,
  type Layout,
} from './layouts/types.ts';
import { kanaToRomajiChunks } from './romaji/kunrei.ts';
import {
  applyActionRealizationPolicy,
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  realizeTriggerActions,
  type ActionRealizationPolicy,
  type InputAlternative,
  type InputAlternativeSet,
  type InputClassification,
  type InputContextRequirement,
  type TriggerHoldState,
  type TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';

export interface Options {
  /** 窓幅N（打鍵単位）。この打鍵数までは残す候補を比較する */
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

export const DEFAULT_OPTIONS: Options = {
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

/** 1ステップの中の1指分の押下 */
export interface Press {
  finger: Finger;
  /** この指が同時に押すキー。1本の指でキーの間を押す場合は複数になる */
  keys: Key[];
  /** 指の目標位置。キーが複数なら重心（§4.2） */
  target: Point;
  /** 前回この指を使ってから挟まったステップ数 */
  gap: number;
  /** この押下で計上された移動距離 [u] */
  distance: number;
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
  /** このステップに含まれるキー押下の帰属先。合成文字ではステップごとに異なりうる */
  layerId: string;
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
  /** 配列が持つコンボ見出しのうち、評価中に命中した見出し（命中ごとに1件） */
  comboHits: string[];
  /** 配列が持つコンボ見出しの定義数 */
  comboDefinitions: number;
  /** 層・コンボの定義。評価対象外の未使用層も含む */
  layerDefinitions: LayerDefinition[];
  /** 配列定義の不備。同一ステップ内で同じ指が複数のキーを要求された場合など */
  errors: string[];
}

/**
 * 仕様 §9。テキストを打鍵ステップ列へ展開し、各押下の移動距離を求める。
 *
 * g = 0        → d_stay               （同指連続。戻る時間がない）
 * 1 ≤ g ≤ N    → min(d_stay, d_home)  （残す選択肢が比較に入る）
 * g > N        → d_home               （復帰済み）
 *
 * ホームへの復帰移動そのものは計上しない（§7 R2）。
 * 同時押しステップは1ステップとして数え、距離は各指の単純和を採る。
 */
export function evaluate(
  text: string,
  layout: Layout,
  geometry: Geometry,
  options: Options = DEFAULT_OPTIONS,
): Trace {
  const prev = {} as Record<Finger, Point>;
  const last = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    prev[finger] = geometry.homes[finger];
    last[finger] = Number.NEGATIVE_INFINITY;
  }

  const strokes: Stroke[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const comboHits: string[] = [];
  const resolvedComboDefinitions = layout.resolvedComboDefinitions ?? [];
  const comboDefinitions = resolvedComboDefinitions.length
    || layout.comboConditions?.size
    || 0;
  const layerTriggerKeys = new Map<string, Set<string>>();
  for (const face of layout.faces ?? []) {
    const layerId = layout.faceLayerIds?.get(face);
    if (layerId === undefined || face.trigger.length !== 1) continue;
    const keys = layerTriggerKeys.get(layerId) ?? new Set<string>();
    keys.add(resolveKeyId(face.trigger[0]));
    layerTriggerKeys.set(layerId, keys);
  }
  const layerDefinitions = [...layout.layerDefinitions ?? [{
    id: SINGLE_LAYER_ID,
    kind: 'layer' as const,
    label: '単打',
  }]];
  if (comboDefinitions > 0 && !layerDefinitions.some((definition) => definition.id === COMBO_LAYER_ID)) {
    layerDefinitions.push({ id: COMBO_LAYER_ID, kind: 'combo', label: 'コンボ' });
  }
  let skipped = 0;
  let index = 0;
  let triggerHoldState: TriggerHoldState | undefined;

  // ローマ字配列はかなテキストを展開してから打つ。コンボの誤命中を防ぐため、
  // 展開前の単位も残しておく。かな配列はそのまま打つ。
  const chunks = layout.romajiTable ? kanaToRomajiChunks(text, layout.romajiTable) : undefined;
  const chars = chunks
    ? chunks.flatMap((chunk) => [...chunk.roman.toLowerCase()])
    : [...text.toLowerCase()];
  const chunkRanges: RomajiChunkRange[] = [];
  if (chunks) {
    let start = 0;
    for (const chunk of chunks) {
      const length = [...chunk.roman.toLowerCase()].length;
      chunkRanges.push({
        start,
        end: start + length,
        kana: chunk.kana,
        kanaLength: [...chunk.kana].length,
      });
      start += length;
    }
  }
  // 見出しが複数文字ありうる配列（コンボや拗音）は最長一致で切り出す
  const maxLen = Math.max(1, layout.maxCharLength ?? 1);

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
          chars,
          chunkRanges,
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
    const inputStart = cursor;
    const inputEnd = cursor + consumed;
    const inputChar = chunks
      ? chunkRanges
        .filter((range) => range.start < inputEnd && inputStart < range.end)
        .map((range) => range.kana)
        .join('')
      : char;
    const inputIndex = chunks
      ? chunkRanges.find((range) => range.start < inputEnd && inputStart < range.end)?.start ?? inputStart
      : inputStart;
    cursor += consumed;

    const selectedAlternative = selectInputAlternative(
      alternatives,
      layout,
      geometry,
      options,
    );
    if (selectedAlternative.origin === 'combo') comboHits.push(char);

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

    for (const action of actions) {
      const step = action.keys;
      const triggerKeys = action.triggerKeys;
      const layerId = action.input.layerId;
      const layerTriggers = layerTriggerKeys.get(layerId) ?? new Set<string>();
      const pressedLayerTriggers = [...new Set(step.map(resolveKeyId))]
        .filter((key) => layerTriggers.has(key));
      const pairedTriggerKeys = pressedLayerTriggers.length >= 2
        ? triggerKeys.filter((key) => layerTriggers.has(key))
        : [];
      const byFinger = new Map<Finger, Key[]>();

      for (const id of step) {
        const key = geometry.keys.get(resolveKeyId(id));
        if (!key) {
          record(errors, seen, `キー ${id} が形状に存在しない（文字「${char}」）`);
          continue;
        }
        const group = byFinger.get(key.finger);
        if (group) group.push(key);
        else byFinger.set(key.finger, [key]);
      }

      const presses: Press[] = [...byFinger].map(([finger, keys]) => {
        const target = centroid(keys);
        const gap = index - last[finger] - 1;
        const at = prev[finger];
        return {
          finger,
          keys,
          target,
          gap,
          distance: 0,
          sfb: gap === 0 && (at.x !== target.x || at.y !== target.y),
        };
      });

      if (presses.length === 0) continue;

      const participations = normalizeParticipations(
        presses,
        action.outputKeys,
        action.triggerKeys,
        action.heldKeys,
        action.holdPhase,
        geometry,
      );

      let total = 0;
      for (const press of presses) {
        const decision = pressCost(press, prev, geometry, options);
        press.distance = decision.distance;
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
      }

      const pressedFingers = new Set(presses.map((press) => press.finger));
      for (const [finger, keys] of heldKeysByFinger(action.heldKeys, geometry)) {
        if (pressedFingers.has(finger)) continue;
        prev[finger] = centroid(keys);
        last[finger] = index;
      }

      const positions = snapshot(prev, last, index, geometry);
      strokes.push({
        index,
        char,
        inputChar,
        inputIndex,
        layerId,
        classifications: action.input.classifications,
        triggerKeys,
        pairedTriggerKeys,
        participations,
        presses,
        distance: total,
        positions,
      });
      index++;
    }
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

function normalizeParticipations(
  presses: readonly Press[],
  outputKeys: readonly string[],
  triggerKeys: readonly string[],
  heldTriggerKeys: readonly string[],
  holdPhase: HoldPhase | undefined,
  geometry: Geometry,
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
    if (!key) continue;
    const current = entry(key.finger);
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

function heldKeysByFinger(
  heldTriggerKeys: readonly string[],
  geometry: Geometry,
): Map<Finger, Key[]> {
  const byFinger = new Map<Finger, Key[]>();
  for (const id of heldTriggerKeys) {
    const key = geometry.keys.get(resolveKeyId(id));
    if (!key) continue;
    const keys = byFinger.get(key.finger);
    if (keys) keys.push(key);
    else byFinger.set(key.finger, [key]);
  }
  return byFinger;
}

/**
 * logical outputの合法なcanonical path群から今回のphysical realizationを選ぶ。
 * authoring defaultは先頭。preferOppositeThumbはkey rewriteせずpath selectionとして適用する。
 */
function thumbVariantSignature(
  alternative: InputAlternative,
  thumbKeys: ReadonlySet<string>,
): string {
  const normalizeKey = (key: string) =>
    thumbKeys.has(resolveKeyId(key)) ? '<thumb>' : resolveKeyId(key);
  const normalizeKeys = (keys: readonly string[]) =>
    keys.map(normalizeKey).sort();

  return JSON.stringify({
    semanticInputs: alternative.semanticInputs.map((input) => ({
      output: input.output,
      physicalKeys: normalizeKeys(input.physicalKeys),
      requirements: input.requirements.map((requirement) =>
        requirement.kind === 'overlap'
          ? { kind: 'overlap', keys: normalizeKeys(requirement.keys) }
          : {
              kind: 'order',
              before: normalizeKeys(requirement.before),
              after: normalizeKeys(requirement.after),
            }),
      capabilities: input.capabilities.map((capability) => ({
        kind: capability.kind,
        keys: normalizeKeys(capability.keys),
      })),
      layerId: input.layerId,
      classifications: [...input.classifications],
      roles: input.roles.map((role) => ({
        key: normalizeKey(role.key),
        role: role.role,
      })),
      faceMemberships: input.faceMemberships,
    })),
    contextRequirements: alternative.contextRequirements,
    origin: alternative.origin,
    baseRealizations: alternative.baseRealizations.map((realization) => ({
      actions: realization.actions.map(normalizeKeys),
      defaultOutputKeys: normalizeKeys(realization.defaultOutputKeys),
      defaultTriggerKeys: normalizeKeys(realization.defaultTriggerKeys ?? []),
      defaultHoldKeys: normalizeKeys(realization.defaultHoldKeys ?? []),
      alternateParticipations: (realization.alternateParticipations ?? []).map((view) => ({
        outputKeys: normalizeKeys(view.outputKeys),
        triggerKeys: normalizeKeys(view.triggerKeys),
        holdKeys: normalizeKeys(view.holdKeys ?? []),
      })),
    })),
  });
}

/**
 * authoring defaultを基準に、同じpathの合法なthumb variantだけを比較する。
 * non-thumb alternativeや別方式alternativeはpreferOppositeThumbでは選ばない。
 */
function selectInputAlternative(
  alternatives: InputAlternativeSet,
  layout: Layout,
  geometry: Geometry,
  options: Options,
): InputAlternative {
  const fallback = alternatives[0];
  if (!fallback) throw new Error('canonical input alternativeが空');

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
  let bestOppositeScore = 0;

  for (const alternative of alternatives.slice(1)) {
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
  kanaLength: number;
}

function alternativeContextSatisfied(
  requirements: readonly InputContextRequirement[],
  cursor: number,
  chars: string[],
  chunks: RomajiChunkRange[],
): boolean {
  return requirements.every((requirement) => {
    if (requirement.kind === 'youon-only') {
      return canFireYouonOnlyCombo(cursor, chars, chunks);
    }
    return false;
  });
}

function canFireYouonOnlyCombo(cursor: number, chars: string[], chunks: RomajiChunkRange[]): boolean {
  if (cursor === 0 || !/[bcdfghjklmnpqrstvwxyz]/.test(chars[cursor - 1])) return false;
  return chunks.some((chunk) => chunk.kanaLength > 1 && chunk.start < cursor && cursor < chunk.end);
}

interface CostDecision {
  distance: number;
  /** gの候補比較でd_stayが選ばれたか */
  stay: boolean;
}

function pressCost(
  press: Press,
  prev: Record<Finger, Point>,
  geometry: Geometry,
  options: Options,
): CostDecision {
  const { finger, target, gap } = press;
  const home = geometry.homes[finger];
  const dStay = dist(prev[finger], target);
  const dHome = dist(home, target);

  if (gap === 0) {
    const onHome = target.x === home.x && target.y === home.y;
    return {
      distance: !options.sfbHomeCost && onHome ? 0 : dStay,
      stay: true,
    };
  }
  if (gap <= options.windowSize) {
    // 同値は既存のminの結果を維持し、「残す」側に寄せる。
    const stay = dStay <= dHome;
    return { distance: stay ? dStay : dHome, stay };
  }
  return { distance: dHome, stay: false };
}

/** 複数キーを1本の指で押す場合の目標位置。キーの重心を採る */
function centroid(keys: Key[]): Point {
  if (keys.length === 1) return { x: keys[0].x, y: keys[0].y };
  const n = keys.length;
  return {
    x: keys.reduce((a, k) => a + k.x, 0) / n,
    y: keys.reduce((a, k) => a + k.y, 0) / n,
  };
}

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
