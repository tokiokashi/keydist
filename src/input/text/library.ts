import type { TextLanguage } from './samples.ts';

/**
 * ユーザーが自作したテキスト（`docs/architecture.md`
 * 用語表「テキストは…資産として複数持ち…組み込み（サンプル）と自作がある」）。
 * `Setup`（`input/setup/types.ts`）と同じ形で、実体（本文）とidだけを持つ。
 *
 * 言語は自動判定が既定で、`languageOverride`が手動指定。テキストごとに手動指定を
 * 持たせることで、同じ内容のテキストでも複製先ごとに違う言語指定を持てる。組み込みは
 * 言語が固定なのでこのフィールドを持たない（`builtin.ts`の`BuiltinText`参照）。
 */
export interface UserText {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly languageOverride?: TextLanguage;
  /**
   * 競合で選ばれずに残ったコピー（他タブや直前の切り替えに負けた書き込み）で、まだ本人が見ていない印。
   * 文脈バーのチップに点を出し、一覧で「新しい」と示すために使う。見た時に外す。
   * 他タブへ伝えるため、セッションの中ではなく資産に持つ。
   */
  readonly unseen?: true;
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
 * 新しいユーザーテキストを1件、資産へ足す（複製元が有る／無い両方を1つの形で扱う）。
 * 「新規作成」ボタン（`source.text`に空文字列を渡す）、「複製」ボタン（既存の内容を渡す）、
 * 組み込みを書き換えた時のcopy-on-write（`engine/commands.ts`の`setTextContentCommand`。
 * 打った本文を渡す）の3箇所がすべてこれを使う。「コピー」という名前だが、
 * コピー元が無い（空の）テキストを足す時にも使う汎用の追加処理。
 */
export function appendCopiedUserText(
  library: TextLibrary,
  generateId: TextIdGenerator,
  source: {
    readonly text: string;
    readonly name: string;
    readonly languageOverride?: TextLanguage;
    readonly unseen?: true;
  },
  name?: string,
): { readonly library: TextLibrary; readonly created: UserText } {
  const id = generateId();
  const entryName = name ?? source.name;
  const base: UserText = source.languageOverride === undefined
    ? { id, name: entryName, text: source.text }
    : { id, name: entryName, text: source.text, languageOverride: source.languageOverride };
  const created: UserText = source.unseen === true ? { ...base, unseen: true } : base;
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
 * 本文を書き換える（既存のユーザーテキストをその場で編集する。複製は作らない）。
 * 組み込みのcopy-on-writeは呼び出し側（`engine/commands.ts`）が`appendCopiedUserText`で
 * 新規作成してから、以後の編集はこちらを使う。
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

/**
 * 指定したテキストの「新しい」印を外す。印の無いテキストだけなら`library`をそのまま返す
 * （他の関数と同じ「変化が無ければ同一参照」の規約）。
 */
export function markUserTextsSeen(library: TextLibrary, ids: readonly string[]): TextLibrary {
  const targets = new Set(ids);
  if (!library.texts.some((text) => text.unseen === true && targets.has(text.id))) return library;
  return {
    texts: library.texts.map((text) => {
      if (text.unseen !== true || !targets.has(text.id)) return text;
      const { unseen: _drop, ...rest } = text;
      return rest;
    }),
  };
}

function withoutLanguageOverride(text: UserText): UserText {
  const { languageOverride: _drop, ...rest } = text;
  return rest;
}

/**
 * 自動生成名（copy-on-write・複製・新規作成の既定名）の重複を避ける。
 * 手動で付けた名前は重複してもよい（識別子はidが担うので実害が無い）が、自動生成名は
 * 「同じ名前が並んで見分けが付かない」を作り出す側なので、既に使われていれば
 * 「名前 2」「名前 3」…と連番を振って区別できるようにする。
 */
export function uniqueAutoTextName(library: TextLibrary, baseName: string): string {
  const existingNames = new Set(library.texts.map((text) => text.name));
  if (!existingNames.has(baseName)) return baseName;
  let suffix = 2;
  while (existingNames.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}
