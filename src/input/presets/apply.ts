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
    if (typeof item.defaultValue !== 'function' && sameValue(value, item.defaultValue)) continue;
    next[itemId] = value;
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
