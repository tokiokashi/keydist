import { createFileRoute } from '@tanstack/react-router';
import { RomajiLayoutApp } from '#app/romaji-layout/RomajiLayoutApp.tsx';
import { ROMAJI_LAYOUT_LABEL } from '#editors/romaji-layout/label.ts';

export const Route = createFileRoute('/romaji-layout')({
  head: () => ({
    meta: [
      { title: `${ROMAJI_LAYOUT_LABEL} | keydist` },
      {
        name: 'description',
        content: '名前と4段の文字、ホームキー、推奨のローマ字規則を入力して、ローマ字配列を自作します。作った配列は、Analyzerの対象に選べます。',
      },
    ],
  }),
  component: RomajiLayoutApp,
});
