/**
 * pointermove連打やフォーム変更のたびにstorageへ書かないための、汎用の書き込みコアレッシング。
 * WorkspacePersistenceScheduler（Phase 5）と入力コンバータの設定永続化（Phase 6）が
 * 同じdebounce/flush/cancelの形を必要としたため、書き込み先の型に依存しない形へ括り出す。
 */
export interface DebouncedPersistenceScheduler<T> {
  /** 値の変化を通知する。実際の書き込みはdebounce後にまとめて行う */
  notify(value: T): void;
  /** pagehide / visibilitychange(hidden) 用の即時書き込み */
  flush(): void;
  /** アンマウント時の後始末。保留中の書き込みは破棄する */
  cancel(): void;
}

export interface DebouncedPersistenceSchedulerOptions<T> {
  /** 実際の書き込み処理。失敗しても例外を外へ投げない実装を渡すこと */
  write: (value: T) => void;
  /** 直前に書いた値と同じかどうかの比較に使う。同じなら書き込みを省く */
  serialize: (value: T) => string;
  debounceMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

const DEFAULT_DEBOUNCE_MS = 400;

export function createDebouncedPersistenceScheduler<T>(
  options: DebouncedPersistenceSchedulerOptions<T>,
): DebouncedPersistenceScheduler<T> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: T | undefined;
  let lastSerialized: string | undefined;

  const writeNow = (value: T) => {
    const serialized = options.serialize(value);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    options.write(value);
  };

  return {
    notify(value) {
      pending = value;
      if (timer !== undefined) clearTimeoutFn(timer);
      timer = setTimeoutFn(() => {
        timer = undefined;
        const next = pending;
        pending = undefined;
        if (next !== undefined) writeNow(next);
      }, debounceMs);
    },
    flush() {
      if (timer !== undefined) {
        clearTimeoutFn(timer);
        timer = undefined;
      }
      const next = pending;
      pending = undefined;
      if (next !== undefined) writeNow(next);
    },
    cancel() {
      if (timer !== undefined) {
        clearTimeoutFn(timer);
        timer = undefined;
      }
      pending = undefined;
    },
  };
}
