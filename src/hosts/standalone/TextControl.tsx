import { useEffect, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import {
  createTextCommand,
  deleteTextCommand,
  duplicateTextCommand,
  renameTextCommand,
  selectTextCommand,
  setTextLanguageOverrideCommand,
  type KeydistAssets,
  type TextSelectionHolder,
} from '#engine/commands.ts';
import { BUILTIN_TEXTS } from '#input/text/builtin.ts';
import type { TextIdGenerator, TextLibrary } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { TextLanguage } from '#input/text/language.ts';
import type { TextRef, TextSelectionState } from '#input/text/selection.ts';
import './standalone.css';

/**
 * テキストの選択・編集を行う共通部品（#544 Phase 3「テキストの資産化」指示書
 * 「extracting it into one shared component in src/hosts/standalone/」）。
 *
 * Bigram Flow・比較表・N感度の3ページが同じ形の操作（選ぶ・打つ・複製・名前を変える・
 * 消す）を要るため、ここへ1本化する。**このシェイプは仮のもの**: 次の作業単位
 * （#544 シェルUI）で文脈バーへ移す前提で、レイアウトは磨き込まない
 * （`docs/architecture.md`「画面の構成」参照）。
 *
 * `assets.textLibrary` / 持ち主の選択を読み、`dispatch`経由でコマンドだけを発行する
 * （`BigramFlowStandalonePage`が直接持っていた配線をそのまま抽出した形。#544 §8-2
 * 「書き込みはすべてコマンドを通す」）。`holder`は`engine/commands.ts`の
 * `TextSelectionHolder`をそのまま受け取る（レビュー指摘: 呼び出し元が「単体ページ用の
 * 選択」であることを明示するため。今のところ`'standalone'`しか実装が無い）。
 */
export interface TextControlProps {
  readonly holder: TextSelectionHolder;
  readonly textLibrary: TextLibrary;
  readonly selection: TextSelectionState;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly generateTextId: TextIdGenerator;
  /**
   * 本文の変更をdebounceしてから資産へ反映する（`app/standalone/use-debounced-commit.ts`の
   * `useDebouncedCommit`を呼び出し元＝`app`が組み立てて渡す。`hosts`は`platform`を
   * importできないため、debounceの仕組み自体はここへ持てない。`onBigramFlowOptionsCommit`
   * と同じ配線）。
   *
   * 値は`{ ref, text }`のペアで渡す（レビュー指摘: 打鍵の瞬間にどのテキストへ向けた
   * 変更かを`ref`としてキャプチャしておく。debounce完了時に「今の選択」を読み直すと、
   * 待っている間に選択が切り替わった時に別のテキストへ書き込んでしまう事故になる。
   * `engine/commands.ts`の`setTextContentCommand`コメント参照）。
   */
  readonly onTextContentCommit: (value: { readonly ref: TextRef; readonly text: string }) => void;
}

function refKey(ref: TextSelectionState['ref']): string {
  return `${ref.kind}:${ref.id}`;
}

/** 言語判定の選択肢（#544レビュー: en/ja以外を扱う予定が無いのでトグルで足りていたが、
 * 「今どちらか」を見せつつ選ばせるにはselectの方が素直、という指摘を反映）。 */
const LANGUAGE_OVERRIDE_OPTIONS: readonly { readonly value: 'auto' | TextLanguage; readonly label: string }[] = [
  { value: 'auto', label: '自動' },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: '英語' },
];

export function TextControl({
  holder,
  textLibrary,
  selection,
  dispatch,
  generateTextId,
  onTextContentCommit,
}: TextControlProps) {
  const resolved = resolveTextSelection(selection, textLibrary);

  // テキストは即座に見た目へ反映しつつ（controlled textarea）、資産への反映は
  // `onTextContentCommit`（呼び出し元がdebounceする）経由にする。`optionsDraft`と同じ形
  // （`BigramFlowStandalonePage`の`onBigramFlowOptionsCommit`参照）。
  const [textDraft, setTextDraft] = useState(resolved.text);
  useEffect(() => {
    setTextDraft(resolved.text);
    // resolved.textは`resolveTextSelection`が呼ぶたびに新しく作る値なので、
    // 依存は参照ではなく実際の文字列にする。
  }, [resolved.text]);

  const [renameDraft, setRenameDraft] = useState(resolved.name);
  useEffect(() => {
    setRenameDraft(resolved.name);
  }, [resolved.name]);

  return (
    <div className="standalone-controls" aria-label="テキストの操作">
      <label className="standalone-control">
        <span>テキストを選ぶ</span>
        <select
          value={refKey(resolved.ref)}
          onChange={(event) => {
            // idそのものに`:`を含む（組み込みidは`builtin:ja.legacy`の形。`builtin.ts`参照）ので、
            // `split(':', 2)`で末尾を切り捨てないよう、最初の`:`だけで前後に分ける。
            const value = event.currentTarget.value;
            const separatorIndex = value.indexOf(':');
            const kind = value.slice(0, separatorIndex) as 'builtin' | 'user';
            const id = value.slice(separatorIndex + 1);
            dispatch(selectTextCommand(holder, { kind, id }));
          }}
          aria-label="テキストを選ぶ"
        >
          <optgroup label="組み込み">
            {BUILTIN_TEXTS.map((builtin) => (
              <option key={builtin.id} value={refKey({ kind: 'builtin', id: builtin.id })}>
                {builtin.name}
              </option>
            ))}
          </optgroup>
          {textLibrary.texts.length > 0 ? (
            <optgroup label="自作">
              {textLibrary.texts.map((text) => (
                <option key={text.id} value={refKey({ kind: 'user', id: text.id })}>
                  {text.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      <label className="standalone-control standalone-text-control">
        <span>本文</span>
        <textarea
          value={textDraft}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setTextDraft(text);
            // 打鍵の瞬間の対象（resolved.ref）をそのまま運ぶ。この後選択が切り替わっても
            // このdraftの宛先は変わらない（TextControlProps.onTextContentCommitコメント参照）。
            onTextContentCommit({ ref: resolved.ref, text });
          }}
          rows={3}
          aria-label="テキスト"
        />
        <small>
          言語判定: {resolved.language}
          {' '}
          <select
            value={resolved.languageOverride ?? 'auto'}
            onChange={(event) => {
              const value = event.currentTarget.value;
              dispatch(setTextLanguageOverrideCommand(holder, value === 'auto' ? undefined : value as TextLanguage));
            }}
            disabled={resolved.isBuiltin}
            aria-label="言語判定"
          >
            {LANGUAGE_OVERRIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </small>
      </label>

      <div className="standalone-control">
        <span>名前</span>
        <input
          type="text"
          value={renameDraft}
          onChange={(event) => setRenameDraft(event.currentTarget.value)}
          onBlur={() => {
            if (!resolved.isBuiltin && renameDraft !== resolved.name && renameDraft.trim() !== '') {
              dispatch(renameTextCommand(resolved.ref.id, renameDraft));
            }
          }}
          disabled={resolved.isBuiltin}
          aria-label="テキストの名前"
        />
      </div>

      <div className="standalone-control">
        <span>操作</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={() => dispatch(createTextCommand(holder, generateTextId))}>新規作成</button>
          <button type="button" onClick={() => dispatch(duplicateTextCommand(holder, generateTextId))}>複製</button>
          <button
            type="button"
            onClick={() => {
              // シェルUnit（#544次段）がUndo UIを文脈バーに置くまでの暫定策。
              // 削除は即時破壊操作でUndoの導線が今は無いため、確認を挟む。
              if (!window.confirm(`「${resolved.name}」を削除する？`)) return;
              dispatch(deleteTextCommand(holder, resolved.ref.id));
            }}
            disabled={resolved.isBuiltin}
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
