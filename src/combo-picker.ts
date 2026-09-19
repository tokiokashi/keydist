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
 * その面が定義する出力だけを見る。配列によっては左右の親指シフトが別々の面に
 * 分かれることもあるが、それぞれの面が両手分の出力を自分で完結して持つのが
 * 配列定義の作法（新下駄の左右親指シフトなど）なので、UI側で複数面を推測して
 * 合成することはしない。合成が必要なら配列定義自体に書くべき情報だから。
 * コンボ（inputRole==='composition'、または複数キーtrigger）はここでは扱わない。
 */
export function findActiveLayerFace(layout: Layout, selected: ReadonlySet<string>): Face | undefined {
  if (selected.size === 0) return undefined;
  return (layout.faces ?? []).find((face) => {
    if (face.trigger.length !== 1 || face.inputRole === 'composition') return false;
    return selected.has(resolveKeyId(face.trigger[0]));
  });
}

/**
 * 暫定対応（issue #261）。選択中のレイヤーFace（例: 新下駄の中指シフトd）と、
 * 他のシフト系Face（例: 同k, 薬指シフトl/s）の間には、本来同じ物理操作
 * （dとkの同時押し等）が両方のFace定義に非対称にしか書かれていないケースがある
 * （kFaceのd列には出力があるが、dFaceのk列には無い、等）。
 * 既存の層別ヒートマップ（layers.tsのfoldedLayerCells）はこれを表示側で推測して
 * 埋め合わせており、ここではレイヤーピッカーの表示にも同じ推測を及ばせる。
 * 配列定義（#261）が直り次第、この関数と呼び出し側は削除する。
 */
export function crossTriggerAnnotations(layout: Layout, activeFace: Face): ReadonlyMap<string, string> {
  const annotations = new Map<string, string>();
  const activeTriggerKey = activeFace.trigger[0];
  if (activeFace.trigger.length !== 1 || activeTriggerKey === undefined) return annotations;
  const activeKey = resolveKeyId(activeTriggerKey);
  const activeCells = faceCells(activeFace);

  for (const face of layout.faces ?? []) {
    if (face === activeFace) continue;
    if (face.trigger.length !== 1 || face.inputRole === 'composition' || face.mode !== activeFace.mode) continue;
    const otherKey = resolveKeyId(face.trigger[0]);
    // 相手の面の中に「activeFaceのtrigger」に対応する列があれば、相手の面自身の
    // triggerキーの位置へ注記する（例: lFaceのd列にある出力を、l自身の位置に示す）
    const fromOther = faceCells(face).get(activeKey);
    if (fromOther !== undefined) annotations.set(otherKey, fromOther);
    // 逆に、activeFace自身の中に「相手のtrigger」に対応する列があれば、activeFace
    // 自身のtriggerキーの位置へ注記する（既存の層別図が示す重複表示と同じ）
    const fromActive = activeCells.get(otherKey);
    if (fromActive !== undefined) annotations.set(activeKey, fromActive);
  }
  return annotations;
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
