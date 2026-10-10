import { createFileRoute } from '@tanstack/react-router';
import { HEATMAP_LAYERS_PANE_META } from '#analyzers/heatmap-layers/pane-meta.ts';
import { heatmapLayersAnalyzer } from '#analyzers/heatmap-layers/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * レイヤー別ヒートマップの単体ページのroute。pathは `/standalone/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/heatmap-layers')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${HEATMAP_LAYERS_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、キーごとの押下数を、レイヤーごとの配列図で見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={heatmapLayersAnalyzer} />,
});
