/**
 * ユーザーテキストの手持ち（`TextLibrary`、`#input/text/library.ts`）の保存先キー
 * （#544 Phase 3「テキストの資産化」）。`SETUP_LIBRARY_STORAGE_KEY`と同じくキーの定数だけを
 * 持つ（codecは`input/text/library-codec.ts`にあり、`platform`から直接importしてよい。
 * `docs/architecture.md`の依存規則で`platform`は`input`をimportできる）。
 *
 * 器（単体ページ / 将来のWorkspace）をまたいで共有する資産なので、器ごとの選択
 * （`standalone-text-selection-storage.ts`）とは別のキーにする。
 *
 * 既存の資産キー（`keydist:setup-library`等）と衝突しない名前にする。旧`keydist:standalone-text`
 * は#544で廃止した（`AGENTS.md`「利用者の保存データの互換は守らない」。移行処理は無い）。
 */
export const TEXT_LIBRARY_STORAGE_KEY = 'keydist:text-library';
