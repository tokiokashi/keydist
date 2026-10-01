import { useMemo } from 'react';
import { withTargetSetTargets } from '#engine/multi-target-selection.ts';
import type { WorkspacePane } from '#engine/workspace.ts';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { NSensitivityPane } from '#hosts/shared/panes/NSensitivityPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { workspacePaneChrome, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** N感度のペイン。個別画面と同じ`NSensitivityPane`に、このペインが映す集合と解析設定を結ぶ。 */
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
  const chrome: PaneChrome = useMemo(
    () => workspacePaneChrome(runtime, pane, () => onOptionsChange(nSensitivityAnalyzer.defaultOptions)),
    [runtime, pane, onOptionsChange],
  );
  const resolved = runtime.paneTarget(pane, 'set');
  if (resolved?.kind !== 'set') return null;
  const selection = resolved.selection;
  return (
    <NSensitivityPane
      env={runtime.env}
      chrome={chrome}
      selection={selection}
      colorSlots={runtime.colorSlots}
      onTargetsChange={(targets) => runtime.setPaneTarget(pane.id, { kind: 'set', selection: withTargetSetTargets(selection, targets) })}
      options={options}
      onOptionsChange={onOptionsChange}
      settingsDiagnostics={diagnostics}
    />
  );
}
