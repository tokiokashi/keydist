/**
 * 単体ページ全体で共有する「今使っているテキストの選択」（`TextSelectionState`、
 * `#input/text/selection.ts`）の保存先キー。
 *
 * 本文は`TEXT_LIBRARY_STORAGE_KEY`のユーザーテキストの手持ちが持ち、ここは「どれを
 * 選んでいるか」という参照だけを持つ（`standaloneAnalyzerOptions`と同じ、単体ページ固有の
 * 選択という扱い。`engine/commands.ts`の`KeydistAssets`コメント参照）。
 */
export const STANDALONE_TEXT_SELECTION_STORAGE_KEY = 'keydist:standalone-text-selection';
