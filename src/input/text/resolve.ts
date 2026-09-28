import { detectTextLanguage, type TextLanguage } from './language.ts';
import { builtinTextById, DEFAULT_BUILTIN_TEXT_ID } from './builtin.ts';
import type { TextLibrary } from './library.ts';
import { DEFAULT_TEXT_REF, type TextRef, type TextSelectionState } from './selection.ts';

/** 選択から実際に使う値を1つに決めた結果。resolve系の他の型（`SetupResolution`等）と同じ形。 */
export interface ResolvedText {
  /** 実際に使われた参照。フォールバックした場合は`selection.ref`と一致しない。 */
  readonly ref: TextRef;
  readonly name: string;
  readonly text: string;
  readonly language: TextLanguage;
  /** ユーザーテキストの手動上書き。組み込みの時は常に`undefined`（言語固定）。 */
  readonly languageOverride: TextLanguage | undefined;
  readonly isBuiltin: boolean;
}

/**
 * 「今使っているテキスト」を選択と手持ちから求める（#544指示書）。参照先のユーザー
 * テキストが手持ちに無い（削除された・他タブの変更と競合した等）場合は、既定の組み込み
 * （`DEFAULT_TEXT_REF`）へフォールバックする。`deleteTextCommand`（`engine/commands.ts`）が
 * 選択中のテキストを消す時に選択自体もフォールバックさせているので通常はここに来ないが、
 * 「資産の整合はresolve側でも保つ」という`setup/resolve.ts`と同じ方針で、参照だけが
 * 壊れているケースにもここで一貫して対応する。
 */
export function resolveTextSelection(selection: TextSelectionState, library: TextLibrary): ResolvedText {
  const ref = selection.ref;
  if (ref.kind === 'builtin') {
    const builtin = builtinTextById(ref.id) ?? builtinTextById(DEFAULT_BUILTIN_TEXT_ID)!;
    return {
      ref: { kind: 'builtin', id: builtin.id },
      name: builtin.name,
      text: builtin.text,
      language: builtin.language,
      languageOverride: undefined,
      isBuiltin: true,
    };
  }

  const userText = library.texts.find((text) => text.id === ref.id);
  if (userText === undefined) {
    return resolveTextSelection({ ref: DEFAULT_TEXT_REF }, library);
  }
  return {
    ref: { kind: 'user', id: userText.id },
    name: userText.name,
    text: userText.text,
    language: userText.languageOverride ?? detectTextLanguage(userText.text),
    languageOverride: userText.languageOverride,
    isBuiltin: false,
  };
}
