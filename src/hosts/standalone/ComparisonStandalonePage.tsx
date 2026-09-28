import { useMemo, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import {
  setAnalyzerSetSelectionBaselineCommand,
  setAnalyzerSetSelectionTargetsCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import { analyzerSetSelectionFor } from '#engine/analyzer-set-selection.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import { analysisTargetKey, nameTargets, type AnalysisTarget, type NamedTarget } from '#input/setup/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import type { TextRef } from '#input/text/selection.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import {
  conditionHeaderInfoFromResolvedInput,
  nonDefaultConditionRows,
  PaneFrame,
  resetOptionsMenuItem,
  setupNumbersOf,
  summarizeNonDefaultConditions,
  TargetSelection,
  traceConditionSummary,
  type ConditionValueNames,
} from '#hosts/shared/index.ts';
import { comparisonAnalyzer, type ComparisonRowContext } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { useSetTargetSelection } from './use-set-target-selection.ts';
import { ContextBar, ShareButton, UndoRedoButtons, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { useOptionsDraft } from './use-options-draft.ts';
import { useAnalyzerSetPane } from './use-analyzer-set-pane.ts';
import { targetNameSource } from './target-name-source.ts';
import './standalone.css';

/**
 * 比較表の単体ページ（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）と、
 * その単体ページ」、#578指摘1「対象を配列かSetupにする」）。
 *
 * 対象は**配列かSetupの集合**（用語表「対象」）。集合（選んだ対象・並び順・基準）は
 * このページ自身の資産（`assets.analyzerSetSelections`。Analyzer idで引く、集合対象
 * Analyzer全般が使う汎用の資産）が持ち、書き込みはすべて`dispatch`を経由する
 * （`BigramFlowStandalonePage.tsx`と同じ形。#544 §8-2）。テキストは単体ページ全体で
 * 共有の「最後に使ったテキスト」を使う（#544 §5）。
 *
 * 配列は常に選べる（組み込みカタログに最初から入っている）ため、旧`use-ensure-setup.ts`の
 * ような「手持ちが空なら初期Setupを作る」副作用は無くなった。
 */
export interface ComparisonStandalonePageProps {
  readonly assets: KeydistAssets;
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineCache;
  readonly catalog: StandalonePaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextChip`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: (value: { readonly ref: TextRef; readonly text: string }) => void;
  /** 資産のコマンド履歴（文脈バーのUndo / Redo）。`app` が組み立てる。 */
  readonly history: ContextBarHistory;
  readonly onComparisonOptionsCommit: (options: ComparisonOptions) => void;
}

const ANALYZER_ID = comparisonAnalyzer.definition.id;

function buildRowContext(
  target: AnalysisTarget,
  resolution: ResolvedInputResult,
  named: NamedTarget,
  conditionNames: ConditionValueNames,
): ComparisonRowContext {
  const targetKey = analysisTargetKey(target);
  if (resolution.ok) {
    const header = conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry);
    // 既定値と違う条件だけを併記する（#544 Phase 3レビュー「集合対象ページは各行に
    // 効いている条件を併記する」）。比較表はwindowSizeを掃引しないので除外しない。
    const cascadeOriginSummary = summarizeNonDefaultConditions(
      nonDefaultConditionRows(traceConditionSummary(resolution.input.cascade, conditionNames)),
    );
    return {
      targetKey,
      label: named.displayName,
      fullName: named.fullName,
      layoutName: header.layoutName,
      geometryName: header.shapeName,
      fingerAssignmentName: header.fingerAssignmentName,
      ...(cascadeOriginSummary === undefined ? {} : { cascadeOriginSummary }),
    };
  }
  // 解決に失敗した行でも対象自体は集合に残っている（Setupの参照が壊れている・
  // このテキストに使えない等）ので、idベースの表示だけは出す。
  return {
    targetKey,
    label: named.displayName,
    fullName: named.fullName,
    layoutName: named.fullName,
    geometryName: '—',
    fingerAssignmentName: '—',
  };
}

export function ComparisonStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onComparisonOptionsCommit,
  history,
}: ComparisonStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );

  const selection = analyzerSetSelectionFor(assets.analyzerSetSelections, ANALYZER_ID);
  const { choiceGroups, targets, colorByKey } = useSetTargetSelection(selection, setups, catalog);

  // 対象の選択を開いているか。空の時のペインのボタンからも開くので、ここで持つ。
  const [selectionOpen, setSelectionOpen] = useState(false);
  const setSelection = (next: readonly AnalysisTarget[]) => dispatch(setAnalyzerSetSelectionTargetsCommand(ANALYZER_ID, next));

  // 解析設定（列の表示・基準比の表示可否）は資産（standaloneAnalyzerOptions）が正
  // （BigramFlowStandalonePageと同じ形）。
  const storedOptionsRaw = assets.standaloneAnalyzerOptions[ANALYZER_ID];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(comparisonAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  // `BigramFlowStandalonePage`と同じ形: 見た目は即座に反映しつつ（controlled）、
  // 資産への書き込みは呼び出し側がdebounceする（`onComparisonOptionsCommit`）。
  const [optionsDraft, setOptionsDraft] = useOptionsDraft<ComparisonOptions>(decoded.options);

  // 各メンバーの解決済み入力（または解決失敗）。表示順（`targets`）のまま作る
  // （engineの抽出キーが順序込みで畳み込む対象。#544 §7）。
  const members: readonly EngineSetMemberInput[] = useMemo(
    () => targets.map((target): EngineSetMemberInput => ({
      target,
      resolution: resolveStandalonePaneInput(target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText),
    })),
    [targets, setupsById, catalog, assets.setupLibrary.overrides, resolvedText],
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
      map.set(key, buildRowContext(member.target, member.resolution, named, conditionNames));
    }
    return map;
  }, [members, namedByKey, conditionNames]);

  const order = useMemo(() => targets.map(analysisTargetKey), [targets]);

  const pane = useAnalyzerSetPane(cache, comparisonAnalyzer.definition, optionsDraft, members);
  const { Body, Settings, TargetItem } = comparisonAnalyzer;
  const extraction = pane.extraction;
  const extracted = extraction.status === 'ready' || extraction.status === 'stale' ? extraction.value.extracted : undefined;
  const changeOptions = (next: ComparisonOptions) => {
    setOptionsDraft(next);
    onComparisonOptionsCommit(next);
  };

  const baselineTargetKey = selection.baseline === undefined ? undefined : analysisTargetKey(selection.baseline);
  const candidates = order.map((key) => ({
    key,
    label: namedByKey.get(key)?.displayName ?? key,
    fullName: namedByKey.get(key)?.fullName ?? '',
  }));

  return (
    <div className="standalone-page">
      <ContextBar
        disabled={!assetsReady}
        actions={(
          <>
            <UndoRedoButtons history={history} />
            <ShareButton description="この画面のURLをコピーする" />
          </>
        )}
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
            name={comparisonAnalyzer.name}
            description={comparisonAnalyzer.description}
            headingLevel={1}
            target={(
              <TargetSelection
                mode="multiple"
                groups={choiceGroups}
                selected={targets}
                summary={targetSummary}
                onChange={setSelection}
                open={selectionOpen}
                onOpenChange={setSelectionOpen}
                autoOpen={assetsReady && targets.length === 0}
                extraItem={(
                  <TargetItem
                    value={baselineTargetKey}
                    candidates={candidates}
                    onChange={(nextKey) => {
                      const next = nextKey === undefined ? undefined : targets.find((t) => analysisTargetKey(t) === nextKey);
                      dispatch(setAnalyzerSetSelectionBaselineCommand(ANALYZER_ID, next));
                    }}
                  />
                )}
              />
            )}
            settings={<Settings options={optionsDraft} onOptionsChange={changeOptions} />}
            menuItems={[resetOptionsMenuItem(() => changeOptions(comparisonAnalyzer.defaultOptions))]}
            conditionRows={[]}
            engineState={extraction}
            settingsDiagnostics={decoded.diagnostics}
            {...(targets.length === 0
              ? {
                emptyContent: (
                  <button type="button" className="pane-empty-button" onClick={() => setSelectionOpen(true)}>
                    配列・Setupを選ぶ
                  </button>
                ),
              }
              : {})}
          >
            {extracted === undefined ? undefined : (
              <Body
                extracted={extracted}
                order={order}
                rowContext={rowContext}
                baselineTargetKey={baselineTargetKey}
                options={optionsDraft}
              />
            )}
          </PaneFrame>
        </div>
      </fieldset>
    </div>
  );
}
