import { createFileRoute } from '@tanstack/react-router';
import { BUNSETSU_STATS_PANE_META } from '#analyzers/bunsetsu-stats/pane-meta.ts';
import { bunsetsuStatsAnalyzer } from '#analyzers/bunsetsu-stats/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * 文節の中と境目の統計の単体ページのroute。`analyzer.run-chart.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/bunsetsu-stats')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${BUNSETSU_STATS_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '日本語のテキストを文節に区切り、文節の1文字目と2文字目以降に分けて、指の移動距離の平均やばらつきを配列やSetupごとに表で並べます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={bunsetsuStatsAnalyzer} />,
});
