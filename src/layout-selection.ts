/** 画面のモード。表示状態がモードごとに割れるので、その定義をここに置く */
export type ModeId = 'en' | 'ja';

/**
 * 保存値と既定値から、実際に使う選択集合を決める。
 * 保存が無いモード（= 初回訪問）だけ既定値を使う。保存が空配列のモードは
 * 「全部オフ」を意図した状態として尊重し、既定値へは戻さない。
 * 保存値にもう存在しない配列idが混ざっていても、呼び出し側（activeLayouts）が
 * filterで弾くので害はなく、ここでは弾かない。
 */
export function resolveSelection(
  stored: string[] | undefined,
  initial: readonly string[],
): Set<string> {
  return new Set(stored ?? initial);
}
