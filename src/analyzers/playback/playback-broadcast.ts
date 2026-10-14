import {
  playbackBroadcastAvailability,
  type PlaybackBroadcastAction,
  type PlaybackPaneStatus,
} from './session.ts';

/**
 * Workspaceの打鍵再生のペインどうしで、再生・一時停止・停止を伝える所。Reactを知らない。
 * 操作は「何回目の何の操作か」だけを持ち、再生位置は持たない（各ペインが自分のメモリで進める）。
 * ペインは各自の状態（先頭か・再生中か・最後まで再生したか）を報告し、ボタンを押せるかの判定にだけ使う。
 */
export interface PlaybackCommand {
  /** 操作のたびに増える。ペインは、自分が当てた番号と比べて新しい操作だけを当てる */
  readonly revision: number;
  readonly action: PlaybackBroadcastAction | undefined;
}

export interface PlaybackBroadcast {
  readonly subscribe: (listener: () => void) => () => void;
  /** 操作が起きるまで同じ参照を返す */
  readonly command: () => PlaybackCommand;
  readonly canPlay: () => boolean;
  readonly canStop: () => boolean;
  /** 全部のペインへ操作を伝える。購読しているペインが同じ描画の確定の中で状態を変える */
  readonly dispatch: (action: PlaybackBroadcastAction) => void;
  /** ペインの状態を置き換える。`undefined`でそのペインを外す */
  readonly report: (owner: string, status: PlaybackPaneStatus | undefined) => void;
}

export function createPlaybackBroadcast(): PlaybackBroadcast {
  const listeners = new Set<() => void>();
  const statuses = new Map<string, PlaybackPaneStatus>();
  let command: PlaybackCommand = { revision: 0, action: undefined };
  let availability = playbackBroadcastAvailability([]);
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    command: () => command,
    canPlay: () => availability.canPlay,
    canStop: () => availability.canStop,
    dispatch(action) {
      command = { revision: command.revision + 1, action };
      notify();
    },
    report(owner, status) {
      const previous = statuses.get(owner);
      if (status === undefined) {
        if (previous === undefined) return;
        statuses.delete(owner);
      } else {
        if (previous !== undefined && previous.atStart === status.atStart
          && previous.playing === status.playing && previous.atEnd === status.atEnd) return;
        statuses.set(owner, status);
      }
      availability = playbackBroadcastAvailability(statuses.values());
      notify();
    },
  };
}
