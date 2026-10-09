import type { Finger } from './geometry.ts';

/** 指の正式な名前（左手の小指から右手の小指の並びで画面に出す名前）。 */
export const FINGER_LABEL: Readonly<Record<Finger, string>> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差し指', LT: '左親指',
  RT: '右親指', RI: '右人差し指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

/** 手を付けない短い名前。同じ手の中で指を見分ける場面（図の棒の下など）に使う。 */
export const SHORT_FINGER: Readonly<Record<Finger, string>> = {
  LP: '小', LR: '薬', LM: '中', LI: '人', LT: '親',
  RT: '親', RI: '人', RM: '中', RR: '薬', RP: '小',
};

/** 手を付けた短い名前（例: 左小）。両手の指が同じ並びに出る場面（表の列見出しなど）に使う。 */
export const FINGER_SHORT_WITH_HAND: Readonly<Record<Finger, string>> = {
  LP: '左小', LR: '左薬', LM: '左中', LI: '左人', LT: '左親',
  RT: '右親', RI: '右人', RM: '右中', RR: '右薬', RP: '右小',
};
