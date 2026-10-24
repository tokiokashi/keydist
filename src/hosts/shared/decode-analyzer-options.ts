import type { CodecDiagnostic } from '#input/codec/index.ts';

/**
 * `SingleAnalyzerDefinition`/`SetAnalyzerDefinition`のどちらでも持つ`decodeOptions`だけを
 * 要求する最小形。`decodeStoredAnalyzerOptions`は対象の種類（単一/集合）を問わないため、
 * `AnalyzerDefinition`のUnion全体ではなくこの構造的な形を受け取る（cardinalityが違う
 * 2つの型はUnionのままでは関数の引数として素直に受け取れないため）。
 */
export interface DecodableAnalyzerDefinition<Options> {
  decodeOptions(raw: unknown, diagnostics: CodecDiagnostic[]): Options;
}

/**
 * 資産（`assets.standaloneAnalyzerOptions[analyzerId]`・Workspaceのペイン）に入っている生の値を、対象Analyzerの
 * `definition.decodeOptions`（`analyzers/contract.ts`）で型付きの値へ直す。
 *
 * 読めない項目は既定値になる。診断は画面に出さない。読めない項目は古い版が残したもので利用者が直せるものではなく、
 * 起動時の読み込み（`app/standalone/analyzer-options-repair.ts`）が保存値から捨てるため。
 */
export function decodeStoredAnalyzerOptions<Options>(definition: DecodableAnalyzerDefinition<Options>, raw: unknown): Options {
  return definition.decodeOptions(raw, []);
}
