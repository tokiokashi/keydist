import { useMemo } from 'react';
import type { WorkspacePane } from '#engine/workspace.ts';
import { fingerDistanceAnalyzer } from '#analyzers/finger-distance/definition.tsx';
import type { FingerDistanceOptions } from '#analyzers/finger-distance/options.ts';
import { FingerDistancePane } from '#hosts/shared/panes/FingerDistancePane.tsx';
import type { PaneChrome } from '#hosts/shared/panes/pane-environment.ts';
import { workspacePaneChrome, type WorkspacePaneRuntime } from '../pane-runtime.ts';
import { usePaneOptions } from '../use-pane-options.ts';

/** 指ごとの距離のペイン。個別画面と同じ`FingerDistancePane`に、このペインが映す対象と解析設定を結ぶ。 */
export function FingerDistanceWorkspacePane({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const { options, onOptionsChange, diagnostics } = usePaneOptions<FingerDistanceOptions>(
    fingerDistanceAnalyzer.definition,
    pane.options,
    pane.id,
    (next) => runtime.commitPaneOptions(pane.id, next),
  );
  const chrome: PaneChrome = useMemo(
    () => workspacePaneChrome(runtime, pane, () => onOptionsChange(fingerDistanceAnalyzer.defaultOptions)),
    [runtime, pane, onOptionsChange],
  );
  const resolved = runtime.paneTarget(pane, 'single');
  if (resolved?.kind !== 'single') return null;
  return (
    <FingerDistancePane
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
