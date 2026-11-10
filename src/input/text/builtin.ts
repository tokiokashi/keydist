import { corpusEntryOf, sampleTextEntries, type SampleTextEntry, type TextLanguage } from './samples.ts';
import type { TextSource } from './text-source.ts';

/**
 * 組み込みテキスト（`docs/architecture.md`用語表
 * 「テキストは…資産として複数持ち…組み込み（サンプル）と自作がある」）。
 *
 * 実体は既存の`sampleTextEntries()`（`samples.ts`）を安定したidで包み直したもの。
 * サンプル自体を廃止するのではなく、資産の集合（`TextLibrary`のユーザーテキストと同じ
 * 列に並ぶ選択肢）として見せ直す層を1枚足す。
 */
export interface BuiltinText {
  readonly id: string;
  readonly name: string;
  /** 本文。選んだ時に読み込むテキストは、読み込むまで空文字（読むたびに今の状態を返す。`corpus-bodies.ts`）。 */
  readonly text: string;
  /** 組み込みは言語が固定で、利用者が手動で上書きできる入れ物を持たない。 */
  readonly language: TextLanguage;
  /** 選んだ時に本文を読み込む時の、読み込み先。最初の表示に含める本文は無い。 */
  readonly lazyBody?: { readonly sampleId: string; readonly fileName: string };
  readonly source: TextSource;
}

const BUILTIN_ID_PREFIX = 'builtin:';

function builtinIdFor(entry: SampleTextEntry): string {
  return `${BUILTIN_ID_PREFIX}${entry.language}.${entry.sampleId}`;
}

export const BUILTIN_TEXTS: readonly BuiltinText[] = sampleTextEntries().map((entry): BuiltinText => {
  const corpus = entry.lazy ? corpusEntryOf(entry.sampleId) : undefined;
  return {
    id: builtinIdFor(entry),
    name: entry.name,
    get text(): string {
      return entry.text;
    },
    language: entry.language,
    ...(corpus === undefined ? {} : { lazyBody: { sampleId: corpus.sampleId, fileName: corpus.fileName } }),
    source: entry.source,
  };
});

/**
 * 単体ページの既定選択は組み込みのja.legacy（「吾輩は猫である」の第一章の先頭の約1000字）にする。
 * `samples.ts`の`FALLBACK_SAMPLE_ID`が指す既定と揃える。
 */
export const DEFAULT_BUILTIN_TEXT_ID = `${BUILTIN_ID_PREFIX}ja.legacy`;

export function builtinTextById(id: string): BuiltinText | undefined {
  return BUILTIN_TEXTS.find((entry) => entry.id === id);
}

/**
 * 組み込みを書き換えた時のcopy-on-write（`engine/commands.ts`の`setTextContentCommand`）が
 * 作るユーザーテキストの名前。組み込みの表示名は一覧用に「（既定）」を含む
 * （`samples.ts`の`SAMPLE_TEXT_NAMES`）ため、そのまま末尾へ「（編集）」を足すと
 * 二重に注記が付いてしまう。「（既定）」の注記だけを落としてから「（編集）」を足す。
 */
export function deriveEditedTextName(builtinName: string): string {
  return `${builtinName.replace(/（既定）$/, '')}（編集）`;
}
