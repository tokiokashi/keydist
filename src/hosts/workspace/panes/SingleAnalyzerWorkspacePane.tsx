import { useMemo } from 'react';
import type { WorkspacePane } from '#engine/workspace.ts';
import type { SingleAnalyzerPaneParts } from '#analyzers/pane-parts.tsx';
import { SingleAnalyzerPane } from '#hosts/shared/panes/SingleAnalyzerPane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { workspacePaneChrome, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** 対象を1つ見るAnalyzerのペイン。個別画面と同じ`SingleAnalyzerPane`に、このペインが映す対象と解析設定を結ぶ。 */
export function SingleAnalyzerWorkspacePane<Options, Extracted>({
  analyzer,
  pane,
  runtime,
}: {
  readonly analyzer: SingleAnalyzerPaneParts<Options, Extracted>;
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const { options, onOptionsChange, diagnostics } = usePaneOptions<Options>(
    analyzer.definition,
    runtime.paneOptions(pane),
    runtime.paneOptionsKey(pane),
    (next) => runtime.commitPaneOptions(pane.id, next),
  );
  const chrome: PaneChrome = useMemo(
    () => workspacePaneChrome(runtime, pane, () => onOptionsChange(analyzer.defaultOptions)),
    [runtime, pane, onOptionsChange],
  );
  const resolved = runtime.paneTarget(pane, 'single');
  if (resolved?.kind !== 'single') return null;
  return (
    <SingleAnalyzerPane
      analyzer={analyzer}
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
