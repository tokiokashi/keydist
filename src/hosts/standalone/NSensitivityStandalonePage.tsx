import { useEffect, useMemo, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setAnalyzerSetSelectionSetupIdsCommand, type KeydistAssets } from '#engine/commands.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import { analyzerSetSelectionFor } from '#engine/analyzer-set-selection.ts';
import type { Setup, SetupIdGenerator } from '#input/setup/index.ts';
import { setupColor } from '#input/setup/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import type { TextRef } from '#input/text/selection.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { conditionHeaderInfoFromResolvedInput, nonDefaultConditionRows, summarizeNonDefaultConditions, traceConditionSummary } from '#hosts/shared/index.ts';
import { nSensitivityAnalyzer, type NSensitivityRowContext } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { TextControl } from './TextControl.tsx';
import { useAnalyzerSetPane } from './use-analyzer-set-pane.ts';
import { useEnsureSetup } from './use-ensure-setup.ts';
import './standalone.css';
import './set-selection-controls.css';

/**
 * N感度の単体ページ（#544 Phase 3「N感度」）。`ComparisonStandalonePage.tsx`と同じ形
 * （対象はSetupの**集合**。集合はこのページ自身の資産が持ち、書き込みは`dispatch`を経由する）。
 *
 * 集合の保存先は`assets.analyzerSetSelections`（`engine/analyzer-set-selection.ts`。
 * Analyzer idで引く、集合対象Analyzer全般が使う汎用の資産）。比較表が使う`baselineSetupId`
 * フィールドは持つが、このページは基準の概念を使わないので触らない（`undefined`のまま）。
 *
 * `useEnsureSetup`は「手持ちのSetupが1件も無ければ簡単な初期値を1つ作る」効果だけを使う
 * （`ComparisonStandalonePage`と同じ`assetsReady`待ちの規則）。それ以外にこのページが
 * 資産へ書き込む効果は無い（集合の変更はチェックボックスのクリックというユーザー操作からのみ
 * 起きる）ので、`assetsReady`前に書き込みが走る経路は無い。
 */
export interface NSensitivityStandalonePageProps {
  readonly assets: KeydistAssets;
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineCache;
  readonly catalog: StandalonePaneCatalog;
  readonly generateSetupId: SetupIdGenerator;
  readonly generateTextId: TextIdGenerator;
  /** `TextControl`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: (value: { readonly ref: TextRef; readonly text: string }) => void;
  readonly onOptionsCommit: (options: NSensitivityOptions) => void;
}

const ANALYZER_ID = nSensitivityAnalyzer.definition.id;

/** Nはこのページ自身が掃引する軸なので、条件の併記からは除く（`nonDefaultConditionRows`のコメント参照）。 */
const N_SENSITIVITY_CONDITION_EXCLUDE_IDS = ['windowSize'] as const;

function buildRowContext(setup: Setup, resolution: ResolvedInputResult): NSensitivityRowContext {
  const label = setup.label ?? `${setup.layoutId} / ${setup.shapeId}`;
  const color = setupColor(setup);
  if (resolution.ok) {
    const header = conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry);
    const conditionSummary = summarizeNonDefaultConditions(
      nonDefaultConditionRows(traceConditionSummary(resolution.input.cascade), N_SENSITIVITY_CONDITION_EXCLUDE_IDS),
    );
    return {
      setupId: setup.id,
      label,
      layoutName: header.layoutName,
      geometryName: header.shapeName,
      fingerAssignmentName: header.fingerAssignmentName,
      color,
      ...(conditionSummary === undefined ? {} : { conditionSummary }),
    };
  }
  return {
    setupId: setup.id,
    label,
    layoutName: setup.layoutId,
    geometryName: setup.shapeId,
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
  generateSetupId,
  generateTextId,
  onTextContentCommit,
  onOptionsCommit,
}: NSensitivityStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  useEnsureSetup(setups, assetsReady, dispatch, generateSetupId);

  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );

  const selection = analyzerSetSelectionFor(assets.analyzerSetSelections, ANALYZER_ID);
  const setupIds = selection.setupIds;
  const setupById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  const setSelection = (next: readonly string[]) => dispatch(setAnalyzerSetSelectionSetupIdsCommand(ANALYZER_ID, next));

  const toggleMember = (setupId: string) => {
    const next = setupIds.includes(setupId)
      ? setupIds.filter((id) => id !== setupId)
      : [...setupIds, setupId];
    setSelection(next);
  };

  const moveMember = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= setupIds.length) return;
    const next = [...setupIds];
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
    () => setupIds.map((setupId): EngineSetMemberInput => {
      const setup = setupById.get(setupId);
      if (setup === undefined) {
        return { setupId, resolution: { ok: false, error: { kind: 'setup-missing', setupId } } };
      }
      return {
        setupId,
        resolution: resolveStandalonePaneInput(setup, catalog, assets.setupLibrary.overrides, resolvedText),
      };
    }),
    [setupIds, setupById, catalog, assets.setupLibrary.overrides, resolvedText],
  );

  const rowContext = useMemo(() => {
    const map = new Map<string, NSensitivityRowContext>();
    for (const member of members) {
      const setup = setupById.get(member.setupId);
      if (setup === undefined) continue;
      map.set(member.setupId, buildRowContext(setup, member.resolution));
    }
    return map;
  }, [members, setupById]);

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

      <TextControl
        holder="standalone"
        textLibrary={assets.textLibrary}
        selection={assets.standaloneTextSelection}
        dispatch={dispatch}
        generateTextId={generateTextId}
        onTextContentCommit={onTextContentCommit}
      />

      <section className="set-selection-controls" aria-label="対象Setupの選択">
        <fieldset>
          <legend>N感度を見るSetup</legend>
          {setups.length === 0 ? <p aria-busy="true">Setupを準備している…</p> : null}
          {setups.map((setup) => (
            <label key={setup.id} className="set-selection-checkbox">
              <input
                type="checkbox"
                checked={setupIds.includes(setup.id)}
                onChange={() => toggleMember(setup.id)}
              />
              {setup.label ?? `${setup.layoutId} / ${setup.shapeId}`}
            </label>
          ))}
        </fieldset>

        {setupIds.length > 0 ? (
          <ol className="set-selection-order" aria-label="表示順">
            {setupIds.map((setupId, index) => (
              <li key={setupId}>
                <span>{rowContext.get(setupId)?.label ?? setupId}</span>
                <button type="button" onClick={() => moveMember(index, -1)} disabled={index === 0} aria-label={`${index + 1}番目を上へ`}>↑</button>
                <button
                  type="button"
                  onClick={() => moveMember(index, 1)}
                  disabled={index === setupIds.length - 1}
                  aria-label={`${index + 1}番目を下へ`}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>Setupをチェックするとチャートに加わる。</p>
        )}
      </section>

      {extracted === undefined ? (
        <p aria-busy="true">
          {extraction.status === 'failed' ? '計算に失敗した' : '計算している…'}
        </p>
      ) : (
        <View
          extracted={extracted}
          order={setupIds}
          rowContext={rowContext}
          options={optionsDraft}
          onOptionsChange={(next) => {
            setOptionsDraft(next);
            onOptionsCommit(next);
          }}
        />
      )}
    </div>
  );
}
