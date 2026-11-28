import { createFileRoute } from '@tanstack/react-router';
import { NGRAM_TABLE_PANE_META } from '#analyzers/ngram-table/pane-meta.ts';
import { ngramTableAnalyzer } from '#analyzers/ngram-table/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * 文節の表による解析の単体ページのroute。`analyzer.box-plot.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/ngram-table')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${NGRAM_TABLE_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを選んで、標準のコーパスの文節の読みの並びを打った時の移動距離を、出現回数で重み付けして出します。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={ngramTableAnalyzer} />,
});
