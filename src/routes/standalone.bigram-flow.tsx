import { createFileRoute } from '@tanstack/react-router';
import { BIGRAM_FLOW_PANE_META } from '#analyzers/bigram-flow/pane-meta.ts';
import { StandaloneBigramFlowApp } from '#app/standalone/StandaloneBigramFlowApp.tsx';

/**
 * Bigram Flow単体ページのroute。
 *
 * path案: `/standalone/bigram-flow`。既存の legacy Analyzer（`/analyzer` `/analyzer/flow`。
 * `src/routes/analyzer.tsx` `analyzer_.flow.tsx`）とは別の名前空間にして衝突を避ける。
 * `/standalone/` を接頭に置くのは、`docs/architecture.md`の用語（単体ページ = standalone
 * page）とディレクトリ構成（`hosts/standalone/`）にpathを揃えるため。将来Workspaceの
 * pathを足す時は同じ発想で `/workspace/...` を使う想定。
 *
 * route自体は`createFileRoute`だけの薄いファイルにする（AGENTS.md
 * 「route自体は createFileRoute だけの薄いものにする」）。実体は`app`が組み立てる
 * （`hosts/standalone`はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/bigram-flow')({
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
  component: StandaloneBigramFlowApp,
});
