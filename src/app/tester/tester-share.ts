import type { ShareQuery } from '#hosts/shared/index.ts';

/** Testerの共有リンクで配列を運ぶパラメータ。`routes/input.tsx` の `validateSearch` が読む。 */
export const TESTER_LAYOUT_PARAM = 'layout';

/**
 * Testerの共有リンクに載せる値。組み込みの配列はidがどの端末でも同じ配列を指すので載せる。
 * 自作の配列のidはこのブラウザの保存先の値で、受け取った側には同じidの配列が無いので載せず、載らないことを知らせる。
 */
export function testerShareQuery(selection: { readonly layoutId: string; readonly builtIn: boolean }): ShareQuery {
  const params = new URLSearchParams();
  if (selection.builtIn) {
    params.set(TESTER_LAYOUT_PARAM, selection.layoutId);
    return { params };
  }
  return { params, notices: ['自作の配列はリンクに載りません'] };
}
