import type { Finger, Geometry } from '../geometry.ts';
import type { Layout } from '../layouts/index.ts';
import type {
  PlaybackInputPreviewSegment,
  PlaybackRateChartPoint,
} from '../playback.ts';
import type { PlaybackKeyFeedbackStyle } from './ui-state.ts';

export type AnalyzerPlaybackDynamicDisplay = 'none' | 'chain' | 'arpeggio' | 'both';

export interface AnalyzerPlaybackMotion {
  fromKey: string;
  toKey: string;
  kind: 'sameFinger' | 'chain';
  durationMs: number;
}

export interface AnalyzerPlaybackSurfaceData {
  layout: Layout;
  geometry: Geometry;
  panelOpen: boolean;
  rateChartOpen: boolean;
  settingsOpen: boolean;
  total: number;
  cursor: number;
  playing: boolean;
  isRomaji: boolean;
  currentText: string;
  kanaText: string;
  typedText: string;
  plannedText?: string;
  inputPreview: readonly PlaybackInputPreviewSegment[];
  layerLabel: string;
  structureLabel: string;
  effectiveKanaRate: string;
  effectiveRate: string;
  settingsSummary: string;
  keyLabels: ReadonlyMap<string, string>;
  activeKeys: ReadonlySet<string>;
  triggerKeys: ReadonlySet<string>;
  fingerPositionKeys: ReadonlyMap<string, Finger>;
  trailKeys: ReadonlyMap<string, number>;
  plannedKeys: ReadonlyMap<string, number>;
  plannedOrders: ReadonlyMap<string, number>;
  trailOrders: ReadonlyMap<string, number>;
  chainOrders: ReadonlyMap<string, number>;
  arpeggioOrders: ReadonlyMap<string, number>;
  motions: readonly AnalyzerPlaybackMotion[];
  motionRevision: number;
  feedbackKeys: ReadonlySet<string>;
  feedbackStyle: PlaybackKeyFeedbackStyle;
  feedbackRevision: number;
  rateChartPoints: readonly PlaybackRateChartPoint[];
  rateChartDisplay: AnalyzerPlaybackDynamicDisplay;
  scale: number;
}

export interface AnalyzerPlaybackSurfaceSnapshot {
  data?: AnalyzerPlaybackSurfaceData;
  revision: number;
}

export interface AnalyzerPlaybackSurfaceActions {
  setPanelOpen(open: boolean): void;
  setRateChartOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  togglePlay(): void;
  stop(): void;
  step(delta: -1 | 1): void;
  beginSeek(): void;
  seek(cursor: number): void;
  finishSeek(): void;
}

export interface AnalyzerPlaybackSurfaceModel {
  getSnapshot(): AnalyzerPlaybackSurfaceSnapshot;
  subscribe(listener: () => void): () => void;
  setData(data: AnalyzerPlaybackSurfaceData): void;
  clear(): void;
}

/**
 * Playback runtimeが導出した表示snapshotだけをReactへ渡す。
 * durable stateはAppState、runtime state machineはPlaybackViewがauthority。
 */
export function createAnalyzerPlaybackSurfaceModel(): AnalyzerPlaybackSurfaceModel {
  let snapshot: AnalyzerPlaybackSurfaceSnapshot = { revision: 0 };
  const listeners = new Set<() => void>();

  const publish = (data?: AnalyzerPlaybackSurfaceData) => {
    snapshot = {
      data,
      revision: snapshot.revision + 1,
    };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setData: (data) => publish(data),
    clear: () => publish(undefined),
  };
}
