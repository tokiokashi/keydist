import { useMemo } from 'react';
import { withMultiTargets } from '#engine/multi-target-selection.ts';
import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import type { WorkspacePaneTarget, WorkspaceTarget } from '#engine/workspace.ts';
import { nameTargets } from '#input/setup/index.ts';
import type { PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import { resolvePaneInput } from '#hosts/shared/resolve-pane-input.ts';
import { setupNumbersOf, targetChoiceGroups } from '#hosts/shared/target-choices.ts';
import { targetNameSource } from '#hosts/shared/target-name-source.ts';
import { TargetSelection } from '#hosts/shared/TargetSelection.tsx';
import { useSetTargetSelection } from '#hosts/shared/use-set-target-selection.ts';

/**
 * Workspaceの対象の選択（文脈バーに置く。docs/architecture.md「Workspace」）。対象を1つ見るAnalyzer用の1つと、
 * 集合を見るAnalyzer用の集合を別々に選ぶ。書き換えると、Workspaceに従うペインが一括で追従する。
 * 固定のペインは動かない。
 */
export function WorkspaceTargetBar({
  env,
  target,
  onChange,
}: {
  readonly env: PaneEnvironment;
  readonly target: WorkspaceTarget;
  readonly onChange: (next: WorkspacePaneTarget) => void;
}) {
  return (
    <div className="workspace-target-bar" role="group" aria-label="Workspaceの対象">
      <span className="workspace-target-bar-key">対象</span>
      <SingleTargetChip env={env} target={target} onChange={onChange} />
      <SetTargetChip env={env} target={target} onChange={onChange} />
    </div>
  );
}

interface ChipProps {
  readonly env: PaneEnvironment;
  readonly target: WorkspaceTarget;
  readonly onChange: (next: WorkspacePaneTarget) => void;
}

function SingleTargetChip({ env, target, onChange }: ChipProps) {
  const { setups, overrides, catalog, resolvedText } = env;
  const current = effectiveSingleTarget(target.single);
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const named = useMemo(() => nameTargets([targetNameSource(
    current,
    resolvePaneInput(current, setupsById, catalog, overrides, resolvedText),
    setupsById,
    setupNumbers,
    catalog.setupCatalog,
  )])[0], [current, setupsById, catalog, overrides, resolvedText, setupNumbers]);
  const groups = useMemo(() => targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups,
    selected: [current],
  }), [catalog, setups, current]);
  return (
    <span className="workspace-target-chip">
      <span className="workspace-target-bar-key">Single</span>
      <TargetSelection
        mode="single"
        label="Workspaceの対象（Single）"
        groups={groups}
        selected={[current]}
        summary={named === undefined ? [] : [{ key: named.key, label: named.displayName, fullName: named.fullName }]}
        onChange={(next) => {
          if (next[0] !== undefined) onChange({ kind: 'single', target: next[0] });
        }}
      />
    </span>
  );
}

function SetTargetChip({ env, target, onChange }: ChipProps) {
  const { setups, overrides, catalog, resolvedText } = env;
  const selection = target.set;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const { choiceGroups, targets, colorByKey } = useSetTargetSelection(selection, setups, catalog);
  // 表示名は集合全体に対して計算する（比較表・N感度のペインと同じ）。
  const named = useMemo(() => nameTargets(targets.map((t) => targetNameSource(
    t,
    resolvePaneInput(t, setupsById, catalog, overrides, resolvedText),
    setupsById,
    setupNumbers,
    catalog.setupCatalog,
  ))), [targets, setupsById, catalog, overrides, resolvedText, setupNumbers]);
  const summary = useMemo(() => named.map((n) => ({
    key: n.key,
    label: n.displayName,
    fullName: n.fullName,
    color: colorByKey.get(n.key),
  })), [named, colorByKey]);
  return (
    <span className="workspace-target-chip">
      <span className="workspace-target-bar-key">Multi</span>
      <TargetSelection
        mode="multiple"
        label="Workspaceの対象（Multi）"
        groups={choiceGroups}
        selected={targets}
        summary={summary}
        onChange={(next) => onChange({ kind: 'set', selection: withMultiTargets(selection, next) })}
      />
    </span>
  );
}
