import { focusOnMount } from '#ui/primitives/focus-on-mount.ts';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';
import { Fragment, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Layout } from '#input/layouts/types.ts';
import { FINGERS, type FingerAssignment, type PhysicalShape } from '#input/shapes/geometry.ts';
import { OVERHEAD_KINDS, SIMULTANEOUS_KINDS, type PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import {
  applyCalibrationField,
  calibrationFormValues,
  calibrationSimultaneousFieldId,
  CALIBRATION_FALLBACK_MOVE_FIELD,
  CALIBRATION_FALLBACK_REPEAT_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
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
import {
  applySentenceMeasurement,
  sentenceResultTable,
  type ApplySentenceResult,
  type SentenceBuildResult,
  type SentenceResultTable as SentenceResultTableData,
  type SentenceSample,
} from '#interpretation/timing/sentence-measurement.ts';
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
  calibrationFieldRowLabel,
  calibrationFieldUnit,
  clearedOverheadsText,
  NEED_NORMAL_FIRST_TEXT,
  NO_DIRECTIONAL_TEXT,
  NO_SIMULTANEOUS_TEXT,
  NORMAL_DERIVED_HINT,
  UNMEASURABLE_ROW_HINT,
  UNMEASURED_TEXT,
  calibrationFormProblemText,
  calibrationInstruction,
  zeroMoveFingersText,
  zeroMoveRowNote,
  calibrationProgressText,
  clearedSimultaneousText,
  simultaneousWrongKeyText,
  MEASUREMENT_DESCRIPTION,
  MEASUREMENT_HOW_TO,
  MEASUREMENT_OUT_OF_RANGE_TEXT,
  measurementEffectText,
  MEASUREMENT_SENTENCE_BREAKS,
  MEASUREMENT_SENTENCES,
  SENTENCE_DECLINED_TEXT,
  SENTENCE_DISCARD_BUTTON,
  SENTENCE_LEARNING_ROUND_TEXT,
  SENTENCE_SAVE_BUTTON,
  sentenceCannotSaveText,
  sentencePendingText,
  type SentenceTablePhase,
  sentenceProgressText,
  PERSONAL_SPEED_PURPOSE,
  savedMessage,
  sentenceFailureText,
  sentenceSavedMessage,
  sentenceUnmeasurableText,
  wrongKeyText,
} from './calibration-text.ts';
import { PERSONAL_SPEED_LABEL } from './label.ts';
import { SentenceResultTable } from './SentenceResultTable.tsx';
import { useCalibrationRun } from './use-calibration-run.ts';
import { useSentenceRun } from './use-sentence-run.ts';
import { DirectedPairGrids, hasFingerGridFields, OverheadGrid, SameHandPairGrids, type GridContext, type RowAction } from './ValueGrids.tsx';
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
  /** 計算の詳細を読める再生時間モデルの仕様書のURL。 */
  readonly specHref?: string | undefined;
}

/** 文章を打つ測定の準備。打てる時は文ごとの測定の計画を持ち、打てない時は理由の文を持つ。 */
type SentenceSetup = { readonly ok: true; readonly plans: readonly SentencePlan[] } | { readonly ok: false; readonly message: string };

/** 示す文の全部が打てる時だけ、測れる。1本でも作れない・測れない文があれば、その理由を返す。 */
function sentenceSetupOf(builds: readonly SentenceBuildResult[], phraseBreaks: readonly (readonly number[])[]): SentenceSetup {
  const plans: SentencePlan[] = [];
  for (const [index, build] of builds.entries()) {
    if (!build.ok) return build;
    const unmeasurable = sentenceUnmeasurable(sentenceSteps(build.analysis));
    if (unmeasurable !== undefined) return { ok: false, message: sentenceUnmeasurableText(unmeasurable) };
    plans.push({ ...sentencePlan(build.analysis, build.spelling), phraseBreaks: phraseBreaks[index] ?? [] });
  }
  return { ok: true, plans };
}

/** 示す文と、打つ位置の表示。打ち終えた入力単位・今の入力単位・まだの入力単位に分けて見せる。 */
function SentenceText({ plan, run }: { readonly plan: SentencePlan; readonly run: SentenceRun | undefined }) {
  return (
    <p className="personal-speed-sentence" data-personal-speed-sentence>
      {plan.units.map((unit, index) => {
        const state = run === undefined ? 'rest' : run.unit > index ? 'done' : run.unit === index ? 'current' : 'rest';
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 文の入力単位の位置が識別で、並びは変わらない。同じ文字が並びうる
          <span key={index} data-sentence-unit={state}>
            {unit.text}
          </span>
        );
      })}
    </p>
  );
}

/** 文章を打つ測定を始めた時点の入力。 */
interface SentenceStart {
  readonly setup: Extract<SentenceSetup, { readonly ok: true }>;
  readonly calibration: PlaybackCalibration;
}

/**
 * 打ち終えて、保存するかを選ぶ前の測定。保存値は変えていない。
 * `samples`が無い時は、打った内容から打鍵の列を作れなかった。
 */
interface SentencePending {
  /** 測定を始めた時の保存値。 */
  readonly base: PlaybackCalibration;
  readonly samples: readonly SentenceSample[] | undefined;
  readonly result: ApplySentenceResult | undefined;
  readonly table: SentenceResultTableData | undefined;
}

const NO_BASIS_TEXT = 'この配列・物理配列・指の割り当ての組では、測定用のキーを作れません。別の組を選んでください。';

function firstOf<T extends { readonly id: string }>(items: readonly T[], id: string): T | undefined {
  return items.find((item) => item.id === id) ?? items[0];
}

interface ValueRowProps {
  readonly fieldId: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly disabled: boolean;
  readonly action: RowAction;
  readonly onChange: (fieldId: string, value: string) => void;
  readonly onCommit: (fieldId: string) => void;
  readonly onMeasure: (tasks: readonly CalibrationTask[]) => void;
  /** 行の下に出す注記。 */
  readonly note?: string | undefined;
}

/**
 * 保存値の1項目。数値を直接編集でき、欄を確定した時（欄から離れた時・Enter）に保存する。
 * 行の測るボタンは、その行の値だけを測り直す。
 */
function ValueRow({ fieldId, value, error, disabled, action, onChange, onCommit, onMeasure, note }: ValueRowProps) {
  const fullLabel = calibrationFieldLabel(fieldId);
  const inputId = `personal-speed-${fieldId}`;
  const errorId = `${inputId}-error`;
  const measured = value.trim() !== '';
  return (
    <div className="personal-speed-row" data-personal-speed-row={fieldId}>
      <label htmlFor={inputId} className="personal-speed-row-label">
        {calibrationFieldRowLabel(fieldId)}
      </label>
      <input
        id={inputId}
        type="text"
        inputMode={fieldId.startsWith('overhead:') ? 'text' : 'decimal'}
        autoComplete="off"
        aria-label={fullLabel}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(fieldId, event.currentTarget.value)}
        onBlur={() => onCommit(fieldId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) onCommit(fieldId);
        }}
      />
      <span className="personal-speed-unit">{calibrationFieldUnit(fieldId)}</span>
      {action.kind === 'measure' ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={`${fullLabel}だけを${measured ? '測り直す' : '測る'}`}
          onClick={() => onMeasure(action.tasks)}
        >
          {measured ? 'この値だけ測り直す' : 'この値だけ測る'}
        </button>
      ) : null}
      {action.kind === 'hint' ? <span className="personal-speed-row-hint">{action.text}</span> : null}
      {error === undefined ? null : (
        <p className="personal-speed-field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
      {note === undefined ? null : (
        <p className="personal-speed-note" data-personal-speed-row-note={fieldId}>
          {note}
        </p>
      )}
    </div>
  );
}

interface ValueBlockProps {
  readonly title?: string;
  /** 測り終えた項目の欄。 */
  readonly measuredIds: readonly string[];
  /** 測っていない項目の欄。直接入力で値を足せる。 */
  readonly missingIds: readonly string[];
  readonly note?: string;
  readonly emptyText?: string;
  /** 保存できない値が残っている欄を持つ時は、測っていない項目を開いたままにする。 */
  readonly hasProblem: boolean;
  readonly renderRow: (fieldId: string) => ReactNode;
}

/** 保存値の項目のまとまり。測っていない項目は空欄の行で並べず、畳んだ一覧にまとめる。 */
function ValueBlock({ title, measuredIds, missingIds, note, emptyText, hasProblem, renderRow }: ValueBlockProps) {
  return (
    <div className="personal-speed-value-block">
      {title === undefined ? null : <h3>{title}</h3>}
      {note === undefined ? null : <p className="personal-speed-note">{note}</p>}
      {measuredIds.length > 0 ? (
        <div className="personal-speed-rows">
          {measuredIds.map((id) => (
            <Fragment key={id}>{renderRow(id)}</Fragment>
          ))}
        </div>
      ) : emptyText === undefined ? null : (
        <p className="personal-speed-note">{emptyText}</p>
      )}
      {missingIds.length === 0 ? null : (
        <details className="personal-speed-details" open={hasProblem ? true : undefined}>
          <summary>測っていない項目（{missingIds.length}）</summary>
          <div className="personal-speed-rows">
            {missingIds.map((id) => (
              <Fragment key={id}>{renderRow(id)}</Fragment>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** 測定の欄に出す知らせ。測定の結果と、その操作で消えた値の知らせ。 */
interface Notice {
  readonly kind: 'message' | 'error';
  readonly text: string;
  /** 文章を打つ測定を終えた時の表。知らせと一緒に出し、一緒に消える。 */
  readonly table?: SentenceResultTableData | undefined;
  /** 表の「保存したか」の文言の段階。表と一緒に渡す。 */
  readonly phase?: SentenceTablePhase;
}

function NoticeLines({ notice }: { readonly notice: Notice | undefined }) {
  return (
    <>
      <p className="personal-speed-message" role="status">
        {notice?.kind === 'message' ? notice.text : ''}
      </p>
      <p className="personal-speed-error" role="alert">
        {notice?.kind === 'error' ? notice.text : ''}
      </p>
      {notice?.table === undefined ? null : <SentenceResultTable table={notice.table} phase={notice.phase ?? 'after-save'} />}
    </>
  );
}

type GroupId = 'normal' | 'directional' | 'simultaneous' | 'sentence' | 'all';

interface MeasurementGroupProps {
  readonly id: Exclude<GroupId, 'all'>;
  readonly title: string;
  readonly description: string;
  readonly howTo: readonly string[];
  readonly specHref: string | undefined;
  /** このまとまりの中に値として出る項目が、保存値を持つか。説明と測り方を、最初に閉じるか開くかだけを決める。 */
  readonly hasSavedValues: boolean;
  readonly children: ReactNode;
}

/**
 * 1つの測定のまとまり。説明（何を測るか・どこに使うか）と測り方は折りたたみに入れ、
 * 仕様書へのリンク・測るボタン・測るボタンの直後の保存値への影響・測定中の案内・結果・その測定が求める保存値は外に置く。
 * 折りたたみは、まとまりを出した時の保存値の有無で開閉を決める（保存値を持てば閉じ、持たなければ開く）。
 * 以降は利用者の開閉を保ち、測って保存しても自動では開閉しない。
 */
function MeasurementGroup({ id, title, description, howTo, specHref, hasSavedValues, children }: MeasurementGroupProps) {
  const headingId = `personal-speed-group-${id}-title`;
  const [explanationOpen, setExplanationOpen] = useState(!hasSavedValues);
  return (
    <section className="personal-speed-group" id={`personal-speed-group-${id}`} aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <details
        className="personal-speed-details personal-speed-explanation"
        data-personal-speed-explanation={id}
        open={explanationOpen}
        onToggle={(event) => setExplanationOpen(event.currentTarget.open)}
      >
        <summary>説明と測り方</summary>
        <p className="personal-speed-note" data-personal-speed-description={id}>
          {description}
        </p>
        {howTo.length === 0 ? null : (
          <div className="personal-speed-howto" data-personal-speed-howto={id}>
            <h3>測り方</h3>
            <ul>
              {howTo.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </details>
      {specHref === undefined ? null : (
        <p className="personal-speed-note" data-personal-speed-spec={id}>
          計算の詳細は
          <a href={specHref} target="_blank" rel="noreferrer">
            再生時間モデルの仕様書
          </a>
          にあります。
        </p>
      )}
      {children}
    </section>
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
    <dialog
      ref={ref}
      className="personal-speed-confirm"
      aria-labelledby="personal-speed-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="personal-speed-confirm-title">保存した個人速度を全て破棄しますか</h2>
      <p>
        通常の速度、指ごとの同じキーを続けて打つ速さと移動の時間、方向別の速度、同時押しの上乗せ、文章を打つ時の打鍵の上乗せを全て消します。「元に戻す」で戻せます。再読み込みやタブを閉じた後は戻せません。
      </p>
      <div className="personal-speed-confirm-actions">
        <button type="button" ref={focusOnMount} onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" onClick={onConfirm}>
          破棄する
        </button>
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
  specHref,
}: PersonalSpeedEditorProps) {
  const [selection, setSelection] = useState(initialSelection);
  // 結果の知らせは、知らせを出した操作の近くに出す。欄ごとに1つ持ち、次の測定を始めると全て消える。
  const [notices, setNotices] = useState<Partial<Record<GroupId, Notice>>>({});
  const [confirming, setConfirming] = useState(false);
  const savedValues = useMemo(() => (calibration === undefined ? {} : calibrationFormValues(calibration)), [calibration]);
  const [values, setValues] = useState<CalibrationFormValues>(savedValues);
  // 保存できなかった欄と理由。直した（またはその欄が保存値に置き換わった）時に消える。
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [valuesSource, setValuesSource] = useState(calibration);
  // 保存値が変わったら（測定・元に戻す・他のタブの書き込み・別の欄の保存）、欄を保存値に合わせ直す。
  // 保存できなかった欄だけは、入力した値を残す。
  if (valuesSource !== calibration) {
    setValuesSource(calibration);
    const kept = Object.fromEntries(Object.keys(fieldErrors).map((id) => [id, values[id] ?? '']));
    setValues({ ...savedValues, ...kept });
  }

  const layout = firstOf(catalog.layouts, selection.layoutId);
  const shape = firstOf(catalog.shapes, selection.shapeId);
  const assignment = firstOf(catalog.fingerAssignments, selection.fingerAssignmentId);
  const basis = useMemo(
    () => (layout === undefined || shape === undefined || assignment === undefined ? undefined : calibrationBasis(layout, shape, assignment)),
    [layout, shape, assignment],
  );
  const plan: CalibrationPlan | undefined = useMemo(() => (basis?.ok ? planCalibration(basis.basis) : undefined), [basis]);
  const keyLabel = useMemo(() => {
    const legends = basis?.ok ? basis.basis.legends : new Map<string, string>();
    return (keyId: string) => calibrationKeyLabel(legends, keyId);
  }, [basis]);

  const opener = useRef<HTMLElement | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const sentenceRegionRef = useRef<HTMLDivElement>(null);

  /** 保存値を置き換える操作の前に呼ぶ。保存できなかった入力と理由は、置き換わる前の保存値に対するものなので捨てる。 */
  const dropProblems = () => {
    setFieldErrors({});
  };

  /** 測定の範囲が属する欄。1項目の測り直しは、その項目を含む測定（`plan.normal`・`plan.directional`・`plan.simultaneous`）の欄。 */
  const groupOfRun = (run: CalibrationRun): 'normal' | 'directional' | 'simultaneous' => {
    if (run.scope !== 'item') return run.scope;
    const task = run.tasks[0];
    if (task !== undefined && plan?.simultaneous?.includes(task) === true) return 'simultaneous';
    return task !== undefined && plan?.directional?.includes(task) === true ? 'directional' : 'normal';
  };

  const finished = (run: CalibrationRun) => {
    const group = groupOfRun(run);
    const result = applyCalibrationRun(calibration, run, Date.now());
    if (!result.ok) {
      setNotices({ [group]: { kind: 'error', text: MEASUREMENT_OUT_OF_RANGE_TEXT } });
      return;
    }
    dropProblems();
    onSave(result.calibration);
    setNotices({
      [group]: {
        kind: 'message',
        text: `${savedMessage(run.scope, run.tasks[0]?.item, result.clearedOverheads, result.replacedOverheads, result.clearedSimultaneous)}${zeroMoveFingersText(result.zeroMoveFingers) ?? ''}`,
      },
      ...(result.clearedOverheads.length === 0 && result.replacedOverheads.length === 0
        ? {}
        : { sentence: { kind: 'message', text: clearedOverheadsText(result.clearedOverheads, result.replacedOverheads) } }),
      // 同時押しを測った欄では、保存した知らせの中で消した旨を伝えるので、別の知らせは出さない。
      ...(result.clearedSimultaneous.length === 0 || group === 'simultaneous'
        ? {}
        : { simultaneous: { kind: 'message', text: clearedSimultaneousText(result.clearedSimultaneous) } }),
    });
  };
  const runner = useCalibrationRun({ keyLabel, onFinished: finished });

  const sentence: SentenceSetup | undefined = useMemo(
    () =>
      !ready || layout === undefined || shape === undefined || assignment === undefined
        ? undefined
        : sentenceSetupOf(
            MEASUREMENT_SENTENCES.map((text) => buildSentence({ layoutId: layout.id, shapeId: shape.id, fingerAssignmentId: assignment.id }, text)),
            MEASUREMENT_SENTENCE_BREAKS,
          ),
    [ready, buildSentence, layout, shape, assignment],
  );
  // 測定を始めた時の示す文・打鍵の列と構造・保存値。別のタブで条件や保存値が変わっても、終わりまでこれを使う。
  const [sentenceStart, setSentenceStart] = useState<SentenceStart | undefined>(undefined);
  const sentenceStartRef = useRef<SentenceStart | undefined>(undefined);
  // 打ち終えた測定。「保存する」「保存しない」を選ぶまで、保存値は変えない。
  const [sentencePending, setSentencePending] = useState<SentencePending | undefined>(undefined);
  const sentenceFinished = (session: SentenceSession) => {
    const started = sentenceStartRef.current;
    sentenceStartRef.current = undefined;
    setSentenceStart(undefined);
    if (started === undefined) return;
    // 数えるのは2回目以降だけ。値は、示した綴りではなく、回ごとに打った綴りで作った打鍵の列と構造から求める。
    const samples = sentenceSamples(started.setup.plans, session.records);
    if (samples === undefined) {
      setSentencePending({ base: started.calibration, samples: undefined, result: undefined, table: undefined });
      return;
    }
    const result = applySentenceMeasurement(started.calibration, samples, Date.now(), calibration);
    setSentencePending({ base: started.calibration, samples, result, table: sentenceResultTable(result) });
  };
  const saveSentence = () => {
    const pending = sentencePending;
    if (pending?.samples === undefined || pending.result?.ok !== true) return;
    // 保存の時点の保存値が、測定を始めた時と違えば保存しない。
    const result = applySentenceMeasurement(pending.base, pending.samples, Date.now(), calibration);
    setSentencePending(undefined);
    if (!result.ok) {
      setNotices({ sentence: { kind: 'error', text: sentenceFailureText(result), table: pending.table, phase: 'after-decline' } });
      return;
    }
    dropProblems();
    onSave(result.calibration);
    setNotices({ sentence: { kind: 'message', text: sentenceSavedMessage(result.measurement), table: pending.table, phase: 'after-save' } });
  };
  const declineSentence = () => {
    const pending = sentencePending;
    setSentencePending(undefined);
    setNotices({ sentence: { kind: 'message', text: SENTENCE_DECLINED_TEXT, table: pending?.table, phase: 'after-decline' } });
  };
  const sentenceRunner = useSentenceRun({ keyLabel, onFinished: sentenceFinished });
  const running = runner.run !== undefined || sentenceRunner.session !== undefined;
  // キー操作もボタンと同じ処理を通し、測定中（ボタンも押せない間）は動かさない
  useHistoryShortcuts(
    {
      canUndo,
      canRedo,
      undo: () => {
        setNotices({});
        dropProblems();
        onUndo();
      },
      redo: () => {
        setNotices({});
        dropProblems();
        onRedo();
      },
    },
    !running,
  );

  // 測定中は案内にフォーカスを置き（押した測定のボタンは無効になるため）、終わったら押したボタンへ戻す。
  const focusMeasurement = useEffectEvent(() => {
    (sentenceRunner.session === undefined ? regionRef : sentenceRegionRef).current?.focus();
  });
  useEffect(() => {
    if (running) {
      focusMeasurement();
      return undefined;
    }
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
    return undefined;
  }, [running]);

  const startRun = (scope: CalibrationScope, tasks: readonly CalibrationTask[]) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotices({});
    setSentencePending(undefined);
    runner.start(scope, tasks);
  };

  const currentTask = runner.run === undefined ? undefined : runner.run.tasks[runner.run.index];
  // 測定中の案内は、測っている項目の欄に出す。
  const runGroup = runner.run === undefined ? undefined : groupOfRun(runner.run);

  const startSentence = () => {
    if (sentence?.ok !== true || calibration === undefined) return;
    const started: SentenceStart = { setup: sentence, calibration };
    sentenceStartRef.current = started;
    setSentenceStart(started);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotices({});
    setSentencePending(undefined);
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
  const upcomingSentenceKeys = sentenceRun === undefined ? [] : upcomingSentenceSteps(sentenceRun, 8).map((step) => step.keys.map(keyLabel).join('+'));

  const dropFieldError = (fieldId: string) => {
    setFieldErrors((current) => {
      if (!(fieldId in current)) return current;
      const { [fieldId]: _dropped, ...others } = current;
      return others;
    });
  };

  // 欄を確定した時（欄から離れた時・Enter）に、その欄の値だけを保存値に重ねて保存する。
  // 別の欄に保存できない値が残っていても、この欄の保存は止めない。
  const commitField = (fieldId: string) => {
    if (calibration === undefined) return;
    const raw = values[fieldId] ?? '';
    const saved = savedValues[fieldId] ?? '';
    if (raw.trim() === saved) {
      dropFieldError(fieldId);
      return;
    }
    const result = applyCalibrationField(calibration, fieldId, raw, Date.now());
    if (!result.ok) {
      setFieldErrors((current) => ({ ...current, [fieldId]: calibrationFormProblemText(result) }));
      return;
    }
    dropFieldError(fieldId);
    // 表示の桁で同じ値は、書き換えとして数えない。入力は保存値の表示に戻す。
    if ((calibrationFormValues(result.calibration)[fieldId] ?? '') === saved) {
      setValues((current) => ({ ...current, [fieldId]: saved }));
      return;
    }
    onSave(result.calibration);
  };

  const onFieldChange = (fieldId: string, value: string) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    dropFieldError(fieldId);
  };

  const rowAction = (fieldId: string): RowAction => {
    if (fieldId === CALIBRATION_SAME_HAND_FIELD || fieldId === CALIBRATION_FALLBACK_REPEAT_FIELD || fieldId === CALIBRATION_FALLBACK_MOVE_FIELD) {
      return { kind: 'hint', text: NORMAL_DERIVED_HINT };
    }
    const tasks = plan?.byField.get(fieldId) ?? [];
    if (tasks.length > 0) return { kind: 'measure', tasks };
    return fieldId.startsWith('overhead:') ? { kind: 'none' } : { kind: 'hint', text: UNMEASURABLE_ROW_HINT };
  };
  const gridContext: GridContext = {
    values,
    saved: savedValues,
    errors: fieldErrors,
    disabled: running,
    action: rowAction,
    onChange: onFieldChange,
    onCommit: commitField,
    onMeasure: (tasks) => startRun('item', tasks),
  };
  const renderRow = (fieldId: string): ReactNode => (
    <ValueRow
      fieldId={fieldId}
      value={values[fieldId] ?? ''}
      error={fieldErrors[fieldId]}
      disabled={running}
      action={rowAction(fieldId)}
      onChange={onFieldChange}
      onCommit={commitField}
      onMeasure={(tasks) => startRun('item', tasks)}
      note={fieldId.startsWith('finger:') ? zeroMoveRowNote(fieldId, calibration?.fingerMoveMsPerUnit ?? {}) : undefined}
    />
  );

  /**
   * 項目を、保存値にあるもの（規定の並び、その後に並びに無いもの）と、まだ無いものに分ける。
   * `universe`は並びが決まっている項目。接頭辞が空なら、並びに無い項目は拾わない。
   */
  const splitIds = (prefix: string, universe: readonly string[]) => {
    const known = universe.filter((id) => id in savedValues);
    const extra =
      prefix === ''
        ? []
        : Object.keys(savedValues)
            .filter((id) => id.startsWith(prefix) && !universe.includes(id))
            .sort();
    const measuredIds = [...known, ...extra];
    const missingIds = universe.filter((id) => !(id in savedValues));
    return { measuredIds, missingIds, hasProblem: [...measuredIds, ...missingIds].some((id) => id in fieldErrors) };
  };
  const main = splitIds('', ['actions', CALIBRATION_SAME_HAND_FIELD, CALIBRATION_FALLBACK_REPEAT_FIELD, CALIBRATION_FALLBACK_MOVE_FIELD]);
  const fingers = splitIds(
    'finger:',
    FINGERS.map((finger) => `finger:${finger}`),
  );
  const directions = splitIds('direction:', ['direction:L→R', 'direction:R→L']);
  const simultaneous = splitIds('simultaneous:', SIMULTANEOUS_KINDS.map(calibrationSimultaneousFieldId));
  const hasSavedWith = (...prefixes: string[]) => Object.keys(savedValues).some((id) => prefixes.some((prefix) => id.startsWith(prefix)));
  const savedInNormal = hasSavedWith(
    'actions',
    CALIBRATION_SAME_HAND_FIELD,
    CALIBRATION_FALLBACK_REPEAT_FIELD,
    CALIBRATION_FALLBACK_MOVE_FIELD,
    'finger:',
    'finger-repeat:',
    'same-hand-pair:',
  );

  // 測ると置き換わる・消える値は、今の保存値から決まる。保存値を持たない時と、置き換わる値も消える値も無い時は文を出さない。
  const savedOverheads = OVERHEAD_KINDS.filter((kind) => calibration?.keystrokeOverheadMs?.[kind] !== undefined);
  const savedSimultaneous = SIMULTANEOUS_KINDS.filter((kind) => calibration?.simultaneousOverheadMs?.[kind] !== undefined);
  const effectOf = (group: 'normal' | 'directional' | 'simultaneous' | 'sentence') => {
    const text = measurementEffectText(group, calibration !== undefined, savedOverheads, savedSimultaneous, calibration?.sentenceSimultaneousKinds);
    return text === undefined ? null : (
      <p className="personal-speed-note" data-personal-speed-effect={group}>
        {text}
      </p>
    );
  };

  const normalReason = plan?.normal === undefined ? NO_BASIS_TEXT : undefined;
  const directionalReason =
    calibration === undefined
      ? NEED_NORMAL_FIRST_TEXT
      : plan === undefined
        ? NO_BASIS_TEXT
        : plan.directional === undefined
          ? NO_DIRECTIONAL_TEXT
          : undefined;
  const simultaneousReason = calibration === undefined ? NEED_NORMAL_FIRST_TEXT : plan?.simultaneous === undefined ? NO_SIMULTANEOUS_TEXT : undefined;
  const sentenceReason = calibration === undefined ? NEED_NORMAL_FIRST_TEXT : undefined;
  const normalDisabled = running || normalReason !== undefined;
  const directionalDisabled = running || directionalReason !== undefined;
  const simultaneousDisabled = running || simultaneousReason !== undefined;
  const sentenceDisabled = running || sentence?.ok !== true || calibration === undefined;

  const calibrationRegion = (group: GroupId) =>
    runGroup !== group || runner.run === undefined || currentTask === undefined ? null : (
      <div className="personal-speed-run" ref={regionRef} tabIndex={-1} data-personal-speed-run="active">
        <p className="personal-speed-instruction" data-personal-speed-instruction>
          {calibrationInstruction(currentTask, keyLabel)}
        </p>
        <p className="personal-speed-progress" data-personal-speed-progress>
          {calibrationProgressText(runner.run)}
        </p>
        <p className="personal-speed-warning" role="status">
          {runner.wrongKey === undefined
            ? ''
            : currentTask.item.kind === 'simultaneous'
              ? simultaneousWrongKeyText(currentTask, keyLabel)
              : wrongKeyText(runner.wrongKey)}
        </p>
        <button type="button" data-personal-speed-cancel onClick={runner.cancel}>
          中止
        </button>
      </div>
    );
  const reasonText = (text: string | undefined) =>
    text === undefined ? null : (
      <p className="personal-speed-reason" data-personal-speed-reason>
        {text}
      </p>
    );
  const emptyText = (text: string) => (
    <p className="personal-speed-note" data-personal-speed-empty>
      {text}
    </p>
  );

  return (
    <article className="personal-speed">
      <h1>{PERSONAL_SPEED_LABEL}</h1>
      <p className="personal-speed-lead">打鍵と指の移動の速さを測って保存します。</p>
      <p className="personal-speed-note" data-personal-speed-purpose>
        {PERSONAL_SPEED_PURPOSE}
      </p>
      <div className="personal-speed-toolbar">
        <button
          type="button"
          disabled={!canUndo || running}
          onClick={() => {
            setNotices({});
            dropProblems();
            onUndo();
          }}
        >
          元に戻す
        </button>
        <button
          type="button"
          disabled={!canRedo || running}
          onClick={() => {
            setNotices({});
            dropProblems();
            onRedo();
          }}
        >
          やり直す
        </button>
        <button type="button" data-personal-speed-discard disabled={calibration === undefined || running} onClick={() => setConfirming(true)}>
          全て破棄
        </button>
      </div>
      <NoticeLines notice={notices.all} />
      {ready ? (
        <>
          {calibration === undefined ? null : <p className="personal-speed-note">保存した数値は直接書き換えられます。任意の項目は空にすると消えます。</p>}
          <section className="personal-speed-section" aria-labelledby="personal-speed-basis">
            <h2 id="personal-speed-basis">測るキー</h2>
            <p className="personal-speed-note">
              選んだ配列の刻印のキーを、物理配列と指の割り当てに沿って打ちます。ここでの選択は、他の画面の対象や条件を変えません。
            </p>
            <div className="personal-speed-select-grid">
              <label>
                配列
                <select
                  value={layout?.id ?? ''}
                  disabled={running}
                  onChange={(event) => setSelection({ ...selection, layoutId: event.currentTarget.value })}
                >
                  {catalog.layouts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
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
                    const fingerAssignmentId = catalog.fingerAssignments.some((item) => item.id === preferred) ? preferred : selection.fingerAssignmentId;
                    setSelection({ ...selection, shapeId, fingerAssignmentId });
                  }}
                >
                  {catalog.shapes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                指の割り当て
                <select
                  value={assignment?.id ?? ''}
                  disabled={running}
                  onChange={(event) => setSelection({ ...selection, fingerAssignmentId: event.currentTarget.value })}
                >
                  {catalog.fingerAssignments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <MeasurementGroup
            id="normal"
            title="通常の速度と指の移動"
            description={MEASUREMENT_DESCRIPTION.normal}
            howTo={MEASUREMENT_HOW_TO.normal}
            specHref={specHref}
            hasSavedValues={savedInNormal}
          >
            <div className="personal-speed-actions">
              <button type="button" data-personal-speed-start="normal" disabled={normalDisabled} onClick={() => startRun('normal', plan?.normal ?? [])}>
                通常の速度と指の移動を全て測る
              </button>
            </div>
            {effectOf('normal')}
            {reasonText(normalReason)}
            {calibrationRegion('normal')}
            <NoticeLines notice={notices.normal} />
            {calibration === undefined ? (
              emptyText(UNMEASURED_TEXT.normal)
            ) : (
              <>
                <ValueBlock {...main} renderRow={renderRow} />
                <ValueBlock title="指ごとの移動の時間" {...fingers} emptyText="まだ測っていません。" renderRow={renderRow} />
                <div className="personal-speed-value-block">
                  <h3>同手・別指の組ごとの速度</h3>
                  {hasFingerGridFields('same-hand-pair', gridContext) ? (
                    <SameHandPairGrids ctx={gridContext} />
                  ) : (
                    <p className="personal-speed-note">まだ測っていません。</p>
                  )}
                </div>
              </>
            )}
          </MeasurementGroup>

          <MeasurementGroup
            id="directional"
            title="方向別の速度"
            description={MEASUREMENT_DESCRIPTION.directional}
            howTo={MEASUREMENT_HOW_TO.directional}
            specHref={specHref}
            hasSavedValues={hasSavedWith('direction:', 'directed-pair:')}
          >
            <div className="personal-speed-actions">
              <button
                type="button"
                data-personal-speed-start="directional"
                disabled={directionalDisabled}
                onClick={() => startRun('directional', plan?.directional ?? [])}
              >
                方向別の速度を全て測る
              </button>
            </div>
            {effectOf('directional')}
            {reasonText(directionalReason)}
            {calibrationRegion('directional')}
            <NoticeLines notice={notices.directional} />
            {calibration === undefined ? (
              emptyText(UNMEASURED_TEXT.directional)
            ) : (
              <>
                <ValueBlock title="異手の方向別" {...directions} emptyText="まだ測っていません。" renderRow={renderRow} />
                <div className="personal-speed-value-block">
                  <h3>同手・別指の方向別</h3>
                  {hasFingerGridFields('directed-pair', gridContext) ? (
                    <DirectedPairGrids ctx={gridContext} />
                  ) : (
                    <p className="personal-speed-note">まだ測っていません。</p>
                  )}
                </div>
              </>
            )}
          </MeasurementGroup>

          <MeasurementGroup
            id="simultaneous"
            title="同時押し"
            description={MEASUREMENT_DESCRIPTION.simultaneous}
            howTo={MEASUREMENT_HOW_TO.simultaneous}
            specHref={specHref}
            hasSavedValues={hasSavedWith('simultaneous:')}
          >
            <div className="personal-speed-actions">
              <button
                type="button"
                data-personal-speed-start="simultaneous"
                disabled={simultaneousDisabled}
                onClick={() => startRun('simultaneous', plan?.simultaneous ?? [])}
              >
                同時押しを全て測る
              </button>
            </div>
            {effectOf('simultaneous')}
            {reasonText(simultaneousReason)}
            {calibrationRegion('simultaneous')}
            <NoticeLines notice={notices.simultaneous} />
            {calibration === undefined ? (
              emptyText(UNMEASURED_TEXT.simultaneous)
            ) : (
              <ValueBlock title="同時押しの上乗せ" {...simultaneous} emptyText="まだ測っていません。" renderRow={renderRow} />
            )}
          </MeasurementGroup>

          <MeasurementGroup
            id="sentence"
            title="文章を打つ速さ"
            description={MEASUREMENT_DESCRIPTION.sentence}
            howTo={MEASUREMENT_HOW_TO.sentence}
            specHref={specHref}
            hasSavedValues={hasSavedWith('overhead:')}
          >
            <div className="personal-speed-actions">
              <button type="button" data-personal-speed-start="sentence" disabled={sentenceDisabled} onClick={startSentence}>
                文章を打つ速さを測る
              </button>
            </div>
            {effectOf('sentence')}
            {reasonText(sentenceReason)}
            {sentence?.ok === false ? (
              <p className="personal-speed-warning" role="alert" data-personal-speed-sentence-unavailable>
                {sentence.message}
              </p>
            ) : null}
            {sentenceSession === undefined ? null : (
              <div className="personal-speed-run" ref={sentenceRegionRef} tabIndex={-1} data-personal-speed-sentence-run="active">
                {sentenceRun === undefined || runningSentence === undefined ? null : (
                  <>
                    <p className="personal-speed-progress" data-personal-speed-sentence-position>
                      {sentenceProgressText(sentenceSession.sentence, sentenceSession.plans.length, sentenceSession.round, sentenceSession.rounds)}
                    </p>
                    {sentenceSession.round === 0 ? (
                      <p className="personal-speed-note" data-personal-speed-sentence-learning>
                        {SENTENCE_LEARNING_ROUND_TEXT}
                      </p>
                    ) : null}
                    <SentenceText plan={sentenceSession.plans[sentenceSession.sentence]} run={sentenceRun} />
                    <p className="personal-speed-instruction">
                      次に打つキー:{' '}
                      <span data-personal-speed-next>
                        {nextSentenceKeys.map((key) => (
                          <kbd key={key}>{keyLabel(key)}</kbd>
                        ))}
                      </span>
                    </p>
                    <p className="personal-speed-progress" data-personal-speed-upcoming>
                      この後: {upcomingSentenceKeys.join(' ')}
                    </p>
                    <p className="personal-speed-progress" data-personal-speed-sentence-progress>
                      あと{remainingSentenceStrokes(sentenceRun)}打
                    </p>
                    <p className="personal-speed-warning" role="status">
                      {sentenceRunner.wrongKey === undefined ? '' : wrongKeyText(sentenceRunner.wrongKey)}
                    </p>
                    <button type="button" data-personal-speed-sentence-cancel onClick={cancelSentence}>
                      中止
                    </button>
                  </>
                )}
              </div>
            )}
            {sentencePending === undefined ? null : (
              <div className="personal-speed-pending" data-personal-speed-sentence-pending>
                <p className="personal-speed-message" role="status">
                  {sentencePending.result?.ok === true ? sentencePendingText(sentencePending.result.measurement) : ''}
                </p>
                <p className="personal-speed-error" role="alert" data-personal-speed-sentence-cannot-save>
                  {sentencePending.result?.ok === true ? '' : sentenceCannotSaveText(sentencePending.result)}
                </p>
                {sentencePending.table === undefined ? null : <SentenceResultTable table={sentencePending.table} phase="pending" />}
                <div className="personal-speed-actions">
                  <button type="button" data-personal-speed-sentence-save disabled={sentencePending.result?.ok !== true} onClick={saveSentence}>
                    {SENTENCE_SAVE_BUTTON}
                  </button>
                  <button type="button" data-personal-speed-sentence-decline onClick={declineSentence}>
                    {SENTENCE_DISCARD_BUTTON}
                  </button>
                </div>
              </div>
            )}
            <NoticeLines notice={notices.sentence} />
            {calibration === undefined ? (
              emptyText(UNMEASURED_TEXT.sentence)
            ) : (
              <div className="personal-speed-value-block">
                <h3>打鍵の上乗せ</h3>
                <p className="personal-speed-note">文章を打つ速さの測定で求まります。</p>
                <OverheadGrid ctx={gridContext} />
              </div>
            )}
          </MeasurementGroup>
        </>
      ) : null}
      {confirming ? (
        <ConfirmDiscard
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            dropProblems();
            onDiscard();
            setNotices({ all: { kind: 'message', text: '個人速度を破棄しました。' } });
          }}
        />
      ) : null}
    </article>
  );
}
