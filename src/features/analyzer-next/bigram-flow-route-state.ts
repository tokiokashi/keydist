import type { FingerClass } from '../../bigram-vectors.ts';
import {
  DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG,
  type BigramFlowDisplayConfig,
  type KeyboardFlowLayerOrder,
  type KeyboardFlowWeightScale,
} from '../bigram-vector/bigram-flow-view-config.ts';
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

export interface BigramFlowRouteSearch extends StandaloneViewSearch {
  source?: BigramFlowDisplayConfig['source'];
  fingers?: string;
  lineScale?: KeyboardFlowWeightScale;
  layerOrder?: KeyboardFlowLayerOrder;
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' && allowed.includes(value as T)
    ? value as T
    : undefined;
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

  return {
    ...base,
    ...(source === undefined ? {} : { source }),
    ...(fingers === undefined ? {} : { fingers }),
    ...(lineScale === undefined ? {} : { lineScale }),
    ...(layerOrder === undefined ? {} : { layerOrder }),
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
  };
}

/**
 * Keep ordinary standalone URLs compact: defaults are omitted and only bookmark-worthy
 * ViewConfig fields are written. Session state never enters this payload.
 */
export function bigramFlowConfigSearchPatch(
  config: BigramFlowDisplayConfig,
): Pick<BigramFlowRouteSearch, 'source' | 'fingers' | 'lineScale' | 'layerOrder'> {
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
  };
}
