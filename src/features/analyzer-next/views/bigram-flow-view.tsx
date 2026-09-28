import { BigramFlowView } from '#analyzers/bigram-flow/bigram-flow-view.tsx';
import type { BigramFlowViewConfig } from '../view-registry.ts';
import type { AnalysisViewProps } from './view-contract.ts';

export function AnalyzerNextBigramFlowView({
  target,
  snapshot,
  config,
  onConfigChange,
}: AnalysisViewProps<BigramFlowViewConfig>) {
  if (target.kind !== 'single') {
    throw new Error('Bigram Flow requires a single-layout target');
  }

  const current = snapshot.get(target.layoutId)?.snapshot;

  return (
    <BigramFlowView
      data={current ?? null}
      config={config}
      onConfigChange={onConfigChange}
    />
  );
}
