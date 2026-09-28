import { useEffect, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import {
  createTextCommand,
  deleteTextCommand,
  duplicateCurrentTextCommand,
  renameTextCommand,
  selectTextCommand,
  setCurrentTextContentCommand,
  setCurrentTextLanguageOverrideCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import { BUILTIN_TEXTS } from '#input/text/builtin.ts';
import type { TextIdGenerator, TextLibrary } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { TextSelectionState } from '#input/text/selection.ts';
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
 * `assets.textLibrary` / `assets.standaloneTextSelection` を読み、`dispatch`経由で
 * コマンドだけを発行する（`BigramFlowStandalonePage`が直接持っていた配線をそのまま
 * 抽出した形。#544 §8-2「書き込みはすべてコマンドを通す」）。
 */
export interface TextControlProps {
  readonly textLibrary: TextLibrary;
  readonly selection: TextSelectionState;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly generateTextId: TextIdGenerator;
}

const TEXT_COMMIT_DEBOUNCE_MS = 400;

function refKey(ref: TextSelectionState['ref']): string {
  return `${ref.kind}:${ref.id}`;
}

export function TextControl({ textLibrary, selection, dispatch, generateTextId }: TextControlProps) {
  const resolved = resolveTextSelection(selection, textLibrary);

  // テキストは即座に見た目へ反映しつつ（controlled textarea）、コマンドへの反映は軽くdebounce
  // する（`BigramFlowStandalonePage`が元々持っていた配線と同じ。1打鍵ごとにTrace再計算が
  // 走らないようにするため）。copy-on-write自体は`setCurrentTextContentCommand`
  // （`engine/commands.ts`）が適用時点の資産を見て1回だけ行うので、ここでは特別な配慮は要らない。
  const [textDraft, setTextDraft] = useState(resolved.text);
  const textDraftRef = useRef(textDraft);
  textDraftRef.current = textDraft;
  useEffect(() => {
    setTextDraft(resolved.text);
    // resolved.textの参照ではなく内容の変化で揃え直したいが、`resolveTextSelection`は
    // 呼ぶたびに新しいオブジェクトを作るので依存はrefではなく実際の値にする。
  }, [resolved.text]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textDraftRef.current !== resolved.text) {
        dispatch(setCurrentTextContentCommand(textDraftRef.current, generateTextId));
      }
    }, TEXT_COMMIT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `resolved.text`が変わった（選択の切り替え・他タブの反映）たびにタイマーを張り直す。
  }, [textDraft, resolved.text, dispatch, generateTextId]);

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
            dispatch(selectTextCommand({ kind, id }));
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
          onChange={(event) => setTextDraft(event.currentTarget.value)}
          rows={3}
          aria-label="テキスト"
        />
        <small>
          言語判定: {resolved.language}
          {resolved.languageOverride !== undefined ? '（手動指定）' : '（自動）'}
          {!resolved.isBuiltin ? (
            <>
              {' '}
              <button
                type="button"
                onClick={() => dispatch(setCurrentTextLanguageOverrideCommand(
                  resolved.languageOverride === undefined
                    ? (resolved.language === 'ja' ? 'en' : 'ja')
                    : undefined,
                ))}
              >
                {resolved.languageOverride === undefined ? '言語判定を手動指定へ切り替え' : '自動判定へ戻す'}
              </button>
            </>
          ) : null}
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
          <button type="button" onClick={() => dispatch(createTextCommand(generateTextId))}>新規作成</button>
          <button type="button" onClick={() => dispatch(duplicateCurrentTextCommand(generateTextId))}>複製</button>
          <button
            type="button"
            onClick={() => dispatch(deleteTextCommand(resolved.ref.id))}
            disabled={resolved.isBuiltin}
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
