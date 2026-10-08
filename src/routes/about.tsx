import { createFileRoute } from '@tanstack/react-router';
import { AboutPage, ABOUT_LABEL } from '#app/about/AboutPage.tsx';

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: `${ABOUT_LABEL} | keydist` },
      {
        name: 'description',
        content: '指の移動距離をどう数えているかと、数値に入っていないこと。仕様書へのリンクもあります。',
      },
    ],
  }),
  component: AboutPage,
});
