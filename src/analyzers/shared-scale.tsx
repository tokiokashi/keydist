import { createContext, useContext, useEffect, useId, useSyncExternalStore } from 'react';
import type { ScaleRange, ScaleRegistry } from './shared-scale.ts';

/**
 * ペインどうしで揃える目盛りの、Reactとの結び目（docs/architecture.md「ペインどうしで揃える目盛り」）。
 *
 * 器（Workspace）が`SharedScaleProvider`で集める所を置く。本体は`useSharedScale`で自分の範囲を報告し、
 * 全体の範囲を受け取る。Providerが無い場所（個別画面）では報告先が無く、自分の範囲がそのまま返る。
 */
const SharedScaleContext = createContext<ScaleRegistry | undefined>(undefined);

export const SharedScaleProvider = SharedScaleContext.Provider;

const NONE = (): undefined => undefined;
const NO_SUBSCRIBE = (): (() => void) => () => undefined;

/**
 * `key`（Analyzerと見る量）の目盛りの範囲。返すのは、同じキーで報告している全ペインを含む範囲。
 *
 * 報告は描画のあとの副作用で行い、値（最小・最大）が変わった時だけ出し直す。報告は全体の範囲を
 * 自分の範囲の上位集合にするだけで、自分の範囲は全体の範囲に依らないので、報告が循環しない。
 * 閉じる・対象や見る量を変えて本体が消えると、そのペインの範囲は外れる。
 */
export function useSharedScale(key: string, own: ScaleRange): ScaleRange {
  const registry = useContext(SharedScaleContext);
  const owner = useId();
  const { min, max } = own;
  useEffect(() => {
    if (registry === undefined) return undefined;
    registry.report(key, owner, { min, max });
    return () => registry.report(key, owner, undefined);
  }, [registry, key, owner, min, max]);
  const shared = useSyncExternalStore(
    registry?.subscribe ?? NO_SUBSCRIBE,
    () => registry?.rangeOf(key),
    NONE,
  );
  if (shared === undefined) return own;
  // 報告が済む前の描画でも、自分の範囲は必ず含める
  return {
    min: Math.min(shared.min, min),
    max: Math.max(shared.max, max),
  };
}
