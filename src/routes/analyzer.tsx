import { createFileRoute } from '@tanstack/react-router';
import { AnalyzerPage } from '#legacy/analyzer-page.tsx';
import analyzerCss from '#legacy/style.css?url';

export const Route = createFileRoute('/analyzer')({
  component: AnalyzerPage,
  head: () => ({
    meta: [
      { title: 'keydist — キーボード配列指移動距離' },
      {
        name: 'description',
        content: 'キーボード論理配列を指の総移動距離で評価する',
      },
    ],
    links: [{ rel: 'stylesheet', href: analyzerCss }],
  }),
});
