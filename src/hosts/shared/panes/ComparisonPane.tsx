import { useMemo, useState } from 'react';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import { effectiveMultiBaseline, type MultiTargetSelection } from '#engine/multi-target-selection.ts';
import { analysisTargetKey, nameTargets, type AnalysisTarget, type NamedTarget } from '#input/setup/index.ts';
import { comparisonAnalyzer, type ComparisonRowContext } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import {
  globalConditionValues,
  multiTargetConditionSummary,
  traceConditionSummary,
  type ConditionValueNames,
} from '../condition-summary.ts';
import { recommendedWidthRemOf } from '#analyzers/recommended-width.ts';
import { PaneFrame } from '../PaneFrame.tsx';
import { resolvePaneInput } from '../resolve-pane-input.ts';
import { targetNameSource } from '../target-name-source.ts';
import { setupNumbersOf } from '../target-choices.ts';
import { TargetSelection } from '../TargetSelection.tsx';
import { useAnalyzerSetPane } from '../use-analyzer-set-pane.ts';
import { useSetTargetSelection } from '../use-set-target-selection.ts';
import type { PaneChrome, PaneEnvironment } from './pane-environment.ts';

/**
 * 比較表のペイン（対象の集合を見るAnalyzer）。個別画面とWorkspaceのペインが同じこのcomponentを使う。
 * 値の持ち主（集合・解析設定をどこへ保存するか）は器が決め、ここには集合の値と変更の通知だけを渡す
 * （`BigramFlowPane`と同じ分担）。
 */
export interface ComparisonPaneProps {
  readonly env: PaneEnvironment;
  readonly chrome?: PaneChrome;
  /** 選んだ対象・色の番号・基準。 */
  readonly selection: MultiTargetSelection;
  readonly onTargetsChange: (next: readonly AnalysisTarget[]) => void;
  /** 基準にする対象。`undefined`で「基準なし」。 */
  readonly onBaselineChange: (next: AnalysisTarget | undefined) => void;
  readonly options: ComparisonOptions;
  readonly onOptionsChange: (next: ComparisonOptions) => void;
  readonly settingsDiagnostics?: readonly CodecDiagnostic[];
  /** 共有リンクを開いた時に、取り込めなかったものを伝える文。 */
  readonly linkNotices?: readonly string[];
}

function buildRowContext(target: AnalysisTarget, named: NamedTarget): ComparisonRowContext {
  return { targetKey: analysisTargetKey(target), label: named.displayName, fullName: named.fullName };
}

export function ComparisonPane({
  env,
  chrome = {},
  selection,
  onTargetsChange,
  onBaselineChange,
  options,
  onOptionsChange,
  settingsDiagnostics = [],
  linkNotices,
}: ComparisonPaneProps) {
  const { setups, overrides, catalog, resolvedText, cache, dispatch, assetsReady } = env;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);
  const { choiceGroups, targets, colorByKey } = useSetTargetSelection(selection, setups, catalog);

  // 対象の選択を開いているか。空の時のペインのボタンからも開くので、ここで持つ。
  const [selectionOpen, setSelectionOpen] = useState(false);

  // 各メンバーの解決済み入力（または解決失敗）。表示順（`targets`）のまま作る
  // （engineの抽出キーが順序込みで畳み込む対象。#544 §7）。
  const members: readonly EngineSetMemberInput[] = useMemo(
    () => targets.map((target): EngineSetMemberInput => ({
      target,
      resolution: resolvePaneInput(target, setupsById, catalog, overrides, resolvedText),
    })),
    [targets, setupsById, catalog, overrides, resolvedText],
  );
  const membersByTarget = useMemo(() => new Map(members.map((m) => [m.target, m] as const)), [members]);

  // 表示名は常に集合全体に対して計算する（#578指摘2「表示名は常に同じ画面に並ぶ集合に
  // 対して計算する」）。解決に失敗したメンバーは、共通性の判定からは除く
  // （レビュー指摘3。`naming.ts`の`TargetNameSource.failed`参照）。
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const namedTargets = useMemo(() => nameTargets(targets.map((target) => targetNameSource(
    target,
    membersByTarget.get(target)?.resolution,
    setupsById,
    setupNumbers,
    catalog.setupCatalog,
  ))), [targets, setupsById, setupNumbers, membersByTarget, catalog.setupCatalog]);
  const namedByKey = useMemo(() => new Map(namedTargets.map((n) => [n.key, n] as const)), [namedTargets]);

  const targetSummary = useMemo(() => targets.map((target) => {
    const key = analysisTargetKey(target);
    const named = namedByKey.get(key);
    return { key, label: named?.displayName ?? key, fullName: named?.fullName ?? '', color: colorByKey.get(key) };
  }), [targets, namedByKey, colorByKey]);

  const conditionNames: ConditionValueNames = catalog.setupCatalog;
  const rowContext = useMemo(() => {
    const map = new Map<string, ComparisonRowContext>();
    for (const member of members) {
      const key = analysisTargetKey(member.target);
      const named = namedByKey.get(key);
      if (named === undefined) continue;
      map.set(key, buildRowContext(member.target, named));
    }
    return map;
  }, [members, namedByKey]);

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
    { globalValues: globalConditionValues(overrides), names: conditionNames },
  ), [members, namedByKey, conditionNames, overrides]);

  const order = useMemo(() => targets.map(analysisTargetKey), [targets]);

  const pane = useAnalyzerSetPane(cache, comparisonAnalyzer.definition, options, members);
  const { Body, Settings, TargetItem } = comparisonAnalyzer;
  const extraction = pane.extraction;
  const extracted = extraction.status === 'ready' || extraction.status === 'stale' ? extraction.value.extracted : undefined;

  const effectiveBaseline = effectiveMultiBaseline(selection);
  const baselineTargetKey = effectiveBaseline === undefined ? undefined : analysisTargetKey(effectiveBaseline);
  const candidates = order.map((key) => ({
    key,
    label: namedByKey.get(key)?.displayName ?? key,
    fullName: namedByKey.get(key)?.fullName ?? '',
  }));

  return (
    <PaneFrame
      name={comparisonAnalyzer.name}
      description={comparisonAnalyzer.description}
      recommendedWidthRem={recommendedWidthRemOf(comparisonAnalyzer)}
      headingLevel={chrome.headingLevel}
      stickyHeader={chrome.stickyHeader}
      menuItems={chrome.menuItems}
      headerAction={chrome.headerAction}
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
          extraItem={(
            <TargetItem
              value={baselineTargetKey}
              candidates={candidates}
              onChange={(nextKey) => {
                const next = nextKey === undefined ? undefined : targets.find((t) => analysisTargetKey(t) === nextKey);
                onBaselineChange(next);
              }}
            />
          )}
        />
      )}
      settings={<Settings options={options} onOptionsChange={onOptionsChange} />}
      onResetOptions={() => onOptionsChange(comparisonAnalyzer.defaultOptions)}
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
        <Body
          extracted={extracted}
          order={order}
          rowContext={rowContext}
          baselineTargetKey={baselineTargetKey}
          options={options}
        />
      )}
    </PaneFrame>
  );
}
