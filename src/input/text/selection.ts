import { DEFAULT_BUILTIN_TEXT_ID } from './builtin.ts';

/**
 * 「どのテキストを今使っているか」への参照。組み込みかユーザーテキストかをkindで
 * 区別する（idの文字列だけでは、将来ユーザーテキストのid生成規則が変わった時に
 * 組み込みのid空間と衝突しないという保証が持てないため）。
 */
export type TextRef =
  | { readonly kind: 'builtin'; readonly id: string }
  | { readonly kind: 'user'; readonly id: string };

export function textRefEquals(a: TextRef, b: TextRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** 既定の選択（組み込みのja.legacy「吾輩は猫である」）。 */
export const DEFAULT_TEXT_REF: TextRef = { kind: 'builtin', id: DEFAULT_BUILTIN_TEXT_ID };

/**
 * 「今使っているテキストの選択」1つぶんの状態。この型自体はどの器（単体ページ / 将来の
 * Workspace）の選択かを知らない汎用の値にしておく。器ごとの持ち先は`engine/commands.ts`の
 * `KeydistAssets`が`standaloneTextSelection`のようなキー名で区別する（`setup/collection.ts`の
 * `SetupLibrary`がSetupの実体を、この型が「今どれを見ているか」だけを持つのと同じ分担）。
 * こうしておけば、Workspace用の2つ目の持ち主を足す時もこの型をそのまま再利用できる。
 */
export interface TextSelectionState {
  readonly ref: TextRef;
}

export function initialTextSelection(): TextSelectionState {
  return { ref: DEFAULT_TEXT_REF };
}

/** 選択を差し替える。同じ参照なら`current`をそのまま返す（no-op判定用の規約）。 */
export function withTextSelection(current: TextSelectionState, ref: TextRef): TextSelectionState {
  if (textRefEquals(current.ref, ref)) return current;
  return { ref };
}
