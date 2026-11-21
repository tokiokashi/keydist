import { useMemo, useSyncExternalStore } from 'react';
import { kanjiDirectLayoutsVersion, subscribeKanjiDirectLayouts } from '#input/layouts/kanji-direct-tables.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { paneCatalog } from './catalog.ts';

/**
 * 資産からペインのカタログを組み立てる。カタログが読む資産（自作の配列・ローマ字規則・指の割り当て・コンボの組・個人速度・打鍵の記録）が
 * 変わった時と、組み込みの漢直の配列の表の取得の状態が変わった時だけ作り直す。それ以外の資産（Setupや文章など）の書き込みでは同じ値を返す。
 */
export function usePaneCatalog(
  assets: Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments' | 'comboSets' | 'personalSpeed' | 'keystrokeRecords'>,
): PaneCatalog {
  const { userLayouts, userRomajiRules, fingerAssignments, comboSets, personalSpeed, keystrokeRecords } = assets;
  const kanjiDirectVersion = useSyncExternalStore(subscribeKanjiDirectLayouts, kanjiDirectLayoutsVersion, kanjiDirectLayoutsVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 漢直の配列の表は外部の置き場（`kanji-direct-tables.ts`）にあり、取得が済んだらカタログを作り直すため、`kanjiDirectVersion`を依存に入れる
  return useMemo(
    () => paneCatalog({ userLayouts, userRomajiRules, fingerAssignments, comboSets, personalSpeed, keystrokeRecords }),
    [userLayouts, userRomajiRules, fingerAssignments, comboSets, personalSpeed, keystrokeRecords, kanjiDirectVersion],
  );
}
