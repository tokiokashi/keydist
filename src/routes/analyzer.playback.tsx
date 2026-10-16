import { createFileRoute } from '@tanstack/react-router';
import { PLAYBACK_PANE_META } from '#analyzers/playback/pane-meta.ts';
import { playbackAnalyzer } from '#analyzers/playback/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * 打鍵再生の単体ページのroute。pathは `/analyzer/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/analyzer/playback')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${PLAYBACK_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、同じテキストを打つ様子を配列図の上で1打鍵ずつ再生します。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={playbackAnalyzer} />,
});
