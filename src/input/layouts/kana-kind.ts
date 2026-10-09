/**
 * かな1つ分の出力を、文字の種類で分類する表。
 * レイヤーが出す文字の種類から、名前の無いレイヤーの名前を作るために使う。
 * 分類はかなの綴りだけで決め、配列には依らない。
 */

/** 文字の種類の大分類。名前の頭に「濁音の」「半濁音の」を付ける前の語。 */
export type KanaFamily = '拗音' | '外来音' | '合拗音' | '小書き' | '濁音' | '半濁音';

export interface KanaKind {
  /** 画面に出る種類の名前。例: 「拗音」「濁音の外来音」 */
  name: string;
  family: KanaFamily;
  /** 出力に含まれる小書きの文字。例: 「きゃ」の「ゃ」。小書きを含まない出力は `undefined` */
  small: string | undefined;
}

/** 拗音をつくる小書き。 */
const YOON_SMALL = 'ゃゅょ';
/** 外来音をつくる小書き。 */
const FOREIGN_SMALL = 'ぁぃぅぇぉ';
/** 「くゎ」「ぐゎ」のように使う小書きのわ。 */
const WA_SMALL = 'ゎ';
/** 単独で出ても小書きと呼ぶ文字。 */
const SMALL_CHARS = new Set([...YOON_SMALL, ...FOREIGN_SMALL, ...WA_SMALL, 'っ', 'ゕ', 'ゖ']);

const VOICED = new Set([...'がぎぐげござじずぜぞだぢづでどばびぶべぼゔ']);
const SEMI_VOICED = new Set([...'ぱぴぷぺぽ']);

/** カタカナをひらがなに寄せる。かな以外はそのまま返す。 */
function toHiragana(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0)!;
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
    })
    .join('');
}

function isKana(char: string): boolean {
  const code = char.codePointAt(0)!;
  return code >= 0x3041 && code <= 0x3096;
}

/**
 * 1回の出力（かな1文字、または「きゃ」のような2文字）の種類。
 * 分類できない出力（かな以外・清音のかな・3文字以上など）は `undefined`。
 */
export function classifyKanaOutput(output: string): KanaKind | undefined {
  const chars = [...toHiragana(output)];
  if (chars.length === 1) {
    const [char] = chars;
    if (SMALL_CHARS.has(char)) return { name: '小書き', family: '小書き', small: char };
    if (VOICED.has(char)) return { name: '濁音', family: '濁音', small: undefined };
    if (SEMI_VOICED.has(char)) return { name: '半濁音', family: '半濁音', small: undefined };
    return undefined;
  }
  if (chars.length !== 2) return undefined;
  const [base, small] = chars;
  if (!isKana(base) || SMALL_CHARS.has(base)) return undefined;
  const family: KanaFamily | undefined = YOON_SMALL.includes(small)
    ? '拗音'
    : FOREIGN_SMALL.includes(small)
      ? '外来音'
      : small === WA_SMALL ? '合拗音' : undefined;
  if (family === undefined) return undefined;
  const prefix = VOICED.has(base) ? '濁音の' : SEMI_VOICED.has(base) ? '半濁音の' : '';
  return { name: `${prefix}${family}`, family, small };
}

/**
 * レイヤーが出す文字全体の種類の名前。
 * 全部が同じ種類ならその名前、濁音・半濁音・清音が混ざっていても同じ大分類（拗音・外来音）なら大分類の名前にする。
 * 出る文字に共通する小書きがあれば「（ゃ）」のように添える。
 * 1つでも分類できない出力があるか、大分類が混ざる時は `undefined`。
 */
export function kanaKindName(outputs: readonly string[]): string | undefined {
  const kinds = outputs.map(classifyKanaOutput);
  if (kinds.length === 0 || kinds.some((kind) => kind === undefined)) return undefined;
  const all = kinds as KanaKind[];
  const names = new Set(all.map((kind) => kind.name));
  const families = new Set(all.map((kind) => kind.family));
  if (families.size !== 1) return undefined;
  const name = names.size === 1 ? all[0].name : all[0].family;
  const smalls = new Set(all.map((kind) => kind.small));
  const [small] = smalls;
  return smalls.size === 1 && small !== undefined ? `${name}（${small}）` : name;
}
