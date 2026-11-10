import type { Command } from '#input/commands/index.ts';
import { appendImportedPresets, normalizePresetName, type PresetIdGenerator } from '#input/presets/index.ts';
import { isBuiltin } from '#input/romaji/rules.ts';
import { emptyCascadeOverrides, type LevelOverrides } from '#input/settings/index.ts';
import { stableStringify } from './cache-key.ts';
import type { KeydistAssets } from './commands.ts';
import type { SettingsValueMap } from './settings-items.ts';
import {
  EMPTY_USER_ASSETS_BUNDLE,
  isEmptyUserAssetsBundle,
  mergeUserAssets,
  type UserAssetImportEntry,
  type UserAssetsBundle,
  type UserAssetsHoldings,
} from './user-assets-file.ts';

/**
 * プリセットの書き出しに同梱する自作の資産と、読み込み時の参照の付け替え（DOMを使わない計算）。
 *
 * プリセットの値が自作の資産をidで指す項目は、ローマ字規則（`romajiRuleId`）と指の割り当て（`fingerAssignmentId`）の2つ。
 * 同梱するのは、書き出すプリセットの値が指す手元の自作のローマ字規則と指の割り当てだけ（組み込みの資産は入れない）。
 * 手元に無い資産を指す値は同梱する物が無いので、そのまま残す。
 * 読み込みは、同梱した資産を資産の読み込み（`mergeUserAssets`）と同じ規則で手元に突き合わせ、その対応をプリセットの値に当てる。
 */

type PresetValues = LevelOverrides<SettingsValueMap>;

/** プリセットの値が指す、自作のローマ字規則と指の割り当てのid。 */
function referencedIds(values: PresetValues): { readonly rule?: string; readonly finger?: string } {
  const record = values as Record<string, unknown>;
  return {
    ...(typeof record.romajiRuleId === 'string' && !isBuiltin(record.romajiRuleId) ? { rule: record.romajiRuleId } : {}),
    ...(typeof record.fingerAssignmentId === 'string' ? { finger: record.fingerAssignmentId } : {}),
  };
}

type PresetAssetHoldings = Pick<UserAssetsHoldings, 'userRomajiRules' | 'fingerAssignments'>;

/** 書き出すプリセットの値が指す、手元の自作の資産。手元の並びのまま。無ければ空。 */
export function presetAssetsOf(presets: readonly { readonly values: PresetValues }[], holdings: PresetAssetHoldings): UserAssetsBundle {
  const ruleIds = new Set<string>();
  const fingerIds = new Set<string>();
  for (const preset of presets) {
    const { rule, finger } = referencedIds(preset.values);
    if (rule !== undefined) ruleIds.add(rule);
    if (finger !== undefined) fingerIds.add(finger);
  }
  return {
    ...EMPTY_USER_ASSETS_BUNDLE,
    romajiRules: holdings.userRomajiRules.filter((rule) => ruleIds.has(rule.id)),
    fingerAssignments: holdings.fingerAssignments.filter((assignment) => fingerIds.has(assignment.id)),
  };
}

export interface ImportedPresetValues {
  readonly name: string;
  readonly values: PresetValues;
}

/** 突き合わせた資産の対応を、プリセットの値の2つの項目に当てる。対応に無いid（組み込み・同梱されなかったもの）は触らない。 */
function remapValues(
  values: PresetValues,
  maps: { readonly rules: ReadonlyMap<string, string>; readonly fingers: ReadonlyMap<string, string> },
): PresetValues {
  const { rule, finger } = referencedIds(values);
  const next: Record<string, unknown> = { ...values };
  if (rule !== undefined) next.romajiRuleId = maps.rules.get(rule) ?? rule;
  if (finger !== undefined) next.fingerAssignmentId = maps.fingers.get(finger) ?? finger;
  return next as PresetValues;
}

/**
 * 手元のプリセットが、読み込むプリセットと同じ名前と値かを比べる。読み込みは同名に番号を付けて足す（`appendImportedPresets`）ので、
 * 手元の名前は、読み込む名前そのものか、それに番号を付けた「名前 N」（Nは2以上）のどちらでもよい。idは比べない。
 */
function isSamePreset(existing: ImportedPresetValues, incoming: ImportedPresetValues, incomingValues: string): boolean {
  if (stableStringify(existing.values) !== incomingValues) return false;
  const base = normalizePresetName(incoming.name) ?? incoming.name;
  if (existing.name === base) return true;
  if (!existing.name.startsWith(`${base} `)) return false;
  const suffix = existing.name.slice(base.length + 1);
  return /^\d+$/.test(suffix) && Number(suffix) >= 2;
}

export interface PresetImportMerge {
  /** 手元に足すプリセット。資産の対応を当てた後で、手元に同じ名前と値のものがあるものは除く。 */
  readonly presets: readonly ImportedPresetValues[];
  /** 手元に同じ名前（番号付きの別名を含む）と値のものがあり、足さなかったプリセットの数。 */
  readonly skipped: number;
  /** 突き合わせた後の、手元の自作のローマ字規則と指の割り当て。 */
  readonly assets: PresetAssetHoldings;
  /** 同梱の資産の突き合わせの結果（ファイルの並びのまま）。 */
  readonly assetEntries: readonly UserAssetImportEntry[];
}

/**
 * 読み込んだプリセットと同梱の資産を、手元に突き合わせる。
 * 同梱は規則と指の割り当てだけを読む（プリセットの値が指すのはこの2つだけなので、他の種類が入っていても手元に足さない）。
 * 同じファイルを二度読むと、資産は同じ中身として足されず、プリセットは同じ名前と値のものが手元にあるので足されない。
 */
export function mergePresetImport(
  holdings: PresetAssetHoldings & { readonly presets: readonly ImportedPresetValues[] },
  incoming: readonly ImportedPresetValues[],
  bundle: UserAssetsBundle,
  stamp: string,
): PresetImportMerge {
  const own: UserAssetsBundle = { ...bundle, layouts: [], setups: [] };
  const merged = isEmptyUserAssetsBundle(own)
    ? undefined
    : mergeUserAssets(
        {
          userRomajiRules: holdings.userRomajiRules,
          fingerAssignments: holdings.fingerAssignments,
          userLayouts: [],
          setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
        },
        own,
        stamp,
      );
  const remapped = merged === undefined ? incoming : incoming.map((preset) => ({ ...preset, values: remapValues(preset.values, merged.idMaps) }));
  const presets = remapped.filter((preset) => {
    const values = stableStringify(preset.values);
    return !holdings.presets.some((existing) => isSamePreset(existing, preset, values));
  });
  return {
    presets,
    skipped: remapped.length - presets.length,
    assets:
      merged === undefined
        ? { userRomajiRules: holdings.userRomajiRules, fingerAssignments: holdings.fingerAssignments }
        : { userRomajiRules: merged.assets.userRomajiRules, fingerAssignments: merged.assets.fingerAssignments },
    assetEntries: merged?.entries ?? [],
  };
}

/**
 * ファイルから読んだプリセットと同梱の資産を手元へ足す（追加のみ。新しいidで足し、同名は番号を付ける）。足すものが無ければ何もしない。
 * 資産とプリセットは1回の変更で書くので、元に戻すと両方が戻る。
 */
export function importPresetsWithAssetsCommand(
  incoming: readonly ImportedPresetValues[],
  bundle: UserAssetsBundle,
  generateId: PresetIdGenerator,
  stamp: string,
): Command<KeydistAssets> {
  return (current) => {
    const merge = mergePresetImport({ ...current, presets: current.presetLibrary.presets }, incoming, bundle, stamp);
    const library = appendImportedPresets(current.presetLibrary, merge.presets, generateId);
    const changes: Partial<KeydistAssets> = {
      ...(merge.assets.userRomajiRules.length === current.userRomajiRules.length ? {} : { userRomajiRules: merge.assets.userRomajiRules }),
      ...(merge.assets.fingerAssignments.length === current.fingerAssignments.length ? {} : { fingerAssignments: merge.assets.fingerAssignments }),
      ...(library === current.presetLibrary ? {} : { presetLibrary: library }),
    };
    if (Object.keys(changes).length === 0) return { kind: 'no-op' };
    return { kind: 'applied', label: 'プリセットを読み込む', changes };
  };
}
