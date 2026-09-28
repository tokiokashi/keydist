/**
 * 訓令式のローマ字テーブル。
 *
 * 配列とは分けて持つ（仕様 §4.4）。ここを書き換えれば、すべての英字配列に一斉に効く。
 * ヘボン式にしたい場合は si → shi、ti → chi、tu → tsu、hu → fu、zi → ji などを差し替える。
 */
const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'si', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'ti', つ: 'tu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'hu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'wo', ん: 'nn',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'zi', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'di', づ: 'du', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',

  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sya', しゅ: 'syu', しょ: 'syo', しぇ: 'sye',
  ちゃ: 'tya', ちゅ: 'tyu', ちょ: 'tyo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'zya', じゅ: 'zyu', じょ: 'zyo', じぇ: 'zye',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',

  ぁ: 'xa', ぃ: 'xi', ぅ: 'xu', ぇ: 'xe', ぉ: 'xo',
  ゃ: 'xya', ゅ: 'xyu', ょ: 'xyo',
  っ: 'xtu',

  ー: '-', '、': ',', '。': '.',
};

const VOWELS = 'aiueo';

/**
 * 訓令式テーブルを組み立てる。`overrides` で一部のかなの綴りを差し替えられる。
 *
 * 促音は差し替え後の綴りから展開するので、`し` を `shi` にすれば
 * `っし` も `sshi` になる（`っか` → `kka` と同じ規則）。
 * 見出しを 2〜3 文字にすることで、最長一致でそのまま当たる。
 */
export function kunrei(
  overrides: Record<string, string> = {},
  generateSokuon = true,
): Map<string, string> {
  const base = { ...BASE, ...overrides };
  const table = new Map(Object.entries(base));
  if (!generateSokuon) return table;
  addSokuonForms(table);
  return table;
}

/** 子音を重ねる促音見出しをテーブルへ追加する。 */
export function addSokuonForms(table: Map<string, string>) {
  for (const [kana, roman] of [...table]) {
    const head = roman[0];
    if (VOWELS.includes(head) || head === '-' || head === ',' || head === '.') continue;
    // 「ん」は nn なので重ねない
    if (kana === 'ん' || kana.startsWith('っ')) continue;
    if (!table.has(`っ${kana}`)) table.set(`っ${kana}`, head + roman);
  }
}

export interface RomajiChunk {
  /** ローマ字へ展開する前のかな見出し */
  kana: string;
  /** そのかな見出しに対応するローマ字 */
  roman: string;
}

/**
 * かなテキストを、展開前の見出しを保ったローマ字の塊へ分ける。
 *
 * 評価器がローマ字上でコンボを探す時も、単独かなの展開をコンボが
 * 丸ごと奪っていないか判定できるよう、文字列だけでなく境界を残す。
 */
export function kanaToRomajiChunks(text: string, table: Map<string, string>): RomajiChunk[] {
  const maxLen = Math.max(1, ...[...table.keys()].map((k) => k.length));
  const chars = [...text];
  const chunks: RomajiChunk[] = [];
  for (let i = 0; i < chars.length; ) {
    let hit: string | undefined;
    let kana = chars[i];
    let len = 1;
    for (let l = Math.min(maxLen, chars.length - i); l >= 1; l--) {
      const candidate = chars.slice(i, i + l).join('');
      const found = table.get(candidate);
      if (found !== undefined) {
        hit = found;
        kana = candidate;
        len = l;
        break;
      }
    }
    chunks.push({ kana, roman: hit ?? chars[i] });
    i += len;
  }
  return chunks;
}

/**
 * かなテキストをローマ字へ展開する。見出しは最長一致で切り出すので、
 * 「きゃ」「っか」のような複数文字の項目が先に当たる。
 * テーブルに無い文字はそのまま通す（英数字や記号）。
 */
export function kanaToRomaji(text: string, table: Map<string, string>): string {
  return kanaToRomajiChunks(text, table)
    .map((chunk) => chunk.roman)
    .join('');
}
