import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  bigramFlowConfigFromSearch,
  bigramFlowConfigSearchPatch,
  validateBigramFlowSearch,
} from '../features/analyzer-next/bigram-flow-route-state.ts';
import {
  getBrowserAnalysisRuntime,
} from '../features/analyzer-next/browser-runtime.ts';
import {
  StandaloneAnalysisViewHost,
} from '../features/analyzer-next/standalone-view-host.tsx';
import {
  analysisViewDefinition,
  type BigramFlowViewConfig,
} from '../features/analyzer-next/view-registry.ts';
import type {
  AnalysisViewDefinition,
} from '../features/analyzer-next/view-contract.ts';
import {
  AnalyzerNextBigramFlowView,
} from '../features/analyzer-next/views/bigram-flow-view.tsx';
import type { AnalysisRuntime } from '../features/analyzer-next/runtime.ts';
import '../features/analyzer-next/standalone-view.css';

const BIGRAM_FLOW_DEFINITION = analysisViewDefinition('bigram-flow') as
  AnalysisViewDefinition<BigramFlowViewConfig>;

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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/analyzer/flow' });
  const [runtime, setRuntime] = useState<AnalysisRuntime | null>(null);
  const config = useMemo(
    () => bigramFlowConfigFromSearch(search),
    [search],
  );

  useEffect(() => {
    setRuntime(getBrowserAnalysisRuntime());
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

  return (
    <StandaloneAnalysisViewHost
      runtime={runtime}
      definition={BIGRAM_FLOW_DEFINITION}
      search={search}
      config={config}
      onConfigChange={(next) => {
        void navigate({
          search: (previous) => ({
            ...previous,
            ...bigramFlowConfigSearchPatch(next),
          }),
        });
      }}
      View={AnalyzerNextBigramFlowView}
    />
  );
}
