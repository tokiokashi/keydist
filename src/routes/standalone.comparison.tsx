import { createFileRoute } from '@tanstack/react-router';
import { COMPARISON_PANE_META } from '#analyzers/comparison/pane-meta.ts';
import { StandaloneComparisonApp } from '#app/standalone/StandaloneComparisonApp.tsx';

/**
 * 比較表単体ページのroute。`standalone.bigram-flow.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/standalone/comparison')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${COMPARISON_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで並べ、同じテキストを打った時の指の移動距離などを表で比べる。',
      },
    ],
  }),
  component: StandaloneComparisonApp,
});
