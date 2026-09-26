import type { Command } from '#input/commands/index.ts';
import type { CascadeLevel } from '#input/settings/index.ts';
import {
  createSetup,
  deleteSetup,
  duplicateSetup,
  relabelSetup,
  type SetupIdGenerator,
  type SetupLibrary,
} from '#input/setup/index.ts';
import {
  resetSettingsItem,
  resetSettingsLevel,
  setSettingsOverride,
  type SettingsItemId,
  type SettingsValueMap,
} from './settings-items.ts';

/**
 * このリポジトリが今持つ資産の集合（#544 Phase 2「コマンドによる書き込み」）。
 *
 * 資産は当面 `setupLibrary`（`SetupLibrary<SettingsValueMap>`）の1つだけにする。
 * Setupの手持ち（`setups`）とカスケードの上書き（`overrides`）を分けて2資産にする案も
 * あったが、採らなかった: Setupの削除・複製は「Setup本体の一覧」と「そのSetup固有の
 * カスケード上書き（`overrides.setup[id]`）」を同時に書き換えないと整合しない
 * （`input/setup/collection.ts` の `deleteSetup` / `duplicateSetup` 参照）。2資産に
 * 分けると、この2つを常にペアで扱うコマンドを毎回書く必要が生じ、"複数資産に触れる
 * コマンド"を1項目として原子的に積む仕組み（`applyCommand`）を使えばよいだけの話を
 * 複雑にする。`SetupLibrary` は元からこの2つを1つの値として扱う型なので、資産の粒度も
 * それに合わせるのが素直。Workspaceなど将来の資産は、この資産とは独立に読み書きできる
 * ものが増えた時点で新しいキーとして足す（先回りして今は足さない）。
 */
export interface KeydistAssets {
  readonly setupLibrary: SetupLibrary<SettingsValueMap>;
}

type SetupLibraryComputation =
  | { readonly ok: true; readonly library: SetupLibrary<SettingsValueMap> }
  | { readonly ok: false; readonly reason: unknown };

/**
 * `setupLibrary` だけに触れるコマンドの共通の骨組み。`compute` が失敗を報告したら
 * `rejected` に、`compute` が渡された参照をそのまま返したら（=何もしなかったら）
 * `no-op` に変換する。実際の値の変化があるかどうかの最終判定（`Object.is` での比較）は
 * `applyCommand` 側（`input/commands/history.ts`）が担うので、ここでは「呼び出した
 * 純関数が何と言ったか」だけを`CommandOutcome`の形に写す。
 */
function setupLibraryCommand(
  label: string,
  compute: (library: SetupLibrary<SettingsValueMap>) => SetupLibraryComputation,
): Command<KeydistAssets> {
  return (current) => {
    const result = compute(current.setupLibrary);
    if (!result.ok) return { kind: 'rejected', reason: result.reason };
    if (result.library === current.setupLibrary) return { kind: 'no-op' };
    return { kind: 'applied', label, changes: { setupLibrary: result.library } };
  };
}

/** カスケードの上書きを1項目・1レベルへ書き込む（レベル指定は必須。#544 §8-2）。 */
export function setCascadeOverrideCommand<K extends SettingsItemId>(
  level: CascadeLevel,
  itemId: K,
  value: SettingsValueMap[K],
): Command<KeydistAssets> {
  return setupLibraryCommand(`設定を変更する: ${itemId}`, (library) => {
    const result = setSettingsOverride(library.overrides, level, itemId, value);
    if (!result.ok) return { ok: false, reason: result.error };
    return { ok: true, library: { ...library, overrides: result.overrides } };
  });
}

/**
 * 1項目・1レベルの上書きだけを消す。`resetItem`は消すものが無ければ同じ`overrides`参照を
 * 返す（`input/settings/reset.ts`）ので、それをそのまま`setupLibrary`のno-op判定に伝える
 * ため、変化が無い時は`library`自体も同じ参照を返す（`{...library, overrides}`で毎回
 * 新しいオブジェクトを作ると、中身が同じでも「変わった」と誤判定されてしまうため）。
 */
export function resetCascadeItemCommand(level: CascadeLevel, itemId: SettingsItemId): Command<KeydistAssets> {
  return setupLibraryCommand(`設定をリセットする: ${itemId}`, (library) => {
    const overrides = resetSettingsItem(library.overrides, level, itemId);
    if (overrides === library.overrides) return { ok: true, library };
    return { ok: true, library: { ...library, overrides } };
  });
}

/** 1レベルの上書きを全項目まとめて消す。no-op判定の理由は`resetCascadeItemCommand`と同じ。 */
export function resetCascadeLevelCommand(level: CascadeLevel): Command<KeydistAssets> {
  return setupLibraryCommand('レベルの設定をまとめてリセットする', (library) => {
    const overrides = resetSettingsLevel(library.overrides, level);
    if (overrides === library.overrides) return { ok: true, library };
    return { ok: true, library: { ...library, overrides } };
  });
}

/** Setupを新規作成する。 */
export function createSetupCommand(
  layoutId: string,
  shapeId: string,
  generateId: SetupIdGenerator,
  label?: string,
): Command<KeydistAssets> {
  return setupLibraryCommand('Setupを作成する', (library) => ({
    ok: true,
    library: createSetup(library, layoutId, shapeId, generateId, label),
  }));
}

/** Setupを複製する。複製元が存在しない場合は何もしない（`duplicateSetup` 自身の方針）。 */
export function duplicateSetupCommand(
  sourceSetupId: string,
  generateId: SetupIdGenerator,
  label?: string,
): Command<KeydistAssets> {
  return setupLibraryCommand('Setupを複製する', (library) => ({
    ok: true,
    library: duplicateSetup(library, sourceSetupId, generateId, label),
  }));
}

/**
 * Setupを削除する。存在しないidの削除は何もしない扱いにする。`deleteSetup` 自身は
 * 存在しないidでも（該当なしの）新しい配列参照を返してしまう（`Array.prototype.filter`は
 * 何も落とさなくても新しい配列を作るため）ので、ここで「該当のSetupがあるか」を先に見て
 * no-opを自分で判定する（`duplicateSetup`のように呼び出し先が同一参照を返す形に揃っていない
 * ため、コマンド側で吸収する）。
 */
export function deleteSetupCommand(setupId: string): Command<KeydistAssets> {
  return setupLibraryCommand('Setupを削除する', (library) => {
    if (!library.setups.some((setup) => setup.id === setupId)) return { ok: true, library };
    return { ok: true, library: deleteSetup(library, setupId) };
  });
}

/**
 * Setupのラベルを付け直す。対象が存在しない、または既に同じラベルなら何もしない
 * （`relabelSetup`も`deleteSetup`と同じ理由でno-opを自分で返さないので、ここで判定する）。
 */
export function relabelSetupCommand(setupId: string, label: string | undefined): Command<KeydistAssets> {
  return setupLibraryCommand('Setupのラベルを変更する', (library) => {
    const target = library.setups.find((setup) => setup.id === setupId);
    if (target === undefined || target.label === label) return { ok: true, library };
    return { ok: true, library: relabelSetup(library, setupId, label) };
  });
}
