import { resolveKeyId } from './geometry.ts';
import { faceCells } from './layers.ts';
import type { Face, Layout } from './layouts/index.ts';

export interface KeyPatternMatch {
  output: string;
  group?: string;
  keys: readonly string[];
  /** Face由来のtriggerキー。順序制約の判定に使う。 */
  triggerKeys?: readonly string[];
  /** triggerが出力キーより先/後である必要がある場合の順序制約。 */
  triggerOrder?: 'prefix' | 'suffix';
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

function faceTriggerOrder(face: Face): 'prefix' | 'suffix' | undefined {
  if (face.triggerOrder !== undefined) return face.triggerOrder;
  if (face.mode === 'prefix' || face.mode === 'suffix') return face.mode;
  return undefined;
}

/**
 * 表示用に、直接入力・レイヤー・composition Face・withCombosをすべて
 * 「物理キー集合 -> 出力」のフラットな表へ展開する。
 *
 * triggerなしの1キー直接入力もexact判定へ含める。これにより、かな配列で
 * 単打がすでに確定している状態と、未確定の途中状態を区別できる。
 */
export function buildKeyPatternMatrix(layout: Layout): readonly KeyPatternMatch[] {
  const matrix: KeyPatternMatch[] = [];
  const seen = new Set<string>();

  const add = (
    keys: readonly string[],
    output: string,
    options: {
      group?: string;
      triggerKeys?: readonly string[];
      triggerOrder?: 'prefix' | 'suffix';
    } = {},
  ) => {
    if (output === '') return;
    const normalized = uniqueKeys(keys);
    if (normalized.length === 0) return;
    const triggerKeys = options.triggerKeys === undefined
      ? undefined
      : uniqueKeys(options.triggerKeys);
    const signature = [
      [...normalized].sort().join('\u0000'),
      output,
      options.group ?? '',
      triggerKeys === undefined ? '' : [...triggerKeys].sort().join('\u0000'),
      options.triggerOrder ?? '',
    ].join('\u0001');
    if (seen.has(signature)) return;
    seen.add(signature);
    matrix.push({
      output,
      ...(options.group === undefined ? {} : { group: options.group }),
      keys: normalized,
      ...(triggerKeys === undefined ? {} : { triggerKeys }),
      ...(options.triggerOrder === undefined ? {} : { triggerOrder: options.triggerOrder }),
    });
  };

  // 1キーで完結する直接入力。空選択時には照合しないため、候補表示を増やさず
  // 「すでに確定している」状態の判定だけに使える。
  for (const [output, sequence] of layout.map) {
    if (sequence.length !== 1) continue;
    const keys = uniqueKeys(sequence[0]);
    if (keys.length !== 1) continue;
    add(keys, output);
  }

  for (const face of layout.faces ?? []) {
    if (face.trigger.length === 0) continue;
    const triggerKeys = face.trigger.map(resolveKeyId);
    const triggerOrder = faceTriggerOrder(face);
    for (const [key, output] of faceCells(face)) {
      add([...triggerKeys, key], output, { triggerKeys, triggerOrder });
    }
  }

  for (const combo of layout.resolvedComboDefinitions ?? []) {
    add(combo.keys, combo.output, { group: combo.group });
  }

  return matrix;
}

function exactAllowedByOrder(
  match: KeyPatternMatch,
  selected: ReadonlySet<string>,
): boolean {
  if (match.triggerOrder === undefined || match.triggerKeys === undefined) return true;

  const triggers = new Set(match.triggerKeys);
  const ordered = [...selected];
  const triggerPositions = ordered
    .map((key, index) => triggers.has(key) ? index : -1)
    .filter((index) => index >= 0);
  const outputPositions = ordered
    .map((key, index) => !triggers.has(key) ? index : -1)
    .filter((index) => index >= 0);
  if (triggerPositions.length === 0 || outputPositions.length === 0) return true;

  return match.triggerOrder === 'prefix'
    ? Math.max(...triggerPositions) < Math.min(...outputPositions)
    : Math.min(...triggerPositions) > Math.max(...outputPositions);
}

function candidateAllowedByOrder(
  match: KeyPatternMatch,
  selected: ReadonlySet<string>,
  missing: string,
): boolean {
  if (match.triggerOrder === undefined || match.triggerKeys === undefined) return true;

  const triggers = new Set(match.triggerKeys);
  if (match.triggerOrder === 'prefix') {
    // prefixはtriggerを先に選び切った後で、出力キーだけを候補にする。
    return !triggers.has(missing) && [...selected].every((key) => triggers.has(key));
  }

  // suffixは出力キーを先に選んだ後で、trigger側だけを候補にする。
  return triggers.has(missing) && [...selected].some((key) => !triggers.has(key));
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
 * composition、複数キーtriggerはここではレイヤー扱いしない。
 */
export function findActiveLayerFace(layout: Layout, selected: ReadonlySet<string>): Face | undefined {
  if (selected.size === 0) return undefined;
  return (layout.faces ?? []).find((face) => {
    if (face.trigger.length !== 1 || face.inputRole === 'composition') return false;
    return selected.size === 1 && selected.has(resolveKeyId(face.trigger[0]));
  });
}

/** ガイド表示用: 配列が持つ全triggerキー（層操作・コンボ問わず）の物理キーid集合。 */
export function allTriggerKeys(layout: Layout): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const face of layout.faces ?? []) {
    for (const trigger of face.trigger) keys.add(resolveKeyId(trigger));
  }
  for (const combo of layout.resolvedComboDefinitions ?? []) {
    for (const key of combo.keys) keys.add(key);
  }
  return keys;
}
