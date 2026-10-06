import { useState, useSyncExternalStore } from 'react';
import type { AnalyzerBigramFlowModel } from './analyzer-bigram-flow-model.ts';
import {
  DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG,
  type BigramFlowDisplayConfig,
} from '#analyzers/bigram-flow/options.ts';
import { BigramFlowView } from '#analyzers/bigram-flow/bigram-flow-view.tsx';

function initialConfig(): BigramFlowDisplayConfig {
  return {
    ...DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG,
    selectedFingers: [...DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.selectedFingers],
  };
}

/**
 * Legacy Analyzer adapter.
 *
 * Analyzer Next consumes BigramFlowView directly with host-owned ViewConfig.
 */
export function AnalyzerBigramFlow({ model }: { model: AnalyzerBigramFlowModel }) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const [config, setConfig] = useState<BigramFlowDisplayConfig>(initialConfig);

  return (
    <BigramFlowView
      data={snapshot.data}
      config={config}
      onConfigChange={setConfig}
    />
  );
}
