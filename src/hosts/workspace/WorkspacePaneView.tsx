import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { WorkspacePane } from '#engine/workspace.ts';
import { ErrorDetails } from '#hosts/shared/ErrorDetails.tsx';
import { describeErrorDetail } from '#hosts/shared/pane-status.ts';
import { findWorkspaceAnalyzer, isBlankPane } from './analyzer-registry.ts';
import { SingleAnalyzerWorkspacePane } from './panes/SingleAnalyzerWorkspacePane.tsx';
import { findSingleAnalyzer } from './single-analyzers.ts';
import { BlankWorkspacePane } from './panes/BlankWorkspacePane.tsx';
import { SetAnalyzerWorkspacePane } from './panes/SetAnalyzerWorkspacePane.tsx';
import { findSetAnalyzer } from './set-analyzers.ts';
import type { WorkspacePaneRuntime } from './pane-runtime.ts';

/**
 * Workspaceのペイン1枚の中身。保存したAnalyzerのidから、そのAnalyzerのペインを選ぶ。
 * どのペインも自分の失敗をこの外へ出さない:
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
    // 余白のペインは対象も解析設定も持たず、描画で失敗する要素も無いので、境界を挟まない
    return <BlankWorkspacePane pane={pane} runtime={runtime} />;
  }
  const entry = findWorkspaceAnalyzer(pane.analyzerId);
  // 固定の対象がAnalyzerの形と合わない時だけ使えない（従うペインは、Workspaceの対象から形に合う方を読む）。
  const usable = entry !== undefined && (pane.binding.mode === 'follow' || (pane.binding.mode === 'fixed' && pane.binding.target.kind === entry.cardinality));
  return (
    <WorkspacePaneBoundary onClose={() => runtime.closePane(pane.id)}>
      {usable ? <AnalyzerPane pane={pane} runtime={runtime} /> : (
        <PaneNotice
          message="このAnalyzerは使えません。閉じてから、もう一度追加してください"
          onClose={() => runtime.closePane(pane.id)}
        />
      )}
    </WorkspacePaneBoundary>
  );
}

function AnalyzerPane({ pane, runtime }: { readonly pane: WorkspacePane; readonly runtime: WorkspacePaneRuntime }) {
  const single = findSingleAnalyzer(pane.analyzerId);
  if (single !== undefined) return <SingleAnalyzerWorkspacePane analyzer={single} pane={pane} runtime={runtime} />;
  const set = findSetAnalyzer(pane.analyzerId);
  if (set !== undefined) return <SetAnalyzerWorkspacePane analyzer={set} pane={pane} runtime={runtime} />;
  return null;
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
          message="このAnalyzerを表示できませんでした。閉じてから、もう一度追加してください"
          details={describeErrorDetail(this.state.error)}
          onClose={this.props.onClose}
        />
      );
    }
    return this.props.children;
  }
}
