import { createFileRoute } from '@tanstack/react-router';
import { FINGER_DISTANCE_PANE_META } from '#analyzers/finger-distance/pane-meta.ts';
import { StandaloneFingerDistanceApp } from '#app/standalone/StandaloneFingerDistanceApp.tsx';

/**
 * 指ごとの距離の単体ページのroute。pathは `/standalone/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/finger-distance')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${FINGER_DISTANCE_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、指ごとの移動距離と押下数、隣り合う指の間隔のばらつきを見ます。',
      },
    ],
  }),
  component: StandaloneFingerDistanceApp,
});
