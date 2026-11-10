// 同梱する評価テキスト（src/input/text/corpus/）を、青空文庫の作品とWikipediaの記事から作る。
//
//   青空文庫から小説・童話・随筆・講演の4本、Wikipediaから8分野の8本、12の出どころから均等に取った分野を混ぜた1本。
//   どれも、既定の条件で評価に渡す字数が約1万字になるように、文の単位で取る（規則は scripts/eval-text-core.ts）。
//
//   node --experimental-strip-types scripts/generate-eval-texts.ts           本文・出典の一覧・出典の表示用のJSONを作り直して書く
//   node --experimental-strip-types scripts/generate-eval-texts.ts --check   置いてあるファイルが、固定した原文から作れるものと同じかを確かめる
//
// 原文は .cache/aozora/（zip）と .cache/wikipedia/（記事ごとの本文）に置く（追跡しない）。sha256が合わなければ止まる。
// ビルドとnpm testでは取りに行かない（作った本文をリポジトリに置く）。
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TextLicenseId, TextSource, TextSourceItem } from '../src/input/text/text-source.ts';
import { extractZip } from '../src/platform/reading/zip.ts';
import { convertAozora, extractBody } from './aozora-core.ts';
import { createNodeToReading } from './eval-text-reading.ts';
import {
  aozoraParagraphs,
  defaultEvalChars,
  takePassage,
  wikipediaParagraphs,
  type Passage,
} from './eval-text-core.ts';
import {
  AOZORA_WORKS,
  CATEGORY_TARGET_EVAL_CHARS,
  MIXED_CHUNKS_PER_SOURCE,
  MIXED_PER_SOURCE_EVAL_CHARS,
  MIXED_TEXT,
  WIKIPEDIA_CATEGORIES,
  WIKIPEDIA_SOURCE,
  type AozoraWork,
  type WikipediaArticle,
} from './eval-text-spec.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_AOZORA = join(ROOT, '.cache', 'aozora');
const CACHE_WIKIPEDIA = join(ROOT, '.cache', 'wikipedia');
export const CORPUS_DIR = join(ROOT, 'src', 'input', 'text', 'corpus');

function sha256Of(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeAtomically(path: string, bytes: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

/** 青空文庫の作品のzipを返す。置き場にsha256の合うzipがあればそれを使う。無ければ取得する。 */
async function aozoraArchive(work: AozoraWork): Promise<Uint8Array> {
  const path = join(CACHE_AOZORA, work.fileName);
  const stored = await readFile(path).catch(() => undefined);
  if (stored !== undefined && sha256Of(stored) === work.sha256) return stored;
  const response = await fetch(work.url);
  if (!response.ok) throw new Error(`${work.url} を取得できなかった（応答 ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256Of(bytes);
  if (actual !== work.sha256) throw new Error(`sha256が固定した値と違う: ${work.url}\n  期待 ${work.sha256}\n  実際 ${actual}`);
  await writeAtomically(path, bytes);
  return bytes;
}

/** 青空文庫の作品の本文（記法を取り除いた後）。 */
async function aozoraText(work: AozoraWork): Promise<string> {
  const entries = await extractZip(await aozoraArchive(work));
  const bytes = entries.get(work.entryName);
  if (bytes === undefined) throw new Error(`zipに ${work.entryName} が無い`);
  return convertAozora(extractBody(new TextDecoder('shift_jis', { fatal: true }).decode(bytes))).text;
}

async function fetchWikipediaRow(article: WikipediaArticle): Promise<string> {
  const query = new URLSearchParams({
    dataset: WIKIPEDIA_SOURCE.dataset,
    config: WIKIPEDIA_SOURCE.config,
    split: 'train',
    offset: String(article.rowOffset),
    length: '1',
  });
  const url = `${WIKIPEDIA_SOURCE.rowsUrl}?${query}`;
  let lastError = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url).catch((error: unknown) => String(error));
    if (typeof response === 'string') {
      lastError = response;
    } else if (!response.ok) {
      lastError = `応答 ${response.status}`;
    } else {
      const body = (await response.json()) as { rows: { row: { id: string; title: string; text: string }; truncated_cells?: string[] }[] };
      const entry = body.rows[0];
      if (entry === undefined) throw new Error(`${url} に行が無い`);
      if (entry.row.title !== article.title || entry.row.id !== String(article.pageId)) {
        throw new Error(`行の位置 ${article.rowOffset} が記事 ${article.title}（${article.pageId}）と違う: ${entry.row.title}（${entry.row.id}）`);
      }
      if ((entry.truncated_cells ?? []).length > 0) throw new Error(`${article.title} の本文が切り詰められて返った`);
      return entry.row.text;
    }
    await new Promise((done) => setTimeout(done, 2000 * (attempt + 1)));
  }
  throw new Error(`${url} を取得できなかった（${lastError}）`);
}

/** Wikipediaの記事の本文を返す。置き場にsha256の合う本文があればそれを使う。無ければ取得する。 */
async function wikipediaText(article: WikipediaArticle): Promise<string> {
  const path = join(CACHE_WIKIPEDIA, `${article.pageId}.txt`);
  const stored = await readFile(path, 'utf8').catch(() => undefined);
  if (stored !== undefined && sha256Of(stored) === article.sha256) return stored;
  const text = await fetchWikipediaRow(article);
  const actual = sha256Of(text);
  if (actual !== article.sha256) throw new Error(`記事 ${article.title} のsha256が固定した値と違う\n  期待 ${article.sha256}\n  実際 ${actual}`);
  await writeAtomically(path, text);
  return text;
}

export interface CatalogEntry {
  readonly sampleId: string;
  readonly name: string;
  readonly fileName: string;
  readonly license: TextLicenseId;
  readonly items: readonly TextSourceItem[];
}

export interface BuiltText {
  readonly entry: CatalogEntry;
  readonly body: string;
  /** 出どころごとに取った範囲の記録（オーナー向けの一覧に使う）。 */
  readonly takes: readonly TakeRecord[];
}

export interface TakeRecord {
  readonly source: string;
  readonly from: number;
  readonly sentences: number;
  readonly evalChars: number;
  readonly sourceChars: number;
}

function aozoraItem(work: AozoraWork): TextSourceItem {
  return {
    label: `『${work.title}』`,
    note: `${work.author}（没年 ${work.authorDeathYear}）。青空文庫。${work.colophon}ルビと入力者注を取り除き、一部の文を抜粋した`,
    url: work.cardUrl,
  };
}

function wikipediaItem(article: WikipediaArticle): TextSourceItem {
  return {
    label: article.title,
    note: 'Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）',
    url: WIKIPEDIA_SOURCE.articleUrl(article.title),
    historyUrl: WIKIPEDIA_SOURCE.historyUrl(article.title),
  };
}

export interface Originals {
  readonly aozora: ReadonlyMap<string, string>;
  readonly wikipedia: ReadonlyMap<string, string>;
}

/** 原文から、13本のテキストを作る。 */
export function buildTexts(originals: Originals, toReading: (text: string) => string): BuiltText[] {
  const cache = new Map<string, number>();
  const evalChars = (sentence: string): number => {
    let value = cache.get(sentence);
    if (value === undefined) {
      value = defaultEvalChars(toReading(sentence));
      cache.set(sentence, value);
    }
    return value;
  };
  const built: BuiltText[] = [];
  /** 分野別のテキストで取った後の位置。分野を混ぜたテキストが続きから取る。 */
  const nextAfterCategory = new Map<string, number>();
  const paragraphsOf = new Map<string, readonly string[]>();

  for (const work of AOZORA_WORKS) {
    const paragraphs = aozoraParagraphs(originals.aozora.get(work.id)!);
    paragraphsOf.set(work.id, paragraphs);
    const passage = takePassage(paragraphs, 0, CATEGORY_TARGET_EVAL_CHARS, evalChars);
    nextAfterCategory.set(work.id, passage.next);
    built.push({
      entry: {
        sampleId: work.id,
        name: `青空文庫・${work.kind}（${work.title}）`,
        fileName: `${work.id}.txt`,
        license: 'public-domain',
        items: [aozoraItem(work)],
      },
      body: `${passage.text}\n`,
      takes: [record(`『${work.title}』`, 0, passage, passage.text)],
    });
  }

  for (const category of WIKIPEDIA_CATEGORIES) {
    const parts: string[] = [];
    const takes: TakeRecord[] = [];
    let taken = 0;
    category.articles.forEach((article, index) => {
      const paragraphs = wikipediaParagraphs(originals.wikipedia.get(article.title)!);
      paragraphsOf.set(`${category.id}/${article.title}`, paragraphs);
      const budget = (CATEGORY_TARGET_EVAL_CHARS - taken) / (category.articles.length - index);
      const passage = takePassage(paragraphs, 0, budget, evalChars);
      nextAfterCategory.set(`${category.id}/${article.title}`, passage.next);
      taken += passage.evalChars;
      parts.push(passage.text);
      takes.push(record(article.title, 0, passage, passage.text));
    });
    built.push({
      entry: {
        sampleId: category.id,
        name: `Wikipedia・${category.name}`,
        fileName: `${category.id}.txt`,
        license: 'cc-by-sa-4.0',
        items: category.articles.map(wikipediaItem),
      },
      body: `${parts.join('\n')}\n`,
      takes,
    });
  }

  // 分野を混ぜたテキスト: 12の出どころから均等に取る。分野別のテキストで取った文の続きから取るので、同じ文は入らない。
  // 出どころを順に回って塊を並べる。取る順も並べる順と同じにし、残りの字数を残りの塊の数で割って予算にする（文の単位で取るので、
  // 予算との差が積もらないようにする）
  interface MixedSource {
    readonly paragraphs: (chunk: number) => readonly string[];
    /** 塊ごとに続きを取る位置。 */
    readonly cursor: (chunk: number) => number;
    readonly label: (chunk: number) => string;
    readonly setCursor: (chunk: number, next: number) => void;
  }
  const sources: MixedSource[] = [];
  const mixedItems: TextSourceItem[] = [];
  for (const work of AOZORA_WORKS) {
    const paragraphs = paragraphsOf.get(work.id)!;
    let cursor = nextAfterCategory.get(work.id)!;
    sources.push({
      paragraphs: () => paragraphs,
      cursor: () => cursor,
      label: () => `『${work.title}』`,
      setCursor: (_chunk, next) => {
        cursor = next;
      },
    });
    mixedItems.push(aozoraItem(work));
  }
  for (const category of WIKIPEDIA_CATEGORIES) {
    const cursors = category.articles.map((article) => nextAfterCategory.get(`${category.id}/${article.title}`)!);
    sources.push({
      paragraphs: (chunk) => paragraphsOf.get(`${category.id}/${category.articles[chunk]!.title}`)!,
      cursor: (chunk) => cursors[chunk]!,
      label: (chunk) => category.articles[chunk]!.title,
      setCursor: (chunk, next) => {
        cursors[chunk] = next;
      },
    });
    for (let k = 0; k < MIXED_CHUNKS_PER_SOURCE; k++) mixedItems.push(wikipediaItem(category.articles[k]!));
  }
  const mixedTarget = MIXED_PER_SOURCE_EVAL_CHARS * sources.length;
  const mixedParts: string[] = [];
  const mixedTakes: TakeRecord[] = [];
  let mixedTaken = 0;
  let remainingChunks = sources.length * MIXED_CHUNKS_PER_SOURCE;
  for (let k = 0; k < MIXED_CHUNKS_PER_SOURCE; k++) {
    for (const source of sources) {
      const from = source.cursor(k);
      const passage = takePassage(source.paragraphs(k), from, (mixedTarget - mixedTaken) / remainingChunks, evalChars);
      source.setCursor(k, passage.next);
      mixedParts.push(passage.text);
      mixedTakes.push(record(source.label(k), from, passage, passage.text));
      mixedTaken += passage.evalChars;
      remainingChunks--;
    }
  }
  built.push({
    entry: { sampleId: MIXED_TEXT.id, name: MIXED_TEXT.name, fileName: `${MIXED_TEXT.id}.txt`, license: 'cc-by-sa-4.0', items: mixedItems },
    body: `${mixedParts.join('\n')}\n`,
    takes: mixedTakes,
  });
  return built;
}

function record(source: string, from: number, passage: Passage, text: string): TakeRecord {
  return { source, from, sentences: passage.sentences, evalChars: passage.evalChars, sourceChars: [...text.replace(/\s+/g, '')].length };
}

/** 選択肢の並び。分野を混ぜた1本、青空文庫の4本、Wikipediaの8本の順。 */
export function orderedEntries(built: readonly BuiltText[]): BuiltText[] {
  const mixed = built.filter((text) => text.entry.sampleId === MIXED_TEXT.id);
  const rest = built.filter((text) => text.entry.sampleId !== MIXED_TEXT.id);
  return [...mixed, ...rest];
}

const SOURCES_HEADER = `# 同梱するテキストの出典とライセンス

このディレクトリのテキスト（\`*.txt\`）は \`scripts/generate-eval-texts.ts\` が作る。手で直さない。
原文の取得元とsha256は \`scripts/eval-text-spec.ts\` に固定してある。

## ライセンス

- 青空文庫の作品の本文（\`aozora-*.txt\`）: 作者の没後70年を過ぎ、著作権の保護期間が満了している。
  [青空文庫収録ファイルの取り扱い規準](https://www.aozora.gr.jp/guide/kijyunn.html)に従い、ルビと入力者注を取り除いて抜粋した。
- Wikipediaの文を含む本文（\`wiki-*.txt\` と \`mixed.txt\`）: [Creative Commons 表示-継承 4.0 国際（CC BY-SA 4.0）](https://creativecommons.org/licenses/by-sa/4.0/deed.ja)で配る。
  Wikipediaの記事の本文は、Wikimedia Foundationの[利用規約](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use)第7条により、CC BY-SA 4.0とGFDLで許諾されている。
  取得元のデータセットの表記はCC BY-SA 3.0だが、改変した文は「4.0以降」で許諾できる（[Wikipedia:Copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights)の「Reusers' rights and obligations」）。
  CC BY-SA 4.0になるのはこれらのテキストのファイルだけで、リポジトリのほかのファイルはApache-2.0のままである。
  \`mixed.txt\` は青空文庫の文も含むが、Wikipediaの文と並べた改変物なので、全体をCC BY-SA 4.0で配る。
- 改変: 記事ごとに、地の文の段落（40字以上で句点を含む行）だけを残し、脚注や関連項目の節から後ろを捨てた。
  取得元のデータで中身が欠けた空の括弧を取り除き、先頭の語や括弧の中の語が欠けた段落は除いた。残した段落から文の単位で抜粋した。
  英字と数字は原文のまま残し、文の順は変えていない。
- 出典の記事の執筆者は、各記事の履歴のページ（下の「履歴」）で辿れる。
- 画面に出す時は、空白と改行を取り除く（\`src/input/text/samples.ts\`）。

## 取得元

- Wikipedia日本語版: [${WIKIPEDIA_SOURCE.dataset}](${WIKIPEDIA_SOURCE.datasetUrl}) の \`${WIKIPEDIA_SOURCE.config}\`（版 \`${WIKIPEDIA_SOURCE.datasetRevision}\`）。記事ごとの本文のsha256は \`scripts/eval-text-spec.ts\` にある。
- 青空文庫: 作品ごとのzip。sha256は \`scripts/eval-text-spec.ts\` にある。
`;

function sourcesMarkdown(built: readonly BuiltText[]): string {
  const parts = [SOURCES_HEADER];
  const sections: { title: string; license: TextLicenseId }[] = [
    { title: '青空文庫（著作権の保護期間が満了）', license: 'public-domain' },
    { title: 'CC BY-SA 4.0', license: 'cc-by-sa-4.0' },
  ];
  for (const section of sections) {
    parts.push(`\n## ${section.title}\n`);
    for (const text of built.filter((candidate) => candidate.entry.license === section.license)) {
      parts.push(`\n### ${text.entry.name}（\`${text.entry.fileName}\`）\n\n`);
      for (const item of text.entry.items) {
        const history = item.historyUrl === undefined ? '' : `、[履歴](${item.historyUrl})`;
        parts.push(`- [${item.label}](${item.url})${history}: ${item.note}\n`);
      }
    }
  }
  return parts.join('');
}

export interface OutputFile {
  readonly path: string;
  readonly content: string;
}

export function outputFiles(built: readonly BuiltText[]): OutputFile[] {
  const ordered = orderedEntries(built);
  return [
    ...ordered.map((text) => ({ path: join(CORPUS_DIR, text.entry.fileName), content: text.body })),
    { path: join(CORPUS_DIR, 'SOURCES.md'), content: sourcesMarkdown(ordered) },
    { path: join(CORPUS_DIR, 'catalog.json'), content: `${JSON.stringify(ordered.map((text) => text.entry), null, 2)}\n` },
  ];
}

export async function loadOriginals(): Promise<Originals> {
  const aozora = new Map<string, string>();
  for (const work of AOZORA_WORKS) aozora.set(work.id, await aozoraText(work));
  const wikipedia = new Map<string, string>();
  for (const category of WIKIPEDIA_CATEGORIES) {
    for (const article of category.articles) wikipedia.set(article.title, await wikipediaText(article));
  }
  return { aozora, wikipedia };
}

export type { TextSource };

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const built = buildTexts(await loadOriginals(), await createNodeToReading());
  const files = outputFiles(built);
  if (check) {
    let failed = false;
    for (const file of files) {
      const stored = await readFile(file.path, 'utf8').catch(() => undefined);
      if (stored !== file.content) {
        console.error(`[eval-texts] ${file.path} が、固定した原文から作ったものと違う`);
        failed = true;
      }
    }
    if (failed) process.exit(1);
    console.log(`[eval-texts] 置いてある${files.length}ファイルは、固定した原文から作ったものと同じ`);
  } else {
    for (const file of files) await writeAtomically(file.path, file.content);
    console.log(`[eval-texts] ${files.length}ファイルを書いた`);
  }
  for (const text of orderedEntries(built)) {
    const total = text.takes.reduce((sum, take) => sum + take.evalChars, 0);
    console.log(`  ${text.entry.sampleId}: 評価に渡す字数の見積もり ${total}、${text.takes.length}箇所`);
  }
}
