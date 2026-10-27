import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  blankFace,
  blankFaceLayoutDraft,
  checkFaceLayout,
  contentOfFaceLayout,
  draftOf,
  type DraftFace,
  type FaceLayoutDraft,
} from '#input/layouts/face-layout-edit.ts';
import { KANA_COVERAGE_GROUPS } from '#input/layouts/kana-coverage.ts';
import { kanaLayoutFileText, parseKanaLayoutFile, type KanaLayoutContent } from '#input/layouts/kana-face-layout-file.ts';
import { isFaceOutputKey, type FaceLayoutNotice, type FaceLayoutProblem } from '#input/layouts/kana-face-layout.ts';
import { importKanaLayoutFile } from '#input/layouts/import.ts';
import { ignoredHomeKeyWarnings, newUserLayoutId } from '#input/layouts/layout-edit.ts';
import type { FaceMode, InputRole, LayerKind, TriggerOrder, TriggerPersistence } from '#input/layouts/types.ts';
import { isFaceUserLayout, type UserLayout } from '#input/layouts/user-layouts.ts';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import {
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  FINGERS,
  HOME_ROW,
  LEFT_COLUMN_KEYS,
  JIS_FINGER_ASSIGNMENT,
  type FingerAssignment,
  type Key,
  type PhysicalKeyboardStandard,
} from '#input/shapes/geometry.ts';
import { PhysicalKeyboard, type PhysicalKeyboardKeyView } from '#ui/keyboard/physical-keyboard.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';
import {
  AGGREGATION_LABEL,
  faceIndexOfPath,
  faceSummary,
  INPUT_ROLE_LABEL,
  keyLabel,
  MODE_LABEL,
  nextOutputKey,
  patchFace,
  PERSISTENCE_LABEL,
  setFaceOutput,
  setModifierGroup,
  toggleTriggerKey,
  TRIGGER_ORDER_LABEL,
} from './face-editing.ts';
import { KANA_LAYOUT_LABEL } from './label.ts';
import './kana-layout.css';

const NEW = 'new';

/** 図に描く物理配列。面の上のキーは、どちらの規格でも同じ刻印のキーに書ける。 */
const FIGURE_SHAPE: Readonly<Record<PhysicalKeyboardStandard, 'row-staggered' | 'jis-row-staggered'>> = {
  ansi: 'row-staggered',
  jis: 'jis-row-staggered',
};

const geometryOf = (standard: PhysicalKeyboardStandard) =>
  buildGeometry(FIGURE_SHAPE[standard], standard === 'jis' ? JIS_FINGER_ASSIGNMENT : DEFAULT_FINGER_ASSIGNMENT);

/** 下書きの出力が、ANSIの図に無いキーに置かれている時は、JISの図から始める。 */
function initialStandard(draft: FaceLayoutDraft): PhysicalKeyboardStandard {
  const ansi = geometryOf('ansi').keys;
  const usesJisKey = draft.faces.some((face) => Object.keys(face.outputs).some((key) => !ansi.has(key)));
  return usesJisKey ? 'jis' : 'ansi';
}

export interface KanaLayoutEditorProps {
  /** 自作の配列。面で定義する配列だけを一覧に出す。 */
  readonly layouts: readonly UserLayout[];
  /** 保存の読み込みが済むまでは、配列が無いように見せない。 */
  readonly ready: boolean;
  /** ホームキーの照合に使う、選べる指の割り当て（組み込みと自作）。 */
  readonly fingerAssignments: readonly FingerAssignment[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCreate: (id: string, content: KanaLayoutContent) => void;
  readonly onUpdate: (id: string, content: KanaLayoutContent) => void;
  /** 書き出したJSONをファイルとして保存する。ブラウザの保存は `editors` が持てないので、appが渡す。 */
  readonly onDownload: (filename: string, text: string) => void;
  /** ローマ字配列の画面へのリンク。ルーターを使えるのは `app` だけなので、`app` が渡す */
  readonly RomajiLayoutLink: ComponentType<{ readonly children: ReactNode }>;
}

function ProblemList({ problems, severity }: { readonly problems: readonly FaceLayoutProblem[]; readonly severity: 'error' | 'warning' }) {
  if (problems.length === 0) return null;
  return (
    <ul className="kana-layout-problems" data-kana-problems={severity}>
      {problems.map((problem) => (
        <li
          key={`${problem.path}:${problem.message}`}
          className={severity === 'error' ? 'kana-layout-error' : 'kana-layout-warning'}
          role={severity === 'error' ? 'alert' : 'status'}
          data-kana-problem={severity}
        >
          <span>{problem.message}</span>
          {problem.path === '' ? null : <code className="kana-layout-path">{problem.path}</code>}
          {problem.detail === undefined ? null : (
            <details className="kana-layout-detail">
              <summary>詳細（不具合報告用）</summary>
              <pre>{problem.detail}</pre>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function NoticeList({ notices }: { readonly notices: readonly FaceLayoutNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="kana-layout-problems" data-kana-notices>
      {notices.map((notice) => (
        <li key={notice.output} className="kana-layout-warning" role="status">
          {notice.message}
        </li>
      ))}
    </ul>
  );
}

interface SelectFieldProps<T extends string> {
  readonly label: string;
  readonly value: T | undefined;
  readonly options: Readonly<Record<T, string>>;
  readonly onChange: (value: T | undefined) => void;
  /** 選んでいない状態の表示。値を決めなければならない項目は「選んでください」を渡す。 */
  readonly unset?: string;
  readonly dataName: string;
  readonly invalid?: boolean;
}

function SelectField<T extends string>({ label, value, options, onChange, unset, dataName, invalid }: SelectFieldProps<T>) {
  return (
    <label>
      {label}
      <select
        value={value ?? ''}
        aria-invalid={invalid === true}
        data-kana-face-field={dataName}
        onChange={(event) => onChange(event.currentTarget.value === '' ? undefined : (event.currentTarget.value as T))}
      >
        {unset === undefined ? null : <option value="">{unset}</option>}
        {(Object.keys(options) as T[]).map((key) => (
          <option key={key} value={key}>
            {options[key]}
          </option>
        ))}
      </select>
    </label>
  );
}

interface FacePanelProps {
  readonly face: DraftFace;
  readonly standard: PhysicalKeyboardStandard;
  readonly homeKeys: ReadonlySet<string>;
  readonly problems: readonly FaceLayoutProblem[];
  readonly onChange: (face: DraftFace) => void;
}

/** 選んだ面の編集。キーボードの図の上でキーを選び、出力と切り替えのキーを決める。 */
function FacePanel({ face, standard, homeKeys, problems, onChange }: FacePanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [operation, setOperation] = useState<'output' | 'trigger'>('output');
  const [announcement, setAnnouncement] = useState('');
  const geometry = useMemo(() => geometryOf(standard), [standard]);
  const keys = useMemo(() => [...geometry.keys.values()], [geometry]);
  const triggered = face.trigger.length > 0;

  const pathsOf = (field: string) => problems.some((problem) => problem.path.endsWith(`.${field}`));

  const views = useMemo(() => {
    const result = new Map<string, PhysicalKeyboardKeyView>();
    for (const key of keys) {
      const isTrigger = face.trigger.includes(key.id);
      // 出力を書けるのは面の上のキーと左端の列の3つのキーだけ。親指とShiftは、出力の操作の間は押せない
      const noOutput = operation === 'output' && !isFaceOutputKey(key.id);
      result.set(key.id, {
        legend: face.outputs[key.id] ?? '',
        secondaryLegend: keyLabel(key.id, standard),
        trigger: isTrigger,
        selected: operation === 'output' && selectedKey === key.id,
        home: homeKeys.has(key.id),
        disabled: noOutput,
        description:
          [isTrigger ? '切り替えのキー' : undefined, noOutput ? '出力を書けないキー' : undefined].filter((text) => text !== undefined).join('。') ||
          undefined,
      });
    }
    return result;
  }, [keys, face.trigger, face.outputs, standard, operation, selectedKey, homeKeys]);

  const offFigure = Object.keys(face.outputs).filter((key) => !geometry.keys.has(key));

  const onKeyClick = (key: Key) => {
    if (operation === 'trigger') {
      onChange(toggleTriggerKey(face, key.id));
      return;
    }
    // 出力を書けないキーは、図が押せないキーとして出す（`disabled`）ので、ここへは来ない
    if (!isFaceOutputKey(key.id)) return;
    setSelectedKey(key.id === selectedKey ? undefined : key.id);
  };

  // 出力欄にフォーカスがある間はラベルの変化が読み上げられないので、選び直したキーの名前を知らせる
  const advance = () => {
    if (selectedKey === undefined) return;
    const next = nextOutputKey(
      keys.map((key) => key.id),
      selectedKey,
      face.trigger,
    );
    if (next === undefined) return;
    setSelectedKey(next);
    setAnnouncement(`${keyLabel(next, standard)}のキーを選びました`);
  };

  return (
    <div className="kana-layout-face" data-kana-face-panel>
      <fieldset className="kana-layout-operation">
        <legend>図のキーで選ぶもの</legend>
        <label className="kana-layout-inline">
          <input
            type="radio"
            name="kana-operation"
            checked={operation === 'output'}
            data-kana-operation="output"
            onChange={() => setOperation('output')}
          />
          出力
        </label>
        <label className="kana-layout-inline">
          <input
            type="radio"
            name="kana-operation"
            checked={operation === 'trigger'}
            data-kana-operation="trigger"
            onChange={() => setOperation('trigger')}
          />
          切り替えのキー
        </label>
      </fieldset>

      <div className="kana-layout-figure" data-kana-figure>
        <PhysicalKeyboard
          keys={keys}
          keyViews={views}
          ariaLabel="かな配列のキーボードの図"
          geometryId={FIGURE_SHAPE[standard]}
          unit={56}
          horizontalAlign="left"
          operable
          onKeyClick={onKeyClick}
          onEscape={() => setSelectedKey(undefined)}
        />
      </div>
      {offFigure.length === 0 ? null : <p className="kana-layout-note">この図に無いキーの出力があります（{offFigure.join('・')}）。</p>}

      {operation === 'output' ? (
        <div className="kana-layout-output">
          <label>
            {selectedKey === undefined ? 'キーの出力' : `${keyLabel(selectedKey, standard)}のキーの出力`}
            <input
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder={selectedKey === undefined ? '図のキーを選ぶ' : '例: あ'}
              disabled={selectedKey === undefined}
              value={selectedKey === undefined ? '' : (face.outputs[selectedKey] ?? '')}
              data-kana-output
              onChange={(event) => selectedKey !== undefined && onChange(setFaceOutput(face, selectedKey, event.currentTarget.value))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                // 配列のformの送信にしない。変換を確定するEnterはそのまま通す
                event.preventDefault();
                advance();
              }}
            />
          </label>
          <span className="kana-layout-visually-hidden" role="status" data-kana-output-announce>
            {announcement}
          </span>
          <button
            type="button"
            data-kana-output-clear
            disabled={selectedKey === undefined || (face.outputs[selectedKey] ?? '') === ''}
            onClick={() => selectedKey !== undefined && onChange(setFaceOutput(face, selectedKey, ''))}
          >
            消す
          </button>
        </div>
      ) : null}

      <div className="kana-layout-fields">
        {triggered ? (
          <>
            <SelectField<FaceMode>
              label="打鍵の順序"
              value={face.mode}
              options={MODE_LABEL}
              unset="選んでください"
              dataName="mode"
              invalid={pathsOf('mode')}
              onChange={(mode) => onChange(patchFace(face, { mode }))}
            />
            <SelectField<TriggerPersistence>
              label="切り替えのキーの持続"
              value={face.triggerPersistence}
              options={PERSISTENCE_LABEL}
              unset="選んでください"
              dataName="persistence"
              invalid={pathsOf('triggerPersistence')}
              onChange={(triggerPersistence) => onChange(patchFace(face, { triggerPersistence }))}
            />
          </>
        ) : null}
        <SelectField<InputRole>
          label="入力の意味"
          value={face.inputRole}
          options={INPUT_ROLE_LABEL}
          unset="選んでください"
          dataName="role"
          invalid={pathsOf('inputRole')}
          onChange={(inputRole) => onChange(patchFace(face, { inputRole }))}
        />
        {face.inputRole === 'composition' ? (
          <SelectField<LayerKind>
            label="打鍵の計上先"
            value={face.compositionAggregation}
            options={AGGREGATION_LABEL}
            unset="選んでください"
            dataName="aggregation"
            invalid={pathsOf('compositionAggregation')}
            onChange={(compositionAggregation) => onChange(patchFace(face, { compositionAggregation }))}
          />
        ) : null}
        {triggered && (face.mode === undefined || face.mode === 'simultaneous') ? (
          <SelectField<TriggerOrder>
            label="同時押しの順序を縛る"
            value={face.triggerOrder}
            options={TRIGGER_ORDER_LABEL}
            unset="縛らない"
            dataName="trigger-order"
            invalid={pathsOf('triggerOrder')}
            onChange={(triggerOrder) => onChange(patchFace(face, { triggerOrder }))}
          />
        ) : null}
        {triggered ? (
          <label>
            <span className="kana-layout-label-row">
              レイヤーの名前
              <InfoButton
                name="レイヤーの名前"
                description="同じ名前を書いた面のうち、切り替えのキーが1つずつで条件を満たすものは、1つのレイヤーにまとめて数えます。"
              />
            </span>
            <input
              type="text"
              value={face.layer ?? ''}
              placeholder="未設定"
              data-kana-face-field="layer"
              aria-invalid={pathsOf('layer')}
              onChange={(event) => onChange(patchFace(face, { layer: event.currentTarget.value === '' ? undefined : event.currentTarget.value }))}
            />
          </label>
        ) : null}
      </div>

      {face.inputRole === 'modifier' && triggered ? (
        <fieldset className="kana-layout-groups">
          <legend>
            修飾の組
            <InfoButton name="修飾の組" description="切り替えのキーごとに、属する組の名前を書きます。1つでも書いた時は、すべてのキーに書きます。" />
          </legend>
          {face.trigger.map((key) => (
            <label key={key} className="kana-layout-inline">
              {keyLabel(key, standard)}
              <input
                type="text"
                value={face.modifierGroups?.[key] ?? ''}
                data-kana-modifier-group={key}
                onChange={(event) => onChange(setModifierGroup(face, key, event.currentTarget.value))}
              />
            </label>
          ))}
        </fieldset>
      ) : null}

      <ProblemList problems={problems} severity="error" />
    </div>
  );
}

interface KanaLayoutFormProps {
  readonly initial: FaceLayoutDraft;
  readonly fingerAssignments: readonly FingerAssignment[];
  readonly isNew: boolean;
  readonly onSubmit: (content: KanaLayoutContent) => void;
  readonly onDownload: (filename: string, text: string) => void;
}

/** 入力中の値はこの中だけで持ち、保存を押した時に親へ渡す。 */
function KanaLayoutForm({ initial, fingerAssignments, isNew, onSubmit, onDownload }: KanaLayoutFormProps) {
  const [draft, setDraft] = useState<FaceLayoutDraft>(initial);
  const [faceIndex, setFaceIndex] = useState(0);
  const [standard, setStandard] = useState<PhysicalKeyboardStandard>(() => initialStandard(initial));
  const [pasted, setPasted] = useState('');
  const [importResult, setImportResult] = useState<
    | { readonly ok: true; readonly notices: readonly FaceLayoutNotice[] }
    | { readonly ok: false; readonly problems: readonly FaceLayoutProblem[] }
    | undefined
  >(undefined);
  const [copyResult, setCopyResult] = useState<'copied' | 'failed' | undefined>(undefined);

  const check = useMemo(() => checkFaceLayout(draft), [draft]);
  const blocked = check.content === undefined;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const exportText = useMemo(() => (check.content === undefined ? undefined : kanaLayoutFileText(check.content)), [check.content]);
  const shownIndex = Math.min(faceIndex, draft.faces.length - 1);
  const face = draft.faces[shownIndex]!;
  const homeKeySet = useMemo(() => new Set(Object.values(draft.homeKeys).filter((key) => key !== '')), [draft.homeKeys]);
  const homeKeyWarnings = useMemo(() => ignoredHomeKeyWarnings(draft.homeKeys, fingerAssignments), [draft.homeKeys, fingerAssignments]);
  const homeKeyCandidates = useMemo(() => {
    const geometry = geometryOf(standard);
    return [...(geometry.grid[HOME_ROW] ?? []).map((key) => key.id), ...LEFT_COLUMN_KEYS.filter((key) => geometry.keys.has(key))];
  }, [standard]);

  const problemsOfFace = (index: number) => check.problems.filter((problem) => faceIndexOfPath(problem.path) === index);
  const formProblems = check.problems.filter((problem) => faceIndexOfPath(problem.path) === undefined);

  const setFace = (next: DraftFace) => setDraft({ ...draft, faces: draft.faces.map((entry, index) => (index === shownIndex ? next : entry)) });
  const addFace = () => {
    setDraft({ ...draft, faces: [...draft.faces, blankFace()] });
    setFaceIndex(draft.faces.length);
  };
  const removeFace = () => {
    setDraft({ ...draft, faces: draft.faces.filter((_, index) => index !== shownIndex) });
    setFaceIndex(Math.max(0, shownIndex - 1));
  };

  const importPasted = () => {
    const result = parseKanaLayoutFile(pasted);
    if (!result.ok) {
      setImportResult({ ok: false, problems: result.problems });
      return;
    }
    const next = draftOf(result.layout);
    setDraft(next);
    setFaceIndex(0);
    setStandard(initialStandard(next));
    setImportResult({ ok: true, notices: result.notices });
  };

  const copy = async () => {
    if (exportText === undefined) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyResult('copied');
    } catch {
      setCopyResult('failed');
    }
  };

  return (
    <form
      className="kana-layout-form"
      data-kana-layout-form
      onSubmit={(event) => {
        event.preventDefault();
        if (check.content !== undefined && (isNew || dirty)) onSubmit(check.content);
      }}
    >
      <label className="kana-layout-name">
        名前
        <input
          type="text"
          value={draft.name}
          aria-invalid={check.problems.some((problem) => problem.path === 'name')}
          data-kana-name
          onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
        />
      </label>

      <fieldset className="kana-layout-faces">
        <legend>面</legend>
        <div className="kana-layout-face-list">
          {draft.faces.map((entry, index) => {
            const own = problemsOfFace(index);
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: 面は並びの番号が名前で、並べ替えを持たない
                key={index}
                type="button"
                aria-pressed={index === shownIndex}
                data-kana-face-pick={index}
                data-has-problem={own.length > 0 || undefined}
                onClick={() => setFaceIndex(index)}
              >
                <span>面{index + 1}</span>
                <small>{faceSummary(entry, standard)}</small>
                {own.length > 0 ? <small className="kana-layout-error">誤りあり</small> : null}
              </button>
            );
          })}
        </div>
        <div className="kana-layout-actions">
          <button type="button" data-kana-face-add onClick={addFace}>
            面を足す
          </button>
          <button type="button" data-kana-face-remove disabled={draft.faces.length <= 1} onClick={removeFace}>
            選んだ面を消す
          </button>
          <label className="kana-layout-inline">
            キーの並びの表示
            <select value={standard} data-kana-standard onChange={(event) => setStandard(event.currentTarget.value as PhysicalKeyboardStandard)}>
              <option value="ansi">ANSI</option>
              <option value="jis">JIS</option>
            </select>
          </label>
        </div>
        <h3 className="kana-layout-face-title">面{shownIndex + 1}</h3>
        <FacePanel
          // 選ぶ面が替わったら、選んでいたキーと操作を持ち越さない
          key={shownIndex}
          face={face}
          standard={standard}
          homeKeys={homeKeySet}
          problems={problemsOfFace(shownIndex)}
          onChange={setFace}
        />
      </fieldset>

      <fieldset className="kana-layout-composition">
        <legend>濁点・半濁点</legend>
        <label className="kana-layout-inline">
          <input
            type="checkbox"
            checked={draft.composition.dakuten}
            data-kana-composition="dakuten"
            onChange={(event) => setDraft({ ...draft, composition: { ...draft.composition, dakuten: event.currentTarget.checked } })}
          />
          濁点（゛）を後に打って合成する
        </label>
        <label className="kana-layout-inline">
          <input
            type="checkbox"
            checked={draft.composition.handakuten}
            data-kana-composition="handakuten"
            onChange={(event) => setDraft({ ...draft, composition: { ...draft.composition, handakuten: event.currentTarget.checked } })}
          />
          半濁点（゜）を後に打って合成する
        </label>
      </fieldset>

      <fieldset className="kana-layout-home">
        <legend className="kana-layout-label-row">
          ホームキー（任意）
          <InfoButton
            name="ホームキー"
            description="指定したキーを指の割り当てがその指の担当にしている時は、割り当てのホームキーより、ここでの指定が優先されます。担当にしていない割り当てでは、指定は使われません。"
          />
        </legend>
        <div className="kana-layout-home-grid">
          {FINGERS.map((finger) => {
            const value = draft.homeKeys[finger] ?? '';
            const stale = value !== '' && !homeKeyCandidates.includes(value);
            const warnings = homeKeyWarnings.filter((warning) => warning.finger === finger);
            return (
              <div key={finger}>
                <label>
                  {FINGER_LABEL[finger]}
                  <select
                    value={value}
                    aria-invalid={check.problems.some((problem) => problem.path === `homeKeys.${finger}`)}
                    data-kana-home={finger}
                    onChange={(event) => setDraft({ ...draft, homeKeys: { ...draft.homeKeys, [finger]: event.currentTarget.value } })}
                  >
                    <option value="">指の割り当ての値</option>
                    {stale ? <option value={value}>{keyLabel(value, standard)}（選べるキーに無いキー）</option> : null}
                    {homeKeyCandidates.map((key) => (
                      <option key={key} value={key}>
                        {keyLabel(key, standard)}のキー
                      </option>
                    ))}
                  </select>
                </label>
                {warnings.map((warning) => (
                  <p key={warning.message} className="kana-layout-warning" role="status" data-kana-home-warning={finger}>
                    {warning.message}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </fieldset>

      <section className="kana-layout-coverage" aria-labelledby="kana-coverage-title" data-kana-coverage>
        <h3 id="kana-coverage-title">全かなが打てるか</h3>
        {check.uncovered === undefined ? (
          <p className="kana-layout-note">定義に誤りがあるため、確かめられません。</p>
        ) : check.uncovered.length === 0 ? (
          <p className="kana-layout-note" data-kana-coverage-result="all">
            清音・濁音・半濁音・小書き・長音・句読点の全部を打てます。
          </p>
        ) : (
          <>
            <p className="kana-layout-warning" role="status" data-kana-coverage-result="missing">
              打てないかなが{check.uncovered.length}個あります
            </p>
            <ul className="kana-layout-uncovered">
              {KANA_COVERAGE_GROUPS.map((group) => {
                const missing = group.kana.filter((kana) => check.uncovered?.includes(kana));
                return missing.length === 0 ? null : (
                  <li key={group.name}>
                    <strong>{group.name}</strong> <span data-kana-uncovered={group.name}>{missing.join(' ')}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <NoticeList notices={check.notices} />
      <ProblemList problems={formProblems} severity="error" />

      <details className="kana-layout-json" data-kana-json>
        <summary>JSONの貼り付けと書き出し</summary>
        <label>
          貼り付ける定義
          <textarea
            rows={8}
            spellCheck={false}
            value={pasted}
            data-kana-json-paste
            onChange={(event) => {
              setPasted(event.currentTarget.value);
              setImportResult(undefined);
            }}
          />
        </label>
        <div className="kana-layout-actions">
          <button type="button" data-kana-json-import disabled={pasted.trim() === ''} onClick={importPasted}>
            編集中の内容に取り込む
          </button>
        </div>
        {importResult === undefined ? null : importResult.ok ? (
          <>
            <p className="kana-layout-note" role="status" data-kana-import-result="ok">
              取り込みました。
            </p>
            <NoticeList notices={importResult.notices} />
          </>
        ) : (
          <>
            <p className="kana-layout-error" role="alert" data-kana-import-result="error">
              誤りがあるため、取り込みませんでした。
            </p>
            <ProblemList problems={importResult.problems} severity="error" />
          </>
        )}

        <label>
          書き出す定義
          <textarea
            rows={8}
            readOnly
            spellCheck={false}
            value={exportText ?? ''}
            placeholder="誤りが無くなると、ここに定義が出ます"
            data-kana-json-export
          />
        </label>
        <div className="kana-layout-actions">
          <button type="button" data-kana-json-copy disabled={exportText === undefined} onClick={() => void copy()}>
            コピーする
          </button>
          <button
            type="button"
            data-kana-json-download
            disabled={exportText === undefined}
            onClick={() => exportText !== undefined && onDownload(`${draft.name.trim() || 'かな配列'}.json`, exportText)}
          >
            ファイルに保存する
          </button>
          {copyResult === 'copied' ? <span className="kana-layout-note">コピーしました</span> : null}
          {copyResult === 'failed' ? <span className="kana-layout-warning">コピーできませんでした。上の欄から選んでコピーしてください</span> : null}
        </div>
      </details>

      <div className="kana-layout-actions">
        <button type="submit" data-kana-submit disabled={blocked || (!isNew && !dirty)}>
          {isNew ? '追加する' : '保存する'}
        </button>
      </div>
    </form>
  );
}

/**
 * 面ごとに、切り替えのキー・打鍵の順序・キーごとの出力を決めて、かな配列を自作する・直す画面。
 * 書き込みは親が渡すコールバックを通す。選んでいる配列はこの画面の中だけの値で、保存しない。
 */
export function KanaLayoutEditor({
  layouts,
  ready,
  fingerAssignments,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCreate,
  onUpdate,
  onDownload,
  RomajiLayoutLink,
}: KanaLayoutEditorProps) {
  useHistoryShortcuts({ canUndo, canRedo, undo: onUndo, redo: onRedo });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [newCount, setNewCount] = useState(0);
  // 定義ファイルから取り込んだ、保存していない新しい配列の下書き
  const [imported, setImported] = useState<{ readonly content: KanaLayoutContent; readonly warnings: readonly string[] } | undefined>(undefined);
  const [importError, setImportError] = useState<{ readonly message: string; readonly romajiLayout: boolean } | undefined>(undefined);

  const editable = useMemo(() => layouts.filter(isFaceUserLayout), [layouts]);

  // 選んでいた配列が元に戻すなどで無くなった時は、先頭の配列（無ければ新規作成）に移る
  const layout = selectedId === NEW ? undefined : (editable.find((candidate) => candidate.id === selectedId) ?? editable[0]);
  const isNew = layout === undefined;

  const initial = useMemo(() => {
    if (layout !== undefined) return draftOf(contentOfFaceLayout(layout));
    return imported === undefined ? blankFaceLayoutDraft() : draftOf(imported.content);
  }, [layout, imported]);
  const formKey = layout === undefined ? `new:${newCount}` : `${layout.id}:${JSON.stringify(initial)}`;

  const submit = (content: KanaLayoutContent) => {
    if (layout === undefined) {
      const id = newUserLayoutId();
      onCreate(id, content);
      setImported(undefined);
      setSelectedId(id);
    } else {
      onUpdate(layout.id, content);
    }
  };

  const importFile = async (file: File) => {
    const result = importKanaLayoutFile(file.name, await file.arrayBuffer());
    if (!result.ok) {
      setImportError({ message: result.message, romajiLayout: result.romajiLayout === true });
      return;
    }
    setImportError(undefined);
    setImported({ content: result.content, warnings: result.warnings });
    setSelectedId(NEW);
    setNewCount((count) => count + 1);
  };

  return (
    <article className="kana-layout" data-kana-layout-editor>
      <h1>{KANA_LAYOUT_LABEL}</h1>
      <p className="kana-layout-note">面ごとに、切り替えのキーと打鍵の順序、キーごとの出力を決めて、かな配列を自作します。</p>
      <div className="kana-layout-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          元に戻す
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>
          やり直す
        </button>
      </div>
      {!ready ? null : (
        <>
          <div className="kana-layout-actions">
            {editable.length === 0 ? null : (
              <label>
                編集する配列
                <select value={layout?.id ?? NEW} data-kana-pick onChange={(event) => setSelectedId(event.currentTarget.value)}>
                  {editable.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {isNew ? <option value={NEW}>新しい配列</option> : null}
                </select>
              </label>
            )}
            <button
              type="button"
              data-kana-create
              onClick={() => {
                setImported(undefined);
                setImportError(undefined);
                setSelectedId(NEW);
                setNewCount((count) => count + 1);
              }}
            >
              新規作成
            </button>
            <label>
              DvorakJ・紅皿の定義ファイル
              <input
                type="file"
                accept=".txt,.bnz,.ini,.vil"
                data-kana-import-file
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  // 同じファイルをもう一度選んでも変更として届くように、選択を空に戻す
                  if (file !== undefined) void importFile(file).finally(() => (input.value = ''));
                }}
              />
            </label>
          </div>
          {importError === undefined ? null : (
            <p className="kana-layout-error" role="alert" data-kana-file-import="error">
              {importError.message}
              {importError.romajiLayout ? <RomajiLayoutLink>ローマ字配列の画面を開く</RomajiLayoutLink> : null}
            </p>
          )}
          {imported === undefined || !isNew ? null : (
            <div data-kana-file-import="ok">
              <p className="kana-layout-note" role="status">
                定義ファイルから開いた、保存していない配列です。
              </p>
              {imported.warnings.length === 0 ? null : (
                <ul className="kana-layout-problems" data-kana-file-warnings>
                  {imported.warnings.map((warning) => (
                    <li key={warning} className="kana-layout-warning" role="status">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <h2>{isNew ? '新しい配列' : layout.name}</h2>
          <KanaLayoutForm key={formKey} initial={initial} fingerAssignments={fingerAssignments} isNew={isNew} onSubmit={submit} onDownload={onDownload} />
        </>
      )}
    </article>
  );
}
