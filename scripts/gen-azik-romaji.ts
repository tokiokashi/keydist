/**
 * AZIK拡張ローマ字テーブルを `src/romaji/azik.ts` として生成するスクリプト。
 *
 * 出典: https://github.com/toriwasa/azik-roman-tableの `azik_romantable.txt`
 * （Google日本語入力向け。ローマ字 → かな、非空行576、すべて2列のTSV）
 *
 * 使い方（実行時にネットへは出ない。事前に出典をローカルへcloneしておく）:
 *
 *   GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/toriwasa/azik-roman-table /tmp/azik
 *   node --experimental-strip-types scripts/gen-azik-romaji.ts /tmp/azik/azik_romantable.txt
 *
 * 変換で決めたこと（issue #33）:
 *
 * 1. 出典は「ローマ字 → かな」、keydistのテーブルは「かな → ローマ字」なので逆写像を作る。
 * 2. 1つの出力（かな、または複数かなの並び）に複数の綴りがある場合（134件、互換キー）は
 *    (a)打鍵数（文字数）が最小のものを採る
 *    (b)同数なら出典ファイルに先に現れた方を採る（AZIK本来の綴りが先、互換キーが後に並ぶ）
 *    の順で1つに決める。Array.prototype.sortは安定ソートなので、長さで並べ替えても
 *    同じ長さの中の出現順は保たれる。
 * 3. 促音（っ）は出典で `;` の1行だけが対応する。`kunrei()` のように子音を重ねて
 *    自動生成するとAZIKの1打という利点を潰すので、生成ループは持たない。
 * 4. 出典はJIS配列 + Google日本語入力を前提にした記号（「」『』・…‥〜）を含むが、
 *    keydistはANSI刻印でキーを指すので、かな以外の出力は句読点（、。kunrei.tsと同じ綴り）
 *    だけを残し、それ以外の記号は落とす。
 *
 * 生成物は手で直接編集せず、出典の更新時はこのスクリプトを再実行すること。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const KANA_CHARS = /^[぀-ゟヴー]+$/; // ひらがな + ヴ(カタカナ) + ー
const KEEP_PUNCT = new Set(['、', '。']); // kunrei.tsの綴りと揃える。他の記号はJIS配列前提なので落とす
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

function buildTable(rows: Row[]): { table: Record<string, string>; droppedSymbols: string[] } {
  const kanaRows = rows.filter((r) => KANA_CHARS.test(r.output) || KEEP_PUNCT.has(r.output));
  const droppedSymbols = [...new Set(rows.filter((r) => !kanaRows.includes(r)).map((r) => r.output))];

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
  return `/**
 * AZIK拡張ローマ字入力のテーブル。
 *
 * 出典: https://github.com/toriwasa/azik-roman-tableの \`azik_romantable.txt\`
 * （Google日本語入力向け。AZIK本体は
 * https://web.archive.org/web/20241217165614/http://hp.vector.co.jp/authors/VA002116/azik/azikinfo.htm）
 *${commit ? `\n * 出典のコミット: ${commit}\n *` : ''}
 * このファイルは \`scripts/gen-azik-romaji.ts\` による生成物。直接編集しない。
 * 出典が「ローマ字 → かな」なのに対しこちらは「かな → ローマ字」なので逆写像である。
 * 出典の134件の重複（互換キー）は「打鍵数最小、同数なら出典で先に現れた方」で1つに決めた。
 * 詳細な変換規則はスクリプト本体のコメントを参照。
 *
 * kunrei.tsと違い、促音の自動生成ループは持たない。AZIKで「っ」を出すのは
 * \`;\` の1打だけであり、子音を重ねる生成をするとAZIKの利点（打鍵数の削減）を潰すため。
 */
const BASE: Record<string, string> = {
${lines.join('\n')}
};

/** AZIKテーブルを組み立てる。かな配列と同じ \`Map<string, string>\` の形で返す */
export function azik(): Map<string, string> {
  return new Map(Object.entries(BASE));
}
`;
}

function main() {
  const srcPath = process.argv[2];
  const outPath = process.argv[3] ?? new URL('../src/romaji/azik.ts', import.meta.url).pathname;
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
