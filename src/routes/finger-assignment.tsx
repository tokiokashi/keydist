import { createFileRoute } from '@tanstack/react-router';
import { FingerAssignmentApp } from '#app/finger-assignment/FingerAssignmentApp.tsx';
import { FINGER_ASSIGNMENT_LABEL } from '#editors/finger-assignment/label.ts';

export const Route = createFileRoute('/finger-assignment')({
  head: () => ({
    meta: [
      { title: `${FINGER_ASSIGNMENT_LABEL} | keydist` },
      {
        name: 'description',
        content:
          '物理配列の上で、各キーを担当する指を決めます。列ごとの割り当て、キーごとの割り当て、既定へ戻す操作があります。作った割り当ては条件から選べます。',
      },
    ],
  }),
  component: FingerAssignmentApp,
});
