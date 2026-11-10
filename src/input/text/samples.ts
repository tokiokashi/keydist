import catalogJson from './corpus/catalog.json' with { type: 'json' };
import { corpusBody } from './corpus-bodies.ts';
import { SAMPLE_TEXT } from './sample-en.ts';
import { SAMPLE_TEXT_JA_NEKO } from './sample-ja-neko.ts';
import type { TextLicenseId, TextSource, TextSourceItem } from './text-source.ts';

/**
 * サンプルテキストの言語。用語集の「テキストは言語を属性に持つ」に合わせる。
 * 画面のモード（`ModeId`）とは別物として扱う（用語集は mode という語自体を使わない）。
 */
export type TextLanguage = 'en' | 'ja';

/** 利用者が選んだ時に本文を読み込む組み込みテキスト（`corpus/` の `*.txt`）。一覧は `scripts/generate-eval-texts.ts` が作る。 */
export interface CorpusEntry {
  readonly sampleId: string;
  readonly name: string;
  readonly fileName: string;
  readonly license: TextLicenseId;
  readonly items: readonly TextSourceItem[];
}

export const CORPUS_ENTRIES: readonly CorpusEntry[] = catalogJson as readonly CorpusEntry[];

const CORPUS_BY_ID: ReadonlyMap<string, CorpusEntry> = new Map(CORPUS_ENTRIES.map((entry) => [entry.sampleId, entry]));

export function corpusEntryOf(sampleId: string): CorpusEntry | undefined {
  return CORPUS_BY_ID.get(sampleId);
}

/**
 * 最初の表示に含める組み込みサンプルテキスト。評価器へ渡す前の前処理（空白畳み込み）もここで確定させる
 * （AGENTS.md「測る時はアプリと同じ前処理を通す」）。
 * standalone/Workspace どちらのhostからも同じサンプルを使うため、input層に置く。
 * `corpus/` の本文は含めない（`corpus-bodies.ts`。選ばれた時に読み込む）。
 */
export const SAMPLE_TEXTS: Record<TextLanguage, Record<string, string>> = {
  en: { default: SAMPLE_TEXT.replace(/\s+/g, ' ').trim() },
  ja: {
    legacy: SAMPLE_TEXT_JA_NEKO.replace(/\s+/g, ''),
  },
};

/**
 * ラベルの「（既定）」は`FALLBACK_SAMPLE_ID`・`DEFAULT_BUILTIN_TEXT_ID`（`builtin.ts`）
 * が実際に使う既定のsampleIdに付ける。日本語の既定は`ja.legacy`（青空文庫の『吾輩は猫である』の第一章の先頭の
 * 約1000字を文末で切ったもの、漢字かな交じりの原文）にする。字数が増えるほど、打鍵再生の図が長くなり、漢字を読みに
 * 直す段が入るのでWorkspaceのペインが数値を出すまでも延びる。そのため、既定は約1000字にしている。
 * `corpus/` のテキストは約1万字で、既定にしない。
 */
export const SAMPLE_TEXT_NAMES: Record<TextLanguage, Record<string, string>> = {
  en: { default: '英文（既定）' },
  ja: { legacy: '「吾輩は猫である」の冒頭（既定）', ...Object.fromEntries(CORPUS_ENTRIES.map((entry) => [entry.sampleId, entry.name])) },
};

/** 最初の表示に含めるサンプルの出典。`corpus/` のテキストの出典は `corpus/catalog.json` にある。 */
const EAGER_SOURCES: Readonly<Record<string, TextSource>> = {
  'ja.legacy': {
    license: 'public-domain',
    items: [
      {
        label: '『吾輩は猫である』',
        note: '夏目漱石（没年1916）。青空文庫。底本：「夏目漱石全集1」ちくま文庫、筑摩書房、1987（昭和62）年9月29日第1刷発行。入力：柴田卓治、校正：渡部峰子ほか。ルビと入力者注を取り除き、第一章の先頭の約1000字を抜粋した',
        url: 'https://www.aozora.gr.jp/cards/000148/card789.html',
      },
    ],
  },
  'en.default': {
    license: 'public-domain',
    items: [
      {
        label: 'Pride and Prejudice',
        note: 'Jane Austen（1813年）の冒頭の文。小文字にし、句読点の一部を取り除いた',
        url: 'https://www.gutenberg.org/ebooks/1342',
      },
      {
        label: 'Moby-Dick',
        note: 'Herman Melville（1851年）の冒頭の文。小文字にし、句読点の一部を取り除いた',
        url: 'https://www.gutenberg.org/ebooks/2701',
      },
      {
        label: 'The Declaration of Independence',
        note: 'アメリカ独立宣言（1776年）の一節。小文字にし、句読点の一部を取り除いた',
        url: 'https://www.archives.gov/founding-docs/declaration-transcript',
      },
    ],
  },
};

const FALLBACK_SAMPLE_ID: Record<TextLanguage, string> = {
  en: 'default',
  ja: 'legacy',
};

/**
 * 組み込みサンプルの本文。`corpus/` のテキストは、読み込むまで空文字を返す（`corpus-bodies.ts`）。
 * 知らないsampleIdは、言語の既定のサンプルを返す。
 */
export function sampleText(language: TextLanguage, sampleId: string): string {
  const eager = SAMPLE_TEXTS[language][sampleId];
  if (eager !== undefined) return eager;
  if (language === 'ja' && CORPUS_BY_ID.has(sampleId)) return corpusBody(sampleId) ?? '';
  return SAMPLE_TEXTS[language][FALLBACK_SAMPLE_ID[language]] ?? '';
}

/** サンプル選択UI向けに1件ずつ平らにした形（`{language, sampleId}`をUIの選択値に使う）。 */
export interface SampleTextEntry {
  readonly language: TextLanguage;
  readonly sampleId: string;
  readonly name: string;
  /** 本文。`corpus/` のテキストは、読み込むまで空文字（読むたびに今の状態を返す）。 */
  readonly text: string;
  /** 選んだ時に本文を読み込むか（`corpus/` のテキスト）。 */
  readonly lazy: boolean;
  /** 出典とライセンス。 */
  readonly source: TextSource;
}

/**
 * 組み込みサンプルを1件ずつ平らな配列にする（テキストはサンプルを選べれば
 * 十分で、言語を選ぶUIは作らない）。言語をまたいで1つの選択肢一覧に並べたいので、
 * `SAMPLE_TEXTS`のように言語をキーにした2段のRecordのままではUIから使いづらい。
 * ここで初めて2つを合流させ、呼び出し側（UI）は言語を意識せず選ぶだけでよい形にする。
 */
export function sampleTextEntries(): readonly SampleTextEntry[] {
  const eager = (Object.keys(SAMPLE_TEXTS) as TextLanguage[]).flatMap((language) =>
    Object.keys(SAMPLE_TEXTS[language]).map(
      (sampleId): SampleTextEntry => ({
        language,
        sampleId,
        name: SAMPLE_TEXT_NAMES[language][sampleId] ?? sampleId,
        text: SAMPLE_TEXTS[language][sampleId]!,
        lazy: false,
        source: EAGER_SOURCES[`${language}.${sampleId}`]!,
      }),
    ),
  );
  const lazy = CORPUS_ENTRIES.map(
    (entry): SampleTextEntry => ({
      language: 'ja',
      sampleId: entry.sampleId,
      name: entry.name,
      get text(): string {
        return sampleText('ja', entry.sampleId);
      },
      lazy: true,
      source: { license: entry.license, items: entry.items },
    }),
  );
  return [...eager, ...lazy];
}
