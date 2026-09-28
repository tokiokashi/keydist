import type { CascadeOverrides } from '#input/settings/index.ts';
import type { Setup, SetupIdGenerator } from './types.ts';
import { copySetupOverrides, dropSetupOverrides } from './overrides.ts';
import { leastUsedColorIndex } from './color.ts';

/**
 * Setupの手持ち（資産の集合）とカスケードの上書きをセットで扱う。Setup固有の上書きは
 * `overrides.setup[id]` に入っている（overrides.ts参照）ため、Setupの削除・複製は
 * この2つを同時に操作しないと整合が取れない。コマンド層（後続の項目）はこれらの純関数を
 * 呼ぶだけになる想定。
 */
export interface SetupLibrary<V> {
  readonly setups: readonly Setup[];
  readonly overrides: CascadeOverrides<V>;
}

function colorIndexesOf(setups: readonly Setup[]): number[] {
  return setups.map((setup) => setup.colorIndex);
}

export function createSetup<V>(
  library: SetupLibrary<V>,
  layoutId: string,
  shapeId: string,
  generateId: SetupIdGenerator,
  label?: string,
): SetupLibrary<V> {
  const colorIndex = leastUsedColorIndex(colorIndexesOf(library.setups));
  const setup: Setup = label === undefined
    ? { id: generateId(), layoutId, shapeId, colorIndex }
    : { id: generateId(), layoutId, shapeId, colorIndex, label };
  return { setups: [...library.setups, setup], overrides: library.overrides };
}

/**
 * Setupを複製する。「配列も形状も同じSetupを2つ作れる」（#544 §4）のと同じく、
 * 複製直後は元と同じ配列・形状・上書きを持つ独立したSetupになる
 * （以後どちらかを変えても他方には影響しない）。色だけは複製元と別にする
 * （同じ配列・形状のSetupをポリシー違いで比べる用途で、色が同じでは区別できないため。
 * color.ts の `leastUsedColorIndex` 参照）。
 * 複製元が存在しないidなら何もしない（値として無視する。#544 §8-5と同じ「例外にしない」方針）。
 */
export function duplicateSetup<V>(
  library: SetupLibrary<V>,
  sourceSetupId: string,
  generateId: SetupIdGenerator,
  label?: string,
): SetupLibrary<V> {
  const source = library.setups.find((setup) => setup.id === sourceSetupId);
  if (source === undefined) return library;

  const id = generateId();
  const colorIndex = leastUsedColorIndex(colorIndexesOf(library.setups), source.colorIndex);
  const duplicated: Setup = label === undefined
    ? { id, layoutId: source.layoutId, shapeId: source.shapeId, colorIndex }
    : { id, layoutId: source.layoutId, shapeId: source.shapeId, colorIndex, label };

  return {
    setups: [...library.setups, duplicated],
    overrides: copySetupOverrides(library.overrides, sourceSetupId, id),
  };
}

/** Setupを削除する。そのSetup固有の上書き（カスケードのsetupレベル）も一緒に消す。 */
export function deleteSetup<V>(library: SetupLibrary<V>, setupId: string): SetupLibrary<V> {
  return {
    setups: library.setups.filter((setup) => setup.id !== setupId),
    overrides: dropSetupOverrides(library.overrides, setupId),
  };
}

/** ラベルを付け直す。`undefined` を渡すとラベルを消し、表示名は自動生成に戻る。 */
export function relabelSetup<V>(
  library: SetupLibrary<V>,
  setupId: string,
  label: string | undefined,
): SetupLibrary<V> {
  return {
    setups: library.setups.map((setup) => setup.id === setupId ? withLabel(setup, label) : setup),
    overrides: library.overrides,
  };
}

function withLabel(setup: Setup, label: string | undefined): Setup {
  if (label === undefined) {
    const { label: _drop, ...rest } = setup;
    return rest;
  }
  return { ...setup, label };
}
