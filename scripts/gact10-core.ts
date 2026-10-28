/**
 * gACT10の定義ファイル（Google日本語入力のローマ字テーブル）を読み、かな → 綴りの表を作る。
 * 変換で決めたことは `gen-gact10-romaji.ts` の冒頭コメントにある。
 */

const KANA_CHARS = /^[぀-ゟヴー]+$/; // ひらがな + ヴ(カタカナ) + ー
const KEEP_PUNCT = new Set(['、', '。', '・']); // 定義の綴りを写す記号。「」は下のSUPPLEMENTSで足す
const SUPPLEMENTS: Readonly<Record<string, string>> = { '「': '[', '」': ']' };
/** 保留の文字列がそのまま確定して意味のある文字になる状態。次のキーに当たる行が無い時は、保留を確定して次のキーを根から読み直す */
export const COMMITTABLE_PENDING: ReadonlySet<string> = new Set(['っ', '・']);
/** 定義のJISキー名 → 同じ物理位置のUS配列のキーが出す文字 */
const JIS_TO_US: Readonly<Record<string, string>> = { ':': "'" };
/** 節の見出しのコメント。報告で節ごとの行数を出すためだけに使う */
const SECTION_HEADER = /^#(■|その他の省略打ち)/;
/** 見出し1つの打鍵の長さの上限。循環する状態を打ち切るためだけの値で、定義の実際の最長より大きい */
const MAX_KEYS = 8;

export interface Rule {
  /** 保留と、最後に打ったキーをつなげた入力の列（定義の1列目） */
  readonly input: string;
  /** 打ったキーの前の保留（`input` から最後の1文字を除いたもの） */
  readonly state: string;
  /** 最後に打ったキー（QWERTYの文字。長音の `:` を含む） */
  readonly key: string;
  readonly output: string;
  /** 次の入力（定義の3列目）。空なら根に戻る */
  readonly pending: string;
  /** 定義ファイルの行番号（1始まり） */
  readonly line: number;
  readonly section: string;
}

export interface Parsed {
  rules: Rule[];
  /** 入力の列が空でない行の数 */
  inputLines: number;
}

export function parseSource(text: string): Parsed {
  const rules: Rule[] = [];
  let section = '';
  let inputLines = 0;
  text
    .replace(/^\uFEFF/, '')
    .split('\n')
    .forEach((raw, index) => {
      const line = raw.replace(/\r$/, '');
      const lineNo = index + 1;
      if (line.startsWith('#')) {
        if (SECTION_HEADER.test(line)) section = line.slice(1);
        return;
      }
      // 空白行やタブのない行は、Google日本語入力が読み込んだあとに無視する
      if (!line.includes('\t')) return;
      const cols = line.split('\t');
      if (cols.length !== 3) throw new Error(`${lineNo}行目: 想定外の行（入力・出力・次の入力の3列でない）: ${JSON.stringify(line)}`);
      const [input, output, pending] = cols;
      if (input === '') return; // 3列とも空の行
      inputLines++;
      const key = input.slice(-1);
      if (!/^[a-z;,./:]$/.test(key)) throw new Error(`${lineNo}行目: 最後の文字がQWERTYのキーでない: ${JSON.stringify(line)}`);
      const rule: Rule = { input, state: input.slice(0, -1), key, output, pending, line: lineNo, section };
      rules.push(rule);
    });
  return { rules, inputLines };
}

/** 定義の打鍵（QWERTYの文字）を、keydistの `qwerty` 配列で打つ文字に読み替える */
export function toSpelling(fileKeys: string): string {
  return [...fileKeys].map((ch) => (Object.hasOwn(JIS_TO_US, ch) ? JIS_TO_US[ch] : ch)).join('');
}

export function fromSpelling(spelling: string): string {
  const back = new Map(Object.entries(JIS_TO_US).map(([jis, us]) => [us, jis]));
  return [...spelling].map((ch) => back.get(ch) ?? ch).join('');
}

/** 後勝ちで重複を解き、出力も次の入力も空の入力を除く。遷移表（状態 → キー → 行）を返す */
export function resolveRules(rules: readonly Rule[]): {
  transitions: Map<string, Map<string, Rule>>;
  duplicates: string[];
  emptied: Rule[];
  resolved: Rule[];
} {
  const byInput = new Map<string, Rule>();
  const duplicates: string[] = [];
  for (const rule of rules) {
    const previous = byInput.get(rule.input);
    if (previous && (previous.output !== rule.output || previous.pending !== rule.pending)) {
      const show = (r: Rule) => `出力「${r.output}」次の入力「${r.pending}」（${r.line}行目）`;
      duplicates.push(`${rule.input}: ${show(previous)} → ${show(rule)}`);
    }
    byInput.set(rule.input, rule);
  }
  const emptied: Rule[] = [];
  const resolved: Rule[] = [];
  const transitions = new Map<string, Map<string, Rule>>();
  for (const rule of [...byInput.values()].sort((a, b) => a.line - b.line)) {
    if (rule.output === '' && rule.pending === '') {
      emptied.push(rule);
      continue;
    }
    resolved.push(rule);
    const row = transitions.get(rule.state) ?? new Map<string, Rule>();
    row.set(rule.key, rule);
    transitions.set(rule.state, row);
  }
  return { transitions, duplicates, emptied, resolved };
}

export interface ReadResult {
  /** 確定した文字列。最後に保留が確定できる状態（っ・・）なら、その保留も含める */
  readonly output: string;
  /** 読み終えた時の保留。根に戻っていれば空 */
  readonly pending: string;
  /** 途中で、保留にも根にも当たる行が無くなったか */
  readonly stuck: boolean;
}

/**
 * 打鍵の列（定義のQWERTYの文字）を、Google日本語入力と同じ動作で読む。
 * 保留に続くキーに当たる行が無く、保留が確定できる状態（っ・・）なら、保留を確定して次のキーを根から読み直す。
 */
export function readKeys(transitions: ReadonlyMap<string, ReadonlyMap<string, Rule>>, fileKeys: string): ReadResult {
  let output = '';
  let state = '';
  for (const key of fileKeys) {
    let rule = transitions.get(state)?.get(key);
    if (!rule && COMMITTABLE_PENDING.has(state)) {
      output += state;
      state = '';
      rule = transitions.get('')?.get(key);
    }
    if (!rule) return { output, pending: state, stuck: true };
    output += rule.output;
    state = rule.pending;
  }
  if (COMMITTABLE_PENDING.has(state)) return { output: output + state, pending: '', stuck: false };
  return { output, pending: state, stuck: false };
}

interface Candidate {
  readonly fileKeys: string;
  readonly lines: readonly number[];
}

function better(a: Candidate, b: Candidate): boolean {
  if (a.fileKeys.length !== b.fileKeys.length) return a.fileKeys.length < b.fileKeys.length;
  for (let i = 0; i < Math.min(a.lines.length, b.lines.length); i++) {
    if (a.lines[i] !== b.lines[i]) return a.lines[i] < b.lines[i];
  }
  return false;
}

export interface Built {
  table: Record<string, string>;
  report: string[];
  /** 見出し → 打鍵の列（定義のQWERTYの文字）。「」の補足は含まない */
  fileKeys: Record<string, string>;
}

export function buildTable(parsed: Parsed): Built {
  const report: string[] = [];
  const { transitions, duplicates, emptied, resolved } = resolveRules(parsed.rules);

  report.push(`入力の列が空でない行: ${parsed.inputLines}`);
  const sections = new Map<string, number>();
  for (const rule of parsed.rules) sections.set(rule.section, (sections.get(rule.section) ?? 0) + 1);
  report.push('節ごとに入れた行（重複の解決前）:');
  for (const [name, count] of sections) report.push(`  ${name}: ${count}`);
  report.push(`同じ入力に別の行があった件数（後の行を採った）: ${duplicates.length}`);
  for (const line of duplicates) report.push(`  ${line}`);
  report.push(`重複を解いたあと、出力も次の入力も空で除いた件数: ${emptied.length}`);
  report.push(`  ${emptied.map((r) => `${r.input}（${r.line}行目）`).join(' ')}`);
  const partial = resolved.filter((r) => r.output !== '' && r.pending !== '');
  report.push(`出力と次の入力の両方を持つ行: ${partial.length}${partial.length ? ` ${partial.map((r) => r.input).join(' ')}` : ''}`);
  const orphans = resolved.filter(
    (r) => r.state !== '' && ![...transitions.values()].some((row) => [...row.values()].some((p) => p.pending === r.state)),
  );
  report.push(`保留がどの行からも作られず、到達できない入力: ${orphans.length}`);

  // 根から、根に戻るまで（または確定できる保留で止まるまで）の打鍵列を全部たどる。状態の循環は打ち切る
  const best = new Map<string, Candidate>();
  const nonKana = new Map<string, number>();
  const emit = (output: string, candidate: Candidate) => {
    if (!(KANA_CHARS.test(output) || KEEP_PUNCT.has(output))) {
      nonKana.set(output, (nonKana.get(output) ?? 0) + 1);
      return;
    }
    const current = best.get(output);
    if (!current || better(candidate, current)) best.set(output, candidate);
  };
  const walk = (state: string, output: string, fileKeys: string, lines: readonly number[], seen: ReadonlySet<string>) => {
    if (fileKeys.length >= MAX_KEYS) return;
    for (const [key, rule] of transitions.get(state) ?? []) {
      const keys = fileKeys + key;
      const path = [...lines, rule.line];
      const out = output + rule.output;
      if (rule.pending === '') {
        emit(out, { fileKeys: keys, lines: path });
        continue;
      }
      if (COMMITTABLE_PENDING.has(rule.pending)) emit(out + rule.pending, { fileKeys: keys, lines: path });
      if (!seen.has(rule.pending)) walk(rule.pending, out, keys, path, new Set([...seen, rule.pending]));
    }
  };
  walk('', '', '', [], new Set(['']));
  report.push(`根から根に戻る入力のまとまりの出力のうち、かな・採る記号に入らず落とした出力の種類: ${nonKana.size}`);
  if (nonKana.size) report.push(`  ${[...nonKana].map(([o, n]) => `${o}×${n}`).join(' ')}`);

  const table: Record<string, string> = {};
  const fileKeys: Record<string, string> = {};
  for (const [output, candidate] of best) {
    table[output] = toSpelling(candidate.fileKeys);
    fileKeys[output] = candidate.fileKeys;
  }
  for (const [symbol, spelling] of Object.entries(SUPPLEMENTS)) {
    table[symbol] = spelling;
  }

  const lengths = Object.keys(table).map((kana) => [...kana].length);
  report.push(`見出しの数: ${Object.keys(table).length}（うち補足の「」は2件）。見出しの最長: ${Math.max(...lengths)}文字`);

  // 打鍵列どうしの前置関係（一方が他方の頭）。評価は見出しの最長一致でつなぐので生成には影響しないが、数を残す
  const spellings = Object.entries(table);
  const prefixPairs: string[] = [];
  for (const [ka, a] of spellings) for (const [kb, b] of spellings) if (a !== b && b.startsWith(a)) prefixPairs.push(`${ka}(${a})→${kb}(${b})`);
  report.push(`ほかの綴りの頭になっている綴りの組: ${prefixPairs.length}`);
  const prefixHeads = new Map<string, number>();
  for (const pair of prefixPairs) {
    const head = pair.slice(0, pair.indexOf('→'));
    prefixHeads.set(head, (prefixHeads.get(head) ?? 0) + 1);
  }
  report.push(`  頭になる綴り: ${[...prefixHeads].map(([h, n]) => `${h}×${n}`).join(' ')}`);

  // 確定できる保留の状態の直後に、その状態の続きになるキーが来ると、別の出力に読まれる
  for (const state of COMMITTABLE_PENDING) {
    const heading = Object.entries(table).find(([kana]) => kana === state);
    const follow = new Set(transitions.get(state)?.keys() ?? []);
    const misread = Object.entries(fileKeys).filter(([, keys]) => follow.has(keys[0]));
    report.push(
      `${state}（${heading ? heading[1] : '見出し無し'}）の直後に続くと別の出力に読まれる先頭のキー: ${[...follow].join('')}。` +
        `この先頭のキーで始まる見出しの数: ${misread.length}`,
    );
  }

  // 1つの出力に複数の打鍵列があった件数は、打鍵数最小・出典で先の規則で決めた
  const multi = new Map<string, number>();
  const count = (state: string, output: string, depth: number, seen: ReadonlySet<string>) => {
    if (depth >= MAX_KEYS) return;
    for (const rule of transitions.get(state)?.values() ?? []) {
      const out = output + rule.output;
      if (rule.pending === '') {
        multi.set(out, (multi.get(out) ?? 0) + 1);
        continue;
      }
      if (COMMITTABLE_PENDING.has(rule.pending)) multi.set(out + rule.pending, (multi.get(out + rule.pending) ?? 0) + 1);
      if (!seen.has(rule.pending)) count(rule.pending, out, depth + 1, new Set([...seen, rule.pending]));
    }
  };
  count('', '', 0, new Set(['']));
  const multiKept = [...multi].filter(([o, n]) => n > 1 && best.has(o));
  report.push(`綴りが複数あり、打鍵数最小・出典で先に決めた件数: ${multiKept.length}`);
  for (const [o, n] of multiKept) report.push(`  ${o}: ${n}通り → ${toSpelling(best.get(o)!.fileKeys)}`);

  return { table, report, fileKeys };
}
