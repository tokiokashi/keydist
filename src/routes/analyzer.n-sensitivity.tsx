import { createFileRoute } from '@tanstack/react-router';
import { N_SENSITIVITY_PANE_META } from '#analyzers/n-sensitivity/pane-meta.ts';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * N感度単体ページのroute。`analyzer.comparison.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/n-sensitivity')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${N_SENSITIVITY_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで、先読みする文字数Nを0〜10に変えた時に指の総移動距離がどう変わるかをグラフで比べます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={nSensitivityAnalyzer} />,
});
