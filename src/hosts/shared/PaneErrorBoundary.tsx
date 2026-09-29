import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorDetails } from './ErrorDetails.tsx';
import { describeErrorDetail } from './pane-status.ts';

/**
 * ペイン単位のerror boundary（#544 §8-5「ペインごとにerror boundaryで囲む。1つのAnalyzerの
 * 失敗でWorkspaceが落ちない」）。可視化component（`analyzers/<name>/definition.tsx`）が
 * 描画中に例外を投げても、このペインの中だけが壊れた表示に切り替わり、ページ全体・
 * 他のペインは動き続ける。
 *
 * engineの計算失敗（`EngineRequestState`の`failed`・Traceの`errors`）はこのboundaryの
 * 対象外（#544 §8-5「エラーは値」）。それらは`PaneFrame`が値として受け取り、通常の
 * JSXとして表示する。ここが捕まえるのは、可視化component自身が投げた**例外**だけ。
 */
interface PaneErrorBoundaryState {
  readonly error?: unknown;
}

export class PaneErrorBoundary extends Component<{ children: ReactNode }, PaneErrorBoundaryState> {
  override state: PaneErrorBoundaryState = {};

  static getDerivedStateFromError(error: unknown): PaneErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 開発時に追えるよう、コンソールには残す（ペイン自体は落とさない）。
    console.error('[PaneErrorBoundary] visualization threw', error, info.componentStack);
  }

  override render() {
    if (this.state.error !== undefined) {
      return (
        <div className="pane-crashed" role="alert" data-pane-crashed="true">
          <p>この可視化を表示できなかった。条件を変えて試してほしい</p>
          <ErrorDetails lines={describeErrorDetail(this.state.error)} />
        </div>
      );
    }
    return this.props.children;
  }
}
