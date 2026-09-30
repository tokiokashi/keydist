import { useMemo } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setSingleTargetCommand, type KeydistAssets } from '#engine/commands.ts';
import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import type { EngineComputer } from '#engine/computer.ts';
import {
  combinePaneStates,
  conditionHeaderInfoFromResolvedInput,
  PaneFrame,
  setupNumbersOf,
  targetChoiceGroups,
  TargetSelection,
  traceConditionSummary,
} from '#hosts/shared/index.ts';
import { nameTargets } from '#input/setup/index.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { bigramFlowOptions, type BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { targetNameSource } from './target-name-source.ts';
import { useOptionsDraft } from './use-options-draft.ts';
import { urlOptionsNotices, useUrlOptions } from './use-url-options.ts';
import { useTargetShareSource, useUrlTargets } from './use-url-targets.ts';
import { encodeSingleTargetToUrl } from './target-share.ts';
import { useAnalyzerPane } from './use-analyzer-pane.ts';
import './standalone.css';

/**
 * Bigram Flowの単体ページ（#544 Phase 3「最初の縦切り」）。
 *
 * 対象（配列かSetup。#578指摘1）は1つ、テキストは単体ページ全体で共有の
 * 「最後に使ったテキスト」を使う
 * （#544 §5・§6）。書き込みはすべて`dispatch`（呼び出し元の`app`が組み立てた
 * コマンド適用 + 永続化）を経由する（#544 §8-2）。ここでは`applyCommand`もstorageも
 * 直接触らない。
 */
export interface BigramFlowStandalonePageProps {
  readonly assets: KeydistAssets;
  /**
   * `assets`が資産（storage）からの初回読み込みを終えているか（`useKeydistAssets`の
   * `ready`。#544 Phase 3「URLでの受け取り」）。URLパラメータを既存の解析設定へ
   * 部分マージする処理は、この読み込みより前に走ると既存の値を初期値へ巻き戻して
   * しまうため、`ready`になるまで待つ。
   */
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineComputer;
  readonly catalog: StandalonePaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextChip`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: TextContentCommit;
  /**
   * 解析設定の変更を資産へ反映する（間引き済み。`app/standalone/use-debounced-commit.ts`
   * 参照）。`dispatch`を直接使わないのは、`hosts`が`platform`をimportできず
   * （依存規則）debounce自体をここへ持てないため。
   */
  readonly onBigramFlowOptionsCommit: (options: BigramFlowOptions) => void;
  /** 資産のコマンド履歴（文脈バーのUndo / Redo）。`app` が組み立てる。 */
  readonly history: ContextBarHistory;
}

export function BigramFlowStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onBigramFlowOptionsCommit,
  history,
}: BigramFlowStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  // 対象（`AnalysisTarget`）はSingleのAnalyzerが共有する資産（`singleTargetSelection`。#663）が正。
  // まだ選んでいなければ既定の配列を使う（`effectiveSingleTarget`）。
  const analyzerId = bigramFlowAnalyzer.definition.id;
  const target = effectiveSingleTarget(assets.singleTargetSelection);
  const setTarget = (next: typeof target) => dispatch(setSingleTargetCommand(next));

  // テキストは資産（textLibrary + standaloneTextSelection）が正。編集・選択・複製・削除は
  // すべて共有部品`TextChip`（文脈バーのテキストのチップ。比較表・N感度と3ページで同じ操作を持つため。
  // `resolve-pane-input.ts`が使う`resolveTextSelection`と同じものをここでも呼び、
  // 実効テキストを求める）へ切り出した。
  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );

  // 解析設定は資産（assets.standaloneAnalyzerOptions）が正で、ページはローカルには持たない
  // （#544指示書「解析設定は資産として個人で保持する」）。`optionsDraft`はtextDraftと同じ形の
  // UI用の一時状態: 見た目は即座に反映しつつ（controlled）、資産への書き込みは
  // `onBigramFlowOptionsCommit`（呼び出し元がdebounceする）経由にする。
  const storedOptionsRaw = assets.standaloneAnalyzerOptions[analyzerId];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(bigramFlowAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  const [optionsDraft, setOptionsDraft] = useOptionsDraft<BigramFlowOptions>(decoded.options);

  // URL経由で解析設定を受け取る（3つの単体ページ共通。`use-url-options.ts`）。
  const urlDiagnostics = useUrlOptions({
    analyzerId,
    optionsDefinition: bigramFlowOptions,
    currentOptions: decoded.options,
    assetsReady,
    dispatch,
    setOptionsDraft,
  });

  // URL経由で対象を受け取る（`use-url-targets.ts`）。
  const shareSource = useTargetShareSource(catalog, setups);
  const targetNotices = useUrlTargets({ kind: 'single', assetsReady, source: shareSource, dispatch });

  const resolution = useMemo(
    () => resolveStandalonePaneInput(target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText),
    [target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText],
  );

  const pane = useAnalyzerPane(
    cache,
    bigramFlowAnalyzer.definition,
    optionsDraft,
    resolution,
  );

  const conditionRows = resolution.ok ? traceConditionSummary(resolution.input.cascade, catalog.setupCatalog) : [];
  const header = resolution.ok
    ? conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry)
    : undefined;
  const traceErrors = pane.trace.status === 'ready' || pane.trace.status === 'stale'
    ? pane.trace.value.trace.errors
    : [];

  // 対象の名前（読み上げ用の名前と、見出しの対象・hoverに出すフル名）。単一対象なので集合は自分1つ。
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const named = useMemo(
    () => nameTargets([targetNameSource(target, resolution, setupsById, setupNumbers, catalog.setupCatalog)])[0],
    [target, resolution, setupsById, setupNumbers, catalog.setupCatalog],
  );

  const choiceGroups = useMemo(() => targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups,
    selected: [target],
  }), [catalog, setups, target]);

  const { Body, Settings } = bigramFlowAnalyzer;
  const extraction = pane.extraction;
  const changeOptions = (next: BigramFlowOptions) => {
    setOptionsDraft(next);
    onBigramFlowOptionsCommit(next);
  };

  const hasExtraction = extraction.status === 'ready' || extraction.status === 'stale';
  const hasTrace = pane.trace.status === 'ready' || pane.trace.status === 'stale';

  return (
    <div className="standalone-page">
      <ContextBar
        disabled={!assetsReady}
        history={history}
        share={{
          description: '今の対象と解析設定を含むこの画面のURLをコピーする',
          query: () => {
            const params = bigramFlowOptions.encodeOptionsToUrl(optionsDraft);
            encodeSingleTargetToUrl(target, shareSource).forEach((value, key) => params.append(key, value));
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
      {/*
       * プリレンダーされたHTMLはハイドレーション前から操作できてしまう（レビュー指摘:
       * ハイドレーション完了までの約750〜850msの間にクリック・入力すると、見た目は
       * 変わっても実際には何も起きず、そのまま消える。加えてプリレンダー時点のDOMは
       * `initialAssets()`＝ユーザーの保存済み資産ではない）。`assetsReady`が経由する
       * `useKeydistAssets`はハイドレーション後にstorageを読み終えてから true になるので、
       * それまでは操作系を丸ごと`disabled`にして「触れるが効かない」状態を作らない。
       * `display:contents`でレイアウトへの影響を無くす（fieldsetは既定でblock）。
       */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="standalone-stage">
          <PaneFrame
            name={bigramFlowAnalyzer.name}
            description={bigramFlowAnalyzer.description}
            headingLevel={1}
            stickyHeader
            {...(named === undefined ? {} : { targetName: named.displayName })}
            target={(
              <TargetSelection
                mode="single"
                groups={choiceGroups}
                selected={[target]}
                summary={named === undefined ? [] : [{ key: named.key, label: named.displayName, fullName: named.fullName }]}
                onChange={(next) => {
                  if (next[0] !== undefined) setTarget(next[0]);
                }}
              />
            )}
            settings={<Settings options={optionsDraft} onOptionsChange={changeOptions} />}
            onResetOptions={() => changeOptions(bigramFlowAnalyzer.defaultOptions)}
            header={header}
            conditionRows={conditionRows}
            engineState={combinePaneStates(extraction, pane.trace)}
            traceErrors={traceErrors}
            settingsDiagnostics={decoded.diagnostics}
            linkNotices={[...urlOptionsNotices(urlDiagnostics), ...targetNotices]}
          >
            {resolution.ok && hasExtraction && hasTrace ? (
              <Body
                layout={resolution.input.layout}
                geometry={resolution.input.geometry}
                trace={pane.trace.value.trace}
                extracted={extraction.value.extracted}
                options={optionsDraft}
                onOptionsChange={changeOptions}
              />
            ) : undefined}
          </PaneFrame>
        </div>
      </fieldset>
    </div>
  );
}
