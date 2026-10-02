import {
  levelOverrides,
  withLevelOverrides,
  type CascadeLevel,
  type CascadeOverrides,
  type ItemRegistry,
  type LevelOverrides,
  type RegistryValueMap,
} from '#input/settings/index.ts';

/**
 * プリセットの流し込みの計算（置き換えだけ。差分の重ねは作らない）。
 *
 * 対象レベルの上書きを、プリセットの`values`で**丸ごと置き換える**:
 * - プリセットに無い項目は上書きを消す（＝既定値へ戻る）
 * - 既定と同じ値は上書きとして残さない（`setGlobalCommand`と同じ規則。残すと実質は既定なのに
 *   「変更あり」と出てしまう）
 * - 対象レベルの`allowedLevels`に無い項目は入れず、`skipped`に返す（黙って捨てない）
 *
 * Workspaceのレベルは全体の上に重なる差分なので、判定の基準は既定値ではなく**継承値**（全体の値、無ければ既定値）:
 * - 継承値と違う項目は、既定値でも明示的に書く（全体がN=7の時に、全体の既定で保存したプリセットの
 *   N=3を流し込んで、Workspaceの値をN=3にするため）
 * - プリセットに無い項目は既定値として扱う。全体が既定と違えばその既定値をWorkspaceへ書く
 * - 継承値と同じ項目は上書きを残さない
 *
 * 例外: プリセットに無い項目のうち既定値が文脈で決まるもの（指の割当）は、全体に上書きがあっても既定値を書けない。
 * Workspaceの値は全体のままになるので、`skipped`に入れて返す（黙って残さない）。
 *
 * 「既定と同じ」を判定できるのは既定値が文脈に依らない項目だけ（`defaultValue`が関数の項目は
 * 配列・物理配列を知らないと決まらない。例: 指の割当）。そういう項目の値は、既定と同じに
 * 見えても上書きとして残す。ここで既定を推測して消すと、別の文脈で実効値が変わってしまう。
 */
export interface PresetApplication<V> {
  readonly overrides: CascadeOverrides<V>;
  /** 対象レベルが許さないため入れなかった項目id（プリセットの並び順）。 */
  readonly skipped: readonly string[];
}

export function applyPresetValues<R extends ItemRegistry>(
  registry: R,
  overrides: CascadeOverrides<RegistryValueMap<R>>,
  level: CascadeLevel,
  values: LevelOverrides<RegistryValueMap<R>>,
): PresetApplication<RegistryValueMap<R>> {
  const next: Record<string, unknown> = {};
  const skipped: string[] = [];
  // Workspaceのレベルだけ、全体の値を継承値として持つ
  const inherited = level.kind === 'workspace'
    ? ((levelOverrides(overrides, { kind: 'global' }) ?? {}) as Record<string, unknown>)
    : undefined;
  for (const [itemId, value] of Object.entries(values)) {
    // 未知の項目は入れない。codecを通した値には現れないが、手で組んだ値でも
    // `registry[itemId]`が未定義で落ちないようにする
    if (!Object.hasOwn(registry, itemId)) {
      skipped.push(itemId);
      continue;
    }
    const item = registry[itemId];
    if (!item.allowedLevels.has(level.kind)) {
      skipped.push(itemId);
      continue;
    }
    if (inherited !== undefined) {
      // 全体に値があればそれ、無ければ既定値。既定値が文脈で決まる項目は継承値を知れないので書いたままにする
      const base = Object.hasOwn(inherited, itemId)
        ? { known: true, value: inherited[itemId] }
        : { known: typeof item.defaultValue !== 'function', value: item.defaultValue };
      if (base.known && sameValue(value, base.value)) continue;
    } else if (typeof item.defaultValue !== 'function' && sameValue(value, item.defaultValue)) continue;
    next[itemId] = value;
  }
  if (inherited !== undefined) {
    // プリセットに無い項目は既定値。全体が既定と違う項目は、Workspaceで既定値へ戻すために明示的に書く
    for (const [itemId, item] of Object.entries(registry)) {
      if (Object.hasOwn(values, itemId) || !item.allowedLevels.has(level.kind)) continue;
      if (!Object.hasOwn(inherited, itemId)) continue;
      // 既定値が文脈で決まる項目（指の割当）は、既定値を書けない。全体の値が残るので、入れなかった項目として返す
      if (typeof item.defaultValue === 'function') {
        skipped.push(itemId);
        continue;
      }
      if (sameValue(inherited[itemId], item.defaultValue)) continue;
      next[itemId] = item.defaultValue;
    }
  }
  const replaced = Object.keys(next).length === 0 ? undefined : (next as LevelOverrides<RegistryValueMap<R>>);
  const current = levelOverrides(overrides, level);
  // 変化が無ければ同じ参照を返す（コマンド層がno-opを判定する）。キーの並びの違いは変化に数えない
  if (sameLevel(current, replaced)) return { overrides, skipped };
  return { overrides: withLevelOverrides(overrides, level, replaced), skipped };
}

/** 値どうしの一致。項目の値はJSONで表せるプレーンな形（`setGlobalCommand`と同じ比較）。 */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameLevel(a: object | undefined, b: object | undefined): boolean {
  const left = (a ?? {}) as Record<string, unknown>;
  const right = (b ?? {}) as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}
