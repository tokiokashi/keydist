import { stableStringify } from '#engine/cache-key.ts';

/**
 * 解析設定の下書きと保存先（資産）の同期の判断。`useOptionsDraft`から切り出した純粋な部分で、
 * React無しでテストできる。
 *
 * 下書きを保存先へ揃え直すのは「外からの変更」のときだけにする。自分が書いた値の反響まで
 * 揃え直すと、反響が利用者の次の入力より後に届いた時に、下書きが1つ前の値へ戻る
 * （debounce約400ms のあいだ、チェックが外れた状態に戻る等。#935）。
 * そこで、自分が下書きにした値を覚えておき、保存先がその値になった時は反響として扱う。
 */

/** 自分が下書きにした値。反響として待つ期間はdebounceに余裕を足した長さ。 */
export const ECHO_WINDOW_MS = 2000;

export interface OwnWrite {
  readonly key: string;
  readonly at: number;
}

export interface DraftSyncState<T> {
  readonly draft: T;
  /** 最後に見た保存先の値 */
  readonly source: T;
  /** 下書きにした順の、まだ反響が届いていない値 */
  readonly own: readonly OwnWrite[];
}

export function initialDraftSync<T>(stored: T): DraftSyncState<T> {
  return { draft: stored, source: stored, own: [] };
}

/** 利用者の入力で下書きを更新する。 */
export function applyDraftInput<T>(state: DraftSyncState<T>, next: T, now: number): DraftSyncState<T> {
  const alive = state.own.filter((write) => now - write.at < ECHO_WINDOW_MS);
  return { ...state, draft: next, own: [...alive, { key: stableStringify(next), at: now }] };
}

/**
 * 保存先の値が変わった時の下書きの扱い。
 * - 参照が同じ: 何もしない
 * - 中身が同じ（他タブが別のAnalyzerの設定を書いて記録全体が読み直された等）: 下書きを触らない（#606）
 * - 自分が下書きにした値になった（反響）: 下書きを触らない。その値より前の記録は捨てる
 * - それ以外（元に戻す・別タブ・共有URL・既定値へ戻す等）: 下書きを保存先に揃え、記録を捨てる
 */
export function syncDraftWithStored<T>(state: DraftSyncState<T>, stored: T, now: number): DraftSyncState<T> {
  if (state.source === stored) return state;
  if (stableStringify(state.source) === stableStringify(stored)) return { ...state, source: stored };
  const key = stableStringify(stored);
  const index = state.own.findIndex((write) => write.key === key && now - write.at < ECHO_WINDOW_MS);
  if (index >= 0) return { ...state, source: stored, own: state.own.slice(index + 1) };
  return { draft: stored, source: stored, own: [] };
}
