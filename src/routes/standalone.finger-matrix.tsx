import { createFileRoute } from '@tanstack/react-router';
import { FINGER_MATRIX_PANE_META } from '#analyzers/finger-matrix/pane-meta.ts';
import { fingerMatrixAnalyzer } from '#analyzers/finger-matrix/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * 指ごとの比較の単体ページのroute。`standalone.comparison.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/standalone/finger-matrix')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${FINGER_MATRIX_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで並べ、指ごとの押下数・移動距離・同指連続などの値を表で比べます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={fingerMatrixAnalyzer} />,
});
