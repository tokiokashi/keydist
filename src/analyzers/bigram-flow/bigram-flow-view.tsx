import { useMemo } from 'react';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Trace } from '#trace/generate.ts';
import { BigramFlowVisualization } from './definition.tsx';
import { computeBigramFlowExtraction } from './extract.ts';
import type { BigramFlowDisplayConfig } from './options.ts';

/**
 * `src/legacy/analyzer-bigram-flow.tsx`・`src/features/analyzer-next/views/bigram-flow-view.tsx`
 * （どちらも新コードからはimport禁止の旧実装。docs/architecture.md「移行中の扱い」）が
 * まだ直接importしている、旧`BigramFlowView`の後方互換シム。
 *
 * このAnalyzerの実体（抽出・可視化）はすでに`extract.ts` / `definition.tsx`へ移した。
 * legacy側はengine（`engine/cache.ts`の`getExtraction`）を経由しないので、ここで
 * `computeBigramFlowExtraction`を直接呼んで抽出だけその場で行い、結果を
 * `BigramFlowVisualization`（純粋な可視化component）へそのまま渡す。
 * legacy側のprops形（`data` / `config` / `onConfigChange`）は変えない
 * （AGENTS.md「消える側のコードは動き続けるのに必要な分だけ追従させる」）。
 */

export interface BigramFlowViewData {
  layout: Layout;
  trace: Trace;
  geometry: Geometry;
}

export interface BigramFlowViewProps {
  data: BigramFlowViewData | null;
  config: BigramFlowDisplayConfig;
  onConfigChange(next: BigramFlowDisplayConfig): void;
}

export function BigramFlowView({
  data,
  config,
  onConfigChange,
}: BigramFlowViewProps) {
  // 抽出に効くのはsource/selectedFingers/polarBandwidthだけ（options.tsの
  // bigramFlowExtractKeyOfコメント参照）。見た目だけの設定変更で毎回再計算しないよう、
  // メモの依存もその3項目に絞る。
  const extracted = useMemo(
    () => data ? computeBigramFlowExtraction(data.trace, config) : null,
    [data, config.source, config.selectedFingers.join(','), config.polarBandwidth],
  );

  if (!data || !extracted) {
    return (
      <div className="flow-analysis-locked" data-react-feature="bigram-flow">
        <strong>Bigram Flow</strong>
        <p>詳細表示する配列を選ぶとベクトルを表示する。</p>
      </div>
    );
  }

  return (
    <BigramFlowVisualization
      layout={data.layout}
      geometry={data.geometry}
      trace={data.trace}
      extracted={extracted}
      options={config}
      onOptionsChange={onConfigChange}
    />
  );
}
