/**
 * カスケードのレベル（#544 §3）。弱い順に並べる。
 * 「物理形状」自体はSetupの属性（配列 × 物理形状 × ポリシー）であり、
 * ここでのレベルは「物理形状ごとにポリシーの上書きを持てる」という意味でしかない
 * （docs/architecture.mdの用語表・#544 §3参照）。
 */
export type CascadeLevelKind = 'global' | 'shape' | 'inputMethod' | 'layout' | 'setup';

/** 弱い順（左が弱い・右が強い）。解決はこの順で上書きを重ねる。 */
export const CASCADE_LEVEL_ORDER: readonly CascadeLevelKind[] = [
  'global',
  'shape',
  'inputMethod',
  'layout',
  'setup',
];

/**
 * 打ち方。テキストの言語 × 配列の種類から導く値で、ユーザーが選ぶものではない
 * （#544 用語集）。導出そのものは別項目（Phase 2「打ち方の導出」）の対象なので、
 * ここではカスケードのレベルキーとして使う型だけを持つ。
 */
export type InputMethod = 'kana-direct' | 'romaji' | 'direct';

/** カスケードの書き込み・読み出し先を指す1レベル分の参照。 */
export type CascadeLevel =
  | { readonly kind: 'global' }
  | { readonly kind: 'shape'; readonly shapeId: string }
  | { readonly kind: 'inputMethod'; readonly inputMethod: InputMethod }
  | { readonly kind: 'layout'; readonly layoutId: string }
  | { readonly kind: 'setup'; readonly setupId: string };

/** そのレベルの中で上書きを束ねるキー。globalは単一なので固定文字列を使う。 */
export function cascadeLevelStoreKey(level: CascadeLevel): string {
  switch (level.kind) {
    case 'global': return 'global';
    case 'shape': return level.shapeId;
    case 'inputMethod': return level.inputMethod;
    case 'layout': return level.layoutId;
    case 'setup': return level.setupId;
  }
}

export function sameCascadeLevel(a: CascadeLevel, b: CascadeLevel): boolean {
  return a.kind === b.kind && cascadeLevelStoreKey(a) === cascadeLevelStoreKey(b);
}
