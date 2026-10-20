import { generateEngineTrace } from '#engine/pipeline.ts';
import type { ResolvedInput } from '#engine/resolved-input.ts';
import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
import { analysisTargetKey, type AnalysisTarget, type Setup } from '#input/setup/index.ts';
import { candidatesFor, type ReadingCandidateTable } from '#input/text/reading-candidates.ts';
import type { ReadingWord } from '#input/text/reading.ts';
import type { PaneText } from './reading-evaluation.ts';
import { resolvePaneInput, type PaneCatalog } from './resolve-pane-input.ts';

/** 読みを見て直す画面に並べる1語。 */
export interface OrderedReadingWord {
  readonly word: ReadingWord;
  /** 選べる候補の読み。表の読みと辞書の読み。候補が1つ以下なら選ぶ欄を出さない */
  readonly candidates: readonly string[];
  /** 候補の打鍵数の変わり方。比べている配列ごとの「最大−最小」のうちの最大。候補が2つ未満なら0 */
  readonly spread: number;
}

/**
 * 語を並べる。読みが複数ある語（候補が2つ以上）を、読み違えた時の打鍵数の変わり方が大きい順に先に並べ、
 * 残りの語は出現の順に続ける。変わり方が同じ語は出現の順を保つ。
 *
 * `strokeCounts`は、読み1つを単独のテキストとして評価した打鍵数を、比べている配列ごとに返す。
 * 並びは配列の集まり全体で1つに決まる（ペインごとには変えない）。
 */
export function orderReadingWords(
  words: readonly ReadingWord[],
  table: ReadingCandidateTable,
  strokeCounts: (reading: string) => readonly number[],
): OrderedReadingWord[] {
  const ordered = words.map((word): OrderedReadingWord => {
    const candidates = candidatesFor(table, word.surface, word.dictionaryReadings);
    if (candidates.length < 2) return { word, candidates, spread: 0 };
    const counts = candidates.map(strokeCounts);
    let spread = 0;
    for (let layout = 0; layout < (counts[0]?.length ?? 0); layout++) {
      const values = counts.map((row) => row[layout]!);
      spread = Math.max(spread, Math.max(...values) - Math.min(...values));
    }
    return { word, candidates, spread };
  });
  const multi = ordered.filter((entry) => entry.candidates.length >= 2);
  const rest = ordered.filter((entry) => entry.candidates.length < 2);
  // 配列の`sort`は安定なので、変わり方が同じ語は出現の順のまま
  multi.sort((a, b) => b.spread - a.spread);
  return [...multi, ...rest];
}

/**
 * 比べている配列（対象）ごとの打鍵数を数える関数を作る。各ペインのSetupの条件で入力を1度だけ解決し、
 * 読みを単独のテキストとして評価する。解決できない対象（配列が見つからない、テキストの言語に使えないなど）は
 * 数えない（そのペインも数値を出していない）。
 */
export function createStrokeCounter(
  targets: readonly AnalysisTarget[],
  setups: ReadonlyMap<string, Setup>,
  catalog: PaneCatalog,
  overrides: SettingsCascadeOverrides,
  text: PaneText,
): (reading: string) => readonly number[] {
  const seen = new Set<string>();
  const inputs: ResolvedInput[] = [];
  for (const target of targets) {
    const key = analysisTargetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    const resolved = resolvePaneInput(target, setups, catalog, overrides, { ...text, text: 'あ', reading: null });
    if (resolved.ok) inputs.push(resolved.input);
  }
  return (reading) => inputs.map((input) => generateEngineTrace({ ...input, text: reading }).trace.strokes.length);
}
