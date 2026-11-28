import { KEYSTROKE_RECORDS_CODEC, type KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import { USER_ASSETS_FILE_MAX_BYTES } from './user-assets-file.ts';

/**
 * 打鍵の記録だけを運ぶファイル（`spec/keystroke-record.md`）。データ・設定の管理の書き出しファイルには入れない。
 * ファイルは`{ format, version, records }`で、`version`と`records`は封筒のcodec（`KEYSTROKE_RECORDS_CODEC`）の出力そのまま。
 * `format`はファイルの先頭に付ける。
 */
export const KEYSTROKE_RECORD_FILE_FORMAT = 'keydist-keystroke-records';

/** 読み込める大きさ。データ・設定の管理のファイルと同じ上限にする。 */
export const KEYSTROKE_RECORD_FILE_MAX_BYTES = USER_ASSETS_FILE_MAX_BYTES;

/** 書き出すファイルの文字列。インデントを付けない（記録は数値の並びが大きく、インデントで数倍になるため）。 */
export function keystrokeRecordFileText(records: readonly KeystrokeRecord[]): string {
  return `${JSON.stringify({ format: KEYSTROKE_RECORD_FILE_FORMAT, ...KEYSTROKE_RECORDS_CODEC.encode(records) })}\n`;
}

export type KeystrokeRecordFileResult =
  | { readonly ok: true; readonly records: readonly KeystrokeRecord[]; readonly dropped: number }
  | { readonly ok: false; readonly message: string };

/** ファイルの文字列を読む。読めない時は、理由の文を返す。形式が不正な記録は捨て、捨てた数を返す。 */
export function readKeystrokeRecordFile(text: string): KeystrokeRecordFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSONとして読めないファイルです' };
  }
  if (parsed === null || typeof parsed !== 'object' || (parsed as { format?: unknown }).format !== KEYSTROKE_RECORD_FILE_FORMAT) {
    return { ok: false, message: '打鍵の記録のファイルではありません' };
  }
  const decoded = KEYSTROKE_RECORDS_CODEC.decode(parsed);
  if (!decoded.ok) {
    return {
      ok: false,
      message: decoded.reason.kind === 'future-version' ? '新しい版のアプリで書き出したファイルのため読めません' : '打鍵の記録のファイルとして読めません',
    };
  }
  return { ok: true, records: decoded.value, dropped: decoded.diagnostics.length };
}
