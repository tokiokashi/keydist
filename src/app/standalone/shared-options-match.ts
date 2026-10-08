import { stableStringify } from '#engine/cache-key.ts';

/**
 * 個別画面の解析設定が、Workspaceの共有の設定と同じ値か。共有の設定は変えた項目だけ（または未設定）で保存し、
 * 個別画面の設定は全項目を埋めた値なので、文字列では比べられない。Analyzerのdecode（既定値で埋めた同じ形にする）
 * を通してから比べる。
 */
export function sameAsSharedOptions(
  decodeOptions: (raw: unknown) => unknown,
  shared: unknown,
  standalone: unknown,
): boolean {
  return stableStringify(decodeOptions(shared)) === stableStringify(decodeOptions(standalone));
}
