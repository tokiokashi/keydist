/**
 * 単体ページ全体で共有する「最後に使ったテキスト」（`StandaloneTextState`、
 * `#input/text/standalone-text.ts`）の保存先キー（#544 Phase 3「単体ページ」）。
 *
 * codec自体（`STANDALONE_TEXT_CODEC`）は`input/text/standalone-text-codec.ts`にあり、
 * `platform`から直接importしてよい（`docs/architecture.md`の依存規則で`platform`は
 * `input`をimportできる）。`SETUP_LIBRARY_STORAGE_KEY`（engineの型を要するため
 * codecをここに置けない）と違い、ここはキーと一緒にcodecを再exportしてもよいところだが、
 * 既存資産と形を揃えるため、このファイルはキーの定数だけを持つ（実際の読み書きの組み立ては
 * `app`が担う。#544 Phase 2「storageを直接触るのはplatformとappだけ」）。
 *
 * 既存の資産キー（`keydist:setup-library` 等）と衝突しない名前にする。
 */
export const STANDALONE_TEXT_STORAGE_KEY = 'keydist:standalone-text';
