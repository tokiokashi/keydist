import type { Command } from '#input/commands/index.ts';
import {
  addPreset,
  appendImportedPresets,
  applyPresetValues,
  deletePreset,
  renamePreset,
  type PresetIdGenerator,
  type PresetLibrary,
} from '#input/presets/index.ts';
import { levelOverrides, type CascadeLevel, type LevelOverrides } from '#input/settings/index.ts';
import type { KeydistAssets } from './commands.ts';
import { SETTINGS_ITEMS, type SettingsValueMap } from './settings-items.ts';

/**
 * プリセットのコマンド。書き込みはすべてコマンドを通す（Undoが効く）。
 * `level`は今は全体だけを渡す想定だが、引数に取る形にしてある（Workspaceのレベルを足す時に
 * コマンドの形を変えずに済む）。プリセット自体はレベルを持たない。
 *
 * 保存・名前の変更・削除・読み込みは`presetLibrary`だけに触れ、流し込みだけが`setupLibrary`
 * （カスケードの上書き）に触れる。
 */

/** 名前が使えない（trimして空）時に`rejected`が運ぶ理由。 */
export interface InvalidPresetNameError {
  readonly kind: 'invalid-preset-name';
}

type PresetLibraryComputation =
  | { readonly ok: true; readonly library: PresetLibrary<SettingsValueMap> }
  | { readonly ok: false; readonly reason: unknown };

function presetLibraryCommand(
  label: string,
  compute: (library: PresetLibrary<SettingsValueMap>) => PresetLibraryComputation,
): Command<KeydistAssets> {
  return (current) => {
    const result = compute(current.presetLibrary);
    if (!result.ok) return { kind: 'rejected', reason: result.reason };
    if (result.library === current.presetLibrary) return { kind: 'no-op' };
    return { kind: 'applied', label, changes: { presetLibrary: result.library } };
  };
}

const INVALID_NAME: InvalidPresetNameError = { kind: 'invalid-preset-name' };

/** 指定レベルの今の上書きを、名前を付けてプリセットに保存する（末尾に追加）。 */
export function savePresetCommand(
  name: string,
  level: CascadeLevel,
  generateId: PresetIdGenerator,
): Command<KeydistAssets> {
  return (current) => {
    const values = levelOverrides(current.setupLibrary.overrides, level);
    const next = addPreset(current.presetLibrary, name, values, generateId);
    if (next === undefined) return { kind: 'rejected', reason: INVALID_NAME };
    return { kind: 'applied', label: 'プリセットを保存する', changes: { presetLibrary: next } };
  };
}

export function renamePresetCommand(id: string, name: string): Command<KeydistAssets> {
  return presetLibraryCommand('プリセットの名前を変える', (library) => {
    const next = renamePreset(library, id, name);
    return next === undefined ? { ok: false, reason: INVALID_NAME } : { ok: true, library: next };
  });
}

export function deletePresetCommand(id: string): Command<KeydistAssets> {
  return presetLibraryCommand('プリセットを削除する', (library) => ({ ok: true, library: deletePreset(library, id) }));
}

/**
 * 読み込み（追加のみ）。常に新しいidで足し、同名は「名前 2」のように番号を付ける。
 * 既存のプリセットを上書きせず、流し込みもしない。ファイルの入口（読み取り・診断）は別で、
 * ここへ渡るのはcodecを通った値。
 */
export function importPresetsCommand(
  incoming: readonly { readonly name: string; readonly values: LevelOverrides<SettingsValueMap> }[],
  generateId: PresetIdGenerator,
): Command<KeydistAssets> {
  return presetLibraryCommand('プリセットを読み込む', (library) => ({
    ok: true,
    library: appendImportedPresets(library, incoming, generateId),
  }));
}

/** 流し込みの計算結果。画面が「入れなかった項目」を読むために、コマンドと同じ計算を公開する。 */
export type PresetApplicationPlan =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ready'; readonly library: KeydistAssets['setupLibrary']; readonly skipped: readonly string[] };

export function planPresetApplication(
  assets: Pick<KeydistAssets, 'setupLibrary' | 'presetLibrary'>,
  id: string,
  level: CascadeLevel,
): PresetApplicationPlan {
  const preset = assets.presetLibrary.presets.find((entry) => entry.id === id);
  if (preset === undefined) return { kind: 'not-found' };
  const applied = applyPresetValues(SETTINGS_ITEMS, assets.setupLibrary.overrides, level, preset.values);
  // 上書きが変わらなければ参照も据え置く（no-op判定）
  const library = applied.overrides === assets.setupLibrary.overrides
    ? assets.setupLibrary
    : { ...assets.setupLibrary, overrides: applied.overrides };
  return { kind: 'ready', library, skipped: applied.skipped };
}

/**
 * プリセットを指定レベルへ流し込む（置き換え）。プリセットに無い項目は上書きを消して既定へ戻り、
 * 既定と同じ値は上書きとして残らない。レベルが許さない項目は入れない（入れなかった項目は
 * `planPresetApplication`で読む）。1コマンドなのでUndoの1回で流し込む前へ戻る。
 */
export function applyPresetCommand(id: string, level: CascadeLevel): Command<KeydistAssets> {
  return (current) => {
    const plan = planPresetApplication(current, id, level);
    if (plan.kind === 'not-found') return { kind: 'no-op' };
    if (plan.library === current.setupLibrary) return { kind: 'no-op' };
    return { kind: 'applied', label: 'プリセットを流し込む', changes: { setupLibrary: plan.library } };
  };
}
