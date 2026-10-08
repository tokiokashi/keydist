import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionsDraftPeers, useOptionsWriteLog } from './OptionsWriteLogsContext.ts';
import { applyDraftInput, initialDraftSync, syncDraftWithStored, type DraftSyncState } from './options-draft-sync.ts';

/**
 * 解析設定の下書き（UI用の一時状態）。見た目は即座に変えつつ、資産への書き込みは
 * 呼び出し側がdebounceする。資産側の値（`stored`）が変わった時（初回読み込み・他タブからの
 * 反映・元に戻す等）は下書きをそれに揃え直す。
 *
 * 揃え直しはeffectでなく描画中に行う。effectだと「資産は読み込み済みで操作可能だが、
 * 下書きはまだ読み込み前の既定値」の画面が1フレーム確定し、その間の操作が
 * 「既定値 + 変えた1項目」として書き込まれ、保存済みの設定を消してしまう。
 * 描画中の更新は確定前に描き直される。
 *
 * 比較は参照でなく中身（`stableStringify`。`withStandaloneAnalyzerOptions`が書き込みの
 * 同値判定に使うものと同じ正規化）で行う。解析設定は3つのAnalyzerの分が1つのstorageキーに
 * 入っているので、他タブが別のAnalyzerの設定を書くと記録全体が読み直され、自分のAnalyzerの
 * 設定も中身は同じまま新しい参照になる。参照で比べると、debounce待ちの下書きが保存値へ戻され、
 * 戻っている間の別の変更が先の変更を上書きして失われる。
 *
 * 自分が書いた値の反響は揃え直さない。反響は次の入力より後に届くことがあり、その時に揃え直すと
 * 新しい下書きが1つ前の値へ戻る。書いた値は`app`が書く時に残す記録（`options-write-log.ts`）で
 * 知る。`writeLogKey`は記録の引き先で、保存先の値の持ち主を指す（個別画面は固定の名前、Workspaceは
 * 共有に従うペインなら共有の設定の組、そうでなければペイン）。
 *
 * 同じ`writeLogKey`の下書きが複数ある時（共有に従う複数のペイン）は、入力を互いの下書きへ即座に伝える。
 * 保存はdebounceで遅れるので、伝えないと、片方の待ち中の変更を知らない下書きが、別の項目の変更を
 * 古い全体に重ねて書き、先の変更を消す。持ち主（`writeLogKey`）が変わったら、下書きを保存先から作り直す。
 */
export function useOptionsDraft<T>(stored: T, writeLogKey: string): readonly [T, (next: T) => void] {
  const log = useOptionsWriteLog(writeLogKey);
  const peers = useOptionsDraftPeers();
  const [state, setState] = useState<{ readonly key: string; readonly sync: DraftSyncState<T> }>(
    () => ({ key: writeLogKey, sync: initialDraftSync(stored, log.latestSeq()) }),
  );
  const current = state.key === writeLogKey
    ? state.sync
    : initialDraftSync(stored, log.latestSeq());
  const synced = state.key === writeLogKey ? syncDraftWithStored(current, stored, log.entries(), log.latestSeq()) : current;
  if (state.key !== writeLogKey || synced !== state.sync) setState({ key: writeLogKey, sync: synced });

  const listenerRef = useRef<(value: unknown) => void>(() => {});
  listenerRef.current = (value) => setState((prev) => (
    prev.key === writeLogKey ? { key: prev.key, sync: applyDraftInput(prev.sync, value as T) } : prev
  ));
  // 購読の同一性（自分を除いて伝える時の目印）は、この下書きの存続中は変えない
  const selfRef = useRef<((value: unknown) => void) | undefined>(undefined);
  selfRef.current ??= (value) => listenerRef.current(value);
  const self = selfRef.current;
  useEffect(() => peers.subscribe(writeLogKey, self), [peers, writeLogKey, self]);

  const setDraft = useCallback((next: T) => {
    setState((prev) => (prev.key === writeLogKey ? { key: prev.key, sync: applyDraftInput(prev.sync, next) } : prev));
    peers.publish(writeLogKey, next, self);
  }, [peers, writeLogKey, self]);
  return [synced.draft, setDraft] as const;
}
