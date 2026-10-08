import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceApp } from '#app/workspace/WorkspaceApp.tsx';

/**
 * 保存したWorkspaceのroute（`/workspace/<id>`）。URLは識別子だけで、Workspaceの中身は
 * 保存先（このブラウザの資産）が持つ（docs/architecture.md「条件の編集とURL」）。
 * route自体は`createFileRoute`だけの薄いファイルにする。
 *
 * Workspaceの中身はこのブラウザの保存先にしか無いので、サーバー側では描かず、ブラウザで描く（`ssr: false`）。

 */
export const Route = createFileRoute('/workspace/$id')({
  staticData: { contextBar: true },
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Workspace | keydist' },
      {
        name: 'description',
        content: 'Analyzerを並べて、同じテキストでの配列の違いを一度に見ます。',
      },
    ],
  }),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { id } = Route.useParams();
  return <WorkspaceApp key={id} workspaceId={id} />;
}
