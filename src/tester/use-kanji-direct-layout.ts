import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  kanjiDirectLayout,
  kanjiDirectLayoutsVersion,
  kanjiDirectStatus,
  requestKanjiDirectLayout,
  subscribeKanjiDirectLayouts,
  type KanjiDirectStatus,
} from '#input/layouts/kanji-direct-tables.ts';
import type { Layout } from '#input/layouts/types.ts';

/**
 * 選んだ配列が、表を取得する前の漢直の配列（`pendingTable` 付き）なら、表を取得して、取得した配列へ置き換える。
 * 取得するまでは、取得する前の配列をそのまま返す（表由来の項目は空）。ほかの配列は何もせず、`loaded` で返す。
 */
export function useKanjiDirectLayout(selected: Layout): { readonly layout: Layout; readonly status: KanjiDirectStatus } {
  const version = useSyncExternalStore(subscribeKanjiDirectLayouts, kanjiDirectLayoutsVersion, kanjiDirectLayoutsVersion);
  const waiting = selected.pendingTable !== undefined;
  const id = selected.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 取得に失敗した配列を選び直した時（`retryFailedKanjiDirectLayouts`）に取得し直すため、`version`を依存に入れる
  useEffect(() => {
    // 取得に失敗した後は、配列を選び直すまで取得し直さない（`retryFailedKanjiDirectLayouts`）
    if (waiting) void requestKanjiDirectLayout(id);
  }, [waiting, id, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 取得した配列は外部の置き場（`kanji-direct-tables.ts`）にあり、取得が済んだら置き換えるため、`version`を依存に入れる
  return useMemo(() => {
    if (!waiting) return { layout: selected, status: 'loaded' };
    return { layout: kanjiDirectLayout(id) ?? selected, status: kanjiDirectStatus(id) };
  }, [selected, waiting, id, version]);
}
