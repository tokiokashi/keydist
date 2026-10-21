import { createFileRoute } from '@tanstack/react-router';
import { RUN_CHART_PANE_META } from '#analyzers/run-chart/pane-meta.ts';
import { runChartAnalyzer } from '#analyzers/run-chart/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * Run Chartの単体ページのroute。`analyzer.n-sensitivity.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/run-chart')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${RUN_CHART_PANE_META.name} | keydist` },
      {
        name: 'description',
        content:
          '配列やSetupを選んで、テキスト上の位置ごとに指の移動距離や同指率がどう推移するかを折れ線で重ねて比べます。図を押すと、その位置から打鍵再生へ移れます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={runChartAnalyzer} />,
});
