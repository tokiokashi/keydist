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
      // 重複排除はしない。同じ値かどうかは、適用時点の資産と比べるコマンド側の no-op 判定に
      // 任せる。スケジューラの「前回自分が書いた値」との比較は、他タブやUndoで資産が変わった後に
      // 同じ値へ戻す書き込みを捨ててしまう（#544 レビュー）
      debounceMs: options.debounceMs,
    });
  }

  useEffect(() => {
    // debounce待ち中の値を取りこぼさないよう、アンマウント・ページ離脱・タブの非表示化の
    // いずれでも`flush()`する（レビュー指摘: アンマウントで`cancel()`していたため、
    // debounce完了前に画面遷移・リロードすると直前の変更が消えていた。
    // `pagehide`はリロード・別ページへの遷移・タブを閉じる操作を、
    // `visibilitychange`（`hidden`）はタブ切り替え・OSのスリープ等、`pagehide`が
    // 発火しない離脱もまとめて拾うための保険。`flush()`は保留中の値を取り出してから
    // 書くので、両方が発火しても2回目は何もしない）。
    const flush = () => schedulerRef.current?.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, []);

  return useMemo(() => (value: T) => schedulerRef.current!.notify(value), []);
}
