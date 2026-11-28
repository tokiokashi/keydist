import { buildLcpArray, buildSuffixArray, forEachLcpInterval } from './suffix-array.ts';

/**
 * コーパスの、繰り返し現れる文字列（極大な繰り返し）の一覧と統計量（定義は`docs/corpus-ngram.md`の「文字列の候補の一覧」）。
 * かなの系列の走りごとの列と、文節の読みの系列を受け取る。配列の定義と品詞を参照しない。
 */

/** 候補にする出現回数の下限。結果を見る前に固定した。 */
export const CANDIDATE_MIN_COUNT = 5;

export interface CandidateOptions {
  /** 出現回数の下限 */
  readonly minCount: number;
  /** 章の始まりのかなの位置（全走りをつないだ列の先頭からのコードポイント数。昇順）。章の数は長さ+1 */
  readonly chapterStarts: readonly number[];
}

/** 章の間の分散指標（Gries 2008のDP）。 */
export interface ChapterDispersion {
  /** 出現がある章の数 */
  readonly chaptersPresent: number;
  /** DP = ½ Σ |章の出現の割合 − 章の大きさの割合|。0（章の大きさどおりに散らばる）から1未満 */
  readonly dp: number;
  /** DP / (1 − 最小の章の大きさの割合)。最大が1になるように直した値 */
  readonly dpNormalized: number;
}

export interface Candidate {
  readonly text: string;
  /** かなの数（コードポイント） */
  readonly length: number;
  /** 出現回数（重なる出現も別に数える） */
  readonly count: number;
  /** 左に来る文字の種類の数（走りの端は1種類に数える） */
  readonly leftKinds: number;
  readonly rightKinds: number;
  /** 左に来る文字の分布のエントロピー（ビット） */
  readonly leftEntropy: number;
  readonly rightEntropy: number;
  /** 始まりと終わりがどちらも文節の境界にそろう出現の割合 */
  readonly alignedRatio: number;
  /** 章の始まりを渡さなかった時はundefined */
  readonly dispersion: ChapterDispersion | undefined;
}

export interface CandidateResult {
  readonly candidates: readonly Candidate[];
  /** つないだ列の長さ（かなの数。走りの区切りの記号を除く） */
  readonly units: number;
  /** 章ごとのかなの数。章の始まりを渡さなければ空 */
  readonly chapterSizes: readonly number[];
}

function entropyOf(counts: Iterable<number>, total: number): number {
  let sum = 0;
  for (const count of counts) {
    const p = count / total;
    sum -= p * Math.log2(p);
  }
  // 1種類の時は-0でなく0にする
  return sum === 0 ? 0 : sum;
}

/**
 * 出現回数が`minCount`以上の極大な繰り返しを、出現回数の降順（同じなら文字列のコードユニット順）に返す。
 * 極大な繰り返しは、左に1文字伸ばしても、右に1文字伸ばしても出現回数が減る文字列。走りの端は、伸ばせないので減る側に数える。
 * 走りをまたぐ文字列は作らない。
 *
 * `kanaRuns`は走りごとのかなの列、`unitRuns`は同じ走りを文節の読みで分けた列（つなぐと`kanaRuns`の走りに戻る）。
 */
export function extractRepeatCandidates(
  kanaRuns: readonly (readonly string[])[],
  unitRuns: readonly (readonly string[])[],
  options: CandidateOptions,
): CandidateResult {
  if (kanaRuns.length !== unitRuns.length) throw new Error('かなの走りと文節の走りの数が違う');
  const ids = new Map<string, number>();
  for (const run of kanaRuns) for (const char of run) if (!ids.has(char)) ids.set(char, ids.size);
  const chars = [...ids.keys()].sort();
  for (const [index, char] of chars.entries()) ids.set(char, index);
  const base = chars.length;

  // 走りごとに、前に区切りの記号を1つ置き、最後に1つ置く。区切りの記号は1つずつ別の値にするので、繰り返しが走りをまたがない
  let total = 1;
  for (const run of kanaRuns) total += run.length + 1;
  const symbols = new Int32Array(total);
  const unitStart = new Uint8Array(total);
  const chapterOf = new Int32Array(total);
  const chapterSizes = new Array<number>(options.chapterStarts.length + 1).fill(0);
  let position = 0;
  let unitCount = 0;
  let chapter = 0;
  for (const [runIndex, run] of kanaRuns.entries()) {
    symbols[position] = base + runIndex;
    unitStart[position] = 1;
    chapterOf[position] = chapter;
    position++;
    const starts = new Set<number>();
    let offset = 0;
    for (const unit of unitRuns[runIndex]!) {
      starts.add(offset);
      offset += [...unit].length;
    }
    if (offset !== run.length) throw new Error('文節の読みをつなぐと、かなの走りにならない');
    for (const [offsetInRun, char] of run.entries()) {
      while (chapter < options.chapterStarts.length && options.chapterStarts[chapter]! <= unitCount) chapter++;
      symbols[position] = ids.get(char)!;
      unitStart[position] = starts.has(offsetInRun) ? 1 : 0;
      chapterOf[position] = chapter;
      chapterSizes[chapter]!++;
      position++;
      unitCount++;
    }
  }
  symbols[position] = base + kanaRuns.length;
  unitStart[position] = 1;
  chapterOf[position] = chapter;

  const sa = buildSuffixArray(symbols, base + kanaRuns.length + 1);
  const lcp = buildLcpArray(symbols, sa);
  const hasChapters = options.chapterStarts.length > 0;
  const minShare = Math.min(...chapterSizes.map((size) => size / unitCount));

  const candidates: Candidate[] = [];
  forEachLcpInterval(lcp, ({ lcp: length, left, right }) => {
    const count = right - left + 1;
    if (count < options.minCount) return;
    // 左に極大か。区切りの記号は走りごとに別の値なので、走りの端にある出現は、ほかの出現と左が違う
    const first = symbols[sa[left]! - 1]!;
    let leftMaximal = false;
    for (let i = left + 1; i <= right; i++) {
      if (symbols[sa[i]! - 1] !== first) {
        leftMaximal = true;
        break;
      }
    }
    if (!leftMaximal) return;

    const leftCounts = new Map<number, number>();
    const rightCounts = new Map<number, number>();
    const perChapter = new Map<number, number>();
    let aligned = 0;
    // 分布では、走りの端（区切りの記号）を1つの記号にまとめる
    const bump = (map: Map<number, number>, symbol: number): void => {
      const key = symbol >= base ? -1 : symbol;
      map.set(key, (map.get(key) ?? 0) + 1);
    };
    for (let i = left; i <= right; i++) {
      const at = sa[i]!;
      bump(leftCounts, symbols[at - 1]!);
      bump(rightCounts, symbols[at + length]!);
      if (unitStart[at] === 1 && unitStart[at + length] === 1) aligned++;
      if (hasChapters) perChapter.set(chapterOf[at]!, (perChapter.get(chapterOf[at]!) ?? 0) + 1);
    }
    let dispersion: ChapterDispersion | undefined;
    if (hasChapters) {
      let sum = 0;
      for (const [index, size] of chapterSizes.entries()) sum += Math.abs((perChapter.get(index) ?? 0) / count - size / unitCount);
      const dp = sum / 2;
      dispersion = { chaptersPresent: perChapter.size, dp, dpNormalized: dp / (1 - minShare) };
    }
    let text = '';
    for (let i = 0; i < length; i++) text += chars[symbols[sa[left]! + i]!];
    candidates.push({
      text,
      length,
      count,
      leftKinds: leftCounts.size,
      rightKinds: rightCounts.size,
      leftEntropy: entropyOf(leftCounts.values(), count),
      rightEntropy: entropyOf(rightCounts.values(), count),
      alignedRatio: aligned / count,
      dispersion,
    });
  });
  candidates.sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  return { candidates, units: unitCount, chapterSizes: hasChapters ? chapterSizes : [] };
}
