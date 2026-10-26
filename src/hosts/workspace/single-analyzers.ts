import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { fingerDistanceAnalyzer } from '#analyzers/finger-distance/definition.tsx';
import { handRhythmAnalyzer } from '#analyzers/hand-rhythm/definition.tsx';
import { heatmapAnalyzer } from '#analyzers/heatmap/definition.tsx';
import { heatmapLayersAnalyzer } from '#analyzers/heatmap-layers/definition.tsx';
import { keymapAnalyzer } from '#analyzers/keymap/definition.tsx';
import { layerComboPressesAnalyzer } from '#analyzers/layer-combo-presses/definition.tsx';
import { playbackAnalyzer } from '#analyzers/playback/definition.tsx';
import type { SingleAnalyzerPaneParts } from '#analyzers/pane-parts.tsx';

/**
 * Workspaceのペインに載せる、対象を1つ見るAnalyzer（Single）のペインに渡すもの。Singleを足す時は、
 * ここに1行足せば、`SingleAnalyzerWorkspacePane`がそのAnalyzerのペインとして組み立てる。
 *
 * `analyzer-registry.ts`は名前と説明だけの軽い一覧で、可視化のcomponentを読み込まない。
 * こちらは可視化まで読み込むので、ペインを描く側（`WorkspacePaneView.tsx`）だけが使う。
 * 型引数は消してある（保存したペインのidから引くため、Analyzerごとの型は呼び出し側から見えない）。
 */
// biome-ignore lint/suspicious/noExplicitAny: ペインの部品は型引数ごとに反変の位置を持ち、unknownでは個々のAnalyzerの部品を代入できない
type AnyPaneParts = SingleAnalyzerPaneParts<any, any>;

export const SINGLE_ANALYZER_PANE_PARTS: readonly AnyPaneParts[] = [
  bigramFlowAnalyzer,
  fingerDistanceAnalyzer,
  handRhythmAnalyzer,
  heatmapAnalyzer,
  heatmapLayersAnalyzer,
  layerComboPressesAnalyzer,
  keymapAnalyzer,
  playbackAnalyzer,
];

export function findSingleAnalyzer(analyzerId: string): AnyPaneParts | undefined {
  return SINGLE_ANALYZER_PANE_PARTS.find((entry) => entry.definition.id === analyzerId);
}
