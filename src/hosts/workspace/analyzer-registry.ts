import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { WorkspacePaneTarget } from '#engine/workspace.ts';
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
 * ペインを足す時の、対象の初期値。個別画面で今選んでいる対象（Singleの対象・Multiの集合）を
 * 写して始める。ペインは自分の対象を持つ（固定）ので、写した後は個別画面と連動しない。
 * 個別画面でまだ何も選んでいなければ、Singleは既定の配列、Multiは空の集合から始まる。
 */
export function initialPaneTarget(entry: WorkspaceAnalyzerEntry, assets: KeydistAssets): WorkspacePaneTarget {
  if (entry.cardinality === 'single') {
    return { kind: 'single', target: effectiveSingleTarget(assets.singleTargetSelection) };
  }
  return { kind: 'set', selection: assets.multiTargetSelection };
}
