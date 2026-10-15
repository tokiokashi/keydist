import { createFileRoute } from '@tanstack/react-router';
import { SetupApp } from '#app/setup/SetupApp.tsx';
import { SETUP_LABEL } from '#app/setup/label.ts';

export const Route = createFileRoute('/setup')({
  // 開くSetupのid（条件のモーダルのリンクが渡す）。手持ちに無いidは先頭のSetupを開く
  validateSearch: (search: Record<string, unknown>): { setup?: string } =>
    typeof search['setup'] === 'string' && search['setup'] !== '' ? { setup: search['setup'] } : {},
  head: () => ({
    meta: [
      { title: `${SETUP_LABEL} | keydist` },
      {
        name: 'description',
        content: '配列と物理配列の組に、その組だけの条件を足したSetupを作ります。名前の変更、物理配列の付け替え、条件の変更ができます。作ったSetupはAnalyzerの対象から選べます。',
      },
    ],
  }),
  component: SetupApp,
});
