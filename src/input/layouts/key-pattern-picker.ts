import { resolveKeyId } from './geometry.ts';
import {
  classifyPresentationFaces,
  matchesDisplayTriggerAlternative,
  orderedPresentationLayers,
} from './layers.ts';
import type { Requirement } from './core/semantic-input/types.ts';
import type { Face, Layout } from './layouts/types.ts';

type OrderRequirement = Extract<Requirement, { kind: 'order' }>;

export interface KeyPatternMatch {
  output: string;
  group?: string;
  keys: readonly string[];
  aggregationGroupId: string;
  /** authoring realizationが持つtrigger view。reciprocal等では複数あり得る。 */
  triggerKeyVariants: readonly (readonly string[])[];
  /** trigger viewのうちwhile-heldとして継続できるphysical key集合。 */
  holdKeyVariants: readonly (readonly string[])[];
  /** canonical Requirementから取り出した押下順序制約。 */
  orderRequirements?: readonly OrderRequirement[];
}

export interface KeyPatternResult {
  /** 選択中の物理キー集合と完全一致した出力。 */
  exact: readonly KeyPatternMatch[];
  /** あと1キー選べば成立する出力の、候補キーごとの一覧。 */
  candidates: ReadonlyMap<string, readonly KeyPatternMatch[]>;
  /**
   * 現在の選択からcanonical pathを壊さず次に押せるphysical key。
   * 3-key以上ではまだoutputが確定しない中間キーも含む。
   */
  continuations: ReadonlyMap<string, readonly KeyPatternMatch[]>;
}

export interface KeyPatternTriggerActivation {
  readonly aggregationGroupId: string;
  readonly triggerKeys: readonly string[];
}

export interface KeyPatternPresentationState {
  /** 現在のgestureをlegacy pickerへ渡すpress順付きphysical key列。 */
  readonly selectedKeys: readonly string[];
  /** release後も次の1打まで有効なone-shot trigger。 */
  readonly oneShotActivations: readonly KeyPatternTriggerActivation[];
  /** 現在presentation上activeなaggregation。 */
  readonly activeAggregationGroupIds: readonly string[];
}

export const EMPTY_KEY_PATTERN_PRESENTATION_STATE: KeyPatternPresentationState = {
  selectedKeys: [],
  oneShotActivations: [],
  activeAggregationGroupIds: [],
};

export interface KeyPatternPresentationEvent {
  readonly type: 'down' | 'up';
  readonly key: string;
}

export interface KeyPatternPresentationResult {
  readonly pressedKeys: readonly string[];
  readonly recognized: readonly unknown[];
}

interface PresentationTriggerPattern extends KeyPatternTriggerActivation {
  readonly persistence: 'one-shot' | 'while-pressed' | 'while-held';
  readonly specificity: number;
}

const isSubset = (subset: ReadonlySet<string>, superset: ReadonlySet<string>): boolean =>
  [...subset].every((key) => superset.has(key));

const uniqueKeys = (keys: readonly string[]): string[] => [...new Set(keys.map(resolveKeyId))];

const keySignature = (keys: readonly string[]): string =>
  [...new Set(keys.map(resolveKeyId))].sort().join('\u0000');

const uniqueKeyVariants = (
  variants: readonly (readonly string[])[],
): readonly (readonly string[])[] => {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const variant of variants) {
    const keys = uniqueKeys(variant);
    if (keys.length === 0) continue;
    const signature = keySignature(keys);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(keys);
  }
  return result;
};

function comboGroupForCanonicalPath(
  layout: Layout,
  output: string,
  keys: readonly string[],
): string | undefined {
  const signature = keySignature(keys);
  return layout.resolvedComboDefinitions?.find((combo) =>
    combo.output === output
    && (combo.keyVariants ?? [combo.keys]).some((keys) => keySignature(keys) === signature)
  )?.group;
}

/**
 * canonical input pathを「物理キー集合 -> 出力」の表示用マトリクスへ展開する。
 *
 * pickerは1 SemanticInputで完結するpathだけを扱う。複数stepのsequence/composed
 * pathは従来同様このUIの対象外。押下順序はFaceModeを再解釈せずRequirement.orderを使う。
 */
export function buildKeyPatternMatrix(layout: Layout): readonly KeyPatternMatch[] {
  const matrix: KeyPatternMatch[] = [];
  const seen = new Set<string>();

  for (const [output, alternatives] of layout.canonicalInputs) {
    for (const alternative of alternatives) {
      if (
        alternative.semanticInputs.length !== 1
        || alternative.baseRealizations.length !== 1
      ) continue;
      const input = alternative.semanticInputs[0];
      const realization = alternative.baseRealizations[0];
      if (input.physicalKeys.length === 0) continue;

      const keys = uniqueKeys(input.physicalKeys);
      const orderRequirements = input.requirements
        .filter((requirement): requirement is OrderRequirement => requirement.kind === 'order');
      const group = alternative.origin === 'combo'
        ? comboGroupForCanonicalPath(layout, output, keys)
        : undefined;
      const participations = [
        {
          triggerKeys: realization.defaultTriggerKeys ?? [],
          holdKeys: realization.defaultHoldKeys ?? [],
        },
        ...(realization.alternateParticipations ?? []).map((view) => ({
          triggerKeys: view.triggerKeys,
          holdKeys: view.holdKeys ?? [],
        })),
      ];
      const triggerKeyVariants = uniqueKeyVariants(
        participations.map((view) => view.triggerKeys),
      );
      const holdKeyVariants = uniqueKeyVariants(
        participations.map((view) => view.holdKeys),
      );
      const signature = [
        keySignature(keys),
        output,
        input.aggregationGroupId,
        group ?? '',
        JSON.stringify(orderRequirements),
        JSON.stringify(triggerKeyVariants.map(keySignature)),
        JSON.stringify(holdKeyVariants.map(keySignature)),
      ].join('\u0001');
      if (seen.has(signature)) continue;
      seen.add(signature);

      matrix.push({
        output,
        ...(group === undefined ? {} : { group }),
        keys,
        aggregationGroupId: input.aggregationGroupId,
        triggerKeyVariants,
        holdKeyVariants,
        ...(orderRequirements.length === 0 ? {} : { orderRequirements }),
      });
    }
  }

  return matrix;
}

function exactAllowedByOrder(
  match: KeyPatternMatch,
  selected: ReadonlySet<string>,
): boolean {
  if (match.orderRequirements === undefined) return true;

  const ordered = [...selected];
  return match.orderRequirements.every((requirement) => {
    const beforePositions = requirement.before.map((key) => ordered.indexOf(resolveKeyId(key)));
    const afterPositions = requirement.after.map((key) => ordered.indexOf(resolveKeyId(key)));
    if (beforePositions.some((index) => index < 0) || afterPositions.some((index) => index < 0)) {
      return false;
    }
    return Math.max(...beforePositions) < Math.min(...afterPositions);
  });
}

/**
 * まだ未入力keyが残るpathについて、既知のpress順だけで既にorder違反していないかを見る。
 * after側を先に押してbefore側が未入力なら、そのpathは以降成立しない。
 */
function partialAllowedByOrder(
  match: KeyPatternMatch,
  selected: ReadonlySet<string>,
): boolean {
  if (match.orderRequirements === undefined) return true;

  const ordered = [...selected];
  return match.orderRequirements.every((requirement) => {
    const before = requirement.before.map(resolveKeyId);
    const after = requirement.after.map(resolveKeyId);
    const beforePositions = before.map((key) => ordered.indexOf(key));
    const afterPositions = after.map((key) => ordered.indexOf(key));
    const knownBefore = beforePositions.filter((index) => index >= 0);
    const knownAfter = afterPositions.filter((index) => index >= 0);

    if (knownAfter.length > 0 && knownBefore.length !== before.length) return false;
    if (knownBefore.length === 0 || knownAfter.length === 0) return true;
    return Math.max(...knownBefore) < Math.min(...knownAfter);
  });
}

function candidateAllowedByOrder(
  match: KeyPatternMatch,
  selected: ReadonlySet<string>,
  missing: string,
): boolean {
  if (match.orderRequirements === undefined) return true;
  return exactAllowedByOrder(match, new Set([...selected, missing]));
}

/**
 * 選択中の物理キー集合を表示用マトリクスへ照合する。
 *
 * - exact: 現在の集合で成立
 * - candidates: 次の1キーでoutput確定
 * - continuations: まだ確定しなくてもcanonical pathを継続できる次キー
 *
 * prefix / suffixはRequirement.orderだけをauthorityにして候補方向を制約する。
 */
export function matchKeyPatterns(layout: Layout, selected: ReadonlySet<string>): KeyPatternResult {
  const exact: KeyPatternMatch[] = [];
  const candidates = new Map<string, KeyPatternMatch[]>();
  const continuations = new Map<string, KeyPatternMatch[]>();
  if (selected.size === 0) return { exact, candidates, continuations };

  const add = (
    target: Map<string, KeyPatternMatch[]>,
    key: string,
    match: KeyPatternMatch,
  ) => {
    const list = target.get(key);
    if (list) list.push(match);
    else target.set(key, [match]);
  };

  for (const match of buildKeyPatternMatrix(layout)) {
    const keySet = new Set(match.keys);
    if (!isSubset(selected, keySet)) continue;
    if (!partialAllowedByOrder(match, selected)) continue;

    if (keySet.size === selected.size) {
      if (exactAllowedByOrder(match, selected)) exact.push(match);
      continue;
    }

    const missingKeys = match.keys.filter((key) => !selected.has(key));
    for (const missing of missingKeys) {
      const next = new Set([...selected, missing]);
      if (partialAllowedByOrder(match, next)) add(continuations, missing, match);
    }

    if (keySet.size !== selected.size + 1) continue;
    const missing = missingKeys[0];
    if (missing !== undefined && candidateAllowedByOrder(match, selected, missing)) {
      add(candidates, missing, match);
    }
  }

  return { exact, candidates, continuations };
}

/**
 * 候補の一覧をキー上の表示へまとめる。
 * 同じ追加キーで複数の定義が成立する場合も、定義が存在すること自体を
 * 配列図から読めるよう、畳まずすべて列挙する。
 */
export function summarizeCandidateMatches(
  matches: readonly Pick<KeyPatternMatch, 'output'>[],
): string {
  return [...new Set(matches.map((match) => match.output))].join(' / ');
}

function triggerPatterns(layout: Layout): readonly PresentationTriggerPattern[] {
  const definitions = new Map(
    (layout.layerDefinitions ?? []).map((definition) => [definition.id, definition] as const),
  );
  const patterns: PresentationTriggerPattern[] = [];
  const seen = new Set<string>();

  for (const match of buildKeyPatternMatrix(layout)) {
    if (definitions.get(match.aggregationGroupId)?.kind !== 'layer') continue;
    const holdSignatures = new Set(match.holdKeyVariants.map(keySignature));
    for (const triggerKeys of match.triggerKeyVariants) {
      const triggerSet = new Set(triggerKeys.map(resolveKeyId));
      const prefixOrdered = (match.orderRequirements ?? []).some((requirement) => {
        const before = requirement.before.map(resolveKeyId);
        return before.length > 0 && before.every((key) => triggerSet.has(key));
      });
      const persistence = holdSignatures.has(keySignature(triggerKeys))
        ? 'while-held'
        : prefixOrdered
          ? 'one-shot'
          : 'while-pressed';
      const signature = [
        match.aggregationGroupId,
        keySignature(triggerKeys),
        persistence,
      ].join('\u0001');
      if (seen.has(signature)) continue;
      seen.add(signature);
      patterns.push({
        aggregationGroupId: match.aggregationGroupId,
        triggerKeys,
        persistence,
        specificity: triggerKeys.length,
      });
    }
  }

  return patterns;
}

function completedTriggerPatterns(
  layout: Layout,
  selectedKeys: readonly string[],
  persistence: PresentationTriggerPattern['persistence'],
): readonly PresentationTriggerPattern[] {
  if (selectedKeys.length === 0) return [];
  const selected = new Set(selectedKeys.map(resolveKeyId));
  const matches = matchKeyPatterns(layout, selected);
  const viable = [...matches.exact, ...matches.continuations.values()].flat();
  const viableGroups = new Set(viable.map((match) => match.aggregationGroupId));

  return triggerPatterns(layout)
    .filter((pattern) =>
      pattern.persistence === persistence
      && viableGroups.has(pattern.aggregationGroupId)
      && pattern.triggerKeys.every((key) => selected.has(key)))
    .sort((left, right) => right.specificity - left.specificity);
}

function uniqueActivations(
  activations: readonly KeyPatternTriggerActivation[],
): readonly KeyPatternTriggerActivation[] {
  const seen = new Set<string>();
  return activations.filter((activation) => {
    const signature = [
      activation.aggregationGroupId,
      keySignature(activation.triggerKeys),
    ].join('\u0001');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function shouldKeepReleasedSelectionKey(
  releasedKey: string,
  oneShotActivations: readonly KeyPatternTriggerActivation[],
): boolean {
  const canonical = resolveKeyId(releasedKey);
  return oneShotActivations.some(
    (activation) => activation.triggerKeys.includes(canonical),
  );
}

function activeAggregationIds(
  oneShot: readonly KeyPatternTriggerActivation[],
  held: readonly PresentationTriggerPattern[],
): readonly string[] {
  const all = [
    ...oneShot.map((activation) => ({
      aggregationGroupId: activation.aggregationGroupId,
      specificity: activation.triggerKeys.length,
    })),
    ...held.map((pattern) => ({
      aggregationGroupId: pattern.aggregationGroupId,
      specificity: pattern.specificity,
    })),
  ];
  const maxSpecificity = Math.max(0, ...all.map((entry) => entry.specificity));
  return [...new Set(
    all
      .filter((entry) => entry.specificity === maxSpecificity)
      .map((entry) => entry.aggregationGroupId),
  )];
}

/**
 * Input Converter等の動的presentation用state machine。
 *
 * recognizer windowとは別に、
 * - one-shot triggerはrelease後も次の1打まで保持
 * - while-held triggerはphysical hold中だけ保持
 * - exact + longer pathが共存する場合はgesture guideだけ継続
 * を管理する。
 */
export function advanceKeyPatternPresentation(
  layout: Layout,
  previous: KeyPatternPresentationState,
  event: KeyPatternPresentationEvent,
  result: KeyPatternPresentationResult,
): KeyPatternPresentationState {
  const key = resolveKeyId(event.key);
  const pressed = new Set(result.pressedKeys.map(resolveKeyId));
  const previousSelected = [...previous.selectedKeys].map(resolveKeyId);
  const wasSelected = previousSelected.includes(key);

  let selectedKeys = [...previousSelected];
  let oneShot = [...previous.oneShotActivations];

  if (event.type === 'down' && !wasSelected) {
    const consumingOneShot = oneShot.length > 0;
    selectedKeys.push(key);

    if (consumingOneShot) {
      oneShot = [];
    } else {
      const newlyActive = completedTriggerPatterns(layout, selectedKeys, 'one-shot')
        .map((pattern): KeyPatternTriggerActivation => ({
          aggregationGroupId: pattern.aggregationGroupId,
          triggerKeys: pattern.triggerKeys,
        }));
      oneShot = [...uniqueActivations([...oneShot, ...newlyActive])];
    }
  } else if (event.type === 'up' && wasSelected) {
    if (!shouldKeepReleasedSelectionKey(key, oneShot)) {
      selectedKeys = selectedKeys.filter((selected) => selected !== key);
    }
  }

  const held = completedTriggerPatterns(
    layout,
    result.pressedKeys.map(resolveKeyId),
    'while-held',
  ).filter((pattern) => pattern.triggerKeys.every((triggerKey) => pressed.has(triggerKey)));
  const pressedGesture = result.recognized.length === 0
    ? completedTriggerPatterns(
      layout,
      result.pressedKeys.map(resolveKeyId),
      'while-pressed',
    ).filter((pattern) => pattern.triggerKeys.every((triggerKey) => pressed.has(triggerKey)))
    : [];

  if (result.recognized.length > 0) {
    const matches = matchKeyPatterns(layout, new Set(selectedKeys));
    if (matches.continuations.size === 0) {
      selectedKeys = result.pressedKeys
        .map(resolveKeyId)
        .filter((pressedKey) =>
          held.some((pattern) => pattern.triggerKeys.includes(pressedKey)));
    }
  }

  return {
    selectedKeys: [...new Set(selectedKeys)],
    oneShotActivations: oneShot,
    activeAggregationGroupIds: activeAggregationIds(oneShot, [...held, ...pressedGesture]),
  };
}

/**
 * 選択中の単一キーがpresentation上の単キーtrigger alternativeに一致するなら、その面を返す。
 * 枠色を既存のレイヤー色へ揃えるための表示補助にだけ使う。
 * semantic Face.triggerの形状は再解釈せず、presentation alternativeとのexact matchだけを見る。
 */
export function findActiveLayerFace(layout: Layout, selected: ReadonlySet<string>): Face | undefined {
  if (selected.size !== 1 || !layout.faces) return undefined;
  const groups = classifyPresentationFaces(layout);
  for (const layer of orderedPresentationLayers(groups)) {
    for (const face of layer.faces) {
      if (matchesDisplayTriggerAlternative(face, selected)) return face;
    }
  }
  return undefined;
}

/** ガイド表示用: canonical pathが持つtriggerキー集合。 */
export function allTriggerKeys(layout: Layout): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const realization of alternative.baseRealizations) {
        for (const key of realization.defaultTriggerKeys ?? []) keys.add(resolveKeyId(key));
        for (const view of realization.alternateParticipations ?? []) {
          for (const key of view.triggerKeys) keys.add(resolveKeyId(key));
        }
      }
      if (alternative.origin === 'combo' && alternative.semanticInputs.length === 1) {
        for (const key of alternative.semanticInputs[0].physicalKeys) keys.add(resolveKeyId(key));
      }
    }
  }
  return keys;
}


/**
 * 常時表示するlayer key。
 * canonical aggregation kind=layerのうち、単キーだけで成立するtrigger variantだけを返す。
 * 複合triggerの構成キーやcombo membershipは動的ガイドへ委ねる。
 */
export function allLayerTriggerKeys(layout: Layout): ReadonlySet<string> {
  const definitions = new Map(
    (layout.layerDefinitions ?? []).map((definition) => [definition.id, definition] as const),
  );
  const keys = new Set<string>();

  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      alternative.semanticInputs.forEach((input, index) => {
        const definition = definitions.get(input.aggregationGroupId);
        if (
          definition?.kind !== 'layer'
          || definition.presentationRole !== 'layer'
        ) return;
        const realization = alternative.baseRealizations[index];
        const addVariant = (variant: readonly string[]) => {
          const resolved = uniqueKeys(variant);
          if (resolved.length === 1) keys.add(resolved[0]);
        };
        addVariant(realization?.defaultTriggerKeys ?? []);
        for (const view of realization?.alternateParticipations ?? []) {
          addVariant(view.triggerKeys);
        }
      });
    }
  }

  return keys;
}
