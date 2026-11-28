// 標準のコーパス（『吾輩は猫である』全文）の文節の読みの表を、選べる次数の分だけ、アプリに同梱するファイルとして作る。
// 選べる次数は、文節の読みの系列の「足りている最大の次数」までで、0次は常に選べる（`spec/distance-model.md` §13.5）。
// 定義は `docs/corpus-ngram.md` の「同梱する表」。
//
//   node --experimental-strip-types scripts/generate-corpus-ngram-table.ts           表を作り直して書く
//   node --experimental-strip-types scripts/generate-corpus-ngram-table.ts --check   置いてある表が同じ出典から作れるかを確かめる
//   ... --source <zipのパス>                                                           取得済みの青空文庫のzipを使う
//
// 取得したzipは .cache/aozora/ に、読みの辞書は .cache/dictionary/ に置く（追跡しない）。sha256が合わなければ止まる。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpusNgramTables } from '#interpretation/corpus-ngram.ts';
import { defaultTableOrder, selectableOrders } from '#interpretation/ngram-table-analysis.ts';
import { derivedOrdersMatch, NGRAM_TABLE_FILE_VERSION, parseNgramTableFile, type NgramTableFile } from '#interpretation/ngram-table-asset.ts';
import { BUNSETSU_SPLITTER } from '#platform/bunsetsu/info.ts';
import { DICTIONARY_SPEC, LIBRARY_SPEC } from '#platform/reading/dictionary-spec.ts';
import { AOZORA_SOURCE } from './generate-neko-sample.ts';
import { loadStandardCorpus, sha256Of } from './corpus-ngram-load.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 同梱する表のファイル。 */
export const STANDARD_TABLE_PATH = resolve(root, 'src/input/text/ngram/standard-corpus-bunsetsu.json');

/** 統計が足りているかを確かめる最大の次数。選べる次数の上限（今は0次）より上の次数も、足りていないことを示すために数える。 */
const HIGHEST_CHECKED_ORDER = 5;

/** 表の元のテキストに加えた変更。青空文庫の規準が、作業履歴を明記することを期待している。 */
const CHANGES = [
  '青空文庫の取り扱い規準に従い、ルビ（《》と｜）・入力者注（［＃］）・外字の注・章見出しの行を取り除いた。',
  '漢字を含む語を辞書の読みに置き換え、分割器で文節に区切り、文節の読みの並びの出現回数だけを数えた。',
  'このファイルは本文を含まず、文節の読みの並びとその出現回数だけを持つ。',
].join('');

/** 表のファイルを組み立てる。 */
export async function buildStandardTableFile(source: string | undefined): Promise<NgramTableFile> {
  const loaded = await loadStandardCorpus(source);
  const tables = buildCorpusNgramTables(loaded.reading.text, loaded.readingBoundaries, HIGHEST_CHECKED_ORDER);
  const sufficiency = tables.bunsetsu.sufficiency;
  const orders = selectableOrders(sufficiency);
  return {
    version: NGRAM_TABLE_FILE_VERSION,
    id: 'aozora-789-bunsetsu',
    source: {
      name: `青空文庫『${AOZORA_SOURCE.title}』（作品789）全文`,
      archive: { fileName: AOZORA_SOURCE.fileName, sha256: AOZORA_SOURCE.sha256 },
      corpus: { sha256: sha256Of(loaded.corpus), characters: [...loaded.corpus].length },
      colophon: { work: loaded.work, original: loaded.colophon, changes: CHANGES },
    },
    segmentation: { splitter: BUNSETSU_SPLITTER },
    reading: { library: LIBRARY_SPEC, dictionary: { name: DICTIONARY_SPEC.name, version: DICTIONARY_SPEC.version } },
    sufficiency,
    selectableOrders: orders,
    defaultOrder: defaultTableOrder(sufficiency),
    tables: orders.map((order) => {
      // 出現回数の多い順、同じなら鍵の順。ファイルの並びを実行ごとに変えない
      const entries = [...tables.bunsetsu.tables[order]!].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return { order, keys: entries.map(([key]) => key), counts: entries.map(([, count]) => count) };
    }),
  };
}

/** 書き出す文字列。上の欄は1行ずつ、表は次数ごとに1行にする。 */
export function serializeTableFile(file: NgramTableFile): string {
  const { tables, ...rest } = file;
  const head = JSON.stringify(rest).slice(0, -1);
  const body = tables.map((table) => JSON.stringify(table)).join(',\n');
  return `${head},"tables":[\n${body}\n]}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const source = sourceIndex === -1 ? undefined : resolve(args[sourceIndex + 1]!);
  const built = await buildStandardTableFile(source);
  const text = serializeTableFile(built);
  // 書く前に、読み込む側の検査を通す
  const parsed = parseNgramTableFile(JSON.parse(text));
  if (!derivedOrdersMatch(parsed)) throw new Error('統計から導いた選べる次数が、ファイルに書いた値と違う');

  if (args.includes('--check')) {
    const stored = await readFile(STANDARD_TABLE_PATH, 'utf8').catch(() => undefined);
    if (stored === undefined) throw new Error(`${STANDARD_TABLE_PATH} が無い。生成して置く`);
    if (stored !== text) {
      throw new Error(
        `${STANDARD_TABLE_PATH} が、出典から作り直した表と違う。node --experimental-strip-types scripts/generate-corpus-ngram-table.ts で作り直す`,
      );
    }
    console.log(`同梱の表は、出典から作り直した表と一致している（選べる次数 ${built.selectableOrders.join('・')}、既定 ${built.defaultOrder}次）`);
    return;
  }
  await mkdir(dirname(STANDARD_TABLE_PATH), { recursive: true });
  await writeFile(STANDARD_TABLE_PATH, text);
  const sizes = built.tables.map((table) => `${table.order}次 ${table.keys.length}項目`).join('、');
  console.log(`${STANDARD_TABLE_PATH} を書いた（${sizes}。${text.length}字）`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
