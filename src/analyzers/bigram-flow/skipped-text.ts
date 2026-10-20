import type { Trace } from '#trace/generate.ts';

/** 打てずに飛ばした文字の内訳の見出し。 */
const KIND_LABELS = [
  ['kanji', '読みに直せなかった漢字'],
  ['symbol', '記号'],
  ['other', 'それ以外の文字'],
] as const;

/**
 * 打てずに飛ばした文字の件数を、種別ごとの内訳つきの1行にする。内訳は0件の種別を出さない。
 * 飛ばした文字が無ければundefined。
 */
export function skippedCharsText(trace: Pick<Trace, 'skipped' | 'skippedByKind'>): string | undefined {
  if (trace.skipped <= 0) return undefined;
  const parts = KIND_LABELS.flatMap(([kind, label]) => (trace.skippedByKind[kind] > 0 ? [`${label} ${trace.skippedByKind[kind]}`] : []));
  return parts.length === 0 ? `打てずに飛ばした文字 ${trace.skipped}` : `打てずに飛ばした文字 ${trace.skipped}（${parts.join('・')}）`;
}
