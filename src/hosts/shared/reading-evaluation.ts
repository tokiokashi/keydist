import { convertToReading, needsReading, type ReadingConditions, type ReadingToken } from '#input/text/reading.ts';
import type { ResolvedText } from '#input/text/resolve.ts';

/**
 * 漢字を読みに直す段（仕様 §4.6の1段目）の、画面側の入口。
 * 形態素解析と辞書の読み込みは計算部の外（`platform/reading/`）が行い、`app` が組み立てて注入する。
 */
export interface ReadingSource {
  /** テキストを語に分ける。辞書を読み込む前なら先に読み込み、読み込めなければ例外を投げる。 */
  tokenize(text: string): Promise<readonly ReadingToken[]>;
  /** 読みの辞書と解析器の名前・版。数値の条件に載せる。 */
  readonly conditions: Pick<ReadingConditions, 'dictionary' | 'library'>;
}

/** 1つのテキストを読みに直した結果。 */
export type ReadingOutcome = { readonly kind: 'converted'; readonly text: string } | { readonly kind: 'failed' };

/** 漢字を含む日本語のテキストを読みに直す。読み込みと解析の失敗は、値の `failed` で返す。 */
export async function convertForEvaluation(source: ReadingSource, text: string): Promise<ReadingOutcome> {
  try {
    return { kind: 'converted', text: convertToReading(text, await source.tokenize(text)).text };
  } catch {
    return { kind: 'failed' };
  }
}

/** 読みに直した結果と、それがどのテキストのものか。 */
export interface StoredReadingOutcome {
  /** ペインが選んでいるテキストの同一性（`textIdentity`）。中身の文字列ではない */
  readonly identity: string;
  readonly outcome: ReadingOutcome;
}

/**
 * ペインが選んでいるテキストの同一性。自作のテキストは資産のid、組み込みのテキストはそのid。
 * 同じテキストの編集では変わらず、別のテキストへ切り替えると変わる。
 */
export function textIdentity(resolved: ResolvedText): string {
  return `${resolved.ref.kind}:${resolved.ref.id}`;
}

/**
 * 今のテキストに使ってよい結果。同じテキストの編集では前の結果を残して読み直すが、
 * 別のテキストへ切り替えた時は前のテキストの結果を引き継がない（undefined。読み込み中と同じ扱い）。
 */
export function outcomeFor(resolved: ResolvedText, stored: StoredReadingOutcome | undefined): ReadingOutcome | undefined {
  return stored !== undefined && stored.identity === textIdentity(resolved) ? stored.outcome : undefined;
}

/** 評価に渡すテキスト。読みに直す対象のテキストは、読みの変換の条件を添える。 */
export interface PaneText extends ResolvedText {
  readonly reading?: ReadingConditions | null;
}

/**
 * ペインから見た読みの変換の状態。
 * `none` は読みに直す対象でない（漢字を含まない・英語）。`loading` は辞書を読み込み中で、評価に渡すテキストがまだ無い。
 * `failed` は辞書を読み込めず、漢字を読みに直さずに評価している。
 */
export type PaneReadingState = { readonly kind: 'none' } | { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'converted' };

export interface ReadingEvaluation {
  readonly text: PaneText;
  readonly state: PaneReadingState;
}

/**
 * 解決済みのテキストと読みの結果から、評価に渡すテキストとペインの状態を決める。
 * 結果がまだ無い（`outcome` がundefined）間は `loading`。評価に渡すテキストは原文のままだが、ペインは数値を出さない。
 */
export function evaluationText(resolved: ResolvedText, source: ReadingSource, outcome: ReadingOutcome | undefined): ReadingEvaluation {
  if (!needsReading(resolved.text, resolved.language)) return { text: resolved, state: { kind: 'none' } };
  if (outcome === undefined) return { text: resolved, state: { kind: 'loading' } };
  if (outcome.kind === 'failed') {
    return { text: { ...resolved, reading: { status: 'unavailable', ...source.conditions } }, state: { kind: 'failed' } };
  }
  return { text: { ...resolved, text: outcome.text, reading: { status: 'converted', ...source.conditions } }, state: { kind: 'converted' } };
}

/** 条件の要約に添える、数値の出どころの1項目。 */
export interface ConditionProvenanceItem {
  readonly label: string;
  readonly value: string;
}

/** 読みの変換を、条件の要約に出す項目にする。画面にはライブラリ名を出さず、辞書の名前と版だけを出す。 */
export function readingProvenance(reading: ReadingConditions | null | undefined): readonly ConditionProvenanceItem[] {
  if (reading === null || reading === undefined) return [];
  const dictionary = `${reading.dictionary.name}（${reading.dictionary.version}）`;
  return [{ label: '読みの辞書', value: reading.status === 'converted' ? dictionary : `${dictionary}を読み込めず、漢字は読みに直していません` }];
}
