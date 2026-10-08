import type { InfoHelp } from '#ui/primitives/info-button.tsx';
import { BLANK_PANE_ID } from '#engine/workspace.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { BIGRAM_FLOW_PANE_META } from '#analyzers/bigram-flow/pane-meta.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { COMPARISON_PANE_META } from '#analyzers/comparison/pane-meta.ts';
import { fingerDistanceDefinition } from '#analyzers/finger-distance/extract.ts';
import { FINGER_DISTANCE_PANE_META } from '#analyzers/finger-distance/pane-meta.ts';
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
  /** 短い説明に収まらない説明。あれば見出しのⓘはモーダルを開く。 */
  readonly help?: InfoHelp;
  /** 対象を1つ見るか、集合を見るか。ペインが持つ対象の形を決める。 */
  readonly cardinality: 'single' | 'set';
  /** 本体の縦の下限 [rem]（`analyzers/min-body-height.ts`）。宣言しないAnalyzerは既定。 */
  readonly minBodyHeightRem?: number;
}

export const WORKSPACE_ANALYZERS: readonly WorkspaceAnalyzerEntry[] = [
  { id: bigramFlowDefinition.id, ...BIGRAM_FLOW_PANE_META, cardinality: 'single' },
  { id: fingerDistanceDefinition.id, ...FINGER_DISTANCE_PANE_META, cardinality: 'single' },
  { id: comparisonDefinition.id, ...COMPARISON_PANE_META, cardinality: 'set' },
  { id: nSensitivityDefinition.id, ...N_SENSITIVITY_PANE_META, cardinality: 'set' },
];

export function findWorkspaceAnalyzer(analyzerId: string): WorkspaceAnalyzerEntry | undefined {
  return WORKSPACE_ANALYZERS.find((entry) => entry.id === analyzerId);
}

/**
 * Analyzerではないペイン（画面の名前は「余白」）。何も表示せず、並びの空きを埋めるだけ（対象も解析設定も持たない）。
 * 追加のメニューには、Analyzerの後ろに並べる。
 */
export const BLANK_PANE_META = {
  id: BLANK_PANE_ID,
  name: '余白',
  description: '何も表示しない。並びの空きを埋める',
} as const;

export function isBlankPane(analyzerId: string): boolean {
  return analyzerId === BLANK_PANE_ID;
}

/** 見出しの先頭の名前とⓘの説明。Analyzerでも余白のペインでもない（今のアプリが知らない）idは`undefined`。 */
export function findWorkspacePaneMeta(analyzerId: string): { readonly name: string; readonly description: string; readonly help?: InfoHelp } | undefined {
  return isBlankPane(analyzerId) ? BLANK_PANE_META : findWorkspaceAnalyzer(analyzerId);
}
