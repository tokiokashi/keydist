import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { WorkspacePane } from '#engine/workspace.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { nSensitivityDefinition } from '#analyzers/n-sensitivity/extract.ts';
import { ErrorDetails } from '#hosts/shared/ErrorDetails.tsx';
import { describeErrorDetail } from '#hosts/shared/pane-status.ts';
import { findWorkspaceAnalyzer, isBlankPane } from './analyzer-registry.ts';
import { BigramFlowWorkspacePane } from './panes/BigramFlowWorkspacePane.tsx';
import { BlankWorkspacePane } from './panes/BlankWorkspacePane.tsx';
import { ComparisonWorkspacePane } from './panes/ComparisonWorkspacePane.tsx';
import { NSensitivityWorkspacePane } from './panes/NSensitivityWorkspacePane.tsx';
import type { WorkspacePaneRuntime } from './pane-runtime.ts';

/**
 * Workspaceのペイン1枚の中身。保存したAnalyzerのidから、そのAnalyzerのペインを選ぶ。
 * どのペインも自分の失敗をこの外へ出さない（#544 §8-5「1つのAnalyzerの失敗でWorkspaceが落ちない」）:
 * 描画の例外は`WorkspacePaneBoundary`が受け、Analyzerが無い・対象の形が合わないペインは
 * 使えないことを示して閉じられるようにする。
 */
export function WorkspacePaneView({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  if (isBlankPane(pane.analyzerId)) {
    // 余白は対象も解析設定も持たず、描画で失敗する要素も無いので、境界を挟まない
    return <BlankWorkspacePane pane={pane} runtime={runtime} />;
  }
  const entry = findWorkspaceAnalyzer(pane.analyzerId);
  // 固定の対象がAnalyzerの形と合わない時だけ使えない（従うペインは、Workspaceの対象から形に合う方を読む）。
  const usable = entry !== undefined && (pane.binding.mode === 'follow' || (pane.binding.mode === 'fixed' && pane.binding.target.kind === entry.cardinality));
  return (
    <WorkspacePaneBoundary onClose={() => runtime.closePane(pane.id)}>
      {usable ? <AnalyzerPane pane={pane} runtime={runtime} /> : (
        <PaneNotice
          message="このAnalyzerは使えない。閉じて、追加し直してほしい"
          onClose={() => runtime.closePane(pane.id)}
        />
      )}
    </WorkspacePaneBoundary>
  );
}

function AnalyzerPane({ pane, runtime }: { readonly pane: WorkspacePane; readonly runtime: WorkspacePaneRuntime }) {
  switch (pane.analyzerId) {
    case bigramFlowDefinition.id:
      return <BigramFlowWorkspacePane pane={pane} runtime={runtime} />;
    case comparisonDefinition.id:
      return <ComparisonWorkspacePane pane={pane} runtime={runtime} />;
    case nSensitivityDefinition.id:
      return <NSensitivityWorkspacePane pane={pane} runtime={runtime} />;
    default:
      return null;
  }
}

function PaneNotice({
  message,
  details = [],
  onClose,
}: {
  readonly message: string;
  readonly details?: readonly string[];
  readonly onClose: () => void;
}) {
  return (
    <div className="workspace-pane-notice" role="alert" data-workspace-pane-notice="true">
      <p>{message}</p>
      <ErrorDetails lines={details} />
      <button type="button" className="pane-empty-button" onClick={onClose}>閉じる</button>
    </div>
  );
}

/**
 * ペイン1枚のerror boundary。`PaneFrame`の中の本体（可視化）の例外は`PaneFrame`が受けるので、
 * ここが受けるのはそれより外（見出し・解析設定・対象の選択・ペインの組み立て）の例外。
 * 他のペインとWorkspaceは動き続ける。
 */
class WorkspacePaneBoundary extends Component<
  { readonly children: ReactNode; readonly onClose: () => void },
  { readonly error?: unknown }
> {
  override state: { readonly error?: unknown } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 開発時に追えるよう、コンソールには残す（ペイン自体は落とさない）。
    console.error('[WorkspacePaneBoundary] pane threw', error, info.componentStack);
  }

  override render() {
    if (this.state.error !== undefined) {
      return (
        <PaneNotice
          message="このAnalyzerを表示できなかった。閉じて、追加し直してほしい"
          details={describeErrorDetail(this.state.error)}
          onClose={this.props.onClose}
        />
      );
    }
    return this.props.children;
  }
}
