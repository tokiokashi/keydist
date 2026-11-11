import type { ComboSetConditions } from '#interpretation/metrics.ts';
import type { SegmentationOrigin } from '#input/text/segmentation.ts';
import {
  convertToReading,
  listReadingWords,
  needsReading,
  NO_WORD_READINGS,
  type NotationExcess,
  type ReadingConditions,
  type ReadingCorrections,
  type ReadingToken,
  type ReadingWord,
} from '#input/text/reading.ts';
import { NO_RESOLVED_WORD_CORRECTIONS, resolveWordCorrections, type ResolvedWordCorrections } from '#input/text/word-reading.ts';
import type { ReadingCandidateTable } from '#input/text/reading-candidates.ts';
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
  /** 読みを選ぶ候補の表を読み込む。最初に呼ばれるまで通信せず、読み込めなければ例外を投げる。 */
  loadCandidates(): Promise<ReadingCandidateTable>;
}

/**
 * 1つのテキストを解析した結果。語の列を持ち、利用者の直しはここへ後から当てる
 * （直しを変えても解析し直さない）。`sourceText`は解析した時点の原文。
 */
export type ReadingOutcome =
  | { readonly kind: 'analyzed'; readonly sourceText: string; readonly tokens: readonly ReadingToken[] }
  | { readonly kind: 'failed' };

/** 漢字を含む日本語のテキストを解析する。読み込みと解析の失敗、語の位置が原文と合わない結果は、値の`failed`で返す。 */
export async function analyzeForEvaluation(source: ReadingSource, text: string): Promise<ReadingOutcome> {
  try {
    const tokens = await source.tokenize(text);
    convertToReading(text, tokens);
    return { kind: 'analyzed', sourceText: text, tokens };
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
  /** 読みに置き換えた語の、表記の字数と読みの字数の差（仕様 §11.5の `W`）。読みに直した時だけ持つ。無ければ差は0 */
  readonly notationExcess?: NotationExcess;
  /** 文節の区切りを作る材料。漢字を読みに直した時だけ持つ（語の列が要る）。それ以外は `segmentationBasisOf` が作る。 */
  readonly segmentationBasis?: SegmentationBasis;
}

/** 計算に入れたコンボの組を、条件の要約に出す項目にする（仕様 §12.3）。 */
export function comboSetProvenance(comboSet: ComboSetConditions | undefined): readonly ConditionProvenanceItem[] {
  if (comboSet === undefined) return [];
  return [{ label: 'コンボの組', value: comboSetText(comboSet) }];
}

function comboSetText(comboSet: ComboSetConditions): string {
  const dropped = comboSet.dropped > 0 ? `。${comboSet.dropped}件は計算に入れていません` : '';
  return `${comboSet.name}（${comboSet.combos.length}件を計算に入れて測定${dropped}）`;
}

/**
 * 複数の対象を持つペインの、コンボの組の項目。全対象が同じ組・同じ件数なら1つの値で、
 * 対象ごとに違う時（組を使わない対象が混ざる時を含む）は、組を使う対象を「対象の名前: 組」の形で並べる。
 */
export function comboSetProvenanceOfTargets(
  entries: readonly { readonly targetName: string; readonly comboSet: ComboSetConditions | undefined }[],
): readonly ConditionProvenanceItem[] {
  const used = entries.flatMap((entry) => (entry.comboSet === undefined ? [] : [{ targetName: entry.targetName, text: comboSetText(entry.comboSet) }]));
  if (used.length === 0) return [];
  if (used.length === entries.length && used.every((item) => item.text === used[0]!.text)) return [{ label: 'コンボの組', value: used[0]!.text }];
  return [{ label: 'コンボの組', value: used.map((item) => `${item.targetName}: ${item.text}`).join('、') }];
}

/**
 * 文節の区切りを作る材料。分割器は原文に当てて、区切りを語の境目へ寄せ、利用者の読みの直しを当てた読みのテキストの位置へ写す
 * （`input/text/segmentation.ts`）。語の列が無い（漢字を含まない・辞書を読み込めなかった）時の `tokens` は空。
 */
export interface SegmentationBasis {
  readonly sourceText: string;
  readonly tokens: readonly ReadingToken[];
  readonly corrections: ReadingCorrections;
  /** 語ごとの直しを当てた語の番号（語の列の添字）→ 読み */
  readonly wordReadings: ReadonlyMap<number, string>;
  readonly origin: SegmentationOrigin;
}

/**
 * ペインから見た読みの変換の状態。
 * `none` は読みに直す対象でない（漢字を含まない・英語）。`loading` は辞書を読み込み中で、評価に渡すテキストがまだ無い。
 * `failed` は辞書を読み込めず、漢字を読みに直さずに評価している。
 */
export type PaneReadingState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'bodyFailed' }
  | { readonly kind: 'converted' };

/**
 * 辞書の読み込みが済むまで、ペインは計算を依頼せず、数値も出さない。
 * 評価に渡すテキストは原文のままなので、漢字を打てない文字に数えた暫定の数値になってしまうため。
 * 組み込みテキストの本文を読み込めなかった時（`bodyFailed`）も、本文が空のまま数値を出さないよう、計算を依頼しない。
 * 読みの状態を持たない画面（`undefined`）と、読みを要さないテキスト・辞書の読み込みに失敗したテキストは待たない。
 */
export function isWaitingForReading(reading: PaneReadingState | undefined): boolean {
  return reading?.kind === 'loading' || reading?.kind === 'bodyFailed';
}

export interface ReadingEvaluation {
  readonly text: PaneText;
  readonly state: PaneReadingState;
  /** 読みを見て直せる語（表記ごと）。読みに直した時だけ持つ */
  readonly words: readonly ReadingWord[];
  /** 語ごとの直しの当て方の結果。読みに直した時だけ持つ（辞書を読み込めない時と読み込み中は、語の列が無いので空） */
  readonly wordCorrections: ResolvedWordCorrections;
}

/**
 * 解決済みのテキストと読みの結果から、評価に渡すテキストとペインの状態を決める。
 * 結果がまだ無い（`outcome` がundefined）間は `loading`。評価に渡すテキストは原文のままだが、ペインは数値を出さない。
 */
export function evaluationText(resolved: ResolvedText, source: ReadingSource, outcome: ReadingOutcome | undefined): ReadingEvaluation {
  if (!needsReading(resolved.text, resolved.language))
    return { text: resolved, state: { kind: 'none' }, words: [], wordCorrections: NO_RESOLVED_WORD_CORRECTIONS };
  if (outcome === undefined) return { text: resolved, state: { kind: 'loading' }, words: [], wordCorrections: NO_RESOLVED_WORD_CORRECTIONS };
  if (outcome.kind === 'failed') {
    // 語の列が無いので直しを当てない
    return {
      text: {
        ...resolved,
        reading: { status: 'unavailable', ...source.conditions, corrections: [] },
      },
      state: { kind: 'failed' },
      words: [],
      wordCorrections: NO_RESOLVED_WORD_CORRECTIONS,
    };
  }
  const wordCorrections = resolveWordCorrections(outcome.sourceText, outcome.tokens, resolved.wordReadingCorrections);
  const conversion = convertToReading(outcome.sourceText, outcome.tokens, resolved.readingCorrections, wordCorrections.readings);
  return {
    text: {
      ...resolved,
      text: conversion.text,
      reading: {
        status: 'converted',
        ...source.conditions,
        corrections: conversion.appliedCorrections,
        // 語ごとの直しが当たらなかった数値は項目を持たない（直していない数値のスナップショットとキャッシュのキーを変えない）
        ...(wordCorrections.applied.length === 0 ? {} : { wordCorrections: wordCorrections.applied }),
      },
      notationExcess: conversion.notationExcess,
      segmentationBasis: {
        sourceText: outcome.sourceText,
        tokens: outcome.tokens,
        corrections: resolved.readingCorrections,
        wordReadings: wordCorrections.readings,
        origin: 'dictionary',
      },
    },
    state: { kind: 'converted' },
    words: listReadingWords(outcome.tokens),
    wordCorrections,
  };
}

/** 条件の要約に添える、数値の出どころの1項目。 */
export interface ConditionProvenanceItem {
  readonly label: string;
  readonly value: string;
}

/** 直した表記の数と語の数の言い方。0の方は言わない（「2表記と3語」「2表記」「3語」）。 */
export function correctionCountText(surfaces: number, words: number): string {
  const parts = [...(surfaces > 0 ? [`${surfaces}表記`] : []), ...(words > 0 ? [`${words}語`] : [])];
  return parts.join('と');
}

/** 読みの変換を、条件の要約に出す項目にする。画面にはライブラリ名を出さず、辞書の名前と版だけを出す。 */
export function readingProvenance(reading: ReadingConditions | null | undefined): readonly ConditionProvenanceItem[] {
  if (reading === null || reading === undefined) return [];
  const dictionary = `${reading.dictionary.name}（${reading.dictionary.version}）`;
  const items: ConditionProvenanceItem[] = [
    { label: '読みの辞書', value: reading.status === 'converted' ? dictionary : `${dictionary}を読み込めず、漢字は読みに直していません` },
  ];
  const words = reading.wordCorrections?.length ?? 0;
  if (reading.corrections.length > 0 || words > 0)
    items.push({ label: '読みの直し', value: `${correctionCountText(reading.corrections.length, words)}の読みを直して測定` });
  return items;
}

/**
 * 文節の区切りを作る材料。日本語のテキストだけが持つ（分割器は日本語のモデルだけを使う）。
 * 漢字を読みに直した時は器が語の列を添えている。漢字を含まないテキストと、辞書を読み込めなかったテキストは、
 * 語の列が無いので原文のままの位置から写す。
 */
export function segmentationBasisOf(text: PaneText): SegmentationBasis | undefined {
  if (text.segmentationBasis !== undefined) return text.segmentationBasis;
  if (text.language !== 'ja') return undefined;
  return {
    sourceText: text.text,
    tokens: [],
    corrections: {},
    wordReadings: NO_WORD_READINGS,
    origin: text.reading?.status === 'unavailable' ? 'dictionary-unavailable' : 'kana-only',
  };
}
