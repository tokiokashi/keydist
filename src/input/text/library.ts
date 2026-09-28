import type { TextLanguage } from './samples.ts';

/**
 * ユーザーが自作したテキスト（#544 Phase 3「テキストの資産化」。`docs/architecture.md`
 * 用語表「テキストは…資産として複数持ち…組み込み（サンプル）と自作がある」）。
 * `Setup`（`input/setup/types.ts`）と同じ形で、実体（本文）とidだけを持つ。
 *
 * 言語は自動判定が既定で、`languageOverride`が手動指定（#544指示書「Language:
 * auto-detected per text, manual override stored on the user text」）。組み込みは
 * 言語が固定なのでこのフィールドを持たない（`builtin.ts`の`BuiltinText`参照）。
 */
export interface UserText {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly languageOverride?: TextLanguage;
}

export interface TextLibrary {
  readonly texts: readonly UserText[];
}

/**
 * テキストの新規idを払い出す関数。`input`は純粋層で`crypto.randomUUID`等を直接使わない
 * （`input/setup/types.ts`の`SetupIdGenerator`と同じ理由）ため、呼び出し側（`app`）が注入する。
 */
export type TextIdGenerator = () => string;

export function emptyTextLibrary(): TextLibrary {
  return { texts: [] };
}

/**
 * 新規のユーザーテキストを作る（空のテキストから始める「新規作成」ボタン用）。
 * `text`省略時は空文字列、`name`省略時は「新しいテキスト」。
 */
export function createUserText(
  library: TextLibrary,
  generateId: TextIdGenerator,
  text = '',
  name = '新しいテキスト',
): TextLibrary {
  const entry: UserText = { id: generateId(), name, text };
  return { texts: [...library.texts, entry] };
}

/**
 * 既存の内容（組み込み・ユーザーテキストのどちらでもよい）を新しいユーザーテキストとして
 * 資産へ足す。「複製」ボタンと、組み込みを書き換えた時のcopy-on-write（`engine/commands.ts`の
 * `setCurrentTextContentCommand`）の両方がこれを使う。
 */
export function appendCopiedUserText(
  library: TextLibrary,
  generateId: TextIdGenerator,
  source: { readonly text: string; readonly name: string; readonly languageOverride?: TextLanguage },
  name?: string,
): { readonly library: TextLibrary; readonly created: UserText } {
  const id = generateId();
  const entryName = name ?? source.name;
  const created: UserText = source.languageOverride === undefined
    ? { id, name: entryName, text: source.text }
    : { id, name: entryName, text: source.text, languageOverride: source.languageOverride };
  return { library: { texts: [...library.texts, created] }, created };
}

/**
 * ユーザーテキストを削除する。存在しないidの削除は何もしない
 * （`input/setup/collection.ts`の`deleteSetup`と同じ「変化が無ければ同一参照を返す」規約。
 * コマンド層が参照の一致でno-opを判定するため）。
 */
export function deleteUserText(library: TextLibrary, id: string): TextLibrary {
  if (!library.texts.some((text) => text.id === id)) return library;
  return { texts: library.texts.filter((text) => text.id !== id) };
}

/**
 * 名前を付け直す。対象が存在しない、または既に同じ名前なら`library`をそのまま返す
 * （`deleteUserText`と同じ規約）。
 */
export function renameUserText(library: TextLibrary, id: string, name: string): TextLibrary {
  const target = library.texts.find((text) => text.id === id);
  if (target === undefined || target.name === name) return library;
  return { texts: library.texts.map((text) => text.id === id ? { ...text, name } : text) };
}

/**
 * 本文を書き換える（既存のユーザーテキストをその場で編集する。#544指示書「Editing a
 * user text modifies it in place」）。組み込みのcopy-on-writeは呼び出し側
 * （`engine/commands.ts`）が`appendCopiedUserText`で新規作成してから、以後はこちらを使う。
 */
export function editUserTextContent(library: TextLibrary, id: string, text: string): TextLibrary {
  const target = library.texts.find((entry) => entry.id === id);
  if (target === undefined || target.text === text) return library;
  return { texts: library.texts.map((entry) => entry.id === id ? { ...entry, text } : entry) };
}

/** 言語判定の手動上書きを設定・解除する。`undefined`で自動判定へ戻す。 */
export function setUserTextLanguageOverride(
  library: TextLibrary,
  id: string,
  override: TextLanguage | undefined,
): TextLibrary {
  const target = library.texts.find((text) => text.id === id);
  if (target === undefined || target.languageOverride === override) return library;
  const next: UserText = override === undefined
    ? withoutLanguageOverride(target)
    : { ...target, languageOverride: override };
  return { texts: library.texts.map((text) => text.id === id ? next : text) };
}

function withoutLanguageOverride(text: UserText): UserText {
  const { languageOverride: _drop, ...rest } = text;
  return rest;
}
