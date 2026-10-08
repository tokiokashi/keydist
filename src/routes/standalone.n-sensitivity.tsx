import { createFileRoute } from '@tanstack/react-router';
import { N_SENSITIVITY_PANE_META } from '#analyzers/n-sensitivity/pane-meta.ts';
import { StandaloneNSensitivityApp } from '#app/standalone/StandaloneNSensitivityApp.tsx';

/**
 * N感度単体ページのroute。`standalone.comparison.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/standalone/n-sensitivity')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${N_SENSITIVITY_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで、先読みする打鍵数Nを0〜10に変えた時に指の総移動距離がどう変わるかをグラフで比べます。',
      },
    ],
  }),
  component: StandaloneNSensitivityApp,
});
