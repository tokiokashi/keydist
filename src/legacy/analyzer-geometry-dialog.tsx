import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  buildGeometry,
  FINGERS,
  keyId,
  type Finger,
  type NonThumb,
  type PhysicalShape,
} from '#input/shapes/geometry.ts';
import type { AnalyzerGeometryEditorModel } from './analyzer-geometry-editor-model.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import { clonePhysicalShape } from '#input/shapes/settings.ts';
import {
  fromDisplayUnits,
  toDisplayUnits,
  type GeometryUnit,
} from '#input/shapes/units.ts';

const FINGER_NAMES: Record<Finger, string> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差指', LT: '左親指',
  RT: '右親指', RI: '右人差指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

const ROW_NAMES = ['数字段', '上段', 'ホーム段', '下段'];

function fieldValue(value: string, fallback: number): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function displayValue(value: number, pitchMm: number, unit: GeometryUnit): number {
  return toDisplayUnits(value, pitchMm, unit);
}

function shapeValue(
  value: string,
  fallback: number,
  pitchMm: number,
  unit: GeometryUnit,
): number | undefined {
  const parsed = fieldValue(value, displayValue(fallback, pitchMm, unit));
  return parsed === undefined ? undefined : fromDisplayUnits(parsed, pitchMm, unit);
}

function shortFinger(finger: Finger): string {
  return FINGER_NAMES[finger].replace(/^右|^左/, '').slice(0, 1);
}

function GeometryNumber({
  label,
  value,
  onInput,
  min,
  max,
  step = '0.01',
  onChange,
}: {
  label: string;
  value: number | undefined;
  onInput(value: string): void;
  min?: string;
  max?: string;
  step?: string;
  onChange?(): void;
}) {
  return (
    <label className="geometry-number">
      <span>{label}</span>
      <input
        type="number"
        defaultValue={value === undefined ? '' : String(value)}
        step={step}
        min={min}
        max={max}
        onInput={(event) => onInput(event.currentTarget.value)}
        onChange={onChange}
      />
    </label>
  );
}

export function AnalyzerGeometryDialog({
  dialog,
  stateOwner,
  model,
}: {
  dialog: HTMLDialogElement;
  stateOwner: AnalyzerUiStateOwner;
  model: AnalyzerGeometryEditorModel;
}) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const modelSnapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const shapeDraft = useRef<PhysicalShape>(
    clonePhysicalShape(state.conditions.geometrySettings.shape),
  );
  const [shapeUnit, setShapeUnit] = useState<GeometryUnit>('mm');
  const [shapeRevision, setShapeRevision] = useState(0);
  const [shapeName, setShapeName] = useState(shapeDraft.current.name);
  const [paintFinger, setPaintFinger] = useState<NonThumb>('LP');
  const [error, setError] = useState('');

  useEffect(() => {
    shapeDraft.current = clonePhysicalShape(
      stateOwner.getSnapshot().conditions.geometrySettings.shape,
    );
    setShapeUnit('mm');
    setShapeName(shapeDraft.current.name);
    setError('');
    setShapeRevision((revision) => revision + 1);
  }, [modelSnapshot.refreshRevision, stateOwner]);

  const persistedShape = state.conditions.geometrySettings.shape;
  const assignment = state.conditions.geometrySettings.assignment;
  const editable = modelSnapshot.userShapes.some((shape) => shape.id === persistedShape.id);
  const shape = shapeDraft.current;
  const unitLabel = shapeUnit === 'mm' ? 'mm' : 'u';
  const numberOptions = shapeUnit === 'mm'
    ? { min: '-600', max: '600' }
    : { min: '-32', max: '32' };
  const rowStagger = shape.rowStagger ?? ROW_NAMES.map(() => 0);
  const columnStagger = shape.columnStagger ?? shape.rowWidths.map(() => 0);
  const columnCount = Math.max(...shape.rowWidths, columnStagger.length);
  const assignmentColumnCount = Math.max(...persistedShape.rowWidths);
  const geometry = buildGeometry(persistedShape, assignment);

  const saveShape = (asNew: boolean) => {
    const message = model.saveShape(shapeDraft.current, shapeName, asNew);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    dialog.close();
  };

  return (
    <form method="dialog" id="geometry-form" data-react-feature="geometry-dialog">
      <div className="dialog-head">
        <h2>形状と運指の設定</h2>
        <button type="submit" value="cancel" className="ghost close">閉じる</button>
      </div>
      <p className="note">
        物理形状は内部ではキーピッチ単位 [u] で保存します。段ずれ・列オフセット・親指位置・分割間隔は、現在のピッチを使ってmm表示にも切り替えられます。
      </p>
      <label className="ctl">
        <span>形状名</span>
        <input
          type="text"
          id="geometry-modal-name"
          value={shapeName}
          onChange={(event) => setShapeName(event.currentTarget.value)}
        />
      </label>
      <label className="ctl">
        <span>数値の表示単位</span>
        <select
          id="geometry-modal-unit"
          value={shapeUnit}
          onChange={(event) => {
            setShapeUnit(event.currentTarget.value as GeometryUnit);
            setShapeRevision((revision) => revision + 1);
          }}
        >
          <option value="mm">mm（実測値）</option>
          <option value="u">u（キーピッチ単位）</option>
        </select>
      </label>

      <div id="geometry-modal-editor">
        <div
          className="geometry-fields"
          key={`${shapeUnit}-${shapeRevision}`}
        >
          <h3>物理形状の数値</h3>
          <GeometryNumber
            label="ピッチ [mm]"
            value={shape.pitchMm}
            min="1"
            max="100"
            onInput={(value) => {
              const parsed = fieldValue(value, shape.pitchMm);
              if (parsed !== undefined && parsed >= 1 && parsed <= 100) {
                shape.pitchMm = parsed;
              }
            }}
            onChange={() => setShapeRevision((revision) => revision + 1)}
          />

          <h4>段ずれ量 [{unitLabel}]</h4>
          <div className="geometry-number-grid">
            {ROW_NAMES.map((rowName, index) => (
              <GeometryNumber
                key={rowName}
                label={rowName}
                value={displayValue(rowStagger[index] ?? 0, shape.pitchMm, shapeUnit)}
                min={numberOptions.min}
                max={numberOptions.max}
                onInput={(value) => {
                  const parsed = shapeValue(
                    value,
                    rowStagger[index] ?? 0,
                    shape.pitchMm,
                    shapeUnit,
                  );
                  if (parsed !== undefined) {
                    shape.rowStagger = [...(shape.rowStagger ?? ROW_NAMES.map(() => 0))];
                    shape.rowStagger[index] = parsed;
                  }
                }}
              />
            ))}
          </div>

          <h4>列オフセット [{unitLabel}]</h4>
          <div className="geometry-number-grid geometry-column-grid">
            {Array.from({ length: columnCount }, (_, column) => (
              <GeometryNumber
                key={column}
                label={`列${column + 1}`}
                value={displayValue(
                  columnStagger[column] ?? 0,
                  shape.pitchMm,
                  shapeUnit,
                )}
                min={numberOptions.min}
                max={numberOptions.max}
                onInput={(value) => {
                  const parsed = shapeValue(
                    value,
                    columnStagger[column] ?? 0,
                    shape.pitchMm,
                    shapeUnit,
                  );
                  if (parsed !== undefined) {
                    shape.columnStagger = [
                      ...(shape.columnStagger ?? Array.from({ length: columnCount }, () => 0)),
                    ];
                    while (shape.columnStagger.length < columnCount) {
                      shape.columnStagger.push(0);
                    }
                    shape.columnStagger[column] = parsed;
                  }
                }}
              />
            ))}
          </div>

          <h4>親指キーの位置 [{unitLabel}]</h4>
          <div className="geometry-thumb-grid">
            {(['LT', 'RT'] as const).flatMap((finger) => {
              const thumb = shape.thumbs.find((candidate) => candidate.finger === finger);
              if (!thumb) return [];
              return [(
                <div className="geometry-thumb-row" key={finger}>
                  <span>{FINGER_NAMES[finger]}</span>
                  <GeometryNumber
                    label="列"
                    value={displayValue(thumb.col, shape.pitchMm, shapeUnit)}
                    min={numberOptions.min}
                    max={numberOptions.max}
                    onInput={(value) => {
                      const parsed = shapeValue(
                        value,
                        thumb.col,
                        shape.pitchMm,
                        shapeUnit,
                      );
                      if (parsed !== undefined) {
                        const target = shape.thumbs.find(
                          (candidate) => candidate.finger === finger,
                        );
                        if (target) target.col = parsed;
                      }
                    }}
                  />
                  <GeometryNumber
                    label="段"
                    value={displayValue(thumb.y, shape.pitchMm, shapeUnit)}
                    min={numberOptions.min}
                    max={numberOptions.max}
                    onInput={(value) => {
                      const parsed = shapeValue(
                        value,
                        thumb.y,
                        shape.pitchMm,
                        shapeUnit,
                      );
                      if (parsed !== undefined) {
                        const target = shape.thumbs.find(
                          (candidate) => candidate.finger === finger,
                        );
                        if (target) target.y = parsed;
                      }
                    }}
                  />
                </div>
              )];
            })}
          </div>

          <h4>分割間隔（任意）</h4>
          <div className="geometry-number-grid">
            <GeometryNumber
              label="開始列"
              value={shape.splitAt}
              min="0"
              max="32"
              step="1"
              onInput={(value) => {
                shape.splitAt = fieldValue(value, 0);
              }}
            />
            <GeometryNumber
              label={`間隔 [${unitLabel}]`}
              value={shape.splitGap === undefined
                ? undefined
                : displayValue(shape.splitGap, shape.pitchMm, shapeUnit)}
              min={numberOptions.min}
              max={numberOptions.max}
              onInput={(value) => {
                shape.splitGap = shapeValue(
                  value,
                  shape.splitGap ?? 0,
                  shape.pitchMm,
                  shapeUnit,
                );
              }}
            />
          </div>
        </div>

        <div className="assignment-fields">
          <h3>指の割り当て</h3>
          <label className="ctl">
            <span>キー単位の上書き</span>
            <select
              value={paintFinger}
              onChange={(event) => setPaintFinger(event.currentTarget.value as NonThumb)}
            >
              {FINGERS.map((finger) => (
                <option key={finger} value={finger}>{FINGER_NAMES[finger]}</option>
              ))}
            </select>
          </label>

          <h4>列単位の一括指定</h4>
          <div className="assignment-columns">
            {Array.from({ length: assignmentColumnCount }, (_, column) => {
              const ids = persistedShape.rowWidths
                .map((width, row) => width > column ? keyId(row, column) : undefined)
                .filter((id): id is string => id !== undefined);
              if (ids.length === 0) return null;
              const values = ids.map((id) => assignment.keyFinger[id]);
              const first = values[0];
              const value = values.every((candidate) => candidate === first) ? first : '';
              return (
                <select
                  key={column}
                  title={`列${column + 1}を一括指定`}
                  value={value}
                  onChange={(event) => {
                    const finger = event.currentTarget.value;
                    if (FINGERS.includes(finger as NonThumb)) {
                      model.assignColumn(ids, finger as NonThumb);
                    }
                  }}
                >
                  <option value="">{`列${column + 1}`}</option>
                  {FINGERS.map((finger) => (
                    <option key={finger} value={finger}>{FINGER_NAMES[finger]}</option>
                  ))}
                </select>
              );
            })}
          </div>

          <h4>キー単位（クリックしたキーを選択中の指へ割り当て）</h4>
          <div className="assignment-keyboard">
            {geometry.grid.map((row, rowIndex) => (
              <div className="assignment-keyboard-row" key={rowIndex}>
                {row.map((key) => (
                  <button
                    key={key.id}
                    type="button"
                    className="assignment-key"
                    data-finger={key.finger}
                    title={`${key.id}: ${FINGER_NAMES[key.finger]}`}
                    onClick={() => model.assignKey(key.id, paintFinger)}
                  >
                    {key.id} · {shortFinger(key.finger)}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="note">
            ホームキーは配列側に紐づきます。配列追加時に指定しない場合は物理形状の既定値を使います。
          </p>
        </div>

        <div className="geometry-actions">
          <button type="button" className="ghost" onClick={() => model.resetAssignment()}>
            運指を既定に戻す
          </button>
        </div>
      </div>

      <p className="error" id="geometry-modal-error" hidden={!error}>{error}</p>
      <div className="dialog-actions">
        <button
          type="button"
          className="ghost"
          id="geometry-modal-delete"
          disabled={!editable}
          onClick={() => {
            if (model.deleteCurrentShape()) dialog.close();
          }}
        >
          このカスタム形状を削除
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="secondary"
          id="geometry-modal-save-as"
          onClick={() => saveShape(true)}
        >
          名前を付けて保存
        </button>
        <button
          type="button"
          id="geometry-modal-save"
          disabled={!editable}
          onClick={() => saveShape(false)}
        >
          上書き保存
        </button>
      </div>
    </form>
  );
}
