import type { LevelOverrides } from '#input/settings/index.ts';
import type { Preset, PresetIdGenerator, PresetLibrary } from './types.ts';

/**
 * プリセットの手持ちの純関数。
 *
 * **規約: 変化が無ければ同一の`PresetLibrary`参照を返す。** コマンド層は参照の一致で
 * no-opを判定する（`input/setup/collection.ts`と同じ）。
 * 名前が使えないもの（trimして空）は`undefined`を返し、コマンド層が拒否に写す。
 */

/** 名前を整える。前後の空白を落とし、空になれば`undefined`（名前として使えない）。 */
export function normalizePresetName(raw: string): string | undefined {
  const name = raw.trim();
  return name === '' ? undefined : name;
}

function copyValues<V>(values: LevelOverrides<V>): LevelOverrides<V> {
  // 値はJSONで表せるプレーンな形（カスケードの上書きと同じ）。資産どうしで参照を共有しない
  return JSON.parse(JSON.stringify(values)) as LevelOverrides<V>;
}

/** 1レベル分の上書きを複製して、名前付きで末尾へ足す。名前が使えなければ`undefined`。 */
export function addPreset<V>(
  library: PresetLibrary<V>,
  rawName: string,
  values: LevelOverrides<V> | undefined,
  generateId: PresetIdGenerator,
): PresetLibrary<V> | undefined {
  const name = normalizePresetName(rawName);
  if (name === undefined) return undefined;
  const preset: Preset<V> = { id: generateId(), name, values: copyValues(values ?? {}) };
  return { presets: [...library.presets, preset] };
}

/** 名前を付け直す。名前が使えなければ`undefined`。対象が無い・同じ名前なら同一参照。 */
export function renamePreset<V>(library: PresetLibrary<V>, id: string, rawName: string): PresetLibrary<V> | undefined {
  const name = normalizePresetName(rawName);
  if (name === undefined) return undefined;
  const target = library.presets.find((preset) => preset.id === id);
  if (target === undefined || target.name === name) return library;
  return { presets: library.presets.map((preset) => (preset.id === id ? { ...preset, name } : preset)) };
}

/** 削除する。対象が無ければ同一参照。 */
export function deletePreset<V>(library: PresetLibrary<V>, id: string): PresetLibrary<V> {
  if (!library.presets.some((preset) => preset.id === id)) return library;
  return { presets: library.presets.filter((preset) => preset.id !== id) };
}

/**
 * 既に使われている名前と重ならない名前を返す。重なれば「名前 2」「名前 3」…と番号を付ける。
 * 読み込みは何も失わずに足すだけにしたいので、同名を上書きせず、見分けが付く名前にする。
 */
export function uniquePresetName(usedNames: ReadonlySet<string>, baseName: string): string {
  if (!usedNames.has(baseName)) return baseName;
  let suffix = 2;
  while (usedNames.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}

/**
 * 読み込み。常に新しいidで末尾へ追加する。元のidは使わない（外から来る値のidを信用しない。
 * 既存のプリセットの上書きにもならない）。名前は既存および今回の先行分と重ならないよう番号を付ける。
 * 名前が使えないもの（空）は飛ばす。1件も足さなければ同一参照。
 */
export function appendImportedPresets<V>(
  library: PresetLibrary<V>,
  incoming: readonly { readonly name: string; readonly values: LevelOverrides<V> }[],
  generateId: PresetIdGenerator,
): PresetLibrary<V> {
  const used = new Set(library.presets.map((preset) => preset.name));
  const added: Preset<V>[] = [];
  for (const entry of incoming) {
    const base = normalizePresetName(entry.name);
    if (base === undefined) continue;
    const name = uniquePresetName(used, base);
    used.add(name);
    added.push({ id: generateId(), name, values: copyValues(entry.values) });
  }
  if (added.length === 0) return library;
  return { presets: [...library.presets, ...added] };
}
