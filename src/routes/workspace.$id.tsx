import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceApp } from '#app/workspace/WorkspaceApp.tsx';

/**
 * 保存したWorkspaceのroute（`/workspace/<id>`）。URLは識別子だけで、Workspaceの中身は
 * 保存先（このブラウザの資産）が持つ（docs/architecture.md「条件の編集とURL」）。
 * route自体は`createFileRoute`だけの薄いファイルにする。
 *
 * Workspaceの中身はこのブラウザの保存先にしか無いので、サーバー側では描かず、ブラウザで描く（`ssr: false`）。
 *
 * `tabs`は、タブの表現（Workspaceのペインの見出しとタブの関係）を見比べるための切り替えで、
 * `?tabs=hide`でタブの帯を出さない。省略時はタブを出す。画面には出さない。
 */
export const Route = createFileRoute('/workspace/$id')({
  staticData: { contextBar: true },
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { readonly tabs?: 'hide' } => (
    search.tabs === 'hide' ? { tabs: 'hide' } : {}
  ),
  head: () => ({
    meta: [
      { title: 'Workspace | keydist' },
      {
        name: 'description',
        content: 'Analyzerを並べて、同じテキストでの配列の違いを一度に見る。',
      },
    ],
  }),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { id } = Route.useParams();
  const { tabs } = Route.useSearch();
  return <WorkspaceApp key={id} workspaceId={id} tabs={tabs === 'hide' ? 'hide' : 'show'} />;
}
