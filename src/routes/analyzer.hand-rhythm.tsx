import { createFileRoute } from '@tanstack/react-router';
import { HAND_RHYTHM_PANE_META } from '#analyzers/hand-rhythm/pane-meta.ts';
import { handRhythmAnalyzer } from '#analyzers/hand-rhythm/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * 左右の手の交互の単体ページのroute。pathは `/analyzer/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/analyzer/hand-rhythm')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${HAND_RHYTHM_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、手の切り替えと同じ手の続き、交互打鍵の連続の数と長さを見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={handRhythmAnalyzer} />,
});
