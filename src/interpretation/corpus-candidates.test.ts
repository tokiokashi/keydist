import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRepeatCandidates, type Candidate } from './corpus-candidates.ts';
import type { RunEdges } from './corpus-ngram.ts';
import { createMulberry32 } from './prng.ts';
import { buildLcpArray, buildSuffixArray } from './suffix-array.ts';

/** 部分文字列を全部数える参照実装。走りごとに、始まりの位置から全部の長さを調べる。 */
function bruteForce(
  runs: readonly (readonly string[])[],
  unitRuns: readonly (readonly string[])[],
  runEdges: readonly RunEdges[],
  minCount: number,
  chapterStarts: readonly number[],
): Candidate[] {
  interface Occurrence {
    run: number;
    start: number;
    chapter: number;
  }
  const occurrences = new Map<string, Occurrence[]>();
  const unitStarts = unitRuns.map((units, index) => {
    const set = new Set<number>();
    let offset = 0;
    for (const unit of units) {
      set.add(offset);
      offset += [...unit].length;
    }
    set.add(offset);
    if (!runEdges[index]!.start) set.delete(0);
    if (!runEdges[index]!.end) set.delete(offset);
    return set;
  });
  let consumed = 0;
  for (const [run, chars] of runs.entries()) {
    for (let start = 0; start < chars.length; start++) {
      const chapter = chapterStarts.filter((at) => at <= consumed + start).length;
      for (let end = start + 1; end <= chars.length; end++) {
        const text = chars.slice(start, end).join('');
        const list = occurrences.get(text) ?? [];
        list.push({ run, start, chapter });
        occurrences.set(text, list);
      }
    }
    consumed += chars.length;
  }
  const sizes = new Array<number>(chapterStarts.length + 1).fill(0);
  let position = 0;
  for (const chars of runs) {
    for (let i = 0; i < chars.length; i++) {
      sizes[chapterStarts.filter((at) => at <= position).length]!++;
      position++;
    }
  }
  const all = sizes.reduce((sum, size) => sum + size, 0);
  const result: Candidate[] = [];
  for (const [text, list] of occurrences) {
    if (list.length < minCount) continue;
    const length = [...text].length;
    // 左右に1文字伸ばした文字列ごとの出現回数。走りの端は伸ばせないので別の記号
    const left = new Map<string, number>();
    const right = new Map<string, number>();
    for (const { run, start } of list) {
      const chars = runs[run]!;
      const l = start === 0 ? '' : chars[start - 1]!;
      const r = start + length === chars.length ? '' : chars[start + length]!;
      left.set(l, (left.get(l) ?? 0) + 1);
      right.set(r, (right.get(r) ?? 0) + 1);
    }
    // 伸ばして出現回数が減るのは、どの伸ばし方でも全部の出現が同じ文字になる場合を除いた時
    if (left.size === 1 && !left.has('')) continue;
    if (right.size === 1 && !right.has('')) continue;
    const entropy = (map: Map<string, number>): number => {
      let sum = 0;
      for (const count of map.values()) sum -= (count / list.length) * Math.log2(count / list.length);
      return sum === 0 ? 0 : sum;
    };
    const aligned = list.filter(({ run, start }) => unitStarts[run]!.has(start) && unitStarts[run]!.has(start + length)).length;
    const perChapter = new Map<number, number>();
    for (const { chapter } of list) perChapter.set(chapter, (perChapter.get(chapter) ?? 0) + 1);
    let sum = 0;
    for (const [index, size] of sizes.entries()) sum += Math.abs((perChapter.get(index) ?? 0) / list.length - size / all);
    const dp = sum / 2;
    result.push({
      text,
      length,
      count: list.length,
      leftKinds: left.size,
      rightKinds: right.size,
      leftEntropy: entropy(left),
      rightEntropy: entropy(right),
      alignedRatio: aligned / list.length,
      dispersion: { chaptersPresent: perChapter.size, dp, dpNormalized: dp / (1 - Math.min(...sizes.map((size) => size / all))) },
    });
  }
  return result.sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

function randomInput(seed: number): { runs: string[][]; units: string[][]; runEdges: RunEdges[]; chapterStarts: number[] } {
  const random = createMulberry32(seed);
  const alphabet = 'あいう'.slice(0, 2 + Math.floor(random() * 2));
  const runs: string[][] = [];
  const units: string[][] = [];
  const runEdges: RunEdges[] = [];
  const runCount = 1 + Math.floor(random() * 4);
  let total = 0;
  for (let r = 0; r < runCount; r++) {
    const length = 1 + Math.floor(random() * 30);
    const chars = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]!);
    const parts: string[] = [];
    let current = '';
    for (const char of chars) {
      if (current !== '' && random() < 0.3) {
        parts.push(current);
        current = '';
      }
      current += char;
    }
    parts.push(current);
    runs.push(chars);
    units.push(parts);
    runEdges.push({ start: random() < 0.5, end: random() < 0.5 });
    total += length;
  }
  const chapterStarts = [Math.floor(total / 3), Math.floor((total * 2) / 3)].filter((at, i, all) => at > 0 && at !== all[i - 1]);
  return { runs, units, runEdges, chapterStarts };
}

test('候補: 小さな列で、全部分文字列を数える参照実装と、文字列・統計量・並びが一致する', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { runs, units, runEdges, chapterStarts } = randomInput(seed);
    for (const minCount of [2, 3]) {
      const actual = extractRepeatCandidates(runs, units, { minCount, chapterStarts, runEdges }).candidates;
      const expected = bruteForce(runs, units, runEdges, minCount, chapterStarts);
      assert.equal(actual.length, expected.length, `seed ${seed} minCount ${minCount}`);
      for (const [index, candidate] of actual.entries()) {
        const want = expected[index]!;
        assert.equal(candidate.text, want.text, `seed ${seed}`);
        assert.equal(candidate.count, want.count);
        assert.equal(candidate.leftKinds, want.leftKinds);
        assert.equal(candidate.rightKinds, want.rightKinds);
        assert.ok(Math.abs(candidate.leftEntropy - want.leftEntropy) < 1e-9);
        assert.ok(Math.abs(candidate.rightEntropy - want.rightEntropy) < 1e-9);
        assert.equal(candidate.alignedRatio, want.alignedRatio);
        assert.equal(candidate.dispersion!.chaptersPresent, want.dispersion!.chaptersPresent);
        assert.ok(Math.abs(candidate.dispersion!.dp - want.dispersion!.dp) < 1e-9);
        assert.ok(Math.abs(candidate.dispersion!.dpNormalized - want.dispersion!.dpNormalized) < 1e-9);
      }
    }
  }
});

test('候補: 手で数えた例。走りをまたぐ文字列を出さず、走りの端は左右の種類に1つ数える', () => {
  // 走りは「あいう」「あいえ」「あいう」。「あい」は3回で、左は走りの端だけ、右はうとえ。「あいう」は2回
  const runs = [
    ['あ', 'い', 'う'],
    ['あ', 'い', 'え'],
    ['あ', 'い', 'う'],
  ];
  const units = [['あいう'], ['あい', 'え'], ['あ', 'いう']];
  const allEdges = runs.map(() => ({ start: true, end: true }));
  const { candidates } = extractRepeatCandidates(runs, units, { minCount: 2, chapterStarts: [], runEdges: allEdges });
  assert.deepEqual(
    candidates.map((c) => [c.text, c.count]),
    [
      ['あい', 3],
      ['あいう', 2],
    ],
  );
  const ai = candidates[0]!;
  assert.equal(ai.leftKinds, 1);
  assert.equal(ai.leftEntropy, 0);
  assert.equal(ai.rightKinds, 2);
  assert.ok(Math.abs(ai.rightEntropy - (-(2 / 3) * Math.log2(2 / 3) - (1 / 3) * Math.log2(1 / 3))) < 1e-12);
  // 「あい」の出現のうち、始まりと終わりがどちらも文節の境界にそろうのは、文節「あい」の2つ目だけ（1つ目は文節「あいう」の途中で終わり、3つ目は文節「いう」の途中で終わる）
  assert.equal(ai.alignedRatio, 1 / 3);
  // 「あいう」の出現は1つ目（文節「あいう」）と3つ目（文節「あ」「いう」の終わり）。1つ目の走りの終わりが境界でなければ、そろうのは3つ目だけ
  assert.equal(candidates[1]!.alignedRatio, 1);
  const open = extractRepeatCandidates(runs, units, {
    minCount: 2,
    chapterStarts: [],
    runEdges: [{ start: true, end: false }, allEdges[1]!, allEdges[2]!],
  });
  assert.equal(open.candidates[1]!.alignedRatio, 1 / 2);
});

test('接尾辞配列とLCP配列: 全接尾辞を直接並べた結果と一致する', () => {
  const random = createMulberry32(7);
  for (let round = 0; round < 100; round++) {
    const length = 1 + Math.floor(random() * 60);
    const symbols = Int32Array.from({ length }, () => Math.floor(random() * 3));
    const sa = buildSuffixArray(symbols, 3);
    const suffixes = Array.from({ length }, (_, i) => i).sort((a, b) => {
      for (let k = 0; ; k++) {
        if (a + k >= length || b + k >= length) return a + k >= length ? -1 : 1;
        if (symbols[a + k] !== symbols[b + k]) return symbols[a + k]! - symbols[b + k]!;
      }
    });
    assert.deepEqual([...sa], suffixes);
    const lcp = buildLcpArray(symbols, sa);
    for (let i = 1; i < length; i++) {
      let h = 0;
      while (sa[i]! + h < length && sa[i - 1]! + h < length && symbols[sa[i]! + h] === symbols[sa[i - 1]! + h]) h++;
      assert.equal(lcp[i], h);
    }
  }
});
