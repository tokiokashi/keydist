import { createFileRoute } from '@tanstack/react-router';
import { UserAssetsApp } from '#app/assets/UserAssetsApp.tsx';
import { USER_ASSETS_LABEL } from '#app/assets/UserAssetsPage.tsx';

export const Route = createFileRoute('/assets')({
  head: () => ({
    meta: [
      { title: `${USER_ASSETS_LABEL} | keydist` },
      {
        name: 'description',
        content: '自作した配列とローマ字規則の一覧。不要なものを削除でき、削除は元に戻せます。',
      },
    ],
  }),
  component: UserAssetsApp,
});
