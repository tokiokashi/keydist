import { useMemo } from 'react';
import type { WorkspacePane } from '#engine/workspace.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import type { BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { BigramFlowPane } from '#hosts/shared/panes/BigramFlowPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { paneMenuItems, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** Workspaceのペインの枠まわり。h2で、見出しは固定せず、⋯を持つ。 */
const WORKSPACE_CHROME = { headingLevel: 2, showPaneNameInSettings: true } as const satisfies PaneChrome;

/** Bigram Flowのペイン。個別画面と同じ`BigramFlowPane`に、このペインが持つ対象と解析設定を結ぶ。 */
export function BigramFlowWorkspacePane({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const { options, onOptionsChange, diagnostics } = usePaneOptions<BigramFlowOptions>(
    bigramFlowAnalyzer.definition,
    pane.options,
    (next) => runtime.commitPaneOptions(pane.id, next),
  );
  const chrome: PaneChrome = useMemo(() => ({
    ...WORKSPACE_CHROME,
    menuItems: paneMenuItems(runtime, pane.id, () => onOptionsChange(bigramFlowAnalyzer.defaultOptions)),
  }), [runtime, pane.id, onOptionsChange]);
  if (pane.target.kind !== 'single') return null;
  return (
    <BigramFlowPane
      env={runtime.env}
      chrome={chrome}
      target={pane.target.target}
      onTargetChange={(target) => runtime.setPaneTarget(pane.id, { kind: 'single', target })}
      options={options}
      onOptionsChange={onOptionsChange}
      settingsDiagnostics={diagnostics}
    />
  );
}
