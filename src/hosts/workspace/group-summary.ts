import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import type { LinkGroup } from '#engine/workspace.ts';
import { nameTargets, type AnalysisTarget } from '#input/setup/index.ts';
import type { PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import { resolvePaneInput } from '#hosts/shared/resolve-pane-input.ts';
import { setupNumbersOf } from '#hosts/shared/target-choices.ts';
import { targetNameSource } from '#hosts/shared/target-name-source.ts';

/** 連動の組1つの対象の要約。Analyzerの種類（対象を1つ見る / 集合を見る）ごとに1つずつ。 */
export interface LinkGroupSummary {
  readonly single: string;
  readonly set: string;
}

/** 名前を並べる件数の上限。これを超えたら「他N件」に畳む（メニューの1行に収めるため）。 */
const MAX_NAMES = 2;

/**
 * ペインの見出しの対象と同じ名前（同じ集合の中で区別できる表示名）で、組ごとの対象を要約する。
 * ピンのメニューで、どのリンクがどの対象かを見分けるのに使う。
 */
export function summarizeLinkGroups(env: PaneEnvironment, groups: readonly LinkGroup[]): readonly LinkGroupSummary[] {
  const { setups, overrides, catalog, resolvedText } = env;
  const setupsById = new Map(setups.map((setup) => [setup.id, setup] as const));
  const setupNumbers = setupNumbersOf(setups);
  const namesOf = (targets: readonly AnalysisTarget[]) => nameTargets(targets.map((target) => targetNameSource(
    target,
    resolvePaneInput(target, setupsById, catalog, overrides, resolvedText),
    setupsById,
    setupNumbers,
    catalog.setupCatalog,
  ))).map((named) => named.displayName);

  return groups.map((group) => {
    const single = namesOf([effectiveSingleTarget(group.target.single)])[0] ?? '未選択';
    const names = namesOf(group.target.set.targets);
    const set = names.length === 0
      ? '未選択'
      : names.length <= MAX_NAMES
        ? names.join('、')
        : `${names.slice(0, MAX_NAMES).join('、')} 他${names.length - MAX_NAMES}件`;
    return { single, set };
  });
}
