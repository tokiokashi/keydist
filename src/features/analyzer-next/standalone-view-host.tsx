import {
  useMemo,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import type { AnalysisRuntime } from './runtime.ts';
import { projectAnalysisConditionChrome } from './analysis-view-chrome.ts';
import {
  standaloneBindingFromSearch,
  type StandaloneViewSearch,
} from './route-state.ts';
import {
  resolveViewBinding,
  type AnalysisViewDefinition,
  type ResolvedBinding,
  type ViewBinding,
} from './view-contract.ts';
import type {
  AnalysisViewProps,
  AnalysisViewTarget,
} from './views/view-contract.ts';

export interface StandaloneAnalysisViewHostProps<Config> {
  runtime: AnalysisRuntime;
  definition: AnalysisViewDefinition<Config>;
  search: StandaloneViewSearch;
  config: Config;
  onConfigChange(next: Config): void;
  View: ComponentType<AnalysisViewProps<Config>>;
}

function unavailableMessage(
  binding: ViewBinding,
  resolved: Extract<ResolvedBinding, { status: 'unavailable' }>,
): string {
  switch (resolved.reason) {
    case 'not-selected':
      return binding.kind === 'layout'
        ? `${binding.id} は現在の選択配列に含まれていない。`
        : 'この配列は現在の選択配列に含まれていない。';
    case 'other-mode':
      return binding.kind === 'layout'
        ? `このViewは ${binding.mode} modeの ${binding.id} に固定されている。`
        : 'このViewは現在とは別のmodeに固定されている。';
    case 'deleted':
      return 'このViewが参照している配列は現在のDomain catalogに存在しない。';
    case 'empty-selection':
      return '現在のmodeで解析対象の配列が選択されていない。';
  }
}

function targetFromResolved(
  cardinality: AnalysisViewDefinition['cardinality'],
  resolved: Extract<ResolvedBinding, { status: 'ok' }>,
): AnalysisViewTarget {
  if (cardinality === 'set') {
    return {
      kind: 'set',
      mode: resolved.mode,
      layoutIds: resolved.layoutIds,
    };
  }

  const layoutId = resolved.layoutIds[0];
  if (layoutId === undefined) {
    throw new Error('single-layout View resolved without a layout');
  }
  return {
    kind: 'single',
    mode: resolved.mode,
    layoutId,
  };
}

/**
 * Router-independent host for one standalone Analysis View.
 *
 * Search params are already validated by the route. This layer resolves binding against the
 * shared Session/catalog and hands one revision-fixed SnapshotReader to the View.
 */
export function StandaloneAnalysisViewHost<Config>({
  runtime,
  definition,
  search,
  config,
  onConfigChange,
  View,
}: StandaloneAnalysisViewHostProps<Config>) {
  const session = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.getSnapshot,
    runtime.session.getSnapshot,
  );
  const catalogRevision = useSyncExternalStore(
    runtime.catalog.subscribe,
    runtime.catalog.getRevision,
    runtime.catalog.getRevision,
  );
  const binding = standaloneBindingFromSearch(definition.cardinality, search);
  const resolved = resolveViewBinding({
    mode: session.mode,
    selectedLayoutIds: session.selectedLayoutIds,
    focusLayoutId: session.focusLayoutId,
    availableLayoutIdsByMode: runtime.catalog.availableLayoutIdsByMode(),
  }, definition.cardinality, binding);

  // ViewConfig/search changes do not replace the Session snapshot, so this reader remains stable.
  // Session changes get a fresh reader that is coherent for that captured revision.
  const reader = useMemo(
    () => runtime.createReader(session),
    [runtime, session, catalogRevision],
  );

  if (resolved.status === 'unavailable') {
    const canAdd = resolved.reason === 'not-selected' && binding.kind === 'layout';
    return (
      <section
        className="analysis-standalone"
        data-analysis-view={definition.type}
        data-binding-status="unavailable"
        data-binding-reason={resolved.reason}
      >
        <header className="analysis-standalone-heading">
          <div>
            <p className="eyebrow">Analyzer View</p>
            <h1>{definition.title}</h1>
          </div>
          <span className="analysis-binding-badge">binding unavailable</span>
        </header>

        <div className="analysis-binding-placeholder" role="status">
          <strong>表示対象を解決できない</strong>
          <p>{unavailableMessage(binding, resolved)}</p>
          {canAdd ? (
            <button
              type="button"
              onClick={() => runtime.commands.addSelectedLayout(binding.mode, binding.id)}
            >
              選択に追加
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const target = targetFromResolved(definition.cardinality, resolved);
  const targetLabel = target.kind === 'single'
    ? target.layoutId
    : `${target.layoutIds.length} layouts`;
  const conditionRows = projectAnalysisConditionChrome(session, target, reader);
  const configSummary = definition.describeConfig?.(config) ?? [];

  return (
    <section
      className="analysis-standalone"
      data-analysis-view={definition.type}
      data-binding-status="ok"
      data-binding-kind={binding.kind}
      data-session-target-revision={reader.revision.target}
      data-session-distance-revision={reader.revision.distance}
    >
      <header className="analysis-standalone-heading">
        <div>
          <p className="eyebrow">Analyzer View</p>
          <h1>{definition.title}</h1>
        </div>
        <span className="analysis-binding-badge">
          {binding.kind === 'layout' ? 'pinned' : definition.cardinality === 'set' ? 'session' : 'focus'}
          {' · '}{target.mode}{' · '}{targetLabel}
        </span>
      </header>

      <div className="analysis-context" aria-label="Analysis context">
        {conditionRows.map((row) => (
          <div
            className="analysis-context-row"
            data-analysis-context="conditions"
            data-layout-id={row.layoutId}
            key={row.layoutId}
          >
            <strong>Conditions · {row.layoutId}</strong>
            <div className="analysis-context-items">
              {row.effective.map((item) => (
                <span key={item.label}>
                  {item.label}={item.value}
                </span>
              ))}
              {row.overrides.length === 0 ? (
                <span className="analysis-context-default">override=none</span>
              ) : row.overrides.map((item) => (
                <span
                  className="analysis-context-override"
                  key={item.label}
                  title="layout override"
                >
                  override:{item.label}={item.value}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="analysis-context-row" data-analysis-context="view-config">
          <strong>ViewConfig</strong>
          <div className="analysis-context-items">
            {configSummary.map((item) => (
              <span key={item.label}>{item.label}={item.value}</span>
            ))}
          </div>
        </div>
      </div>

      <View
        target={target}
        snapshot={reader}
        config={config}
        onConfigChange={onConfigChange}
        commands={runtime.commands}
      />
    </section>
  );
}
