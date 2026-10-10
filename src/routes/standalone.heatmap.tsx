import { createFileRoute } from '@tanstack/react-router';
import { HEATMAP_PANE_META } from '#analyzers/heatmap/pane-meta.ts';
import { heatmapAnalyzer } from '#analyzers/heatmap/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * ヒートマップの単体ページのroute。pathは `/standalone/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/heatmap')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${HEATMAP_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、キーごとの押下数を、全部のレイヤーを合わせた配列図で見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={heatmapAnalyzer} />,
});
