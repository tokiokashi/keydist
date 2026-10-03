import { useMemo } from 'react';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { nameTargets, type AnalysisTarget } from '#input/setup/index.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import type { BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { conditionHeaderInfoFromResolvedInput, traceConditionSummary } from '../condition-summary.ts';
import { combinePaneStates } from '../pane-status.ts';
import { recommendedWidthRemOf } from '#analyzers/recommended-width.ts';
import { PaneFrame } from '../PaneFrame.tsx';
import { overrideWinsNotices } from '../condition-edit.ts';
import { resolvePaneInput } from '../resolve-pane-input.ts';
import { targetNameSource } from '../target-name-source.ts';
import { setupNumbersOf, targetChoiceGroups } from '../target-choices.ts';
import { TargetSelection } from '../TargetSelection.tsx';
import { useAnalyzerPane } from '../use-analyzer-pane.ts';
import type { PaneChrome, PaneEnvironment } from './pane-environment.ts';

/**
 * Bigram Flowのペイン（対象を1つ見るAnalyzer）。個別画面とWorkspaceのペインが同じこのcomponentを使う
 * （docs/architecture.md「画面の構成」「Analyzerがペインに渡すもの」）。
 *
 * 持つのは、対象の解決・engineへの依頼・条件の要約・見出し・状態表示まで。値の持ち主
 * （対象・解析設定をどこへ保存するか）と、文脈バー・テキストは持たない。器が、下書きの値と
 * 変更の通知をここへ結ぶ。
 */
export interface BigramFlowPaneProps {
  readonly env: PaneEnvironment;
  readonly chrome?: PaneChrome;
  readonly target: AnalysisTarget;
  readonly onTargetChange: (next: AnalysisTarget) => void;
  /** 画面上の解析設定（下書き）。 */
  readonly options: BigramFlowOptions;
  /** 下書きの更新と、資産への反映（間引き済み）は器が結ぶ。 */
  readonly onOptionsChange: (next: BigramFlowOptions) => void;
  /** 保存した解析設定を読み直した時の診断。 */
  readonly settingsDiagnostics?: readonly CodecDiagnostic[];
  /** 共有リンクを開いた時に、取り込めなかったものを伝える文。 */
  readonly linkNotices?: readonly string[];
}

export function BigramFlowPane({
  env,
  chrome = {},
  target,
  onTargetChange,
  options,
  onOptionsChange,
  settingsDiagnostics = [],
  linkNotices,
}: BigramFlowPaneProps) {
  const { setups, overrides, catalog, resolvedText, cache, dispatch, assetsReady } = env;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  const resolution = useMemo(
    () => resolvePaneInput(target, setupsById, catalog, overrides, resolvedText),
    [target, setupsById, catalog, overrides, resolvedText],
  );
  const pane = useAnalyzerPane(cache, bigramFlowAnalyzer.definition, options, resolution);

  const conditionRows = resolution.ok ? traceConditionSummary(resolution.input.cascade, catalog.setupCatalog) : [];
  const header = resolution.ok
    ? conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry)
    : undefined;
  const traceErrors = pane.trace.status === 'ready' || pane.trace.status === 'stale'
    ? pane.trace.value.trace.errors
    : [];

  // 対象の名前（読み上げ用の名前と、見出しの対象・hoverに出すフル名）。単一対象なので集合は自分1つ。
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const named = useMemo(
    () => nameTargets([targetNameSource(target, resolution, setupsById, setupNumbers, catalog.setupCatalog)])[0],
    [target, resolution, setupsById, setupNumbers, catalog.setupCatalog],
  );

  const choiceGroups = useMemo(() => targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups,
    selected: [target],
  }), [catalog, setups, target]);

  const { Body, Settings } = bigramFlowAnalyzer;
  const extraction = pane.extraction;
  const hasExtraction = extraction.status === 'ready' || extraction.status === 'stale';
  const hasTrace = pane.trace.status === 'ready' || pane.trace.status === 'stale';

  return (
    <PaneFrame
      name={bigramFlowAnalyzer.name}
      description={bigramFlowAnalyzer.description}
      recommendedWidthRem={recommendedWidthRemOf(bigramFlowAnalyzer)}
      headingLevel={chrome.headingLevel}
      stickyHeader={chrome.stickyHeader}
      menuItems={chrome.menuItems}
      headerAction={chrome.headerAction}
      targetBinding={chrome.targetBinding}
      showPaneNameInSettings={chrome.showPaneNameInSettings}
      {...(named === undefined || !assetsReady ? {} : { targetName: named.displayName })}
      target={(
        <TargetSelection
          mode="single"
          groups={choiceGroups}
          selected={[target]}
          // 資産の読み込み前の対象は、保存済みの対象が未反映なだけの既定値（QWERTY）。比較表・N感度が
          // 空の対象を出さないのと同じく、読み込みが済むまで名前を出さず、保存済みの名前へ置き換わる所を見せない
          summary={named === undefined || !assetsReady ? [] : [{ key: named.key, label: named.displayName, fullName: named.fullName }]}
          onChange={(next) => {
            if (next[0] !== undefined) onTargetChange(next[0]);
          }}
        />
      )}
      settings={<Settings options={options} onOptionsChange={onOptionsChange} />}
      onResetOptions={() => onOptionsChange(bigramFlowAnalyzer.defaultOptions)}
      header={header}
      conditionRows={conditionRows}
      conditionEditor={{
        overrides,
        dispatch,
        presetLibrary: env.presetLibrary,
        generatePresetId: env.generatePresetId,
        undo: env.undo,
        shapes: catalog.setupCatalog.shapes,
        customFingerAssignments: catalog.customFingerAssignments,
        customRomajiRules: catalog.customRomajiRules,
        notices: overrideWinsNotices(conditionRows, catalog.setupCatalog),
        ...(env.workspaceId === undefined
          ? {}
          : {
            workspace: { id: env.workspaceId },
            workspaceNotices: overrideWinsNotices(conditionRows, catalog.setupCatalog, 'Workspace'),
          }),
        // 対象が配列でも、Setupでも、書き込む先は配列のレベル（Setupのレベルへ書く導線は別）。
        ...(resolution.ok ? { layout: { id: resolution.input.layout.id, name: resolution.input.layout.name } } : {}),
      }}
      engineState={combinePaneStates(extraction, pane.trace)}
      traceErrors={traceErrors}
      settingsDiagnostics={settingsDiagnostics}
      linkNotices={linkNotices}
    >
      {resolution.ok && hasExtraction && hasTrace ? (
        <Body
          layout={resolution.input.layout}
          geometry={resolution.input.geometry}
          trace={pane.trace.value.trace}
          extracted={extraction.value.extracted}
          options={options}
          onOptionsChange={onOptionsChange}
        />
      ) : undefined}
    </PaneFrame>
  );
}
