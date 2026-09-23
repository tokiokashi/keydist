import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  presetGeometryKind,
  presetGeometryStandard,
  presetGeometryTopology,
  SHIFT_KEY,
  THUMB_KEY,
  type PhysicalShape,
} from '../../geometry.ts';
import {
  sanitizeGeometrySettings,
} from '../../geometry-settings.ts';
import {
  aggregationLegendMap,
  aggregationTriggerDisplayText,
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
  createWorkspacePanelRegistry,
  resolvePanelLayout,
  type PanelId,
} from '../../workspace/panel-registry.ts';
import { WorkspacePanel } from '../../workspace/workspace-panel.tsx';
import { WorkspaceProvider, useWorkspace } from '../../workspace/workspace-runtime.tsx';
import {
  assignBrowserKeyCode,
  loadBrowserKeyBindingOverrides,
  saveBrowserKeyBindingOverrides,
  unassignBrowserKeyCode,
  type BrowserKeyBindingOverrides,
} from './browser-keyboard-bindings.ts';
import { browserCodesForPhysicalKey } from './browser-keyboard-adapter.ts';
import { INPUT_CONVERTER_PREFERENCES_VERSION } from './input-converter-preferences.ts';
import { useInputConverterPreferences } from './use-input-converter-preferences.ts';
import {
  JAPANESE_INPUT_SAMPLE_POOLS,
  pickRandomSample,
} from './random-samples.ts';
import {
  longestReverseLookupRoute,
  reverseLookup,
  reverseLookupGuideActionHighlightKeys,
  reverseLookupGuideActionLabel,
  reverseLookupGuideActionMatchesKeys,
  reverseLookupGuideActions,
  reverseLookupGuideIndexForText,
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

const ANSI_GEOMETRY_SHAPES = [
  PHYSICAL_SHAPES['row-staggered'],
  PHYSICAL_SHAPES['column-staggered'],
  PHYSICAL_SHAPES.ortholinear,
] as const;
const JIS_GEOMETRY_SHAPES = [
  PHYSICAL_SHAPES['jis-row-staggered'],
  PHYSICAL_SHAPES['jis-column-staggered'],
  PHYSICAL_SHAPES['jis-ortholinear'],
] as const;
const PRESET_GEOMETRY_SHAPES = [
  ...ANSI_GEOMETRY_SHAPES,
  ...JIS_GEOMETRY_SHAPES,
];
const JIS_BROWSER_BINDINGS: BrowserKeyBindingOverrides = {
  Backslash: 'r2c11',
  IntlYen: 'r0c12',
  IntlRo: 'r3c10',
};
const HOME_POSITION_KEYS = new Set(['f', 'j']);
const DEFAULT_SPLIT_PERCENT = 50;
const MIN_SPLIT_PERCENT = 25;
const MAX_SPLIT_PERCENT = 75;

type RandomPracticeMode = 'word' | 'phrase';

function clampSplitPercent(value: number): number {
  return Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, value));
}

type GuideGridLayout = {
  columns: number;
  cardMaxWidthPx: number | null;
};

const MIN_FLOATING_GUIDE_WIDTH = 320;
const MIN_FLOATING_GUIDE_HEIGHT = 240;
const FLOATING_GUIDE_VIEWPORT_GAP = 12;

const INPUT_SETTINGS_PANEL_ID = 'input.settings';
const INPUT_TYPING_PANEL_ID = 'input.typing';
const INPUT_KEYBOARD_PANEL_ID = 'input.keyboard';
const INPUT_LOOKUP_PANEL_ID = 'input.lookup';
const INPUT_LAYER_GUIDE_PANEL_ID = 'input.layer-guide';

function layerGuideCardPanelId(layerId: string): string {
  return `input.layer:${layerId}`;
}

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
    return (
      <p className="input-muted input-recognized-empty">
        -
      </p>
    );
  }

  return (
    <div className="input-recognized-list">
      {recognized.map((entry, entryIndex) => (
        <div className="input-recognized" key={entryIndex}>
          <strong title={entry.output}>{entry.output}</strong>
          <div>
            {entry.actions.map((action, actionIndex) => {
              const actionLabel = [
                action.keys.join(' + '),
                action.heldKeys.length > 0 ? `[hold: ${action.heldKeys.join(' + ')}]` : '',
                action.holdPhase ?? '',
              ].filter(Boolean).join(' ');

              return (
                <code key={actionIndex} title={actionLabel}>
                  {actionLabel}
                </code>
              );
            })}
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
  const [bindingOverrides, setBindingOverrides] =
    useState<BrowserKeyBindingOverrides>({});
  const [bindingTargetKey, setBindingTargetKey] = useState<string>();
  const [bindingCapturing, setBindingCapturing] = useState(false);
  const bindingCaptureCodeRef = useRef<string | undefined>(undefined);
  const [userGeometryShapes, setUserGeometryShapes] = useState<PhysicalShape[]>([]);
  const [geometryId, setGeometryId] = useState(PHYSICAL_SHAPES['row-staggered'].id);
  const browserBindings = useMemo(() => ({
    ...(isPresetGeometryKind(geometryId)
      && presetGeometryStandard(geometryId) === 'jis'
      ? JIS_BROWSER_BINDINGS
      : {}),
    ...bindingOverrides,
  }), [bindingOverrides, geometryId]);
  const session = useTypingSession(layout, browserBindings);
  const [showDynamicGuide, setShowDynamicGuide] = useState(true);
  const [showLayerGuide, setShowLayerGuide] = useState(true);
  const [showLayerKeys, setShowLayerKeys] = useState(true);
  const [showShiftKeys, setShowShiftKeys] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT_PERCENT);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupStepIndex, setLookupStepIndex] = useState(0);
  const [randomPracticeMode, setRandomPracticeMode] =
    useState<RandomPracticeMode | null>(null);
  const preferences = useInputConverterPreferences();
  const guideDefinitions = useMemo(
    () => compactLayerGuideDefinitions(layout),
    [layout],
  );
  const workspaceRegistry = useMemo(
    () => createWorkspacePanelRegistry([
      {
        id: INPUT_SETTINGS_PANEL_ID,
        title: 'Settings',
        defaultDockSlot: 'input.sidebar.settings',
        minWidth: 320,
        minHeight: 80,
        defaultFloatingWidth: 520,
        defaultFloatingHeight: 150,
      },
      {
        id: INPUT_TYPING_PANEL_ID,
        title: 'Text Input',
        defaultDockSlot: 'input.main.typing',
        minWidth: 320,
        minHeight: 160,
        defaultFloatingWidth: 520,
        defaultFloatingHeight: 180,
      },
      {
        id: INPUT_KEYBOARD_PANEL_ID,
        title: 'Keyboard View',
        defaultDockSlot: 'input.main.keyboard',
        minWidth: 480,
        minHeight: 360,
        defaultFloatingWidth: 760,
        defaultFloatingHeight: 560,
      },
      {
        id: INPUT_LOOKUP_PANEL_ID,
        title: 'Practice Text',
        defaultDockSlot: 'input.keyboard.lookup',
        minWidth: 420,
        minHeight: 103,
        defaultFloatingWidth: 720,
        defaultFloatingHeight: 240,
      },
      {
        id: INPUT_LAYER_GUIDE_PANEL_ID,
        title: 'Layer Guide',
        defaultDockSlot: 'input.sidebar.guide',
        minWidth: MIN_FLOATING_GUIDE_WIDTH,
        minHeight: MIN_FLOATING_GUIDE_HEIGHT,
        defaultFloatingWidth: 560,
        defaultFloatingHeight: 480,
      },
      ...guideDefinitions.map((definition) => ({
        id: layerGuideCardPanelId(definition.id),
        title: definition.label,
        defaultDockSlot: 'input.sidebar.guide',
        minWidth: MIN_FLOATING_GUIDE_WIDTH,
        minHeight: MIN_FLOATING_GUIDE_HEIGHT,
        defaultFloatingWidth: 420,
        defaultFloatingHeight: 280,
      })),
    ]),
    [guideDefinitions],
  );
  const workspacePanelDefinitions = useMemo(
    () => [...workspaceRegistry.values()],
    [workspaceRegistry],
  );
  const workspace = useWorkspace(workspacePanelDefinitions, workspaceRegistry);
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

  const initialLayerCardRect = (source: HTMLElement, panelId: PanelId) => {
    const bounds = source.closest<HTMLElement>('.input-layer-card')?.getBoundingClientRect();
    const { defaultFloatingWidth, defaultFloatingHeight } = resolvePanelLayout(
      workspaceRegistry.get(panelId),
    );
    const width = Math.max(defaultFloatingWidth, bounds?.width ?? defaultFloatingWidth);
    const height = Math.max(defaultFloatingHeight, bounds?.height ?? defaultFloatingHeight);

    // 個別カンペは「何枚目か」で画面端へ並べるのではなく、
    // そのカードが元々あった場所を初期位置のauthorityにする。
    // 複数枚を浮かせても各カードが元の位置の近くから出る。
    return {
      x: bounds?.left ?? FLOATING_GUIDE_VIEWPORT_GAP,
      y: bounds?.top ?? FLOATING_GUIDE_VIEWPORT_GAP,
      width,
      height,
    };
  };

  useEffect(() => {
    const shapes = loadUserGeometryShapes();
    setUserGeometryShapes(shapes);
    setBindingOverrides(loadBrowserKeyBindingOverrides(window.localStorage));

    // geometryIdのカタログはuser-geometriesの内容込みで判定する必要があるため、
    // useState経由の(まだこのeffect内では反映されていない)userGeometryShapesではなく、
    // 直前に読んだshapesをそのまま使う。
    const restored = preferences.restoreOnce(
      {
        layoutIds: INPUT_LAYOUTS.map((candidate) => candidate.id),
        geometryIds: [
          ...PRESET_GEOMETRY_SHAPES.map((shape) => shape.id),
          ...shapes.map((shape) => shape.id),
        ],
      },
      {
        layoutId: layout.id,
        geometryId,
        showDynamicGuide,
        showLayerGuide,
        showLayerKeys,
        showShiftKeys,
      },
    );
    const restoredLayout = INPUT_LAYOUTS.find((candidate) => candidate.id === restored.layoutId);
    if (restoredLayout !== undefined) setLayout(restoredLayout);
    setGeometryId(restored.geometryId);
    setShowDynamicGuide(restored.showDynamicGuide);
    setShowLayerGuide(restored.showLayerGuide);
    setShowLayerKeys(restored.showLayerKeys);
    setShowShiftKeys(restored.showShiftKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount後に一度だけ復元する
  }, []);

  // 書き込みのcoalescingはpreferences側が持つ。ここでは復元前(mountの初回コミット)を
  // 除いた変化だけを伝える。復元前に書くとdefault値でsaved値を上書きしてしまうため。
  const skippedInitialPreferencesWriteRef = useRef(false);
  useEffect(() => {
    if (!skippedInitialPreferencesWriteRef.current) {
      skippedInitialPreferencesWriteRef.current = true;
      return;
    }
    preferences.save({
      version: INPUT_CONVERTER_PREFERENCES_VERSION,
      layoutId: layout.id,
      geometryId,
      showDynamicGuide,
      showLayerGuide,
      showLayerKeys,
      showShiftKeys,
    });
  }, [
    layout.id,
    geometryId,
    showDynamicGuide,
    showLayerGuide,
    showLayerKeys,
    showShiftKeys,
    preferences,
  ]);

  const updateBindingOverrides = (next: BrowserKeyBindingOverrides) => {
    setBindingOverrides(next);
    saveBrowserKeyBindingOverrides(next, window.localStorage);
  };

  useEffect(() => {
    if (!bindingCapturing || bindingTargetKey === undefined) {
      bindingCaptureCodeRef.current = undefined;
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || bindingCaptureCodeRef.current !== undefined) return;

      bindingCaptureCodeRef.current = event.code;
      updateBindingOverrides(
        assignBrowserKeyCode(bindingOverrides, bindingTargetKey, event.code),
      );
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (bindingCaptureCodeRef.current !== event.code) return;
      event.preventDefault();
      event.stopPropagation();
      bindingCaptureCodeRef.current = undefined;
      setBindingCapturing(false);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [bindingCapturing, bindingOverrides, bindingTargetKey]);

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
        presetGeometryStandard(geometryId) === 'jis'
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
  const playableRandomSamples = useMemo(() => ({
    words: JAPANESE_INPUT_SAMPLE_POOLS.words.filter(
      (sample) => reverseLookup(layout, sample, 1).length > 0,
    ),
    phrases: JAPANESE_INPUT_SAMPLE_POOLS.phrases.filter(
      (sample) => reverseLookup(layout, sample, 1).length > 0,
    ),
  }), [layout]);
  const lookupRoutes = useMemo(
    () => reverseLookup(layout, lookupQuery, 3),
    [layout, lookupQuery],
  );
  // 表示・ガイドとも「最長候補」（＝最初のstepでより多くのかなをまとめて打つ経路）に揃える。
  // reverseLookupの並び順は既にこの基準で先頭がそれになるが、選択自体は
  // longestReverseLookupRouteへ委ね、並び順への暗黙の依存を避ける。
  const activeLookupRoute = useMemo(
    () => longestReverseLookupRoute(lookupRoutes),
    [lookupRoutes],
  );
  const otherLookupRoutes = useMemo(
    () => lookupRoutes.filter((route) => route !== activeLookupRoute),
    [lookupRoutes, activeLookupRoute],
  );
  const activeLookupGuideActions = useMemo(
    () => activeLookupRoute === undefined ? [] : reverseLookupGuideActions(activeLookupRoute),
    [activeLookupRoute],
  );
  const activeLookupGuideIndex = Math.min(
    lookupStepIndex,
    Math.max(0, activeLookupGuideActions.length - 1),
  );
  const activeLookupAction = activeLookupGuideActions[activeLookupGuideIndex];
  const activeLookupStep = activeLookupAction === undefined
    ? undefined
    : activeLookupRoute?.steps[activeLookupAction.routeStepIndex];
  const lookupKeys = useMemo(
    () => new Set(
      activeLookupAction === undefined
        ? []
        : reverseLookupGuideActionHighlightKeys(layout, activeLookupAction),
    ),
    [activeLookupAction],
  );
  const lookupLegendMap = useMemo(() => {
    if (activeLookupStep === undefined) return new Map<string, string>();
    const guideIds = new Set(guideDefinitions.map((definition) => definition.id));
    const legends = new Map<string, string>();
    for (const id of activeLookupStep.aggregationGroupIds) {
      if (!guideIds.has(id)) continue;
      for (const [key, label] of aggregationLegendMap(layout, id)) {
        const current = legends.get(key);
        if (current === undefined) legends.set(key, label);
        else if (!current.split(' / ').includes(label)) {
          legends.set(key, `${current} / ${label}`);
        }
      }
    }
    return legends;
  }, [activeLookupStep, guideDefinitions, layout]);
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
            legend: lookupLegendMap.get(key.id)
              ?? guideLegend
              ?? layout.legends.get(key.id)
              ?? '',
            secondaryLegend: key.id === THUMB_KEY.LT || key.id === THUMB_KEY.RT
              ? browserCodesForPhysicalKey(key.id, browserBindings).join(' / ') || '未割当'
              : key.id,
            pressed: pressed.has(key.id),
            highlighted: showDynamicGuide && activeTriggerKeys.has(key.id),
            trigger: showLayerKeys && layerKeys.has(key.id),
            accentSlot: showLayerKeys ? layerKeyColorSlots.get(key.id) : undefined,
            guide,
            lookup: lookupKeys.has(key.id),
            home: HOME_POSITION_KEYS.has(key.id),
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
    browserBindings,
    layerKeyColorSlots,
    layerKeys,
    lookupKeys,
    lookupLegendMap,
    visibleKeys,
  ]);
  const combinationLabels = useMemo(() => {
    const layerLabels = new Set(guideDefinitions.map((definition) => definition.label));
    return semanticCombinationLabels(layout)
      .filter((label) => !layerLabels.has(label));
  }, [guideDefinitions, layout]);

  const selectedBindingCodes = useMemo(
    () => bindingTargetKey === undefined
      ? []
      : browserCodesForPhysicalKey(bindingTargetKey, browserBindings),
    [bindingTargetKey, browserBindings],
  );

  const randomPoolForMode = (mode: RandomPracticeMode): readonly string[] =>
    mode === 'word' ? playableRandomSamples.words : playableRandomSamples.phrases;

  const focusCapture = () => {
    requestAnimationFrame(() => session.captureRef.current?.focus());
  };

  const advanceRandomPractice = (mode: RandomPracticeMode) => {
    const next = pickRandomSample(randomPoolForMode(mode), lookupQuery);
    if (next.length === 0) return false;
    session.clear();
    setLookupQuery(next);
    setLookupStepIndex(0);
    focusCapture();
    return true;
  };

  const startOrAdvanceRandomPractice = (mode: RandomPracticeMode) => {
    if (!advanceRandomPractice(mode)) return;
    setRandomPracticeMode(mode);
  };

  const stopRandomPractice = () => {
    setRandomPracticeMode(null);
    focusCapture();
  };

  const randomPracticeComplete = randomPracticeMode !== null
    && lookupQuery.length > 0
    && session.text === lookupQuery
    && session.pressedKeys.length === 0;

  const typingTargetPresentation = useMemo(() => {
    const target = Array.from(lookupQuery);
    const typed = Array.from(session.text);
    return {
      typed: typed.map((char, index) => ({
        char,
        correct: target[index] === char,
      })),
      remaining: target.slice(typed.length),
    };
  }, [lookupQuery, session.text]);

  useEffect(() => {
    setLookupStepIndex(0);
  }, [layout.id, lookupQuery]);

  useEffect(() => {
    if (
      activeLookupAction === undefined
      || activeLookupAction.finalInRouteStep
      || session.recognitionKeys.length === 0
    ) return;
    if (reverseLookupGuideActionMatchesKeys(activeLookupAction, session.recognitionKeys)) {
      setLookupStepIndex((current) =>
        Math.min(activeLookupGuideActions.length - 1, current + 1));
    }
  }, [activeLookupAction, activeLookupGuideActions.length, session.recognitionKeys]);

  useEffect(() => {
    if (activeLookupRoute === undefined || activeLookupGuideActions.length === 0) return;
    setLookupStepIndex(
      reverseLookupGuideIndexForText(layout, activeLookupRoute, session.text),
    );
  }, [
    activeLookupGuideActions.length,
    activeLookupRoute,
    layout,
    session.text,
  ]);

  // layer guide panelはWorkspacePanelがdocked/floating切替時に丸ごとunmount/remountする
  // （portal化のため）。そのDOM再生成を検知してResizeObserverを張り直すのに、
  // 以前はpanel modeをeffectの依存配列へ入れていた（#441）。callback ref化すると、
  // node自体の付け替え（=mode切替によるremount含む）でReactが自動的にこの関数を
  // 呼び直してくれるため、featureがpanel modeを読まずに同じ張り直しを実現できる。
  const attachGuideGridRef = useCallback((grid: HTMLDivElement | null) => {
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
  }, [
    geometry.id,
    guideDefinitions.length,
    layout.id,
    settingsOpen,
  ]);

  return (
    <WorkspaceProvider runtime={workspace}>
    <section
      className="feature-shell input-feature"
      data-input-ready={session.readyLayoutId === layout.id ? layout.id : undefined}
      data-active-layer={activeGroupIds.length > 0 ? activeGroupIds.join('|') : 'single'}
    >
      <header className="input-page-heading">
        <div>
          <p className="eyebrow">Phase B · #270</p>
          <h1>Alternative Keyboard Layout Tester</h1>
        </div>
        <p>
          選択した配列の canonical SemanticInput を使って、物理キーから文字列を直接生成します。
        </p>
      </header>

      <div
        className="input-workspace"
        style={{ '--input-sidebar-width': `${splitPercent}%` } as CSSProperties}
      >
        <aside className="input-sidebar" aria-label="入力テスト設定とカンペ">
          <WorkspacePanel
            ariaLabel="Settings"
            className={settingsOpen
              ? 'input-settings-panel input-settings-panel-open'
              : 'input-settings-panel'}
            dockClassName="input-panel-dock"
            dockedHeaderAriaLabel="Settingsをクリックまたはドラッグして小窓表示"
            floatingHeaderAriaLabel="Settingsを移動"
            headerClassName="input-panel-heading"
            id={INPUT_SETTINGS_PANEL_ID}
            resizeAriaLabel="Settingsのサイズを変更"
            renderHeader={() => (
              <>
                <strong>Settings</strong>
                <button
                  aria-expanded={settingsOpen}
                  aria-label={settingsOpen ? '設定を閉じる' : '設定を開く'}
                  className="input-settings-toggle"
                  onClick={() => setSettingsOpen((current) => !current)}
                  type="button"
                >
                  {settingsOpen ? '閉じる' : '開く'}
                </button>
              </>
            )}
          >
            {settingsOpen ? (
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
                      setGeometryId((current) =>
                        isPresetGeometryKind(current)
                          ? presetGeometryKind(
                            'jis',
                            presetGeometryTopology(current),
                          )
                          : 'jis-row-staggered');
                    }
                    setRandomPracticeMode(null);
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
                  <optgroup label="US / ANSI">
                    {ANSI_GEOMETRY_SHAPES.map((shape) => (
                      <option key={shape.id} value={shape.id}>{shape.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="JIS 109">
                    {JIS_GEOMETRY_SHAPES.map((shape) => (
                      <option key={shape.id} value={shape.id}>{shape.name}</option>
                    ))}
                  </optgroup>
                  {userGeometryShapes.length > 0 ? (
                    <optgroup label="自作">
                      {userGeometryShapes.map((shape) => (
                        <option key={shape.id} value={shape.id}>{shape.name}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
            </div>

            </div>
            ) : null}
          </WorkspacePanel>

          {showLayerGuide && (guideDefinitions.length > 0 || combinationLabels.length > 0) ? (
            <WorkspacePanel
              id={INPUT_LAYER_GUIDE_PANEL_ID}
              ariaLabel="Layer Guide"
              className="input-layer-guide"
              dockClassName="input-layer-guide-dock"
              dockedHeaderAriaLabel="Layer Guideを小窓表示"
              floatingHeaderAriaLabel="Layer Guideを移動"
              resizeAriaLabel="Layer Guideのサイズを変更"
              renderHeader={() => (
                <>
                  <strong>Layer Guide</strong>
                  <span>{guideDefinitions.length} 面</span>
                </>
              )}
              renderDockedActions={() => <small>クリックで小窓表示</small>}
            >
              {combinationLabels.length > 0 ? (
                <div className="input-semantic-groups" aria-label="意味論的な組み合わせ">
                  {combinationLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              ) : null}
              <div
                className="input-layer-guide-grid"
                ref={attachGuideGridRef}
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
                        accentSlot: triggers.has(key.id)
                          ? layerKeyColorSlots.get(key.id)
                          : undefined,
                        home: HOME_POSITION_KEYS.has(key.id),
                      },
                    ]),
                  );
                  const panelId = layerGuideCardPanelId(definition.id);

                  return (
                    <WorkspacePanel
                      ariaLabel={`${definition.label} 個別カンペ`}
                      className="input-layer-card"
                      dockAriaLabel={`${definition.label}を元に戻す`}
                      dockedHeaderAriaLabel={`${definition.label}カンペをクリックまたはドラッグして小窓表示`}
                      floatingHeaderAriaLabel={`${definition.label}カンペを移動`}
                      id={panelId}
                      key={definition.id}
                      resizeAriaLabel={`${definition.label}カンペのサイズを変更`}
                      renderHeader={() => (
                        <h3>
                          <span>
                            {definition.label}
                            {definition.presentationModeLabel
                              ? <small>{definition.presentationModeLabel}</small>
                              : null}
                          </span>
                        </h3>
                      )}
                      renderDockedActions={({ float }) => (
                        <button
                          aria-label={`${definition.label}を小窓表示`}
                          className="input-layer-card-float"
                          onClick={(event) => float(
                            initialLayerCardRect(event.currentTarget, panelId),
                          )}
                          type="button"
                        >
                          小窓表示
                        </button>
                      )}
                      renderPlaceholder={({ dock }) => (
                        <section className="input-layer-card-placeholder">
                          <strong>{definition.label}</strong>
                          <span>小窓表示中</span>
                          <button
                            aria-label={`${definition.label}を元に戻す`}
                            onClick={dock}
                            type="button"
                          >
                            戻す
                          </button>
                        </section>
                      )}
                    >
                      <p>
                        {triggers.size > 0
                          ? `trigger: ${aggregationTriggerDisplayText(layout, definition.id)}`
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
                    </WorkspacePanel>
                  );
                })}
              </div>
            </WorkspacePanel>
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
          title="ドラッグで幅を調整できます。ダブルクリックで1:1に戻します。"
        />

        <section className="input-main">
          <WorkspacePanel
            ariaLabel="Text Input"
            className="input-capture-panel"
            dockedHeaderAriaLabel="Text Inputをクリックまたはドラッグして小窓表示"
            floatingHeaderAriaLabel="Text Inputを移動"
            headerClassName="input-capture-heading"
            id={INPUT_TYPING_PANEL_ID}
            resizeAriaLabel="Text Inputのサイズを変更"
            renderHeader={() => (
              <>
                <strong>Text Input</strong>
                {randomPracticeMode !== null ? (
                  <span
                    className="input-random-practice-status"
                    data-complete={randomPracticeComplete || undefined}
                    role="status"
                  >
                    {randomPracticeComplete
                      ? `${randomPracticeMode === 'word' ? '単語' : '文章'}モード · 完成！ Enterで次へ`
                      : `${randomPracticeMode === 'word' ? '単語' : '文章'}モード · 打ち切ったら Enterで次へ`}
                  </span>
                ) : null}
                <button type="button" onClick={session.clear}>クリア</button>
              </>
            )}
          >
            <div
              className="input-output-shell"
              data-has-target={lookupQuery.length > 0 || undefined}
            >
              {lookupQuery.length > 0 ? (
                <div
                  aria-hidden="true"
                  className="input-output-visual"
                  data-testid="typing-target"
                >
                  {typingTargetPresentation.typed.map((item, index) => (
                    <span
                      className={item.correct
                        ? 'input-output-char-correct'
                        : 'input-output-char-error'}
                      key={`typed-${index}`}
                    >
                      {item.char}
                    </span>
                  ))}
                  {typingTargetPresentation.remaining.map((char, index) => (
                    <span
                      className="input-output-char-pending"
                      key={`pending-${index}`}
                    >
                      {char}
                    </span>
                  ))}
                </div>
              ) : null}
              <textarea
                className="input-output"
                value={session.text}
                readOnly
                rows={3}
                aria-label="自由入力テキスト"
                aria-describedby="input-capture-help"
                data-active={session.active || undefined}
                ref={session.captureRefCallback}
                onKeyDownCapture={(event) => {
                  if (randomPracticeMode === null || event.key !== 'Enter') return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (!randomPracticeComplete) return;
                  advanceRandomPractice(randomPracticeMode);
                }}
                placeholder={lookupQuery.length === 0
                  ? 'ここをクリックして、そのまま打鍵してください。'
                  : undefined}
              />
            </div>
            <p className="input-capture-hint" id="input-capture-help">
              {session.active ? '入力を受け付けています。' : '入力欄をクリックすると入力を開始します。'}
              {' '}Backspaceで1文字削除します。
              {randomPracticeMode === null
                ? ' Enterで改行します。'
                : ' ランダム練習中は完成後Enterで次のお題へ進みます。'}
              {escapeIsLayoutInput ? ' Escは配列入力として扱います。' : ' Escで全削除します。'}
              {session.composing ? ' IME composition中は認識を停止しています。' : ''}
            </p>
          </WorkspacePanel>

          <WorkspacePanel
            ariaLabel="Keyboard View"
            className="input-keyboard-panel"
            dockClassName="input-panel-dock"
            dockedHeaderAriaLabel="Keyboard Viewをクリックまたはドラッグして小窓表示"
            floatingHeaderAriaLabel="Keyboard Viewを移動"
            headerClassName="input-keyboard-panel-heading"
            id={INPUT_KEYBOARD_PANEL_ID}
            resizeAriaLabel="Keyboard Viewのサイズを変更"
            renderHeader={() => (
              <>
                <strong>Keyboard View</strong>
                <span className="input-keyboard-help">
                  キーをクリックすると実キーの割り当てを変更できます。
                </span>
              </>
            )}
          >
            <div className="input-keyboard-toolbar">
              <div className="input-display-options" aria-label="表示設定">
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
                    onChange={(event) => {
                      if (!event.target.checked) {
                        workspace.dispatch({ type: 'dock', id: INPUT_LAYER_GUIDE_PANEL_ID });
                        for (const definition of guideDefinitions) {
                          workspace.dispatch({
                            type: 'dock',
                            id: layerGuideCardPanelId(definition.id),
                          });
                        }
                      }
                      setShowLayerGuide(event.target.checked);
                    }}
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
              <div className="input-key-status" aria-label="Key status">
                <section>
                  <h2>Pressed</h2>
                  <p>{session.pressedKeys.length > 0 ? session.pressedKeys.join(' + ') : '—'}</p>
                </section>
                <section>
                  <h2>Recognized</h2>
                  <RecognizedDetail recognized={session.lastRecognized} />
                </section>
              </div>
            </div>
            {bindingTargetKey !== undefined ? (
              <div className="input-keyboard-heading">
                <div className="input-key-binding-inline" aria-label="物理キー割当">
                  <strong>{bindingTargetKey}</strong>
                  <span aria-hidden="true">←</span>
                  <div className="input-key-binding-codes">
                    {selectedBindingCodes.length === 0
                      ? <span className="input-muted">未割当</span>
                      : selectedBindingCodes.map((code) => (
                        <button
                          aria-label={`${bindingTargetKey}から${code}を削除`}
                          className="input-binding-chip"
                          key={code}
                          onClick={() => updateBindingOverrides(
                            unassignBrowserKeyCode(bindingOverrides, code),
                          )}
                          type="button"
                        >
                          <code>{code}</code>
                          <span aria-hidden="true">×</span>
                        </button>
                      ))}
                  </div>
                  <button
                    className="input-binding-add"
                    data-capturing={bindingCapturing || undefined}
                    onClick={() => setBindingCapturing((current) => !current)}
                    type="button"
                  >
                    {bindingCapturing ? '実キーを押してください…' : 'キーを追加'}
                  </button>
                  <button
                    className="input-binding-reset"
                    onClick={() => {
                      updateBindingOverrides({});
                      setBindingCapturing(false);
                    }}
                    type="button"
                  >
                    すべて既定に戻す
                  </button>
                  <button
                    className="input-binding-close"
                    onClick={() => {
                      setBindingTargetKey(undefined);
                      setBindingCapturing(false);
                    }}
                    type="button"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ) : null}
            <div className="input-keyboard-content">
              <div className="input-keyboard-stage">
                <div className="input-keyboard-main">
              <PhysicalKeyboard
                ariaLabel="現在の物理キー状態"
                geometryId={geometry.id}
                horizontalAlign="left"
                keys={visibleKeys}
                keyViews={keyboardViews}
                selectedKeyId={bindingTargetKey}
                onKeyClick={(key) => {
                  setBindingTargetKey(key.id);
                  setBindingCapturing(true);
                }}
              />
                </div>
                <WorkspacePanel
                  ariaLabel="Practice Text"
                  className="input-assist-slot"
                  dockClassName="input-panel-dock"
                  dockedHeaderAriaLabel="Practice Textをクリックまたはドラッグして小窓表示"
                  floatingHeaderAriaLabel="Practice Textを移動"
                  headerClassName="input-lookup-field-heading"
                  id={INPUT_LOOKUP_PANEL_ID}
                  resizeAriaLabel="Practice Textのサイズを変更"
                  renderHeader={() => (
                    <>
                      <span>Practice Text</span>
                      <span className="input-random-samples">
                        <span>ランダム</span>
                        <button
                          aria-label="ランダムな単語"
                          aria-pressed={randomPracticeMode === 'word'}
                          data-active={randomPracticeMode === 'word' || undefined}
                          disabled={playableRandomSamples.words.length === 0}
                          onClick={() => startOrAdvanceRandomPractice('word')}
                          type="button"
                        >
                          単語
                        </button>
                        <button
                          aria-label="ランダムな文章"
                          aria-pressed={randomPracticeMode === 'phrase'}
                          data-active={randomPracticeMode === 'phrase' || undefined}
                          disabled={playableRandomSamples.phrases.length === 0}
                          onClick={() => startOrAdvanceRandomPractice('phrase')}
                          type="button"
                        >
                          文章
                        </button>
                        {randomPracticeMode !== null ? (
                          <button
                            aria-label="ランダム練習を停止"
                            className="input-random-stop"
                            onClick={stopRandomPractice}
                            type="button"
                          >
                            停止
                          </button>
                        ) : null}
                      </span>
                    </>
                  )}
                >
                  <div className="input-lookup-content">
              <div
                className="input-lookup-field input-lookup-field-body"
                data-random-practice-mode={randomPracticeMode ?? undefined}
              >
                <input
                  aria-label="打ちたい文字"
                  type="text"
                  value={lookupQuery}
                  onChange={(event) => {
                    setRandomPracticeMode(null);
                    setLookupQuery(event.target.value);
                    setLookupStepIndex(0);
                  }}
                  placeholder="例: ぎゃ"
                  autoComplete="off"
                />
              </div>
              <div className="input-lookup-results" aria-live="polite">
                {lookupQuery.length === 0 ? (
                  <span className="input-muted">文字を入力するとcanonical inputから逆引きします。</span>
                ) : activeLookupRoute === undefined
                  || activeLookupStep === undefined
                  || activeLookupAction === undefined ? (
                  <span className="input-muted">この配列では打ち方が見つかりません。</span>
                ) : (
                  <>
                    <div className="input-lookup-guide" aria-label="入力順ガイド">
                      <span className="input-lookup-nav">
                        <button
                          aria-label="前の入力単位"
                          disabled={lookupStepIndex <= 0}
                          onClick={() => setLookupStepIndex((current) => Math.max(0, current - 1))}
                          type="button"
                        >
                          ←
                        </button>
                        <button
                          aria-label="次の入力単位"
                          disabled={activeLookupGuideIndex >= activeLookupGuideActions.length - 1}
                          onClick={() => setLookupStepIndex((current) =>
                            Math.min(activeLookupGuideActions.length - 1, current + 1))}
                          type="button"
                        >
                          →
                        </button>
                      </span>
                      <span className="input-lookup-progress">
                        {Math.min(activeLookupGuideIndex + 1, activeLookupGuideActions.length)}
                        {' / '}
                        {activeLookupGuideActions.length}
                      </span>
                      <strong>{activeLookupAction.output}</strong>
                      <code>{reverseLookupGuideActionLabel(layout, activeLookupAction)}</code>
                    </div>
                    <ol>
                      <li data-active>
                        <code>{reverseLookupRouteLabel(layout, activeLookupRoute)}</code>
                        <small>ガイド中</small>
                        {activeLookupRoute.steps.some((step) => step.origin === 'combo')
                          ? <small>コンボ</small>
                          : null}
                        {otherLookupRoutes.length > 0 ? (
                          <span className="input-lookup-alt">
                            <button
                              aria-describedby="input-lookup-alt-popover"
                              aria-label={`他の打ち方 ${otherLookupRoutes.length}件`}
                              className="input-lookup-alt-toggle"
                              type="button"
                            >
                              {`+${otherLookupRoutes.length}`}
                            </button>
                            {/*
                              hoverだけでなくkeyboard focusでも開くよう、buttonのfocusを
                              :focus-withinで拾う。中身は読み上げ用のstatic textだけなので
                              tooltipとして扱ってよい。
                            */}
                            <div
                              className="input-lookup-alt-popover"
                              id="input-lookup-alt-popover"
                              role="tooltip"
                            >
                              <span className="input-lookup-alt-heading">他の打ち方</span>
                              <ol>
                                {otherLookupRoutes.map((route, index) => (
                                  <li key={`${reverseLookupRouteLabel(layout, route)}:${index}`}>
                                    <code>{reverseLookupRouteLabel(layout, route)}</code>
                                    {route.steps.some((step) => step.origin === 'combo')
                                      ? <small>コンボ</small>
                                      : null}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </span>
                        ) : null}
                      </li>
                    </ol>
                  </>
                )}
                  </div>
                  </div>
                </WorkspacePanel>
              </div>


            </div>
          </WorkspacePanel>
        </section>
      </div>
    </section>
    </WorkspaceProvider>
  );
}
