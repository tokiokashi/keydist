import { arrayItemScope, recordItemScope, type ItemScopes } from '#input/commands/index.ts';
import type { KeydistAssets } from './commands.ts';
import type { StandaloneAnalyzerOptionsState } from './standalone-analyzer-options.ts';
import type { Workspace } from './workspace.ts';

/**
 * 元に戻す・やり直すで、件ごとに照らし合わせる資産。画面がidごとに分かれていて、別の画面が同じ資産の
 * 別の件を書き換えるのが普通の使い方なため（例: Workspace Aを変えた後にWorkspace Bを変えても、Aの変更は戻せる）。
 *
 * - `standaloneAnalyzerOptions`: Analyzerのidごとの解析設定。件の有無が他の件に影響しないので、
 *   初めて書いた件（キーが増える変更）も件ごとに戻す
 * - `workspaces`: Workspaceの一覧。中身だけを変えた項目に限る。追加・削除・並べ替えは
 *   削除した件を戻す位置や、名前の重なりが決まらないので、一覧の参照が丸ごと同じかで照らし合わせる
 *
 * これ以外の資産は件ごとにしない。1件だけを戻すと、Setupの番号や自動で付けた名前が別の画面で付けた件と
 * 重なるなど、どのコマンドも作らない状態ができうるため。
 */
export const KEYDIST_ITEM_SCOPES: ItemScopes<KeydistAssets> = {
  standaloneAnalyzerOptions: recordItemScope<StandaloneAnalyzerOptionsState>(),
  workspaces: arrayItemScope<Workspace>((workspace) => workspace.id),
};
