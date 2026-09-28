import type { ReactNode } from 'react';
import type { EngineRequestState } from '#engine/request.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { describeEngineRequestError, paneStatusLabel } from './pane-status.ts';
import { conditionDiagnosticText, type ConditionHeaderInfo, type ConditionSummaryRow } from './condition-summary.ts';
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
  /**
   * 解析設定（Analyzerの`Options`）を保存から読み直した時の診断（`decodeOptions`が積む、
   * 壊れた値・未知の値を既定値へ戻したという報告）。`traceErrors`（Trace生成段）とは
   * 出どころが違うので混ぜず、Analyzerを問わず使える汎用のpropとして別に持つ
   * （レビュー指摘: 診断を作って捨てていたのを、ここで画面へ出す受け皿にする）。
   */
  readonly settingsDiagnostics?: readonly CodecDiagnostic[];
  readonly children: ReactNode;
}

export function PaneFrame({
  title,
  description,
  header,
  conditionRows,
  engineState,
  traceErrors,
  settingsDiagnostics,
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
                  <span className="pane-condition-origin">（{row.originLabel}）</span>
                  {!row.applicable ? <span className="pane-condition-flag">この配列・Setupでは効かない</span> : null}
                  {(() => {
                    const texts = row.diagnostics
                      .map((diagnostic) => conditionDiagnosticText(row, diagnostic))
                      .filter((text): text is string => text !== undefined);
                    return texts.length > 0 ? (
                      <ul className="pane-condition-diagnostics">
                        {texts.map((text, index) => <li key={index}>{text}</li>)}
                      </ul>
                    ) : null;
                  })()}
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

      {/*
        読み直しの診断文は保存形式のキー名・検証ライブラリの英文を含む開発者向けの文なので、
        個々には出さず、何が起きたかを1行で伝える（件数だけ添える）。
      */}
      {settingsDiagnostics && settingsDiagnostics.length > 0 ? (
        <p className="pane-settings-diagnostics" role="status" data-pane-settings-diagnostics="true">
          読み取れない解析設定があったため、その項目は既定値へ戻した（{settingsDiagnostics.length}件）
        </p>
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
