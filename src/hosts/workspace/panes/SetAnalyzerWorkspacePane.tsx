import { useMemo } from 'react';
import { withMultiBaseline, withTargetSetTargets } from '#engine/multi-target-selection.ts';
import type { WorkspacePane } from '#engine/workspace.ts';
import type { SetAnalyzerPaneParts } from '#analyzers/pane-parts.tsx';
import { SetAnalyzerPane } from '#hosts/shared/panes/SetAnalyzerPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { workspacePaneChrome, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** 対象の集合を見るAnalyzerのペイン。個別画面と同じ`SetAnalyzerPane`に、このペインが映す集合と解析設定を結ぶ。 */
export function SetAnalyzerWorkspacePane<Options, Extracted, RowContext>({
  analyzer,
  pane,
  runtime,
}: {
  readonly analyzer: SetAnalyzerPaneParts<Options, Extracted, RowContext>;
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const { options, onOptionsChange } = usePaneOptions<Options>(analyzer.definition, runtime.paneOptions(pane), runtime.paneOptionsKey(pane), (next) =>
    runtime.commitPaneOptions(pane.id, next),
  );
  const coveredByMaximizedPane = runtime.maximizedPaneId !== undefined && runtime.maximizedPaneId !== pane.id;
  const computeOnlyWhenOnScreen = analyzer.computeOnlyWhenOnScreen === true;
  const chrome: PaneChrome = useMemo(
    () => ({
      ...workspacePaneChrome(runtime, pane, () => onOptionsChange(analyzer.defaultOptions)),
      ...(computeOnlyWhenOnScreen ? { computeOnlyWhenOnScreen, coveredByMaximizedPane } : {}),
    }),
    [runtime, pane, onOptionsChange, analyzer.defaultOptions, computeOnlyWhenOnScreen, coveredByMaximizedPane],
  );
  const resolved = runtime.paneTarget(pane, 'set');
  if (resolved?.kind !== 'set') return null;
  const selection = resolved.selection;
  return (
    <SetAnalyzerPane
      analyzer={analyzer}
      env={runtime.env}
      chrome={chrome}
      selection={selection}
      colorSlots={runtime.colorSlots}
      onTargetsChange={(targets) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withTargetSetTargets(selection, targets) })}
      onBaselineChange={(baseline) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withMultiBaseline(selection, baseline) })}
      options={options}
      onOptionsChange={onOptionsChange}
    />
  );
}
