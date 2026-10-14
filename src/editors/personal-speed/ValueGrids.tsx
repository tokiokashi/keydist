import type { CSSProperties } from 'react';
import { FINGERS, type NonThumb } from '#input/shapes/geometry.ts';
import { calibrationOverheadFieldId } from '#interpretation/timing/calibration-form.ts';
import type { CalibrationTask } from '#interpretation/timing/calibration-session.ts';
import {
  calibrationFieldLabel,
  calibrationFieldUnit,
  fingerHeading,
  OVERHEAD_TABLE_COLUMNS,
  OVERHEAD_TABLE_ROWS,
  DEVIATION_LEGEND,
  DEVIATION_READING,
  UNAVAILABLE_LEGEND,
  UNMEASURABLE_ROW_HINT,
} from './calibration-text.ts';
import { gridDeviations, type CellDeviation, type DeviationKind } from './grid-deviation.ts';

/** 欄の右に出す操作。測るボタンか、測れない・別の測定で求まる理由の文。 */
export type RowAction =
  | { readonly kind: 'measure'; readonly tasks: readonly CalibrationTask[] }
  | { readonly kind: 'hint'; readonly text: string }
  | { readonly kind: 'none' };

/** 表のマスが読む、編集の状態と操作。 */
export interface GridContext {
  /** 欄の識別子ごとの入力中の値。 */
  readonly values: Readonly<Record<string, string>>;
  /** 欄の識別子ごとの保存値。保存値を持たない欄は含まない。 */
  readonly saved: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly disabled: boolean;
  readonly action: (fieldId: string) => RowAction;
  readonly onChange: (fieldId: string, value: string) => void;
  readonly onCommit: (fieldId: string) => void;
  readonly onMeasure: (tasks: readonly CalibrationTask[]) => void;
}

/**
 * 表の1マス。数値を直接編集でき、欄を確定した時（欄から離れた時・Enter）に保存する。
 * 測れる欄は、マスの中の測るボタンでその欄の値だけを測り直す。測れない欄は、マスの中にその旨を出す。
 * 入力の誤りは、マスの中の入力欄の下に出す。保存値を持たないマスは、保存値を持つマスと見た目を分ける。
 * 同じ表の中央値から外れた保存値のマスは、遅い側・速い側の色を付け、読み上げにも同じ内容を添える。
 */
function ValueCell({ fieldId, ctx, deviation }: { readonly fieldId: string; readonly ctx: GridContext; readonly deviation?: CellDeviation | undefined }) {
  const fullLabel = calibrationFieldLabel(fieldId);
  const inputId = `personal-speed-${fieldId}`;
  const errorId = `${inputId}-error`;
  const deviationId = `${inputId}-deviation`;
  const value = ctx.values[fieldId] ?? '';
  const error = ctx.errors[fieldId];
  const measured = value.trim() !== '';
  const action = ctx.action(fieldId);
  return (
    <td
      className={`personal-speed-cell${fieldId in ctx.saved ? '' : ' personal-speed-cell-unmeasured'}${deviation === undefined ? '' : ` personal-speed-cell-${deviation.direction}`}`}
      data-personal-speed-row={fieldId}
      data-personal-speed-deviation={deviation?.direction}
      style={deviation === undefined ? undefined : ({ '--deviation': deviation.intensity.toFixed(3) } as CSSProperties)}
    >
      <input
        id={inputId}
        type="text"
        inputMode={fieldId.startsWith('overhead:') ? 'text' : 'decimal'}
        autoComplete="off"
        aria-label={fullLabel}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={[deviation === undefined ? undefined : deviationId, error === undefined ? undefined : errorId].filter((id) => id !== undefined).join(' ') || undefined}
        value={value}
        disabled={ctx.disabled}
        onChange={(event) => ctx.onChange(fieldId, event.currentTarget.value)}
        onBlur={() => ctx.onCommit(fieldId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) ctx.onCommit(fieldId);
        }}
      />
      {deviation === undefined ? null : <span className="personal-speed-visually-hidden" id={deviationId}>{DEVIATION_READING[deviation.direction]}</span>}
      {action.kind === 'measure' ? (
        <button
          type="button"
          disabled={ctx.disabled}
          aria-label={`${fullLabel}だけを${measured ? '測り直す' : '測る'}`}
          onClick={() => ctx.onMeasure(action.tasks)}
        >
          {measured ? '測り直す' : '測る'}
        </button>
      ) : null}
      {action.kind === 'hint' ? <span className="personal-speed-row-hint">{action.text}</span> : null}
      {error === undefined ? null : <p className="personal-speed-field-error" id={errorId} role="alert">{error}</p>}
    </td>
  );
}

/** 組が成り立たないマス（対角と、三角の使わない側）。 */
function BlankCell() {
  return <td className="personal-speed-cell personal-speed-cell-blank" aria-hidden="true" />;
}

/** 選んだキーでは測れず、保存値も無い組のマス。入力欄を出さない。 */
function UnavailableCell({ fieldId }: { readonly fieldId: string }) {
  return (
    <td className="personal-speed-cell personal-speed-cell-unavailable" data-personal-speed-unavailable={fieldId}>
      <span role="img" aria-label={`${calibrationFieldLabel(fieldId)}: ${UNMEASURABLE_ROW_HINT}`}>―</span>
    </td>
  );
}

/** 指×指の表で、そのマスに入力欄を出すか。測れる組か、保存している組。 */
function cellHasField(fieldId: string, ctx: GridContext): boolean {
  return fieldId in ctx.saved || ctx.action(fieldId).kind === 'measure';
}

const HANDS: readonly { readonly hand: 'L' | 'R'; readonly label: string; readonly fingers: readonly NonThumb[] }[] = [
  { hand: 'L', label: '左手', fingers: FINGERS.filter((finger) => finger.startsWith('L')) },
  { hand: 'R', label: '右手', fingers: FINGERS.filter((finger) => finger.startsWith('R')) },
];

/** 行の指と列の指のマスが持つ欄の識別子。組が成り立たないマスは`undefined`。 */
type PairFieldId = (row: NonThumb, column: NonThumb) => string | undefined;

/** 順序なしの組。`FINGERS`の並びで先の指を行、後の指を列にした時だけ、欄を持つ。 */
const unorderedPairField: PairFieldId = (row, column) =>
  FINGERS.indexOf(row) < FINGERS.indexOf(column) ? `same-hand-pair:${row}:${column}` : undefined;

/** 方向つきの組。行を前の指、列を次の指にする。同じ指どうしは欄を持たない。 */
const directedPairField: PairFieldId = (row, column) => (row === column ? undefined : `directed-pair:${row}>${column}`);

interface FingerGridsProps {
  readonly ctx: GridContext;
  readonly fieldOf: PairFieldId;
  readonly unit: string;
  readonly corner: string;
  /** 行と列が何かの説明。向きのある表で、見出しの見える位置に添える。 */
  readonly axes?: string;
  readonly kind: DeviationKind;
}

/**
 * 左右の手ごとの、指×指の表。欄を出すマスが1つも無い手の表は出さず、どちらの手にも無ければ何も出さない。
 * 選んだキーでは測れないマスが表にあれば、凡例を添える。
 */
function FingerGrids({ ctx, fieldOf, unit, corner, axes, kind }: FingerGridsProps) {
  const shown = HANDS.filter(({ fingers }) => fingers.some((row) => fingers.some((column) => {
    const fieldId = fieldOf(row, column);
    return fieldId !== undefined && cellHasField(fieldId, ctx);
  })));
  let hasUnavailable = false;
  const deviations = gridDeviations(kind, ctx.saved);
  const tables = shown.map(({ hand, label, fingers }) => (
    <div className="personal-speed-grid-wrap" key={hand}>
      <table className="personal-speed-grid" data-personal-speed-grid={`${kind}:${hand}`}>
        <caption>{label}（単位: {unit}{axes === undefined ? '' : `。${axes}`}）</caption>
        <thead>
          <tr>
            <th scope="col"><span className="personal-speed-visually-hidden">{corner}</span></th>
            {fingers.map((column) => <th key={column} scope="col">{fingerHeading(column)}</th>)}
          </tr>
        </thead>
        <tbody>
          {fingers.map((row) => (
            <tr key={row}>
              <th scope="row">{fingerHeading(row)}</th>
              {fingers.map((column) => {
                const fieldId = fieldOf(row, column);
                if (fieldId === undefined) return <BlankCell key={column} />;
                if (cellHasField(fieldId, ctx)) return <ValueCell key={column} fieldId={fieldId} ctx={ctx} deviation={deviations.get(fieldId)} />;
                hasUnavailable = true;
                return <UnavailableCell key={column} fieldId={fieldId} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ));
  if (tables.length === 0) return null;
  return (
    <>
      {tables}
      {deviations.size === 0 ? null : (
        <p className="personal-speed-note personal-speed-deviation-legend">
          <span className="personal-speed-deviation-swatch personal-speed-deviation-swatch-slow" aria-hidden="true" />
          <span className="personal-speed-deviation-swatch personal-speed-deviation-swatch-fast" aria-hidden="true" />
          {DEVIATION_LEGEND}
        </p>
      )}
      {hasUnavailable ? <p className="personal-speed-note">{UNAVAILABLE_LEGEND}</p> : null}
    </>
  );
}

/** 指×指の表を出せる欄（測れる組か、保存している組）が1つでもあるか。無ければ表を出さず、まだ測っていない旨を出す。 */
export function hasFingerGridFields(kind: 'same-hand-pair' | 'directed-pair', ctx: GridContext): boolean {
  const fieldOf = kind === 'same-hand-pair' ? unorderedPairField : directedPairField;
  return HANDS.some(({ fingers }) => fingers.some((row) => fingers.some((column) => {
    const fieldId = fieldOf(row, column);
    return fieldId !== undefined && cellHasField(fieldId, ctx);
  })));
}

/** 同手・別指の組ごとの速度。組に順序は無いので、表の片側の三角だけを使う。 */
export function SameHandPairGrids({ ctx }: { readonly ctx: GridContext }) {
  return <FingerGrids ctx={ctx} fieldOf={unorderedPairField} unit={calibrationFieldUnit('same-hand-pair:LP:LR')} corner="指" kind="same-hand-pair" />;
}

/** 同手・別指の方向別の速度。行が前の指、列が次の指。 */
export function DirectedPairGrids({ ctx }: { readonly ctx: GridContext }) {
  return <FingerGrids ctx={ctx} fieldOf={directedPairField} unit={calibrationFieldUnit('directed-pair:LP>LR')} corner="前の指（行）と次の指（列）" axes="行が前の指、列が次の指" kind="directed-pair" />;
}

/** 保存した打鍵の上乗せ。行が差の種類、列が全体・かなの中・かなの境目。保存していない種類も、空の欄から値を足せる。 */
export function OverheadGrid({ ctx }: { readonly ctx: GridContext }) {
  return (
    <div className="personal-speed-grid-wrap">
      <table className="personal-speed-grid" data-personal-speed-grid="overhead">
        <caption>単位: {calibrationFieldUnit('overhead:arpeggio')}</caption>
        <thead>
          <tr>
            <th scope="col"><span className="personal-speed-visually-hidden">種類</span></th>
            {OVERHEAD_TABLE_COLUMNS.map(({ part, label }) => <th key={part} scope="col">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {OVERHEAD_TABLE_ROWS.map(({ label, kinds }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {OVERHEAD_TABLE_COLUMNS.map(({ part }) => {
                const kind = kinds[part];
                return kind === undefined
                  ? <BlankCell key={part} />
                  : <ValueCell key={part} fieldId={calibrationOverheadFieldId(kind)} ctx={ctx} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
