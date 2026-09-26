import { SAMPLE_TEXT } from './sample-en.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from './sample-ja.ts';

/**
 * サンプルテキストの言語。#544 用語集の「テキストは言語を属性に持つ」に合わせる。
 * 画面のモード（`ModeId`）とは別物として扱う（用語集は mode という語自体を使わない）。
 */
export type TextLanguage = 'en' | 'ja';

/**
 * 組み込みサンプルテキスト。評価器へ渡す前の前処理（空白畳み込み）もここで確定させる
 * （AGENTS.md「測る時はアプリと同じ前処理を通す」）。
 * standalone/Workspace どちらのhostからも同じサンプルを使うため、input層に置く。
 */
export const SAMPLE_TEXTS: Record<TextLanguage, Record<string, string>> = {
  en: { default: SAMPLE_TEXT.replace(/\s+/g, ' ').trim() },
  ja: {
    modern: SAMPLE_TEXT_JA.replace(/\s+/g, ''),
    legacy: SAMPLE_TEXT_JA_LEGACY.replace(/\s+/g, ''),
  },
};

export const SAMPLE_TEXT_NAMES: Record<TextLanguage, Record<string, string>> = {
  en: { default: '英文（既定）' },
  ja: { modern: '現代文', legacy: '旧文「吾輩は猫である」（既定）' },
};

const FALLBACK_SAMPLE_ID: Record<TextLanguage, string> = {
  en: 'default',
  ja: 'modern',
};

export function sampleText(language: TextLanguage, sampleId: string): string {
  return SAMPLE_TEXTS[language][sampleId]
    ?? SAMPLE_TEXTS[language][FALLBACK_SAMPLE_ID[language]]
    ?? '';
}

export function isSampleText(text: string): boolean {
  return Object.values(SAMPLE_TEXTS)
    .some((samples) => Object.values(samples).includes(text));
}
