import type { SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';

/**
 * 資産（`assets.standaloneAnalyzerOptions[analyzerId]`）に入っている生の値を、対象Analyzerの
 * `definition.decodeOptions`（`analyzers/contract.ts`）で型付きの値へ直す（#544指示書
 * 「中身の各Analyzerの設定は、そのAnalyzerのdecodeOptionsで診断付きに読む」）。
 *
 * `engine`側のcodec（`engine/standalone-analyzer-options-codec.ts`）は資産の外側の形
 * （object全体・キーの安全性）しか見ないので、Analyzerごとの項目単位の検証はここで初めて行う。
 * 診断（壊れていた・未知の値だった等）は今回は表示先が無いので捨てる
 * （`hosts/standalone`はまだ診断を出す場所を持たない。落としたことに気づけるよう
 * 呼び出し側が診断も欲しくなったら、この関数へ`diagnostics`の出力先を足す）。
 */
export function decodeStoredAnalyzerOptions<Options>(
  definition: SingleAnalyzerDefinition<Options>,
  raw: unknown,
): Options {
  const diagnostics: CodecDiagnostic[] = [];
  return definition.decodeOptions(raw, diagnostics);
}
