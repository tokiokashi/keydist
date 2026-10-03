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

/** 書き込みの記録を、書き先（個別画面なら1つ、Workspaceならペイン）ごとに引く表。 */
export interface OptionsWriteLogs {
  readonly forKey: (key: string) => OptionsWriteLog;
}

export function createOptionsWriteLogs(): OptionsWriteLogs {
  const logs = new Map<string, OptionsWriteLog>();
  return {
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
