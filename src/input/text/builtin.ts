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
  /** 組み込みは言語が固定（#544指示書「built-ins have fixed language」）。上書きできない。 */
  readonly language: TextLanguage;
}

const BUILTIN_ID_PREFIX = 'builtin:';

function builtinIdFor(entry: SampleTextEntry): string {
  return `${BUILTIN_ID_PREFIX}${entry.language}.${entry.sampleId}`;
}

/** `id`が組み込みテキストのidの形をしているか（`selection.ts`のTextRef判定に使う）。 */
export function isBuiltinTextId(id: string): boolean {
  return id.startsWith(BUILTIN_ID_PREFIX);
}

export const BUILTIN_TEXTS: readonly BuiltinText[] = sampleTextEntries().map((entry) => ({
  id: builtinIdFor(entry),
  name: entry.name,
  text: entry.text,
  language: entry.language,
}));

/**
 * 単体ページの既定選択（#544指示書「Default = built-in ja.legacy」）。
 * `samples.ts`の`FALLBACK_SAMPLE_ID`が既に`ja.legacy`を指しているのと同じ理由
 * （初回計算の重さ）で、この既定もそこに揃える。
 */
export const DEFAULT_BUILTIN_TEXT_ID = `${BUILTIN_ID_PREFIX}ja.legacy`;

export function builtinTextById(id: string): BuiltinText | undefined {
  return BUILTIN_TEXTS.find((entry) => entry.id === id);
}

/**
 * 組み込みを書き換えた時に作るユーザーテキストの名前（#544指示書「copy-on-write、
 * name derived e.g. 「吾輩は猫である（編集）」」）。組み込みの表示名は一覧用に
 * 「（既定）」を含む（`samples.ts`の`SAMPLE_TEXT_NAMES`）ため、そのまま末尾へ
 * 「（編集）」を足すと二重に注記が付いてしまう。「（既定）」の注記だけを落としてから
 * 「（編集）」を足す。
 */
export function deriveEditedTextName(builtinName: string): string {
  return `${builtinName.replace(/（既定）$/, '')}（編集）`;
}
