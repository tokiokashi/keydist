import { COMPARISON_COLUMN_IDS, type ComparisonColumnId } from '../comparison-column-text.ts';

/**
 * 散布図の軸の組み合わせと、軸の2つの量から恒等式で決まる3つ目の量（等位線の量）。
 *
 * 軸に取れるのは比較表の列だけで、新しい指標は作らない。等位線は、定義の上で3つの量を結ぶ恒等式
 * （距離 = 動作数 × u/打鍵、押下 = 動作数 × 押下/動作、同指 = 動作数 × 同指率 / 100、
 * 同じ手の続きの割合 = 同じ手の続き / (手の切り替え + 同じ手の続き) × 100）にだけ引く。
 * 点の位置から関係の強さを測る表示（回帰直線・相関係数）は出さない。
 */

/** 用意する組み合わせ。 */
export const SCATTER_PRESET_IDS = ['distance', 'press', 'sameFinger', 'hand', 'free'] as const;
export type ScatterPresetId = (typeof SCATTER_PRESET_IDS)[number];

export interface ScatterAxes {
  readonly x: ComparisonColumnId;
  readonly y: ComparisonColumnId;
}

/** 用意する組み合わせの軸。`free`は解析設定で選んだ軸を使う。 */
export const SCATTER_PRESET_AXES: Readonly<Record<Exclude<ScatterPresetId, 'free'>, ScatterAxes>> = {
  distance: { x: 'perCharSteps', y: 'meanPerStroke' },
  press: { x: 'perCharSteps', y: 'perActionPresses' },
  sameFinger: { x: 'actions', y: 'sameFingerRate' },
  hand: { x: 'handSwitches', y: 'handContinuations' },
};

/** 組み合わせの選択肢に出す名前。 */
export const SCATTER_PRESET_LABELS: Readonly<Record<ScatterPresetId, string>> = {
  distance: '1文字の動作数と1打鍵の距離',
  press: '1文字の動作数と1動作の押下',
  sameFinger: '動作数と同指率',
  hand: '手の切り替えと同じ手の続き',
  free: '自由に選ぶ',
};

/** 恒等式の1つの量。総数の列と、1文字あたりの列（どちらも無い量は無い）を持つ。 */
interface Quantity {
  /** 総数の列。比較表に総数の列が無い量（押下）は持たない。 */
  readonly total?: ComparisonColumnId;
  readonly perChar?: ComparisonColumnId;
  /**
   * 入力文字数Cに比例する量（個数・距離）か。比例しない量（平均・率）の列は1つで、総数と1文字あたりの区別が無い。
   */
  readonly extensive: boolean;
}

type Triple = readonly [number, number, number];

interface Identity {
  readonly quantities: readonly [Quantity, Quantity, Quantity];
  /**
   * `index`番目の量を、総数の形の3つの値（`index`番目は読まない）から求める。
   * 分母が0で決まらない時は`undefined`。
   */
  readonly solve: (index: 0 | 1 | 2, q: Triple) => number | undefined;
}

const divide = (numerator: number, denominator: number): number | undefined => (denominator === 0 ? undefined : numerator / denominator);

const IDENTITIES: readonly Identity[] = [
  // 距離 = 動作数 × u/打鍵。`meanPerStroke`は総移動距離 / Stroke数で、`actions`はStroke数。
  {
    quantities: [
      { total: 'actions', perChar: 'perCharSteps', extensive: true },
      { total: 'meanPerStroke', extensive: false },
      { total: 'totalUnits', perChar: 'perCharUnits', extensive: true },
    ],
    solve: (index, [n, m, p]) => (index === 0 ? divide(p, m) : index === 1 ? divide(p, n) : n * m),
  },
  // 押下 = 動作数 × 押下/動作。`perActionPresses`は押下キー数 / アクション数。押下は1文字あたりの列だけが比較表にある。
  {
    quantities: [
      { total: 'actions', perChar: 'perCharSteps', extensive: true },
      { total: 'perActionPresses', extensive: false },
      { perChar: 'perCharPresses', extensive: true },
    ],
    solve: (index, [n, m, p]) => (index === 0 ? divide(p, m) : index === 1 ? divide(p, n) : n * m),
  },
  // 同指 = 動作数 × 同指率 / 100。`sameFingerRate`の分母はStroke数。
  {
    quantities: [
      { total: 'actions', perChar: 'perCharSteps', extensive: true },
      { total: 'sameFingerRate', extensive: false },
      { total: 'sameFinger', extensive: true },
    ],
    solve: (index, [n, r, s]) => (index === 0 ? divide(100 * s, r) : index === 1 ? divide(100 * s, n) : (n * r) / 100),
  },
  // 同じ手の続きの割合 = 同じ手の続き / (手の切り替え + 同じ手の続き) × 100。
  {
    quantities: [
      { total: 'handSwitches', extensive: true },
      { total: 'handContinuations', extensive: true },
      { total: 'sameHandContinuationRate', extensive: false },
    ],
    solve: (index, [w, c, rate]) => (index === 0 ? divide(c * (100 - rate), rate) : index === 1 ? divide(rate * w, 100 - rate) : divide(100 * c, w + c)),
  },
];

type Form = 'total' | 'perChar';

function formOf(quantity: Quantity, column: ComparisonColumnId): Form | undefined {
  if (quantity.total === column) return 'total';
  if (quantity.perChar === column) return 'perChar';
  return undefined;
}

/** 軸の選び方の問題。`same`は同じ列を両軸に選んだ時、`scaled`は入力文字数倍の関係にある2列（動作数と動作数/文字、距離とu/文字）を選んだ時。 */
export type ScatterAxisProblem = 'same' | 'scaled';

/**
 * 2つの軸に選べるか。選べない組なら理由を返す。
 * 入力文字数倍の関係にある2列は、点が1本の直線に並ぶだけで、関係を読む図にならない。
 */
export function scatterAxisProblem(x: ComparisonColumnId, y: ComparisonColumnId): ScatterAxisProblem | undefined {
  if (x === y) return 'same';
  for (const identity of IDENTITIES) {
    for (const quantity of identity.quantities) {
      if (quantity.perChar !== undefined && formOf(quantity, x) !== undefined && formOf(quantity, y) !== undefined) return 'scaled';
    }
  }
  return undefined;
}

/** 等位線。軸の2つの量から、恒等式で決まる3つ目の量が一定になる線。 */
export interface ScatterContour {
  /** 等位線の量の列（比較表の列）。 */
  readonly column: ComparisonColumnId;
  /** 軸の値から等位線の量を求める。分母が0で決まらない点では`undefined`。 */
  readonly valueAt: (x: number, y: number) => number | undefined;
  /** 等位線の量が`level`になる線が、横軸の値`x`で通る縦軸の値。通る点が無い時は`undefined`。 */
  readonly yAt: (level: number, x: number) => number | undefined;
}

/**
 * 2つの軸に引く等位線。どの恒等式の2つの量にも当たらない組、等位線の量が比較表の列に無い組には`undefined`。
 *
 * 軸の列が1文字あたりの形（動作数/文字・u/文字）の時は、入力文字数 `inputChars` を掛けて総数の形に直して恒等式に当て、
 * 等位線の量も同じ形で返す。入力文字数は集合の全部の対象で同じ（同じテキストを使い、配列に依る前処理は1文字を1文字に直すだけ）。
 * - 等位線の量に総数と1文字あたりの2列がある時は、軸に1文字あたりの列が1つでもあれば1文字あたりの列、無ければ総数の列
 * - 総数の列だけがある量（同指）は、軸に1文字あたりの列がある時、1文字あたりの列が比較表に無いので引かない
 * - 1文字あたりの列だけがある量（押下）は、軸が両方とも総数の形の時、総数の列が比較表に無いので引かない
 */
export function scatterContour(x: ComparisonColumnId, y: ComparisonColumnId, inputChars: number): ScatterContour | undefined {
  if (scatterAxisProblem(x, y) !== undefined) return undefined;
  for (const identity of IDENTITIES) {
    const qs = identity.quantities;
    const xi = qs.findIndex((quantity) => formOf(quantity, x) !== undefined);
    const yi = qs.findIndex((quantity) => formOf(quantity, y) !== undefined);
    if (xi < 0 || yi < 0 || xi === yi) continue;
    const ri = [0, 1, 2].find((i) => i !== xi && i !== yi) as 0 | 1 | 2;
    const xq = qs[xi]!;
    const yq = qs[yi]!;
    const rq = qs[ri]!;
    const xForm = formOf(xq, x)!;
    const yForm = formOf(yq, y)!;
    const axisPerChar = xForm === 'perChar' || yForm === 'perChar';
    // 等位線の量を出す列。1文字あたりの軸を取る時、総数だけの量は引かない
    let outColumn: ComparisonColumnId;
    let outForm: Form;
    if (rq.perChar !== undefined && axisPerChar) {
      outColumn = rq.perChar;
      outForm = 'perChar';
    } else if (rq.total !== undefined && !(rq.extensive && axisPerChar && rq.perChar === undefined)) {
      outColumn = rq.total;
      outForm = 'total';
    } else {
      return undefined;
    }
    const needsScale = axisPerChar || outForm === 'perChar';
    if (needsScale && !(inputChars > 0)) return undefined;
    const toTotal = (value: number, form: Form): number => (form === 'perChar' ? value * inputChars : value);
    const fromTotal = (value: number, form: Form): number => (form === 'perChar' ? value / inputChars : value);
    const triple = (values: Readonly<Record<number, number>>): Triple => [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    const finite = (value: number | undefined): number | undefined => (value !== undefined && Number.isFinite(value) ? value : undefined);
    return {
      column: outColumn,
      valueAt: (xv, yv) => {
        const value = identity.solve(ri, triple({ [xi]: toTotal(xv, xForm), [yi]: toTotal(yv, yForm) }));
        return finite(value === undefined ? undefined : fromTotal(value, outForm));
      },
      yAt: (level, xv) => {
        const value = identity.solve(yi as 0 | 1 | 2, triple({ [xi]: toTotal(xv, xForm), [ri]: toTotal(level, outForm) }));
        return finite(value === undefined ? undefined : fromTotal(value, yForm));
      },
    };
  }
  return undefined;
}

/** 軸に選べる列。比較表の列の全部。 */
export const SCATTER_AXIS_COLUMN_IDS: readonly ComparisonColumnId[] = COMPARISON_COLUMN_IDS;
