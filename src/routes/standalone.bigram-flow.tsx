import { createFileRoute } from '@tanstack/react-router';
import { StandaloneBigramFlowApp } from '#app/standalone/StandaloneBigramFlowApp.tsx';

/**
 * Bigram Flow単体ページのroute（#544 Phase 3「最初の縦切り」）。
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
  head: () => ({
    meta: [
      { title: 'Bigram Flow (standalone) | keydist' },
      {
        name: 'description',
        content: 'Setup 1つを対象に、Bigram Flowを単体ページとして開く（#544 Analyzer再設計）。',
      },
    ],
  }),
  component: StandaloneBigramFlowApp,
});
