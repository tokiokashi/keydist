import { useEffect, useMemo, useState } from 'react';
import {
  PhysicalKeyboard,
  type PhysicalKeyboardKeyView,
} from '../../components/physical-keyboard.tsx';
import {
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  isPresetGeometryKind,
  PHYSICAL_SHAPES,
  THUMB_KEY,
  type PhysicalShape,
} from '../../geometry.ts';
import {
  sanitizeGeometrySettings,
} from '../../geometry-settings.ts';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '../../layouts/index.ts';
import {
  physicalKeysUsedByLayout,
  visibleGeometryKeys,
} from '../../layout-physical-keys.ts';
import { load as loadUserGeometryShapes } from '../../user-geometries.ts';
import { useTypingSession } from './use-typing-session.ts';

const DIRECT_JA_INPUT_LAYOUTS =
  LAYOUTS_JA.filter((layout) => layout.romajiTable === undefined);

const INPUT_LAYOUTS = [
  ...LAYOUTS,
  ...DIRECT_JA_INPUT_LAYOUTS,
];

const PRESET_GEOMETRY_SHAPES = Object.values(PHYSICAL_SHAPES);

function RecognizedDetail({
  recognized,
}: {
  recognized: ReturnType<typeof useTypingSession>['lastRecognized'];
}) {
  if (recognized.length === 0) {
    return <p className="input-muted">まだ入力は確定していない。</p>;
  }

  return (
    <div className="input-recognized-list">
      {recognized.map((entry, entryIndex) => (
        <div className="input-recognized" key={entryIndex}>
          <strong>{entry.output}</strong>
          <div>
            {entry.actions.map((action, actionIndex) => (
              <code key={actionIndex}>
                {action.keys.join(' + ')}
                {action.heldKeys.length > 0 ? ` [hold: ${action.heldKeys.join(' + ')}]` : ''}
                {action.holdPhase ? ` ${action.holdPhase}` : ''}
              </code>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InputConverterView() {
  const [layout, setLayout] = useState<Layout>(
    () => DIRECT_JA_INPUT_LAYOUTS[0] ?? INPUT_LAYOUTS[0],
  );
  const session = useTypingSession(layout);
  const [userGeometryShapes, setUserGeometryShapes] = useState<PhysicalShape[]>([]);
  const [geometryId, setGeometryId] = useState(PHYSICAL_SHAPES['row-staggered'].id);
  const escapeIsLayoutInput = physicalKeysUsedByLayout(layout).has('escape');

  useEffect(() => {
    setUserGeometryShapes(loadUserGeometryShapes());
  }, []);

  const geometryShapes = useMemo(
    () => [...PRESET_GEOMETRY_SHAPES, ...userGeometryShapes],
    [userGeometryShapes],
  );
  const selectedShape = geometryShapes.find((shape) => shape.id === geometryId)
    ?? PHYSICAL_SHAPES['row-staggered'];
  const geometry = useMemo(() => {
    if (isPresetGeometryKind(geometryId)) {
      return buildGeometry(geometryId, DEFAULT_FINGER_ASSIGNMENT);
    }
    const settings = sanitizeGeometrySettings({
      shape: selectedShape,
      assignment: DEFAULT_FINGER_ASSIGNMENT,
    });
    return buildGeometry(settings.shape, settings.assignment);
  }, [geometryId, selectedShape]);
  const visibleKeys = useMemo(
    () => visibleGeometryKeys(layout, geometry),
    [geometry, layout],
  );
  const keyboardViews = useMemo(() => {
    const pressed = new Set(session.pressedKeys);
    return new Map<string, PhysicalKeyboardKeyView>(
      visibleKeys.map((key) => [
        key.id,
        {
          legend: layout.legends.get(key.id) ?? key.id,
          secondaryLegend: key.id === THUMB_KEY.LT
            ? 'NonConvert'
            : key.id === THUMB_KEY.RT
              ? 'Space / Convert'
              : key.id,
          pressed: pressed.has(key.id),
        },
      ]),
    );
  }, [layout, session.pressedKeys, visibleKeys]);

  return (
    <section
      className="feature-shell input-feature"
      data-input-ready={session.readyLayoutId === layout.id ? layout.id : undefined}
    >
      <p className="eyebrow">Phase B · #270</p>
      <h1>Input Converter</h1>
      <p>
        選択した配列の canonical SemanticInput を使って、物理キーから文字列を直接生成する。
        お題はなく、ここでは自由に打てる。
      </p>

      <div className="input-toolbar">
        <label>
          <span>配列</span>
          <select
            aria-label="配列"
            value={layout.id}
            onChange={(event) => {
              const next = INPUT_LAYOUTS.find((candidate) => candidate.id === event.target.value);
              if (next !== undefined) setLayout(next);
            }}
          >
            {INPUT_LAYOUTS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>物理配列</span>
          <select
            aria-label="物理配列"
            value={geometryId}
            onChange={(event) => setGeometryId(event.target.value)}
          >
            {PRESET_GEOMETRY_SHAPES.map((shape) => (
              <option key={shape.id} value={shape.id}>{shape.name}</option>
            ))}
            {userGeometryShapes.map((shape) => (
              <option key={shape.id} value={shape.id}>自作: {shape.name}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={session.clear}>クリア</button>
      </div>

      <textarea
        className="input-output"
        value={session.text}
        readOnly
        rows={7}
        aria-label="自由入力テキスト"
        aria-describedby="input-capture-help"
        data-active={session.active || undefined}
        ref={session.captureRef}
        placeholder="ここをクリックして、そのまま打鍵する。"
      />
      <p className="input-capture-hint" id="input-capture-help">
        {session.active ? '入力受付中。' : '入力欄をクリックして入力開始。'}
        {' '}Backspaceで1文字削除、Enterで改行、
        {escapeIsLayoutInput ? 'Escは配列入力として扱う。' : 'Escで入力解除。'}
        {session.composing ? ' IME composition中は認識を停止している。' : ''}
      </p>

      <PhysicalKeyboard
        ariaLabel="現在の物理キー状態"
        geometryId={geometry.id}
        keys={visibleKeys}
        keyViews={keyboardViews}
      />

      <div className="input-inspector">
        <section>
          <h2>Pressed</h2>
          <p>{session.pressedKeys.length > 0 ? session.pressedKeys.join(' + ') : '—'}</p>
        </section>
        <section>
          <h2>Recognized / realized action</h2>
          <RecognizedDetail recognized={session.lastRecognized} />
        </section>
      </div>

      <p className="input-note">
        canonical SemanticInputを使い、通常Shift・単打・prefix / suffix・simultaneous・hold・
        multi-step / composed outputまで実入力で扱う。ローマ字→かな変換や時間依存semanticは
        別能力として必要になった段階で追加する。
      </p>
    </section>
  );
}
