import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  createBrowserAnalysisRuntime,
  type AnalysisRuntime,
} from '../features/analyzer-next/analysis-runtime.ts';
import {
  bigramFlowConfigFromSearch,
  bigramFlowConfigSearchPatch,
  validateBigramFlowSearch,
} from '../features/analyzer-next/bigram-flow-route-state.ts';
import { standaloneBindingFromSearch } from '../features/analyzer-next/route-state.ts';
import { resolveViewBinding } from '../features/analyzer-next/view-contract.ts';
import { AnalyzerNextBigramFlowView } from '../features/analyzer-next/views/bigram-flow-view.tsx';
import type { ResolvedBinding, ViewBinding } from '../features/analyzer-next/view-contract.ts';
import '../features/analyzer-next/standalone-view.css';

export const Route = createFileRoute('/analyzer/flow')({
  validateSearch: validateBigramFlowSearch,
  head: () => ({
    meta: [
      { title: 'Bigram Flow | keydist' },
      {
        name: 'description',
        content: 'Bigramの打鍵方向と移動を配列ごとに可視化するAnalyzer View',
      },
    ],
  }),
  component: AnalyzerFlowRoute,
});

function AnalyzerFlowRoute() {
  const [runtime, setRuntime] = useState<AnalysisRuntime | null>(null);

  useEffect(() => {
    setRuntime(createBrowserAnalysisRuntime());
  }, []);

  if (runtime === null) {
    return (
      <section className="analysis-standalone" aria-busy="true">
        <p className="eyebrow">Analyzer View</p>
        <h1>Bigram Flow</h1>
        <p className="analysis-standalone-loading">解析Sessionを読み込んでいる。</p>
      </section>
    );
  }

  return <LoadedAnalyzerFlowRoute runtime={runtime} />;
}

function unavailableMessage(binding: ViewBinding, resolved: ResolvedBinding): string {
  if (resolved.status === 'ok') return '';
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

function LoadedAnalyzerFlowRoute({ runtime }: { runtime: AnalysisRuntime }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/analyzer/flow' });
  const session = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.getSnapshot,
    runtime.session.getSnapshot,
  );
  const binding = useMemo(
    () => standaloneBindingFromSearch('single', search),
    [search],
  );
  const resolved = useMemo(
    () => resolveViewBinding({
      mode: session.mode,
      selectedLayoutIds: session.selectedLayoutIds,
      focusLayoutId: session.focusLayoutId,
      availableLayoutIdsByMode: runtime.catalog.availableLayoutIdsByMode(),
    }, 'single', binding),
    [binding, runtime, session],
  );
  const reader = useMemo(
    () => runtime.createReader(session),
    [runtime, session],
  );
  const config = useMemo(
    () => bigramFlowConfigFromSearch(search),
    [search],
  );

  const handleConfigChange = (next: typeof config) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        ...bigramFlowConfigSearchPatch(next),
      }),
    });
  };

  if (resolved.status !== 'ok') {
    const canAdd = resolved.reason === 'not-selected' && binding.kind === 'layout';
    return (
      <section className="analysis-standalone">
        <header className="analysis-standalone-heading">
          <div>
            <p className="eyebrow">Analyzer View</p>
            <h1>Bigram Flow</h1>
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

  const layoutId = resolved.layoutIds[0]!;
  return (
    <section
      className="analysis-standalone"
      data-analysis-view="bigram-flow"
      data-binding-kind={binding.kind}
      data-layout-id={layoutId}
    >
      <header className="analysis-standalone-heading">
        <div>
          <p className="eyebrow">Analyzer View</p>
          <h1>Bigram Flow</h1>
        </div>
        <span className="analysis-binding-badge">
          {binding.kind === 'layout' ? 'pinned' : 'focus'} · {session.mode} · {layoutId}
        </span>
      </header>

      <AnalyzerNextBigramFlowView
        target={{ kind: 'single', mode: resolved.mode, layoutId }}
        snapshot={reader}
        config={config}
        onConfigChange={handleConfigChange}
        commands={runtime.commands}
      />
    </section>
  );
}
