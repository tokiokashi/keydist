import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  PhysicalKeyboard,
  type PhysicalKeyboardKeyView,
} from '../../components/physical-keyboard.tsx';
import {
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  isPresetGeometryKind,
  PHYSICAL_SHAPES,
  SHIFT_KEY,
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
import { JIS_KANA } from '../../layouts/jis-kana.ts';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '../../layouts/index.ts';
import {
  physicalKeysUsedByLayout,
  visibleGeometryKeys,
} from '../../layout-physical-keys.ts';
import { load as loadUserGeometryShapes } from '../../user-geometries.ts';
import {
  DEFAULT_THUMB_KEY_BINDINGS,
  loadThumbKeyBindings,
  saveThumbKeyBindings,
  thumbBindingLabel,
  thumbKeyBindingsToOverrides,
  type ThumbKeyBindings,
} from './browser-keyboard-bindings.ts';
import { ThumbKeyBindingEditor } from './thumb-key-binding-editor.tsx';
import {
  reverseLookup,
  reverseLookupRouteLabel,
} from './reverse-lookup.ts';
import { useTypingSession } from './use-typing-session.ts';

const DIRECT_JA_INPUT_LAYOUTS =
  LAYOUTS_JA.filter((layout) => layout.romajiTable === undefined);
const TK_DIRECT_JA_LAYOUT = LAYOUTS_JA.find(
  (layout) => layout.id === 'oonishi-custom-combo',
);

const INPUT_LAYOUTS = [
  ...LAYOUTS.filter((layout) => layout.id !== 'oonishi-custom'),
  ...(TK_DIRECT_JA_LAYOUT === undefined ? [] : [TK_DIRECT_JA_LAYOUT]),
  ...DIRECT_JA_INPUT_LAYOUTS,
  JIS_KANA,
];

const PRESET_GEOMETRY_SHAPES = Object.values(PHYSICAL_SHAPES);
const DEFAULT_SPLIT_PERCENT = 50;
const MIN_SPLIT_PERCENT = 25;
const MAX_SPLIT_PERCENT = 75;

function clampSplitPercent(value: number): number {
  return Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, value));
}

type GuideGridLayout = {
  columns: number;
  cardMaxWidthPx: number | null;
};

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chooseGuideGridLayout(
  grid: HTMLDivElement,
  itemCount: number,
): GuideGridLayout {
  if (itemCount <= 0) return { columns: 1, cardMaxWidthPx: null };

  const style = getComputedStyle(grid);
  const availableWidth = Math.max(
    0,
    grid.clientWidth - px(style.paddingLeft) - px(style.paddingRight),
  );
  const availableHeight = Math.max(
    0,
    grid.clientHeight - px(style.paddingTop) - px(style.paddingBottom),
  );
  if (availableWidth <= 0 || availableHeight <= 0) {
    return { columns: 1, cardMaxWidthPx: null };
  }

  const columnGap = px(style.columnGap);
  const rowGap = px(style.rowGap);
  const firstCard = grid.querySelector<HTMLElement>('.input-layer-card');
  const svg = firstCard?.querySelector<SVGSVGElement>('svg');

  // The keyboard scales linearly while each card's heading/padding is nearly fixed.
  // Measure those fixed parts from a real card so the packing decision follows the
  // currently selected geometry instead of relying on a hard-coded aspect ratio.
  const cardRect = firstCard?.getBoundingClientRect();
  const svgRect = svg?.getBoundingClientRect();
  const viewBox = svg?.viewBox.baseVal;
  const svgAspect = viewBox !== undefined && viewBox.height > 0
    ? viewBox.width / viewBox.height
    : 2;
  const horizontalChrome = cardRect !== undefined && svgRect !== undefined
    ? Math.max(0, cardRect.width - svgRect.width)
    : 24;
  const verticalChrome = cardRect !== undefined && svgRect !== undefined
    ? Math.max(0, cardRect.height - svgRect.height)
    : 52;

  let best: GuideGridLayout = { columns: 1, cardMaxWidthPx: availableWidth };
  let bestWidth = -1;

  for (let columns = 1; columns <= itemCount; columns += 1) {
    const rows = Math.ceil(itemCount / columns);
    const cellWidth = (
      availableWidth - columnGap * Math.max(0, columns - 1)
    ) / columns;
    const cellHeight = (
      availableHeight - rowGap * Math.max(0, rows - 1)
    ) / rows;
    if (cellWidth <= 0 || cellHeight <= verticalChrome) continue;

    const maxWidthFromHeight = horizontalChrome
      + (cellHeight - verticalChrome) * svgAspect;
    const cardWidth = Math.min(cellWidth, maxWidthFromHeight);

    if (
      cardWidth > bestWidth + 0.5
      || (Math.abs(cardWidth - bestWidth) <= 0.5 && columns < best.columns)
    ) {
      bestWidth = cardWidth;
      best = {
        columns,
        cardMaxWidthPx: Math.max(horizontalChrome, Math.floor(cardWidth)),
      };
    }
  }

  return best;
}

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
  const [thumbBindings, setThumbBindings] = useState<ThumbKeyBindings>(() => ({
    leftCodes: [...DEFAULT_THUMB_KEY_BINDINGS.leftCodes],
    rightCodes: [...DEFAULT_THUMB_KEY_BINDINGS.rightCodes],
  }));
  const browserBindings = useMemo(() => ({
    ...(layout.id === 'jis-kana'
      ? {
        Backslash: 'r2c11',
        IntlYen: 'r0c12',
        IntlRo: 'r3c10',
      }
      : {}),
    ...thumbKeyBindingsToOverrides(thumbBindings),
  }), [layout.id, thumbBindings]);
  const session = useTypingSession(layout, browserBindings);
  const [userGeometryShapes, setUserGeometryShapes] = useState<PhysicalShape[]>([]);
  const [geometryId, setGeometryId] = useState(PHYSICAL_SHAPES['row-staggered'].id);
  const [showDynamicGuide, setShowDynamicGuide] = useState(true);
  const [showLayerGuide, setShowLayerGuide] = useState(true);
  const [showLayerKeys, setShowLayerKeys] = useState(true);
  const [showShiftKeys, setShowShiftKeys] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT_PERCENT);
  const [lookupQuery, setLookupQuery] = useState('');
  const guideGridRef = useRef<HTMLDivElement>(null);
  const [guideGridLayout, setGuideGridLayout] = useState<GuideGridLayout>({
    columns: 1,
    cardMaxWidthPx: null,
  });
  const layoutPhysicalKeys = useMemo(
    () => physicalKeysUsedByLayout(layout),
    [layout],
  );
  const escapeIsLayoutInput = layoutPhysicalKeys.has('escape');
  const hasShiftKeys = layoutPhysicalKeys.has(SHIFT_KEY.L)
    || layoutPhysicalKeys.has(SHIFT_KEY.R);

  const updateSplitFromClientX = (clientX: number, splitter: HTMLElement) => {
    const workspace = splitter.parentElement;
    if (workspace === null) return;
    const bounds = workspace.getBoundingClientRect();
    if (bounds.width <= 0) return;
    setSplitPercent(clampSplitPercent(((clientX - bounds.left) / bounds.width) * 100));
  };

  useEffect(() => {
    setUserGeometryShapes(loadUserGeometryShapes());
    setThumbBindings(loadThumbKeyBindings(window.localStorage));
  }, []);

  const updateThumbBindings = (next: ThumbKeyBindings) => {
    setThumbBindings(next);
    saveThumbKeyBindings(next, window.localStorage);
  };

  const geometryShapes = useMemo(
    () => [...PRESET_GEOMETRY_SHAPES, ...userGeometryShapes],
    [userGeometryShapes],
  );
  const selectedShape = geometryShapes.find((shape) => shape.id === geometryId)
    ?? PHYSICAL_SHAPES['row-staggered'];
  const geometry = useMemo(() => {
    if (isPresetGeometryKind(geometryId)) {
      return buildGeometry(
        geometryId,
        geometryId === 'jis-row-staggered'
          ? JIS_FINGER_ASSIGNMENT
          : DEFAULT_FINGER_ASSIGNMENT,
      );
    }
    const settings = sanitizeGeometrySettings({
      shape: selectedShape,
      assignment: DEFAULT_FINGER_ASSIGNMENT,
    });
    return buildGeometry(settings.shape, settings.assignment);
  }, [geometryId, selectedShape]);
  const visibleKeys = useMemo(
    () => visibleGeometryKeys(layout, geometry)
      .filter((key) =>
        showShiftKeys
        || (key.id !== SHIFT_KEY.L && key.id !== SHIFT_KEY.R))
      .map((key) =>
        key.id === SHIFT_KEY.L || key.id === SHIFT_KEY.R
          ? { ...key, width: 1 }
          : key),
    [geometry, layout, showShiftKeys],
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
  const layerKeys = useMemo(() => allLayerTriggerKeys(layout), [layout]);
  const layerKeyColorSlots = useMemo(
    () => presentationTriggerColorSlots(layout),
    [layout],
  );
  const patternResult = useMemo(() => {
    const result = matchKeyPatterns(
      layout,
      new Set(session.presentation.selectedKeys),
    );
    const active = new Set(activeGroupIds);
    const visible = (match: (typeof result.exact)[number]) =>
      active.has(match.aggregationGroupId)
      || (match.orderRequirements?.length ?? 0) === 0;

    const filterMap = (
      source: typeof result.candidates,
    ): typeof result.candidates => new Map(
      [...source]
        .map(([key, matches]) => [
          key,
          matches.filter(visible),
        ] as const)
        .filter(([, matches]) => matches.length > 0),
    );

    return {
      exact: result.exact.filter(visible),
      candidates: filterMap(result.candidates),
      continuations: filterMap(result.continuations),
    };
  }, [activeGroupIds, layout, session.presentation.selectedKeys]);
  const keyboardViews = useMemo(() => {
    const pressed = new Set(session.pressedKeys);
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
            legend: guideLegend ?? layout.legends.get(key.id) ?? '',
            secondaryLegend: key.id === THUMB_KEY.LT
              ? thumbBindingLabel(thumbBindings, 'left')
              : key.id === THUMB_KEY.RT
                ? thumbBindingLabel(thumbBindings, 'right')
                : key.id,
            pressed: pressed.has(key.id),
            highlighted: showDynamicGuide && activeTriggerKeys.has(key.id),
            trigger: showLayerKeys && layerKeys.has(key.id),
            accentSlot: showLayerKeys ? layerKeyColorSlots.get(key.id) : undefined,
            guide,
          },
        ] as const;
      }),
    );
  }, [
    activeGroupIds,
    activeTriggerKeys,
    layout,
    patternResult,
    session.pressedKeys,
    showDynamicGuide,
    showLayerKeys,
    thumbBindings,
    layerKeyColorSlots,
    layerKeys,
    visibleKeys,
  ]);
  const lookupRoutes = useMemo(
    () => reverseLookup(layout, lookupQuery, 3),
    [layout, lookupQuery],
  );
  const guideDefinitions = useMemo(
    () => compactLayerGuideDefinitions(layout),
    [layout],
  );
  const combinationLabels = useMemo(() => {
    const layerLabels = new Set(guideDefinitions.map((definition) => definition.label));
    return semanticCombinationLabels(layout)
      .filter((label) => !layerLabels.has(label));
  }, [guideDefinitions, layout]);

  useEffect(() => {
    const grid = guideGridRef.current;
    if (grid === null || guideDefinitions.length === 0) return;

    const update = () => {
      const next = chooseGuideGridLayout(grid, guideDefinitions.length);
      setGuideGridLayout((current) => (
        current.columns === next.columns
        && current.cardMaxWidthPx === next.cardMaxWidthPx
          ? current
          : next
      ));
    };

    const observer = new ResizeObserver(update);
    observer.observe(grid);
    update();
    return () => observer.disconnect();
  }, [geometry.id, guideDefinitions.length, layout.id, settingsOpen]);

  return (
    <section
      className="feature-shell input-feature"
      data-input-ready={session.readyLayoutId === layout.id ? layout.id : undefined}
      data-active-layer={activeGroupIds.length > 0 ? activeGroupIds.join('|') : 'single'}
    >
      <header className="input-page-heading">
        <div>
          <p className="eyebrow">Phase B · #270</p>
          <h1>Input Converter</h1>
        </div>
        <p>
          選択した配列の canonical SemanticInput を使って、物理キーから文字列を直接生成する。
        </p>
      </header>

      <div
        className="input-workspace"
        style={{ '--input-sidebar-width': `${splitPercent}%` } as CSSProperties}
      >
        <aside className="input-sidebar" aria-label="入力テスト設定とカンペ">
          <details
            className="input-settings-panel"
            open={settingsOpen}
            onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
          >
            <summary className="input-panel-heading">
              <strong>設定</strong>
              <span>{settingsOpen ? '閉じる' : '開く'}</span>
            </summary>

            <div className="input-settings-body">
            <div className="input-toolbar">
              <label>
                <span>配列</span>
                <select
                  aria-label="配列"
                  value={layout.id}
                  onChange={(event) => {
                    const next = INPUT_LAYOUTS.find((candidate) => candidate.id === event.target.value);
                    if (next === undefined) return;
                    if (next.id === 'jis-kana') {
                      setGeometryId('jis-row-staggered');
                    } else if (
                      layout.id === 'jis-kana'
                      && geometryId === 'jis-row-staggered'
                    ) {
                      setGeometryId('row-staggered');
                    }
                    setLayout(next);
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
            </div>

            <ThumbKeyBindingEditor
              value={thumbBindings}
              onChange={updateThumbBindings}
            />
            </div>
          </details>

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
              <div
                className="input-layer-guide-grid"
                ref={guideGridRef}
                style={{
                  '--guide-columns': guideGridLayout.columns,
                  '--guide-card-max-width': guideGridLayout.cardMaxWidthPx === null
                    ? '100%'
                    : `${guideGridLayout.cardMaxWidthPx}px`,
                } as CSSProperties}
              >
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
                        unit={24}
                      />
                    </section>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </aside>

        <div
          aria-label="カンペと入力領域の幅を調整"
          aria-orientation="vertical"
          aria-valuemax={MAX_SPLIT_PERCENT}
          aria-valuemin={MIN_SPLIT_PERCENT}
          aria-valuenow={Math.round(splitPercent)}
          className="input-splitter"
          onDoubleClick={() => setSplitPercent(DEFAULT_SPLIT_PERCENT)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              setSplitPercent((current) => clampSplitPercent(current - 2));
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              setSplitPercent((current) => clampSplitPercent(current + 2));
            } else if (event.key === 'Home') {
              event.preventDefault();
              setSplitPercent(MIN_SPLIT_PERCENT);
            } else if (event.key === 'End') {
              event.preventDefault();
              setSplitPercent(MAX_SPLIT_PERCENT);
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateSplitFromClientX(event.clientX, event.currentTarget);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            updateSplitFromClientX(event.clientX, event.currentTarget);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          role="separator"
          tabIndex={0}
          title="ドラッグで幅を調整。ダブルクリックで1:1に戻す。"
        />

        <section className="input-main">
          <section className="input-capture-panel">
            <header className="input-capture-heading">
              <strong>入力</strong>
              <button type="button" onClick={session.clear}>クリア</button>
            </header>
            <textarea
              className="input-output"
              value={session.text}
              readOnly
              rows={3}
              aria-label="自由入力テキスト"
              aria-describedby="input-capture-help"
              data-active={session.active || undefined}
              ref={session.captureRef}
              placeholder="ここをクリックして、そのまま打鍵する。"
            />
            <p className="input-capture-hint" id="input-capture-help">
              {session.active ? '入力受付中。' : '入力欄をクリックして入力開始。'}
              {' '}Backspaceで1文字削除、Enterで改行、
              {escapeIsLayoutInput ? 'Escは配列入力として扱う。' : 'Escで全削除。'}
              {session.composing ? ' IME composition中は認識を停止している。' : ''}
            </p>
          </section>

          <section className="input-keyboard-panel">
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
                  checked={showLayerKeys}
                  onChange={(event) => setShowLayerKeys(event.target.checked)}
                />
                レイヤーキー
              </label>
              {hasShiftKeys ? (
                <label>
                  <input
                    type="checkbox"
                    checked={showShiftKeys}
                    onChange={(event) => setShowShiftKeys(event.target.checked)}
                  />
                  Shiftキー
                </label>
              ) : null}
            </div>
            <header className="input-keyboard-heading">
              <strong>Keyboard</strong>
              <p
                className="input-active-layer"
                data-active={activeDefinitions.length > 0 || undefined}
              >
                <span>現在</span>
                <strong>
                  {activeDefinitions.length > 0
                    ? activeDefinitions.map((definition) => definition.label).join(' / ')
                    : '通常'}
                </strong>
              </p>
            </header>
            <div className="input-keyboard-main">
              <PhysicalKeyboard
                ariaLabel="現在の物理キー状態"
                geometryId={geometry.id}
                keys={visibleKeys}
                keyViews={keyboardViews}
              />
            </div>
            <section className="input-assist-slot" aria-label="打ち方逆引き">
              <label className="input-lookup-field">
                <span>打ち方を調べる</span>
                <input
                  aria-label="打ちたい文字"
                  type="text"
                  value={lookupQuery}
                  onChange={(event) => setLookupQuery(event.target.value)}
                  placeholder="例: ぎゃ"
                  autoComplete="off"
                />
              </label>
              <div className="input-lookup-results" aria-live="polite">
                {lookupQuery.length === 0 ? (
                  <span className="input-muted">文字を入れるとcanonical inputから逆引きする。</span>
                ) : lookupRoutes.length === 0 ? (
                  <span className="input-muted">この配列では打ち方を見つけられない。</span>
                ) : (
                  <ol>
                    {lookupRoutes.map((route, index) => (
                      <li key={`${reverseLookupRouteLabel(route)}:${index}`}>
                        <code>{reverseLookupRouteLabel(route)}</code>
                        {route.steps.some((step) => step.origin === 'combo')
                          ? <small>コンボ</small>
                          : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </section>

          <section className="input-debug" aria-label="入力詳細">
            <header className="input-debug-heading">
              <strong>入力詳細</strong>
            </header>
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
          </section>
        </section>
      </div>
    </section>
  );
}
