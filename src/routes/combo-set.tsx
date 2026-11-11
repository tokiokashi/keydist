import { createFileRoute } from '@tanstack/react-router';
import { ComboSetApp } from '#app/combo-set/ComboSetApp.tsx';
import { COMBO_SET_LABEL } from '#editors/combo-set/label.ts';

export const Route = createFileRoute('/combo-set')({
  head: () => ({
    meta: [
      { title: `${COMBO_SET_LABEL} | keydist` },
      {
        name: 'description',
        content:
          '押すキーを英字の文字で、出力をかなで入力して、自作のコンボを作ります。出力は選んだローマ字の綴りで展開して保存します。作った組はSetupで選べます。',
      },
    ],
  }),
  component: ComboSetApp,
});
