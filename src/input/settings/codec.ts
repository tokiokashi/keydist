import type { BaseIssue, BaseSchema } from 'valibot';
import { decodeDroppingInvalid, isRecord, type CodecDiagnostic } from '#input/codec/index.ts';
import type { CascadeOverrides, LevelOverrides } from './overrides.ts';

/**
 * カスケードの上書き（`CascadeOverrides<V>`）のcodec（#544 §8-3）。
 *
 * `V`（項目id → 値の型）は呼び出し側のレジストリで決まるので、ここでは
 * 「項目idごとのvalibot schema」を引数で受け取るだけにする。項目の値の型を
 * 二重に書かないため（登録済みの型を`RegistryValueMap`で導出しているのと同じ理由）、
 * 実際のschema（11項目）は`src/engine/settings-items.ts`が持ち、ここは仕組みだけを持つ
 * （`input`は`engine`をimportできない。docs/architecture.mdの依存規則）。
 *
 * 項目値の寛容さは「不正なら丸ごと捨てる」だけにする（`decodeField`のfallbackは使わない）。
 * 理由: 上書きが無い（＝キーごと消える）ことには`resolveCascade`側にすでに意味がある
 * （弱いレベル → 既定値の順で解決する）。フォールバック値を別に持たせると、
 * 「無い」と「フォールバック値で有る」の2通りの“既定”ができてしまい、
 * `defaultValue`（項目によってはcontext依存の関数）と二重管理になる。
 * 捨てて「無い」ことにすれば、既存の解決ロジックがそのまま既定値を出す。
 *
 * 未知の項目id（このアプリのレジストリに無いid）も同様に捨てる。将来バージョンの
 * アプリが追加した項目、または削除済みの項目のどちらもここでは区別しない
 * （資産全体の「未来のバージョン」判定はversion番号側の役目。#544 §8-3参照。
 * 項目単位でも同じ判断をすると二重の判定になる）。
 *
 * レベルの許可（`item.allowedLevels`）はここでは検査しない。**わざと**。
 * `resolveCascade`（resolve.ts）がすでに「許可されていないレベルの値は解決に使わず、
 * `ignored-disallowed-level`の診断を出す」処理を持っている
 * （旧データ・importなど、許可外レベルに値が残っているケースを想定した設計）。
 * codecで先に落としてしまうと、同じ判断を2箇所で持つことになり
 * （#544レビューで指摘された「二重の扱い」を避ける）、かつresolve側の診断が
 * 出せなくなる（値ごと消えているので「無視した」ことを示せない）。
 * そのため**codecは値の型だけを検査し、レベルの可否はresolveへ委ねる**。
 */
export type ItemSchemaMap<V> = { readonly [K in keyof V]: BaseSchema<unknown, V[K], BaseIssue<unknown>> };

function decodeLevelOverrides<V>(
  itemSchemas: ItemSchemaMap<V>,
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): LevelOverrides<V> | undefined {
  if (!isRecord(raw)) return undefined;
  const schemas = itemSchemas as Record<string, BaseSchema<unknown, unknown, BaseIssue<unknown>>>;
  const result: Record<string, unknown> = {};
  for (const [itemId, itemValue] of Object.entries(raw)) {
    const schema = schemas[itemId];
    if (schema === undefined) {
      diagnostics.push({ path: `${path}.${itemId}`, message: `未知の項目「${itemId}」の上書きを捨てた` });
      continue;
    }
    const decoded = decodeDroppingInvalid(schema, itemValue, `${path}.${itemId}`, diagnostics);
    if (decoded !== undefined) result[itemId] = decoded;
  }
  return Object.keys(result).length === 0 ? undefined : (result as LevelOverrides<V>);
}

const INSTANCE_BUCKETS = ['shape', 'inputMethod', 'layout', 'setup'] as const;

export function decodeCascadeOverrides<V>(
  itemSchemas: ItemSchemaMap<V>,
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): CascadeOverrides<V> {
  if (!isRecord(raw)) return {};

  const result: {
    global?: LevelOverrides<V>;
  } & { [K in (typeof INSTANCE_BUCKETS)[number]]?: Record<string, LevelOverrides<V>> } = {};

  const global = decodeLevelOverrides(itemSchemas, raw.global, `${path}.global`, diagnostics);
  if (global !== undefined) result.global = global;

  for (const bucketKey of INSTANCE_BUCKETS) {
    const bucketRaw = raw[bucketKey];
    if (!isRecord(bucketRaw)) continue;
    const bucket: Record<string, LevelOverrides<V>> = {};
    for (const [instanceKey, levelRaw] of Object.entries(bucketRaw)) {
      const decoded = decodeLevelOverrides(itemSchemas, levelRaw, `${path}.${bucketKey}.${instanceKey}`, diagnostics);
      if (decoded !== undefined) bucket[instanceKey] = decoded;
    }
    if (Object.keys(bucket).length > 0) result[bucketKey] = bucket;
  }

  return result as CascadeOverrides<V>;
}

/** `CascadeOverrides<V>`はすでにプレーンなJSON形（overrides.ts先頭コメント）なのでそのまま複製するだけ。 */
export function encodeCascadeOverrides<V>(overrides: CascadeOverrides<V>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(overrides)) as Record<string, unknown>;
}
