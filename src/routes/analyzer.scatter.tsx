import { createFileRoute } from '@tanstack/react-router';
import { SCATTER_PANE_META } from '#analyzers/scatter/pane-meta.ts';
import { scatterAnalyzer } from '#analyzers/scatter/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * 散布図の単体ページのroute。`analyzer.comparison.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/scatter')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${SCATTER_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで、2つの数値の関係を配列ごとの点で描きます。1かな換算のアクション数と1アクションの移動距離などの図を選べます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={scatterAnalyzer} />,
});
