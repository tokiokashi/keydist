/**
 * 単体ページ全体で共有する「今使っているテキストの選択」（`TextSelectionState`、
 * `#input/text/selection.ts`）の保存先キー。
 *
 * 旧`keydist:standalone-text`（テキスト本文そのものを1件だけ保存していた資産）を置き換える。
 * 本文は`TEXT_LIBRARY_STORAGE_KEY`のユーザーテキストの手持ちへ移り、ここは「どれを
 * 選んでいるか」という参照だけを持つ（`standaloneAnalyzerOptions`と同じ、単体ページ固有の
 * 選択という扱い。`engine/commands.ts`の`KeydistAssets`コメント参照）。
 */
export const STANDALONE_TEXT_SELECTION_STORAGE_KEY = 'keydist:standalone-text-selection';
