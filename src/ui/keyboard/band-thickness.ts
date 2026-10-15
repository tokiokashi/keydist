/**
 * キーの縁に重ねる帯1本の太さを、キーの幅（下の縁は高さ）に対する割合で返す。
 * `count`は同じ縁に並ぶ帯の本数。
 *
 * - 各縁に1本の時は1/4
 * - 左右の縁は、同じ縁の帯の合計が3/8を超えないよう細くする。左右がどちらも上限まで並んでも、
 *   キー全体の塗りが幅の1/4以上（帯1本の太さ以上）残る
 * - 下の縁は、同じ縁の帯の合計が1/2を超えないよう細くする
 */
export function bandThicknessRatio(edge: 'left' | 'right' | 'bottom', count: number): number {
  if (count <= 0) return 0;
  const edgeTotalLimit = edge === 'bottom' ? 1 / 2 : 3 / 8;
  return Math.min(1 / 4, edgeTotalLimit / count);
}
