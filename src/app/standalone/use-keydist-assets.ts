import { useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { getAssetStore } from './asset-store.ts';

/**
 * `KeydistAssets`の永続化・タブ間追従・コマンド履歴を、画面の部品へ配線するhook。
 *
 * 資産の値と画面ごとの履歴はReactの外のストア（`asset-store.ts`）がタブに1つ持つ。このhookは、
 * ストアの値を読み、呼び出した画面の履歴（`location.pathname`で分けた画面）への書き込みと、
 * その画面の元に戻す・やり直すを返す。`hosts/standalone`はこのhookが返す`{ assets, dispatch }`だけを知り、
 * storageもcodecも一切importしない。
 *
 * 資産ごとの組み立て（storageキー・codec・初期値）は`asset-storage-specs.ts`の表に
 * 1本化した。資産を1つ足す時にこのファイルを書き換える必要が無い。
 */
export interface KeydistAssetsController {
  readonly assets: KeydistAssets;
  /**
   * storageからの初回読み込みが終わっているか。`hosts`側がURLパラメータの
   * 取り込みのように「今の資産の値をベースに部分マージする」処理をする時、この読み込みより
   * 前に`assets`を読んでしまうと、既存の値を初期値へ巻き戻す事故になる。`ready`が`true`になってから
   * `assets`を読めば、その時点の`assets`は必ず読み込み済みの値になっている。
   */
  readonly ready: boolean;
  dispatch(command: Command<KeydistAssets>): void;
  /**
   * 描画を待たない最新の資産。`assets`は描画した時点の値なので、`dispatch`の直後（特に
   * Reactのイベントの外から書いた直後）に読むと古い。書き込みの結果を次の書き込みへ
   * 引き継ぐ時はこちらを読む。
   */
  getAssets(): KeydistAssets;
  /** この画面の履歴に、戻せる・やり直せる項目があるか（元に戻す・やり直すのボタンの押せる状態）。 */
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
  /** この画面の履歴を捨てる（画面そのものが無くなる時。Workspaceの削除）。 */
  discardHistory(): void;
}

export interface UseKeydistAssetsOptions {
  /**
   * 履歴を持たない画面（トップ）は`false`。書き込みはどの履歴にも積まず、元に戻す・やり直すは何もしない。
   * 既定は`true`。
   */
  readonly history?: boolean;
}

/**
 * 画面を分ける識別子。URLのパス（検索パラメータは含めない）の末尾の`/`を除いたもの。
 * Workspaceはパスにidを含むので、idごとに別の画面になる。
 */
export function screenKeyOf(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

/**
 * ストアの資産を読み、呼び出した画面の履歴へ書く。画面は最初の描画のパスで決める
 * （移動の途中で、離れる側の画面が次のパスを見て別の履歴を動かさないため）。
 */
export function useKeydistAssets(options: UseKeydistAssetsOptions = {}): KeydistAssetsController {
  const store = getAssetStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const trackHistory = options.history !== false;
  const [screen] = useState(() => (trackHistory ? screenKeyOf(pathname) : undefined));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getServerState);

  useEffect(() => {
    store.start();
  }, [store]);

  const dispatch = useCallback((command: Command<KeydistAssets>) => {
    store.dispatch(screen, command);
  }, [store, screen]);
  const getAssets = useCallback(() => store.getAssets(), [store]);
  const undo = useCallback(() => {
    if (screen !== undefined) store.step(screen, 'undo');
  }, [store, screen]);
  const redo = useCallback(() => {
    if (screen !== undefined) store.step(screen, 'redo');
  }, [store, screen]);
  const discardHistory = useCallback(() => {
    if (screen !== undefined) store.discardHistory(screen);
  }, [store, screen]);

  const history = screen === undefined ? undefined : state.histories.get(screen);
  return useMemo(() => ({
    assets: state.assets,
    ready: state.ready,
    dispatch,
    getAssets,
    canUndo: (history?.undoStack.length ?? 0) > 0,
    canRedo: (history?.redoStack.length ?? 0) > 0,
    undo,
    redo,
    discardHistory,
  }), [state.assets, state.ready, dispatch, getAssets, history, undo, redo, discardHistory]);
}
