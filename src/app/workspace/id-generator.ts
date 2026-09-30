import type { WorkspaceIdGenerator } from '#engine/workspace.ts';

/**
 * WorkspaceとWorkspaceのペインの新規id発行。純粋層である`engine`は`crypto.randomUUID`のような
 * ブラウザ/Node APIを直接使わないため、`app`が注入する（`app/standalone/id-generator.ts`と同じ理由）。
 */
export const generatePaneId: WorkspaceIdGenerator = () => crypto.randomUUID();

export const generateWorkspaceId: WorkspaceIdGenerator = () => crypto.randomUUID();
