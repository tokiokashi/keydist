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

/** 表の元のテキストに加えた変更（画面に出す文。表のファイルの `colophon.changes` は作業履歴として別に持つ）。 */
const CHANGES_TEXT =
  'ルビ・入力者注・外字の注・章見出しの行を取り除き、漢字を含む語を辞書の読みに置き換えて文節に区切り、文節の読みの並びの出現回数だけを数えました。';

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
    { label: SOURCE_TEXT_LABEL, value: `${source.name}${archive}` },
  ];
  if (source.segmentation.origin === 'splitter') {
    items.push({ label: '文節の区切り', value: `${source.segmentation.splitter.name}（${source.segmentation.splitter.version}）、日本語のモデル` });
  } else {
    items.push({ label: '文節の区切り', value: '利用者の指定' });
  }
  if (source.reading !== null) {
    const { dictionary } = source.reading;
    items.push({ label: '読みの辞書', value: `${dictionary.name}（${dictionary.version}）` });
  }
  const { colophon } = asset;
  items.push({ label: '底本・入力・校正など', value: colophon.original.replaceAll('\n', ' ').replace(/\s+/g, ' ') });
  items.push({ label: '加えた変更', value: CHANGES_TEXT });
  items.push({ label: '表の規模', value: `出現数 ${integer.format(size.occurrences)}、項目 ${integer.format(size.entries)}` });
  return items;
}
