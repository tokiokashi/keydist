import { stableStringify } from '#engine/cache-key.ts';
import type { OptionsWrite } from './options-write-log.ts';

/**
 * 解析設定の下書きと保存先（資産）の同期の判断。`useOptionsDraft`から切り出した純粋な部分で、
 * React無しでテストできる。
 *
 * 下書きを保存先へ揃え直すのは「外からの変更」のときだけにする。自分が書いた値の反響まで
 * 揃え直すと、反響が利用者の次の入力より後に届いた時に、下書きが1つ前の値へ戻る
 * （debounce約400msのあいだ、チェックが外れた状態に戻る等。#935）。
 *
 * 反響かどうかは、書く側が実際に書いた時に残した記録（`options-write-log.ts`）で決める。
 * 入力の時刻から書かれたかを推測すると、timerの遅れや書き込みの有無で外れ、書かれなかった値が
 * 反響として残って、後の「元に戻す」で保存先がその値へ戻った時に取り違える。
 */

export interface DraftSyncState<T> {
  readonly draft: T;
  /** 最後に見た保存先の値 */
  readonly source: T;
  /** ここまでの番号の書き込みは、反響として届いたか外からの変更に呑まれたので、もう見ない */
  readonly seen: number;
}

/** `seen`は、この下書きを作った時点の書き込みの最後の番号（それ以前の書き込みは自分の分ではない）。 */
export function initialDraftSync<T>(stored: T, seen: number): DraftSyncState<T> {
  return { draft: stored, source: stored, seen };
}

/** 利用者の入力で下書きを更新する。 */
export function applyDraftInput<T>(state: DraftSyncState<T>, next: T): DraftSyncState<T> {
  return { ...state, draft: next };
}

/**
 * 保存先の値が変わった時の下書きの扱い。`writes`は書き込みの記録、`latest`はその最後の番号。
 * - 参照が同じ: 何もしない
 * - 中身が同じ（他タブが別のAnalyzerの設定を書いて記録全体が読み直された等）: 下書きを触らない（#606）
 * - まだ見ていない書き込みと同じ値になった（反響）: 下書きを触らない。最も新しい同じ値の書き込みまでを見たことにする
 * - それ以外（元に戻す・やり直す・別タブ・共有URL・既定値へ戻す等）: 下書きを保存先に揃え、
 *   今ある書き込みはすべて見たことにする。保存先が動かなかった書き込み（同じ値の書き込み）が残って、
 *   後の元に戻す・やり直すを反響と取り違えないため
 */
export function syncDraftWithStored<T>(
  state: DraftSyncState<T>,
  stored: T,
  writes: readonly OptionsWrite[],
  latest: number,
): DraftSyncState<T> {
  if (state.source === stored) return state;
  if (stableStringify(state.source) === stableStringify(stored)) return { ...state, source: stored };
  const key = stableStringify(stored);
  for (let i = writes.length - 1; i >= 0; i--) {
    const write = writes[i]!;
    if (write.seq > state.seen && write.key === key) return { ...state, source: stored, seen: write.seq };
  }
  return { draft: stored, source: stored, seen: latest };
}
