import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import {
  addKeystrokeRecordCommand,
  deleteKeystrokeRecordCommand,
  importKeystrokeRecordsCommand,
  setReadingCorrectionCommand,
  setSingleTargetCommand,
  setWordReadingCorrectionCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import type { ResolvedInput } from '#engine/resolved-input.ts';
import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import { recordPlanFrom, windowedSignatureOf, type SpellingRebuild, type RecordRangeStatus, type RecordMeta } from '#engine/keystroke-record.ts';
import { KEYSTROKE_RECORD_FILE_MAX_BYTES, keystrokeRecordFileText, readKeystrokeRecordFile } from '#engine/keystroke-record-file.ts';
import { analysisTargetKey, layoutIdsOfTargets, nameTargets } from '#input/setup/index.ts';
import type { PresetIdGenerator } from '#input/presets/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { browserKeyBindingsForShape, type BrowserKeyBindingOverrides } from '#input/shapes/browser-key-codes.ts';
import { isPresetGeometryKind, presetGeometryStandard } from '#input/shapes/geometry.ts';
import { textRangeBounds } from '#input/text/display-ranges.ts';
import type { KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import { calibrationKeyLabel, unassignedThumbKeys } from '#interpretation/timing/calibration-session.ts';
import {
  remainingSentenceKeys,
  remainingSentenceStrokes,
  sentenceKeyIds,
  upcomingSentenceSteps,
  type SentencePlan,
  type SentenceSession,
} from '#interpretation/timing/sentence-session.ts';
import { loadBrowserKeyBindingOverrides } from '#tester/browser-keyboard-bindings.ts';
import { useSentenceRun } from '#editors/personal-speed/use-sentence-run.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { PaneFrame } from '#hosts/shared/PaneFrame.tsx';
import { ReadingChip } from '#hosts/shared/ReadingChip.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { TargetSelection } from '#hosts/shared/TargetSelection.tsx';
import { overrideWinsNotices } from '#hosts/shared/condition-edit.ts';
import { conditionHeaderInfoFromResolvedInput, traceConditionSummary } from '#hosts/shared/condition-summary.ts';
import { singlePaneConditionScope } from '#hosts/shared/changed-condition.ts';
import { comboSetProvenance, isWaitingForReading, readingProvenance, type ReadingSource } from '#hosts/shared/reading-evaluation.ts';
import { resolvePaneInput, type PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { useStableResolvedText } from '#hosts/shared/stable-resolved-text.ts';
import { setupNumbersOf, targetChoiceGroups } from '#hosts/shared/target-choices.ts';
import { targetNameSource } from '#hosts/shared/target-name-source.ts';
import { useReadingEvaluation } from '#hosts/shared/use-reading-evaluation.ts';
import { useHeldEvaluation, useResolvedTextSelection } from '#hosts/shared/use-resolved-text-selection.ts';
import type { ConditionEditorContext } from '#hosts/shared/ConditionEditor.tsx';
import { downloadText } from '#platform/browser-download.ts';
import { readTextFile } from '#platform/browser-file.ts';
import { wrongKeyText, unassignedThumbKeysText } from '#editors/personal-speed/calibration-text.ts';
import type { RecordComputer } from './record-computer.ts';
import {
  CANCEL_LABEL,
  COMPUTE_FAILED_TEXT,
  COMPUTING_TEXT,
  DISCARD_LABEL,
  EMPTY_LIST_TEXT,
  EXPORT_LABEL,
  failureText,
  FINISHING_TEXT,
  IMPORT_LABEL,
  IMPORT_TOO_LARGE_TEXT,
  IMPORT_UNREADABLE_TEXT,
  importedText,
  PREPARING_TEXT,
  pendingText,
  RECORD_PAGE_DESCRIPTION,
  RECORD_PAGE_NAME,
  rangeLabel,
  rangeText,
  recordedAtText,
  remainingText,
  SAVE_LABEL,
  SAVED_NOTICE,
  START_LABEL,
  unmeasurableText,
} from './record-text.ts';
import './record.css';

export interface RecordPageProps {
  readonly assets: KeydistAssets;
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly getAssets: () => KeydistAssets;
  readonly computer: RecordComputer;
  readonly reading: ReadingSource;
  readonly catalog: PaneCatalog;
  readonly generateTextId: TextIdGenerator;
  readonly generatePresetId: PresetIdGenerator;
  readonly generateRecordId: () => string;
  readonly onTextContentCommit: TextContentCommit;
  readonly history: ContextBarHistory;
  /** 記録に残すアプリの版。 */
  readonly appVersion: string;
}

/** 打つ範囲と、打ち始めた時の入力。測定の間は、この入力で打鍵の列と記録を作る。 */
interface Started {
  readonly input: ResolvedInput;
  readonly rangeIndex: number;
  readonly plan: SentencePlan;
  /** 綴りを受け付ける範囲の、打った綴りから打鍵の列を作り直す関数。 */
  readonly rebuild: SpellingRebuild | undefined;
  readonly meta: RecordMeta;
}

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'typing' }
  | { readonly kind: 'finishing' }
  | { readonly kind: 'pending'; readonly record: KeystrokeRecord; readonly wrong: number }
  | { readonly kind: 'failed'; readonly text: string };

/** 範囲の本文のうち、今の単位の前後だけを出す単位の数。 */
const VISIBLE_BEFORE = 24;
const VISIBLE_AFTER = 72;

function SentenceWindow({ plan, session }: { readonly plan: SentencePlan; readonly session: SentenceSession }) {
  const current = session.run.unit;
  const from = Math.max(0, current - VISIBLE_BEFORE);
  const to = Math.min(plan.units.length, current + VISIBLE_AFTER);
  return (
    <p className="record-sentence" data-record-sentence>
      {from > 0 ? '…' : null}
      {plan.units.slice(from, to).map((unit, offset) => {
        const index = from + offset;
        const state = current > index ? 'done' : current === index ? 'current' : 'rest';
        return (
          <span key={index} data-sentence-unit={state}>
            {unit.text}
          </span>
        );
      })}
      {to < plan.units.length ? '…' : null}
    </p>
  );
}

function readKeyBindingOverrides(): BrowserKeyBindingOverrides {
  try {
    return loadBrowserKeyBindingOverrides(window.localStorage);
  } catch {
    return {};
  }
}

export function RecordPage({
  assets,
  assetsReady,
  dispatch,
  computer,
  reading,
  catalog,
  generateTextId,
  generatePresetId,
  generateRecordId,
  onTextContentCommit,
  history,
  appVersion,
}: RecordPageProps) {
  const target = effectiveSingleTarget(assets.singleTargetSelection);
  const { resolved, body: textBody } = useResolvedTextSelection(assets.standaloneTextSelection, assets.textLibrary);
  const resolvedText = useStableResolvedText(resolved);
  const evaluation = useHeldEvaluation(useReadingEvaluation(resolvedText, reading, assetsReady), textBody);
  const { setups, overrides } = assets.setupLibrary;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);
  const readingLoading = isWaitingForReading(evaluation.state);

  const resolution = useMemo(
    () => resolvePaneInput(target, setupsById, catalog, overrides, evaluation.text),
    [target, setupsById, catalog, overrides, evaluation.text],
  );
  const input = resolution.ok ? resolution.input : undefined;

  // 全文の打鍵の列と範囲ごとの状態。計算用のWorkerが作る。
  const [ranges, setRanges] = useState<
    { readonly input: object; readonly statuses: readonly RecordRangeStatus[]; readonly inputChars: number } | 'failed' | undefined
  >(undefined);
  useEffect(() => {
    setRanges(undefined);
    if (input === undefined || readingLoading) return undefined;
    let cancelled = false;
    computer.ranges(input).then(
      (value) => {
        if (!cancelled) setRanges({ input, statuses: value.statuses, inputChars: value.inputChars });
      },
      () => {
        if (!cancelled) setRanges('failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [computer, input, readingLoading]);
  const statuses = ranges === undefined || ranges === 'failed' || ranges.input !== input ? undefined : ranges.statuses;

  const [rangeIndex, setRangeIndex] = useState(0);
  const selectedIndex = statuses === undefined ? 0 : Math.min(rangeIndex, statuses.length - 1);
  const selected = statuses?.[selectedIndex];

  // 対象の名前
  const summaryScope = useMemo(() => singlePaneConditionScope(undefined, evaluation.text.language), [evaluation.text.language]);
  const setupNumbers = useMemo(() => setupNumbersOf(setups), [setups]);
  const named = useMemo(
    () => nameTargets([targetNameSource(target, resolution, setupsById, setupNumbers, catalog.setupCatalog, [], summaryScope)])[0],
    [target, resolution, setupsById, setupNumbers, catalog.setupCatalog, summaryScope],
  );
  const choiceGroups = useMemo(
    () =>
      targetChoiceGroups({
        layouts: catalog.setupCatalog.layouts,
        userLayouts: catalog.userLayouts,
        shapes: catalog.setupCatalog.shapes,
        comboSets: catalog.comboSets,
        setups,
        selected: [target],
      }),
    [catalog, setups, target],
  );
  const conditionRows = useMemo(
    () => (resolution.ok ? traceConditionSummary(resolution.input.cascade, catalog.setupCatalog, summaryScope) : []),
    [resolution, catalog.setupCatalog, summaryScope],
  );
  const provenance = useMemo(
    () => [...readingProvenance(evaluation.text.reading), ...comboSetProvenance(resolution.ok ? resolution.input.comboSet : undefined)],
    [evaluation.text.reading, resolution],
  );

  // 記録を取る進行
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [started, setStarted] = useState<Started | undefined>(undefined);
  const startedRef = useRef<Started | undefined>(undefined);
  const [bindings, setBindings] = useState<BrowserKeyBindingOverrides>({});
  const bindingsRef = useRef<BrowserKeyBindingOverrides>({});
  const shapeId = input?.geometry.id ?? '';
  const keyLabel = useMemo(() => {
    const legends = input?.layout.legends ?? new Map<string, string>();
    const standard = isPresetGeometryKind(shapeId) ? presetGeometryStandard(shapeId) : undefined;
    return (keyId: string) => calibrationKeyLabel(legends, keyId, bindings, standard);
  }, [input, shapeId, bindings]);

  const finished = useCallback(
    (session: SentenceSession) => {
      const current = startedRef.current;
      const first = session.records[0];
      if (current === undefined || first === undefined || input === undefined) return;
      setPhase({ kind: 'finishing' });
      const wrong = first.taps.filter((tap) => !tap.clean).length;
      const windowed = current.rebuild === undefined ? undefined : windowedSignatureOf(current.rebuild, first.typed);
      computer.finish(current.input, current.rangeIndex, first.typed, first.taps, current.meta, windowed).then(
        (result) => {
          startedRef.current = undefined;
          setStarted(undefined);
          setPhase(result.ok ? { kind: 'pending', record: result.record, wrong } : { kind: 'failed', text: failureText() });
        },
        () => {
          startedRef.current = undefined;
          setStarted(undefined);
          setPhase({ kind: 'failed', text: COMPUTE_FAILED_TEXT });
        },
      );
    },
    [computer, input],
  );
  const runner = useSentenceRun({ keyLabel, codeBindings: () => bindingsRef.current, onFinished: finished });

  // 打っている間に対象・テキスト・条件が変わったら、その記録は取らずにやめる。
  const { cancel: cancelRun } = runner;
  useEffect(() => {
    const current = startedRef.current;
    if (current === undefined || current.input === input) return;
    startedRef.current = undefined;
    setStarted(undefined);
    cancelRun();
    setPhase((phase) => (phase.kind === 'typing' || phase.kind === 'preparing' ? { kind: 'idle' } : phase));
  }, [input, cancelRun]);

  const runRegionRef = useRef<HTMLDivElement>(null);
  const typing = runner.session !== undefined;
  useEffect(() => {
    if (typing) runRegionRef.current?.focus();
  }, [typing]);

  const start = async () => {
    if (input === undefined || selected === undefined || selected.unmeasurable !== undefined || ranges === undefined || ranges === 'failed') return;
    setNotice(undefined);
    setPhase({ kind: 'preparing' });
    try {
      const value = await computer.range(input, selectedIndex);
      const planned = recordPlanFrom(input, value.range, value.strokes, value.inputChars);
      if (!planned.ok) {
        setPhase({ kind: 'failed', text: unmeasurableText(planned.reason) });
        return;
      }
      const nextBindings = browserKeyBindingsForShape(shapeId, readKeyBindingOverrides());
      const unassigned = unassignedThumbKeys(sentenceKeyIds([planned.plan]), nextBindings);
      if (unassigned.length > 0) {
        setPhase({ kind: 'failed', text: unassignedThumbKeysText(unassigned) });
        return;
      }
      const targetLabel = named?.fullName ?? analysisTargetKey(target);
      const nextStarted: Started = {
        input,
        rangeIndex: selectedIndex,
        plan: planned.plan,
        rebuild: planned.rebuild,
        meta: {
          id: generateRecordId(),
          recordedAt: new Date().toISOString(),
          appVersion,
          target,
          targetName: targetLabel,
          textIdentity: `${evaluation.text.ref.kind}:${evaluation.text.ref.id}`,
          textName: evaluation.text.name,
        },
      };
      startedRef.current = nextStarted;
      setStarted(nextStarted);
      bindingsRef.current = nextBindings;
      setBindings(nextBindings);
      setPhase({ kind: 'typing' });
      runner.start([planned.plan], 1);
    } catch {
      startedRef.current = undefined;
      setStarted(undefined);
      setPhase({ kind: 'failed', text: COMPUTE_FAILED_TEXT });
    }
  };
  const cancel = () => {
    startedRef.current = undefined;
    setStarted(undefined);
    runner.cancel();
    setPhase({ kind: 'idle' });
  };
  const save = () => {
    if (phase.kind !== 'pending') return;
    dispatch(addKeystrokeRecordCommand(phase.record));
    setPhase({ kind: 'idle' });
    setNotice(SAVED_NOTICE);
  };

  // 保存した記録の書き出しと読み込み
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileNotice, setFileNotice] = useState<string | undefined>(undefined);
  const exportRecords = () => downloadText('keydist-keystroke-records.json', keystrokeRecordFileText(assets.keystrokeRecords), 'application/json');
  const importFile = async (file: File) => {
    const read = await readTextFile(file, KEYSTROKE_RECORD_FILE_MAX_BYTES);
    if (read.kind !== 'ok') {
      setFileNotice(read.kind === 'too-large' ? IMPORT_TOO_LARGE_TEXT : IMPORT_UNREADABLE_TEXT);
      return;
    }
    const result = readKeystrokeRecordFile(read.text);
    if (!result.ok) {
      setFileNotice(result.message);
      return;
    }
    const known = new Set(assets.keystrokeRecords.map((record) => record.id));
    const added = result.records.filter((record) => !known.has(record.id)).length;
    dispatch(importKeystrokeRecordsCommand(result.records));
    setFileNotice(importedText(added, result.records.length - added, result.dropped));
  };

  const conditionEditor: ConditionEditorContext = {
    overrides,
    dispatch,
    presetLibrary: assets.presetLibrary,
    generatePresetId,
    undo: history.undo,
    shapes: catalog.setupCatalog.shapes,
    customFingerAssignments: catalog.customFingerAssignments,
    customRomajiRules: catalog.customRomajiRules,
    notices: overrideWinsNotices(conditionRows, catalog.setupCatalog),
    ...(resolution.ok ? { layout: { id: resolution.input.layout.id, name: resolution.input.layout.name } } : {}),
    ...(target.kind === 'setup' ? { openSetups: [{ id: target.setupId }] } : {}),
  };

  const session = runner.session;
  const nextKeys = session === undefined ? [] : remainingSentenceKeys(session.run);
  const upcoming = session === undefined ? [] : upcomingSentenceSteps(session.run, 8).map((step) => step.keys.map(keyLabel).join('+'));
  const total = started?.plan.baseSteps.reduce((sum, steps) => sum + steps.length, 0) ?? 0;
  const remaining = session === undefined ? 0 : remainingSentenceStrokes(session.run);
  const busy = phase.kind !== 'idle' && phase.kind !== 'failed';
  const boundsCount = input === undefined ? 0 : textRangeBounds(input.text).length - 1;

  const body = (
    <div className="record-body" data-record-page>
      <section className="record-section" aria-label="記録する範囲">
        {statuses === undefined ? (
          <p className="record-note" aria-busy={ranges !== 'failed'} data-record-computing>
            {ranges === 'failed' ? COMPUTE_FAILED_TEXT : COMPUTING_TEXT}
          </p>
        ) : (
          <>
            <div className="record-toolbar">
              {statuses.length > 1 ? (
                <label className="record-field">
                  <span>範囲</span>
                  <select value={selectedIndex} disabled={busy} onChange={(event) => setRangeIndex(Number(event.target.value))} data-record-range>
                    {statuses.map((status, index) => (
                      <option key={status.start} value={index}>
                        {rangeLabel(index, status.start, status.end)}
                        {status.unmeasurable === undefined ? '' : '（打てません）'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="record-field" data-record-range-single>
                  {rangeText(statuses[0]!.start, statuses[0]!.end)}
                </span>
              )}
              <button type="button" onClick={start} disabled={busy || selected?.unmeasurable !== undefined} data-record-start>
                {START_LABEL}
              </button>
            </div>
            {selected?.unmeasurable === undefined ? null : (
              <p className="record-warning" role="status" data-record-unmeasurable={selected.unmeasurable}>
                {unmeasurableText(selected.unmeasurable)}
              </p>
            )}
          </>
        )}
        {phase.kind === 'preparing' ? <p className="record-note">{PREPARING_TEXT}</p> : null}
        {phase.kind === 'finishing' ? <p className="record-note">{FINISHING_TEXT}</p> : null}
        {phase.kind === 'failed' ? (
          <p className="record-warning" role="alert" data-record-failed>
            {phase.text}
          </p>
        ) : null}
        {notice === undefined ? null : (
          <p className="record-note" role="status" data-record-notice>
            {notice}
          </p>
        )}
      </section>

      {session === undefined || started === undefined ? null : (
        <div className="record-run" ref={runRegionRef} tabIndex={-1} data-record-run="active">
          <progress className="record-progress" max={Math.max(1, total)} value={Math.max(0, total - remaining)} aria-label="打った位置" />
          <p className="record-meta" data-record-position>
            {remainingText(remaining)}
          </p>
          <SentenceWindow plan={started.plan} session={session} />
          <p className="record-instruction">
            次に打つキー:{' '}
            <span data-record-next>
              {nextKeys.map((key) => (
                <kbd key={key}>{keyLabel(key)}</kbd>
              ))}
            </span>
          </p>
          <p className="record-meta" data-record-upcoming>
            この後: {upcoming.join(' ')}
          </p>
          <p className="record-warning" role="status">
            {runner.wrongKey === undefined ? '' : wrongKeyText(runner.wrongKey)}
          </p>
          <button type="button" onClick={cancel} data-record-cancel>
            {CANCEL_LABEL}
          </button>
        </div>
      )}

      {phase.kind !== 'pending' ? null : (
        <div className="record-pending" data-record-pending>
          <p>{pendingText(phase.record.taps.length, phase.record.taps[phase.record.taps.length - 1]!.atMs / 1000, phase.wrong)}</p>
          <div className="record-toolbar">
            <button type="button" onClick={save} data-record-save>
              {SAVE_LABEL}
            </button>
            <button type="button" onClick={() => setPhase({ kind: 'idle' })} data-record-discard>
              {DISCARD_LABEL}
            </button>
          </div>
        </div>
      )}

      <section className="record-section" aria-label="保存した記録">
        <div className="record-heading">
          <h2>保存した記録</h2>
          <div className="record-toolbar">
            <button type="button" onClick={exportRecords} disabled={assets.keystrokeRecords.length === 0} data-record-export>
              {EXPORT_LABEL}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} data-record-import>
              {IMPORT_LABEL}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              data-record-import-input
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file !== undefined) void importFile(file);
              }}
            />
          </div>
        </div>
        {fileNotice === undefined ? null : (
          <p className="record-note" role="status" data-record-file-notice>
            {fileNotice}
          </p>
        )}
        {assets.keystrokeRecords.length === 0 ? (
          <p className="record-note" data-record-empty>
            {EMPTY_LIST_TEXT}
          </p>
        ) : (
          <div className="record-table-wrap">
            <table className="record-table" data-record-list>
              <thead>
                <tr>
                  <th scope="col">日時</th>
                  <th scope="col">テキスト</th>
                  <th scope="col">範囲</th>
                  <th scope="col">対象</th>
                  <th scope="col">打数</th>
                  <th scope="col">
                    <span className="record-visually-hidden">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...assets.keystrokeRecords].reverse().map((record) => (
                  <tr key={record.id} data-record-row={record.id}>
                    <td>{recordedAtText(record)}</td>
                    <td>{record.text.name}</td>
                    <td>{rangeText(record.range.start, record.range.end)}</td>
                    <td>{record.targetName}</td>
                    <td>{record.taps.length}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => dispatch(deleteKeystrokeRecordCommand(record.id))}
                        aria-label={`${recordedAtText(record)}の記録を削除`}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div className="standalone-page record-page">
      <ContextBar disabled={!assetsReady} history={history}>
        <TextChip
          holder="standalone"
          textLibrary={assets.textLibrary}
          selection={assets.standaloneTextSelection}
          dispatch={dispatch}
          generateTextId={generateTextId}
          onTextContentCommit={onTextContentCommit}
        />
        <ReadingChip
          evaluation={evaluation}
          source={reading}
          targets={[target]}
          setups={setups}
          catalog={catalog}
          overrides={overrides}
          onCorrect={(ref, surface, value) => dispatch(setReadingCorrectionCommand(ref, surface, value))}
          onCorrectWord={(ref, remove, add) => dispatch(setWordReadingCorrectionCommand(ref, remove, add))}
        />
        <DefaultShapeChip
          overrides={overrides}
          dispatch={dispatch}
          shapes={catalog.setupCatalog.shapes}
          layoutIds={layoutIdsOfTargets([target])}
          layouts={catalog.setupCatalog.layouts}
        />
      </ContextBar>
      <fieldset disabled={!assetsReady} style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="standalone-stage">
          <PaneFrame
            assetsReady={assetsReady}
            name={RECORD_PAGE_NAME}
            description={RECORD_PAGE_DESCRIPTION}
            recommendedWidthRem={48}
            headingLevel={1}
            stickyHeader
            {...(named === undefined || !assetsReady ? {} : { targetName: named.displayName })}
            target={
              <TargetSelection
                mode="single"
                groups={choiceGroups}
                selected={[target]}
                summary={named === undefined || !assetsReady ? [] : [{ key: named.key, label: named.displayName, fullName: named.fullName }]}
                onChange={(next) => {
                  if (next[0] !== undefined) dispatch(setSingleTargetCommand(next[0]));
                }}
              />
            }
            header={resolution.ok ? conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry) : undefined}
            conditionRows={conditionRows}
            conditionEditor={conditionEditor}
            conditionProvenance={provenance}
            reading={evaluation.state}
            engineState={statuses === undefined ? { status: 'computing' } : { status: 'ready', value: undefined }}
          >
            {resolution.ok && boundsCount > 0 ? body : undefined}
          </PaneFrame>
        </div>
      </fieldset>
    </div>
  );
}
