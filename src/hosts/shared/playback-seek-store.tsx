import { useSyncExternalStore } from 'react';
import type { PlaybackSeekCommand, PlaybackSeekStore } from './playback-seek.ts';

const NO_SUBSCRIBE = (): (() => void) => () => undefined;
const INITIAL_COMMAND: PlaybackSeekCommand = { revision: 0, targetKey: undefined, charPosition: 0 };
const NO_RECEIVERS: ReadonlySet<string> = new Set();

/** 伝えられた操作。操作が起きた時、同じ描画の確定の中で全部のペインに届く。ストアが無い（個別画面）間は操作が起きない。 */
export function usePlaybackSeekCommand(store: PlaybackSeekStore | undefined): PlaybackSeekCommand {
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIBE, store?.command ?? (() => INITIAL_COMMAND), () => INITIAL_COMMAND);
}

/** 受け取れる打鍵再生のペインの対象。ペインの増減で描き直す。 */
export function usePlaybackSeekReceivers(store: PlaybackSeekStore | undefined): ReadonlySet<string> {
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIBE, store?.receivers ?? (() => NO_RECEIVERS), () => NO_RECEIVERS);
}
