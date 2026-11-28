import { useMemo, useState } from 'react';
import type { EngineSetMemberInput } from '#engine/request.ts';
import { effectiveMultiBaseline, type ColorSlotsByKey, type TargetSet } from '#engine/multi-target-selection.ts';
import { layoutCategory } from '#input/layouts/layout-category.ts';
import { analysisTargetKey, nameTargets, type AnalysisTarget } from '#input/setup/index.ts';
import type {
  KeystrokeRecordChoice,
  NgramTableStatus,
  PlaybackJump,
  SegmentationStatus,
  SetAnalyzerPaneParts,
  SetRowSource,
} from '#analyzers/pane-parts.tsx';
import { recordTargetMatches } from '#interpretation/record/keystroke-gaps.ts';
import { textDigest } from '#interpretation/record/keystroke-record.ts';
import { keystrokeRecordTexts } from '../keystroke-record-texts.ts';
import {
  conditionHeaderInfoFromResolvedInput,
  globalConditionLevels,
  globalConditionValues,
  multiTargetConditionSummary,
  settingsItemIds,
  traceConditionSummary,
  type ConditionSummaryScope,
  type ConditionValueNames,
} from '../condition-summary.ts';
import { recommendedWidthRemOf } from '#analyzers/recommended-width.ts';
import { PaneFrame } from '../PaneFrame.tsx';
import { copyFigureImage } from '../figure-image.ts';
import { resolvePaneHelp } from '#analyzers/pane-help.tsx';
import { TextLanguageProvider } from '#analyzers/text-language-context.tsx';
import { resolvePaneInput } from '../resolve-pane-input.ts';
import { setPaneConditionScope } from '../changed-condition.ts';
import { targetNameSource } from '../target-name-source.ts';
import { setupNumbersOf } from '../target-choices.ts';
import { TargetSelection } from '../TargetSelection.tsx';
import { useAnalyzerSetPane } from '../use-analyzer-set-pane.ts';
import { usePaneOnScreen } from '../use-pane-on-screen.ts';
import { usePlaybackSeekReceivers } from '../playback-seek-store.tsx';
import { useSetTargetSelection } from '../use-set-target-selection.ts';
import { comboSetProvenanceOfTargets, isWaitingForReading, readingProvenance, segmentationBasisOf } from '../reading-evaluation.ts';
import { useSegmentation } from '../segmentation.ts';
import type { PaneChrome, PaneEnvironment } from './pane-environment.ts';
import { NGRAM_TABLE_PANE_TEXT, useNgramTable, useUserNgramTable, userTableRequestOf } from '../ngram-table.ts';
import { NgramTableChoicesProvider } from '#analyzers/ngram-table-context.tsx';
import { ngramTableAssetOf, ngramTableSetOfFile, type NgramTableSet } from '#interpretation/ngram-table-asset.ts';

/**
 * 対象の集合を見るAnalyzer（Set）のペイン。どのSetも、渡された`analyzer`だけが違う。個別画面とWorkspaceのペインが同じこのcomponentを使う。
 * 値の持ち主（集合・解析設定をどこへ保存するか）は器が決め、ここには集合の値と変更の通知だけを渡す
 * （`SingleAnalyzerPane`と同じ分担）。
 */
export interface SetAnalyzerPaneProps<Options, Extracted, RowContext> {
  /** このペインが映すAnalyzer（各Analyzerの`definition.tsx`がexportする、ペインに渡すもの）。 */
  readonly analyzer: SetAnalyzerPaneParts<Options, Extracted, RowContext>;
  readonly env: PaneEnvironment;
  readonly chrome?: PaneChrome;
  /** 選んだ対象・基準。 */
  readonly selection: TargetSet;
  /** 対象に配った色の番号（対象のkey → 番号）。配るのは器（個別画面は集合、Workspaceは全ペインの和）。 */
  readonly colorSlots: ColorSlotsByKey;
  readonly onTargetsChange: (next: readonly AnalysisTarget[]) => void;
  /** 基準にする対象。`undefined`で「基準なし」。基準を選ぶ部品を持つAnalyzerだけが呼ぶ。 */
  readonly onBaselineChange: (next: AnalysisTarget | undefined) => void;
  readonly options: Options;
  readonly onOptionsChange: (next: Options) => void;
  /** 共有リンクを開いた時に、取り込めなかったものを伝える文。 */
  readonly linkNotices?: readonly string[];
}

export function SetAnalyzerPane<Options, Extracted, RowContext>({
  analyzer,
  env,
  chrome = {},
  selection,
  colorSlots,
  onTargetsChange,
  onBaselineChange,
  options,
  onOptionsChange,
  linkNotices,
}: SetAnalyzerPaneProps<Options, Extracted, RowContext>) {
  const { setups, overrides, catalog, cache, dispatch, assetsReady } = env;
  // 表を入力にする解析は、対象の解決に評価に渡すテキストを使わない。最小のテキストで解決し、漢字の読みも待たない。
  // 表の元が選んだテキストの時だけ、そのテキストを表を作る入力にする（対象の解決は変えない）
  const usesTable = analyzer.ngramTable !== undefined;
  const fromText = usesTable && analyzer.ngramTable?.usesText(options) === true;
  const resolvedText = usesTable ? NGRAM_TABLE_PANE_TEXT : env.resolvedText;
  const readingState = usesTable ? (fromText ? env.reading : undefined) : env.reading;
  // 辞書を読み込めなかったテキストは、読みに直せなかった漢字で走りを切って表を作る。読めなかった旨は条件の要約に出す。
  // ペインの知らせ（漢字を打てない文字に数える）は、この解析の数え方と違うので出さない
  const paneReadingState = fromText && readingState?.kind === 'failed' ? ({ kind: 'none' } as const) : readingState;
  // 辞書の読み込み中は、評価に渡すテキストがまだ無いので依頼を出さない（漢字を打てない文字に数えた暫定の数値を出さない）
  const readingLoading = isWaitingForReading(readingState);
  // 表を入力にする解析は、表を用意してから依頼を出す。選べない次数は、選べる次数の最大に直す
  const corpusState = useNgramTable(env.ngramTables, usesTable && !fromText);
  const textBasis = useMemo(() => (fromText ? segmentationBasisOf(env.resolvedText) : undefined), [fromText, env.resolvedText]);
  const textSegmentation = useSegmentation(env.bunsetsu, textBasis, fromText && !readingLoading);
  const textSegmentationInput = textSegmentation.status === 'ready' ? textSegmentation.input : undefined;
  const userRequest = useMemo(
    () => (fromText && textSegmentationInput !== undefined ? userTableRequestOf(env.resolvedText, textSegmentationInput) : undefined),
    [fromText, env.resolvedText, textSegmentationInput],
  );
  const userState = useUserNgramTable(cache, userRequest);
  const corpusFile = corpusState.status === 'ready' ? corpusState.file : undefined;
  const corpusSet = useMemo(() => (corpusFile === undefined ? undefined : ngramTableSetOfFile(corpusFile)), [corpusFile]);
  // 状態の入れ物は描画のたびに作り直されるので、依存には中の表を渡す（表の入れ物の同一性が、依頼の作り直しを決める）
  const userSet = userState.status === 'ready' ? userState.set : undefined;
  const tableSet: NgramTableSet | undefined = fromText ? userSet : corpusSet;
  const wantedOrder = analyzer.ngramTable?.orderOf(options);
  const tableOrder =
    tableSet === undefined || wantedOrder === undefined
      ? undefined
      : tableSet.selectableOrders.includes(wantedOrder)
        ? wantedOrder
        : tableSet.defaultOrder;
  const tableAsset = useMemo(
    () =>
      // 数えられる文節が無い表は、値を出せないので解析に渡さない
      tableSet === undefined || tableOrder === undefined || tableSet.sufficiency[0]?.occurrences === 0
        ? undefined
        : ngramTableAssetOf(tableSet, tableOrder),
    [tableSet, tableOrder],
  );
  const tableChoices = useMemo(
    () => (tableSet === undefined ? undefined : { selectableOrders: tableSet.selectableOrders, defaultOrder: tableSet.defaultOrder }),
    [tableSet],
  );
  const tableLoading =
    usesTable &&
    (fromText
      ? textSegmentation.status === 'loading' || (userRequest !== undefined && userState.status === 'loading')
      : corpusState.status === 'loading');
  const tableStatus: NgramTableStatus | undefined = !usesTable
    ? undefined
    : fromText
      ? textTableStatus(env.resolvedText.language, env.bunsetsu !== undefined, textSegmentation.status, userState, tableSet)
      : corpusState.status === 'failed' || env.ngramTables === undefined
        ? 'failed'
        : 'ready';
  // 文節の区切りを求める設定の間だけ、分割器を呼ぶ。日本語以外のテキストは材料が無く、区切りを使わずに計算する
  const wantsSegmentation = analyzer.usesSegmentation?.(options) === true;
  const segmentationBasis = useMemo(() => segmentationBasisOf(resolvedText), [resolvedText]);
  const segmentationState = useSegmentation(env.bunsetsu, segmentationBasis, wantsSegmentation && !readingLoading);
  const segmentationLoading = segmentationState.status === 'loading';
  const segmentationInput = segmentationState.status === 'ready' ? segmentationState.input : undefined;
  const segmentationStatus: SegmentationStatus | undefined = !wantsSegmentation
    ? undefined
    : segmentationState.status === 'failed' || env.bunsetsu === undefined
      ? 'failed'
      : segmentationBasis === undefined
        ? 'unsupported'
        : 'ready';
  const conditionProvenance = useMemo(
    () => [
      ...readingProvenance(fromText ? env.resolvedText.reading : resolvedText.reading),
      ...(analyzer.ngramTable?.provenance(tableAsset, options) ?? []),
    ],
    [fromText, env.resolvedText.reading, resolvedText.reading, analyzer, tableAsset, options],
  );
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);
  const { choiceGroups, targets, colorByKey, markByKey } = useSetTargetSelection(selection, colorSlots, setups, catalog);

  // 対象の選択を開いているか。空の時のペインのボタンからも開くので、ここで持つ。
  const [selectionOpen, setSelectionOpen] = useState(false);

  // 選んでいる打鍵の記録。手元に無い`id`は選べていないものとして、抽出に伝えない（抽出が「見つからない」を示す）
  const selectedRecordId = analyzer.selectedRecordId?.(options) ?? '';
  const selectedRecord = useMemo(
    () => (selectedRecordId === '' ? undefined : catalog.keystrokeRecords?.find((record) => record.id === selectedRecordId)),
    [selectedRecordId, catalog.keystrokeRecords],
  );

  // 各メンバーの解決済み入力（または解決失敗）。表示順（`targets`）のまま作る
  // （engineの抽出キーが順序込みで畳み込む対象）。
  const members: readonly EngineSetMemberInput[] = useMemo(
    () =>
      targets.map(
        (target): EngineSetMemberInput => ({
          target,
          resolution: resolvePaneInput(target, setupsById, catalog, overrides, resolvedText, segmentationInput, selectedRecord, tableAsset),
        }),
      ),
    [targets, setupsById, catalog, overrides, resolvedText, segmentationInput, selectedRecord, tableAsset],
  );
  const membersByTarget = useMemo(() => new Map(members.map((m) => [m.target, m] as const)), [members]);

  // 表示名は常に集合全体に対して計算する。解決に失敗したメンバーは、共通性の判定からは除く
  // （`naming.ts`の`TargetNameSource.failed`参照）。
  const excludeIds = useMemo(() => settingsItemIds(analyzer.conditionExcludeIds), [analyzer]);
  const summaryScope = useMemo((): ConditionSummaryScope => setPaneConditionScope(resolvedText.language), [resolvedText.language]);
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const namedTargets = useMemo(
    () =>
      nameTargets(
        targets.map((target) =>
          targetNameSource(target, membersByTarget.get(target)?.resolution, setupsById, setupNumbers, catalog.setupCatalog, excludeIds, summaryScope),
        ),
      ),
    [targets, setupsById, setupNumbers, membersByTarget, catalog.setupCatalog, excludeIds, summaryScope],
  );
  const namedByKey = useMemo(() => new Map(namedTargets.map((n) => [n.key, n] as const)), [namedTargets]);
  const provenanceItems = useMemo(
    () => [
      ...conditionProvenance,
      ...comboSetProvenanceOfTargets(
        members.map((member) => ({
          targetName: namedByKey.get(analysisTargetKey(member.target))?.displayName ?? '',
          comboSet: member.resolution.ok ? member.resolution.input.comboSet : undefined,
        })),
      ),
    ],
    [conditionProvenance, members, namedByKey],
  );

  const targetSummary = useMemo(
    () =>
      targets.map((target) => {
        const key = analysisTargetKey(target);
        const named = namedByKey.get(key);
        return { key, label: named?.displayName ?? key, fullName: named?.fullName ?? '', color: colorByKey.get(key), mark: markByKey.get(key) };
      }),
    [targets, namedByKey, colorByKey, markByKey],
  );

  const conditionNames: ConditionValueNames = catalog.setupCatalog;
  const recordTexts = useMemo(
    () => (selectedRecord === undefined ? undefined : keystrokeRecordTexts(selectedRecord, catalog.setupCatalog)),
    [selectedRecord, catalog.setupCatalog],
  );
  const rowContext = useMemo(() => {
    const map = new Map<string, RowContext>();
    for (const member of members) {
      const key = analysisTargetKey(member.target);
      const named = namedByKey.get(key);
      if (named === undefined) continue;
      const source: SetRowSource = {
        targetKey: key,
        label: named.displayName,
        fullName: named.fullName,
        header: member.resolution.ok
          ? {
              ...conditionHeaderInfoFromResolvedInput(member.resolution.input.layout, member.resolution.input.geometry),
              layoutCategory: layoutCategory(member.resolution.input.layout, catalog.userLayouts),
            }
          : undefined,
        // 色は集合が配った番号から引く（加えた順。表示順とは別）。
        color: colorByKey.get(key),
        mark: markByKey.get(key),
      };
      const context = analyzer.rowContext(source);
      if (context !== undefined) map.set(key, context);
    }
    return map;
  }, [analyzer, members, namedByKey, colorByKey, markByKey, catalog.userLayouts]);

  // 条件の要約は、共通の条件と、対象ごとに違う条件（Setupの上書き）に分けて出す。
  const conditionSummary = useMemo(
    () =>
      multiTargetConditionSummary(
        members.flatMap((member) => {
          if (!member.resolution.ok) return [];
          const key = analysisTargetKey(member.target);
          return [
            {
              key,
              label: namedByKey.get(key)?.displayName ?? key,
              shapeName: member.resolution.input.geometry.name,
              rows: traceConditionSummary(member.resolution.input.cascade, conditionNames, summaryScope),
            },
          ];
        }),
        { excludeIds, globalValues: globalConditionValues(overrides), globalLevels: globalConditionLevels(overrides), names: conditionNames },
      ),
    [members, namedByKey, conditionNames, overrides, excludeIds, summaryScope],
  );

  const order = useMemo(() => targets.map(analysisTargetKey), [targets]);

  // 選べる打鍵の記録: 評価に渡した本文の照合値が今のテキストと同じで、対象がペインの対象のどれかであるもの。新しい記録から並べる
  const keystrokeRecords = useMemo((): readonly KeystrokeRecordChoice[] | undefined => {
    if (analyzer.selectedRecordId === undefined) return undefined;
    const choices: KeystrokeRecordChoice[] = [];
    const seen = new Set<string>();
    const digests = new Map<string, string>();
    for (const member of members) {
      if (!member.resolution.ok) continue;
      const text = member.resolution.input.text;
      const digest = digests.get(text) ?? textDigest(text);
      digests.set(text, digest);
      for (const record of [...(catalog.keystrokeRecords ?? [])].reverse()) {
        if (seen.has(record.id) || record.text.digest !== digest || !recordTargetMatches(record, member.target)) continue;
        seen.add(record.id);
        choices.push({
          id: record.id,
          targetLabel: namedByKey.get(analysisTargetKey(member.target))?.displayName ?? record.targetName,
          rangeStart: record.range.start,
          rangeEnd: record.range.end,
          recordedAt: record.recordedAt,
        });
      }
    }
    return choices.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0));
  }, [analyzer, members, catalog.keystrokeRecords, namedByKey]);

  // 画面に入るまで計算を始めないペイン（Workspaceで、Analyzerが求めた時）。入った後に出た依頼は止めない
  const waitsForScreen = chrome.computeOnlyWhenOnScreen === true;
  const { ref: frameRef, onScreen } = usePaneOnScreen<HTMLElement>(waitsForScreen);
  const shown = onScreen && chrome.coveredByMaximizedPane !== true;
  const pane = useAnalyzerSetPane(cache, analyzer.definition, options, members, !readingLoading && !segmentationLoading && !tableLoading && shown);
  const { Body, Settings, HeaderControl, TargetItem } = analyzer;
  const extraction = pane.extraction;
  const extracted = extraction.status === 'ready' || extraction.status === 'stale' ? extraction.value.extracted : undefined;

  // 図で押した点の位置から打鍵再生へ移る手段。Workspaceは同じ対象を映す打鍵再生のペインへ伝え、個別画面は打鍵再生の画面を開く
  const seekStore = analyzer.jumpsToPlayback === true ? env.playbackSeek : undefined;
  const seekReceivers = usePlaybackSeekReceivers(seekStore);
  const openPlayback = analyzer.jumpsToPlayback === true ? env.openPlayback : undefined;
  const playbackJump = useMemo((): PlaybackJump | undefined => {
    if (seekStore !== undefined) {
      return {
        destination: 'pane',
        available: (targetKey) => seekReceivers.has(targetKey),
        jump: (targetKey, charPosition) => seekStore.seek(targetKey, charPosition),
      };
    }
    if (openPlayback !== undefined) return { destination: 'page', available: () => true, jump: openPlayback };
    return undefined;
  }, [seekStore, seekReceivers, openPlayback]);

  const effectiveBaseline = effectiveMultiBaseline(selection);
  const baselineTargetKey = effectiveBaseline === undefined ? undefined : analysisTargetKey(effectiveBaseline);
  const candidates = order.map((key) => ({
    key,
    label: namedByKey.get(key)?.displayName ?? key,
    fullName: namedByKey.get(key)?.fullName ?? '',
  }));

  return (
    <TextLanguageProvider value={resolvedText.language}>
      <NgramTableChoicesProvider value={tableChoices}>
        <PaneFrame
          assetsReady={assetsReady}
          name={analyzer.name}
          description={analyzer.description}
          help={resolvePaneHelp(analyzer.help, resolvedText.language)}
          recommendedWidthRem={recommendedWidthRemOf(analyzer)}
          headingLevel={chrome.headingLevel}
          stickyHeader={chrome.stickyHeader}
          menuItems={chrome.menuItems}
          headerAction={chrome.headerAction}
          targetBinding={chrome.targetBinding}
          optionsBinding={chrome.optionsBinding}
          showPaneNameInSettings={chrome.showPaneNameInSettings}
          target={
            <TargetSelection
              mode="multiple"
              groups={choiceGroups}
              selected={targets}
              summary={targetSummary}
              onChange={onTargetsChange}
              open={selectionOpen}
              onOpenChange={setSelectionOpen}
              autoOpen={assetsReady && chrome.autoOpenTargetSelection ? targets.length === 0 && !chrome.holdTargetSelectionClosed : undefined}
              extraItem={
                TargetItem === undefined ? undefined : (
                  <TargetItem
                    value={baselineTargetKey}
                    candidates={candidates}
                    onChange={(nextKey) => {
                      const next = nextKey === undefined ? undefined : targets.find((t) => analysisTargetKey(t) === nextKey);
                      onBaselineChange(next);
                    }}
                  />
                )
              }
            />
          }
          {...(HeaderControl === undefined ? {} : { targetExtra: <HeaderControl options={options} onOptionsChange={onOptionsChange} /> })}
          settings={<Settings options={options} onOptionsChange={onOptionsChange} />}
          onResetOptions={() => onOptionsChange(analyzer.defaultOptions)}
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
            ...(env.workspaceId === undefined ? {} : { workspace: { id: env.workspaceId } }),
            hiddenIds: excludeIds,
            // 手持ちに無いSetup（削除したもの）へは、`/setup` で開いても別のSetupが選ばれるだけなので出さない
            openSetups: targets.flatMap((target) =>
              target.kind === 'setup' && setupsById.has(target.setupId)
                ? [{ id: target.setupId, name: namedByKey.get(analysisTargetKey(target))?.displayName ?? target.setupId }]
                : [],
            ),
          }}
          conditionTargetDiffs={conditionSummary.diffs}
          conditionProvenance={provenanceItems}
          reading={paneReadingState}
          engineState={extraction}
          frameRef={frameRef}
          waitingForScreen={waitsForScreen && !shown && extraction.status === 'idle'}
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
              onOptionsChange={onOptionsChange}
              copyFigureImage={copyFigureImage}
              {...(playbackJump === undefined ? {} : { playbackJump })}
              {...(segmentationStatus === undefined ? {} : { segmentation: segmentationStatus })}
              {...(tableStatus === undefined ? {} : { ngramTable: tableStatus })}
              {...(keystrokeRecords === undefined ? {} : { keystrokeRecords })}
              {...(recordTexts === undefined ? {} : { keystrokeRecordTexts: recordTexts })}
            />
          )}
        </PaneFrame>
      </NgramTableChoicesProvider>
    </TextLanguageProvider>
  );
}

/**
 * 表の元が選んだテキストの時の、表の用意の状態。作っている間は`ready`（値を出す前の計算中として扱う）。
 * 日本語でないテキスト・分割器を使えない・表を作れない時は、値を出さない状態にする。
 */
function textTableStatus(
  language: string,
  hasSplitter: boolean,
  segmentation: 'idle' | 'loading' | 'failed' | 'ready',
  user: { readonly status: 'idle' | 'loading' | 'failed' | 'ready' },
  set: NgramTableSet | undefined,
): NgramTableStatus {
  if (language !== 'ja') return 'unsupported';
  if (!hasSplitter || segmentation === 'failed' || user.status === 'failed') return 'failed';
  if (set !== undefined && set.sufficiency[0]?.occurrences === 0) return 'empty';
  return 'ready';
}
