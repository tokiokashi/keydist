import { createFileRoute } from '@tanstack/react-router';
import { RecordApp } from '#app/record/RecordApp.tsx';
import { RECORD_PAGE_DESCRIPTION, RECORD_PAGE_NAME } from '#app/record/record-text.ts';

export const Route = createFileRoute('/record')({
  head: () => ({
    meta: [{ title: `${RECORD_PAGE_NAME} | keydist` }, { name: 'description', content: RECORD_PAGE_DESCRIPTION }],
  }),
  component: RecordApp,
});
