import { kunrei } from './kunrei.ts';

/**
 * とみすけ配列の作者が勧めるローマ字の綴り。
 *
 * 作者のページの「ローマ字テーブルを活かそう」に、しゃ行は同じ指で打つことになる `sy` ではなく
 * `sh` を使うこと、ふ は `hu` にすることが書かれている。ふ は訓令式でも `hu` なので上書きに入らない。
 * 「し」単体は記事が触れていないので `si` のままで、SH を使うのは拗音のシャ行（同じ組のしぇを含む）だけ。
 * 記事は ん を `xn` にすることも勧めているが、作者が好みとしているので採らず、訓令式の綴りのままにする。
 * 記事が触れていないかなは訓令式のまま。
 * https://tomisuke.com/tomisuke-keyboard-layout/
 */
export const TOMISUKE_OVERRIDES: Record<string, string> = {
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  しぇ: 'she',
};

export const tomisukeRomaji = (overrides: Record<string, string> = {}, generateSokuon = true) =>
  kunrei({ ...TOMISUKE_OVERRIDES, ...overrides }, generateSokuon);
