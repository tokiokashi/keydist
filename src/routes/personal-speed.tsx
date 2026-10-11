import { createFileRoute } from '@tanstack/react-router';
import { PersonalSpeedApp } from '#app/personal-speed/PersonalSpeedApp.tsx';
import { PERSONAL_SPEED_LABEL } from '#editors/personal-speed/label.ts';

export const Route = createFileRoute('/personal-speed')({
  head: () => ({
    meta: [
      { title: `${PERSONAL_SPEED_LABEL} | keydist` },
      {
        name: 'description',
        content: '打鍵と指の移動の速さを測って保存します。保存した値は、数値を直接書き換えたり、項目ごとに測り直したり、全て破棄したりできます。',
      },
    ],
  }),
  component: PersonalSpeedApp,
});
