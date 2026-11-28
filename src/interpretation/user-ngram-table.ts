import type { SegmenterInfo } from '#input/text/segmentation.ts';
import { buildCorpusNgramTables } from './corpus-ngram.ts';
import { defaultTableOrder, selectableOrders } from './ngram-table-analysis.ts';
import type { NgramTableSet } from './ngram-table-asset.ts';
import { textDigest } from './record/keystroke-record.ts';

/**
 * 利用者のテキストから作る、文節の読みの表（定義は`spec/distance-model.md` §13.8）。
 * 数え方と統計が足りているかの量は標準のコーパスと同じ（`docs/corpus-ngram.md`）で、入力だけが違う。
 */

/** 数える次数の上限。解析設定で持てる次数の上限（`analyzers/ngram-table/options.ts`の`MAX_TABLE_ORDER`）と同じ。 */
export const USER_TABLE_MAX_ORDER = 5;

/** 表の識別子。利用者のテキストの表はどれもこの識別子で、中身は`contentKey`が見分ける。 */
export const USER_TABLE_ID = 'user-text';

/** 利用者のテキストの表の、条件の要約に出す「加えた変更」の文。 */
export const USER_TEXT_CHANGES_TEXT =
  '漢字を含む語を、読みの直しを当てた辞書の読みに置き換えて文節に区切り、文節の読みの並びの出現回数だけを数えました。';

/** 表を作る入力。計算用Workerへ複製して渡す値。 */
export interface UserNgramTableRequest {
  /** 表の元のテキストの名前 */
  readonly name: string;
  /** 利用者の読みの直しを当てた、読みのテキスト（仕様 §4.6の1段目まで） */
  readonly readingText: string;
  /** 文節の区切り。読みのテキストのコードポイントの位置（先頭と末尾を含まない） */
  readonly boundaries: readonly number[];
  readonly splitter: SegmenterInfo;
  /** 読みに直したなら、その変換器と辞書。読みに直さなかった（漢字が無い・辞書を読み込めなかった）ならnull */
  readonly reading: { readonly library: SegmenterInfo; readonly dictionary: SegmenterInfo } | null;
}

const info = (value: SegmenterInfo): string => `${value.name}@${value.version}`;

/**
 * 表の中身を見分ける値。読みのテキストと区切りは長いので、非暗号の照合値（`textDigest`）と長さで持つ。
 * 異なる入力が同じ値になるのは、照合値の64ビットと長さが全部一致する時だけで、その時も影響は利用者自身のテキストの表1つに限る。
 */
export function userTableContentKey(request: UserNgramTableRequest): string {
  const { readingText, boundaries, splitter, reading } = request;
  return [
    textDigest(readingText),
    readingText.length,
    textDigest(boundaries.join(',')),
    boundaries.length,
    info(splitter),
    reading === null ? 'no-reading' : `${info(reading.library)}|${info(reading.dictionary)}`,
  ].join('|');
}

/**
 * 読みのテキストと区切りから、表を作る。
 * 選べる次数と既定の次数は、標準のコーパスと同じ規則（仕様 §13.5）でこのテキストの統計から決める。
 */
export function buildUserNgramTable(request: UserNgramTableRequest): NgramTableSet {
  const built = buildCorpusNgramTables(request.readingText, request.boundaries, USER_TABLE_MAX_ORDER);
  const { sufficiency } = built.bunsetsu;
  const orders = selectableOrders(sufficiency);
  return {
    id: USER_TABLE_ID,
    contentKey: userTableContentKey(request),
    source: {
      kind: 'user-text',
      name: request.name,
      segmentation: { origin: 'splitter', splitter: request.splitter },
      reading: request.reading,
    },
    colophon: { work: request.name, original: '', changes: USER_TEXT_CHANGES_TEXT },
    changesText: USER_TEXT_CHANGES_TEXT,
    sufficiency,
    selectableOrders: orders,
    defaultOrder: defaultTableOrder(sufficiency),
    tables: orders.map((order) => {
      // 出現回数の多い順、同じなら鍵の順。同じ入力から同じ並びの表を作る
      const entries = [...built.bunsetsu.tables[order]!].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return { order, keys: entries.map(([key]) => key), counts: entries.map(([, count]) => count) };
    }),
  };
}
