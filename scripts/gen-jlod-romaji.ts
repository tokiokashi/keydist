/**
 * JLOD拡張ローマ字テーブルを `src/input/romaji/jlod.ts` として生成するスクリプト。
 *
 * 出典: https://www.mikage.to/jlod/JLOD.hmo_kana （姫踊子草の定義ファイル。Shift_JIS・CRLF）
 * 解説: https://www.mikage.to/jlod/
 *
 * 使い方（実行時にネットへは出ない。事前に定義ファイルを取得しておく）:
 *
 *   curl -sS -o /tmp/JLOD.hmo_kana https://www.mikage.to/jlod/JLOD.hmo_kana
 *   node --experimental-strip-types scripts/gen-jlod-romaji.ts /tmp/JLOD.hmo_kana
 *
 * 定義ファイルはgit管理ではないので、版はsha256で固定する。出典のsha256が `EXPECTED_SHA256` と違う時は生成を止める。
 * 出典が更新されたら、差分を読んで `EXPECTED_SHA256`・`SOURCE_LAST_MODIFIED` を更新してから再実行する。
 *
 * 定義ファイルの書式（姫踊子草のストロークモード）:
 *
 * - `'` で始まる行は節の見出し（コメント）。節ごとに内容が違う
 * - `=<前置キー列>` は、次の行からの打鍵に前置するキー列。次の `=` の行まで続く。同じ見出しが節をまたいで複数回出る
 * - 「キー列TAB出力を `$` で区切った並び」の行は、キー列の位置と出力の位置が対応する。
 *   キー列の `{xy}` は、中の2打を1つの位置として表す
 * - 出力の `未` は、そのキー列に割り当てが無い印
 *
 * 変換で決めたこと:
 *
 * 1. 定義は「キー → 出力」、keydistのテーブルは「かな → 綴り」なので逆写像を作る。
 * 2. 定義のキーはQWERTYの物理キー名で書かれている。JLODはDvorak上の配列なので、綴りはDvorakの文字で持つ
 *    （同じ物理キーを押すと、QWERTYの `a s d f g` がDvorakの `a o e u i` になる）。
 *    「記号」の節の `[` `]` `:` `@` だけはJIS配列のキー名で、US配列の物理位置へ読み替えてから写す。
 *    Dvorakの配列に対応するキーが無い（JISの `]` はUS配列の `\`）ものは、その行を除く。
 * 3. 同じキー列（前置キー列を含む全体）に節をまたいで別の出力がある時は、後に書かれた行を採る。
 *    `未` もその1つとして後の行が採られ、そのうえで割り当てなしとして除く。
 *    解説ページは句読点を `[,][.]`（Dvorakの文字）としており、後勝ちの結果（`、` が `,`・`。` が `.`）と一致する。
 * 4. 1つの出力に複数の綴りがある時は、打鍵数（文字数）が最小のものを採り、同数なら出典で先に現れた方を採る。
 * 5. 促音（っ）は定義の単打（Dvorakの `'`）だけを持ち、子音を重ねる自動生成はしない。
 * 6. 節 `頻出語省略入力` は、作者の例示と読める節で、配列の規則ではないので入れない。
 * 7. かなの範囲に入らない出力（ヵ・ヶ）は除く。
 * 8. 記号は、句読点（、。）と・を定義の綴りから写す。「」はほかのローマ字規則と同じ `[` `]` を使う
 *    （定義の `」` はDvorakの配列に無いキーで、「と」で別の規則にならないよう対で揃える）。ほかの記号は除く。
 *
 * 生成物は手で直接編集せず（整形は `npx biome format --write` で行う）、出典の更新時はこのスクリプトを再実行すること。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildTable, parseSource } from './jlod-core.ts';

/** 解析した定義ファイルの版。違う版では、解釈が変わっていないことを確かめるまで生成しない */
const EXPECTED_SHA256 = '6f851809fb7850eca9f2ca3bc1b461117a24a9847f0029960c1b3411cb796120';
/** 定義ファイルのHTTPのLast-Modified（解説ページの最終更新は2009-02-22でこれより古い） */
const SOURCE_LAST_MODIFIED = '2021-09-25';

function render(table: Record<string, string>, sha256: string): string {
  const entries = Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const lines = entries.map(([kana, roman]) => `  ${JSON.stringify(kana)}: ${JSON.stringify(roman)},`);
  return `import { addSokuonForms } from './kunrei.ts';

/**
 * JLOD拡張ローマ字入力のテーブル。Dvorak配列で打つ前提で、綴りはDvorakの文字で持つ。
 *
 * 出典: https://www.mikage.to/jlod/JLOD.hmo_kana （姫踊子草の定義ファイル。解説: https://www.mikage.to/jlod/）
 * 出典のsha256: ${sha256}
 * 出典のLast-Modified: ${SOURCE_LAST_MODIFIED}
 *
 * このファイルは \`scripts/gen-jlod-romaji.ts\` による生成物。直接編集しない。
 * 出典が「キー → 出力」なのに対しこちらは「かな → 綴り」なので逆写像である。
 * 出典のQWERTYの物理キー名を、同じ物理キーのDvorakの文字へ写してある。
 * 1つの出力に複数の綴りがある時は「打鍵数最小、同数なら出典で先に現れた方」で1つに決めた。
 * 詳細な変換規則はスクリプト本体のコメントを参照。
 *
 * kunrei.tsと違い、促音の自動生成ループは持たない。JLODで「っ」を出すのは
 * \`'\` の1打だけであり、子音を重ねる生成をすると、1打で出せる短縮が使われなくなるため。
 */
const BASE: Record<string, string> = {
${lines.join('\n')}
};

/** JLODテーブルを組み立てる。かな配列と同じ \`Map<string, string>\` の形で返す */
export function jlod(overrides: Record<string, string> = {}, generateSokuon = false): Map<string, string> {
  const table = new Map(Object.entries({ ...BASE, ...overrides }));
  if (generateSokuon) addSokuonForms(table);
  return table;
}
`;
}

function main() {
  const srcPath = process.argv[2];
  const outPath = process.argv[3] ?? new URL('../src/input/romaji/jlod.ts', import.meta.url).pathname;
  if (!srcPath) {
    console.error('usage: gen-jlod-romaji.ts <JLOD.hmo_kana> [out.ts]');
    process.exit(1);
  }
  const bytes = readFileSync(srcPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`出典のsha256が解析した版と違う: ${sha256}。解釈が変わっていないか確かめ、EXPECTED_SHA256を更新する`);
  }
  const text = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
  const { table, report } = buildTable(parseSource(text));
  writeFileSync(outPath, render(table, sha256));
  console.log(`${outPath} に ${Object.keys(table).length} 件のかなを書き出した`);
  for (const line of report) console.log(line);
}

main();
