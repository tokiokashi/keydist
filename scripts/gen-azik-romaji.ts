/**
 * AZIK拡張ローマ字テーブルを `src/input/romaji/azik.ts` として生成するスクリプト。
 *
 * 出典: https://github.com/toriwasa/azik-roman-tableの `azik_romantable.txt`
 * （Google日本語入力向け。ローマ字 → かな、非空行576、すべて2列のTSV）
 *
 * 使い方（実行時にネットへは出ない。事前に出典をローカルへcloneしておく）:
 *
 *   GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/toriwasa/azik-roman-table /tmp/azik
 *   node --experimental-strip-types scripts/gen-azik-romaji.ts /tmp/azik/azik_romantable.txt
 *
 * 変換で決めたこと:
 *
 * 1. 出典は「ローマ字 → かな」、keydistのテーブルは「かな → ローマ字」なので逆写像を作る。
 * 2. 1つの出力（かな、または複数かなの並び）に複数の綴りがある場合（134件、互換キー）は
 *    (a)打鍵数（文字数）が最小のものを採る
 *    (b)同数なら出典ファイルに先に現れた方を採る（AZIK本来の綴りが先、互換キーが後に並ぶ）
 *    の順で1つに決める。Array.prototype.sortは安定ソートなので、長さで並べ替えても
 *    同じ長さの中の出現順は保たれる。
 * 3. 促音（っ）は出典で `;` の1行だけが対応する。`kunrei()` のように子音を重ねて
 *    自動生成するとAZIKの1打という利点を潰すので、生成ループは持たない。
 * 4. 出典はJIS配列 + Google日本語入力を前提にした記号（「」『』・…‥〜）を含む。
 *    かな以外の出力は、句読点（、。kunrei.tsと同じ綴り）と、出典が `[` `]` に割り当てている
 *    `「」` だけを残し、ほかの記号は落とす。`『』` は評価側が `「」` の別名として打つ（仕様 §4）。
 *    `…` は綴りを持たない扱い、`〜` ほかは配列が打てない文字に数える。
 *    `・` は出典では `z/` にだけあり、zで始まる綴りはIMEによって有無が割れるので採らない。
 *    出典は `/` に何も割り当てていないので、ほかのローマ字規則と同じ `/` を `・` の綴りとして足す。
 *    出典が `[` `]` `/` の割り当てを変えたら、この前提が崩れるので生成を止める。
 *
 * 生成物は手で直接編集せず（整形は `npx biome format --write` で行う）、出典の更新時はこのスクリプトを再実行すること。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const KANA_CHARS = /^[぀-ゟヴー]+$/; // ひらがな + ヴ(カタカナ) + ー
const KEEP_PUNCT = new Set(['、', '。', '「', '」']); // 、。はkunrei.tsの綴りと揃える。「」は出典の `[` `]`。他の記号は落とす
const SUPPLEMENTS: Readonly<Record<string, string>> = { '・': '/' }; // 出典に綴りが無い記号。ほかのローマ字規則と同じ綴りを足す
const QWERTY_CHARS = new Set([..."1234567890-=qwertyuiop[]asdfghjkl;'zxcvbnm,./"]);

interface Row {
  input: string;
  output: string;
}

function parseSource(text: string): Row[] {
  const rows: Row[] = [];
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  for (const line of lines) {
    if (line.trim() === '') continue;
    const cols = line.split('\t');
    if (cols.length !== 2) {
      throw new Error(`想定外の行（2列でない）: ${JSON.stringify(line)}`);
    }
    const [input, output] = cols;
    rows.push({ input, output });
  }
  return rows;
}

function checkBracketAssumptions(rows: Row[]) {
  const outputOf = (input: string) => rows.filter((r) => r.input === input).map((r) => r.output);
  for (const [input, expected] of [
    ['[', ['「']],
    [']', ['」']],
    ['/', []],
  ] as const) {
    const actual = outputOf(input);
    if (actual.join() !== expected.join()) {
      throw new Error(`出典の ${JSON.stringify(input)} の割り当てが前提と違う: ${JSON.stringify(actual)}。記号の扱いを見直す`);
    }
  }
}

function buildTable(rows: Row[]): { table: Record<string, string>; droppedSymbols: string[] } {
  checkBracketAssumptions(rows);
  const kanaRows = rows.filter((r) => KANA_CHARS.test(r.output) || KEEP_PUNCT.has(r.output));
  const droppedSymbols = [...new Set(rows.filter((r) => !kanaRows.includes(r)).map((r) => r.output))].filter((symbol) => !(symbol in SUPPLEMENTS));

  // 出力 → 候補綴りの一覧。出典での出現順を保ったまま集める
  const candidates = new Map<string, string[]>();
  for (const { input, output } of kanaRows) {
    const list = candidates.get(output) ?? [];
    list.push(input);
    candidates.set(output, list);
  }

  const table: Record<string, string> = {};
  for (const [kana, spellings] of candidates) {
    // 安定ソートなので、同じ長さの中では出典での出現順（先勝ち）が保たれる
    const sorted = [...spellings].sort((a, b) => a.length - b.length);
    const chosen = sorted.find((s) => [...s].every((ch) => QWERTY_CHARS.has(ch)));
    if (chosen === undefined) {
      throw new Error(`${kana} の全綴りがANSI QWERTYに無い文字を含む: ${sorted.join(', ')}`);
    }
    table[kana] = chosen;
  }
  for (const [symbol, spelling] of Object.entries(SUPPLEMENTS)) table[symbol] = spelling;
  return { table, droppedSymbols };
}

/**
 * 出典ファイルが置かれたcloneのコミットを拾う。
 * 生成物と出典の対応を後から辿れるようにするため。git管理下でなければ空を返す
 */
function sourceCommit(srcPath: string): string {
  try {
    return execFileSync('git', ['-C', dirname(srcPath), 'rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function render(table: Record<string, string>, commit: string): string {
  // Unicodeコードポイント順に並べる。生成の再現性を優先し、訓令式テーブルのような
  // 手書きのグルーピングはしない
  const entries = Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const lines = entries.map(([kana, roman]) => `  ${JSON.stringify(kana)}: ${JSON.stringify(roman)},`);
  return `import { addSokuonForms } from './kunrei.ts';

/**
 * AZIK 拡張ローマ字入力のテーブル。
 *
 * 出典: https://github.com/toriwasa/azik-roman-table の \`azik_romantable.txt\`
 * （Google 日本語入力向け。AZIK 本体は
 * https://web.archive.org/web/20241217165614/http://hp.vector.co.jp/authors/VA002116/azik/azikinfo.htm ）
 *${commit ? `\n * 出典のコミット: ${commit}\n *` : ''}
 * このファイルは \`scripts/gen-azik-romaji.ts\` による生成物。直接編集しない。
 * 出典が「ローマ字 → かな」なのに対しこちらは「かな → ローマ字」なので逆写像である。
 * 出典の134件の重複（互換キー）は「打鍵数最小、同数なら出典で先に現れた方」で1つに決めた。
 * 詳細な変換規則はスクリプト本体のコメントを参照。
 *
 * kunrei.ts と違い、促音の自動生成ループは持たない。AZIK で「っ」を出すのは
 * \`;\` の1打だけであり、子音を重ねる生成をすると AZIK の利点（打鍵数の削減）を潰すため。
 */
const BASE: Record<string, string> = {
${lines.join('\n')}
};

/** AZIK テーブルを組み立てる。かな配列と同じ \`Map<string, string>\` の形で返す */
export function azik(overrides: Record<string, string> = {}, generateSokuon = false): Map<string, string> {
  const table = new Map(Object.entries({ ...BASE, ...overrides }));
  if (generateSokuon) addSokuonForms(table);
  return table;
}
`;
}

function main() {
  const srcPath = process.argv[2];
  const outPath = process.argv[3] ?? new URL('../src/input/romaji/azik.ts', import.meta.url).pathname;
  if (!srcPath) {
    console.error('usage: gen-azik-romaji.ts <azik_romantable.txt> [out.ts]');
    process.exit(1);
  }
  const rows = parseSource(readFileSync(srcPath, 'utf-8'));
  const { table, droppedSymbols } = buildTable(rows);
  writeFileSync(outPath, render(table, sourceCommit(srcPath)));
  console.log(`${outPath} に ${Object.keys(table).length} 件のかなを書き出した`);
  console.log(`落とした記号出力（${droppedSymbols.length}件）: ${droppedSymbols.join(' ')}`);
}

main();
