import { resolveKeyId } from './geometry.ts';
import { displayTriggerKeys } from './layers.ts';
import type { Requirement } from './core/semantic-input/types.ts';
import { COMBO_LAYER_ID, type Face, type Layout } from './layouts/types.ts';

type OrderRequirement = Extract<Requirement, { kind: 'order' }>;

export interface KeyPatternMatch {
  output: string;
  group?: string;
  keys: readonly string[];
  /** canonical Requirementから取り出した押下順序制約。 */
  orderRequirements?: readonly OrderRequirement[];
}

export interface KeyPatternResult {
  /** 選択中の物理キー集合と完全一致した出力。 */
  exact: readonly KeyPatternMatch[];
  /** あと1キー選べば成立する出力の、候補キーごとの一覧。 */
  candidates: ReadonlyMap<string, readonly KeyPatternMatch[]>;
}

const isSubset = (subset: ReadonlySet<string>, superset: ReadonlySet<string>): boolean =>
  [...subset].every((key) => superset.has(key));

const uniqueKeys = (keys: readonly string[]): string[] => [...new Set(keys.map(resolveKeyId))];

const keySignature = (keys: readonly string[]): string =>
  [...new Set(keys.map(resolveKeyId))].sort().join('\u0000');

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
      if (alternative.semanticInputs.length !== 1) continue;
      const input = alternative.semanticInputs[0];
      if (input.physicalKeys.length === 0) continue;

      const keys = uniqueKeys(input.physicalKeys);
      const orderRequirements = input.requirements
        .filter((requirement): requirement is OrderRequirement => requirement.kind === 'order');
      const group = alternative.origin === 'combo'
        ? comboGroupForCanonicalPath(layout, output, keys)
        : undefined;
      const signature = [
        keySignature(keys),
        output,
        group ?? '',
        JSON.stringify(orderRequirements),
      ].join('\u0001');
      if (seen.has(signature)) continue;
      seen.add(signature);

      matrix.push({
        output,
        ...(group === undefined ? {} : { group }),
        keys,
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
    const beforePositions = requirement.before.map((key) => ordered.indexOf(key));
    const afterPositions = requirement.after.map((key) => ordered.indexOf(key));
    if (beforePositions.some((index) => index < 0) || afterPositions.some((index) => index < 0)) {
      return false;
    }
    return Math.max(...beforePositions) < Math.min(...afterPositions);
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
 * 完全一致はexactへ、現在の集合にちょうど1キー足せば成立するものだけを
 * candidatesへ返す。prefix / suffixはtriggerの先後制約も候補方向へ反映する。
 */
export function matchKeyPatterns(layout: Layout, selected: ReadonlySet<string>): KeyPatternResult {
  const exact: KeyPatternMatch[] = [];
  const candidates = new Map<string, KeyPatternMatch[]>();
  if (selected.size === 0) return { exact, candidates };

  const addCandidate = (key: string, match: KeyPatternMatch) => {
    const list = candidates.get(key);
    if (list) list.push(match);
    else candidates.set(key, [match]);
  };

  for (const match of buildKeyPatternMatrix(layout)) {
    const keySet = new Set(match.keys);
    if (!isSubset(selected, keySet)) continue;

    if (keySet.size === selected.size) {
      if (exactAllowedByOrder(match, selected)) exact.push(match);
      continue;
    }

    if (keySet.size !== selected.size + 1) continue;
    const missing = match.keys.find((key) => !selected.has(key));
    if (missing !== undefined && candidateAllowedByOrder(match, selected, missing)) {
      addCandidate(missing, match);
    }
  }

  return { exact, candidates };
}

/**
 * 候補の一覧をキー上の表示へまとめる。
 * 同じ追加キーで複数の定義が成立する場合も、定義が存在すること自体を
 * 配列図から読めるよう、畳まずすべて列挙する。
 */
export function summarizeCandidateMatches(matches: readonly KeyPatternMatch[]): string {
  return matches.map((match) => match.output).join(' / ');
}

/**
 * 選択中のキーが単一キーのレイヤートリガー（シフト面など）に一致するなら、その面を返す。
 * 枠色を既存のレイヤー色へ揃えるための表示補助にだけ使う。
 * aggregation帰属はfaceLayerIdsをauthorityとし、combo・複数キーtriggerは除外する。
 */
export function findActiveLayerFace(layout: Layout, selected: ReadonlySet<string>): Face | undefined {
  if (selected.size !== 1 || !layout.faces) return undefined;
  if (!layout.faceLayerIds) {
    throw new Error('Face表示にはfaceLayerIdsの明示が必要');
  }
  return layout.faces.find((face) => {
    const layerId = layout.faceLayerIds?.get(face);
    if (layerId === undefined) {
      throw new Error('Face表示には全FaceのfaceLayerIds明示が必要');
    }
    if (layerId === COMBO_LAYER_ID || face.trigger.length !== 1) return false;
    return displayTriggerKeys(face).some((key) => selected.has(key));
  });
}

/** ガイド表示用: 配列が持つ全triggerキー（層操作・コンボ問わず）の物理キーid集合。 */
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
