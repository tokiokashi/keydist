import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import type { SettingsItemId } from '#engine/settings-items.ts';
import {
  analysisTargetKey,
  effectiveLabel,
  type AnalysisTarget,
  type Setup,
  type SetupCatalog,
  type TargetNameSource,
} from '#input/setup/index.ts';
import {
  conditionHeaderInfoFromResolvedInput,
  nonDefaultConditionRows,
  summarizeNonDefaultConditions,
  traceConditionSummary,
} from './condition-summary.ts';

/**
 * 解決に失敗した対象の名前。実効の物理配列・条件は決まっていないので、手持ちから分かる範囲の
 * 名前だけで作る（失敗メンバーの名前が「—」だけになるのを防ぐ）。
 * 配列・物理配列が消えている時もidは出さない（自作配列のidは内部の値で、画面に出す文言の
 * 読者には意味を持たないため）。同じ説明が並んだ時の区別は`nameTargets`の段階上げに任せる。
 */
function failedDescription(target: AnalysisTarget, setup: Setup | undefined, catalog: SetupCatalog): string {
  const layoutLabel = (layoutId: string) => catalog.layouts.get(layoutId)?.name ?? '見つからない配列';
  if (target.kind === 'layout') return layoutLabel(target.layoutId);
  if (setup === undefined) return '削除されたSetup';
  const shapeLabel = catalog.shapes.get(setup.shapeId)?.name ?? '見つからない物理配列';
  return `${layoutLabel(setup.layoutId)}/${shapeLabel}`;
}

/**
 * 集合対象ページの1メンバーを、`nameTargets`へ渡す形にする（比較表・N感度で同じ組み立て）。
 * `excludeIds`は条件の併記から外す項目（N感度の`windowSize`）。
 */
export function targetNameSource(
  target: AnalysisTarget,
  resolution: ResolvedInputResult | undefined,
  setups: ReadonlyMap<string, Setup>,
  setupNumbers: ReadonlyMap<string, number>,
  catalog: SetupCatalog,
  excludeIds: readonly SettingsItemId[] = [],
): TargetNameSource {
  const setup = target.kind === 'setup' ? setups.get(target.setupId) : undefined;
  const label = effectiveLabel(setup?.label);
  const setupNumber = setup === undefined ? undefined : setupNumbers.get(setup.id);
  const base = {
    key: analysisTargetKey(target),
    kind: target.kind,
    ...(label === undefined ? {} : { label }),
    ...(setupNumber === undefined ? {} : { setupNumber }),
  };
  if (resolution?.ok) {
    const header = conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry);
    const overrideSummary = summarizeNonDefaultConditions(
      nonDefaultConditionRows(traceConditionSummary(resolution.input.cascade, catalog), excludeIds),
    );
    return {
      ...base,
      layoutName: header.layoutName,
      shapeName: header.shapeName,
      ...(overrideSummary === undefined ? {} : { overrideSummary }),
    };
  }
  return { ...base, failed: true, description: failedDescription(target, setup, catalog) };
}
