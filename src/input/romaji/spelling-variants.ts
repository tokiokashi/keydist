import { kanaToRomajiChunks } from './kunrei.ts';

/**
 * 文章を打つ測定が受け付けるローマ字の綴り（`spec/playback-timing.md` §6.4「ローマ字の綴り」）。
 * 規則（かな → 綴りの表）はかなごとに綴りを1つに決めるので、出現ごとに綴りを混ぜて打つ利用者の入力は表せない。
 * そのため、規則は書き換えず、示す文のかなごとに受け付ける綴りの候補を別に求める。
 */

/** 示す文の入力単位（かなの見出し1つ）と、受け付ける綴り。先頭は今の規則の綴り。 */
export interface SpellingUnit {
  readonly kana: string;
  readonly spellings: readonly string[];
}

const SMALL_KANA = 'ゃゅょぁぃぅぇぉ';
const SMALL_KANA_VOWEL: Readonly<Record<string, string>> = { ゃ: 'a', ゅ: 'u', ょ: 'o', ぇ: 'e' };

/** 規則によらず受け付ける綴りの表（`spec/playback-timing.md` §6.4）。規則の綴りは、これとは別に先頭で受け付ける。 */
const TABLE_SPELLINGS = new Map<string, readonly string[]>([
  ['し', ['si', 'shi']],
  ['ち', ['ti', 'chi']],
  ['つ', ['tu', 'tsu']],
  ['ふ', ['hu', 'fu']],
  ['じ', ['zi', 'ji']],
]);

/** 拗音の頭のかなごとに、受け付ける子音部分（母音の前）。 */
const YOUON_ONSETS: ReadonlyArray<readonly [head: string, onsets: readonly string[]]> = [
  ['し', ['sy', 'sh']],
  ['ち', ['ty', 'ch']],
  ['じ', ['zy', 'j']],
];

/** 拗音のうち、表にあるもの（ゃゅょぇで終わるもの）の綴りを表に足す。 */
for (const [head, onsets] of YOUON_ONSETS) {
  for (const [small, vowel] of Object.entries(SMALL_KANA_VOWEL)) {
    TABLE_SPELLINGS.set(
      `${head}${small}`,
      onsets.map((onset) => `${onset}${vowel}`),
    );
  }
}

const VOWELS = 'aiueo';

/**
 * 2文字以上のかなを1つの綴りにまとめる見出しを持つか。拗音（2文字目が小書き）と促音（「っ」で始まる）の形は含めない。
 * 持つ規則（AZIKなど）は、かなごとに綴りを差し替える方式と区切りが合わない。
 */
export function hasMultiKanaHeading(table: ReadonlyMap<string, string>): boolean {
  for (const kana of table.keys()) {
    const chars = [...kana];
    if (chars.length < 2 || chars[0] === 'っ') continue;
    if (chars.length === 2 && SMALL_KANA.includes(chars[1])) continue;
    return true;
  }
  return false;
}

function unique(spellings: readonly string[]): string[] {
  return [...new Set(spellings)];
}

/** 促音を除いたかな1見出しの、受け付ける綴り。先頭は規則の綴り。 */
function plainSpellings(kana: string, roman: string): string[] {
  return unique([roman, ...(TABLE_SPELLINGS.get(kana) ?? [])]);
}

/** 先頭が子音の英字（重ねられる綴り）か。 */
function startsWithConsonant(spelling: string): boolean {
  return /^[a-z]/.test(spelling) && !VOWELS.includes(spelling[0]);
}

/** 「ん」を `n` の1打で打てる、次のかなの綴りか。母音・`y`・`n` 以外の英字で始まる綴りだけ。 */
function allowsSingleN(next: SpellingUnit | undefined, nextInTable: boolean): boolean {
  if (next === undefined || !nextInTable) return false;
  return next.spellings.every((spelling) => /^[a-z]/.test(spelling) && !`${VOWELS}yn`.includes(spelling[0]));
}

/**
 * かなテキストを入力単位に分け、単位ごとに受け付ける綴りを求める。
 * 規則が2文字以上のかなをまとめる見出しを持つ時は、表を使えないので`undefined`を返す。
 */
export function romajiSpellingUnits(text: string, table: ReadonlyMap<string, string>): SpellingUnit[] | undefined {
  if (hasMultiKanaHeading(table)) return undefined;
  const chunks = kanaToRomajiChunks(text, table as Map<string, string>);
  const inTable = chunks.map((chunk) => table.has(chunk.kana));
  const units: SpellingUnit[] = chunks.map((chunk) => {
    const { kana, roman } = chunk;
    if (!table.has(kana)) return { kana, spellings: [roman] };
    if (kana === 'ん') return { kana, spellings: unique([roman, 'nn']) };
    if ([...kana].length > 1 && kana.startsWith('っ')) {
      const core = kana.slice(1);
      const coreRoman = table.get(core);
      const doubled =
        coreRoman === undefined
          ? []
          : plainSpellings(core, coreRoman)
              .filter(startsWithConsonant)
              .map((spelling) => `${spelling[0]}${spelling}`);
      return { kana, spellings: unique([roman, ...doubled]) };
    }
    return { kana, spellings: plainSpellings(kana, roman) };
  });
  // 「ん」の`n`1打は、次のかなの綴りが決まってから許すかを判定する。
  return units.map((unit, index) =>
    unit.kana === 'ん' && table.has('ん') && allowsSingleN(units[index + 1], inTable[index + 1] ?? false)
      ? { kana: unit.kana, spellings: unique([...unit.spellings, 'n']) }
      : unit,
  );
}
