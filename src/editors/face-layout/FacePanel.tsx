import { useMemo, useState } from 'react';
import type { DraftFace, FaceLayoutDraft } from '#input/layouts/face-layout-edit.ts';
import { isFaceOutputKey, type FaceLayoutNotice, type FaceLayoutProblem } from '#input/layouts/kana-face-layout.ts';
import type { LayoutKind } from '#input/layouts/kind.ts';
import type { FaceMode, InputRole, LayerKind, TriggerOrder, TriggerPersistence } from '#input/layouts/types.ts';
import { ROW_LABELS } from '#input/layouts/user-layouts.ts';
import { buildGeometry, DEFAULT_FINGER_ASSIGNMENT, JIS_FINGER_ASSIGNMENT, type Key, type PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import { PhysicalKeyboard, type PhysicalKeyboardKeyView } from '#ui/keyboard/physical-keyboard.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import {
  AGGREGATION_LABEL,
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
import { applyRowOutputs, figureRowKeys, formatRowText, hasQuoteOutput, parseRowText, rowOutputs } from './row-input.ts';
import './face-layout.css';

/** 図に描く物理配列。面の上のキーは、どちらの規格でも同じ刻印のキーに書ける。 */
export const FIGURE_SHAPE: Readonly<Record<PhysicalKeyboardStandard, 'row-staggered' | 'jis-row-staggered'>> = {
  ansi: 'row-staggered',
  jis: 'jis-row-staggered',
};

export const geometryOf = (standard: PhysicalKeyboardStandard) =>
  buildGeometry(FIGURE_SHAPE[standard], standard === 'jis' ? JIS_FINGER_ASSIGNMENT : DEFAULT_FINGER_ASSIGNMENT);

/** 下書きの出力が、ANSIの図に無いキーに置かれている時は、JISの図から始める。 */
export function initialStandard(draft: FaceLayoutDraft): PhysicalKeyboardStandard {
  const ansi = geometryOf('ansi').keys;
  const usesJisKey = draft.faces.some((face) => Object.keys(face.outputs).some((key) => !ansi.has(key)));
  return usesJisKey ? 'jis' : 'ansi';
}

export function ProblemList({ problems, severity }: { readonly problems: readonly FaceLayoutProblem[]; readonly severity: 'error' | 'warning' }) {
  if (problems.length === 0) return null;
  return (
    <ul className="face-layout-problems" data-face-problems={severity}>
      {problems.map((problem) => (
        <li
          key={`${problem.path}:${problem.message}`}
          className={severity === 'error' ? 'face-layout-error' : 'face-layout-warning'}
          role={severity === 'error' ? 'alert' : 'status'}
          data-face-problem={severity}
        >
          <span>{problem.message}</span>
          {problem.path === '' ? null : <code className="face-layout-path">{problem.path}</code>}
          {problem.detail === undefined ? null : (
            <details className="face-layout-detail">
              <summary>詳細（不具合報告用）</summary>
              <pre>{problem.detail}</pre>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

export function NoticeList({ notices }: { readonly notices: readonly FaceLayoutNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="face-layout-problems" data-face-notices>
      {notices.map((notice) => (
        <li key={notice.output} className="face-layout-warning" role="status">
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
        data-face-field={dataName}
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
  readonly kind: LayoutKind;
  readonly face: DraftFace;
  readonly standard: PhysicalKeyboardStandard;
  readonly homeKeys: ReadonlySet<string>;
  readonly problems: readonly FaceLayoutProblem[];
  readonly onChange: (face: DraftFace) => void;
}

/** 選んだ面の編集。キーボードの図の上でキーを選び、出力と切り替えのキーを決める。 */
export function FacePanel({ kind, face, standard, homeKeys, problems, onChange }: FacePanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [operation, setOperation] = useState<'output' | 'trigger'>('output');
  const [announcement, setAnnouncement] = useState('');
  // 段の欄に打っている途中の文字列。解釈できない間も欄に残す。`snapshot` は、その時点の段の出力
  const [rowTexts, setRowTexts] = useState<Readonly<Record<number, { readonly text: string; readonly snapshot: string }>>>({});
  const geometry = useMemo(() => geometryOf(standard), [standard]);
  const keys = useMemo(() => [...geometry.keys.values()], [geometry]);
  const rowKeys = useMemo(
    () =>
      figureRowKeys(
        keys.map((key) => key.id),
        ROW_LABELS.length,
      ),
    [keys],
  );
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

  const rowFields = rowKeys.map((rowKeyList, index) => {
    const outputs = rowOutputs(face, rowKeyList);
    const snapshot = JSON.stringify(outputs);
    const own = rowTexts[index];
    // 図や出力欄で段の出力が変わったら、欄は出力から作り直した文字列に置き換える
    const text = own !== undefined && own.snapshot === snapshot ? own.text : formatRowText(outputs);
    const parsed = parseRowText(text);
    const shown = parsed.ok ? parsed : parseRowText(formatRowText(outputs));
    const used = shown.ok ? shown.outputs.length : 0;
    const over = parsed.ok ? parsed.outputs.length - rowKeyList.length : 0;
    const label = ROW_LABELS[index] ?? '';
    const error = parsed.ok
      ? undefined
      : parsed.reason === 'unclosed'
        ? `${label}の二重引用符が閉じていません。`
        : `${label}に中身のない二重引用符があります。`;
    return { index, label, keys: rowKeyList, text, snapshot, used, over, error, readOnly: hasQuoteOutput(outputs) };
  });

  const setRowText = (index: number, text: string) => {
    const rowKeyList = rowKeys[index] ?? [];
    const parsed = parseRowText(text);
    if (!parsed.ok) {
      setRowTexts({ ...rowTexts, [index]: { text, snapshot: JSON.stringify(rowOutputs(face, rowKeyList)) } });
      return;
    }
    const next = applyRowOutputs(face, rowKeyList, parsed.outputs);
    setRowTexts({ ...rowTexts, [index]: { text, snapshot: JSON.stringify(rowOutputs(next, rowKeyList)) } });
    onChange(next);
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
    <div className="face-layout-face" data-face-panel>
      <fieldset className="face-layout-operation">
        <legend>図のキーで選ぶもの</legend>
        <label className="face-layout-inline">
          <input
            type="radio"
            name="face-operation"
            checked={operation === 'output'}
            data-face-operation="output"
            onChange={() => setOperation('output')}
          />
          出力
        </label>
        <label className="face-layout-inline">
          <input
            type="radio"
            name="face-operation"
            checked={operation === 'trigger'}
            data-face-operation="trigger"
            onChange={() => setOperation('trigger')}
          />
          切り替えのキー
        </label>
      </fieldset>

      <div className="face-layout-figure" data-face-figure>
        <PhysicalKeyboard
          keys={keys}
          keyViews={views}
          ariaLabel="配列のキーボードの図"
          geometryId={FIGURE_SHAPE[standard]}
          unit={56}
          horizontalAlign="left"
          operable
          onKeyClick={onKeyClick}
          onEscape={() => setSelectedKey(undefined)}
        />
      </div>
      {offFigure.length === 0 ? null : <p className="face-layout-note">この図に無いキーの出力があります（{offFigure.join('・')}）。</p>}

      {operation === 'output' ? (
        <div className="face-layout-output">
          <label>
            {selectedKey === undefined ? 'キーの出力' : `${keyLabel(selectedKey, standard)}のキーの出力`}
            <input
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder={selectedKey === undefined ? '図のキーを選ぶ' : kind === 'kana' ? '例: あ' : '例: a'}
              disabled={selectedKey === undefined}
              value={selectedKey === undefined ? '' : (face.outputs[selectedKey] ?? '')}
              data-face-output
              onChange={(event) => selectedKey !== undefined && onChange(setFaceOutput(face, selectedKey, event.currentTarget.value))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                // 配列のformの送信にしない。変換を確定するEnterはそのまま通す
                event.preventDefault();
                advance();
              }}
            />
          </label>
          <span className="face-layout-visually-hidden" role="status" data-face-output-announce>
            {announcement}
          </span>
          <button
            type="button"
            data-face-output-clear
            disabled={selectedKey === undefined || (face.outputs[selectedKey] ?? '') === ''}
            onClick={() => selectedKey !== undefined && onChange(setFaceOutput(face, selectedKey, ''))}
          >
            消す
          </button>
        </div>
      ) : null}

      {operation === 'output' ? (
        <fieldset className="face-layout-rows" data-face-rows>
          <legend className="face-layout-label-row">
            段の文字
            <InfoButton
              name="段の文字"
              description={`段のキーに、左から順に出力を書きます。半角スペースは空きキーで、末尾の空きキーは省けます。2文字以上の出力は半角の二重引用符で囲みます（例: ${kind === 'kana' ? 'あ"きゃ"う' : 'a"qu"b'}）。二重引用符を含む出力は、ここでは書けません。`}
            />
          </legend>
          {rowFields.map((row) => (
            <div key={row.index} className="face-layout-row">
              <label>
                {row.label}
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={row.text}
                  readOnly={row.readOnly}
                  aria-invalid={row.error !== undefined || row.over > 0}
                  data-face-row={row.index}
                  onChange={(event) => setRowText(row.index, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    // 配列のformの送信にしない。変換を確定するEnterはそのまま通す
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
                  }}
                />
              </label>
              <span className="face-layout-count">
                {row.used} / {row.keys.length}
              </span>
              {row.error === undefined ? null : (
                <p className="face-layout-error" role="alert" data-face-row-problem={row.index}>
                  {row.error}
                </p>
              )}
              {row.readOnly ? (
                <p className="face-layout-note" role="status" data-face-row-readonly={row.index}>
                  {row.label}には二重引用符を含む出力があるため、図のキーと出力欄で直してください。
                </p>
              ) : null}
              {row.over <= 0 ? null : (
                <p className="face-layout-error" role="alert" data-face-row-problem={row.index}>
                  {row.label}はキーの数を{row.over}個超えています。超えた分は反映されません。
                </p>
              )}
            </div>
          ))}
        </fieldset>
      ) : null}

      <div className="face-layout-fields">
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
            <span className="face-layout-label-row">
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
              data-face-field="layer"
              aria-invalid={pathsOf('layer')}
              onChange={(event) => onChange(patchFace(face, { layer: event.currentTarget.value === '' ? undefined : event.currentTarget.value }))}
            />
          </label>
        ) : null}
      </div>

      {face.inputRole === 'modifier' && triggered ? (
        <fieldset className="face-layout-groups">
          <legend>
            修飾の組
            <InfoButton name="修飾の組" description="切り替えのキーごとに、属する組の名前を書きます。1つでも書いた時は、すべてのキーに書きます。" />
          </legend>
          {face.trigger.map((key) => (
            <label key={key} className="face-layout-inline">
              {keyLabel(key, standard)}
              <input
                type="text"
                value={face.modifierGroups?.[key] ?? ''}
                data-face-modifier-group={key}
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
