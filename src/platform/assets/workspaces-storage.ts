/**
 * 保存したWorkspaceの手持ち（`WorkspaceLibrary`、`#engine/workspace.ts`）の保存先キー。
 *
 * codec自体（`WORKSPACE_LIBRARY_CODEC`）は`engine/workspace-codec.ts`にあり、`platform`から
 * 直接importできない（`platform`は`input`までしかimportできない。`docs/architecture.md`の依存規則）ため、
 * 他の資産と同じくキーの定数だけをここに持つ（実際の読み書きの組み立ては`app`が担う。
 * `app/standalone/asset-storage-specs.ts`参照）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const WORKSPACES_STORAGE_KEY = 'keydist:workspaces';
