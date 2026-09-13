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
  しゃ: 'sya', しゅ: 'syu', しょ: 'syo',
  ちゃ: 'tya', ちゅ: 'tyu', ちょ: 'tyo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'zya', じゅ: 'zyu', じょ: 'zyo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',

  ぁ: 'xa', ぃ: 'xi', ぅ: 'xu', ぇ: 'xe', ぉ: 'xo',
  ゃ: 'xya', ゅ: 'xyu', ょ: 'xyo',
  っ: 'xtu',

  ー: '-', '、': ',', '。': '.',
};

const VOWELS = 'aiueo';

/**
 * 訓令式テーブルを組み立てる。
 *
 * 促音は「っ」の後ろに来るかなの頭子音を重ねる形で展開する（`っか` → `kka`）。
 * 見出しを 2〜3 文字にすることで、最長一致でそのまま当たる。
 */
export function kunrei(): Map<string, string> {
  const table = new Map(Object.entries(BASE));
  for (const [kana, roman] of Object.entries(BASE)) {
    const head = roman[0];
    if (VOWELS.includes(head) || head === '-' || head === ',' || head === '.') continue;
    // 「ん」は nn なので重ねない
    if (kana === 'ん') continue;
    table.set(`っ${kana}`, head + roman);
  }
  return table;
}

/**
 * かなテキストをローマ字へ展開する。見出しは最長一致で切り出すので、
 * 「きゃ」「っか」のような複数文字の項目が先に当たる。
 * テーブルに無い文字はそのまま通す（英数字や記号）。
 */
export function kanaToRomaji(text: string, table: Map<string, string>): string {
  const maxLen = Math.max(1, ...[...table.keys()].map((k) => k.length));
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; ) {
    let hit: string | undefined;
    let len = 1;
    for (let l = Math.min(maxLen, chars.length - i); l >= 1; l--) {
      const found = table.get(chars.slice(i, i + l).join(''));
      if (found !== undefined) {
        hit = found;
        len = l;
        break;
      }
    }
    out += hit ?? chars[i];
    i += len;
  }
  return out;
}
