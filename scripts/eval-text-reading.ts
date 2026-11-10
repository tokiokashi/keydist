// 漢字を読みに直す解析器をNodeで作る。同梱の評価テキストを作る時と検査する時に、アプリと同じ辞書・同じ変換を通すために使う。
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertToReading } from '../src/input/text/reading.ts';
import { createReadingAnalyzer, type LinderaModule } from '../src/platform/reading/analyzer.ts';
import { readDictionaryZip } from '../src/platform/reading/dictionary-files.ts';
import { ensureDictionaryZip } from './dictionary-fetch.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

/** 漢字を含む語を読みに直したテキストを返す。利用者の読みの直しは当てない。 */
export type ToReading = (text: string) => string;

export async function createNodeToReading(): Promise<ToReading> {
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(resolve(ROOT, 'node_modules/lindera-wasm/lindera_wasm_bg.wasm')) });
  const analyzer = createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await ensureDictionaryZip()));
  return (text) => convertToReading(text, analyzer.tokenize(text)).text;
}
