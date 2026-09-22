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
import {
  aggregationLegendMap,
  aggregationTriggerKeys,
  compactLayerGuideDefinitions,
  presentationTriggerColorSlots,
  semanticCombinationLabels,
} from '../../layers.ts';
import {
  allLayerTriggerKeys,
  matchKeyPatterns,
  summarizeCandidateMatches,
} from '../../key-pattern-picker.ts';
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
  const [showDynamicGuide, setShowDynamicGuide] = useState(true);
  const [showLayerGuide, setShowLayerGuide] = useState(true);
  const [showTriggerColors, setShowTriggerColors] = useState(true);
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
  const activeGroupIds = session.presentation.activeAggregationGroupIds;
  const activeDefinitions = useMemo(() => {
    const byId = new Map((layout.layerDefinitions ?? []).map((definition) => [definition.id, definition] as const));
    return activeGroupIds.flatMap((id) => {
      const definition = byId.get(id);
      return definition === undefined ? [] : [definition];
    });
  }, [activeGroupIds, layout]);
  const activeTriggerKeys = useMemo(
    () => new Set(activeGroupIds.flatMap((id) => aggregationTriggerKeys(layout, id))),
    [activeGroupIds, layout],
  );
  const triggerKeys = useMemo(() => allLayerTriggerKeys(layout), [layout]);
  const triggerColorSlots = useMemo(
    () => presentationTriggerColorSlots(layout),
    [layout],
  );
  const comboKeys = useMemo(
    () => new Set(
      (layout.resolvedComboDefinitions ?? []).flatMap((combo) =>
        (combo.keyVariants ?? [combo.keys]).flatMap((keys) => keys)),
    ),
    [layout],
  );
  const patternResult = useMemo(
    () => matchKeyPatterns(layout, new Set(session.presentation.selectedKeys)),
    [layout, session.presentation.selectedKeys],
  );
  const hasOneShotLayer = session.presentation.oneShotActivations.length > 0;
  const keyboardViews = useMemo(() => {
    const pressed = new Set(session.pressedKeys);
    const selected = new Set(session.presentation.selectedKeys);
    const hasDynamicPath = showDynamicGuide && selected.size > 0;
    return new Map<string, PhysicalKeyboardKeyView>(
      visibleKeys.map((key) => {
        const outputs = showDynamicGuide
          ? patternResult.candidates.get(key.id)
          : undefined;
        const canContinue = showDynamicGuide
          && patternResult.continuations.has(key.id);
        const guide = outputs !== undefined
          ? 'output' as const
          : canContinue
            ? 'continuation' as const
            : undefined;
        const guideLegend = outputs === undefined
          ? undefined
          : summarizeCandidateMatches(outputs);

        return [
          key.id,
          {
            legend: guideLegend
              ?? (hasDynamicPath
                ? selected.has(key.id) || hasOneShotLayer
                  ? layout.legends.get(key.id) ?? ''
                  : ''
                : layout.legends.get(key.id) ?? ''),
            secondaryLegend: key.id === THUMB_KEY.LT
              ? 'NonConvert'
              : key.id === THUMB_KEY.RT
                ? 'Space / Convert'
                : key.id,
            pressed: pressed.has(key.id),
            highlighted: showDynamicGuide && activeTriggerKeys.has(key.id),
            trigger: showTriggerColors && triggerKeys.has(key.id),
            combo: showTriggerColors && comboKeys.has(key.id),
            accentSlot: showTriggerColors ? triggerColorSlots.get(key.id) : undefined,
            guide,
          },
        ] as const;
      }),
    );
  }, [
    activeTriggerKeys,
    comboKeys,
    hasOneShotLayer,
    layout,
    patternResult,
    session.pressedKeys,
    showDynamicGuide,
    showTriggerColors,
    triggerColorSlots,
    triggerKeys,
    visibleKeys,
  ]);
  const guideDefinitions = useMemo(
    () => compactLayerGuideDefinitions(layout),
    [layout],
  );
  const combinationLabels = useMemo(() => {
    const layerLabels = new Set(guideDefinitions.map((definition) => definition.label));
    return semanticCombinationLabels(layout)
      .filter((label) => !layerLabels.has(label));
  }, [guideDefinitions, layout]);

  return (
    <section
      className="feature-shell input-feature"
      data-input-ready={session.readyLayoutId === layout.id ? layout.id : undefined}
      data-active-layer={activeGroupIds.length > 0 ? activeGroupIds.join('|') : 'single'}
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

      <div className="input-display-options" aria-label="表示設定">
        <strong>表示</strong>
        <label>
          <input
            type="checkbox"
            checked={showDynamicGuide}
            onChange={(event) => setShowDynamicGuide(event.target.checked)}
          />
          動的ガイド
        </label>
        <label>
          <input
            type="checkbox"
            checked={showLayerGuide}
            onChange={(event) => setShowLayerGuide(event.target.checked)}
          />
          レイヤーカンペ
        </label>
        <label>
          <input
            type="checkbox"
            checked={showTriggerColors}
            onChange={(event) => setShowTriggerColors(event.target.checked)}
          />
          起点キー色
        </label>
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

      <p
        className="input-active-layer"
        data-active={activeDefinitions.length > 0 || undefined}
      >
        <span>現在のレイヤー</span>
        <strong>
          {activeDefinitions.length > 0
            ? activeDefinitions.map((definition) => definition.label).join(' / ')
            : '通常'}
        </strong>
      </p>

      <div className="input-keyboard-stage">
        <div className="input-keyboard-main">
          <PhysicalKeyboard
            ariaLabel="現在の物理キー状態"
            geometryId={geometry.id}
            keys={visibleKeys}
            keyViews={keyboardViews}
          />
        </div>

      {showLayerGuide && (guideDefinitions.length > 0 || combinationLabels.length > 0) ? (
        <aside className="input-layer-guide" aria-label="レイヤーカンペ一覧">
          <header>
            <strong>レイヤーカンペ</strong>
            <span>{guideDefinitions.length} 面</span>
          </header>
          {combinationLabels.length > 0 ? (
            <div className="input-semantic-groups" aria-label="意味論的な組み合わせ">
              {combinationLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : null}
          <div className="input-layer-guide-grid">
            {guideDefinitions.map((definition) => {
              const legends = aggregationLegendMap(layout, definition.id);
              const triggers = new Set(aggregationTriggerKeys(layout, definition.id));
              const views = new Map<string, PhysicalKeyboardKeyView>(
                visibleKeys.map((key) => [
                  key.id,
                  {
                    legend: legends.get(key.id) ?? '',
                    highlighted: triggers.has(key.id),
                    trigger: triggers.has(key.id),
                    accentSlot: presentationTriggerColorSlots(layout).get(key.id),
                  },
                ]),
              );
              return (
                <section className="input-layer-card" key={definition.id}>
                  <h3>
                    {definition.label}
                    {definition.presentationModeLabel
                      ? <small>{definition.presentationModeLabel}</small>
                      : null}
                  </h3>
                  <p>
                    {triggers.size > 0
                      ? `trigger: ${[...triggers].map((key) => layout.legends.get(key) ?? key).join(' + ')}`
                      : 'trigger: —'}
                  </p>
                  <PhysicalKeyboard
                    ariaLabel={`${definition.label} レイヤー`}
                    geometryId={geometry.id}
                    keys={visibleKeys}
                    keyViews={views}
                    showSecondary={false}
                    unit={28}
                  />
                </section>
              );
            })}
          </div>
        </aside>
      ) : null}
      </div>

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
