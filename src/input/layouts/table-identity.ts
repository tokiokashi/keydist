/**
 * 表を別のファイルとして配る組み込みの配列（`kanji-direct-tables.ts`）に付ける識別子。
 *
 * 表から作った配列は数十MBあり、キャッシュのキーに中身を畳み込むと、キーの文字列化とWorkerへの複製に秒単位の時間がかかる。
 * 識別子は、配列のidと表の中身から決まる短い文字列で、同じ識別子の配列は必ず同じ中身になる（同じ表から同じ関数で作るため）。
 * キーは、識別子を持つ配列を識別子で代用する（`engine/keys.ts`）。Workerへは、配列の代わりに元の表（数百KB）を1度だけ送り、
 * Workerが同じ関数で配列を作る（`engine/worker-wire.ts`）。
 *
 * 識別子は配列のオブジェクトに結びつける。`{ ...layout }` やコンボの重ね合わせのように配列を派生させると、
 * 派生した配列は別のオブジェクトなので識別子を持たず、中身でキーを作る。派生が中身を変えても、識別子が残って古い結果を返すことはない。
 * 識別子を付けられるのは `tableLayoutWithIdentity` だけで、表と、表から配列を作る関数を渡した時に限る。
 */
import type { Layout } from './types.ts';

declare const tableIdentityBrand: unique symbol;

/** 配列のidと表の中身から決まる識別子。`tableLayoutWithIdentity` が作る。 */
export type TableIdentity = string & { readonly [tableIdentityBrand]: true };

/** 識別子と、配列を作った表。配列のオブジェクトに結びつける。 */
interface TableSource {
  readonly identity: TableIdentity;
  readonly table: unknown;
}

const sources = new WeakMap<Layout, TableSource>();

/** 文字列の53bitのハッシュ（cyrb53）。表は3本しか無く、キャッシュのキーに使うので、衝突の確率（約2^-53）は許容する。 */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** 表（JSON）から配列を作り、配列のidと表の中身から決まる識別子を付けて返す。 */
export function tableLayoutWithIdentity(table: unknown, layoutFromTable: (table: unknown) => Layout): Layout {
  const layout = layoutFromTable(table);
  sources.set(layout, { identity: `${layout.id}:${hash53(JSON.stringify(table))}` as TableIdentity, table });
  return layout;
}

/** 識別子を持つ配列の識別子。派生した配列・自作の配列は持たない。 */
export function tableIdentityOf(layout: Layout): TableIdentity | undefined {
  return sources.get(layout)?.identity;
}

/** 識別子を持つ配列を作った表。派生した配列・自作の配列は持たない。 */
export function tableSourceOf(layout: Layout): { readonly identity: string; readonly table: unknown } | undefined {
  return sources.get(layout);
}
