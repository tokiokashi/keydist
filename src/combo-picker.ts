import { resolveKeyId } from './geometry.ts';
import { faceCells } from './layers.ts';
import type { Face, Layout } from './layouts/index.ts';

export interface ComboPickerMatch {
  output: string;
  group?: string;
  keys: readonly string[];
}

export interface ComboPickerResult {
  /** 選択中の物理キー集合と完全一致した出力。 */
  exact: readonly ComboPickerMatch[];
  /** あと1キー選べば完成する出力の、その相方キーごとの一覧。 */
  candidates: ReadonlyMap<string, readonly ComboPickerMatch[]>;
}

const isSubset = (subset: ReadonlySet<string>, superset: ReadonlySet<string>): boolean =>
  [...subset].every((key) => superset.has(key));

const uniqueKeys = (keys: readonly string[]): string[] => [...new Set(keys.map(resolveKeyId))];

/**
 * 表示用に、レイヤー・composition Face・withCombosをすべて
 * 「物理キー集合 -> 出力」のフラットな表へ展開する。
 *
 * Faceのtriggerと出力セルのキーを同じ集合に入れることで、
 * j+r -> じ と h+j+r -> じゃのような2段/3段の定義も区別せず扱える。
 * triggerなしの単打面は、選択開始後の候補表示には不要なので含めない。
 */
export function buildComboPickerMatrix(layout: Layout): readonly ComboPickerMatch[] {
  const matrix: ComboPickerMatch[] = [];
  const seen = new Set<string>();

  const add = (keys: readonly string[], output: string, group?: string) => {
    if (output === '') return;
    const normalized = uniqueKeys(keys);
    if (normalized.length <= 1) return;
    const signature = `${[...normalized].sort().join('\u0000')}\u0001${output}\u0001${group ?? ''}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    matrix.push({ output, group, keys: normalized });
  };

  for (const face of layout.faces ?? []) {
    if (face.trigger.length === 0) continue;
    const triggerKeys = face.trigger.map(resolveKeyId);
    for (const [key, output] of faceCells(face)) {
      add([...triggerKeys, key], output);
    }
  }

  for (const combo of layout.resolvedComboDefinitions ?? []) {
    add(combo.keys, combo.output, combo.group);
  }

  return matrix;
}

/**
 * 選択中の物理キー集合を、表示用マトリクスへ照合する。
 * 完全一致はexactへ、現在の集合にちょうど1キー足せば完成するものだけを
 * candidatesへ返す。2キー以上先の候補は、まだ表示を確定できないので出さない。
 */
export function matchCombos(layout: Layout, selected: ReadonlySet<string>): ComboPickerResult {
  const exact: ComboPickerMatch[] = [];
  const candidates = new Map<string, ComboPickerMatch[]>();
  if (selected.size === 0) return { exact, candidates };

  const addCandidate = (key: string, match: ComboPickerMatch) => {
    const list = candidates.get(key);
    if (list) list.push(match);
    else candidates.set(key, [match]);
  };

  for (const match of buildComboPickerMatrix(layout)) {
    const keySet = new Set(match.keys);
    if (!isSubset(selected, keySet)) continue;

    if (keySet.size === selected.size) {
      exact.push(match);
      continue;
    }

    if (keySet.size !== selected.size + 1) continue;
    const missing = match.keys.find((key) => !selected.has(key));
    if (missing !== undefined) addCandidate(missing, match);
  }

  return { exact, candidates };
}

/**
 * 相方候補の一覧をキー上の表示へまとめる。
 * 同じ追加キーで複数の定義が成立する場合も、定義が存在すること自体を
 * 配列図から読めるよう、畳まずすべて列挙する。
 */
export function summarizeCandidateMatches(matches: readonly ComboPickerMatch[]): string {
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
