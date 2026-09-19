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
  /** あと1キー選べば完成するコンボの、その相方キーごとの一覧。 */
  candidates: ReadonlyMap<string, readonly ComboPickerMatch[]>;
}

const isSubset = (subset: ReadonlySet<string>, superset: ReadonlySet<string>): boolean =>
  [...subset].every((key) => superset.has(key));

/**
 * 選択中の物理キー集合をtriggerに含みうるコンボを洗い出す。
 * 選択集合がコンボのtrigger全体と一致すれば確定出力、真部分集合なら
 * 「あと1キー選べば完成する」相方候補として返す。単発コンボ（Face）と
 * 規則化されたコンボ（withCombos由来のResolvedComboDefinition）の両方を見る。
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

  const consider = (keys: readonly string[], output: string, group?: string) => {
    if (keys.length <= 1 || output === '') return;
    const keySet = new Set(keys);
    if (!isSubset(selected, keySet)) return;
    const match: ComboPickerMatch = { output, group, keys };
    if (keySet.size === selected.size) {
      exact.push(match);
      return;
    }
    for (const key of keys) {
      if (!selected.has(key)) addCandidate(key, match);
    }
  };

  for (const face of layout.faces ?? []) {
    if (face.trigger.length <= 1) continue;
    consider(face.trigger.map(resolveKeyId), [...faceCells(face).values()].join(' / '));
  }

  for (const combo of layout.resolvedComboDefinitions ?? []) {
    consider(combo.keys, combo.output, combo.group);
  }

  return { exact, candidates };
}

/**
 * 相方候補の一覧を、キー上のツールチップに載せる文字列へまとめる。
 * 規則化されたコンボ（TK音直の拡張など）は同じキーに何件もぶら下がりうるが、
 * どの文字が出るか自体がカンペとして知りたい情報なので、件数で畳まず全部並べる。
 * ツールチップ側を折り返し表示にすることで、件数が多くても表示は崩れない。
 */
export function summarizeCandidateMatches(matches: readonly ComboPickerMatch[]): string {
  return matches.map((match) => match.output).join(' / ');
}

/**
 * 選択中のキーが単一キーのレイヤートリガー（シフト面など）に一致するなら、その面を返す。
 * コンボ（inputRole==='composition'、または複数キーtrigger）はここでは扱わない。
 * レイヤーが特定できれば、統合ヒートマップのレジェンドをそのレイヤーの出力へ
 * 差し替え、枠色も層別ヒートマップと同じ色に揃えるのに使う。
 */
export function findActiveLayerFace(layout: Layout, selected: ReadonlySet<string>): Face | undefined {
  if (selected.size === 0) return undefined;
  return (layout.faces ?? []).find((face) => {
    if (face.trigger.length !== 1 || face.inputRole === 'composition') return false;
    return selected.has(resolveKeyId(face.trigger[0]));
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
