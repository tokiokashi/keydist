/**
 * gACT10のローマ字テーブルを `src/input/romaji/gact10.ts` として生成するスクリプト。
 *
 * 出典: http://www1.vecceed.ne.jp/~bemu/gact/gACT10.dat （Google日本語入力のローマ字テーブルのインポート用ファイル。UTF-8・BOMあり・CRLF）
 * 解説: http://www1.vecceed.ne.jp/~bemu/gact/gact10_doc.html
 *
 * 使い方（実行時にネットへは出ない。事前に定義ファイルを取得しておく）:
 *
 *   curl -sS -o /tmp/gACT10.dat http://www1.vecceed.ne.jp/~bemu/gact/gACT10.dat
 *   node --experimental-strip-types scripts/gen-gact10-romaji.ts /tmp/gACT10.dat
 *
 * 定義ファイルはgit管理ではないので、版はsha256で固定する。出典のsha256が `EXPECTED_SHA256` と違う時は生成を止める。
 * 出典が更新されたら、差分を読んで `EXPECTED_SHA256`・`SOURCE_LAST_MODIFIED` を更新してから再実行する。
 *
 * 定義ファイルの書式（Google日本語入力のローマ字テーブル）:
 *
 * - `#` で始まる行はコメント。`#■` で始まる行は節の見出し。空白行やタブのない行は無視される
 * - 他の行は「入力・出力・次の入力」をタブで区切った3列。入力は、直前までの保留（次の入力）に今打ったキーをつなげた文字列
 *   （例: `か行a` は、`i` で保留が「か行」になった状態で `a` を打つ）。
 *   出力は確定する文字列、次の入力は保留に残す文字列（表示用の印を含む）。次の入力が空なら、確定して最初の状態に戻る
 *
 * 変換で決めたこと:
 *
 * 1. 定義は「状態 + キー → 出力と次の状態」の遷移なので、最初の状態（保留が空）から出発して、
 *    最初の状態に戻るまでの打鍵列のうち、途中で戻らないもの（入力の1つのまとまり）を全部たどり、出力ごとに綴りを決める。
 *    戻った後に続けて打つ並び（か + か など）は、評価が見出しの最長一致でつなぐので見出しにしない。
 * 2. 同じ入力の行が複数ある時は後の行を採る（Google日本語入力は同じ入力の行を後の行で置き換える）。
 *    そのあとで、出力も次の入力も空になった入力（割り当てのないマス）を除く。除いた入力は、キーを飲み込む行にしない。
 * 3. 保留の文字列がそのまま確定して意味のある文字になる状態（`r` のあとの「っ」と、`qn` のあとの「・」）では、
 *    次のキーに当たる行が無い時に保留を確定し、次のキーを最初の状態から読み直す。この動作で単独の「っ」は `r`、「・」は `qn` になる。
 *    それ以外の保留（「か行」「きy」「カく」など）は、確定しても意味のある出力にならないので見出しにしない。
 * 4. 1つの出力に複数の打鍵列がある時は、打鍵数が最小のものを採り、同数なら出典で先に現れた方
 *    （打鍵列をたどった行の行番号を先頭から比べて小さい方）を採る。
 * 5. 定義のキーはQWERTYの文字で書かれ、綴りもQWERTYの文字で持つ（keydistの `qwerty` 配列で打つ前提）。
 *    長音「ー」だけはJISの `:` のキーにある。US配列では同じ物理位置が `'` なので、綴りは `'` に読み替える。
 * 6. 促音（っ）は定義の `r` だけを持ち、子音を重ねる自動生成はしない。
 * 7. 末尾の節 `#その他の省略打ち` は、語・活用形を3打で出す行の並びで、拡張の解説が「上記以外にも様々な打ち方」と書くだけの例示と読めるので入れない。
 * 8. かなの範囲に入らない出力は除く。記号は、句読点（、。）と「・」（`qn`）を定義の綴りから写し、
 *    「」はほかのローマ字規則と同じ `[` `]` を足す（定義の「」は2つで1つの保留として出る）。矢印・循環する記号の行は除く。
 *
 * 生成物は手で直接編集せず（整形は `npx biome format --write` で行う）、出典の更新時はこのスクリプトを再実行すること。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildTable, parseSource } from './gact10-core.ts';

/** 解析した定義ファイルの版。違う版では、解釈が変わっていないことを確かめるまで生成しない */
const EXPECTED_SHA256 = 'db2cff880c8a009e322b929a2ec1cc296174750014372ddbbc626fb71a1e73ca';
/** 定義ファイルのHTTPのLast-Modified（配信側のファイルの日付で、定義の改訂日とは限らない） */
const SOURCE_LAST_MODIFIED = '2025-05-02';

function render(table: Record<string, string>, sha256: string): string {
  const entries = Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const lines = entries.map(([kana, roman]) => `  ${JSON.stringify(kana)}: ${JSON.stringify(roman)},`);
  return `import { addSokuonForms } from './kunrei.ts';

/**
 * gACT10のローマ字テーブル。QWERTY配列で打つ前提で、綴りはQWERTYの文字で持つ。
 *
 * 出典: http://www1.vecceed.ne.jp/~bemu/gact/gACT10.dat （Google日本語入力のローマ字テーブル。解説: http://www1.vecceed.ne.jp/~bemu/gact/gact10_doc.html）
 * 出典のsha256: ${sha256}
 * 出典のLast-Modified: ${SOURCE_LAST_MODIFIED}
 *
 * このファイルは \`scripts/gen-gact10-romaji.ts\` による生成物。直接編集しない。
 * 出典が「保留 + キー → 出力と次の保留」の遷移なのに対しこちらは「かな → 綴り」なので、遷移をたどって求めた逆写像である。
 * 1つの出力に複数の綴りがある時は「打鍵数最小、同数なら出典で先に現れた方」で1つに決めた。
 * 長音「ー」は出典ではJISの \`:\` のキーにあり、US配列の同じ物理位置の \`'\` に読み替えてある。
 * 詳細な変換規則はスクリプト本体のコメントを参照。
 *
 * kunrei.tsと違い、促音の自動生成ループは持たない。gACT10で「っ」を出すのは
 * \`r\` の1打だけであり、子音を重ねる生成をすると、1打で出せる短縮が使われなくなるため。
 */
const BASE: Record<string, string> = {
${lines.join('\n')}
};

/** gACT10テーブルを組み立てる。かな配列と同じ \`Map<string, string>\` の形で返す */
export function gact10(overrides: Record<string, string> = {}, generateSokuon = false): Map<string, string> {
  const table = new Map(Object.entries({ ...BASE, ...overrides }));
  if (generateSokuon) addSokuonForms(table);
  return table;
}
`;
}

function main() {
  const srcPath = process.argv[2];
  const outPath = process.argv[3] ?? new URL('../src/input/romaji/gact10.ts', import.meta.url).pathname;
  if (!srcPath) {
    console.error('usage: gen-gact10-romaji.ts <gACT10.dat> [out.ts]');
    process.exit(1);
  }
  const bytes = readFileSync(srcPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`出典のsha256が解析した版と違う: ${sha256}。解釈が変わっていないか確かめ、EXPECTED_SHA256を更新する`);
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const { table, report } = buildTable(parseSource(text));
  writeFileSync(outPath, render(table, sha256));
  console.log(`${outPath} に ${Object.keys(table).length} 件のかなを書き出した`);
  for (const line of report) console.log(line);
}

main();
