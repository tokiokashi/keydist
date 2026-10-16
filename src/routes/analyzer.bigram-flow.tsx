import { createFileRoute } from '@tanstack/react-router';
import { BIGRAM_FLOW_PANE_META } from '#analyzers/bigram-flow/pane-meta.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * Bigram Flow単体ページのroute。
 *
 * pathは `/analyzer/<Analyzerのid>` で、他の単体ページと揃える。
 *
 * route自体は`createFileRoute`だけの薄いファイルにする（AGENTS.md
 * 「route自体は createFileRoute だけの薄いものにする」）。実体は`app`が組み立てる
 * （`hosts/standalone`はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/analyzer/bigram-flow')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${BIGRAM_FLOW_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、続けて打つ2打鍵で指がキーボード上をどう動くかを図で見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={bigramFlowAnalyzer} />,
});
