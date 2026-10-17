/** 綴りが人によって割れるかなと、基底のルールのほかに使われる綴りの候補。 */
export interface RomajiVariant {
  readonly kana: string;
  readonly alternatives: readonly string[];
}

/**
 * 自作のローマ字規則の編集画面が並べる、綴りの揺れるかなの固定の一覧。
 * 打鍵測定が受け付ける綴り（`spelling-variants.ts`）とは別の一覧で、こちらは規則の差分を決めるための入口。
 */
export const ROMAJI_VARIANTS: readonly RomajiVariant[] = [
  { kana: 'い', alternatives: ['i'] },
  { kana: 'う', alternatives: ['u'] },
  { kana: 'か', alternatives: ['ka'] },
  { kana: 'く', alternatives: ['ku'] },
  { kana: 'こ', alternatives: ['ko'] },
  { kana: 'し', alternatives: ['si', 'shi'] },
  { kana: 'せ', alternatives: ['se'] },
  { kana: 'ち', alternatives: ['ti', 'chi'] },
  { kana: 'つ', alternatives: ['tu', 'tsu'] },
  { kana: 'ふ', alternatives: ['hu', 'fu'] },
  { kana: 'ん', alternatives: ['n', 'nn'] },
  { kana: 'じ', alternatives: ['zi', 'ji'] },
  { kana: 'っ', alternatives: ['ltu', 'xtu'] },
  { kana: 'ぁ', alternatives: ['la', 'xa'] },
  { kana: 'ぃ', alternatives: ['li', 'xi'] },
  { kana: 'ぅ', alternatives: ['lu', 'xu'] },
  { kana: 'ぇ', alternatives: ['le', 'xe'] },
  { kana: 'ぉ', alternatives: ['lo', 'xo'] },
  { kana: 'ゃ', alternatives: ['lya', 'xya'] },
  { kana: 'ゅ', alternatives: ['lyu', 'xyu'] },
  { kana: 'ょ', alternatives: ['lyo', 'xyo'] },
  { kana: 'しゃ', alternatives: ['sha', 'sya'] },
  { kana: 'しゅ', alternatives: ['shu', 'syu'] },
  { kana: 'しぇ', alternatives: ['she', 'sye'] },
  { kana: 'しょ', alternatives: ['sho', 'syo'] },
  { kana: 'じゃ', alternatives: ['ja', 'zya'] },
  { kana: 'じゅ', alternatives: ['ju', 'zyu'] },
  { kana: 'じぇ', alternatives: ['je', 'zye'] },
  { kana: 'じょ', alternatives: ['jo', 'zyo'] },
  { kana: 'ちゃ', alternatives: ['tya', 'cha'] },
  { kana: 'ちゅ', alternatives: ['tyu', 'chu'] },
  { kana: 'ちょ', alternatives: ['tyo', 'cho'] },
  { kana: 'ちぃ', alternatives: ['tyi'] },
  { kana: 'うぃ', alternatives: ['wi'] },
  { kana: 'うぇ', alternatives: ['we'] },
];
