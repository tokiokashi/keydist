import type { Options } from './evaluate.ts';
import type { Layout } from './layouts/index.ts';
import type { ChainPolicy } from './analysis-chain.ts';
import type { ArpeggioPolicy } from './analysis-arpeggio.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';
import type {
  UiPlaybackState,
  UiStateConditionsDefaults,
} from './ui-state.ts';

export interface AnalyzerPlaybackSettingsData {
  layout: Layout;
  options: Options;
  playback: UiPlaybackState;
  rate: Pick<
    UiStateConditionsDefaults,
    'playbackRateAverage' | 'playbackRateWindow' | 'playbackRateHalfLifeSeconds'
  >;
  chainPolicy: ChainPolicy;
  arpeggioPolicy: ArpeggioPolicy;
  triggerRealization: TriggerRealizationPolicy;
  actionRealization: ActionRealizationPolicy;
  layoutOverride: boolean;
  calibrationAvailable: boolean;
}

export interface AnalyzerPlaybackSettingsSnapshot {
  data?: AnalyzerPlaybackSettingsData;
  revision: number;
}

export interface AnalyzerPlaybackSettingsModel {
  getSnapshot(): AnalyzerPlaybackSettingsSnapshot;
  subscribe(listener: () => void): () => void;
  setData(data: AnalyzerPlaybackSettingsData): void;
  clear(): void;
}

export type PlaybackSettingsTab = 'display' | 'graph' | 'conditions';

export interface AnalyzerPlaybackSettingsActions {
  close(): void;
  setLayoutOverride(enabled: boolean): void;
  setPlayback<K extends keyof UiPlaybackState>(
    key: K,
    value: UiPlaybackState[K],
  ): void;
  setRateAverage(value: 'sma' | 'ewma'): void;
  setRateWindow(value: number): void;
  setRateHalfLife(value: number): void;
  setChainPolicy(policy: ChainPolicy): void;
  setArpeggioPolicy(policy: ArpeggioPolicy): void;
  setTriggerRealization(policy: TriggerRealizationPolicy): void;
  setActionRealization(policy: ActionRealizationPolicy): void;
  openCalibration(): void;
}

/**
 * Playback settings向けのephemeral snapshot。
 * durable stateはAppState、再生runtimeはPlaybackViewがauthorityのまま。
 */
export function createAnalyzerPlaybackSettingsModel(): AnalyzerPlaybackSettingsModel {
  let snapshot: AnalyzerPlaybackSettingsSnapshot = { revision: 0 };
  const listeners = new Set<() => void>();

  const publish = (data?: AnalyzerPlaybackSettingsData) => {
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
