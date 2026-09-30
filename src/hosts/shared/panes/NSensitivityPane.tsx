import { useMemo, useState } from 'react';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import type { MultiTargetSelection } from '#engine/multi-target-selection.ts';
import { analysisTargetKey, nameTargets, type AnalysisTarget, type NamedTarget } from '#input/setup/index.ts';
import { nSensitivityAnalyzer, type NSensitivityRowContext } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import {
  conditionHeaderInfoFromResolvedInput,
  globalConditionValues,
  multiTargetConditionSummary,
  traceConditionSummary,
  type ConditionValueNames,
} from '../condition-summary.ts';
import { PaneFrame } from '../PaneFrame.tsx';
import { resolvePaneInput } from '../resolve-pane-input.ts';
import { targetNameSource } from '../target-name-source.ts';
import { setupNumbersOf } from '../target-choices.ts';
import { TargetSelection } from '../TargetSelection.tsx';
import { useAnalyzerSetPane } from '../use-analyzer-set-pane.ts';
import { useSetTargetSelection } from '../use-set-target-selection.ts';
import type { PaneChrome, PaneEnvironment } from './pane-environment.ts';

/**
 * N感度のペイン（対象の集合を見るAnalyzer）。個別画面とWorkspaceのペインが同じこのcomponentを使う。
 * `ComparisonPane`と同じ形だが、基準の概念を持たない（集合の基準は触らない）。
 */
export interface NSensitivityPaneProps {
  readonly env: PaneEnvironment;
  readonly chrome?: PaneChrome;
  readonly selection: MultiTargetSelection;
  readonly onTargetsChange: (next: readonly AnalysisTarget[]) => void;
  readonly options: NSensitivityOptions;
  readonly onOptionsChange: (next: NSensitivityOptions) => void;
  readonly settingsDiagnostics?: readonly CodecDiagnostic[];
  /** 共有リンクを開いた時に、取り込めなかったものを伝える文。 */
  readonly linkNotices?: readonly string[];
}

/** Nはこのペイン自身が掃引する軸なので、条件の要約からは除く。 */
const N_SENSITIVITY_CONDITION_EXCLUDE_IDS = ['windowSize'] as const;

function buildRowContext(
  target: AnalysisTarget,
  resolution: ResolvedInputResult,
  named: NamedTarget,
  color: string,
): NSensitivityRowContext {
  const targetKey = analysisTargetKey(target);
  if (resolution.ok) {
    const header = conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry);
    return {
      targetKey,
      label: named.displayName,
      fullName: named.fullName,
      layoutName: header.layoutName,
      geometryName: header.shapeName,
      fingerAssignmentName: header.fingerAssignmentName,
      color,
    };
  }
  return {
    targetKey,
    label: named.displayName,
    fullName: named.fullName,
    layoutName: named.fullName,
    geometryName: '—',
    fingerAssignmentName: '—',
    color,
  };
}

export function NSensitivityPane({
  env,
  chrome = {},
  selection,
  onTargetsChange,
  options,
  onOptionsChange,
  settingsDiagnostics = [],
  linkNotices,
}: NSensitivityPaneProps) {
  const { setups, overrides, catalog, resolvedText, cache, dispatch, assetsReady } = env;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);
  const { choiceGroups, targets, colorByKey } = useSetTargetSelection(selection, setups, catalog);

  // 対象の選択を開いているか。空の時のペインのボタンからも開くので、ここで持つ。
  const [selectionOpen, setSelectionOpen] = useState(false);

  const members: readonly EngineSetMemberInput[] = useMemo(
    () => targets.map((target): EngineSetMemberInput => ({
      target,
      resolution: resolvePaneInput(target, setupsById, catalog, overrides, resolvedText),
    })),
    [targets, setupsById, catalog, overrides, resolvedText],
  );
  const membersByTarget = useMemo(() => new Map(members.map((m) => [m.target, m] as const)), [members]);

  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const namedTargets = useMemo(() => nameTargets(targets.map((target) => targetNameSource(
    target,
    membersByTarget.get(target)?.resolution,
    setupsById,
    setupNumbers,
    catalog.setupCatalog,
    N_SENSITIVITY_CONDITION_EXCLUDE_IDS,
  ))), [targets, setupsById, setupNumbers, membersByTarget, catalog.setupCatalog]);
  const namedByKey = useMemo(() => new Map(namedTargets.map((n) => [n.key, n] as const)), [namedTargets]);

  const targetSummary = useMemo(() => targets.map((target) => {
    const key = analysisTargetKey(target);
    const named = namedByKey.get(key);
    return { key, label: named?.displayName ?? key, fullName: named?.fullName ?? '', color: colorByKey.get(key) };
  }), [targets, namedByKey, colorByKey]);

  const conditionNames: ConditionValueNames = catalog.setupCatalog;
  const rowContext = useMemo(() => {
    const map = new Map<string, NSensitivityRowContext>();
    // 色は集合が配った番号から引く（加えた順。表示順とは別）。
    members.forEach((member) => {
      const key = analysisTargetKey(member.target);
      const named = namedByKey.get(key);
      const color = colorByKey.get(key);
      if (named === undefined || color === undefined) return;
      map.set(key, buildRowContext(member.target, member.resolution, named, color));
    });
    return map;
  }, [members, namedByKey, colorByKey]);

  // 条件の要約は、共通の条件と、対象ごとに違う条件（Setupの上書き）に分けて出す。
  const conditionSummary = useMemo(() => multiTargetConditionSummary(
    members.flatMap((member) => {
      if (!member.resolution.ok) return [];
      const key = analysisTargetKey(member.target);
      return [{
        key,
        label: namedByKey.get(key)?.displayName ?? key,
        rows: traceConditionSummary(member.resolution.input.cascade, conditionNames),
      }];
    }),
    { excludeIds: N_SENSITIVITY_CONDITION_EXCLUDE_IDS, globalValues: globalConditionValues(overrides), names: conditionNames },
  ), [members, namedByKey, conditionNames, overrides]);

  const order = useMemo(() => targets.map(analysisTargetKey), [targets]);

  const pane = useAnalyzerSetPane(cache, nSensitivityAnalyzer.definition, options, members);
  const { Body, Settings } = nSensitivityAnalyzer;
  const extraction = pane.extraction;
  const extracted = extraction.status === 'ready' || extraction.status === 'stale' ? extraction.value.extracted : undefined;

  return (
    <PaneFrame
      name={nSensitivityAnalyzer.name}
      description={nSensitivityAnalyzer.description}
      headingLevel={chrome.headingLevel}
      stickyHeader={chrome.stickyHeader}
      menuItems={chrome.menuItems}
      targetBinding={chrome.targetBinding}
      showPaneNameInSettings={chrome.showPaneNameInSettings}
      target={(
        <TargetSelection
          mode="multiple"
          groups={choiceGroups}
          selected={targets}
          summary={targetSummary}
          onChange={onTargetsChange}
          open={selectionOpen}
          onOpenChange={setSelectionOpen}
          autoOpen={assetsReady && chrome.autoOpenTargetSelection ? targets.length === 0 && !chrome.holdTargetSelectionClosed : undefined}
        />
      )}
      settings={<Settings options={options} onOptionsChange={onOptionsChange} />}
      onResetOptions={() => onOptionsChange(nSensitivityAnalyzer.defaultOptions)}
      conditionRows={conditionSummary.rows}
      conditionEditor={{
        overrides,
        dispatch,
        presetLibrary: env.presetLibrary,
        generatePresetId: env.generatePresetId,
        undo: env.undo,
        shapes: catalog.setupCatalog.shapes,
        customFingerAssignments: catalog.customFingerAssignments,
        customRomajiRules: catalog.customRomajiRules,
        hiddenIds: N_SENSITIVITY_CONDITION_EXCLUDE_IDS,
      }}
      conditionTargetDiffs={conditionSummary.diffs}
      engineState={extraction}
      settingsDiagnostics={settingsDiagnostics}
      linkNotices={linkNotices}
      {...(targets.length === 0
        ? {
          // 資産の読み込み前は保存済みの対象が未反映なだけで、空とは限らない。
          // 押せないボタンが一瞬見えてから表に置き換わるのを避けるため、空のペインにする
          emptyContent: assetsReady ? (
            <button type="button" className="pane-empty-button" onClick={() => setSelectionOpen(true)}>
              配列・Setupを選ぶ
            </button>
          ) : null,
        }
        : {})}
    >
      {extracted === undefined ? undefined : (
        <Body extracted={extracted} order={order} rowContext={rowContext} options={options} />
      )}
    </PaneFrame>
  );
}
