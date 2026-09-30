import type { LevelOverrides } from '#input/settings/index.ts';

/**
 * プリセット。条件（カスケードの1レベル分の上書き）に名前を付けて持つ資産。
 *
 * `values`は**既定から変えた項目だけ**の疎な形（カスケードの上書きと同じ。無い項目は既定値）。
 * 全項目のスナップショットにしないのは、上書きなのか既定なのかが区別できなくなるのと、
 * 保存形式をカスケードと一致させて変換を要らなくするため。
 *
 * 元のレベル（全体・Workspace…）は持たない。流し込みの結果は「元」ではなく
 * 「先のレベルが許す項目」で決まるので、読む場所が無い。
 * 名前は重複してよい（識別はid）。
 */
export interface Preset<V> {
  readonly id: string;
  readonly name: string;
  readonly values: LevelOverrides<V>;
}

/** プリセットの手持ち。並びは作成順。 */
export interface PresetLibrary<V> {
  readonly presets: readonly Preset<V>[];
}

/**
 * プリセットの新規idを払い出す関数。`input`は純粋層で乱数を直接使わないので、
 * 呼び出し側が注入する（`SetupIdGenerator`と同じ理由）。
 */
export type PresetIdGenerator = () => string;

export function emptyPresetLibrary<V>(): PresetLibrary<V> {
  return { presets: [] };
}
