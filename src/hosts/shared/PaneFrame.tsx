import { useRef, useState, type ReactNode } from 'react';
import type { EngineRequestState } from '#engine/request.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { describeEngineRequestError, engineRequestErrorDetail, paneStatusLabel, TRACE_ERRORS_SENTENCE } from './pane-status.ts';
import type { ConditionHeaderInfo, ConditionSummaryRow, ConditionTargetDiff } from './condition-summary.ts';
import { ConditionSummary } from './ConditionSummary.tsx';
import type { ConditionEditorContext } from './ConditionEditor.tsx';
import { ErrorDetails } from './ErrorDetails.tsx';
import { PaneErrorBoundary } from './PaneErrorBoundary.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { PaneMenu, SettingsIcon, type PaneMenuItem } from './PaneHeaderParts.tsx';
import { SettingsWindow } from './SettingsWindow.tsx';
import './pane-frame.css';

/**
 * ペインの枠（docs/architecture.md「ペイン」「Analyzerがペインに渡すもの」）。
 *
 * 見出しは個別画面が「Analyzer名 ⓘ / 対象 / 解析設定」、Workspaceのペインは末尾に⋯が付く。
 * ⋯のあるペインは、狭い時に2段に固定する
 * （1段目: 名前・ⓘ・⋯、2段目: 対象・解析設定）。段数はペインの幅だけで決め、名前の長さでは変えない。
 * ⋯の無い個別画面は、固定する見出しを薄く保つため狭くても1行のまま。
 *
 * Analyzerから受け取るのは名前・短い説明・本体・解析設定のcomponentだけで、置く場所はここが決める。
 * engineの依頼を購読して本体へ渡す値を用意するのは呼び出し側（`hosts/<host>`）の仕事で、
 * このcomponentは「今の状態をどう見せるか」だけを担当する。
 */
export interface PaneFrameProps {
  /** Analyzer名。 */
  readonly name: string;
  /** Analyzerの短い説明。見出しのⓘで出す。 */
  readonly description: string;
  /** 個別画面ではペインのAnalyzer名がページのh1になる。Workspaceでは2。 */
  readonly headingLevel?: 1 | 2;
  /**
   * 読み上げ用の名前に添える対象の名前（「Bigram Flow — QWERTY」）。Workspaceでは
   * 解析設定の小窓にも出す（どのペインの設定か分かるように）。
   */
  readonly targetName?: string;
  /**
   * 見出しを文脈バーの下に固定する（個別画面）。図を下までスクロールしても対象と解析設定を変えられる。
   * Workspaceのペインは自分の枠の中でスクロールするので固定しない。
   */
  readonly stickyHeader?: boolean;
  /** 見出しの対象の欄（単一対象の選択、集合の要約とその選択）。 */
  readonly target: ReactNode;
  /** 解析設定のcomponent（Analyzerの`Settings`をホストが値と結んだもの）。 */
  readonly settings: ReactNode;
  /** Workspaceのペインでは、小窓にペイン名を出す。個別画面ではページに1枚なので出さない。 */
  readonly showPaneNameInSettings?: boolean;
  /** ⋯のメニュー。空なら⋯を出さない（個別画面は出さない。Workspaceのペインが使う）。 */
  readonly menuItems?: readonly PaneMenuItem[];
  /**
   * 解析設定をAnalyzerの既定値（`defaultOptions`）へ戻す。解析設定の小窓のヘッダーに「すべて初期値に戻す」を出す。
   * 戻す先は個別画面でもWorkspaceでも既定値で、URLで開いた時の値や保存した値へは戻さない（#637）。
   */
  readonly onResetOptions?: () => void;
  /** 対象の実体（配列・物理配列・指の割当）の名前。解決前（読み込み中）は省略する。 */
  readonly header?: ConditionHeaderInfo;
  /** Traceに効く条件の一覧（#544 §3「実効値の出どころを表示する」）。 */
  readonly conditionRows: readonly ConditionSummaryRow[];
  /** 条件のモーダルが全体のレベルの条件を書き換えるための手持ち。 */
  readonly conditionEditor: ConditionEditorContext;
  /** 複数の対象を持つペインの、対象ごとの差（`conditionRows`は共通の条件）。 */
  readonly conditionTargetDiffs?: readonly ConditionTargetDiff[];
  /** 抽出の依頼の現在の状態。値そのもの（`value`）は本体側で使うので、ここでは見ない。 */
  readonly engineState: EngineRequestState<unknown>;
  /** Trace生成段の診断（配列定義の不備等）。値として表示する（#544 §8-5）。 */
  readonly traceErrors?: readonly string[];
  /**
   * 解析設定を保存・URLから読み直した時の診断（壊れた値・未知の値を既定値へ戻したという報告）。
   * `traceErrors`とは出どころが違うので混ぜない。
   */
  readonly settingsDiagnostics?: readonly CodecDiagnostic[];
  /**
   * ペイン全体で対象が空の時に出すもの（対象を選ぶボタン等）。これがある間は本体を呼ばない。
   * 選べば分かる結果（「選ぶと表が出る」等）の説明は置かない。
   */
  readonly emptyContent?: ReactNode;
  /**
   * 本体。描ける値がそろってから渡す。`undefined`の間（計算中で前の結果も無い）は枠が計算中と出す。
   */
  readonly children?: ReactNode;
}

export function PaneFrame({
  name,
  description,
  headingLevel = 2,
  stickyHeader = false,
  targetName,
  target,
  settings,
  showPaneNameInSettings = false,
  menuItems = [],
  onResetOptions,
  header,
  conditionRows,
  conditionEditor,
  conditionTargetDiffs,
  engineState,
  traceErrors,
  settingsDiagnostics,
  emptyContent,
  children,
}: PaneFrameProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const statusLabel = emptyContent === undefined ? paneStatusLabel(engineState.status) : '';
  const errorMessage = emptyContent === undefined && engineState.status === 'failed'
    ? describeEngineRequestError(engineState.error)
    : undefined;
  const paneName = targetName === undefined ? name : `${name} — ${targetName}`;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  const closeSettings = () => {
    setSettingsOpen(false);
    // 見出しを固定しないペインではボタンが画面外にあり、既定のfocus()はそこまでスクロールしてしまう。
    settingsButtonRef.current?.focus({ preventScroll: true });
  };

  return (
    <section className="pane-frame" aria-label={paneName} data-pane-status={engineState.status}>
      <header className="pane-frame-header" data-sticky={stickyHeader || undefined} data-menu={menuItems.length > 0 || undefined}>
        <div className="pane-frame-name">
          <Heading className="pane-frame-title">{name}</Heading>
          <InfoButton name={name} description={description} />
          {statusLabel ? (
            <span className="pane-status-badge" data-status={engineState.status}>{statusLabel}</span>
          ) : null}
        </div>
        <div className="pane-frame-target">{target}</div>
        <button
          ref={settingsButtonRef}
          type="button"
          className="pane-settings-button"
          aria-label="解析設定"
          aria-expanded={settingsOpen}
          onClick={() => (settingsOpen ? closeSettings() : setSettingsOpen(true))}
        >
          <SettingsIcon />
          <span className="pane-settings-button-text">解析設定</span>
        </button>
        {menuItems.length === 0 ? null : (
          <div className="pane-frame-menu">
            <PaneMenu paneName={paneName} items={menuItems} />
          </div>
        )}
      </header>

      <SettingsWindow
        open={settingsOpen}
        onClose={closeSettings}
        anchor={settingsButtonRef.current}
        {...(onResetOptions === undefined ? {} : { onReset: onResetOptions })}
        {...(showPaneNameInSettings ? { paneName } : {})}
      >
        {settings}
      </SettingsWindow>

      <ConditionSummary rows={conditionRows} header={header} targetDiffs={conditionTargetDiffs} editor={conditionEditor} />

      {traceErrors && traceErrors.length > 0 ? (
        <div className="pane-trace-errors" role="alert" data-pane-trace-errors="true">
          <p>{TRACE_ERRORS_SENTENCE}</p>
          <ErrorDetails lines={traceErrors} />
        </div>
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

      {emptyContent !== undefined ? (
        <div className="pane-empty" data-pane-empty="true">{emptyContent}</div>
      ) : errorMessage ? (
        <div className="pane-error" role="alert" data-pane-error="true">
          <p>{errorMessage}</p>
          {engineState.status === 'failed' ? <ErrorDetails lines={engineRequestErrorDetail(engineState.error)} /> : null}
        </div>
      ) : children === undefined ? (
        <p className="pane-busy" aria-busy="true" data-pane-busy="true">計算している…</p>
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
