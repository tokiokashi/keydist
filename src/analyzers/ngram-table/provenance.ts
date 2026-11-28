import type { NgramTableAsset } from '#interpretation/ngram-table-asset.ts';
import type { NgramTableOptions } from './options.ts';
import { SOURCE_TEXT_LABEL } from './pane-meta.ts';

/**
 * 結果に併記する条件（仕様 §13.6）のうち、配列・物理配列・指の割り当て・綴り・親指の条件（対象の条件。条件の要約が出す）を除いたもの。
 * 条件の要約に添える出どころの札になる。
 */
export interface NgramTableProvenanceItem {
  readonly label: string;
  readonly value: string;
  readonly keepWidth?: boolean;
}

const SELECTABLE_ORDERS_LABEL = '選べる次数';

/** 選べる次数は0次から途切れずに続く。1つだけなら、その旨を添える。 */
export function selectableOrdersText(orders: readonly number[]): string {
  const highest = orders[orders.length - 1] ?? 0;
  return highest === 0 ? '0次だけ' : `0次から${highest}次まで`;
}

const integer = new Intl.NumberFormat('ja-JP');

/** 表の出現数 `W` と項目の数 `E`。 */
export function tableSize(asset: NgramTableAsset): { readonly occurrences: number; readonly entries: number } {
  let occurrences = 0;
  for (const count of asset.counts) occurrences += count;
  return { occurrences, entries: asset.keys.length };
}

/** 選んだ表と解析設定から、出どころの札を作る。`asset` が無い間（読み込み中・読み込めなかった）は出さない。 */
export function ngramTableProvenance(asset: NgramTableAsset | undefined, options: NgramTableOptions): readonly NgramTableProvenanceItem[] {
  if (asset === undefined) return [];
  const { source } = asset;
  const archive = source.archive === undefined ? '' : `（${source.archive.fileName}、sha256 ${source.archive.sha256.slice(0, 12)}…）`;
  const size = tableSize(asset);
  const items: NgramTableProvenanceItem[] = [
    { label: '表の次数', value: `${asset.order}次`, keepWidth: true },
    { label: '文節の先読み', value: `${options.lookahead}文節`, keepWidth: true },
    { label: SOURCE_TEXT_LABEL, value: source.kind === 'user-text' ? `選んだテキスト「${source.name}」` : `${source.name}${archive}` },
    { label: SELECTABLE_ORDERS_LABEL, value: selectableOrdersText(asset.selectableOrders), keepWidth: true },
  ];
  if (source.segmentation.origin === 'splitter') {
    items.push({ label: '文節の区切り', value: `${source.segmentation.splitter.name}（${source.segmentation.splitter.version}）、日本語のモデル` });
  } else {
    items.push({ label: '文節の区切り', value: '利用者の指定' });
  }
  // 選んだテキストの読みの辞書は、ペインが読みの変換の項目として別に出す（読みの直しと一緒に）
  if (source.reading !== null && source.kind === 'corpus') {
    const { dictionary } = source.reading;
    items.push({ label: '読みの辞書', value: `${dictionary.name}（${dictionary.version}）` });
  }
  const { colophon } = asset;
  if (colophon.original !== '') items.push({ label: '底本・入力・校正など', value: colophon.original.replaceAll('\n', ' ').replace(/\s+/g, ' ') });
  items.push({ label: '加えた変更', value: asset.changesText });
  items.push({ label: '表の規模', value: `出現数 ${integer.format(size.occurrences)}、項目 ${integer.format(size.entries)}` });
  return items;
}
