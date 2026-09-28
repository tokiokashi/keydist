import { createFileRoute } from '@tanstack/react-router';
import { StandaloneNSensitivityApp } from '#app/standalone/StandaloneNSensitivityApp.tsx';

/**
 * N感度単体ページのroute（#544 Phase 3）。`standalone.comparison.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/standalone/n-sensitivity')({
  head: () => ({
    meta: [
      { title: 'N Sensitivity (standalone) | keydist' },
      {
        name: 'description',
        content: '複数Setupを対象に、N感度（先読みN入力を振った時の総移動距離の変化）を単体ページとして開く（#544 Analyzer再設計 Phase 3）。',
      },
    ],
  }),
  component: StandaloneNSensitivityApp,
});
