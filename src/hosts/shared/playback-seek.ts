import type { PlaybackSeekDelivery } from '#analyzers/pane-parts.tsx';

/**
 * Workspaceの中で、図（Run Chart）で押した点の文字位置を、打鍵再生のペインへ伝える所。Reactを知らない。
 *
 * 伝える先は、押した点の系列と同じ対象（`targetKey`）を映す打鍵再生のペインだけ。Workspaceのテキストは全ペイン共通なので、
 * 文字位置の意味（評価に渡したテキストの文字位置）は対象が同じペインどうしで揃う。条件（先読み`N`など）の違いは問わない。
 * 各ペインが自分の打鍵の列で、その文字位置を含むステップを探すため。
 *
 * 操作は「何回目に、どの対象の、どの文字位置へ」だけを持つ。ペインの再生位置は持たない（各ペインが自分のメモリで持つ）。
 */
export interface PlaybackSeekCommand {
  /** 操作のたびに増える。ペインは、自分が当てた番号と比べて新しい操作だけを当てる */
  readonly revision: number;
  /** 伝える先の対象。まだ操作が無い間は`undefined` */
  readonly targetKey: string | undefined;
  readonly charPosition: number;
}

export interface PlaybackSeekStore {
  readonly subscribe: (listener: () => void) => () => void;
  /** 操作が起きるまで同じ参照を返す */
  readonly command: () => PlaybackSeekCommand;
  /** 受け取れる打鍵再生のペインの対象。ペインの増減があるまで同じ参照を返す */
  readonly receivers: () => ReadonlySet<string>;
  /** 対象を映す打鍵再生のペインを受け手として登録する。返す関数で外す */
  readonly register: (targetKey: string) => () => void;
  /** 対象を映す打鍵再生のペインへ、文字位置へ移る操作を伝える */
  readonly seek: (targetKey: string, charPosition: number) => void;
}

export function createPlaybackSeekStore(): PlaybackSeekStore {
  const listeners = new Set<() => void>();
  const counts = new Map<string, number>();
  let receivers: ReadonlySet<string> = new Set();
  let command: PlaybackSeekCommand = { revision: 0, targetKey: undefined, charPosition: 0 };
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    command: () => command,
    receivers: () => receivers,
    register(targetKey) {
      const before = counts.get(targetKey) ?? 0;
      counts.set(targetKey, before + 1);
      if (before === 0) {
        receivers = new Set(counts.keys());
        notify();
      }
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        const remaining = (counts.get(targetKey) ?? 1) - 1;
        if (remaining > 0) {
          counts.set(targetKey, remaining);
          return;
        }
        counts.delete(targetKey);
        receivers = new Set(counts.keys());
        notify();
      };
    },
    seek(targetKey, charPosition) {
      command = { revision: command.revision + 1, targetKey, charPosition };
      notify();
    },
  };
}

export function playbackSeekDeliveryFor(command: PlaybackSeekCommand, targetKey: string): PlaybackSeekDelivery {
  return { revision: command.revision, charPosition: command.targetKey === targetKey ? command.charPosition : undefined };
}
