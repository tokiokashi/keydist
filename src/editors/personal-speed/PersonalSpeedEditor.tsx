import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from '#input/layouts/types.ts';
import { FINGERS, type FingerAssignment, type PhysicalShape } from '#input/shapes/geometry.ts';
import { OVERHEAD_KINDS, type PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import {
  calibrationFormValues,
  calibrationOverheadFieldId,
  CALIBRATION_FALLBACK_FINGER_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
  CALIBRATION_SAME_KEY_FIELD,
  parseCalibrationForm,
  sameCalibrationFormValues,
  type CalibrationFormValues,
} from '#interpretation/timing/calibration-form.ts';
import {
  applyCalibrationRun,
  calibrationBasis,
  calibrationKeyLabel,
  planCalibration,
  type CalibrationPlan,
  type CalibrationRun,
  type CalibrationScope,
  type CalibrationTask,
} from '#interpretation/timing/calibration-session.ts';
import { applySentenceMeasurement, type SentenceBuildResult } from '#interpretation/timing/sentence-measurement.ts';
import {
  remainingSentenceKeys,
  remainingSentenceStrokes,
  sentencePlan,
  sentenceSamples,
  sentenceSteps,
  sentenceUnmeasurable,
  upcomingSentenceSteps,
  type SentencePlan,
  type SentenceRun,
  type SentenceSession,
} from '#interpretation/timing/sentence-session.ts';
import {
  calibrationFieldLabel,
  calibrationFieldUnit,
  calibrationFormProblemText,
  calibrationInstruction,
  calibrationProgressText,
  MEASUREMENT_DESCRIPTION,
  MEASUREMENT_OUT_OF_RANGE_TEXT,
  MEASUREMENT_SENTENCES,
  SENTENCE_LEARNING_ROUND_TEXT,
  sentenceProgressText,
  PERSONAL_SPEED_PURPOSE,
  savedMessage,
  SENTENCE_UNMEASURED_TEXT,
  sentenceFailureText,
  sentenceSavedMessage,
  sentenceUnmeasurableText,
  wrongKeyText,
} from './calibration-text.ts';
import { PERSONAL_SPEED_LABEL } from './label.ts';
import { useCalibrationRun } from './use-calibration-run.ts';
import { useSentenceRun } from './use-sentence-run.ts';
import './personal-speed.css';

/** 測るキーを決める配列・物理配列・指の割り当ての選択肢。 */
export interface PersonalSpeedCatalog {
  readonly layouts: readonly Pick<Layout, 'id' | 'name' | 'legends' | 'homeKeys'>[];
  readonly shapes: readonly PhysicalShape[];
  readonly fingerAssignments: readonly FingerAssignment[];
}

/** 測定に使う配列・物理配列・指の割り当ての選択。この画面の中だけの値で、保存しない。 */
export interface PersonalSpeedSelection {
  readonly layoutId: string;
  readonly shapeId: string;
  readonly fingerAssignmentId: string;
}

export interface PersonalSpeedEditorProps {
  readonly calibration: PlaybackCalibration | undefined;
  /** 保存の読み込みが済むまでは、保存した値が無いように見せない。 */
  readonly ready: boolean;
  readonly catalog: PersonalSpeedCatalog;
  /** 画面を開いた時の選択。 */
  readonly initialSelection: PersonalSpeedSelection;
  /** 物理配列を変えた時に選び直す、その物理配列の既定の指の割り当てのid。 */
  readonly defaultFingerAssignmentId: (shapeId: string) => string;
  /**
   * 示す文を、選んだ配列・物理配列・指の割り当てで打つ打鍵の列と構造にする。
   * 条件の解決とTrace生成は`editors`から読めないので、appが組み立てて渡す。
   */
  readonly buildSentence: (selection: PersonalSpeedSelection, text: string) => SentenceBuildResult;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: (calibration: PlaybackCalibration) => void;
  readonly onDiscard: () => void;
}

/** 文章を打つ測定の準備。打てる時は文ごとの測定の計画を持ち、打てない時は理由の文を持つ。 */
type SentenceSetup =
  | { readonly ok: true; readonly plans: readonly SentencePlan[] }
  | { readonly ok: false; readonly message: string };

/** 示す文の全部が打てる時だけ、測れる。1本でも作れない・測れない文があれば、その理由を返す。 */
function sentenceSetupOf(builds: readonly SentenceBuildResult[]): SentenceSetup {
  const plans: SentencePlan[] = [];
  for (const build of builds) {
    if (!build.ok) return build;
    const unmeasurable = sentenceUnmeasurable(sentenceSteps(build.analysis));
    if (unmeasurable !== undefined) return { ok: false, message: sentenceUnmeasurableText(unmeasurable) };
    plans.push(sentencePlan(build.analysis, build.spelling));
  }
  return { ok: true, plans };
}

/** 示す文と、打つ位置の表示。打ち終えた入力単位・今の入力単位・まだの入力単位に分けて見せる。 */
function SentenceText({ plan, run }: { readonly plan: SentencePlan; readonly run: SentenceRun | undefined }) {
  return (
    <p className="personal-speed-sentence" data-personal-speed-sentence>
      {plan.units.map((unit, index) => {
        const state = run === undefined ? 'rest' : run.unit > index ? 'done' : run.unit === index ? 'current' : 'rest';
        return <span key={index} data-sentence-unit={state}>{unit.text}</span>;
      })}
    </p>
  );
}

/** 文章を打つ測定を始めた時点の入力。 */
interface SentenceStart {
  readonly setup: Extract<SentenceSetup, { readonly ok: true }>;
  readonly calibration: PlaybackCalibration;
}

const NO_BASIS_TEXT = 'この配列・物理配列・指の割り当ての組では、測定用のキーを作れません。別の組を選んでください。';

function firstOf<T extends { readonly id: string }>(items: readonly T[], id: string): T | undefined {
  return items.find((item) => item.id === id) ?? items[0];
}

interface ValueRowProps {
  readonly fieldId: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly tasks: readonly CalibrationTask[];
  readonly measureDisabled: boolean;
  readonly onChange: (fieldId: string, value: string) => void;
  readonly onMeasure: (tasks: readonly CalibrationTask[]) => void;
}

/** 保存値の1項目。数値を直接編集でき、測れる項目は測定のボタンを持つ。 */
function ValueRow({ fieldId, value, disabled, tasks, measureDisabled, onChange, onMeasure }: ValueRowProps) {
  const label = calibrationFieldLabel(fieldId);
  const inputId = `personal-speed-${fieldId}`;
  return (
    <div className="personal-speed-row" data-personal-speed-row={fieldId}>
      <label htmlFor={inputId} className="personal-speed-row-label">{label}</label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(fieldId, event.currentTarget.value)}
      />
      <span className="personal-speed-unit">{calibrationFieldUnit(fieldId)}</span>
      {tasks.length === 0 ? <span /> : (
        <button
          type="button"
          disabled={measureDisabled}
          aria-label={`${label}を${value.trim() === '' ? '測る' : '測り直す'}`}
          onClick={() => onMeasure(tasks)}
        >
          {value.trim() === '' ? '測る' : '測り直す'}
        </button>
      )}
    </div>
  );
}

/** 全破棄の確認。キャンセルにフォーカスを置き、Escでもキャンセルになる。 */
function ConfirmDiscard({ onConfirm, onCancel }: { readonly onConfirm: () => void; readonly onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="personal-speed-confirm" aria-labelledby="personal-speed-confirm-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id="personal-speed-confirm-title">保存した個人速度を全て破棄しますか</h2>
      <p>通常の速度、同じキーを続けて打つ速さ、方向別の速度、指の移動速度、文章を打つ時の連打との差を全て消します。「元に戻す」はこの画面にいる間だけ使えます。</p>
      <div className="personal-speed-confirm-actions">
        <button type="button" autoFocus onClick={onCancel}>キャンセル</button>
        <button type="button" onClick={onConfirm}>破棄する</button>
      </div>
    </dialog>
  );
}

/**
 * 個人速度を測り、保存した値を確認・編集・全破棄する画面。個人速度は配列にも物理配列にも紐づかない
 * 1つの値で、測る時にだけ、打つキーを決める配列・物理配列・指の割り当てをこの画面の中で選ぶ。
 * 測定中だけキー入力を取る（`use-calibration-run.ts`）。
 */
export function PersonalSpeedEditor({
  calibration,
  ready,
  catalog,
  initialSelection,
  defaultFingerAssignmentId,
  canUndo,
  canRedo,
  buildSentence,
  onUndo,
  onRedo,
  onSave,
  onDiscard,
}: PersonalSpeedEditorProps) {
  const [selection, setSelection] = useState(initialSelection);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const savedValues = useMemo(() => (calibration === undefined ? {} : calibrationFormValues(calibration)), [calibration]);
  const [values, setValues] = useState<CalibrationFormValues>(savedValues);
  const [valuesSource, setValuesSource] = useState(calibration);
  // 保存値が変わったら（測定・元に戻す・他のタブの書き込み）、編集中の欄を保存値に合わせ直す。
  if (valuesSource !== calibration) {
    setValuesSource(calibration);
    setValues(savedValues);
  }
  const dirty = !sameCalibrationFormValues(values, savedValues);

  const layout = firstOf(catalog.layouts, selection.layoutId);
  const shape = firstOf(catalog.shapes, selection.shapeId);
  const assignment = firstOf(catalog.fingerAssignments, selection.fingerAssignmentId);
  const basis = useMemo(
    () => (layout === undefined || shape === undefined || assignment === undefined
      ? undefined
      : calibrationBasis(layout, shape, assignment)),
    [layout, shape, assignment],
  );
  const plan: CalibrationPlan | undefined = useMemo(
    () => (basis?.ok ? planCalibration(basis.basis) : undefined),
    [basis],
  );
  const keyLabel = useMemo(() => {
    const legends = basis?.ok ? basis.basis.legends : new Map<string, string>();
    return (keyId: string) => calibrationKeyLabel(legends, keyId);
  }, [basis]);

  const opener = useRef<HTMLElement | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const sentenceRegionRef = useRef<HTMLDivElement>(null);

  const finished = (run: CalibrationRun) => {
    const result = applyCalibrationRun(calibration, run, Date.now());
    if (!result.ok) {
      setError(MEASUREMENT_OUT_OF_RANGE_TEXT);
      return;
    }
    onSave(result.calibration);
    setMessage(savedMessage(run.scope, run.tasks[0]?.item, result.clearedOverheads));
  };
  const runner = useCalibrationRun({ keyLabel, onFinished: finished });

  const sentence: SentenceSetup | undefined = useMemo(
    () => (!ready || layout === undefined || shape === undefined || assignment === undefined
      ? undefined
      : sentenceSetupOf(MEASUREMENT_SENTENCES.map((text) => buildSentence(
        { layoutId: layout.id, shapeId: shape.id, fingerAssignmentId: assignment.id },
        text,
      )))),
    [ready, buildSentence, layout, shape, assignment],
  );
  // 測定を始めた時の示す文・打鍵の列と構造・保存値。別のタブで条件や保存値が変わっても、終わりまでこれを使う。
  const [sentenceStart, setSentenceStart] = useState<SentenceStart | undefined>(undefined);
  const sentenceStartRef = useRef<SentenceStart | undefined>(undefined);
  const sentenceFinished = (session: SentenceSession) => {
    const started = sentenceStartRef.current;
    sentenceStartRef.current = undefined;
    setSentenceStart(undefined);
    if (started === undefined) return;
    // 数えるのは2回目以降だけ。値は、示した綴りではなく、回ごとに打った綴りで作った打鍵の列と構造から求める。
    const samples = sentenceSamples(started.setup.plans, session.records);
    if (samples === undefined) {
      setError(SENTENCE_UNMEASURED_TEXT);
      return;
    }
    const result = applySentenceMeasurement(started.calibration, samples, Date.now(), calibration);
    if (!result.ok) {
      setError(sentenceFailureText(result));
      return;
    }
    onSave(result.calibration);
    setMessage(sentenceSavedMessage(result.measurement));
  };
  const sentenceRunner = useSentenceRun({ keyLabel, onFinished: sentenceFinished });
  const running = runner.run !== undefined || sentenceRunner.session !== undefined;

  // 測定中は案内にフォーカスを置き（押した測定のボタンは無効になるため）、終わったら押したボタンへ戻す。
  useEffect(() => {
    if (running) {
      (sentenceRunner.session === undefined ? regionRef : sentenceRegionRef).current?.focus();
      return undefined;
    }
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
    return undefined;
  }, [running]);

  const startRun = (scope: CalibrationScope, tasks: readonly CalibrationTask[]) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMessage('');
    setError('');
    runner.start(scope, tasks);
  };

  const currentTask = runner.run === undefined ? undefined : runner.run.tasks[runner.run.index];

  const startSentence = () => {
    if (sentence?.ok !== true || calibration === undefined) return;
    const started: SentenceStart = { setup: sentence, calibration };
    sentenceStartRef.current = started;
    setSentenceStart(started);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMessage('');
    setError('');
    sentenceRunner.start(sentence.plans);
  };
  const cancelSentence = () => {
    sentenceStartRef.current = undefined;
    setSentenceStart(undefined);
    sentenceRunner.cancel();
  };
  const sentenceSession = sentenceRunner.session;
  const sentenceRun = sentenceSession?.run;
  const runningSentence = sentenceStart?.setup;
  const nextSentenceKeys = sentenceRun === undefined ? [] : remainingSentenceKeys(sentenceRun);
  const upcomingSentenceKeys = sentenceRun === undefined
    ? []
    : upcomingSentenceSteps(sentenceRun, 8).map((step) => step.keys.map(keyLabel).join('+'));

  const saveValues = () => {
    const parsed = parseCalibrationForm(values, Date.now());
    if (!parsed.ok) {
      setMessage('');
      setError(calibrationFormProblemText(parsed));
      return;
    }
    setError('');
    onSave(parsed.calibration);
    setMessage('保存しました。');
  };

  const idsWithPrefix = (prefix: string, planned: readonly string[]): string[] => {
    const extra = Object.keys(values).filter((id) => id.startsWith(prefix) && !planned.includes(id)).sort();
    return [...planned, ...extra];
  };
  const plannedIds = (prefix: string): string[] => [...(plan?.byItem.keys() ?? [])].filter((id) => id.startsWith(prefix));
  const directionIds = ['direction:L→R', 'direction:R→L'];
  const fingerIds = idsWithPrefix('finger:', FINGERS.map((finger) => `finger:${finger}`));
  const pairIds = idsWithPrefix('same-hand-pair:', plannedIds('same-hand-pair:'));
  const directedIds = idsWithPrefix('directed-pair:', plannedIds('directed-pair:'));

  const rowProps = (fieldId: string): ValueRowProps => ({
    fieldId,
    value: values[fieldId] ?? '',
    disabled: running,
    tasks: plan?.byField.get(fieldId) ?? [],
    measureDisabled: running || dirty || calibration === undefined,
    onChange: (id, value) => { setValues((current) => ({ ...current, [id]: value })); },
    onMeasure: (tasks) => startRun('item', tasks),
  });

  const normalDisabled = running || plan?.normal === undefined || dirty;
  const directionalDisabled = running || plan?.directional === undefined || calibration === undefined || dirty;
  const sentenceDisabled = running || sentence?.ok !== true || calibration === undefined || dirty;

  return (
    <article className="personal-speed">
      <h1>{PERSONAL_SPEED_LABEL}</h1>
      <p className="personal-speed-lead">打鍵と指の移動の速さを測って保存します。</p>
      <p className="personal-speed-note" data-personal-speed-purpose>{PERSONAL_SPEED_PURPOSE}</p>
      <div className="personal-speed-toolbar">
        <button type="button" disabled={!canUndo || running} onClick={() => { setMessage(''); setError(''); onUndo(); }}>元に戻す</button>
        <button type="button" disabled={!canRedo || running} onClick={() => { setMessage(''); setError(''); onRedo(); }}>やり直す</button>
      </div>
      {ready ? (
        <>
          <section className="personal-speed-section" aria-labelledby="personal-speed-basis">
            <h2 id="personal-speed-basis">測るキー</h2>
            <p className="personal-speed-note">選んだ配列の刻印のキーを、物理配列と指の割り当てに沿って打ちます。ここでの選択は、他の画面の対象や条件を変えません。</p>
            <div className="personal-speed-select-grid">
              <label>
                配列
                <select
                  value={layout?.id ?? ''}
                  disabled={running}
                  onChange={(event) => setSelection({ ...selection, layoutId: event.currentTarget.value })}
                >
                  {catalog.layouts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                物理配列
                <select
                  value={shape?.id ?? ''}
                  disabled={running}
                  onChange={(event) => {
                    const shapeId = event.currentTarget.value;
                    const preferred = defaultFingerAssignmentId(shapeId);
                    const fingerAssignmentId = catalog.fingerAssignments.some((item) => item.id === preferred)
                      ? preferred
                      : selection.fingerAssignmentId;
                    setSelection({ ...selection, shapeId, fingerAssignmentId });
                  }}
                >
                  {catalog.shapes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                指の割り当て
                <select
                  value={assignment?.id ?? ''}
                  disabled={running}
                  onChange={(event) => setSelection({ ...selection, fingerAssignmentId: event.currentTarget.value })}
                >
                  {catalog.fingerAssignments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
            {basis !== undefined && !basis.ok ? <p className="personal-speed-warning" role="alert">{basis.message}</p> : null}
            {plan !== undefined && plan.normal === undefined ? <p className="personal-speed-warning" role="alert">{NO_BASIS_TEXT}</p> : null}
          </section>

          <section className="personal-speed-section" aria-labelledby="personal-speed-measure">
            <h2 id="personal-speed-measure">測定</h2>
            <div className="personal-speed-measurement">
              <h3>通常の速度と指の移動</h3>
              <p className="personal-speed-note">{MEASUREMENT_DESCRIPTION.normal}</p>
              <div className="personal-speed-actions">
                <button type="button" data-personal-speed-start="normal" disabled={normalDisabled} onClick={() => startRun('normal', plan?.normal ?? [])}>
                  通常の速度と指の移動を測る
                </button>
              </div>
            </div>
            <div className="personal-speed-measurement">
              <h3>方向別の速度</h3>
              <p className="personal-speed-note">{MEASUREMENT_DESCRIPTION.directional}</p>
              <div className="personal-speed-actions">
                <button type="button" data-personal-speed-start="directional" disabled={directionalDisabled} onClick={() => startRun('directional', plan?.directional ?? [])}>
                  方向別の速度を測る
                </button>
              </div>
            </div>
            <div className="personal-speed-measurement">
              <h3>文章を打つ速さ</h3>
              <p className="personal-speed-note">{MEASUREMENT_DESCRIPTION.sentence}</p>
              {sentence?.ok === true ? sentence.plans.map((plan, index) => <SentenceText key={index} plan={plan} run={undefined} />) : null}
              {sentence?.ok === false ? <p className="personal-speed-warning" role="alert" data-personal-speed-sentence-unavailable>{sentence.message}</p> : null}
              <div className="personal-speed-actions">
                <button type="button" data-personal-speed-start="sentence" disabled={sentenceDisabled} onClick={startSentence}>
                  文章を打つ速さを測る
                </button>
              </div>
              <div
                className="personal-speed-run"
                ref={sentenceRegionRef}
                tabIndex={-1}
                hidden={sentenceSession === undefined}
                data-personal-speed-sentence-run={sentenceSession === undefined ? undefined : 'active'}
              >
                {sentenceSession === undefined || sentenceRun === undefined || runningSentence === undefined ? null : (
                  <>
                    <p className="personal-speed-progress" data-personal-speed-sentence-position>
                      {sentenceProgressText(sentenceSession.sentence, sentenceSession.plans.length, sentenceSession.round, sentenceSession.rounds)}
                    </p>
                    {sentenceSession.round === 0 ? <p className="personal-speed-note" data-personal-speed-sentence-learning>{SENTENCE_LEARNING_ROUND_TEXT}</p> : null}
                    <SentenceText plan={sentenceSession.plans[sentenceSession.sentence]} run={sentenceRun} />
                    <p className="personal-speed-instruction">
                      次に打つキー:{' '}
                      <span data-personal-speed-next>
                        {nextSentenceKeys.map((key) => <kbd key={key}>{keyLabel(key)}</kbd>)}
                      </span>
                    </p>
                    <p className="personal-speed-progress" data-personal-speed-upcoming>
                      この後: {upcomingSentenceKeys.join(' ')}
                    </p>
                    <p className="personal-speed-progress" data-personal-speed-sentence-progress>
                      あと{remainingSentenceStrokes(sentenceRun)}打
                    </p>
                    <p className="personal-speed-warning" role="status">{sentenceRunner.wrongKey === undefined ? '' : wrongKeyText(sentenceRunner.wrongKey)}</p>
                    <button type="button" data-personal-speed-sentence-cancel onClick={cancelSentence}>中止</button>
                  </>
                )}
              </div>
            </div>
            <div className="personal-speed-actions">
              <button type="button" data-personal-speed-discard disabled={calibration === undefined || running} onClick={() => setConfirming(true)}>
                全て破棄
              </button>
            </div>
            {calibration === undefined ? (
              <p className="personal-speed-note">方向別の速度、文章を打つ速さ、項目ごとの測り直しは、通常の測定を保存した後に行えます。</p>
            ) : null}
            {dirty ? <p className="personal-speed-note">保存していない変更があります。保存するか元に戻してから測ってください。</p> : null}
            <div className="personal-speed-run" ref={regionRef} tabIndex={-1} hidden={runner.run === undefined} data-personal-speed-run={runner.run === undefined ? undefined : 'active'}>
              {runner.run === undefined || currentTask === undefined ? null : (
                <>
                  <p className="personal-speed-instruction" data-personal-speed-instruction>{calibrationInstruction(currentTask, keyLabel)}</p>
                  <p className="personal-speed-progress" data-personal-speed-progress>{calibrationProgressText(runner.run)}</p>
                  <p className="personal-speed-warning" role="status">{runner.wrongKey === undefined ? '' : wrongKeyText(runner.wrongKey)}</p>
                  <button type="button" data-personal-speed-cancel onClick={runner.cancel}>中止</button>
                </>
              )}
            </div>
            <p className="personal-speed-message" role="status">{message}</p>
            <p className="personal-speed-error" role="alert">{error}</p>
          </section>

          <section className="personal-speed-section" aria-labelledby="personal-speed-values">
            <h2 id="personal-speed-values">保存した値</h2>
            {calibration === undefined ? (
              <p className="personal-speed-note" data-personal-speed-empty>個人速度は保存されていません。</p>
            ) : (
              <>
                <p className="personal-speed-note">数値は直接書き換えられます。任意の項目は空にすると消えます。</p>
                <div className="personal-speed-rows">
                  <ValueRow {...rowProps('actions')} />
                  <ValueRow {...rowProps(CALIBRATION_SAME_KEY_FIELD)} />
                  <ValueRow {...rowProps(CALIBRATION_SAME_HAND_FIELD)} />
                  <ValueRow {...rowProps(CALIBRATION_FALLBACK_FINGER_FIELD)} />
                </div>
                <h3>異手の方向別</h3>
                <div className="personal-speed-rows">
                  {directionIds.map((id) => <ValueRow key={id} {...rowProps(id)} />)}
                </div>
                <h3>文章を打つ時の連打との差</h3>
                <div className="personal-speed-rows">
                  {OVERHEAD_KINDS.map((kind) => <ValueRow key={kind} {...rowProps(calibrationOverheadFieldId(kind))} />)}
                </div>
                <h3>指ごとの移動速度</h3>
                <div className="personal-speed-rows">
                  {fingerIds.map((id) => <ValueRow key={id} {...rowProps(id)} />)}
                </div>
                <details className="personal-speed-details">
                  <summary>同手・別指の組ごとの速度（{pairIds.length}）</summary>
                  <div className="personal-speed-rows">
                    {pairIds.map((id) => <ValueRow key={id} {...rowProps(id)} />)}
                  </div>
                </details>
                <details className="personal-speed-details">
                  <summary>同手・別指の方向別の速度（{directedIds.length}）</summary>
                  <div className="personal-speed-rows">
                    {directedIds.map((id) => <ValueRow key={id} {...rowProps(id)} />)}
                  </div>
                </details>
                <div className="personal-speed-actions">
                  <button type="button" data-personal-speed-save disabled={!dirty || running} onClick={saveValues}>変更を保存</button>
                  <button type="button" disabled={!dirty || running} onClick={() => { setValues(savedValues); setError(''); }}>変更を戻す</button>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
      {confirming ? (
        <ConfirmDiscard
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            setError('');
            onDiscard();
            setMessage('個人速度を破棄しました。');
          }}
        />
      ) : null}
    </article>
  );
}
