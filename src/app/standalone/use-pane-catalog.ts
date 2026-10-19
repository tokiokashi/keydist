import { useMemo } from 'react';
import type { KeydistAssets } from '#engine/commands.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { paneCatalog } from './catalog.ts';

/**
 * 資産からペインのカタログを組み立てる。カタログが読む資産（自作の配列・ローマ字規則・指の割り当て・個人速度）が
 * 変わった時だけ作り直す。それ以外の資産（Setupや文章など）の書き込みでは同じ値を返す。
 */
export function usePaneCatalog(assets: Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments' | 'personalSpeed'>): PaneCatalog {
  const { userLayouts, userRomajiRules, fingerAssignments, personalSpeed } = assets;
  return useMemo(
    () => paneCatalog({ userLayouts, userRomajiRules, fingerAssignments, personalSpeed }),
    [userLayouts, userRomajiRules, fingerAssignments, personalSpeed],
  );
}
