import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import type { SetAnalyzerPaneParts } from '#analyzers/pane-parts.tsx';

/**
 * Workspaceのペインに載せる、対象の集合を見るAnalyzer（Set）のペインに渡すもの。Setを足す時は、
 * ここに1行足せば、`SetAnalyzerWorkspacePane`がそのAnalyzerのペインとして組み立てる。
 *
 * `analyzer-registry.ts`は名前と説明だけの軽い一覧で、可視化のcomponentを読み込まない。
 * こちらは可視化まで読み込むので、ペインを描く側（`WorkspacePaneView.tsx`）だけが使う。
 * 型引数は消してある（保存したペインのidから引くため、Analyzerごとの型は呼び出し側から見えない）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPaneParts = SetAnalyzerPaneParts<any, any, any>;

export const SET_ANALYZER_PANE_PARTS: readonly AnyPaneParts[] = [
  comparisonAnalyzer,
  nSensitivityAnalyzer,
];

export function findSetAnalyzer(analyzerId: string): AnyPaneParts | undefined {
  return SET_ANALYZER_PANE_PARTS.find((entry) => entry.definition.id === analyzerId);
}
