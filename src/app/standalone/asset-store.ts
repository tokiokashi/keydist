import {
  applyExternalChangeToScreens,
  discardScreenHistory,
  emptyScreenHistories,
  type Command,
  type CommandOutcome,
  type HistoryStepOutcome,
  type ScreenHistories,
} from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { reportAssetLoadNotices } from './asset-load-notice.ts';
import { initialAssets } from './asset-storage-specs.ts';
import { buildAssetSyncs, commitCommand, commitHistoryStep, loadAssetsAndRepair, startAssetSyncs, type BuildAssetSyncsOptions } from './asset-syncs.ts';

/** ストアの中身。変わるたびに新しいオブジェクトになる（`useSyncExternalStore`が参照の同一性で変化を見る）。 */
export interface AssetStoreState {
  readonly assets: KeydistAssets;
  /**
   * storageからの初回読み込みが終わっているか。URLパラメータの取り込みのように「今の資産の値を
   * ベースに部分マージする」処理が、読み込みより前に`assets`を読むと、既存の値を初期値へ巻き戻してしまう。
   */
  readonly ready: boolean;
  /** 画面ごとの元に戻す・やり直すの履歴。 */
  readonly histories: ScreenHistories<KeydistAssets>;
}

/** 戻せなかった・やり直せなかったことの知らせ。 */
export interface HistoryNotice {
  /** 知らせごとの通し番号。同じ文面が続いても、出し直す。 */
  readonly serial: number;
  readonly text: string;
}

export interface AssetStore {
  getState(): AssetStoreState;
  /** プリレンダーとハイドレーションで使う、読み込み前の固定の状態。 */
  getServerState(): AssetStoreState;
  subscribe(listener: () => void): () => void;
  getNotice(): HistoryNotice | undefined;
  dismissNotice(): void;
  /**
   * storageから資産を読み（直せる値は直して書き戻し、知らせる）、他タブの変更の購読を始める。何度呼んでも1回だけ行う。購読はタブを閉じるまで続ける
   * （画面を移っても資産の値と履歴をタブに1つ持つので、画面ごとに止めない）。
   */
  start(): void;
  /** 描画を待たない最新の資産。 */
  getAssets(): KeydistAssets;
  /** コマンドを適用する。`screen`が`undefined`なら履歴に積まない。 */
  dispatch(screen: string | undefined, command: Command<KeydistAssets>): CommandOutcome<KeydistAssets>;
  /** `screen`の履歴を1段戻す・やり直す。当てられなかった時は知らせを出す。 */
  step(screen: string, direction: 'undo' | 'redo'): HistoryStepOutcome<KeydistAssets>;
  /** `screen`の履歴を捨てる。 */
  discardHistory(screen: string): void;
}

/**
 * 資産の値と画面ごとの履歴を、タブに1つだけ持つストア。Reactの外に置くのは、画面を移っても値と履歴を
 * 捨てないためと、戻せるかの照らし合わせが値の参照の同一性で行われるため（画面に戻るたびに読み直して
 * 新しい参照になると、照らし合わせが全部外れる）。サイドバーやトップのように履歴を持たない所からの書き込みも、
 * ここを通す。
 */
export function createAssetStore(options: Omit<BuildAssetSyncsOptions, 'onExternalChange'> = {}): AssetStore {
  const serverState: AssetStoreState = { assets: initialAssets(), ready: false, histories: emptyScreenHistories() };
  let state = serverState;
  let notice: HistoryNotice | undefined;
  let serial = 0;
  let started = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const setState = (next: AssetStoreState) => {
    if (next.assets === state.assets && next.histories === state.histories && next.ready === state.ready) return;
    state = next;
    emit();
  };
  const setNotice = (next: HistoryNotice | undefined) => {
    notice = next;
    emit();
  };

  const syncs = buildAssetSyncs({
    ...options,
    onExternalChange: (key, value) => {
      const result = applyExternalChangeToScreens(state.assets, state.histories, key, value);
      setState({ ...state, assets: result.assets, histories: result.histories });
    },
  });

  const readState = () => state;

  const start = () => {
    if (started) return;
    started = true;
    // 捨てた・直した値と読めなかった値は、直した形（読めなければ既定値）を書き戻した上で知らせる。
    // ストアはタブに1つで`start`は1回だけなので、知らせと書き戻しもタブにつき1回になる。
    // 画面を移るたびに書き戻すと、開いたままの古いタブが、新しい版のアプリが書いた項目を消してしまう。
    const { assets: loaded, notices } = loadAssetsAndRepair(syncs);
    reportAssetLoadNotices(notices);
    // 読み込みが空でも`ready`は必ずtrueにする（何も無かった場合の既定値もこの時点で確定した値）。
    setState({ ...state, assets: { ...state.assets, ...loaded }, ready: true });
    startAssetSyncs(syncs);
  };

  return {
    getState: () => state,
    getServerState: () => serverState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getNotice: () => notice,
    dismissNotice() {
      if (notice !== undefined) setNotice(undefined);
    },
    start,
    getAssets: () => state.assets,
    dispatch(screen, command) {
      // 画面の外（サイドバーなど）からの書き込みでも、保存済みの値の上に書く
      start();
      const result = commitCommand(syncs, readState, screen, command);
      if (result.outcome.kind === 'applied') setState({ ...state, assets: result.assets, histories: result.histories });
      return result.outcome;
    },
    step(screen, direction) {
      start();
      const result = commitHistoryStep(syncs, readState, screen, direction);
      if (result.outcome.kind === 'applied' || result.outcome.kind === 'conflict') {
        setState({ ...state, assets: result.assets, histories: result.histories });
      }
      if (result.outcome.kind === 'conflict') {
        const what = direction === 'undo' ? '元に戻せませんでした' : 'やり直せませんでした';
        setNotice({ serial: ++serial, text: `「${result.outcome.label}」は、別の画面で値が変わったため${what}` });
      } else if (result.outcome.kind === 'applied' && notice !== undefined) {
        setNotice(undefined);
      }
      return result.outcome;
    },
    discardHistory(screen) {
      const histories = discardScreenHistory(state.histories, screen);
      if (histories !== state.histories) setState({ ...state, histories });
    },
  };
}

let shared: AssetStore | undefined;

/** タブに1つのストア。使う時に作る（プリレンダーでstorageを触らないため）。 */
export function getAssetStore(): AssetStore {
  shared ??= createAssetStore();
  return shared;
}
