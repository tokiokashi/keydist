import { createContext, useContext } from 'react';

/**
 * 表を入力にする解析（`spec/distance-model.md` §13）のペインで、ホストが読み込んだ表の選べる次数。
 * 解析設定の入力部品は、選べる次数をホストが読み込んだ表から知る（表を読み込む前は`undefined`）。
 * `TextLanguageProvider` と同じく、ホストが値を持ち、Analyzerは読むだけにする。
 */
export interface NgramTableChoices {
  /** 選べる次数（昇順） */
  readonly selectableOrders: readonly number[];
  /** 解析設定が選べない次数を指す時に使う次数。選べる次数の最大 */
  readonly defaultOrder: number;
}

const NgramTableChoicesContext = createContext<NgramTableChoices | undefined>(undefined);

export const NgramTableChoicesProvider = NgramTableChoicesContext.Provider;

/** 表を読み込んだ後の、選べる次数。読み込む前・表を使わないペインでは`undefined`。 */
export function useNgramTableChoices(): NgramTableChoices | undefined {
  return useContext(NgramTableChoicesContext);
}
