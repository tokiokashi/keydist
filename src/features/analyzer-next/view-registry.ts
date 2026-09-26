import type { FingerClass } from '../../bigram-vectors.ts';
import type { MatrixSort } from '#legacy/chart.ts';
import type {
  LayerColorScale,
  LayerView,
  MatrixKind,
  PlaybackKeyFeedbackStyle,
  SensitivityScale,
} from '#legacy/ui-state.ts';
import {
  DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG,
  type BigramFlowDisplayConfig,
} from '../bigram-vector/bigram-flow-view-config.ts';
import type {
  AnalysisViewDefinition,
  AnalysisViewType,
} from './view-contract.ts';

export type BigramFlowViewConfig = BigramFlowDisplayConfig;

export interface HeatmapViewConfig {
  view: LayerView;
  colorScale: LayerColorScale;
  showLayerDetails: boolean;
  keyPatternGuide: boolean;
  activeLayerId?: string;
  panels: {
    layerStats: boolean;
    modifierList: boolean;
    comboTable: boolean;
  };
}

export interface ComparisonViewConfig {
  baselineLayoutId?: string;
  chartColumn: number;
  sort: MatrixSort | null;
}

export interface MatricesViewConfig {
  sorts: Record<MatrixKind, MatrixSort | null>;
}

export interface SensitivityViewConfig {
  scale: SensitivityScale;
}

export interface PlaybackViewConfig {
  showFingers: boolean;
  showRomajiPlan: boolean;
  showPlanKeys: boolean;
  showTrail: boolean;
  trailTau: number;
  showOrderLabels: boolean;
  showSameFingerMotion: boolean;
  keyFeedbackStyle: PlaybackKeyFeedbackStyle;
  fingerPreparationSeconds: number;
  showChain: boolean;
  showArpeggio: boolean;
  showChainOnRateChart: boolean;
  showArpeggioOnRateChart: boolean;
  scale: number;
  playbackOpen: boolean;
  playbackRateChartOpen: boolean;
}

const BIGRAM_DEFAULTS: BigramFlowViewConfig = DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG;

const HEATMAP_DEFAULTS: HeatmapViewConfig = {
  view: 'auto',
  colorScale: 'linear',
  showLayerDetails: false,
  keyPatternGuide: true,
  panels: {
    layerStats: false,
    modifierList: false,
    comboTable: false,
  },
};

const COMPARISON_DEFAULTS: ComparisonViewConfig = {
  chartColumn: 1,
  sort: null,
};

const MATRICES_DEFAULTS: MatricesViewConfig = {
  sorts: {
    press: null,
    finger: null,
    adjacentMean: null,
    adjacentStdDev: null,
  },
};

const SENSITIVITY_DEFAULTS: SensitivityViewConfig = {
  scale: 'relative',
};

const PLAYBACK_DEFAULTS: PlaybackViewConfig = {
  showFingers: false,
  showRomajiPlan: true,
  showPlanKeys: false,
  showTrail: false,
  trailTau: 5,
  showOrderLabels: false,
  showSameFingerMotion: false,
  keyFeedbackStyle: 'fade',
  fingerPreparationSeconds: 0,
  showChain: false,
  showArpeggio: false,
  showChainOnRateChart: false,
  showArpeggioOnRateChart: false,
  scale: 1.5,
  playbackOpen: false,
  playbackRateChartOpen: false,
};

function record(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && allowed.includes(value as T)
    ? value as T
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function finite(
  value: unknown,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= min
    && value <= max
    ? value
    : fallback;
}

function integer(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= min
    && value <= max
    ? value
    : fallback;
}

function matrixSort(raw: unknown, maxColumn: number): MatrixSort | null {
  const source = record(raw);
  if (
    typeof source.column !== 'number'
    || !Number.isInteger(source.column)
    || source.column < 0
    || source.column > maxColumn
    || (source.direction !== 'asc' && source.direction !== 'desc')
  ) {
    return null;
  }
  return { column: source.column, direction: source.direction };
}

const simpleDefinition = (
  type: AnalysisViewType,
  title: string,
  cardinality: 'single' | 'set',
  canDuplicate = true,
): AnalysisViewDefinition<Record<string, never>> => ({
  type,
  title,
  cardinality,
  canDuplicate,
  configCodec: {
    version: 1,
    defaults: {},
    decode: () => ({}),
  },
});

export const ANALYSIS_VIEW_DEFINITIONS = new Map<
  AnalysisViewType,
  AnalysisViewDefinition
>([
  ['bigram-flow', {
    type: 'bigram-flow',
    title: 'Bigram Flow',
    cardinality: 'single',
    canDuplicate: true,
    minWidth: 520,
    minHeight: 360,
    describeConfig(config: BigramFlowViewConfig) {
      return [
        { label: 'source', value: config.source },
        {
          label: 'fingers',
          value: config.selectedFingers.length === 0
            ? 'all'
            : config.selectedFingers.join('+'),
        },
        { label: 'line', value: config.lineScale },
        { label: 'layer', value: config.layerOrder },
        { label: 'hover', value: config.hoverScale },
        { label: 'movement', value: config.movementScaleMode },
        { label: 'bandwidth', value: `±${config.polarBandwidth}°` },
        { label: 'gain', value: `${config.polarGain}×` },
      ];
    },
    configCodec: {
      version: 1,
      defaults: BIGRAM_DEFAULTS,
      decode(raw): BigramFlowViewConfig {
        const source = record(raw);
        const selectedFingers = Array.isArray(source.selectedFingers)
          ? source.selectedFingers.filter(
              (value): value is FingerClass =>
                value === 'pinky' || value === 'ring' || value === 'middle' || value === 'index',
            )
          : [];
        return {
          source: choice(source.source, ['actual', 'within-hand'], BIGRAM_DEFAULTS.source),
          selectedFingers: [...new Set(selectedFingers)],
          lineScale: choice(source.lineScale, ['linear', 'sqrt', 'log'], BIGRAM_DEFAULTS.lineScale),
          layerOrder: choice(
            source.layerOrder,
            ['weight', 'same-hand-top', 'cross-hand-top'],
            BIGRAM_DEFAULTS.layerOrder,
          ),
          hoverScale: choice(
            source.hoverScale,
            ['key', 'global'],
            BIGRAM_DEFAULTS.hoverScale,
          ),
          movementScaleMode: choice(
            source.movementScaleMode,
            ['fit', 'fixed'],
            BIGRAM_DEFAULTS.movementScaleMode,
          ),
          polarBandwidth: integer(
            source.polarBandwidth,
            BIGRAM_DEFAULTS.polarBandwidth,
            4,
            45,
          ),
          polarGain: finite(
            source.polarGain,
            BIGRAM_DEFAULTS.polarGain,
            0.25,
            3,
          ),
        };
      },
    },
  }],
  ['heatmap', {
    type: 'heatmap',
    title: 'Heatmap',
    cardinality: 'single',
    canDuplicate: true,
    minWidth: 480,
    minHeight: 320,
    configCodec: {
      version: 1,
      defaults: HEATMAP_DEFAULTS,
      decode(raw): HeatmapViewConfig {
        const source = record(raw);
        const panels = record(source.panels);
        return {
          view: choice(source.view, ['auto', 'side-by-side', 'tabs'], HEATMAP_DEFAULTS.view),
          colorScale: choice(source.colorScale, ['linear', 'log'], HEATMAP_DEFAULTS.colorScale),
          showLayerDetails: bool(source.showLayerDetails, HEATMAP_DEFAULTS.showLayerDetails),
          keyPatternGuide: bool(source.keyPatternGuide, HEATMAP_DEFAULTS.keyPatternGuide),
          ...(typeof source.activeLayerId === 'string' && source.activeLayerId.length > 0
            ? { activeLayerId: source.activeLayerId }
            : {}),
          panels: {
            layerStats: bool(panels.layerStats, HEATMAP_DEFAULTS.panels.layerStats),
            modifierList: bool(panels.modifierList, HEATMAP_DEFAULTS.panels.modifierList),
            comboTable: bool(panels.comboTable, HEATMAP_DEFAULTS.panels.comboTable),
          },
        };
      },
    },
  }],
  ['finger-metrics', simpleDefinition('finger-metrics', 'Finger Metrics', 'single')],
  ['matrices', {
    type: 'matrices',
    title: 'Matrices',
    cardinality: 'set',
    canDuplicate: true,
    configCodec: {
      version: 1,
      defaults: MATRICES_DEFAULTS,
      decode(raw): MatricesViewConfig {
        const sorts = record(record(raw).sorts);
        return {
          sorts: {
            press: matrixSort(sorts.press, 9),
            finger: matrixSort(sorts.finger, 9),
            adjacentMean: matrixSort(sorts.adjacentMean, 5),
            adjacentStdDev: matrixSort(sorts.adjacentStdDev, 5),
          },
        };
      },
    },
  }],
  ['comparison', {
    type: 'comparison',
    title: 'Comparison',
    cardinality: 'set',
    canDuplicate: true,
    configCodec: {
      version: 1,
      defaults: COMPARISON_DEFAULTS,
      decode(raw): ComparisonViewConfig {
        const source = record(raw);
        return {
          ...(typeof source.baselineLayoutId === 'string' && source.baselineLayoutId.length > 0
            ? { baselineLayoutId: source.baselineLayoutId }
            : {}),
          chartColumn: integer(source.chartColumn, COMPARISON_DEFAULTS.chartColumn, 0, 12),
          sort: matrixSort(source.sort, 12),
        };
      },
    },
  }],
  ['sensitivity', {
    type: 'sensitivity',
    title: 'N Sensitivity',
    cardinality: 'set',
    canDuplicate: true,
    configCodec: {
      version: 1,
      defaults: SENSITIVITY_DEFAULTS,
      decode(raw): SensitivityViewConfig {
        return {
          scale: choice(record(raw).scale, ['relative', 'absolute'], SENSITIVITY_DEFAULTS.scale),
        };
      },
    },
  }],
  ['playback', {
    type: 'playback',
    title: 'Playback',
    cardinality: 'single',
    canDuplicate: true,
    configCodec: {
      version: 1,
      defaults: PLAYBACK_DEFAULTS,
      decode(raw): PlaybackViewConfig {
        const source = record(raw);
        return {
          showFingers: bool(source.showFingers, PLAYBACK_DEFAULTS.showFingers),
          showRomajiPlan: bool(source.showRomajiPlan, PLAYBACK_DEFAULTS.showRomajiPlan),
          showPlanKeys: bool(source.showPlanKeys, PLAYBACK_DEFAULTS.showPlanKeys),
          showTrail: bool(source.showTrail, PLAYBACK_DEFAULTS.showTrail),
          trailTau: integer(source.trailTau, PLAYBACK_DEFAULTS.trailTau, 1, 20),
          showOrderLabels: bool(source.showOrderLabels, PLAYBACK_DEFAULTS.showOrderLabels),
          showSameFingerMotion: bool(
            source.showSameFingerMotion,
            PLAYBACK_DEFAULTS.showSameFingerMotion,
          ),
          keyFeedbackStyle: choice(
            source.keyFeedbackStyle,
            ['off', 'fade', 'pulse', 'bounce'],
            PLAYBACK_DEFAULTS.keyFeedbackStyle,
          ),
          fingerPreparationSeconds: finite(
            source.fingerPreparationSeconds,
            PLAYBACK_DEFAULTS.fingerPreparationSeconds,
            0,
          ),
          showChain: bool(source.showChain, PLAYBACK_DEFAULTS.showChain),
          showArpeggio: bool(source.showArpeggio, PLAYBACK_DEFAULTS.showArpeggio),
          showChainOnRateChart: bool(
            source.showChainOnRateChart,
            PLAYBACK_DEFAULTS.showChainOnRateChart,
          ),
          showArpeggioOnRateChart: bool(
            source.showArpeggioOnRateChart,
            PLAYBACK_DEFAULTS.showArpeggioOnRateChart,
          ),
          scale: finite(source.scale, PLAYBACK_DEFAULTS.scale, 0.5, 4),
          playbackOpen: bool(source.playbackOpen, PLAYBACK_DEFAULTS.playbackOpen),
          playbackRateChartOpen: bool(
            source.playbackRateChartOpen,
            PLAYBACK_DEFAULTS.playbackRateChartOpen,
          ),
        };
      },
    },
  }],
]);

export function analysisViewDefinition(type: AnalysisViewType): AnalysisViewDefinition {
  const definition = ANALYSIS_VIEW_DEFINITIONS.get(type);
  if (!definition) throw new Error(`Unknown Analysis View type: ${type}`);
  return definition;
}
