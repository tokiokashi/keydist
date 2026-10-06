/**
 * カスケードのレベル。弱い順に並べる。
 * 「物理配列」自体はSetupの属性（配列 × 物理配列 × ポリシー）であり、
 * ここでのレベルは「物理配列ごとにポリシーの上書きを持てる」という意味でしかない
 * （docs/architecture.mdの用語表参照）。
 */
export type CascadeLevelKind = 'global' | 'workspace' | 'shape' | 'inputMethod' | 'layout' | 'setup';

/**
 * 弱い順（左が弱い・右が強い）。解決はこの順で上書きを重ねる。
 * workspaceはそのWorkspaceが自分の条件として持つ1レベル（idを持たない。解決は「今開いているWorkspace」の値だけを
 * 見る）。単体ページの解決はこのレベルに値を持たない（`CascadeOverrides.workspace`が無い）。
 */
export const CASCADE_LEVEL_ORDER: readonly CascadeLevelKind[] = [
  'global',
  'workspace',
  'shape',
  'inputMethod',
  'layout',
  'setup',
];

/**
 * 打ち方。テキストの言語 × 配列の種類から導く値で、ユーザーが選ぶものではない。導出そのものはここでは行わないので、
 * ここではカスケードのレベルキーとして使う型だけを持つ。
 */
export type InputMethod = 'kana-direct' | 'romaji' | 'direct';

/** カスケードの書き込み・読み出し先を指す1レベル分の参照。 */
export type CascadeLevel =
  | { readonly kind: 'global' }
  | { readonly kind: 'workspace' }
  | { readonly kind: 'shape'; readonly shapeId: string }
  | { readonly kind: 'inputMethod'; readonly inputMethod: InputMethod }
  | { readonly kind: 'layout'; readonly layoutId: string }
  | { readonly kind: 'setup'; readonly setupId: string };

/** そのレベルの中で上書きを束ねるキー。global・workspaceは単一なので固定文字列を使う。 */
export function cascadeLevelStoreKey(level: CascadeLevel): string {
  switch (level.kind) {
    case 'global': return 'global';
    case 'workspace': return 'workspace';
    case 'shape': return level.shapeId;
    case 'inputMethod': return level.inputMethod;
    case 'layout': return level.layoutId;
    case 'setup': return level.setupId;
  }
}

export function sameCascadeLevel(a: CascadeLevel, b: CascadeLevel): boolean {
  return a.kind === b.kind && cascadeLevelStoreKey(a) === cascadeLevelStoreKey(b);
}
