// 標準のコーパス（『吾輩は猫である』全文）を読みに直し、文節の区切りを読みのテキストの位置へ写す。
// `scripts/corpus-ngram-tables.ts` と `scripts/corpus-ngram-table-analysis.ts` が使う。
// 辞書（IPADIC）は .cache/dictionary/ に取る（CONTRIBUTING.md「読みの辞書」）。無ければ取得する。
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertToReading } from '#input/text/reading.ts';
import { mapBoundariesToReading, offsetsOfChunks } from '#input/text/segmentation.ts';
import { splitBunsetsu } from '#platform/bunsetsu/budoux.ts';
import { createReadingAnalyzer, type LinderaModule } from '#platform/reading/analyzer.ts';
import { readDictionaryZip } from '#platform/reading/dictionary-files.ts';
import { extractZip } from '#platform/reading/zip.ts';
import { ensureDictionaryZip } from './dictionary-fetch.ts';
import { convertAozora, extractBody } from './aozora-core.ts';
import { AOZORA_SOURCE, archiveBytes } from './generate-neko-sample.ts';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

export const sha256Of = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

export interface StandardCorpus {
  /** 注記を除いた全文 */
  readonly corpus: string;
  /** 漢字を読みに直したテキストと、読みに置き換えた語の数 */
  readonly reading: { readonly text: string; readonly replacedWords: number };
  /** 原文の上の文節の区切りの数 */
  readonly sourceBoundaryCount: number;
  /** 読みのテキストの上の文節の区切り（コードポイントの位置） */
  readonly readingBoundaries: readonly number[];
}

/** 取得と除去は `scripts/generate-neko-sample.ts` と同じ。読みへの変換と区切りの写しはアプリと同じ経路。 */
export async function loadStandardCorpus(source: string | undefined): Promise<StandardCorpus> {
  const zip = await archiveBytes(source);
  const entry = (await extractZip(zip)).get(AOZORA_SOURCE.entryName);
  if (entry === undefined) throw new Error(`zipに${AOZORA_SOURCE.entryName}が無い`);
  const corpus = convertAozora(extractBody(new TextDecoder('shift_jis', { fatal: true }).decode(entry))).text;

  // 原文を形態素解析 → 読みに置き換え。分割器は原文に1回だけ当て、語の境目へ寄せて読みの位置へ写す
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(resolve(root, 'node_modules/lindera-wasm/lindera_wasm_bg.wasm')) });
  const analyzer = createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await ensureDictionaryZip()));
  const tokens = analyzer.tokenize(corpus);
  const reading = convertToReading(corpus, tokens);
  const sourceBoundaries = offsetsOfChunks(splitBunsetsu(corpus));
  const readingBoundaries = mapBoundariesToReading(corpus, tokens, sourceBoundaries);
  return { corpus, reading, sourceBoundaryCount: sourceBoundaries.length, readingBoundaries };
}
