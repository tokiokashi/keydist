import { useEffect, useMemo, useRef } from 'react';
import {
  createDebouncedPersistenceScheduler,
  type DebouncedPersistenceScheduler,
} from '#platform/persistence/debounced-scheduler.ts';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';

export interface UseDebouncedCommitOptions<T> {
  /** 値からコマンドを組み立てる。 */
  readonly commandFor: (value: T) => Command<KeydistAssets>;
  /** 直前に書き込んだ値と同じかどうかの比較に使う。既定は`JSON.stringify`（`DebouncedPersistenceScheduler`と同じ既定）。 */
  readonly serialize?: (value: T) => string;
  readonly debounceMs?: number;
}

/**
 * 値の変化をそのつど`dispatch`するのではなく、`createDebouncedPersistenceScheduler`
 * （`platform/persistence/`）で間引いてから`dispatch`する（コーディネーター指示:
 * 「解析設定のスライダー等でstorage書き込みが連打になるなら
 * createDebouncedPersistenceSchedulerを使う。自前でdebounceを書かない」）。
 *
 * `hosts/standalone`は`platform`をimportできない（依存規則。`docs/architecture.md`の
 * `hosts`のALLOWEDに`platform`が無い）ため、debounceの組み立てはここ（`app`）で行い、
 * `hosts`へは「呼べば間引かれて反映される関数」だけを返す。呼び出し側（`hosts`）は
 * 見た目の即時反映（draft state）と、この関数呼び出しによる資産への反映を分けて持つ
 * （`BigramFlowStandalonePage.tsx`の`optionsDraft`参照。既存の`textDraft`と同じ形）。
 */
export function useDebouncedCommit<T>(
  dispatch: (command: Command<KeydistAssets>) => void,
  options: UseDebouncedCommitOptions<T>,
): (value: T) => void {
  // `options`（コールバック含む）はレンダーのたびに新しい参照で渡ってくるので、
  // scheduler自体は初回だけ作り、中身の読み出しはrefで最新化する
  // （`useAssetSyncs`のuseRef遅延初期化と同じ理由。#544 §8-2）。
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const schedulerRef = useRef<DebouncedPersistenceScheduler<T> | undefined>(undefined);
  if (schedulerRef.current === undefined) {
    schedulerRef.current = createDebouncedPersistenceScheduler<T>({
      write: (value) => dispatchRef.current(optionsRef.current.commandFor(value)),
      serialize: (value) => (optionsRef.current.serialize ?? defaultSerialize)(value),
      debounceMs: options.debounceMs,
    });
  }

  useEffect(() => () => schedulerRef.current?.cancel(), []);

  return useMemo(() => (value: T) => schedulerRef.current!.notify(value), []);
}

function defaultSerialize<T>(value: T): string {
  return JSON.stringify(value);
}
