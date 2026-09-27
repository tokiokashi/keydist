import { useEffect, useMemo, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import {
  setComparisonBaselineSetupIdCommand,
  setComparisonSetupIdsCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import type { Setup, SetupIdGenerator } from '#input/setup/index.ts';
import { conditionHeaderInfoFromResolvedInput } from '#hosts/shared/index.ts';
import { comparisonAnalyzer, type ComparisonRowContext } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { useAnalyzerSetPane } from './use-analyzer-set-pane.ts';
import { useEnsureSetup } from './use-ensure-setup.ts';
import './standalone.css';
import './comparison-standalone.css';

/**
 * 比較表の単体ページ（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）と、
 * その単体ページ」）。
 *
 * 対象はSetupの**集合**（#544 §6「集合を見るAnalyzerはSetupの集合を対象にし、集合も
 * そのページ自身が持つ」）。集合（選んだSetup・並び順・基準）はこのページ自身の資産
 * （`assets.comparisonSelection`）が持ち、書き込みはすべて`dispatch`を経由する
 * （`BigramFlowStandalonePage.tsx`と同じ形。#544 §8-2）。テキストは単体ページ全体で
 * 共有の「最後に使ったテキスト」を使う（#544 §5）。
 *
 * `useEnsureSetup`は「手持ちのSetupが1件も無ければ簡単な初期値を1つ作る」効果だけを
 * 使う（`BigramFlowStandalonePage`と同じ`ready`待ちの規則。#544レビュー対応の使い回し）。
 * このページ自体は「選んでいる1つのSetup」を持たないので、返り値の`selectedSetupId`
 * 自体は使わない。
 */
export interface ComparisonStandalonePageProps {
  readonly assets: KeydistAssets;
  /** `assetsReady`前に集合（`comparisonSelection`）を書き換えない（`use-ensure-setup.ts`と同じ規則）。 */
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineCache;
  readonly catalog: StandalonePaneCatalog;
  readonly generateSetupId: SetupIdGenerator;
  readonly onComparisonOptionsCommit: (options: ComparisonOptions) => void;
}

function buildRowContext(setup: Setup, resolution: ResolvedInputResult): ComparisonRowContext {
  const label = setup.label ?? `${setup.layoutId} / ${setup.shapeId}`;
  if (resolution.ok) {
    const header = conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry);
    return {
      setupId: setup.id,
      label,
      layoutName: header.layoutName,
      geometryName: header.shapeName,
      fingerAssignmentName: header.fingerAssignmentName,
    };
  }
  // 解決に失敗した行でも、Setup自体は手持ちに残っている（配列・形状の参照が壊れている・
  // このテキストに使えない等）ので、idベースの表示だけは出す（#544指示書「Setup削除時の
  // 表示」は「Setupの実体そのものが消えた」場合の話で、こちらはSetupは残っている）。
  return {
    setupId: setup.id,
    label,
    layoutName: setup.layoutId,
    geometryName: setup.shapeId,
    fingerAssignmentName: '—',
  };
}

export function ComparisonStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateSetupId,
  onComparisonOptionsCommit,
}: ComparisonStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  // 手持ちが空なら初期値を1つ作る（選べる対象が無いと比較表が始められないため。
  // `BigramFlowStandalonePage`と同じ配線）。このページ自体は単一の「選択中Setup」を
  // 持たないので、戻り値の`selectedSetupId`/`setSelectedSetupId`は使わない。
  useEnsureSetup(setups, assetsReady, dispatch, generateSetupId);

  const selection = assets.comparisonSelection;
  const setupById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  const setSelection = (setupIds: readonly string[]) => dispatch(setComparisonSetupIdsCommand(setupIds));

  const toggleMember = (setupId: string) => {
    const next = selection.setupIds.includes(setupId)
      ? selection.setupIds.filter((id) => id !== setupId)
      : [...selection.setupIds, setupId];
    setSelection(next);
  };

  const moveMember = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selection.setupIds.length) return;
    const next = [...selection.setupIds];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    setSelection(next);
  };

  // 解析設定（列の表示・基準比の表示可否）は資産（standaloneAnalyzerOptions）が正
  // （BigramFlowStandalonePageと同じ形）。
  const analyzerId = comparisonAnalyzer.definition.id;
  const storedOptionsRaw = assets.standaloneAnalyzerOptions[analyzerId];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(comparisonAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  // `BigramFlowStandalonePage`と同じ形: 見た目は即座に反映しつつ（controlled）、
  // 資産への書き込みは呼び出し側がdebounceする（`onComparisonOptionsCommit`）。
  const [optionsDraft, setOptionsDraft] = useState<ComparisonOptions>(decoded.options);
  useEffect(() => {
    setOptionsDraft(decoded.options);
  }, [decoded]);

  // 各メンバーの解決済み入力（または解決失敗）。`selection.setupIds`の並びのまま作る
  // （engineの抽出キーが順序込みで畳み込む対象。#544 §7）。
  const members: readonly EngineSetMemberInput[] = useMemo(
    () => selection.setupIds.map((setupId): EngineSetMemberInput => {
      const setup = setupById.get(setupId);
      if (setup === undefined) {
        // Setupの実体そのものが手持ちから消えている（#544指示書「Setup削除時の表示」）。
        return { setupId, resolution: { ok: false, error: { kind: 'setup-missing', setupId } } };
      }
      return {
        setupId,
        resolution: resolveStandalonePaneInput(setup, catalog, assets.setupLibrary.overrides, assets.standaloneText),
      };
    }),
    [selection.setupIds, setupById, catalog, assets.setupLibrary.overrides, assets.standaloneText],
  );

  const rowContext = useMemo(() => {
    const map = new Map<string, ComparisonRowContext>();
    for (const member of members) {
      const setup = setupById.get(member.setupId);
      if (setup === undefined) continue;
      map.set(member.setupId, buildRowContext(setup, member.resolution));
    }
    return map;
  }, [members, setupById]);

  const pane = useAnalyzerSetPane(cache, comparisonAnalyzer.definition, optionsDraft, members);
  const View = comparisonAnalyzer.View;
  const extraction = pane.extraction;
  const extracted = extraction.status === 'ready' || extraction.status === 'stale' ? extraction.value.extracted : undefined;

  return (
    <div className="standalone-page">
      <header className="standalone-page-header">
        <p className="eyebrow">単体ページ</p>
        <h1>比較表</h1>
      </header>

      <section className="comparison-selection-controls" aria-label="対象Setupの選択">
        <fieldset>
          <legend>比較するSetup</legend>
          {setups.length === 0 ? <p aria-busy="true">Setupを準備している…</p> : null}
          {setups.map((setup) => (
            <label key={setup.id} className="comparison-selection-checkbox">
              <input
                type="checkbox"
                checked={selection.setupIds.includes(setup.id)}
                onChange={() => toggleMember(setup.id)}
              />
              {setup.label ?? `${setup.layoutId} / ${setup.shapeId}`}
            </label>
          ))}
        </fieldset>

        {selection.setupIds.length > 0 ? (
          <ol className="comparison-selection-order" aria-label="表示順">
            {selection.setupIds.map((setupId, index) => (
              <li key={setupId}>
                <span>{rowContext.get(setupId)?.label ?? setupId}</span>
                <button type="button" onClick={() => moveMember(index, -1)} disabled={index === 0} aria-label={`${index + 1}番目を上へ`}>↑</button>
                <button
                  type="button"
                  onClick={() => moveMember(index, 1)}
                  disabled={index === selection.setupIds.length - 1}
                  aria-label={`${index + 1}番目を下へ`}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>Setupをチェックすると比較表に加わる。</p>
        )}
      </section>

      {extracted === undefined ? (
        <p aria-busy="true">
          {extraction.status === 'failed' ? '計算に失敗した' : '計算している…'}
        </p>
      ) : (
        <View
          extracted={extracted}
          order={selection.setupIds}
          rowContext={rowContext}
          baselineSetupId={selection.baselineSetupId}
          onBaselineSetupIdChange={(next) => dispatch(setComparisonBaselineSetupIdCommand(next))}
          options={optionsDraft}
          onOptionsChange={(next) => {
            setOptionsDraft(next);
            onComparisonOptionsCommit(next);
          }}
        />
      )}
    </div>
  );
}
