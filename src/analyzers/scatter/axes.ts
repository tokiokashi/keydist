import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_IDS, type ComparisonColumnId } from '../comparison-column-text.ts';
import { kanaUnitOf } from '../unit-words.ts';
import { axisName, axisPlotTitle, KEY_COUNT_NAME } from './axis-names.ts';

/**
 * 散布図の軸の組み合わせと、軸の2つの量から恒等式で決まる3つ目の量（等位線の量）。
 *
 * 軸に取れるのは比較表の列だけで、新しい指標は作らない。等位線は、定義の上で3つの量を結ぶ恒等式
 * （距離 = アクション数 × u/アクション、キー数 = アクション数 × キー数/アクション、距離 = キー数 × u/キー、u/アクション = キー数/アクション × u/キー、
 * 同指 = アクション数 × 同指率 / 100、
 * 同じ手の続きの割合 = 同じ手の続き / (手の切り替え + 同じ手の続き) × 100、
 * u/キー = 移動ありキー率 / 100 × u/移動ありキー、
 * 文字/u = 文字/アクション × アクション/u、u/アクション = 文字/アクション × u/文字）にだけ引く。
 * 線の量が配列ごとに違う回数で割った距離（`NO_LINE_COLUMNS`）の組には、恒等式があっても線を引かない。
 * 点の位置から関係の強さを測る表示（回帰直線・相関係数）は出さない。
 */

/**
 * 細い線の量にしない列。総移動距離を、配列ごとに違う回数（キー数・移動ありキー数・アクション数）で割った値と、その逆数。
 * 1文字を打つのに押すキーの数やアクションの数は配列で違うので、線の上で値の小さい側にいる配列でも、
 * 同じテキストを打つ時の距離（u/文字）は大きいことがある。線を引くと、この値の大小が同じテキストを打つ時の距離の大小に見えてしまう。
 * 比較表と軸には使える。
 */
const NO_LINE_COLUMNS: ReadonlySet<ComparisonColumnId> = new Set<ComparisonColumnId>([
  'perPressUnits',
  'perMovedPressUnits',
  'meanPerStroke',
  'actionsPerUnit',
]);

/** 左右の手で全体を分ける割合の列。50%が左右の均等の位置になるのはこの2列だけ。 */
const HAND_SHARE_COLUMNS: readonly ComparisonColumnId[] = ['rightHandPressShare', 'rightHandDistanceShare'];

/** 50%が左右の均等の位置になる列か。 */
export function isHandShareColumn(column: ComparisonColumnId): boolean {
  return HAND_SHARE_COLUMNS.includes(column);
}

/** 用意する組み合わせ。 */
export const SCATTER_PRESET_IDS = [
  'distance',
  'press',
  'perPress',
  'sameFinger',
  'hand',
  'handRates',
  'handShare',
  'movedPress',
  'charsPerAction',
  'free',
] as const;
export type ScatterPresetId = (typeof SCATTER_PRESET_IDS)[number];

export interface ScatterAxes {
  readonly x: ComparisonColumnId;
  readonly y: ComparisonColumnId;
}

/** 用意する組み合わせの軸。`free`は解析設定で選んだ軸を使う。 */
export const SCATTER_PRESET_AXES: Readonly<Record<Exclude<ScatterPresetId, 'free'>, ScatterAxes>> = {
  distance: { x: 'perCharSteps', y: 'meanPerStroke' },
  press: { x: 'perActionPresses', y: 'perCharSteps' },
  perPress: { x: 'perCharPresses', y: 'perPressUnits' },
  sameFinger: { x: 'actions', y: 'sameFingerRate' },
  hand: { x: 'handSwitches', y: 'handContinuations' },
  handRates: { x: 'sameHandContinuationRate', y: 'sameFingerRate' },
  handShare: { x: 'rightHandPressShare', y: 'rightHandDistanceShare' },
  movedPress: { x: 'movedPressShare', y: 'perMovedPressUnits' },
  charsPerAction: { x: 'textCharsPerAction', y: 'actionsPerUnit' },
};

/**
 * 組み合わせの選択肢に出す名前。横軸と縦軸の量の名前（`axis-names.ts`）を「と」でつなぐ。
 * 横軸の量を「コスパ」と呼ぶ文脈を知る人に通じるよう、コスパの組だけ横軸の名前の前に「コスパ」を付け、軸の名前を括弧に入れる。
 */
export function scatterPresetLabels(language: TextLanguage): Readonly<Record<ScatterPresetId, string>> {
  const label = (id: Exclude<ScatterPresetId, 'free'>): string => {
    const { x, y } = SCATTER_PRESET_AXES[id];
    return `${axisName(x, language)}と${axisName(y, language)}`;
  };
  return {
    distance: label('distance'),
    press: label('press'),
    perPress: label('perPress'),
    sameFinger: label('sameFinger'),
    hand: label('hand'),
    handRates: label('handRates'),
    handShare: label('handShare'),
    movedPress: label('movedPress'),
    charsPerAction: `コスパ（${axisPlotTitle(SCATTER_PRESET_AXES.charsPerAction.x, language)}）と${axisName(SCATTER_PRESET_AXES.charsPerAction.y, language)}`,
    free: '自由に選ぶ',
  };
}

/** 組み合わせで何が分かるかの短い説明。量は軸と同じ名前で呼ぶ。軸の量の詳しい意味は、図の見方のⓘが出す。 */
export function scatterPresetDescriptions(language: TextLanguage): Readonly<Record<ScatterPresetId, string>> {
  const n = (column: ComparisonColumnId): string => axisName(column, language);
  return {
    distance: `${n('perCharUnits')}を、${n('perCharSteps')}と${n('meanPerStroke')}に分けて見ます。`,
    press: `${n('perCharPresses')}を、${n('perCharSteps')}と${n('perActionPresses')}に分けて見ます。`,
    perPress: `${n('perCharUnits')}を、${n('perCharPresses')}と${n('perPressUnits')}に分けて見ます。`,
    sameFinger: `${n('actions')}と${n('sameFingerRate')}から、${n('sameFinger')}がどう決まるかを見ます。`,
    hand: `${n('handSwitches')}と${n('handContinuations')}から、${n('sameHandContinuationRate')}がどう決まるかを見ます。`,
    handRates: `${n('sameHandContinuationRate')}と${n('sameFingerRate')}を並べて、手と指の続き方を見ます。`,
    handShare: `${n('rightHandPressShare')}と${n('rightHandDistanceShare')}で、右手が受け持つ割合を押すキーの数と距離の2つで比べます。左右の偏りを見る図です。`,
    movedPress: `${n('movedPressShare')}と${n('perMovedPressUnits')}から、${n('perPressUnits')}がどう決まるかを見ます。`,
    charsPerAction: `${n('textCharsPerAction')}と${n('actionsPerUnit')}から、${n('textCharsPerUnit')}がどう決まるかを見ます。大きいほど手間が少ない向きの2軸で、既定の組み合わせの逆の向きです。`,
    free: '比較表の列から横軸と縦軸を選びます。',
  };
}

/** 恒等式の1つの量。総数の列と、1かなあたりの列（どちらも無い量は無い）を持つ。 */
interface Quantity {
  /** 総数の列。比較表に総数の列が無い量（キー数）は持たない。 */
  readonly total?: ComparisonColumnId;
  readonly perChar?: ComparisonColumnId;
  /**
   * 入力かな数Cに比例する量（個数・距離）か。比例しない量（平均・率）の列は1つで、総数と1かなあたりの区別が無い。
   */
  readonly extensive: boolean;
}

type Triple = readonly [number, number, number];

export interface Identity {
  /**
   * 3つの量の関係を、総数の形の名前で書いた式。画面の説明に出す。引数は`quantities`と同じ順の、量の総数の形の名前。
   * 1かなあたりの列が軸や線の量に入る時の換算は、`scatterContour`が`ScatterContour.conversion`に持つ。
   */
  readonly relation: (names: readonly [string, string, string]) => string;
  readonly quantities: readonly [Quantity, Quantity, Quantity];
  /**
   * `index`番目の量を、総数の形の3つの値（`index`番目は読まない）から求める。
   * 分母が0で決まらない時は`undefined`。
   */
  readonly solve: (index: 0 | 1 | 2, q: Triple) => number | undefined;
}

const divide = (numerator: number, denominator: number): number | undefined => (denominator === 0 ? undefined : numerator / denominator);

export const IDENTITIES: readonly Identity[] = [
  // 距離 = アクション数 × u/アクション。`meanPerStroke`は総移動距離 / Stroke数で、`actions`はStroke数。
  {
    relation: ([n, m, p]) => `${p} = ${n} × ${m}`,
    quantities: [
      { total: 'actions', perChar: 'perCharSteps', extensive: true },
      { total: 'meanPerStroke', extensive: false },
      { total: 'totalUnits', perChar: 'perCharUnits', extensive: true },
    ],
    solve: (index, [n, m, p]) => (index === 0 ? divide(p, m) : index === 1 ? divide(p, n) : n * m),
  },
  // キー数 = アクション数 × キー数/アクション。`perActionPresses`は押したキーの数 / アクション数。キー数は1かなあたりの列だけが比較表にある。
  {
    relation: ([n, m, p]) => `${p} = ${n} × ${m}`,
    quantities: [
      { total: 'actions', perChar: 'perCharSteps', extensive: true },
      { total: 'perActionPresses', extensive: false },
      { perChar: 'perCharPresses', extensive: true },
    ],
    solve: (index, [n, m, p]) => (index === 0 ? divide(p, m) : index === 1 ? divide(p, n) : n * m),
  },
  // 距離 = キー数 × u/キー。`perPressUnits`は総移動距離 / 押したキーの数。キー数は1かなあたりの列だけが比較表にある。
  {
    relation: ([n, m, p]) => `${p} = ${n} × ${m}`,
    quantities: [
      { perChar: 'perCharPresses', extensive: true },
      { total: 'perPressUnits', extensive: false },
      { total: 'totalUnits', perChar: 'perCharUnits', extensive: true },
    ],
    solve: (index, [n, m, p]) => (index === 0 ? divide(p, m) : index === 1 ? divide(p, n) : n * m),
  },
  // u/アクション = キー数/アクション × u/キー。3つとも比率で、入力かな数に比例しない。
  {
    relation: ([a, u, m]) => `${m} = ${a} × ${u}`,
    quantities: [
      { total: 'perActionPresses', extensive: false },
      { total: 'perPressUnits', extensive: false },
      { total: 'meanPerStroke', extensive: false },
    ],
    solve: (index, [a, u, m]) => (index === 0 ? divide(m, u) : index === 1 ? divide(m, a) : a * u),
  },
  // 同指 = アクション数 × 同指率 / 100。`sameFingerRate`の分母はStroke数。
  {
    relation: ([n, r, f]) => `${f} = ${n} × ${r} ÷ 100`,
    quantities: [
      { total: 'actions', perChar: 'perCharSteps', extensive: true },
      { total: 'sameFingerRate', extensive: false },
      { total: 'sameFinger', extensive: true },
    ],
    solve: (index, [n, r, s]) => (index === 0 ? divide(100 * s, r) : index === 1 ? divide(100 * s, n) : (n * r) / 100),
  },
  // 同じ手の続きの割合 = 同じ手の続き / (手の切り替え + 同じ手の続き) × 100。
  {
    relation: ([w, c, rate]) => `${rate} = ${c} ÷（${w} + ${c}）× 100`,
    quantities: [
      { total: 'handSwitches', extensive: true },
      { total: 'handContinuations', extensive: true },
      { total: 'sameHandContinuationRate', extensive: false },
    ],
    solve: (index, [w, c, rate]) => (index === 0 ? divide(c * (100 - rate), rate) : index === 1 ? divide(rate * w, 100 - rate) : divide(100 * c, w + c)),
  },
  // u/キー = 移動ありキー率 / 100 × u/移動ありキー。`perPressUnits`は総移動距離 / 押したキーの数、`perMovedPressUnits`は総移動距離 / 移動ありキーの数。
  {
    relation: ([s, m, u]) => `${u} = ${s} ÷ 100 × ${m}`,
    quantities: [
      { total: 'movedPressShare', extensive: false },
      { total: 'perMovedPressUnits', extensive: false },
      { total: 'perPressUnits', extensive: false },
    ],
    solve: (index, [s, m, u]) => (index === 0 ? divide(100 * u, m) : index === 1 ? divide(100 * u, s) : (s * m) / 100),
  },
  // 文字/u = 文字/アクション × アクション/u。`W / D = (W / S) × (S / D)`。3つとも比率で、入力かな数に比例しない。
  {
    relation: ([a, u, c]) => `${c} = ${a} × ${u}`,
    quantities: [
      { total: 'textCharsPerAction', extensive: false },
      { total: 'actionsPerUnit', extensive: false },
      { total: 'textCharsPerUnit', extensive: false },
    ],
    solve: (index, [a, u, c]) => (index === 0 ? divide(c, u) : index === 1 ? divide(c, a) : a * u),
  },
  // u/アクション = 文字/アクション × u/文字。`D / S = (W / S) × (D / W)`。
  {
    relation: ([a, w, m]) => `${m} = ${a} × ${w}`,
    quantities: [
      { total: 'textCharsPerAction', extensive: false },
      { total: 'unitsPerTextChar', extensive: false },
      { total: 'meanPerStroke', extensive: false },
    ],
    solve: (index, [a, w, m]) => (index === 0 ? divide(m, w) : index === 1 ? divide(m, a) : a * w),
  },
];

type Form = 'total' | 'perChar';

/** 量を総数の形で呼ぶ名前。総数の列が比較表に無い量（キー数）は、`axis-names.ts`の総数の形の名前を使う。 */
function totalName(quantity: Quantity, language: TextLanguage): string {
  return quantity.total !== undefined ? axisName(quantity.total, language) : KEY_COUNT_NAME;
}

/** 恒等式の3つの量の関係を、総数の形の名前で書いた式。 */
export function identityRelation(identity: Identity, language: TextLanguage): string {
  const [a, b, c] = identity.quantities;
  return identity.relation([totalName(a, language), totalName(b, language), totalName(c, language)]);
}

function formOf(quantity: Quantity, column: ComparisonColumnId): Form | undefined {
  if (quantity.total === column) return 'total';
  if (quantity.perChar === column) return 'perChar';
  return undefined;
}

/**
 * 同じテキストなら積または比が全配列で一定になる列の群。群の中の2列は、点が1本の曲線の上に並ぶだけになる。
 * アクション数 `S`、総移動距離 `D`、入力かな数 `C`、文字数 `W` のうち、`C` と `W` は同じテキストなら全配列で同じ値なので、
 * 列は `S` と `D` の累乗に定数を掛けた形で表せる。累乗の指数の向きが平行な列が、同じ群に入る。
 * - `S`: アクション数・アクション数/かな（`S / C`）・文字/アクション（`W / S`）
 * - `D`: 距離・u/かな（`D / C`）・u/文字（`D / W`）・文字/u（`W / D`）
 * - `D / S`: u/アクション・アクション/u
 */
const PROPORTIONAL_COLUMN_GROUPS: readonly (readonly ComparisonColumnId[])[] = [
  ['actions', 'perCharSteps', 'textCharsPerAction'],
  ['totalUnits', 'perCharUnits', 'unitsPerTextChar', 'textCharsPerUnit'],
  ['meanPerStroke', 'actionsPerUnit'],
];

/**
 * 軸の選び方の問題。`same`は同じ列を両軸に選んだ時、`proportional`は同じテキストなら積または比が全配列で一定になる2列
 * （アクション数とアクション数/かな、距離とu/かな、u/アクションとアクション/uなど）を選んだ時。
 */
export type ScatterAxisProblem = 'same' | 'proportional';

/**
 * 2つの軸に選べるか。選べない組なら理由を返す。
 * 積または比が一定の2列は、点が1本の曲線に並ぶだけで、関係を読む図にならない。
 */
export function scatterAxisProblem(x: ComparisonColumnId, y: ComparisonColumnId): ScatterAxisProblem | undefined {
  if (x === y) return 'same';
  for (const group of PROPORTIONAL_COLUMN_GROUPS) {
    if (group.includes(x) && group.includes(y)) return 'proportional';
  }
  return undefined;
}

/** 等位線。軸の2つの量から、恒等式で決まる3つ目の量が一定になる線。 */
export interface ScatterContour {
  /** 等位線の量の列（比較表の列）。 */
  readonly column: ComparisonColumnId;
  /** 軸の値から等位線の量を求める。分母が0で決まらない点では`undefined`。 */
  readonly valueAt: (x: number, y: number) => number | undefined;
  /**
   * 点の読み取りに出す等位線の値。`columnValue`はその対象の、等位線の量の列（比較表の列）の値。
   * 列が値を持たない対象（`NaN`）では、軸の値から式で値が求まっても出さない。
   * 分母が0の時に0とする列（率）を軸に取ると、軸の値だけでは等位線の量が値を持つかを区別できないため。
   */
  readonly readoutAt: (x: number, y: number, columnValue: number) => number | undefined;
  /**
   * 細い線を引く量か。引かない組（`NO_LINE_COLUMNS`）でも、3つの量の関係は図の見方に出すので、等位線は返す。
   * 引かない組では、線の量の値を点の読み取りにも凡例にも出さない。
   */
  readonly drawsLines: boolean;
  /** 3つの量の関係の式（恒等式の`relation`）。語尾は付けない。 */
  readonly relation: string;
  /**
   * 軸と線の量のうち1かなあたりの列について、総数を入力かな数（英語のテキストでは入力字数）で割った値だという換算。語尾は付けない。
   * 1かなあたりの列が入らない組には無い。
   */
  readonly conversion: string | undefined;
  /** 等位線の量が`level`になる線が、横軸の値`x`で通る縦軸の値。通る点が無い時は`undefined`。 */
  readonly yAt: (level: number, x: number) => number | undefined;
}

/**
 * 2つの軸に引く等位線。どの恒等式の2つの量にも当たらない組、等位線の量が比較表の列に無い組には`undefined`。
 *
 * 軸の列が1かなあたりの形（アクション数/かな・u/かな）の時は、入力かな数 `inputChars` を掛けて総数の形に直して恒等式に当て、
 * 等位線の量も同じ形で返す。入力かな数は集合の全部の対象で同じ（同じテキストを使い、配列に依る前処理は1字を1字に直すだけ）。
 * - 等位線の量に総数と1かなあたりの2列がある時は、軸に1かなあたりの列が1つでもあれば1かなあたりの列、無ければ総数の列
 * - 総数の列だけがある量（同指）は、軸に1かなあたりの列がある時、1かなあたりの列が比較表に無いので引かない
 * - 1かなあたりの列だけがある量（キー数）は、軸が両方とも総数の形の時、総数の列が比較表に無いので引かない
 */
export function scatterContour(x: ComparisonColumnId, y: ComparisonColumnId, inputChars: number, language: TextLanguage): ScatterContour | undefined {
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
    // 等位線の量を出す列。1かなあたりの軸を取る時、総数だけの量は引かない
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
    const converted = [
      [x, xq, xForm],
      [y, yq, yForm],
      [outColumn, rq, outForm],
    ].flatMap(([column, quantity, form]) =>
      form === 'perChar'
        ? [`${axisName(column as ComparisonColumnId, language)}は${totalName(quantity as Quantity, language)}を入力${kanaUnitOf(language)}数で割った値`]
        : [],
    );
    const valueAt = (xv: number, yv: number): number | undefined => {
      const value = identity.solve(ri, triple({ [xi]: toTotal(xv, xForm), [yi]: toTotal(yv, yForm) }));
      return finite(value === undefined ? undefined : fromTotal(value, outForm));
    };
    return {
      column: outColumn,
      relation: identityRelation(identity, language),
      conversion: converted.length === 0 ? undefined : converted.join('、'),
      valueAt,
      readoutAt: (xv, yv, columnValue) => (Number.isFinite(columnValue) ? valueAt(xv, yv) : undefined),
      drawsLines: !NO_LINE_COLUMNS.has(outColumn),
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
