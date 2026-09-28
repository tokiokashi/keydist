import type { ReactNode } from 'react';
import type { EngineRequestState } from '#engine/request.ts';
import { describeEngineRequestError, paneStatusLabel } from './pane-status.ts';
import { formatOrigin, type ConditionHeaderInfo, type ConditionSummaryRow } from './condition-summary.ts';
import { PaneErrorBoundary } from './PaneErrorBoundary.tsx';
import './pane-frame.css';

/**
 * ペインの枠（#544 §8-1・§8-5、`docs/architecture.md`「hosts/shared: ペインの枠」）。
 *
 * ここが持つのは見出し・条件の表示・状態表示・error boundaryだけ。可視化そのもの
 * （`children`）は一切計算しない。engineの依頼（`createExtractRequest`等）を購読して
 * `children`へ渡す値を用意するのは呼び出し側（`hosts/standalone`）の仕事で、
 * このcomponentは「今の状態をどう見せるか」だけを担当する。
 */
export interface PaneFrameProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Setupの実体（配列・形状・指の割当）の名前。解決前（読み込み中）は省略する。 */
  readonly header?: ConditionHeaderInfo;
  /** Traceに効く条件の一覧（#544 §3「実効値の出どころを表示する」）。 */
  readonly conditionRows: readonly ConditionSummaryRow[];
  /** 抽出の依頼の現在の状態。値そのもの（`value`）は`children`側で使うので、ここでは見ない。 */
  readonly engineState: EngineRequestState<unknown>;
  /** Trace生成段の診断（配列定義の不備等）。値として表示する（#544 §8-5）。 */
  readonly traceErrors?: readonly string[];
  readonly children: ReactNode;
}

export function PaneFrame({
  title,
  description,
  header,
  conditionRows,
  engineState,
  traceErrors,
  children,
}: PaneFrameProps) {
  const statusLabel = paneStatusLabel(engineState.status);
  const errorMessage = engineState.status === 'failed' ? describeEngineRequestError(engineState.error) : undefined;

  return (
    <section className="pane-frame" data-pane-status={engineState.status}>
      <header className="pane-frame-header">
        <div>
          <h2>{title}</h2>
          {header ? (
            <p className="pane-frame-subtitle">
              {header.layoutName} / {header.shapeName} · 指の割当: {header.fingerAssignmentName}
            </p>
          ) : null}
          {description ? <p className="pane-frame-description">{description}</p> : null}
        </div>
        {statusLabel ? (
          <span className="pane-status-badge" data-status={engineState.status}>{statusLabel}</span>
        ) : null}
      </header>

      {conditionRows.length > 0 ? (
        <details className="pane-condition-summary">
          <summary>条件（{conditionRows.length}）</summary>
          <dl>
            {conditionRows.map((row) => (
              <div
                key={row.id}
                className="pane-condition-row"
                data-not-applicable={row.applicable ? undefined : 'true'}
              >
                <dt>{row.label}</dt>
                <dd>
                  <span className="pane-condition-value">{row.displayValue}</span>
                  <span className="pane-condition-origin">（{formatOrigin(row.origin)}）</span>
                  {!row.applicable ? <span className="pane-condition-flag">この配列・Setupでは効かない</span> : null}
                  {row.diagnostics.length > 0 ? (
                    <ul className="pane-condition-diagnostics">
                      {row.diagnostics.map((diagnostic, index) => (
                        <li key={index}>{diagnostic.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      {traceErrors && traceErrors.length > 0 ? (
        <ul className="pane-trace-errors" role="alert" data-pane-trace-errors="true">
          {traceErrors.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      ) : null}

      {errorMessage ? (
        <p className="pane-error" role="alert" data-pane-error="true">{errorMessage}</p>
      ) : (
        <PaneErrorBoundary>
          <div className="pane-body" data-pane-stale={engineState.status === 'stale' || undefined}>
            {children}
          </div>
        </PaneErrorBoundary>
      )}
    </section>
  );
}
