import * as v from 'valibot';
import type { BaseIssue, BaseSchema } from 'valibot';

/**
 * 資産のcodec。外から来るデータ（旧版の保存データ・共有リンク・配列の
 * import・条件ファイル）はすべてこの仕組みを通す。
 *
 * decodeは例外を投げない。結果は
 * 「値 + 診断（何を落とした・何を既定値へ戻したか）」か「失敗理由」のどちらか。
 * 失敗理由には「未来のバージョン」を区別して持つ（将来のバージョンは
 * 黙って切り捨てず報告する）。
 *
 * 寛容な読み込み（既存の`sanitize…`と同じ「壊れた要素だけ捨てて残りを読む」）は
 * valibotの`v.fallback`ではなく、下の`decodeField` / `decodeDroppingInvalid`を使う。
 * 理由: `v.fallback`はフォールバックが使われた時にissueを一切返さない
 * （valibot.dev "no issues will be returned when using fallback" 参照）。
 * このリポジトリの要件は「値 + 診断」の両立なので、診断を残せない
 * `v.fallback`単体では要件を満たせない。`decodeField`はschemaでの検証自体は
 * `v.safeParse`（＝valibot）に任せ、失敗時だけ診断を積んでfallbackへ戻す。
 * これが「v.fallbackの等価物」にあたる。診断を要らない（利用者が選んだ値ではなく、
 * 外れても作り直すだけの表示専用の値。集合の色の番号等）場合は、素の`v.fallback`を
 * schema側で直接使うか、診断を積まずに戻してよい（engine/multi-target-selection-codec.ts参照）。
 */

export interface CodecDiagnostic {
  readonly path: string;
  readonly message: string;
}

/**
 * 版番号を持たない素の保存形式（配列・レコード）を読んだ結果。`AssetCodec`と違い失敗は無く、
 * 読めた分の値と、捨てたものの診断を必ず一緒に返す。
 */
export interface DecodedWithDiagnostics<T> {
  readonly value: T;
  readonly diagnostics: readonly CodecDiagnostic[];
}

export type DecodeFailure =
  | { readonly kind: 'not-an-object' }
  | { readonly kind: 'missing-version' }
  /** versionフィールドはあるが、非負整数（版番号として妥当な値）ではない。 */
  | { readonly kind: 'invalid-version'; readonly version: unknown }
  | { readonly kind: 'future-version'; readonly version: number; readonly currentVersion: number }
  | { readonly kind: 'unmigratable-version'; readonly version: number }
  | { readonly kind: 'invalid-shape'; readonly message: string };

export type DecodeResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly CodecDiagnostic[] }
  | { readonly ok: false; readonly reason: DecodeFailure };

/**
 * 版を1つ引き上げるmigrateの1段。`payload`はversionフィールドを除いた生のJSON値。
 * 実際の旧→新の変換ロジックは旧AppStateからの一度きりの移行を作る時まで書かない。ここでは仕組みだけをテストで動かす。
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

/**
 * 外部由来のobjectのkeyとして弾く予約名。`JSON.parse`はリテラルな own property
 * "__proto__" を作れるので、共有リンク・importファイルから実際に出現しうる。
 * 捨てる側は必ず診断を積む（「捨てた値には必ず診断」）。
 */
export const UNSAFE_OBJECT_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

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
      if (rawVersion === undefined) {
        return { ok: false, reason: { kind: 'missing-version' } };
      }
      // versionは1始まりの非負整数（実際には1以上）という約束（settings-codec.ts /
      // setup-codec.tsの`currentVersion: 1`と揃える）。0や負の値・小数・文字列等は
      // 「対応するmigrate stepが無い」（unmigratable-version）とは別の問題
      // （そもそも版番号として成立していない）なので、区別できる失敗理由にする。
      if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1) {
        return { ok: false, reason: { kind: 'invalid-version', version: rawVersion } };
      }
      // 将来のバージョン（このアプリより新しい版で保存された資産）は黙って切り捨てず、
      // 専用の失敗理由として報告する。migrateは常に「古い→新しい」の
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
 * 共有リンクのサイズ上限チェック用のヘルパー。
 * 上限そのものの判定・警告UIはまだ作っていない。
 * ここでは「JSONにした時のバイト数」を返すだけの小さな関数に留める（過剰実装しない）。
 */
export function encodedSizeBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
