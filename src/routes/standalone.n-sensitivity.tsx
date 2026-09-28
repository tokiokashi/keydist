import { createFileRoute } from '@tanstack/react-router';
import { StandaloneNSensitivityApp } from '#app/standalone/StandaloneNSensitivityApp.tsx';

/**
 * N感度単体ページのroute（#544 Phase 3）。`standalone.comparison.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/standalone/n-sensitivity')({
  head: () => ({
    meta: [
      { title: 'N感度 | keydist' },
      {
        name: 'description',
        content: '配列やSetupを選んで、先読みする打鍵数Nを0〜10に変えた時に指の総移動距離がどう変わるかをグラフで比べる。',
      },
    ],
  }),
  component: StandaloneNSensitivityApp,
});
