import { createMulberry32, PRNG_NAME } from './prng.ts';

/**
 * 評価に渡したテキストから、対照テキスト（順序破壊・一様ランダム）を作る。
 * 元のテキストの塊の並びだけを変えるので、文字の種類は元のテキストにある塊の組み合わせに限られる。
 * 乱数は `prng.ts` の名前のある生成器で、結果に生成器の名前と種を持たせて再現できるようにする。
 */

/** 対照テキストの作り方。 */
export type ControlTextKind = 'shuffled' | 'uniform';

/** 対照テキストと、同じものを作り直すための条件。 */
export type ControlText = {
  readonly text: string;
  readonly kind: ControlTextKind;
  readonly prng: string;
  readonly seed: number;
};

const SMALL_KANA = new Set([...'ぁぃぅぇぉゃゅょゎゕゖ']);
const SOKUON = 'っ';

/** 促音の直後に付けてよい文字か。句読点・長音・かな以外の文字には付けない。 */
function isHiraganaBody(char: string): boolean {
  const code = char.codePointAt(0)!;
  // ぁ(3041)〜ゖ(3096)。長音(ー)・踊り字は含まない
  return code >= 0x3041 && code <= 0x3096;
}

/**
 * 文字列を塊に分ける。拗音・促音が割れて打鍵が増えると、並びを壊した効果と混ざるため、割れない単位にする。
 * - 基本の単位は1文字（コードポイント）。句読点・長音・打鍵できない文字も1文字
 * - 小書き文字（`ぁぃぅぇぉゃゅょゎゕゖ`）は直前の塊に付ける。先頭にある時は、それだけで1つの塊
 * - 促音（`っ`）は直後の文字に付ける。直後が `っ` の間はまとめて、その後の文字に付ける。
 *   直後にかなが無い時（末尾・句読点・長音・かな以外）は、続く `っ` を含めて1つの塊
 * - `っ` の直後の小書き文字は、`っ` が付いた塊に付く（`っゃ` で1つの塊）
 */
export function splitChunks(text: string): string[] {
  const chars = [...text];
  const chunks: string[] = [];
  let i = 0;
  while (i < chars.length) {
    let chunk = '';
    while (chars[i] === SOKUON) chunk += chars[i++];
    const next = chars[i];
    if (chunk === '') {
      chunk = chars[i++]!;
    } else if (next !== undefined && isHiraganaBody(next) && next !== SOKUON) {
      chunk += chars[i++];
    }
    while (i < chars.length && SMALL_KANA.has(chars[i]!)) chunk += chars[i++];
    chunks.push(chunk);
  }
  return chunks;
}

/** Fisher-Yatesで塊の並びを乱数で入れ替える。出現回数は変わらない。 */
export function shuffledText(text: string, seed: number): ControlText {
  const chunks = splitChunks(text);
  const random = createMulberry32(seed);
  for (let i = chunks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const held = chunks[i]!;
    chunks[i] = chunks[j]!;
    chunks[j] = held;
  }
  return { text: chunks.join(''), kind: 'shuffled', prng: PRNG_NAME, seed };
}

/**
 * 元のテキストに出た塊の種類から、出現回数によらず各種類を同じ確率で引き、元と同じ数の塊を並べる。
 * 種類は元のテキストでの初出の順に並べて引くので、同じ入力と種からは同じ結果になる。
 */
export function uniformText(text: string, seed: number): ControlText {
  const chunks = splitChunks(text);
  const kinds = [...new Set(chunks)];
  const random = createMulberry32(seed);
  const drawn: string[] = [];
  for (let i = 0; i < chunks.length; i++) drawn.push(kinds[Math.floor(random() * kinds.length)]!);
  return { text: drawn.join(''), kind: 'uniform', prng: PRNG_NAME, seed };
}
