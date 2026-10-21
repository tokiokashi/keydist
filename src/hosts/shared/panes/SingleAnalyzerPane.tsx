import { useEffect, useMemo } from 'react';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { analysisTargetKey, nameTargets, type AnalysisTarget } from '#input/setup/index.ts';
import type { ColorSlotsByKey, TargetSet } from '#engine/multi-target-selection.ts';
import type { SetTargetFigure, SingleAnalyzerPaneParts } from '#analyzers/pane-parts.tsx';
import { conditionHeaderInfoFromResolvedInput, settingsItemIds, traceConditionSummary, type ConditionSummaryScope } from '../condition-summary.ts';
import { combinePaneStates } from '../pane-status.ts';
import { recommendedWidthRemOf } from '#analyzers/recommended-width.ts';
import { PaneFrame } from '../PaneFrame.tsx';
import { overrideWinsNotices } from '../condition-edit.ts';
import { resolvePaneInput } from '../resolve-pane-input.ts';
import { targetNameSource } from '../target-name-source.ts';
import { setupNumbersOf, targetChoiceGroups } from '../target-choices.ts';
import { TargetSelection } from '../TargetSelection.tsx';
import { KeyDetailWindow } from '../KeyDetailWindow.tsx';
import { keySelectionTargetOf } from '../key-selection.ts';
import { usePaneKeySelection } from '../key-selection-store.tsx';
import { useAnalyzerPane } from '../use-analyzer-pane.ts';
import { playbackSeekDeliveryFor } from '../playback-seek.ts';
import { usePlaybackSeekCommand } from '../playback-seek-store.tsx';
import { useCoherentPaneValues } from '../coherent-pane-values.ts';
import { useTargetExtractions } from '../use-target-extractions.ts';
import { useSetTargetSelection } from '../use-set-target-selection.ts';
import { setTargetFigureState, setTargetsBesideSingle } from '../set-target-figures.ts';
import type { PaneChrome, PaneEnvironment } from './pane-environment.ts';
import { readingProvenance } from '../reading-evaluation.ts';
import { PersonalSpeedSavedContext } from '#ui/primitives/personal-speed-link.tsx';

/**
 * 対象を1つ見るAnalyzer（Single）のペイン。どのSingleも、渡された`analyzer`だけが違う。個別画面とWorkspaceのペインが同じこのcomponentを使う
 * （docs/architecture.md「画面の構成」「Analyzerがペインに渡すもの」）。
 *
 * 持つのは、対象の解決・engineへの依頼・条件の要約・見出し・状態表示まで。値の持ち主
 * （対象・解析設定をどこへ保存するか）と、文脈バー・テキストは持たない。器が、下書きの値と
 * 変更の通知をここへ結ぶ。
 */
export interface SingleAnalyzerPaneProps<Options, Extracted> {
  /** このペインが映すAnalyzer（各Analyzerの`definition.tsx`がexportする、ペインに渡すもの）。 */
  readonly analyzer: SingleAnalyzerPaneParts<Options, Extracted>;
  readonly env: PaneEnvironment;
  readonly chrome?: PaneChrome;
  readonly target: AnalysisTarget;
  readonly onTargetChange: (next: AnalysisTarget) => void;
  /** 画面上の解析設定（下書き）。 */
  readonly options: Options;
  /** 下書きの更新と、資産への反映（間引き済み）は器が結ぶ。 */
  readonly onOptionsChange: (next: Options) => void;
  /** 保存した解析設定を読み直した時の診断。 */
  readonly settingsDiagnostics?: readonly CodecDiagnostic[];
  /** 共有リンクを開いた時に、取り込めなかったものを伝える文。 */
  readonly linkNotices?: readonly string[];
  /**
   * Singleの対象の図の下に並べる、Multiの集合（選んだ対象と、対象に配った色の番号）。単体の画面が、
   * Analyzerが`standaloneSetTargets`を宣言している時だけ渡す。読むだけで、どちらにも書かない。
   */
  readonly setTargetSource?: { readonly selection: TargetSet; readonly colorSlots: ColorSlotsByKey };
  /** 開いた時の最初の文字位置（別の画面の図から開いた時の個別画面）。`acceptsPlaybackSeek` を宣言したAnalyzerにだけ渡る。 */
  readonly initialCharPosition?: number;
}

const NO_SET_TARGETS: TargetSet = { targets: [], baseline: undefined };
const NO_BESIDE_MEMBERS: readonly never[] = [];

export function SingleAnalyzerPane<Options, Extracted>({
  analyzer,
  env,
  chrome = {},
  target,
  onTargetChange,
  options,
  onOptionsChange,
  settingsDiagnostics = [],
  linkNotices,
  setTargetSource,
  initialCharPosition,
}: SingleAnalyzerPaneProps<Options, Extracted>) {
  const { setups, overrides, catalog, resolvedText, cache, dispatch, assetsReady } = env;
  // 辞書の読み込み中は、評価に渡すテキストがまだ無いので依頼を出さない（漢字を打てない文字に数えた暫定の数値を出さない）
  const readingLoading = env.reading?.kind === 'loading';
  const conditionProvenance = useMemo(() => readingProvenance(resolvedText.reading), [resolvedText.reading]);
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  const resolution = useMemo(
    () => resolvePaneInput(target, setupsById, catalog, overrides, resolvedText),
    [target, setupsById, catalog, overrides, resolvedText],
  );
  const pane = useAnalyzerPane(cache, analyzer.definition, options, resolution, !readingLoading);

  // このAnalyzerが読む条件だけを、要約と対象名に足して数える（読まない条件を数えると、その条件で測ったように読めるため）
  const summaryScope = useMemo(
    (): ConditionSummaryScope => ({
      extraIds: settingsItemIds(analyzer.conditionExtraIds),
    }),
    [analyzer],
  );
  const conditionRows = resolution.ok ? traceConditionSummary(resolution.input.cascade, catalog.setupCatalog, summaryScope) : [];
  const header = resolution.ok ? conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry) : undefined;
  // Traceと抽出は別々に解決する。図と一緒に出すTrace由来の値（飛ばした文字・エラー）は、図と同じ入力の組から読む
  const coherent = useCoherentPaneValues(pane.extraction, pane.trace);
  const traceErrors = coherent?.trace.trace.errors ?? [];

  // 対象の名前（読み上げ用の名前と、見出しの対象・hoverに出すフル名）。単一対象なので集合は自分1つ。
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const named = useMemo(
    () => nameTargets([targetNameSource(target, resolution, setupsById, setupNumbers, catalog.setupCatalog, [], summaryScope)])[0],
    [target, resolution, setupsById, setupNumbers, catalog.setupCatalog, summaryScope],
  );

  // Singleの対象の図の下に並べる、Multiの集合の対象。宣言したAnalyzerの単体の画面でだけ並ぶ
  const standaloneSetTargets = analyzer.standaloneSetTargets;
  const setSource = standaloneSetTargets === undefined ? undefined : setTargetSource;
  const setSelection = useSetTargetSelection(setSource?.selection ?? NO_SET_TARGETS, setSource?.colorSlots ?? {}, setups, catalog);
  const besideTargets = useMemo(() => setTargetsBesideSingle(setSelection.targets, target), [setSelection.targets, target]);
  const besideMembers = useMemo(
    () =>
      besideTargets.map((beside) => ({
        key: analysisTargetKey(beside),
        target: beside,
        resolution: resolvePaneInput(beside, setupsById, catalog, overrides, resolvedText),
      })),
    [besideTargets, setupsById, catalog, overrides, resolvedText],
  );
  const besideExtractions = useTargetExtractions(cache, analyzer.definition, options, readingLoading ? NO_BESIDE_MEMBERS : besideMembers);
  // 表示名は、画面に並ぶ集合（Singleの対象と並べる対象）に対して計算する
  const besideNamed = useMemo(() => {
    if (besideMembers.length === 0) return new Map<string, ReturnType<typeof nameTargets>[number]>();
    const sources = [
      targetNameSource(target, resolution, setupsById, setupNumbers, catalog.setupCatalog, [], summaryScope),
      ...besideMembers.map((member) =>
        targetNameSource(member.target, member.resolution, setupsById, setupNumbers, catalog.setupCatalog, [], summaryScope),
      ),
    ];
    return new Map(nameTargets(sources).map((item) => [item.key, item] as const));
  }, [besideMembers, target, resolution, setupsById, setupNumbers, catalog.setupCatalog, summaryScope]);
  const setTargetFigures = useMemo(
    (): readonly SetTargetFigure<Extracted>[] =>
      besideMembers.map((member) => ({
        key: member.key,
        label: besideNamed.get(member.key)?.displayName ?? member.key,
        fullName: besideNamed.get(member.key)?.fullName ?? '',
        color: setSelection.colorByKey.get(member.key),
        mark: setSelection.markByKey.get(member.key),
        state: setTargetFigureState(member.resolution, besideExtractions.get(member.key)),
      })),
    [besideMembers, besideNamed, setSelection.colorByKey, setSelection.markByKey, besideExtractions],
  );

  const choiceGroups = useMemo(
    () =>
      targetChoiceGroups({
        layouts: catalog.setupCatalog.layouts,
        userLayouts: catalog.userLayouts,
        shapes: catalog.setupCatalog.shapes,
        setups,
        selected: [target],
      }),
    [catalog, setups, target],
  );

  // 図のキーの選択。同じ配列・物理配列のペインどうしで共有し、キーの詳細を持つAnalyzerだけが使う
  const { Body, Settings, keyDetailsOf } = analyzer;
  const selectionTarget =
    keyDetailsOf !== undefined && resolution.ok ? keySelectionTargetOf(resolution.input.layout.id, resolution.input.geometry.id) : undefined;
  const keySelection = usePaneKeySelection(chrome.paneKey, selectionTarget);
  const selectedGeometry = resolution.ok ? resolution.input.geometry : undefined;
  const { selectedKeyId, clear: clearKeySelection } = keySelection;
  // 対象を替えて、選んだキーが物理配列に無くなったら選択を外す
  useEffect(() => {
    if (selectedKeyId !== undefined && selectedGeometry !== undefined && !selectedGeometry.keys.has(selectedKeyId)) clearKeySelection();
  }, [selectedKeyId, selectedGeometry, clearKeySelection]);

  // 図で押された文字位置へ移る操作を受ける（Workspace）。同じ対象を映す打鍵再生のペインとして登録し、宛てられた操作を本体へ渡す
  const seekStore = analyzer.acceptsPlaybackSeek === true ? env.playbackSeek : undefined;
  const targetKey = analysisTargetKey(target);
  const seekCommand = usePlaybackSeekCommand(seekStore);
  const canReceiveSeek = resolution.ok;
  useEffect(() => {
    if (seekStore === undefined || !canReceiveSeek) return undefined;
    return seekStore.register(targetKey);
  }, [seekStore, targetKey, canReceiveSeek]);
  const playbackSeek = seekStore === undefined ? undefined : playbackSeekDeliveryFor(seekCommand, targetKey);

  const extraction = pane.extraction;

  return (
    <PaneFrame
      assetsReady={assetsReady}
      name={analyzer.name}
      description={analyzer.description}
      recommendedWidthRem={
        standaloneSetTargets !== undefined && setTargetFigures.length > 0 ? standaloneSetTargets.recommendedWidthRem : recommendedWidthRemOf(analyzer)
      }
      headingLevel={chrome.headingLevel}
      stickyHeader={chrome.stickyHeader}
      menuItems={chrome.menuItems}
      headerAction={chrome.headerAction}
      targetBinding={chrome.targetBinding}
      optionsBinding={chrome.optionsBinding}
      showPaneNameInSettings={chrome.showPaneNameInSettings}
      floating={(paneName) =>
        keyDetailsOf !== undefined &&
        keySelection.windowKeyId !== undefined &&
        resolution.ok &&
        coherent !== undefined &&
        resolution.input.geometry.keys.has(keySelection.windowKeyId) ? (
          <KeyDetailWindow
            keyId={keySelection.windowKeyId}
            layout={resolution.input.layout}
            geometry={resolution.input.geometry}
            trace={coherent.trace.trace}
            keyDetails={keyDetailsOf(coherent.extraction.extracted)}
            anchor={keySelection.anchor}
            onClose={keySelection.clear}
            {...(paneName === undefined ? {} : { paneName })}
          />
        ) : null
      }
      {...(named === undefined || !assetsReady ? {} : { targetName: named.displayName })}
      target={
        <TargetSelection
          mode="single"
          groups={choiceGroups}
          selected={[target]}
          // 資産の読み込み前の対象は、保存済みの対象が未反映なだけの既定値（QWERTY）。比較表・N感度が
          // 空の対象を出さないのと同じく、読み込みが済むまで名前を出さず、保存済みの名前へ置き換わる所を見せない
          summary={named === undefined || !assetsReady ? [] : [{ key: named.key, label: named.displayName, fullName: named.fullName }]}
          onChange={(next) => {
            if (next[0] !== undefined) onTargetChange(next[0]);
          }}
        />
      }
      settings={
        <PersonalSpeedSavedContext.Provider value={catalog.personalSpeed !== undefined}>
          <Settings options={options} onOptionsChange={onOptionsChange} />
        </PersonalSpeedSavedContext.Provider>
      }
      onResetOptions={() => onOptionsChange(analyzer.defaultOptions)}
      header={header}
      conditionRows={conditionRows}
      conditionEditor={{
        overrides,
        dispatch,
        presetLibrary: env.presetLibrary,
        generatePresetId: env.generatePresetId,
        undo: env.undo,
        shapes: catalog.setupCatalog.shapes,
        customFingerAssignments: catalog.customFingerAssignments,
        customRomajiRules: catalog.customRomajiRules,
        notices: overrideWinsNotices(conditionRows, catalog.setupCatalog),
        ...(env.workspaceId === undefined
          ? {}
          : {
              workspace: { id: env.workspaceId },
              workspaceNotices: overrideWinsNotices(conditionRows, catalog.setupCatalog, 'Workspace'),
            }),
        // 対象が配列でも、Setupでも、書き込む先は配列のレベル（Setupのレベルへ書く導線は別）。
        ...(resolution.ok ? { layout: { id: resolution.input.layout.id, name: resolution.input.layout.name } } : {}),
        ...(target.kind === 'setup' ? { openSetups: [{ id: target.setupId }] } : {}),
      }}
      conditionProvenance={conditionProvenance}
      reading={env.reading}
      engineState={combinePaneStates(extraction, pane.trace)}
      traceErrors={traceErrors}
      settingsDiagnostics={settingsDiagnostics}
      linkNotices={linkNotices}
    >
      {resolution.ok && coherent !== undefined ? (
        <Body
          layout={resolution.input.layout}
          geometry={resolution.input.geometry}
          trace={coherent.trace.trace}
          extracted={coherent.extraction.extracted}
          options={options}
          onOptionsChange={onOptionsChange}
          {...(playbackSeek === undefined ? {} : { playbackSeek })}
          {...(analyzer.acceptsPlaybackSeek === true && initialCharPosition !== undefined ? { initialCharPosition } : {})}
          {...(setTargetFigures.length === 0 ? {} : { setTargets: setTargetFigures })}
          {...(keyDetailsOf === undefined
            ? {}
            : {
                keySelection: { selectedKeyId, onKeyPress: keySelection.press, onClear: keySelection.clear },
              })}
        />
      ) : undefined}
    </PaneFrame>
  );
}
