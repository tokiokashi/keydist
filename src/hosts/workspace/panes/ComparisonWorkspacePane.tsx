import { useMemo } from 'react';
import { withMultiBaseline, withMultiTargets } from '#engine/multi-target-selection.ts';
import type { WorkspacePane } from '#engine/workspace.ts';
import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import { ComparisonPane } from '#hosts/shared/panes/ComparisonPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { paneMenuItems, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** Workspaceのペインの枠まわり。h2で、見出しは固定せず、⋯を持つ。 */
const WORKSPACE_CHROME = { headingLevel: 2, showPaneNameInSettings: true } as const satisfies PaneChrome;

/** 比較表のペイン。個別画面と同じ`ComparisonPane`に、このペインが持つ集合と解析設定を結ぶ。 */
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
  const chrome: PaneChrome = useMemo(() => ({
    ...WORKSPACE_CHROME,
    menuItems: paneMenuItems(runtime, pane.id, () => onOptionsChange(comparisonAnalyzer.defaultOptions)),
  }), [runtime, pane.id, onOptionsChange]);
  if (pane.target.kind !== 'set') return null;
  const selection = pane.target.selection;
  return (
    <ComparisonPane
      env={runtime.env}
      chrome={chrome}
      selection={selection}
      onTargetsChange={(targets) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withMultiTargets(selection, targets) })}
      onBaselineChange={(baseline) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withMultiBaseline(selection, baseline) })}
      options={options}
      onOptionsChange={onOptionsChange}
      settingsDiagnostics={diagnostics}
    />
  );
}
