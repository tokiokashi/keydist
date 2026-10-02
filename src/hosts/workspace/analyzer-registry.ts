import { BLANK_PANE_ID } from '#engine/workspace.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { BIGRAM_FLOW_PANE_META } from '#analyzers/bigram-flow/pane-meta.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { COMPARISON_PANE_META } from '#analyzers/comparison/pane-meta.ts';
import { nSensitivityDefinition } from '#analyzers/n-sensitivity/extract.ts';
import { N_SENSITIVITY_PANE_META } from '#analyzers/n-sensitivity/pane-meta.ts';

/**
 * Workspaceのペインに置けるAnalyzer。ペインの追加（Analyzerを選ぶ）と、保存したペインの
 * AnalyzerのidからAnalyzerを引くのに使う。Analyzerを足す時は、ここに1行足し、
 * `WorkspacePaneView.tsx`の分岐にそのAnalyzerのペインを足す。
 *
 * idは各Analyzerの`definition.id`（純粋な部分）から取る。名前と短い説明は、Reactに依存しない
 * `pane-meta.ts`から読む（個別画面のサイドバー・見出しと同じ出どころ）。
 */
export interface WorkspaceAnalyzerEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** 対象を1つ見るか、集合を見るか。ペインが持つ対象の形を決める。 */
  readonly cardinality: 'single' | 'set';
  /** 本体の縦の下限 [rem]（`analyzers/min-body-height.ts`）。宣言しないAnalyzerは既定。 */
  readonly minBodyHeightRem?: number;
}

export const WORKSPACE_ANALYZERS: readonly WorkspaceAnalyzerEntry[] = [
  { id: bigramFlowDefinition.id, ...BIGRAM_FLOW_PANE_META, cardinality: 'single' },
  { id: comparisonDefinition.id, ...COMPARISON_PANE_META, cardinality: 'set' },
  { id: nSensitivityDefinition.id, ...N_SENSITIVITY_PANE_META, cardinality: 'set' },
];

export function findWorkspaceAnalyzer(analyzerId: string): WorkspaceAnalyzerEntry | undefined {
  return WORKSPACE_ANALYZERS.find((entry) => entry.id === analyzerId);
}

/**
 * Analyzerではないペイン「余白」。何も表示せず、並びの空きを埋めるだけ（対象も解析設定も持たない）。
 * 追加のメニューには、Analyzerの後ろに並べる。
 */
export const BLANK_PANE_META = {
  id: BLANK_PANE_ID,
  name: '余白',
  description: '何も表示しない。ペインの間の空きを埋める',
} as const;

export function isBlankPane(analyzerId: string): boolean {
  return analyzerId === BLANK_PANE_ID;
}

/** タブの名前とⓘの説明。Analyzerと余白のどちらでもない（今のアプリが知らない）idは`undefined`。 */
export function findWorkspacePaneMeta(analyzerId: string): { readonly name: string; readonly description: string } | undefined {
  return isBlankPane(analyzerId) ? BLANK_PANE_META : findWorkspaceAnalyzer(analyzerId);
}
