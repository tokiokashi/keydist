import type { SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';

export interface DecodedAnalyzerOptions<Options> {
  readonly options: Options;
  readonly diagnostics: readonly CodecDiagnostic[];
}

/**
 * 資産（`assets.standaloneAnalyzerOptions[analyzerId]`）に入っている生の値を、対象Analyzerの
 * `definition.decodeOptions`（`analyzers/contract.ts`）で型付きの値へ直す（#544指示書
 * 「中身の各Analyzerの設定は、そのAnalyzerのdecodeOptionsで診断付きに読む」）。
 *
 * `engine`側のcodec（`engine/standalone-analyzer-options-codec.ts`）は資産の外側の形
 * （object全体・キーの安全性）しか見ないので、Analyzerごとの項目単位の検証はここで初めて行う。
 * 診断（壊れていた・未知の値だった等）は捨てず`diagnostics`として返す。呼び出し側
 * （`hosts/standalone`のページ）が`PaneFrame`の`settingsDiagnostics`へ渡して画面に出す
 * （レビュー指摘: 診断を作って捨てていたのを直す）。
 */
export function decodeStoredAnalyzerOptions<Options>(
  definition: SingleAnalyzerDefinition<Options>,
  raw: unknown,
): DecodedAnalyzerOptions<Options> {
  const diagnostics: CodecDiagnostic[] = [];
  const options = definition.decodeOptions(raw, diagnostics);
  return { options, diagnostics };
}
