import { createContext, useContext, useSyncExternalStore } from 'react';
import type { PlaybackBroadcast, PlaybackCommand } from './playback-broadcast.ts';

/**
 * Workspaceが置く。置かれていない場所（個別画面）の打鍵再生は、伝える相手が無く、自分だけを動かす。
 */
const PlaybackBroadcastContext = createContext<PlaybackBroadcast | undefined>(undefined);

export const PlaybackBroadcastProvider = PlaybackBroadcastContext.Provider;

export function usePlaybackBroadcastStore(): PlaybackBroadcast | undefined {
  return useContext(PlaybackBroadcastContext);
}

const INITIAL_COMMAND: PlaybackCommand = { revision: 0, action: undefined };
const NO_SUBSCRIBE = (): (() => void) => () => undefined;
const FALSE = (): boolean => false;

/** 伝えられた操作。操作が起きた時、同じ描画の確定の中で全部のペインに届く。 */
export function usePlaybackCommand(store: PlaybackBroadcast | undefined): PlaybackCommand {
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIBE, store?.command ?? (() => INITIAL_COMMAND), () => INITIAL_COMMAND);
}

/** 全部のペインの状態から決まる、再生と停止を押せるか。値が変わった時だけ描き直す。 */
export function usePlaybackAvailability(store: PlaybackBroadcast | undefined): { readonly canPlay: boolean; readonly canStop: boolean } {
  const subscribe = store?.subscribe ?? NO_SUBSCRIBE;
  const canPlay = useSyncExternalStore(subscribe, store?.canPlay ?? FALSE, FALSE);
  const canStop = useSyncExternalStore(subscribe, store?.canStop ?? FALSE, FALSE);
  return { canPlay, canStop };
}
