import { createFileRoute } from '@tanstack/react-router';
import { HEATMAP_INTEGRATED_PANE_META } from '#analyzers/heatmap-integrated/pane-meta.ts';
import { heatmapIntegratedAnalyzer } from '#analyzers/heatmap-integrated/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * 統合ヒートマップの単体ページのroute。pathは `/standalone/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/heatmap-integrated')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${HEATMAP_INTEGRATED_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、キーごとの押下数を、全部のレイヤーを合わせた配列図で見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={heatmapIntegratedAnalyzer} />,
});
