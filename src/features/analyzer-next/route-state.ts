import type { ModeId } from '../../layout-selection.ts';
import {
  ANALYSIS_VIEW_TYPES,
  type AnalysisViewType,
  type ViewBinding,
} from './view-contract.ts';

export interface StandaloneViewSearch {
  mode?: ModeId;
  layout?: string;
}

export function parseAnalysisViewType(raw: unknown): AnalysisViewType | undefined {
  return typeof raw === 'string' && ANALYSIS_VIEW_TYPES.includes(raw as AnalysisViewType)
    ? raw as AnalysisViewType
    : undefined;
}

export function validateStandaloneViewSearch(
  raw: Record<string, unknown>,
): StandaloneViewSearch {
  const mode = raw.mode === 'en' || raw.mode === 'ja' ? raw.mode : undefined;
  const layout = typeof raw.layout === 'string' && raw.layout.length > 0
    ? raw.layout
    : undefined;
  return {
    ...(mode === undefined ? {} : { mode }),
    ...(layout === undefined ? {} : { layout }),
  };
}

export function standaloneBindingFromSearch(
  cardinality: 'single' | 'set',
  search: StandaloneViewSearch,
): ViewBinding {
  if (cardinality === 'set') return { kind: 'session' };
  if (search.mode !== undefined && search.layout !== undefined) {
    return { kind: 'layout', mode: search.mode, id: search.layout };
  }
  return { kind: 'focused-layout' };
}

export function searchFromStandaloneBinding(
  binding: ViewBinding,
): StandaloneViewSearch {
  return binding.kind === 'layout'
    ? { mode: binding.mode, layout: binding.id }
    : {};
}
