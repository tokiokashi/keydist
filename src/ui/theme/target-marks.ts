/**
 * 対象（配列・Setup）を並べて見せる時の、色以外の手がかり。
 *
 * 色だけで区別すると、色を見分けにくい人や白黒の印刷では、どの線がどの対象か分からない。
 * そこで色の番号（`target-colors.ts`の`targetPaletteColor`に渡す番号と同じもの）から、
 * 点の形と線種も決める。同じ番号なら、どのペインでも同じ形・同じ線種になる。
 *
 * **形は6種、線種は実線と破線の2種で、12通りが重ならない。** パレットの色数（12）と合わせた。
 * 先頭6つが実線で、形が1周した後の番号（6〜11）が破線になる。多くの集合は先頭の数色しか使わないので、
 * 大半の図は実線のまま、形だけで区別できる。形は小さく描かれるので、見分けやすい単純な形に絞った。
 */
export type TargetMarkShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'triangle-down';

export interface TargetMark {
  readonly shape: TargetMarkShape;
  /** 線を破線にするか。 */
  readonly dashed: boolean;
}

const SHAPES: readonly TargetMarkShape[] = ['circle', 'square', 'triangle', 'diamond', 'cross', 'triangle-down'];

/** 破線の描き方（SVGの`stroke-dasharray`）。 */
export const TARGET_DASH_ARRAY = '5 3';

/** 番号の手がかり。範囲外は色と同じく剰余で折り返す。 */
export function targetMark(slot: number): TargetMark {
  const count = SHAPES.length * 2;
  const index = ((slot % count) + count) % count;
  return { shape: SHAPES[index % SHAPES.length]!, dashed: index >= SHAPES.length };
}

/**
 * 形の輪郭。原点を中心に、基準の半径`r`で描く。四角は円より小さく、三角と菱形は大きく取り、
 * 見た目の面積を揃える。`cross`は塗れない形なので、線で描く（線の太さは呼び出し側）。
 */
export function targetMarkPath(shape: TargetMarkShape, r: number): string {
  const f = (n: number) => Number(n.toFixed(2));
  switch (shape) {
    case 'circle':
      return `M${f(-r)},0a${f(r)},${f(r)} 0 1,0 ${f(r * 2)},0a${f(r)},${f(r)} 0 1,0 ${f(-r * 2)},0z`;
    case 'square': {
      const h = r * 0.88;
      return `M${f(-h)},${f(-h)}h${f(h * 2)}v${f(h * 2)}h${f(-h * 2)}z`;
    }
    case 'triangle':
      return `M0,${f(-r * 1.1)}L${f(r * 1.05)},${f(r * 0.8)}L${f(-r * 1.05)},${f(r * 0.8)}z`;
    case 'triangle-down':
      return `M0,${f(r * 1.1)}L${f(r * 1.05)},${f(-r * 0.8)}L${f(-r * 1.05)},${f(-r * 0.8)}z`;
    case 'diamond':
      return `M0,${f(-r * 1.25)}L${f(r * 1.25)},0L0,${f(r * 1.25)}L${f(-r * 1.25)},0z`;
    case 'cross': {
      const h = r * 0.95;
      return `M${f(-h)},${f(-h)}L${f(h)},${f(h)}M${f(-h)},${f(h)}L${f(h)},${f(-h)}`;
    }
  }
}

/** 塗らずに線で描く形か。 */
export function isStrokeOnlyMark(shape: TargetMarkShape): boolean {
  return shape === 'cross';
}
