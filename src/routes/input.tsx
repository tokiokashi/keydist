import { createFileRoute } from '@tanstack/react-router';
import { InputConverterView } from '#tester/input-converter-view.tsx';

export const Route = createFileRoute('/input')({
  head: () => ({
    meta: [
      { title: 'Tester | keydist' },
      {
        name: 'description',
        content: '配列を選び、手元のキーボードで実際に打って、何の文字が出るかを試せるページ',
      },
    ],
  }),
  component: InputConverterView,
});
