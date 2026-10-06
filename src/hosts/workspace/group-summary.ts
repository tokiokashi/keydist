import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import type { LinkGroup, WorkspacePaneTarget } from '#engine/workspace.ts';
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

/** 名前の並びを1行の要約にする。空は「未選択」、上限を超えたら「A、B 他N件」。 */
export function summarizeNames(names: readonly string[]): string {
  if (names.length === 0) return '未選択';
  if (names.length <= MAX_NAMES) return names.join('、');
  return `${names.slice(0, MAX_NAMES).join('、')} 他${names.length - MAX_NAMES}件`;
}

/** ペインの見出しの対象と同じ名前（同じ集合の中で区別できる表示名）を付ける。 */
function namer(env: PaneEnvironment): (targets: readonly AnalysisTarget[]) => string[] {
  const { setups, overrides, catalog, resolvedText } = env;
  const setupsById = new Map(setups.map((setup) => [setup.id, setup] as const));
  const setupNumbers = setupNumbersOf(setups);
  return (targets) => nameTargets(targets.map((target) => targetNameSource(
    target,
    resolvePaneInput(target, setupsById, catalog, overrides, resolvedText),
    setupsById,
    setupNumbers,
    catalog.setupCatalog,
  ))).map((named) => named.displayName);
}

/** 組ごとの対象を要約する。連動のメニューで、どの連動がどの対象かを見分けるのに使う。 */
export function summarizeLinkGroups(env: PaneEnvironment, groups: readonly LinkGroup[]): readonly LinkGroupSummary[] {
  const namesOf = namer(env);
  return groups.map((group) => ({
    single: summarizeNames(namesOf([effectiveSingleTarget(group.target.single)])),
    set: summarizeNames(namesOf(group.target.set.targets)),
  }));
}

/** 固定のペインが持つ対象の要約（見出しのボタンの読み上げ名に使う）。 */
export function summarizePaneTarget(env: PaneEnvironment, target: WorkspacePaneTarget): string {
  const namesOf = namer(env);
  return summarizeNames(namesOf(target.kind === 'single' ? [target.target] : target.selection.targets));
}
