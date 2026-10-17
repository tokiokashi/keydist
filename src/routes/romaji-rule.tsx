import { createFileRoute } from '@tanstack/react-router';
import { RomajiRuleApp } from '#app/romaji-rule/RomajiRuleApp.tsx';
import { ROMAJI_RULE_LABEL } from '#editors/romaji-rule/label.ts';

export const Route = createFileRoute('/romaji-rule')({
  head: () => ({
    meta: [
      { title: `${ROMAJI_RULE_LABEL} | keydist` },
      {
        name: 'description',
        content:
          '基底のルールに差分を足して、自作のローマ字の綴りを作ります。綴りが割れるかなを一覧で見比べながら決められます。作った綴りは条件から選べます。',
      },
    ],
  }),
  component: RomajiRuleApp,
});
