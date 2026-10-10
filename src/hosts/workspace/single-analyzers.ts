import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { fingerDistanceAnalyzer } from '#analyzers/finger-distance/definition.tsx';
import { heatmapIntegratedAnalyzer } from '#analyzers/heatmap-integrated/definition.tsx';
import { heatmapLayersAnalyzer } from '#analyzers/heatmap-layers/definition.tsx';
import { inputMethodAnalyzer } from '#analyzers/input-method/definition.tsx';
import { layerComboPressesAnalyzer } from '#analyzers/layer-combo-presses/definition.tsx';
import type { SingleAnalyzerPaneParts } from '#analyzers/pane-parts.tsx';

/**
 * Workspaceのペインに載せる、対象を1つ見るAnalyzer（Single）のペインに渡すもの。Singleを足す時は、
 * ここに1行足せば、`SingleAnalyzerWorkspacePane`がそのAnalyzerのペインとして組み立てる。
 *
 * `analyzer-registry.ts`は名前と説明だけの軽い一覧で、可視化のcomponentを読み込まない。
 * こちらは可視化まで読み込むので、ペインを描く側（`WorkspacePaneView.tsx`）だけが使う。
 * 型引数は消してある（保存したペインのidから引くため、Analyzerごとの型は呼び出し側から見えない）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPaneParts = SingleAnalyzerPaneParts<any, any>;

export const SINGLE_ANALYZER_PANE_PARTS: readonly AnyPaneParts[] = [
  bigramFlowAnalyzer,
  fingerDistanceAnalyzer,
  heatmapIntegratedAnalyzer,
  heatmapLayersAnalyzer,
  layerComboPressesAnalyzer,
  inputMethodAnalyzer,
];

export function findSingleAnalyzer(analyzerId: string): AnyPaneParts | undefined {
  return SINGLE_ANALYZER_PANE_PARTS.find((entry) => entry.definition.id === analyzerId);
}
