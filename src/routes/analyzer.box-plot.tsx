import { createFileRoute } from '@tanstack/react-router';
import { BOX_PLOT_PANE_META } from '#analyzers/box-plot/pane-meta.ts';
import { boxPlotAnalyzer } from '#analyzers/box-plot/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * 箱ひげ図の単体ページのroute。`analyzer.band-chart.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/box-plot')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${BOX_PLOT_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで、テキストを文節に区切った時の文節ごとの1かな換算の移動距離の分布を、配列ごとの箱ひげ図で並べます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={boxPlotAnalyzer} />,
});
