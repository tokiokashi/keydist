import { stableStringify } from '#engine/cache-key.ts';

/**
 * 解析設定の下書きと保存先（資産）の同期の判断。`useOptionsDraft`から切り出した純粋な部分で、
 * React無しでテストできる。
 *
 * 下書きを保存先へ揃え直すのは「外からの変更」のときだけにする。自分が書いた値の反響まで
 * 揃え直すと、反響が利用者の次の入力より後に届いた時に、下書きが1つ前の値へ戻る
 * （debounce約400msのあいだ、チェックが外れた状態に戻る等。#935）。
 * そこで、保存として書かれうる下書きの値を覚えておき、保存先がその値になった時は反響として扱う。
 *
 * 書かれうる値だけを覚える点が要になる。debounceは次の入力が間隔内に来ると前の値を捨てるので、
 * 間隔より短く上書きされた値は保存先へ届かない。それも覚えておくと、「元に戻す」で保存先が
 * その値へ戻った時に反響と取り違え、下書きが揃わなくなる。
 */

/**
 * 保存のdebounceの間隔。`platform/persistence/debounced-scheduler.ts`の`DEFAULT_DEBOUNCE_MS`と
 * 揃える（`hosts`は`platform`をimportできない）。ずれても、書かれた値を覚え損ねて従来どおり
 * 揃え直すか、書かれない値を少し長く覚えるだけで、下書きが壊れることはない。
 */
export const SAVE_DEBOUNCE_MS = 400;

/** timerの発火と`Date.now`の刻みのずれ。ちょうど間隔で入った入力を、書かれた後の入力として扱うための余裕。 */
const CLOCK_SLACK_MS = 5;

export interface OwnInput {
  readonly key: string;
  readonly at: number;
}

export interface DraftSyncState<T> {
  readonly draft: T;
  /** 最後に見た保存先の値 */
  readonly source: T;
  /** 書かれうる下書きの値を、入力順に。まだ反響が届いていないもの */
  readonly own: readonly OwnInput[];
}

export function initialDraftSync<T>(stored: T): DraftSyncState<T> {
  return { draft: stored, source: stored, own: [] };
}

/** 利用者の入力で下書きを更新する。 */
export function applyDraftInput<T>(state: DraftSyncState<T>, next: T, now: number): DraftSyncState<T> {
  const last = state.own[state.own.length - 1];
  // 直前の値は、間隔内に上書きされたら保存されない
  const kept = last !== undefined && now - last.at < SAVE_DEBOUNCE_MS - CLOCK_SLACK_MS ? state.own.slice(0, -1) : state.own;
  return { ...state, draft: next, own: [...kept, { key: stableStringify(next), at: now }] };
}

/**
 * 保存先の値が変わった時の下書きの扱い。
 * - 参照が同じ: 何もしない
 * - 中身が同じ（他タブが別のAnalyzerの設定を書いて記録全体が読み直された等）: 下書きを触らない（#606）
 * - 書かれうる下書きの値になった（反響）: 下書きを触らない。その値より前の記録は捨てる
 * - それ以外（元に戻す・やり直す・別タブ・共有URL・既定値へ戻す等）: 下書きを保存先に揃え、記録を捨てる
 */
export function syncDraftWithStored<T>(state: DraftSyncState<T>, stored: T): DraftSyncState<T> {
  if (state.source === stored) return state;
  if (stableStringify(state.source) === stableStringify(stored)) return { ...state, source: stored };
  const index = lastEchoIndex(state.own, stableStringify(stored));
  if (index >= 0) return { ...state, source: stored, own: state.own.slice(index + 1) };
  return { draft: stored, source: stored, own: [] };
}

/**
 * 反響に当たる記録のうち、最も新しいものの位置。古いものに当てると、同じ値を入れ直した時に
 * その後ろの記録が残り、後の「元に戻す」が反響として無視される。
 */
function lastEchoIndex(own: readonly OwnInput[], key: string): number {
  for (let i = own.length - 1; i >= 0; i--) {
    if (own[i]!.key === key) return i;
  }
  return -1;
}
