import * as v from 'valibot';
import type { BaseIssue, BaseSchema } from 'valibot';

/**
 * 資産のcodec（#544 §8-3）。外から来るデータ（旧版の保存データ・共有リンク・配列の
 * import・条件ファイル）はすべてこの仕組みを通す。
 *
 * decodeは例外を投げない（#544 §8-5「エラーは値」）。結果は
 * 「値 + 診断（何を落とした・何を既定値へ戻したか）」か「失敗理由」のどちらか。
 * 失敗理由には「未来のバージョン」を区別して持つ（本文§8-3「将来のバージョンは
 * 黙って切り捨てず報告する」）。
 *
 * 寛容な読み込み（既存の`sanitize…`と同じ「壊れた要素だけ捨てて残りを読む」）は
 * valibotの`v.fallback`ではなく、下の`decodeField` / `decodeDroppingInvalid`を使う。
 * 理由: `v.fallback`はフォールバックが使われた時にissueを一切返さない
 * （valibot.dev "no issues will be returned when using fallback" 参照）。
 * このリポジトリの要件（#544 §8-5）は「値 + 診断」の両立なので、診断を残せない
 * `v.fallback`単体では要件を満たせない。`decodeField`はschemaでの検証自体は
 * `v.safeParse`（＝valibot）に任せ、失敗時だけ診断を積んでfallbackへ戻す。
 * これが「v.fallbackの等価物」にあたる。SetupのcolorIndexのように診断を要らない
 * （利用者が選んだ値ではなく、外れても既定色に戻るだけの表示専用の値）場合は、
 * 素の`v.fallback`をschema側で直接使ってよい（setup/codec.ts参照）。
 */

export interface CodecDiagnostic {
  readonly path: string;
  readonly message: string;
}

export type DecodeFailure =
  | { readonly kind: 'not-an-object' }
  | { readonly kind: 'missing-version' }
  | { readonly kind: 'future-version'; readonly version: number; readonly currentVersion: number }
  | { readonly kind: 'unmigratable-version'; readonly version: number }
  | { readonly kind: 'invalid-shape'; readonly message: string };

export type DecodeResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly CodecDiagnostic[] }
  | { readonly ok: false; readonly reason: DecodeFailure };

/**
 * 版を1つ引き上げるmigrateの1段。`payload`はversionフィールドを除いた生のJSON値。
 * 実際の旧→新の変換ロジックはPhase 5（旧AppStateからの一度きりの移行）まで書かない
 * （このタスクの範囲外）。ここでは仕組みだけをテストで動かす。
 */
export interface MigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (payload: Record<string, unknown>) => Record<string, unknown>;
}

export interface AssetCodecOptions<T> {
  readonly currentVersion: number;
  /** `fromVersion`昇順である必要は無い（Mapに積むだけ）。version同士の欠番はunmigratable-versionにする。 */
  readonly migrations?: readonly MigrationStep[];
  /** 現行版まで引き上げた後のpayloadをTへdecodeする。決められない・壊れすぎている場合は`undefined`を返す（資産全体の失敗）。 */
  readonly decodePayload: (payload: unknown, diagnostics: CodecDiagnostic[]) => T | undefined;
  /** Tを現行版のpayloadへ戻す（versionフィールドは`encode`が付ける）。 */
  readonly encodePayload: (value: T) => Record<string, unknown>;
}

export interface AssetCodec<T> {
  readonly currentVersion: number;
  decode(input: unknown): DecodeResult<T>;
  encode(value: T): Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function defineAssetCodec<T>(options: AssetCodecOptions<T>): AssetCodec<T> {
  const migrationsByFromVersion = new Map(
    (options.migrations ?? []).map((step) => [step.fromVersion, step] as const),
  );

  return {
    currentVersion: options.currentVersion,

    decode(input: unknown): DecodeResult<T> {
      if (!isRecord(input)) return { ok: false, reason: { kind: 'not-an-object' } };

      const rawVersion = input.version;
      if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion)) {
        return { ok: false, reason: { kind: 'missing-version' } };
      }
      // 将来のバージョン（このアプリより新しい版で保存された資産）は黙って切り捨てず、
      // 専用の失敗理由として報告する（#544 §8-3）。migrateは常に「古い→新しい」の
      // 向きにしか持たないので、ここで弾かないとmigrateループが誤動作する。
      if (rawVersion > options.currentVersion) {
        return {
          ok: false,
          reason: { kind: 'future-version', version: rawVersion, currentVersion: options.currentVersion },
        };
      }

      let version = rawVersion;
      const { version: _drop, ...rest } = input;
      let payload: Record<string, unknown> = rest;
      while (version < options.currentVersion) {
        const step = migrationsByFromVersion.get(version);
        if (step === undefined) return { ok: false, reason: { kind: 'unmigratable-version', version } };
        payload = step.migrate(payload);
        version = step.toVersion;
      }

      const diagnostics: CodecDiagnostic[] = [];
      const value = options.decodePayload(payload, diagnostics);
      if (value === undefined) {
        return { ok: false, reason: { kind: 'invalid-shape', message: 'payloadの形式が不正で読み取れない' } };
      }
      return { ok: true, value, diagnostics };
    },

    encode(value: T): Record<string, unknown> {
      return { version: options.currentVersion, ...options.encodePayload(value) };
    },
  };
}

/**
 * 1フィールドをschemaでdecodeし、失敗したら診断を積んで`fallback`を返す
 * （`v.fallback`の等価物。理由はこのファイル先頭のコメント）。
 */
export function decodeField<T>(
  schema: BaseSchema<unknown, T, BaseIssue<unknown>>,
  value: unknown,
  fallback: T,
  path: string,
  diagnostics: CodecDiagnostic[],
): T {
  const result = v.safeParse(schema, value);
  if (result.success) return result.output;
  diagnostics.push({
    path,
    message: `${describeIssues(result.issues)}のため既定値へ戻した`,
  });
  return fallback;
}

/**
 * 要素ごとに検証し、壊れた要素だけ捨てて残りを読む（既存の`sanitize…`と同じ寛容さ）。
 * 呼び出し側が配列やレコードを回す時に使う。妥当なら値を、そうでなければ`undefined`を返し、
 * 診断を積む。
 */
export function decodeDroppingInvalid<T>(
  schema: BaseSchema<unknown, T, BaseIssue<unknown>>,
  value: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): T | undefined {
  const result = v.safeParse(schema, value);
  if (result.success) return result.output;
  diagnostics.push({
    path,
    message: `${describeIssues(result.issues)}のため要素を捨てた`,
  });
  return undefined;
}

function describeIssues(issues: readonly BaseIssue<unknown>[]): string {
  return issues.map((issue) => issue.message).join('; ');
}

/**
 * 共有リンクのサイズ上限チェック用のヘルパー（#544 §8-3「共有リンクにはサイズの
 * 上限を設ける」）。上限そのものの判定・警告UIはPhase 5の共有リンク項目で行う。
 * ここでは「JSONにした時のバイト数」を返すだけの小さな関数に留める（過剰実装しない）。
 */
export function encodedSizeBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
