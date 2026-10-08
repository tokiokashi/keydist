import { useMemo } from 'react';
import type { WorkspacePane } from '#engine/workspace.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import type { BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { BigramFlowPane } from '#hosts/shared/panes/BigramFlowPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { workspacePaneChrome, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** Bigram Flowのペイン。個別画面と同じ`BigramFlowPane`に、このペインが映す対象と解析設定を結ぶ。 */
export function BigramFlowWorkspacePane({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const { options, onOptionsChange, diagnostics } = usePaneOptions<BigramFlowOptions>(
    bigramFlowAnalyzer.definition,
    runtime.paneOptions(pane),
    runtime.paneOptionsKey(pane),
    (next) => runtime.commitPaneOptions(pane.id, next),
  );
  const chrome: PaneChrome = useMemo(
    () => workspacePaneChrome(runtime, pane, () => onOptionsChange(bigramFlowAnalyzer.defaultOptions)),
    [runtime, pane, onOptionsChange],
  );
  const resolved = runtime.paneTarget(pane, 'single');
  if (resolved?.kind !== 'single') return null;
  return (
    <BigramFlowPane
      env={runtime.env}
      chrome={chrome}
      target={resolved.target}
      onTargetChange={(target) => runtime.setPaneTarget(pane.id, { kind: 'single', target })}
      options={options}
      onOptionsChange={onOptionsChange}
      settingsDiagnostics={diagnostics}
    />
  );
}
