import { stableStringify } from '#engine/cache-key.ts';

/**
 * 解析設定を保存先（資産）へ実際に書いた値の記録。書く側（`app`のdebounce）が書いた時に足し、
 * 下書きの側（`useOptionsDraft`）が、保存先の変化が自分の保存の反響かを見分けるのに使う。
 *
 * 入力の時刻から「書かれたはず」と推測する方式は、timerの遅れや書き込みの有無で外れる。
 * 書かれたかどうかは書いた側しか確かではないので、書いた時に記録する。
 */
export interface OptionsWrite {
  /** 書いた順に増える番号 */
  readonly seq: number;
  readonly key: string;
}

export interface OptionsWriteLog {
  /** 保存先へ書く直前に呼ぶ。 */
  readonly record: (options: unknown) => void;
  /** 記録の写し。古いものは捨てるので、直近の分だけ。 */
  readonly entries: () => readonly OptionsWrite[];
  /** これまでに書いた最後の番号（無ければ0）。 */
  readonly latestSeq: () => number;
}

/** 個別画面の記録の引き先。個別画面は解析設定を1つしか持たないので固定でよい。 */
export const STANDALONE_WRITE_LOG_KEY = 'standalone';

const KEPT = 16;

export function createOptionsWriteLog(): OptionsWriteLog {
  let seq = 0;
  let list: readonly OptionsWrite[] = [];
  return {
    record: (options) => {
      seq += 1;
      list = [...list, { seq, key: stableStringify(options) }].slice(-KEPT);
    },
    entries: () => list,
    latestSeq: () => seq,
  };
}

/**
 * 同じ書き先（`OptionsWriteLogs.forKey`の`key`）の下書きどうしが、入力を伝え合う口。
 * 共有に従う複数のペインは1つの保存先を書くので、片方の入力を、保存を待たずにもう片方の下書きへ届ける。
 */
export interface DraftPeers {
  /** `key`の入力を受け取る。戻り値で購読をやめる。 */
  readonly subscribe: (key: string, listener: (value: unknown) => void) => () => void;
  /** `key`の入力を、`except`以外の購読へ伝える。 */
  readonly publish: (key: string, value: unknown, except: (value: unknown) => void) => void;
}

export function createDraftPeers(): DraftPeers {
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  return {
    subscribe: (key, listener) => {
      let set = listeners.get(key);
      if (set === undefined) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0 && listeners.get(key) === set) listeners.delete(key);
      };
    },
    publish: (key, value, except) => {
      for (const listener of [...(listeners.get(key) ?? [])]) if (listener !== except) listener(value);
    },
  };
}

/** 書き込みの記録を、書き先（個別画面なら1つ、Workspaceなら保存先の持ち主）ごとに引く表。 */
export interface OptionsWriteLogs {
  readonly forKey: (key: string) => OptionsWriteLog;
  readonly peers: DraftPeers;
}

export function createOptionsWriteLogs(): OptionsWriteLogs {
  const logs = new Map<string, OptionsWriteLog>();
  return {
    peers: createDraftPeers(),
    forKey: (key) => {
      let log = logs.get(key);
      if (log === undefined) {
        log = createOptionsWriteLog();
        logs.set(key, log);
      }
      return log;
    },
  };
}
