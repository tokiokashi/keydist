import { createFileRoute } from '@tanstack/react-router';
import { UserAssetsApp } from '#app/assets/UserAssetsApp.tsx';
import { USER_ASSETS_LABEL } from '#app/assets/UserAssetsPage.tsx';

export const Route = createFileRoute('/assets')({
  head: () => ({
    meta: [
      { title: `${USER_ASSETS_LABEL} | keydist` },
      {
        name: 'description',
        content: '自作した配列・ローマ字規則・指の割り当ての一覧。不要なものを削除でき、ファイルへの書き出しと読み込みもできます。削除と読み込みは元に戻せます。',
      },
    ],
  }),
  component: UserAssetsApp,
});
