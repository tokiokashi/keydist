import { useMemo, useState } from 'react';
import { effectiveMultiBaseline } from '#engine/multi-target-selection.ts';
import type { Command } from '#input/commands/index.ts';
import { setMultiTargetsCommand, type KeydistAssets } from '#engine/commands.ts';
import type { EngineComputer } from '#engine/computer.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import { analysisTargetKey, nameTargets, type AnalysisTarget, type NamedTarget } from '#input/setup/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import {
  conditionHeaderInfoFromResolvedInput,
  globalConditionValues,
  multiTargetConditionSummary,
  PaneFrame,
  setupNumbersOf,
  TargetSelection,
  traceConditionSummary,
  type ConditionValueNames,
} from '#hosts/shared/index.ts';
import { nSensitivityAnalyzer, type NSensitivityRowContext } from '#analyzers/n-sensitivity/definition.tsx';
import { nSensitivityOptions, type NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { useSetTargetSelection } from './use-set-target-selection.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { useOptionsDraft } from './use-options-draft.ts';
import { urlOptionsNotices, useUrlOptions } from './use-url-options.ts';
import { useTargetShareSource, useUrlTargets } from './use-url-targets.ts';
import { encodeMultiTargetsToUrl, hasSharedTargetParams } from './target-share.ts';
import { useAnalyzerSetPane } from './use-analyzer-set-pane.ts';
import { targetNameSource } from './target-name-source.ts';
import './standalone.css';

/**
 * N感度の単体ページ（#544 Phase 3「N感度」、#578指摘1「対象を配列かSetupにする」）。
 * `ComparisonStandalonePage.tsx`と同じ形（対象は配列かSetupの**集合**。書き込みは`dispatch`を経由する）。
 *
 * 集合はMultiのAnalyzerが共有する`assets.multiTargetSelection`（`engine/multi-target-selection.ts`。
 * #663）。比較表で選んだ基準も集合に入っているが、このページは基準を使わないので触らない
 * （基準の対象をここで外しても記録は残り、比較表では効く基準が無くなる。付け直すと戻る）。
 */
export interface NSensitivityStandalonePageProps {
  readonly assets: KeydistAssets;
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineComputer;
  readonly catalog: StandalonePaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextChip`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: TextContentCommit;
  /** 資産のコマンド履歴（文脈バーのUndo / Redo）。`app` が組み立てる。 */
  readonly history: ContextBarHistory;
  readonly onOptionsCommit: (options: NSensitivityOptions) => void;
}

const ANALYZER_ID = nSensitivityAnalyzer.definition.id;

/** Nはこのページ自身が掃引する軸なので、条件の要約からは除く。 */
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

export function NSensitivityStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onOptionsCommit,
  history,
}: NSensitivityStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );

  const selection = assets.multiTargetSelection;
  const { choiceGroups, targets, colorByKey } = useSetTargetSelection(selection, setups, catalog);

  // 対象の選択を開いているか。空の時のペインのボタンからも開くので、ここで持つ。
  const [selectionOpen, setSelectionOpen] = useState(false);
  const setSelection = (next: readonly AnalysisTarget[]) => dispatch(setMultiTargetsCommand(next));

  const storedOptionsRaw = assets.standaloneAnalyzerOptions[ANALYZER_ID];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(nSensitivityAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  const [optionsDraft, setOptionsDraft] = useOptionsDraft<NSensitivityOptions>(decoded.options);
  // URL経由で解析設定を受け取る（共有リンク。`use-url-options.ts`）。対象は`useUrlTargets`が受け取る。
  const urlDiagnostics = useUrlOptions({
    analyzerId: ANALYZER_ID,
    optionsDefinition: nSensitivityOptions,
    currentOptions: decoded.options,
    assetsReady,
    dispatch,
    setOptionsDraft,
  });
  // URL経由で対象（集合と基準）を受け取る（`use-url-targets.ts`）。
  const shareSource = useTargetShareSource(catalog, setups);
  const targetNotices = useUrlTargets({ kind: 'multi', assetsReady, source: shareSource, dispatch });

  const members: readonly EngineSetMemberInput[] = useMemo(
    () => targets.map((target): EngineSetMemberInput => ({
      target,
      resolution: resolveStandalonePaneInput(target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText),
    })),
    [targets, setupsById, catalog, assets.setupLibrary.overrides, resolvedText],
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
    { excludeIds: N_SENSITIVITY_CONDITION_EXCLUDE_IDS, globalValues: globalConditionValues(assets.setupLibrary.overrides), names: conditionNames },
  ), [members, namedByKey, conditionNames, assets.setupLibrary.overrides]);

  const order = useMemo(() => targets.map(analysisTargetKey), [targets]);

  const pane = useAnalyzerSetPane(cache, nSensitivityAnalyzer.definition, optionsDraft, members);
  const { Body, Settings } = nSensitivityAnalyzer;
  const extraction = pane.extraction;
  const extracted = extraction.status === 'ready' || extraction.status === 'stale' ? extraction.value.extracted : undefined;
  const changeOptions = (next: NSensitivityOptions) => {
    setOptionsDraft(next);
    onOptionsCommit(next);
  };

  return (
    <div className="standalone-page">
      <ContextBar
        disabled={!assetsReady}
        history={history}
        share={{
          description: '今の対象と解析設定を含むこの画面のURLをコピーする',
          query: () => {
            const params = nSensitivityOptions.encodeOptionsToUrl(optionsDraft);
            const targetParams = encodeMultiTargetsToUrl(selection.targets, effectiveMultiBaseline(selection), shareSource);
            targetParams.forEach((value, key) => params.append(key, value));
            return params;
          },
        }}
      >
        <TextChip
          holder="standalone"
          textLibrary={assets.textLibrary}
          selection={assets.standaloneTextSelection}
          dispatch={dispatch}
          generateTextId={generateTextId}
          onTextContentCommit={onTextContentCommit}
        />
        <DefaultShapeChip
          overrides={assets.setupLibrary.overrides}
          dispatch={dispatch}
          shapes={catalog.setupCatalog.shapes}
        />
      </ContextBar>
      {/* プリレンダーされたページはハイドレーション完了まで操作を効かせない（レビュー指摘1）。 */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="standalone-stage">
          <PaneFrame
            name={nSensitivityAnalyzer.name}
            description={nSensitivityAnalyzer.description}
            headingLevel={1}
            stickyHeader
            target={(
              <TargetSelection
                mode="multiple"
                groups={choiceGroups}
                selected={targets}
                summary={targetSummary}
                onChange={setSelection}
                open={selectionOpen}
                onOpenChange={setSelectionOpen}
                autoOpen={assetsReady ? targets.length === 0 && !hasSharedTargetParams(window.location.search, 'multi') : undefined}
              />
            )}
            settings={<Settings options={optionsDraft} onOptionsChange={changeOptions} />}
            onResetOptions={() => changeOptions(nSensitivityAnalyzer.defaultOptions)}
            conditionRows={conditionSummary.rows}
            conditionEditor={{
              overrides: assets.setupLibrary.overrides,
              dispatch,
              shapes: catalog.setupCatalog.shapes,
              customFingerAssignments: catalog.customFingerAssignments,
              customRomajiRules: catalog.customRomajiRules,
              hiddenIds: N_SENSITIVITY_CONDITION_EXCLUDE_IDS,
            }}
            conditionTargetDiffs={conditionSummary.diffs}
            engineState={extraction}
            settingsDiagnostics={decoded.diagnostics}
            linkNotices={[...urlOptionsNotices(urlDiagnostics), ...targetNotices]}
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
              <Body extracted={extracted} order={order} rowContext={rowContext} options={optionsDraft} />
            )}
          </PaneFrame>
        </div>
      </fieldset>
    </div>
  );
}
