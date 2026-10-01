import { useMemo } from 'react';
import { withMultiBaseline, withTargetSetTargets } from '#engine/multi-target-selection.ts';
import type { WorkspacePane } from '#engine/workspace.ts';
import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import { ComparisonPane } from '#hosts/shared/panes/ComparisonPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { workspacePaneChrome, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** 比較表のペイン。個別画面と同じ`ComparisonPane`に、このペインが映す集合と解析設定を結ぶ。 */
export function ComparisonWorkspacePane({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const { options, onOptionsChange, diagnostics } = usePaneOptions<ComparisonOptions>(
    comparisonAnalyzer.definition,
    pane.options,
    (next) => runtime.commitPaneOptions(pane.id, next),
  );
  const chrome: PaneChrome = useMemo(
    () => workspacePaneChrome(runtime, pane, () => onOptionsChange(comparisonAnalyzer.defaultOptions)),
    [runtime, pane, onOptionsChange],
  );
  const resolved = runtime.paneTarget(pane, 'set');
  if (resolved?.kind !== 'set') return null;
  const selection = resolved.selection;
  return (
    <ComparisonPane
      env={runtime.env}
      chrome={chrome}
      selection={selection}
      colorSlots={runtime.colorSlots}
      onTargetsChange={(targets) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withTargetSetTargets(selection, targets) })}
      onBaselineChange={(baseline) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withMultiBaseline(selection, baseline) })}
      options={options}
      onOptionsChange={onOptionsChange}
      settingsDiagnostics={diagnostics}
    />
  );
}
