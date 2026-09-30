import { useMemo } from 'react';
import { withMultiTargets } from '#engine/multi-target-selection.ts';
import type { WorkspacePane } from '#engine/workspace.ts';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { NSensitivityPane } from '#hosts/shared/panes/NSensitivityPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { paneMenuItems, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** Workspaceのペインの枠まわり。h2で、見出しは固定せず、⋯を持つ。 */
const WORKSPACE_CHROME = { headingLevel: 2, showPaneNameInSettings: true } as const satisfies PaneChrome;

/** N感度のペイン。個別画面と同じ`NSensitivityPane`に、このペインが持つ集合と解析設定を結ぶ。 */
export function NSensitivityWorkspacePane({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const { options, onOptionsChange, diagnostics } = usePaneOptions<NSensitivityOptions>(
    nSensitivityAnalyzer.definition,
    pane.options,
    (next) => runtime.commitPaneOptions(pane.id, next),
  );
  const chrome: PaneChrome = useMemo(() => ({
    ...WORKSPACE_CHROME,
    menuItems: paneMenuItems(runtime, pane.id, () => onOptionsChange(nSensitivityAnalyzer.defaultOptions)),
  }), [runtime, pane.id, onOptionsChange]);
  if (pane.target.kind !== 'set') return null;
  const selection = pane.target.selection;
  return (
    <NSensitivityPane
      env={runtime.env}
      chrome={chrome}
      selection={selection}
      onTargetsChange={(targets) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withMultiTargets(selection, targets) })}
      options={options}
      onOptionsChange={onOptionsChange}
      settingsDiagnostics={diagnostics}
    />
  );
}
