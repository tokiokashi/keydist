import type { FingerClass } from '../../bigram-vectors.ts';
import {
  DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG,
  type BigramFlowDisplayConfig,
  type KeyboardFlowHoverScale,
  type KeyboardFlowLayerOrder,
  type KeyboardFlowWeightScale,
} from '../bigram-vector/bigram-flow-view-config.ts';
import type { MovementScaleMode } from '../bigram-vector/movement-profile-scale.ts';
import {
  validateStandaloneViewSearch,
  type StandaloneViewSearch,
} from './route-state.ts';

const FINGERS: readonly FingerClass[] = ['index', 'middle', 'ring', 'pinky'];
const LINE_SCALES: readonly KeyboardFlowWeightScale[] = ['linear', 'sqrt', 'log'];
const LAYER_ORDERS: readonly KeyboardFlowLayerOrder[] = [
  'weight',
  'same-hand-top',
  'cross-hand-top',
];
const HOVER_SCALES: readonly KeyboardFlowHoverScale[] = ['key', 'global'];
const MOVEMENT_SCALE_MODES: readonly MovementScaleMode[] = ['fit', 'fixed'];

export interface BigramFlowRouteSearch extends StandaloneViewSearch {
  source?: BigramFlowDisplayConfig['source'];
  fingers?: string;
  lineScale?: KeyboardFlowWeightScale;
  layerOrder?: KeyboardFlowLayerOrder;
  hoverScale?: KeyboardFlowHoverScale;
  movementScale?: MovementScaleMode;
  bandwidth?: number;
  gain?: number;
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' && allowed.includes(value as T)
    ? value as T
    : undefined;
}

function numberValue(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : undefined;
}

function integerValue(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const parsed = numberValue(value, min, max);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function normalizeFingers(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const selected = [...new Set(
    value
      .split(',')
      .map((finger) => finger.trim())
      .filter((finger): finger is FingerClass => FINGERS.includes(finger as FingerClass)),
  )].slice(0, 2);
  return selected.length === 0 ? undefined : selected.join(',');
}

export function validateBigramFlowSearch(
  raw: Record<string, unknown>,
): BigramFlowRouteSearch {
  const base = validateStandaloneViewSearch(raw);
  const source = choice(raw.source, ['actual', 'within-hand'] as const);
  const fingers = normalizeFingers(raw.fingers);
  const lineScale = choice(raw.lineScale, LINE_SCALES);
  const layerOrder = choice(raw.layerOrder, LAYER_ORDERS);
  const hoverScale = choice(raw.hoverScale, HOVER_SCALES);
  const movementScale = choice(raw.movementScale, MOVEMENT_SCALE_MODES);
  const bandwidth = integerValue(raw.bandwidth, 4, 45);
  const gain = numberValue(raw.gain, 0.25, 3);

  return {
    ...base,
    ...(source === undefined ? {} : { source }),
    ...(fingers === undefined ? {} : { fingers }),
    ...(lineScale === undefined ? {} : { lineScale }),
    ...(layerOrder === undefined ? {} : { layerOrder }),
    ...(hoverScale === undefined ? {} : { hoverScale }),
    ...(movementScale === undefined ? {} : { movementScale }),
    ...(bandwidth === undefined ? {} : { bandwidth }),
    ...(gain === undefined ? {} : { gain }),
  };
}

export function bigramFlowConfigFromSearch(
  search: BigramFlowRouteSearch,
): BigramFlowDisplayConfig {
  const selectedFingers = search.fingers?.split(',')
    .filter((finger): finger is FingerClass => FINGERS.includes(finger as FingerClass))
    .slice(0, 2) ?? [];

  return {
    source: search.source ?? DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.source,
    selectedFingers,
    lineScale: search.lineScale ?? DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.lineScale,
    layerOrder: search.layerOrder ?? DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.layerOrder,
    hoverScale: search.hoverScale ?? DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.hoverScale,
    movementScaleMode:
      search.movementScale ?? DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.movementScaleMode,
    polarBandwidth: search.bandwidth ?? DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.polarBandwidth,
    polarGain: search.gain ?? DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.polarGain,
  };
}

/**
 * Keep ordinary standalone URLs compact: defaults are omitted and only ViewConfig is written.
 * AnalysisSession state never enters this payload.
 */
export function bigramFlowConfigSearchPatch(
  config: BigramFlowDisplayConfig,
): Pick<
  BigramFlowRouteSearch,
  | 'source'
  | 'fingers'
  | 'lineScale'
  | 'layerOrder'
  | 'hoverScale'
  | 'movementScale'
  | 'bandwidth'
  | 'gain'
> {
  return {
    source: config.source === DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.source
      ? undefined
      : config.source,
    fingers: config.selectedFingers.length === 0
      ? undefined
      : [...new Set(config.selectedFingers)].slice(0, 2).join(','),
    lineScale: config.lineScale === DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.lineScale
      ? undefined
      : config.lineScale,
    layerOrder: config.layerOrder === DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.layerOrder
      ? undefined
      : config.layerOrder,
    hoverScale: config.hoverScale === DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.hoverScale
      ? undefined
      : config.hoverScale,
    movementScale:
      config.movementScaleMode === DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.movementScaleMode
        ? undefined
        : config.movementScaleMode,
    bandwidth: config.polarBandwidth === DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.polarBandwidth
      ? undefined
      : config.polarBandwidth,
    gain: config.polarGain === DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.polarGain
      ? undefined
      : config.polarGain,
  };
}
