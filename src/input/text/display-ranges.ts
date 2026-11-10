/**
 * 長いテキストの図を、一度に出す範囲へ分ける。範囲は表示だけの区切りで、数値の計算には使わない。
 *
 * 範囲の数は、評価に渡す字数（コードポイントの数）を1000で割って四捨五入した数で、1を下回らない。
 * 範囲の境目は、テキストを範囲の数で等分した位置に最も近い文末に置く。文の途中で図が切れないようにするため。
 * 位置は、評価に渡したテキストの文字位置で、先頭が0。
 */

/** 1つの範囲の目安の字数。 */
export const TEXT_RANGE_CHARS = 1000;

/** 評価に渡す字数から、範囲の数を求める。 */
export function textRangeCount(inputChars: number): number {
  return Math.max(1, Math.round(inputChars / TEXT_RANGE_CHARS));
}

/** 文を終える文字。 */
const FULL_WIDTH_ENDS = new Set(['。', '．', '！', '？']);
/** 後ろが空白・閉じ括弧・テキストの終わりの時だけ文を終える文字。`3.14` や `e.g.` のような文の途中の記号で切らない。 */
const HALF_WIDTH_ENDS = new Set(['.', '!', '?']);
/** 文を終える文字の直後に付いて、同じ文に属する閉じ括弧と引用符。 */
const CLOSERS = new Set(['」', '』', '）', '】', '〕', '］', '｝', '〉', '》', ')', ']', '}', '"', "'", '”', '’']);

function isSpace(char: string): boolean {
  return /^\s$/u.test(char);
}

/**
 * 文末の位置の昇順の列。位置`e`は、`e`の直前までが1つ以上の文で終わることを表す。
 * 文を終える文字に、直後の閉じ括弧と空白（改行を含む）までを前の文として含める。改行も文を終える。
 * 先頭（0）とテキストの終わりは含めない。
 */
export function sentenceEnds(text: string): number[] {
  const chars = [...text];
  const ends: number[] = [];
  let at = 0;
  while (at < chars.length) {
    const char = chars[at]!;
    const next = chars[at + 1];
    const ending =
      FULL_WIDTH_ENDS.has(char) ||
      char === '\n' ||
      char === '\r' ||
      (HALF_WIDTH_ENDS.has(char) && (next === undefined || isSpace(next) || CLOSERS.has(next)));
    at++;
    if (!ending) continue;
    while (at < chars.length && CLOSERS.has(chars[at]!)) at++;
    while (at < chars.length && isSpace(chars[at]!)) at++;
    if (at < chars.length) ends.push(at);
  }
  return ends;
}

/**
 * 範囲の境目の列。先頭は0、最後は`inputChars`で、`i`番目の範囲は`[bounds[i], bounds[i + 1])`。
 * 内側の境目は、等分した位置に最も近い文末（`ends`）に置き、同じ距離なら前の文末を採る。文末が1つも無ければ等分した位置に置く。
 * 1つの文が等分した位置の複数にまたがる時は、境目を1つにまとめるので、範囲の数が`textRangeCount`より少なくなる。
 */
export function rangeBoundsOf(inputChars: number, ends: readonly number[]): number[] {
  const count = textRangeCount(inputChars);
  const bounds = [0];
  let after = 0;
  for (let index = 1; index < count; index++) {
    const target = (index * inputChars) / count;
    // 等分した位置以上で最初の文末。目標は増えていくので、前の位置から数え続ける
    while (after < ends.length && ends[after]! < target) after++;
    const before = ends[after - 1];
    const following = ends[after];
    let bound: number;
    if (before === undefined && following === undefined) bound = Math.round(target);
    else if (before === undefined) bound = following!;
    else if (following === undefined) bound = before;
    else bound = target - before <= following - target ? before : following;
    if (bound > bounds[bounds.length - 1]! && bound < inputChars) bounds.push(bound);
  }
  bounds.push(inputChars);
  return bounds;
}

/** 評価に渡したテキストの範囲の境目（`rangeBoundsOf`）。 */
export function textRangeBounds(text: string): number[] {
  return rangeBoundsOf([...text].length, sentenceEnds(text));
}
