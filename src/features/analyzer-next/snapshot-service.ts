export interface SnapshotResolution<Input> {
  key: string;
  input: Input;
}

export interface AnalysisSnapshotServiceOptions<Input, Snapshot> {
  resolve(layoutId: string): SnapshotResolution<Input> | undefined;
  evaluate(input: Input): Snapshot;
}

export interface AnalysisSnapshotService<Snapshot> {
  get(layoutId: string): Snapshot | undefined;
  invalidateLayout(layoutId: string): void;
  clear(): void;
  cacheSize(): number;
}

/**
 * Snapshot cache is keyed by the fully resolved analysis input, not by UI/session revision.
 * Focus, timing conditions, theme and ViewConfig cannot invalidate this cache because they
 * are intentionally absent from SnapshotResolution.key.
 */
export function createAnalysisSnapshotService<Input, Snapshot>(
  options: AnalysisSnapshotServiceOptions<Input, Snapshot>,
): AnalysisSnapshotService<Snapshot> {
  const cache = new Map<string, Snapshot>();
  const layoutKeys = new Map<string, string>();

  return {
    get(layoutId) {
      const resolved = options.resolve(layoutId);
      if (!resolved) return undefined;
      layoutKeys.set(layoutId, resolved.key);
      if (cache.has(resolved.key)) return cache.get(resolved.key);
      const value = options.evaluate(resolved.input);
      cache.set(resolved.key, value);
      return value;
    },
    invalidateLayout(layoutId) {
      const key = layoutKeys.get(layoutId);
      if (key !== undefined) cache.delete(key);
      layoutKeys.delete(layoutId);
    },
    clear() {
      cache.clear();
      layoutKeys.clear();
    },
    cacheSize: () => cache.size,
  };
}
