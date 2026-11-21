import { readFileSync } from 'node:fs';
import { KANJI_DIRECT_DECLARATIONS, kanjiDirectLayout, registerKanjiDirectTable } from '#input/layouts/kanji-direct-tables.ts';
import { LAYOUT_BY_ID, LAYOUTS_JA } from '#input/layouts/index.ts';
import type { Layout } from '#input/layouts/types.ts';

/**
 * 漢直の組み込みの配列の表を、ディスクから読んで置く（ブラウザでは `platform/layouts/kanji-direct-loader.ts` が取得する）。
 * このファイルをimportした時に、すべての表を置く。表を取得する前の配列（`pendingTable` 付き）を表から作った配列へ置き換えるには `withKanjiDirectTables` を通す。
 */
for (const declaration of KANJI_DIRECT_DECLARATIONS) {
  const file = new URL(`../src/input/layouts/tables/${declaration.tableFile}`, import.meta.url);
  registerKanjiDirectTable(declaration.id, JSON.parse(readFileSync(file, 'utf8')) as unknown);
}

/** 表から作った配列。表を別のファイルとして配る配列のidでなければ例外を投げる。 */
export function loadedKanjiDirectLayout(id: string): Layout {
  const layout = kanjiDirectLayout(id);
  if (layout === undefined || layout.pendingTable !== undefined) throw new Error(`表を置いた漢直の配列ではない: ${id}`);
  return layout;
}

/** 表を取得する前の配列を、表から作った配列へ置き換える。ほかの配列はそのまま。 */
export function withKanjiDirectTables(layouts: readonly Layout[]): Layout[] {
  return layouts.map((layout) => (layout.pendingTable === undefined ? layout : loadedKanjiDirectLayout(layout.id)));
}

/** 配列のid → 配列の写像の、表を取得する前の配列を、表から作った配列へ置き換えたもの。 */
export function mapWithKanjiDirectTables(layouts: ReadonlyMap<string, Layout>): Map<string, Layout> {
  return new Map([...layouts].map(([id, layout]) => [id, layout.pendingTable === undefined ? layout : loadedKanjiDirectLayout(id)]));
}

/** 組み込みの配列のid → 配列の写像。漢直の配列は表から作った配列。 */
export const LOADED_LAYOUT_BY_ID: ReadonlyMap<string, Layout> = mapWithKanjiDirectTables(LAYOUT_BY_ID);

/** 組み込みの日本語の配列。漢直の配列は表から作った配列。 */
export const LOADED_LAYOUTS_JA: readonly Layout[] = withKanjiDirectTables(LAYOUTS_JA);
