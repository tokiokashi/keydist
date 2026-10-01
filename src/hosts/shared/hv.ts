/*
 * 【試作 #827】見出しの案を切り替える。`<html data-hv="a|b|c">`で選ぶ（無ければ今の見出し）。
 * 試作のためだけの仕掛けで、本実装には入れない。
 */
export type HeaderVariant = 'a' | 'b' | 'c' | undefined;

export function headerVariant(): HeaderVariant {
  if (typeof document === 'undefined') return undefined;
  const fromUrl = new URLSearchParams(window.location.search).get('hv');
  if (fromUrl !== null) document.documentElement.dataset.hv = fromUrl;
  const value = document.documentElement.dataset.hv;
  return value === 'a' || value === 'b' || value === 'c' ? value : undefined;
}
