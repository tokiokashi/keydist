import { THUMB_KEY } from '../shapes/geometry.ts';
import { fromKana, withAliases, type KanjiDirectDeclaration, type Layout } from './types.ts';

/**
 * T-Code。数字の段から下の段までの左10列、計40キーから2つを順に打つ打鍵列に文字を割り当てる、漢字直接入力の配列。
 * 単打で文字を出すキーは無く、40キーのどれも1打目にも2打目にもなる。
 *
 * 出典は漢直Win 1.26eb（2002-05-05）の `t.tbl` の「Bモード（全角）」で、写しは `test/fixtures/sources/tcode.json`。
 * 割り当ての文字（ひらがな・カタカナ・漢字・記号の1353字）だけを持ち、交ぜ書き変換などの機能の打鍵（`@` で始まる欄）は持たない。
 * 出典は1打目ごとの表を持ち、表の中の欄は2打目の位置の順（数字の段・上段・ホーム段・下段の各10キー）に並ぶ。
 *
 * 各字を1打目と2打目の2ステップの順次打鍵で持つ。1打目は切り替えのキーではないので、層にもトリガーにも数えない（単打の層1つ）。
 * 表は `tables/tcode.json` に置き、JavaScriptには含めない。配列が選ばれた時に取得して `TCODE_DECLARATION.layoutFromTable` で配列にする。
 */

/** 1打目と2打目に使う40キー。出典の表の並びで、QWERTY刻印の各段の左10列。 */
export const TCODE_KEYS = '1234567890qwertyuiopasdfghjkl;zxcvbnm,./';

const TCODE_ID = 'tcode';
const TCODE_NAME = 'T-Code';
const TCODE_ALIASES = ['てぃーこーど', 'tcode', 'かんじちょくせつにゅうりょく', '漢直'];

/** 割り当てが無い欄 */
export const TCODE_EMPTY = '　';

/** 1打目のキーと、そのキーを打った後の2打目の欄。`rows` は40キーの欄を4段（各10キー）に並べたもので、割り当てが無い欄は `TCODE_EMPTY`。 */
export interface TcodeTable {
  readonly first: string;
  readonly rows: readonly string[];
}

function tcodeEntries(tables: readonly TcodeTable[]): [string, string[][]][] {
  const entries: [string, string[][]][] = [];
  for (const { first, rows } of tables) {
    [...rows.join('')].forEach((output, index) => {
      if (output === TCODE_EMPTY) return;
      entries.push([output, [[first], [TCODE_KEYS[index]!]]]);
    });
  }
  return entries;
}

function isTcodeTables(value: unknown): value is readonly TcodeTable[] {
  return (
    Array.isArray(value) &&
    value.every((table) => typeof table === 'object' && table !== null && typeof table.first === 'string' && Array.isArray(table.rows))
  );
}

/** 取得した表（`tables/tcode.json`）から配列を作る。 */
function tcodeLayout(table: unknown): Layout {
  if (!isTcodeTables(table)) throw new Error('T-Codeの表の形が違う');
  const layout = fromKana(TCODE_ID, TCODE_NAME, tcodeEntries(table));
  // 各キーの刻印は、そのキーのQWERTY刻印を出す（どのキーも1打目になる）
  const legends = new Map(layout.legends);
  for (const key of TCODE_KEYS) legends.set(key, key);
  legends.set(THUMB_KEY.RT, '空白');
  legends.set(THUMB_KEY.LT, '親指');
  return withAliases({ ...layout, legends }, TCODE_ALIASES);
}

/** 表を取得する前に出せる項目（名前・別名・使う物理キー）と、表から配列を作る関数。 */
export const TCODE_DECLARATION: KanjiDirectDeclaration = {
  id: TCODE_ID,
  name: TCODE_NAME,
  aliases: TCODE_ALIASES,
  tableFile: 'tcode.json',
  // どの欄も1打目と2打目に40キーのどれかを使う。空白キーと親指キーは使わない
  physicalKeys: [...TCODE_KEYS],
  layoutFromTable: tcodeLayout,
};
