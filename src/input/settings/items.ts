import type { CascadeLevelKind } from './levels.ts';
import type { CascadeContext } from './context.ts';

/** 項目の値を検証した結果。妥当ならok、そうでなければ実現可能な値へのfallbackを添える。 */
export type ValidateResult<T> =
  | { readonly ok: true }
  | { readonly ok: false; readonly fallback: T; readonly reason: string };

/**
 * カスケードの1項目の定義（VS Codeの設定項目の `scope` に相当）。
 * 項目そのもの（具体的な11個とその既定値・妥当性ルール）はここには置かない。
 * `input` は `trace` / `interpretation` をimportできない（docs/architecture.mdの依存規則。
 * 依存の向きが逆）ため、TracePolicy・ChainInterpretation等の値を扱う具体的な項目登録は
 * それらをimportできる `src/engine/settings-items.ts` に置く。ここは仕組みだけを持つ。
 *
 * - `allowedLevels` に無いレベルへの書き込みは拒否し（`write.ts`）、
 *   そこに残っている古い値は解決時に無視して診断を出す（`resolve.ts`）
 * - `defaultValue` はContextに依存してよい（例: ローマ字規則idは配列ごとに既定が違う）。
 *   固定値だけの項目は関数にせず直接値を書けばよい
 * - `validate` は「形状で実現できるか」を判定する。実現できなければ`fallback`を使い警告を出す
 * - `isApplicable` は「その配列にこの機能があるか」を判定する。無ければ値は解決するが
 *   「効かない」ことを診断で示す（適用できるかとフィールド妥当性は別の軸なので分けている）
 */
export interface SettingItem<T> {
  readonly id: string;
  readonly allowedLevels: ReadonlySet<CascadeLevelKind>;
  readonly defaultValue: T | ((context: CascadeContext) => T);
  readonly validate?: (value: T, context: CascadeContext) => ValidateResult<T>;
  readonly isApplicable?: (context: CascadeContext) => boolean;
}

/** 型推論を保つためのヘルパー（`items` オブジェクトリテラルの型注釈を省くため）。 */
export function defineItem<T>(item: SettingItem<T>): SettingItem<T> {
  return item;
}

/** `defaultValue` を解決する（固定値ならそのまま、関数ならcontextを渡して呼ぶ）。 */
export function resolveDefaultValue<T>(item: SettingItem<T>, context: CascadeContext): T {
  return typeof item.defaultValue === 'function'
    ? (item.defaultValue as (context: CascadeContext) => T)(context)
    : item.defaultValue;
}

/**
 * 項目のレジストリ。キーが項目id、値がその項目定義。
 * 値の型は項目ごとに違う（`SettingItem<number>` あり `SettingItem<boolean>` あり…）ので、
 * レジストリ自体の型は `SettingItem<any>` で持つ（`unknown` にすると引数位置の反変性で
 * 個々の項目オブジェクトが代入できなくなる）。具体の値の型は `RegistryValueMap` 側で復元する。
 */
export type ItemRegistry = Readonly<Record<string, SettingItem<any>>>;

/** レジストリから「項目id → 値の型」の写像を作る。カスケードの値の型はこれで決まる。 */
export type RegistryValueMap<R extends ItemRegistry> = {
  readonly [K in keyof R]: R[K] extends SettingItem<infer T> ? T : never;
};
