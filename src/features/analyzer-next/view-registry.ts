import type { BigramSource, FingerClass } from '../../bigram-vectors.ts';
import type {
  KeyboardFlowLayerOrder,
  KeyboardFlowWeightScale,
} from '../bigram-vector/bigram-flow-view-config.ts';
import type { LayerColorScale, SensitivityScale } from '../../ui-state.ts';
import type {
  AnalysisViewDefinition,
  AnalysisViewType,
} from './view-contract.ts';

export interface BigramFlowViewConfig {
  source: BigramSource;
  selectedFingers: readonly FingerClass[];
  lineScale: KeyboardFlowWeightScale;
  layerOrder: KeyboardFlowLayerOrder;
}

export interface HeatmapViewConfig {
  colorScale: LayerColorScale;
  showLayerDetails: boolean;
  keyPatternGuide: boolean;
  activeLayerId?: string;
}

export interface SensitivityViewConfig {
  scale: SensitivityScale;
}

const BIGRAM_DEFAULTS: BigramFlowViewConfig = {
  source: 'actual',
  selectedFingers: [],
  lineScale: 'linear',
  layerOrder: 'weight',
};

const HEATMAP_DEFAULTS: HeatmapViewConfig = {
  colorScale: 'linear',
  showLayerDetails: false,
  keyPatternGuide: true,
};

const SENSITIVITY_DEFAULTS: SensitivityViewConfig = {
  scale: 'relative',
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
        return {
          colorScale: choice(source.colorScale, ['linear', 'log'], HEATMAP_DEFAULTS.colorScale),
          showLayerDetails: typeof source.showLayerDetails === 'boolean'
            ? source.showLayerDetails
            : HEATMAP_DEFAULTS.showLayerDetails,
          keyPatternGuide: typeof source.keyPatternGuide === 'boolean'
            ? source.keyPatternGuide
            : HEATMAP_DEFAULTS.keyPatternGuide,
          ...(typeof source.activeLayerId === 'string' && source.activeLayerId.length > 0
            ? { activeLayerId: source.activeLayerId }
            : {}),
        };
      },
    },
  }],
  ['finger-metrics', simpleDefinition('finger-metrics', 'Finger Metrics', 'single')],
  ['matrices', simpleDefinition('matrices', 'Matrices', 'set')],
  ['comparison', simpleDefinition('comparison', 'Comparison', 'set')],
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
  ['playback', simpleDefinition('playback', 'Playback', 'single')],
]);

export function analysisViewDefinition(type: AnalysisViewType): AnalysisViewDefinition {
  const definition = ANALYSIS_VIEW_DEFINITIONS.get(type);
  if (!definition) throw new Error(`Unknown Analysis View type: ${type}`);
  return definition;
}
