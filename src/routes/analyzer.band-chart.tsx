import { createFileRoute } from '@tanstack/react-router';
import { BAND_CHART_PANE_META } from '#analyzers/band-chart/pane-meta.ts';
import { bandChartAnalyzer } from '#analyzers/band-chart/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * 帯グラフの単体ページのroute。`analyzer.scatter.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/band-chart')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${BAND_CHART_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで、1かなごとの移動距離を1キー分の距離に丸めた区分に分け、区分ごとの割合を配列ごとの1本の帯で並べます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={bandChartAnalyzer} />,
});
