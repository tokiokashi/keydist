import { createMulberry32 } from './prng.ts';
import type { NgramTables } from './ngram-table.ts';

/**
 * 2次マルコフ連鎖で、元のテキストと同じ文字数の文を作る（定義は `docs/kana-chain-comparison.md`）。
 * 連鎖は2次の表（連続3文字の並びの出現回数）の、直前の2文字（文脈）から次の1文字の出現回数。
 * 乱数は `prng.ts` の名前のある生成器で、同じ表・始まり・文字数・種からは同じ文が出る。
 */

/** 重み付きの候補。`cumulative` は候補の出現回数の累積。 */
interface Weighted {
  readonly keys: readonly string[];
  readonly cumulative: readonly number[];
  readonly total: number;
}

function weightedOf(entries: readonly (readonly [string, number])[]): Weighted {
  const sorted = [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let total = 0;
  const cumulative: number[] = [];
  for (const [, count] of sorted) {
    total += count;
    cumulative.push(total);
  }
  return { keys: sorted.map(([key]) => key), cumulative, total };
}

/** 出現回数の重みで1つ引く。候補は鍵の昇順に並べてあるので、表の作り方によらず同じ乱数から同じ候補を引く。 */
function draw(weighted: Weighted, random: () => number): string {
  const target = random() * weighted.total;
  let low = 0;
  let high = weighted.cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (weighted.cumulative[middle]! > target) high = middle;
    else low = middle + 1;
  }
  return weighted.keys[low]!;
}

export interface MarkovChain {
  /** 文脈（2文字）ごとの、次の1文字の候補 */
  readonly next: ReadonlyMap<string, Weighted>;
  /** 1文字目ごとの、その文字から始まる文脈（2文字）の候補。重みは文脈の出現回数 */
  readonly contextsByFirst: ReadonlyMap<string, Weighted>;
  /** 全体の文脈（2文字）の候補。重みは文脈の出現回数 */
  readonly contexts: Weighted;
}

/** 2次の表から連鎖を作る。2次の表が空なら例外を投げる。 */
export function buildMarkovChain(tables: NgramTables): MarkovChain {
  const triples = tables[2];
  if (triples === undefined || triples.size === 0) throw new Error('2次の表が空で、連鎖を作れない');
  const nextEntries = new Map<string, [string, number][]>();
  const contextCounts = new Map<string, number>();
  for (const [key, count] of triples) {
    const chars = [...key];
    const context = chars[0]! + chars[1]!;
    const list = nextEntries.get(context) ?? [];
    list.push([chars[2]!, count]);
    nextEntries.set(context, list);
    contextCounts.set(context, (contextCounts.get(context) ?? 0) + count);
  }
  const next = new Map<string, Weighted>();
  for (const [context, list] of nextEntries) next.set(context, weightedOf(list));
  const byFirst = new Map<string, [string, number][]>();
  for (const [context, count] of contextCounts) {
    const first = [...context][0]!;
    const list = byFirst.get(first) ?? [];
    list.push([context, count]);
    byFirst.set(first, list);
  }
  const contextsByFirst = new Map<string, Weighted>();
  for (const [first, list] of byFirst) contextsByFirst.set(first, weightedOf(list));
  return { next, contextsByFirst, contexts: weightedOf([...contextCounts]) };
}

export interface MarkovGeneration {
  readonly text: string;
  /** 生成の段の数。3文字目以降の、次の文字を決める操作1回が1段 */
  readonly steps: number;
  /** 文脈に続く文字の種類が1つしか無かった段の数 */
  readonly singleCandidateSteps: number;
  /** 候補が無い文脈で、直前の1文字から始まる文脈を引いて続けた段の数 */
  readonly continuedByLastChar: number;
  /** それも無く、全体から文脈を引いて続けた段の数 */
  readonly continuedFromWhole: number;
}

/**
 * 生成文を作る。最初の2文字は `start`（元のテキストの最初の2文字）、文字数は `length`。
 *
 * 文脈（直前の2文字）に続く文字があれば、出現回数の重みで1つ引く。
 * 無ければ、直前の1文字から始まる文脈を出現回数の重みで1つ引き、その文脈の2文字目を続ける。
 * それも無ければ、文脈を全体から出現回数の重みで1つ引き、その2文字を続ける（文字数を超える分は切る）。
 */
export function generateMarkovText(chain: MarkovChain, start: string, length: number, seed: number): MarkovGeneration {
  const startChars = [...start];
  if (length < 2 || startChars.length < 2) {
    return { text: startChars.slice(0, Math.max(0, length)).join(''), steps: 0, singleCandidateSteps: 0, continuedByLastChar: 0, continuedFromWhole: 0 };
  }
  const random = createMulberry32(seed);
  const out: string[] = [startChars[0]!, startChars[1]!];
  let steps = 0;
  let singleCandidateSteps = 0;
  let continuedByLastChar = 0;
  let continuedFromWhole = 0;
  while (out.length < length) {
    const last = out[out.length - 1]!;
    const context = out[out.length - 2]! + last;
    steps++;
    const candidates = chain.next.get(context);
    if (candidates !== undefined) {
      if (candidates.keys.length === 1) singleCandidateSteps++;
      out.push(draw(candidates, random));
      continue;
    }
    const sameFirst = chain.contextsByFirst.get(last);
    if (sameFirst !== undefined) {
      continuedByLastChar++;
      out.push([...draw(sameFirst, random)][1]!);
      continue;
    }
    continuedFromWhole++;
    const [first, second] = [...draw(chain.contexts, random)];
    out.push(first!);
    if (out.length < length) out.push(second!);
  }
  return { text: out.join(''), steps, singleCandidateSteps, continuedByLastChar, continuedFromWhole };
}
