import type { CascadeOverrides } from '#input/settings/index.ts';
import type { Setup, SetupIdGenerator } from './types.ts';
import { copySetupOverrides, dropSetupOverrides } from './overrides.ts';
import { effectiveLabel } from './naming.ts';

/**
 * Setupの手持ち（資産の集合）とカスケードの上書きをセットで扱う。Setup固有の上書きは
 * `overrides.setup[id]` に入っている（overrides.ts参照）ため、Setupの削除・複製は
 * この2つを同時に操作しないと整合が取れない。コマンド層（`engine/commands.ts`）はこれらの
 * 純関数を呼ぶだけになる想定。
 *
 * **規約: 変化が無ければ同一の`SetupLibrary`参照を返す。** コマンド層は「呼んだ純関数が
 * 渡した参照をそのまま返したか」で「何もしなかった（no-op）」を判定する（存在しないidの
 * 操作等）。`Array.prototype.filter`/`map`は対象が無くても新しい配列を作ってしまうので、
 * 各関数は「そもそも何もしない」と分かった時点で早期に`library`自身を返す。
 */
export interface SetupLibrary<V> {
  readonly setups: readonly Setup[];
  readonly overrides: CascadeOverrides<V>;
}

/**
 * 次に付けるSetupの番号。手持ちの最大＋1にする。他のSetupを削除しても残りの番号は変わらず、
 * 空いた番号へ詰めることもしない（画面上の番号が、他のSetupの削除で変わらないようにするため）。
 * 最大の番号を消した直後に作ると、その番号が再び付く。消した番号は覚えない
 * （保存・共有している参照が無いため）。全部削除して空になった時は1から振り直す。
 */
export function nextSetupNumber(setups: readonly Setup[]): number {
  return setups.reduce((max, setup) => Math.max(max, setup.number), 0) + 1;
}

export function createSetup<V>(
  library: SetupLibrary<V>,
  layoutId: string,
  shapeId: string,
  generateId: SetupIdGenerator,
  rawLabel?: string,
): SetupLibrary<V> {
  const label = effectiveLabel(rawLabel);
  const number = nextSetupNumber(library.setups);
  const setup: Setup = label === undefined
    ? { id: generateId(), number, layoutId, shapeId }
    : { id: generateId(), number, layoutId, shapeId, label };
  return { setups: [...library.setups, setup], overrides: library.overrides };
}

/**
 * Setupを複製する。「配列も物理配列も同じSetupを2つ作れる」のと同じく、
 * 複製直後は元と同じ配列・物理配列・上書きを持つ独立したSetupになる
 * （以後どちらかを変えても他方には影響しない）。
 * 複製元が存在しないidなら何もしない（値として無視する。例外にしない方針）。
 */
export function duplicateSetup<V>(
  library: SetupLibrary<V>,
  sourceSetupId: string,
  generateId: SetupIdGenerator,
  rawLabel?: string,
): SetupLibrary<V> {
  const label = effectiveLabel(rawLabel);
  const source = library.setups.find((setup) => setup.id === sourceSetupId);
  if (source === undefined) return library;

  const id = generateId();
  const number = nextSetupNumber(library.setups);
  const duplicated: Setup = label === undefined
    ? { id, number, layoutId: source.layoutId, shapeId: source.shapeId }
    : { id, number, layoutId: source.layoutId, shapeId: source.shapeId, label };

  return {
    setups: [...library.setups, duplicated],
    overrides: copySetupOverrides(library.overrides, sourceSetupId, id),
  };
}

/**
 * Setupを削除する。そのSetup固有の上書き（カスケードのsetupレベル）も一緒に消す。
 * 対象のidが存在しない場合は`library`をそのまま返す（`duplicateSetup`と同じ
 * 「変化が無ければ同一参照を返す」規約。コマンド層（`engine/commands.ts`）はこの
 * 参照の一致でno-opを判定するため、`filter`が常に新しい配列を作ってしまう問題を
 * ここで吸収する）。
 */
export function deleteSetup<V>(library: SetupLibrary<V>, setupId: string): SetupLibrary<V> {
  if (!library.setups.some((setup) => setup.id === setupId)) return library;
  return {
    setups: library.setups.filter((setup) => setup.id !== setupId),
    overrides: dropSetupOverrides(library.overrides, setupId),
  };
}

/**
 * ラベルを付け直す。`undefined` を渡すとラベルを消し、表示名は自動生成に戻る。
 * 対象が存在しない、または既に同じラベルなら`library`をそのまま返す（`deleteSetup`と
 * 同じ規約。`map`も対象が無くても新しい配列を作ってしまうため）。
 */
export function relabelSetup<V>(
  library: SetupLibrary<V>,
  setupId: string,
  rawLabel: string | undefined,
): SetupLibrary<V> {
  // 空白だけのラベルは見出しとして読めないので、ラベル無し（自動命名）として保存する。
  const label = effectiveLabel(rawLabel);
  const target = library.setups.find((setup) => setup.id === setupId);
  if (target === undefined || target.label === label) return library;
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
