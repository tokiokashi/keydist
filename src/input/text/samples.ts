import { SAMPLE_TEXT } from './sample-en.ts';
import { SAMPLE_TEXT_JA } from './sample-ja.ts';
import { SAMPLE_TEXT_JA_NEKO } from './sample-ja-neko.ts';

/**
 * サンプルテキストの言語。用語集の「テキストは言語を属性に持つ」に合わせる。
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
    legacy: SAMPLE_TEXT_JA_NEKO.replace(/\s+/g, ''),
  },
};

/**
 * ラベルの「（既定）」は`FALLBACK_SAMPLE_ID`・`DEFAULT_BUILTIN_TEXT_ID`（`builtin.ts`）
 * が実際に使う既定のsampleIdに付ける。日本語の既定は`ja.legacy`（青空文庫の『吾輩は猫である』の第一章の先頭の
 * 約1000字を文末で切ったもの、漢字かな交じりの原文）にする。字数が増えるほど、打鍵再生の図が長くなり、漢字を読みに
 * 直す段が入るのでWorkspaceのペインが数値を出すまでも延びる。そのため、既定は約1000字にしている。
 */
export const SAMPLE_TEXT_NAMES: Record<TextLanguage, Record<string, string>> = {
  en: { default: '英文（既定）' },
  ja: { modern: '現代文', legacy: '旧文「吾輩は猫である」（既定）' },
};

const FALLBACK_SAMPLE_ID: Record<TextLanguage, string> = {
  en: 'default',
  ja: 'legacy',
};

export function sampleText(language: TextLanguage, sampleId: string): string {
  return SAMPLE_TEXTS[language][sampleId] ?? SAMPLE_TEXTS[language][FALLBACK_SAMPLE_ID[language]] ?? '';
}

/** サンプル選択UI向けに1件ずつ平らにした形（`{language, sampleId}`をUIの選択値に使う）。 */
export interface SampleTextEntry {
  readonly language: TextLanguage;
  readonly sampleId: string;
  readonly name: string;
  readonly text: string;
}

/**
 * 組み込みサンプルを1件ずつ平らな配列にする（テキストはサンプルを選べれば
 * 十分で、言語を選ぶUIは作らない）。言語をまたいで1つの選択肢一覧に並べたいので、
 * `SAMPLE_TEXTS`のように言語をキーにした2段のRecordのままではUIから使いづらい。
 * ここで初めて2つを合流させ、呼び出し側（UI）は言語を意識せず選ぶだけでよい形にする。
 */
export function sampleTextEntries(): readonly SampleTextEntry[] {
  return (Object.keys(SAMPLE_TEXTS) as TextLanguage[]).flatMap((language) =>
    Object.keys(SAMPLE_TEXTS[language]).map((sampleId) => ({
      language,
      sampleId,
      name: SAMPLE_TEXT_NAMES[language][sampleId] ?? sampleId,
      text: SAMPLE_TEXTS[language][sampleId]!,
    })),
  );
}
