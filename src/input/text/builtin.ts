import { sampleTextEntries, type SampleTextEntry, type TextLanguage } from './samples.ts';

/**
 * 組み込みテキスト（#544 Phase 3「テキストの資産化」。`docs/architecture.md`用語表
 * 「テキストは…資産として複数持ち…組み込み（サンプル）と自作がある」）。
 *
 * 実体は既存の`sampleTextEntries()`（`samples.ts`）を安定したidで包み直したもの。
 * サンプル自体を廃止するのではなく、資産の集合（`TextLibrary`のユーザーテキストと同じ
 * 列に並ぶ選択肢）として見せ直す層を1枚足す。
 */
export interface BuiltinText {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** 組み込みは言語が固定で、利用者が手動で上書きできる入れ物を持たない。 */
  readonly language: TextLanguage;
}

const BUILTIN_ID_PREFIX = 'builtin:';

function builtinIdFor(entry: SampleTextEntry): string {
  return `${BUILTIN_ID_PREFIX}${entry.language}.${entry.sampleId}`;
}

export const BUILTIN_TEXTS: readonly BuiltinText[] = sampleTextEntries().map((entry) => ({
  id: builtinIdFor(entry),
  name: entry.name,
  text: entry.text,
  language: entry.language,
}));

/**
 * 単体ページの既定選択は組み込みのja.legacy（「吾輩は猫である」）にする。
 * `samples.ts`の`FALLBACK_SAMPLE_ID`が既に`ja.legacy`を指しているのと同じ理由
 * （初回計算の重さ）で、この既定もそこに揃える。
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
