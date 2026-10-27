/**
 * JLODの定義ファイル（姫踊子草のストロークモード）を読み、かな → 綴りの表を作る。
 * 変換で決めたことは `gen-jlod-romaji.ts` の冒頭コメントにある。
 */

const KANA_CHARS = /^[぀-ゟヴー]+$/; // ひらがな + ヴ(カタカナ) + ー
const KEEP_PUNCT = new Set(['、', '。', '・']); // 定義の綴りを写す記号。「」は下のSUPPLEMENTSで足す
const SUPPLEMENTS: Readonly<Record<string, string>> = { '「': '[', '」': ']' };
const UNASSIGNED = '未';
const EXCLUDED_SECTION = /^頻出語省略入力/;
const SYMBOL_SECTION = '記号';

/** QWERTYの物理キーが出す文字 → 同じ物理キーでDvorakが出す文字。keydistの `dvorak` 配列と同じ並び */
const QWERTY_ROWS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
const DVORAK_ROWS = ['1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'];
const QWERTY_TO_DVORAK = new Map<string, string>();
for (const [r, row] of QWERTY_ROWS.entries()) {
  for (const [c, ch] of [...row].entries()) QWERTY_TO_DVORAK.set(ch, [...DVORAK_ROWS[r]][c]);
}

/** 「記号」の節のJISキー名 → US配列の物理位置が出す文字。`\` はDvorakの配列に無い */
const JIS_TO_US: Readonly<Record<string, string>> = { '[': ']', ']': '\\', ':': "'", '@': '[' };

interface Entry {
  /** 前置キー列を含む、QWERTY物理キー名での打鍵列 */
  readonly qwerty: string;
  /** Dvorakの文字での綴り。対応するキーが無ければ `undefined` */
  readonly spelling: string | undefined;
  readonly output: string;
  readonly section: string;
  /** 定義ファイルの行番号（1始まり） */
  readonly line: number;
}

/** キー列を位置ごとに分ける。`{xy}` は中の文字列を1つの位置とする */
function splitKeys(keys: string): string[] {
  const positions: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === '{') {
      const end = keys.indexOf('}', i);
      if (end < 0) throw new Error(`{ が閉じていない: ${JSON.stringify(keys)}`);
      positions.push(keys.slice(i + 1, end));
      i = end;
    } else {
      positions.push(keys[i]);
    }
  }
  return positions;
}

function toUsKeys(keys: string, section: string): string {
  return [...keys].map((ch) => (section === SYMBOL_SECTION && Object.hasOwn(JIS_TO_US, ch) ? JIS_TO_US[ch] : ch)).join('');
}

function toDvorak(usKeys: string): string | undefined {
  let out = '';
  for (const ch of usKeys) {
    const mapped = QWERTY_TO_DVORAK.get(ch);
    if (mapped === undefined) return undefined;
    out += mapped;
  }
  return out;
}

export interface Parsed {
  entries: Entry[];
  /** コメント行の見出しの一覧（出現順） */
  sections: { name: string; excluded: boolean; cells: number }[];
}

export function parseSource(text: string): Parsed {
  const entries: Entry[] = [];
  const sections: Parsed['sections'] = [];
  let section: { name: string; excluded: boolean; cells: number } | undefined;
  let prefix = '';
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    const lineNo = index + 1;
    if (line.startsWith("'")) {
      const name = line.slice(1).trim();
      // 先頭の `'` だけの行と、ファイル名・URLのコメントは節の見出しではない
      if (name === '' || name.startsWith('JLOD.hmo_kana') || name.startsWith('http')) return;
      section = { name, excluded: EXCLUDED_SECTION.test(name), cells: 0 };
      sections.push(section);
      prefix = '';
      return;
    }
    if (line.trim() === '' || section === undefined) return;
    if (line.startsWith('=')) {
      prefix = line.slice(1);
      return;
    }
    const cols = line.split('\t');
    if (cols.length !== 2) throw new Error(`${lineNo}行目: 想定外の行（キー列と出力の2列でない）: ${JSON.stringify(line)}`);
    const positions = splitKeys(cols[0]);
    const outputs = cols[1].split('$');
    if (positions.length !== outputs.length) {
      throw new Error(`${lineNo}行目: キーの位置${positions.length}と出力${outputs.length}の数が合わない: ${JSON.stringify(line)}`);
    }
    if (section.excluded) {
      section.cells += outputs.length;
      return;
    }
    positions.forEach((position, i) => {
      const qwerty = toUsKeys(prefix + position, section!.name);
      entries.push({ qwerty, spelling: toDvorak(qwerty), output: outputs[i], section: section!.name, line: lineNo });
    });
    section.cells += outputs.length;
  });
  return { entries, sections };
}

export interface Built {
  table: Record<string, string>;
  report: string[];
}

export function buildTable(parsed: Parsed): Built {
  const report: string[] = [];
  const { entries } = parsed;

  // 同じ打鍵列は後勝ち。Mapの挿入順は最初の出現の位置で固定されるので、勝った行の行番号を別に持つ
  const byKey = new Map<string, Entry>();
  const overrides: string[] = [];
  for (const entry of entries) {
    const key = entry.qwerty;
    const previous = byKey.get(key);
    if (previous && previous.output !== entry.output) {
      overrides.push(`${key}: ${previous.output}（${previous.line}行目 ${previous.section}）→ ${entry.output}（${entry.line}行目 ${entry.section}）`);
    }
    byKey.set(key, entry);
  }
  report.push(`同じ打鍵列に別の出力があった件数（後の行を採った）: ${overrides.length}`);
  for (const line of overrides) report.push(`  ${line}`);

  const winners = [...byKey.values()].sort((a, b) => a.line - b.line);

  let unassigned = 0;
  const unmapped: string[] = [];
  const dropped = new Map<string, number>();
  const kept: Entry[] = [];
  for (const entry of winners) {
    if (entry.output === UNASSIGNED) {
      unassigned++;
      continue;
    }
    if (entry.spelling === undefined) {
      unmapped.push(`${entry.output}（${entry.qwerty}）`);
      continue;
    }
    if (KANA_CHARS.test(entry.output) || KEEP_PUNCT.has(entry.output)) {
      kept.push(entry);
    } else {
      dropped.set(entry.output, (dropped.get(entry.output) ?? 0) + 1);
    }
  }
  report.push(`未（割り当てなし）として落とした件数（後勝ちの後）: ${unassigned}`);
  report.push(`Dvorakの配列に対応するキーが無く落とした行: ${unmapped.join(' ') || 'なし'}`);
  report.push(`かな・採る記号に入らず落とした出力: ${[...dropped].map(([o, n]) => `${o}×${n}`).join(' ') || 'なし'}`);

  // 出力 → 候補。打鍵数最小、同数なら行番号（出典での出現順）が小さい方
  const candidates = new Map<string, Entry[]>();
  for (const entry of kept) {
    const list = candidates.get(entry.output) ?? [];
    list.push(entry);
    candidates.set(entry.output, list);
  }
  const table: Record<string, string> = {};
  let multi = 0;
  for (const [output, list] of candidates) {
    if (list.length > 1) multi++;
    const best = [...list].sort((a, b) => a.spelling!.length - b.spelling!.length || a.line - b.line)[0];
    table[output] = best.spelling!;
  }
  report.push(`綴りが複数あり、打鍵数最小・出典で先に決めた件数: ${multi}`);
  for (const [symbol, spelling] of Object.entries(SUPPLEMENTS)) {
    const fromSource = byKey.size > 0 ? [...byKey.values()].find((e) => e.output === symbol && e.spelling !== undefined)?.spelling : undefined;
    report.push(`${symbol} は定義の綴り（${fromSource ?? 'Dvorakに無い'}）を使わず ${spelling} を足した`);
    table[symbol] = spelling;
  }

  // 打鍵列どうしの前置関係（一方が他方の頭）。評価はかなごとに綴りを引くので生成には影響しないが、数を残す
  const spellings = Object.values(table);
  let prefixPairs = 0;
  for (const a of spellings) for (const b of spellings) if (a !== b && b.startsWith(a)) prefixPairs++;
  report.push(`ほかの綴りの頭になっている綴りの組: ${prefixPairs}`);

  report.push('節ごとの出力の位置の数（入れた/落とした）:');
  for (const s of parsed.sections) report.push(`  ${s.excluded ? '落とした' : '入れた  '} ${s.name}: ${s.cells}`);
  return { table, report };
}
