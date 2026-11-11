import { createFileRoute } from '@tanstack/react-router';
import { ComboSetApp } from '#app/combo-set/ComboSetApp.tsx';
import { COMBO_SET_LABEL } from '#editors/combo-set/label.ts';

export const Route = createFileRoute('/combo-set')({
  head: () => ({
    meta: [
      { title: `${COMBO_SET_LABEL} | keydist` },
      {
        name: 'description',
        content: '自作のコンボをコンボの組として作ります。',
      },
    ],
  }),
  component: ComboSetApp,
});
