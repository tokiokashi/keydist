import { createFileRoute } from '@tanstack/react-router';
import { KanaLayoutApp } from '#app/kana-layout/KanaLayoutApp.tsx';
import { KANA_LAYOUT_LABEL } from '#editors/kana-layout/label.ts';

export const Route = createFileRoute('/kana-layout')({
  head: () => ({
    meta: [
      { title: `${KANA_LAYOUT_LABEL} | keydist` },
      {
        name: 'description',
        content: '面ごとに、切り替えのキーと打鍵の順序、キーごとの出力を決めて、かな配列を自作します。作った配列は、Analyzerの対象に選べます。',
      },
    ],
  }),
  component: KanaLayoutApp,
});
