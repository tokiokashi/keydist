import { THUMB_KEY } from '../shapes/geometry.ts';
import { fromKana, withAliases, type KanjiDirectDeclaration, type Layout } from './types.ts';

/**
 * TUT-Code。T-Codeと同じ40キーと空白キーに、1打から4打の打鍵列でひらがな・カタカナ・漢字・記号を割り当てる、漢字直接入力の配列。
 * 2652字のうち、1打が11字（数字10字と全角空白）、2打が803字、3打が1829字、4打が9字である。
 *
 * 出典は漢直Win 1.26eb（2002-05-05）の `tut.tbl` の「Aモード（ひらがな）」で、写しは `test/fixtures/sources/tut-code.json`。
 * 「Bモード（カタカナ）」と機能の欄（`@` で始まる）は持たない。片仮名の語は、評価テキストの前処理がひらがなに書き換えて打つ。
 * 出典は、40キーの並びの位置に字を置き、その位置のキーを打った次の打鍵の表を、欄の中に入れ子で持つ。
 * 41番目の欄は空白キー（右親指）で、2打目や3打目に打つ。
 *
 * 各字を打鍵の数だけのステップの順次打鍵で持つ。途中の打鍵は切り替えのキーではないので、層にもトリガーにも数えない（単打の層1つ）。
 * 表は `tables/tut-code.json` に置き、JavaScriptには含めない。配列が選ばれた時に取得して `TUT_CODE_DECLARATION.layoutFromTable` で配列にする。
 */

/** 打鍵の表の40キー。出典の表の並びで、QWERTY刻印の各段の左10列。 */
export const TUT_KEYS = '1234567890qwertyuiopasdfghjkl;zxcvbnm,./';

const TUT_ID = 'tut-code';
const TUT_NAME = 'TUT-Code';
const TUT_ALIASES = ['てぃーゆーてぃーこーど', 'tutcode'];

/** 割り当てが無い欄と、次の打鍵の表がある欄（`rows` の中） */
export const TUT_EMPTY = '　';

/** 打鍵の表。`rows` は40キーの欄を4段（各10キー）に並べたもの、`space` は空白キーの欄、`next` はキーを打った後の次の表。 */
export interface TutTable {
  readonly rows: readonly [string, string, string, string];
  readonly space?: string;
  readonly next?: Readonly<Record<string, TutTable>>;
}

function collectEntries(table: TutTable, prefix: readonly string[], entries: [string, string[][]][]): void {
  [...table.rows.join('')].forEach((output, index) => {
    if (output === TUT_EMPTY) return;
    entries.push([output, [...prefix, TUT_KEYS[index]].map((key) => [key])]);
  });
  // 空白キーは、`spaceThumb` に依らず右親指で打つ
  if (table.space !== undefined) entries.push([table.space, [...prefix, THUMB_KEY.RT].map((key) => [key])]);
  for (const [key, next] of Object.entries(table.next ?? {})) collectEntries(next, [...prefix, key], entries);
}

function isTutTable(value: unknown): value is TutTable {
  if (typeof value !== 'object' || value === null) return false;
  const table = value as { rows?: unknown; space?: unknown; next?: unknown };
  if (!Array.isArray(table.rows) || table.rows.length !== 4 || !table.rows.every((row) => typeof row === 'string')) return false;
  if (table.space !== undefined && typeof table.space !== 'string') return false;
  if (table.next === undefined) return true;
  return typeof table.next === 'object' && table.next !== null && Object.values(table.next).every(isTutTable);
}

/** 取得した表（`tables/tut-code.json`）から配列を作る。 */
function tutLayout(root: unknown): Layout {
  if (!isTutTable(root)) throw new Error('TUT-Codeの表の形が違う');
  const entries: [string, string[][]][] = [];
  collectEntries(root, [], entries);
  const layout = fromKana(TUT_ID, TUT_NAME, entries);
  // 各キーの刻印は、そのキーのQWERTY刻印を出す（40キーのどれも途中の打鍵になる）
  const legends = new Map(layout.legends);
  for (const key of TUT_KEYS) legends.set(key, key);
  legends.set(THUMB_KEY.RT, '空白');
  legends.set(THUMB_KEY.LT, '親指');
  return withAliases({ ...layout, legends }, TUT_ALIASES);
}

/** 表を取得する前に出せる項目（名前・別名・使う物理キー）と、表から配列を作る関数。 */
export const TUT_CODE_DECLARATION: KanjiDirectDeclaration = {
  id: TUT_ID,
  name: TUT_NAME,
  aliases: TUT_ALIASES,
  tableFile: 'tut-code.json',
  // 40キーに加えて、2打目と3打目に空白キー（右親指）を打つ字がある
  physicalKeys: [...TUT_KEYS, THUMB_KEY.RT],
  layoutFromTable: tutLayout,
};
