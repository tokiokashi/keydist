import type { SegmenterInfo } from '#input/text/segmentation.ts';
import { BUNSETSU_KEY_SEPARATOR, type OrderSufficiency } from './corpus-ngram.ts';
import { defaultTableOrder, selectableOrders, type TableSource } from './ngram-table-analysis.ts';

/**
 * 同梱する文節の読みの表のファイルと、解析が読む1つの次数の表（定義は`docs/corpus-ngram.md`の「同梱する表」）。
 * ファイルは生成物（`scripts/generate-corpus-ngram-table.ts`）で、手で直さない。
 */

/** ファイルの形の版。形を変える時に上げる。 */
export const NGRAM_TABLE_FILE_VERSION = 1;

/** 青空文庫の規準が残すことを希望している情報と、加えた変更。表と一緒に配る。 */
export interface NgramTableColophon {
  /** 作品名と著者名 */
  readonly work: string;
  /** 取得元のファイルの末尾にある、底本・入力者・校正者・公開日と修正日・青空文庫作成ファイルの由来の注。原文のまま */
  readonly original: string;
  /** 原文に加えた変更（作業履歴） */
  readonly changes: string;
}

/** 表の1つの次数。`keys[i]`は、文節の読みを`U+0000`でつないだ鍵で、出現回数が`counts[i]`。 */
export interface NgramTableOrder {
  readonly order: number;
  readonly keys: readonly string[];
  readonly counts: readonly number[];
}

export interface NgramTableFile {
  readonly version: typeof NGRAM_TABLE_FILE_VERSION;
  /** 表を見分ける識別子。解析の結果に併記し、抽出のキーに入れる */
  readonly id: string;
  readonly source: {
    readonly name: string;
    readonly archive: { readonly fileName: string; readonly sha256: string };
    /** 注記を除いた全文のsha256と字数 */
    readonly corpus: { readonly sha256: string; readonly characters: number };
    readonly colophon: NgramTableColophon;
  };
  readonly segmentation: { readonly splitter: SegmenterInfo };
  readonly reading: { readonly library: SegmenterInfo; readonly dictionary: SegmenterInfo };
  /** 次数ごとの統計が足りているかの量。0次から、確かめた最大の次数まで */
  readonly sufficiency: readonly OrderSufficiency[];
  /** 選べる次数（仕様 §13.5）。`sufficiency`から導いた値で、`tables`に表がある次数と同じ */
  readonly selectableOrders: readonly number[];
  readonly defaultOrder: number;
  readonly tables: readonly NgramTableOrder[];
}

/** 解析が読む、1つの次数の表と出どころ。計算用Workerへ複製して渡す値なので、鍵と回数を配列のまま持つ。 */
export interface NgramTableAsset {
  readonly id: string;
  readonly order: number;
  readonly source: TableSource;
  /** 表の元のテキストの注記。画面の図の見方に出す */
  readonly colophon: NgramTableColophon;
  readonly keys: readonly string[];
  readonly counts: readonly number[];
}

/** 表の中身を比べる値。同じ表を同じ次数で選んでいる間は変わらない。抽出のキーに入れる。 */
export function ngramTableAssetKey(asset: NgramTableAsset): { readonly id: string; readonly sha256: string; readonly order: number } {
  return { id: asset.id, sha256: asset.source.archive?.sha256 ?? '', order: asset.order };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, reason: string): never {
  throw new Error(`同梱の表のファイルが壊れている: ${path} ${reason}`);
}

function stringAt(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value === '') fail(`${path}.${key}`, 'が文字列でない');
  return value;
}

const NOT_OBJECT = 'がオブジェクトでない';

function recordAt(record: Record<string, unknown>, key: string, path: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) fail(`${path}.${key}`, NOT_OBJECT);
  return value;
}

function infoAt(record: Record<string, unknown>, key: string, path: string): SegmenterInfo {
  const info = recordAt(record, key, path);
  return { name: stringAt(info, 'name', `${path}.${key}`), version: stringAt(info, 'version', `${path}.${key}`) };
}

/** 取得したJSONを、同梱の表のファイルとして読む。形・次数・件数が合わなければ例外を投げる。 */
export function parseNgramTableFile(raw: unknown): NgramTableFile {
  if (!isRecord(raw)) return fail('', NOT_OBJECT);
  if (raw.version !== NGRAM_TABLE_FILE_VERSION) fail('version', `が${NGRAM_TABLE_FILE_VERSION}でない`);
  const source = recordAt(raw, 'source', '');
  const archive = recordAt(source, 'archive', 'source');
  const corpus = recordAt(source, 'corpus', 'source');
  const colophon = recordAt(source, 'colophon', 'source');
  const segmentation = recordAt(raw, 'segmentation', '');
  const reading = recordAt(raw, 'reading', '');
  const sufficiency = raw.sufficiency;
  if (!Array.isArray(sufficiency) || sufficiency.length === 0) fail('sufficiency', 'が空か配列でない');
  const orders = raw.selectableOrders;
  if (!Array.isArray(orders) || orders.length === 0 || orders.some((order, index) => order !== index)) {
    fail('selectableOrders', 'が0次から途切れずに続く次数の列でない');
  }
  const defaultOrder = raw.defaultOrder;
  if (typeof defaultOrder !== 'number' || !orders.includes(defaultOrder)) fail('defaultOrder', 'が選べる次数にない');
  const tables = raw.tables;
  if (!Array.isArray(tables) || tables.length !== orders.length) fail('tables', 'の数が選べる次数の数と違う');
  const parsedTables = tables.map((table: unknown, index): NgramTableOrder => {
    if (!isRecord(table) || table.order !== index) return fail(`tables[${index}]`, 'の次数が並びと違う');
    const { keys, counts } = table;
    if (!Array.isArray(keys) || !Array.isArray(counts) || keys.length !== counts.length) fail(`tables[${index}]`, 'の鍵と回数の数が違う');
    if (keys.some((key) => typeof key !== 'string' || key.split(BUNSETSU_KEY_SEPARATOR).length !== index + 1)) {
      fail(`tables[${index}].keys`, `に${index + 1}文節でない鍵がある`);
    }
    if (counts.some((count) => !Number.isInteger(count) || (count as number) < 1)) fail(`tables[${index}].counts`, 'に1以上の整数でない値がある');
    return { order: index, keys: keys as string[], counts: counts as number[] };
  });
  const characters = corpus.characters;
  if (typeof characters !== 'number') fail('source.corpus.characters', 'が数でない');
  return {
    version: NGRAM_TABLE_FILE_VERSION,
    id: stringAt(raw, 'id', ''),
    source: {
      name: stringAt(source, 'name', 'source'),
      archive: { fileName: stringAt(archive, 'fileName', 'source.archive'), sha256: stringAt(archive, 'sha256', 'source.archive') },
      corpus: { sha256: stringAt(corpus, 'sha256', 'source.corpus'), characters },
      colophon: {
        work: stringAt(colophon, 'work', 'source.colophon'),
        original: stringAt(colophon, 'original', 'source.colophon'),
        changes: stringAt(colophon, 'changes', 'source.colophon'),
      },
    },
    segmentation: { splitter: infoAt(segmentation, 'splitter', 'segmentation') },
    reading: { library: infoAt(reading, 'library', 'reading'), dictionary: infoAt(reading, 'dictionary', 'reading') },
    sufficiency: sufficiency as OrderSufficiency[],
    selectableOrders: orders as number[],
    defaultOrder,
    tables: parsedTables,
  };
}

/** ファイルの中の統計から導いた選べる次数と既定の次数が、ファイルに書かれた値と同じか。生成の後と読み込みの検査で使う。 */
export function derivedOrdersMatch(file: NgramTableFile): boolean {
  const derived = selectableOrders(file.sufficiency);
  return (
    derived.length === file.selectableOrders.length &&
    derived.every((order, index) => order === file.selectableOrders[index]) &&
    defaultTableOrder(file.sufficiency) === file.defaultOrder
  );
}

/** 解析に渡す出どころ（仕様 §13.6）。標準のコーパスの表。 */
export function tableSourceOfFile(file: NgramTableFile): TableSource {
  return {
    kind: 'corpus',
    name: file.source.name,
    archive: file.source.archive,
    segmentation: { origin: 'splitter', splitter: file.segmentation.splitter },
    reading: file.reading,
  };
}

/** ファイルから、選んだ次数の表を取り出す。選べない次数を渡したら例外を投げる。 */
export function ngramTableAssetOf(file: NgramTableFile, order: number): NgramTableAsset {
  const table = file.tables.find((candidate) => candidate.order === order);
  if (table === undefined) throw new Error(`同梱の表に${order}次は無い（選べる次数: ${file.selectableOrders.join('・')}）`);
  return { id: file.id, order, source: tableSourceOfFile(file), colophon: file.source.colophon, keys: table.keys, counts: table.counts };
}

const MAP_BY_ASSET = new WeakMap<NgramTableAsset, ReadonlyMap<string, number>>();

/** 解析が読む形（鍵 → 出現回数）。同じ表の値には同じ写しを返す。 */
export function ngramTableMap(asset: NgramTableAsset): ReadonlyMap<string, number> {
  const known = MAP_BY_ASSET.get(asset);
  if (known !== undefined) return known;
  const map = new Map<string, number>();
  asset.keys.forEach((key, index) => {
    map.set(key, asset.counts[index]!);
  });
  MAP_BY_ASSET.set(asset, map);
  return map;
}
