import { createFileRoute } from '@tanstack/react-router';
import { TesterApp } from '#app/tester/TesterApp.tsx';

export const Route = createFileRoute('/input')({
  // 開いた時に選ぶ配列のid（紹介ページなどからのリンクが渡す）。読んだ後はURLから外す
  validateSearch: (search: Record<string, unknown>): { layout?: string } =>
    typeof search.layout === 'string' && search.layout !== '' ? { layout: search.layout } : {},
  head: () => ({
    meta: [
      { title: 'Tester | keydist' },
      {
        name: 'description',
        content: '配列を選び、手元のキーボードで実際に打って、何の文字が出るかを試せるページ',
      },
    ],
  }),
  component: TesterApp,
});
