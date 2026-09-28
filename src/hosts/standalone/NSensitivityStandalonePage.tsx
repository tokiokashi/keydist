import { useEffect, useMemo, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setAnalyzerSetSelectionTargetsCommand, type KeydistAssets } from '#engine/commands.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import { analyzerSetSelectionFor } from '#engine/analyzer-set-selection.ts';
import { analysisTargetKey, nameTargets, targetColor, type AnalysisTarget, type NamedTarget, type Setup } from '#input/setup/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import type { TextRef } from '#input/text/selection.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { conditionHeaderInfoFromResolvedInput, nonDefaultConditionRows, summarizeNonDefaultConditions, traceConditionSummary } from '#hosts/shared/index.ts';
import { nSensitivityAnalyzer, type NSensitivityRowContext } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { TextControl } from './TextControl.tsx';
import { TargetPicker } from './TargetPicker.tsx';
import { DefaultShapeControl } from './DefaultShapeControl.tsx';
import { useAnalyzerSetPane } from './use-analyzer-set-pane.ts';
import './standalone.css';
import './set-selection-controls.css';

/**
 * N感度の単体ページ（#544 Phase 3「N感度」、#578指摘1「対象を配列かSetupにする」）。
 * `ComparisonStandalonePage.tsx`と同じ形（対象は配列かSetupの**集合**。集合はこのページ
 * 自身の資産が持ち、書き込みは`dispatch`を経由する）。
 *
 * 集合の保存先は`assets.analyzerSetSelections`（`engine/analyzer-set-selection.ts`。
 * Analyzer idで引く、集合対象Analyzer全般が使う汎用の資産）。比較表が使う`baseline`
 * フィールドは持つが、このページは基準の概念を使わないので触らない（`undefined`のまま）。
 */
export interface NSensitivityStandalonePageProps {
  readonly assets: KeydistAssets;
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineCache;
  readonly catalog: StandalonePaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextControl`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: (value: { readonly ref: TextRef; readonly text: string }) => void;
  readonly onOptionsCommit: (options: NSensitivityOptions) => void;
}

const ANALYZER_ID = nSensitivityAnalyzer.definition.id;

/** Nはこのページ自身が掃引する軸なので、条件の併記からは除く（`nonDefaultConditionRows`のコメント参照）。 */
const N_SENSITIVITY_CONDITION_EXCLUDE_IDS = ['windowSize'] as const;

function buildRowContext(
  target: AnalysisTarget,
  resolution: ResolvedInputResult,
  named: NamedTarget,
  setups: ReadonlyMap<string, Setup>,
): NSensitivityRowContext {
  const targetKey = analysisTargetKey(target);
  const color = targetColor(target, setups);
  if (resolution.ok) {
    const header = conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry);
    const conditionSummary = summarizeNonDefaultConditions(
      nonDefaultConditionRows(traceConditionSummary(resolution.input.cascade), N_SENSITIVITY_CONDITION_EXCLUDE_IDS),
    );
    return {
      targetKey,
      label: named.displayName,
      fullName: named.fullName,
      layoutName: header.layoutName,
      geometryName: header.shapeName,
      fingerAssignmentName: header.fingerAssignmentName,
      color,
      ...(conditionSummary === undefined ? {} : { conditionSummary }),
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
}: NSensitivityStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );

  const selection = analyzerSetSelectionFor(assets.analyzerSetSelections, ANALYZER_ID);
  const targets = selection.targets;

  const setSelection = (next: readonly AnalysisTarget[]) => dispatch(setAnalyzerSetSelectionTargetsCommand(ANALYZER_ID, next));

  const addMember = (target: AnalysisTarget) => setSelection([...targets, target]);

  const removeMember = (index: number) => setSelection(targets.filter((_, i) => i !== index));

  const moveMember = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= targets.length) return;
    const next = [...targets];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    setSelection(next);
  };

  const storedOptionsRaw = assets.standaloneAnalyzerOptions[ANALYZER_ID];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(nSensitivityAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  const [optionsDraft, setOptionsDraft] = useState<NSensitivityOptions>(decoded.options);
  useEffect(() => {
    setOptionsDraft(decoded.options);
  }, [decoded]);

  const members: readonly EngineSetMemberInput[] = useMemo(
    () => targets.map((target): EngineSetMemberInput => ({
      target,
      resolution: resolveStandalonePaneInput(target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText),
    })),
    [targets, setupsById, catalog, assets.setupLibrary.overrides, resolvedText],
  );
  const membersByTarget = useMemo(() => new Map(members.map((m) => [m.target, m] as const)), [members]);

  const namedTargets = useMemo(() => nameTargets(targets.map((target) => {
    const setup = target.kind === 'setup' ? setupsById.get(target.setupId) : undefined;
    const member = membersByTarget.get(target);
    if (member?.resolution.ok) {
      const header = conditionHeaderInfoFromResolvedInput(member.resolution.input.layout, member.resolution.input.geometry);
      const overrideSummary = summarizeNonDefaultConditions(
        nonDefaultConditionRows(traceConditionSummary(member.resolution.input.cascade), N_SENSITIVITY_CONDITION_EXCLUDE_IDS),
      );
      return {
        key: analysisTargetKey(target),
        ...(setup?.label !== undefined ? { label: setup.label } : {}),
        layoutName: header.layoutName,
        shapeName: header.shapeName,
        ...(overrideSummary === undefined ? {} : { overrideSummary }),
      };
    }
    const fallback = target.kind === 'layout' ? target.layoutId : (setup?.layoutId ?? target.setupId);
    return {
      key: analysisTargetKey(target),
      ...(setup?.label !== undefined ? { label: setup.label } : {}),
      layoutName: fallback,
      shapeName: '—',
      failed: true,
    };
  })), [targets, setupsById, membersByTarget]);
  const namedByKey = useMemo(() => new Map(namedTargets.map((n) => [n.key, n] as const)), [namedTargets]);

  const rowContext = useMemo(() => {
    const map = new Map<string, NSensitivityRowContext>();
    for (const member of members) {
      const key = analysisTargetKey(member.target);
      const named = namedByKey.get(key);
      if (named === undefined) continue;
      map.set(key, buildRowContext(member.target, member.resolution, named, setupsById));
    }
    return map;
  }, [members, namedByKey, setupsById]);

  const order = useMemo(() => targets.map(analysisTargetKey), [targets]);

  const pane = useAnalyzerSetPane(cache, nSensitivityAnalyzer.definition, optionsDraft, members);
  const View = nSensitivityAnalyzer.View;
  const extraction = pane.extraction;
  const extracted = extraction.status === 'ready' || extraction.status === 'stale' ? extraction.value.extracted : undefined;

  return (
    <div className="standalone-page">
      <header className="standalone-page-header">
        <p className="eyebrow">単体ページ</p>
        <h1>N感度</h1>
      </header>

      {/* プリレンダーされたページはハイドレーション完了まで操作を効かせない（レビュー指摘1）。 */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <TextControl
          holder="standalone"
          textLibrary={assets.textLibrary}
          selection={assets.standaloneTextSelection}
          dispatch={dispatch}
          generateTextId={generateTextId}
          onTextContentCommit={onTextContentCommit}
        />

        <DefaultShapeControl overrides={assets.setupLibrary.overrides} dispatch={dispatch} catalog={catalog} />

        <section className="set-selection-controls" aria-label="対象の選択">
          <div className="standalone-control">
            <span>対象を追加</span>
            <TargetPicker
              aria-label="追加する対象"
              layouts={catalog.setupCatalog.layouts}
              shapes={catalog.setupCatalog.shapes}
              setups={setups}
              value={undefined}
              placeholder
              onChange={addMember}
            />
          </div>

          {targets.length > 0 ? (
            <ol className="set-selection-order" aria-label="表示順">
              {targets.map((target, index) => {
                const key = analysisTargetKey(target);
                const named = namedByKey.get(key);
                return (
                  <li key={key}>
                    <span title={named?.fullName}>{named?.displayName ?? key}</span>
                    <button type="button" onClick={() => moveMember(index, -1)} disabled={index === 0} aria-label={`${index + 1}番目を上へ`}>↑</button>
                    <button
                      type="button"
                      onClick={() => moveMember(index, 1)}
                      disabled={index === targets.length - 1}
                      aria-label={`${index + 1}番目を下へ`}
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => removeMember(index)} aria-label={`${index + 1}番目を外す`}>✕</button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>対象を追加するとチャートに加わる。</p>
          )}
        </section>

        {extracted === undefined ? (
          <p aria-busy="true">
            {extraction.status === 'failed' ? '計算に失敗した' : '計算している…'}
          </p>
        ) : (
          <View
            extracted={extracted}
            order={order}
            rowContext={rowContext}
            options={optionsDraft}
            onOptionsChange={(next) => {
              setOptionsDraft(next);
              onOptionsCommit(next);
            }}
          />
        )}
      </fieldset>
    </div>
  );
}
