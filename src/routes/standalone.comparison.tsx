import { createFileRoute } from '@tanstack/react-router';
import { StandaloneComparisonApp } from '#app/standalone/StandaloneComparisonApp.tsx';

/**
 * 比較表単体ページのroute（#544 Phase 3）。`standalone.bigram-flow.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/standalone/comparison')({
  head: () => ({
    meta: [
      { title: 'Comparison (standalone) | keydist' },
      {
        name: 'description',
        content: '複数の対象（配列またはSetup）を選んで、比較表を単体ページとして開く（#544 Analyzer再設計 Phase 3）。',
      },
    ],
  }),
  component: StandaloneComparisonApp,
});
