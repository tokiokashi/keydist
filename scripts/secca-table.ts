/**
 * 雪華の出典（`config.kbd`と`.XCompose`の表）から、組み込みの表（`src/input/layouts/tables/secca.json`）を作る。
 * 打鍵列の求め方は`secca-core.ts`。ここは、どの行を使い、どう並べて書くかを決める。
 */
import { LIFT, authorKey, findChords, parseComposeFile, parseKmonadConfig, type SeccaRow } from './secca-core.ts';

/** 作者の`.XCompose`がincludeする順。かなの表（`.XCompose`自身）は最後に置く。 */
export const SECCA_COMPOSE_FILES = [
  '.XCompose.symbols',
  '.XCompose.kanji',
  '.XCompose.variant_of_kanji',
  '.XCompose.set_of_kanji',
  '.XCompose.proper_noun',
  '.XCompose',
] as const;

export type SeccaSectionName = 'symbol' | 'kanji' | 'variant' | 'jukugo' | 'proper' | 'kana';

const SECTION_BY_FILE: Readonly<Record<string, SeccaSectionName>> = {
  '.XCompose.symbols': 'symbol',
  '.XCompose.kanji': 'kanji',
  '.XCompose.variant_of_kanji': 'variant',
  '.XCompose.set_of_kanji': 'jukugo',
  '.XCompose.proper_noun': 'proper',
  '.XCompose': 'kana',
};

/**
 * 組み込みの表。節ごとに、行を改行でつないだ文字列にする。行は「見出し 打鍵」で、見出しと打鍵は半角空白で区切る。
 * 打鍵は、キーを打つ順に並べた文字列。作者の表記のキー（QWERTYの位置）をそのまま書き、空白キーは`_`と書く。
 * 括弧で囲んだキーは、同時に押す1ステップ（`(wj)`）。かなの節だけが持つ。括弧の中の`_`は、空白キーを先に押す。
 */
export type SeccaTable = Readonly<Record<SeccaSectionName, string>>;

export type SeccaSkipReason = 'empty' | 'katakana-mode' | 'unreachable';

export interface SeccaSkippedRow {
  readonly row: SeccaRow;
  readonly reason: SeccaSkipReason;
}

export interface SeccaBuild {
  readonly table: SeccaTable;
  readonly skipped: readonly SeccaSkippedRow[];
  /** 節ごとの、表の行の数と、組み込みの表に入れた行の数 */
  readonly counts: Readonly<Record<SeccaSectionName, { readonly rows: number; readonly used: number }>>;
}

/** カタカナのモード（CapsLockのタップで入るShiftロック）でだけ出る、かなの表の行の左辺の2番目の記号 */
const KATAKANA_MODE_SECOND_SYMBOLS = new Set(['plus', 'underscore', 'braceright', 'asciitilde']);

const keyToChar = (physical: string): string => {
  const key = authorKey(physical);
  if (key === undefined) throw new Error(`作者の表記に位置が無いキー: ${physical}`);
  return key === 'space' ? '_' : key;
};

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

/**
 * 出典（`config.kbd`と表）から、組み込みの表を作る。
 * 使わない行（出力が空・カタカナのモードの行・どの押し方でも作れない行）は`skipped`に理由を付けて返す。
 */
export function buildSeccaTable(configText: string, composeTexts: Readonly<Record<string, string>>): SeccaBuild {
  const config = parseKmonadConfig(configText);
  const rows: SeccaRow[] = SECCA_COMPOSE_FILES.flatMap((file) => {
    const text = composeTexts[file];
    if (text === undefined) throw new Error(`表が無い: ${file}`);
    return parseComposeFile(file, text);
  });
  const reasonOf = (row: SeccaRow): SeccaSkipReason | undefined => {
    if (row.output === '') return 'empty';
    if (row.file === '.XCompose' && KATAKANA_MODE_SECOND_SYMBOLS.has(row.symbols[1]!)) return 'katakana-mode';
    return undefined;
  };
  const { chordsByRow, unreachable } = findChords(config, rows, (row) => reasonOf(row) === undefined);
  const unreachableRows = new Set(unreachable);
  const lines: Record<SeccaSectionName, string[]> = { symbol: [], kanji: [], variant: [], jukugo: [], proper: [], kana: [] };
  const counts = Object.fromEntries((Object.keys(lines) as SeccaSectionName[]).map((name) => [name, { rows: 0, used: 0 }])) as Record<
    SeccaSectionName,
    { rows: number; used: number }
  >;
  const skipped: SeccaSkippedRow[] = [];
  const seen = new Set<string>();
  const ordersByGroup = new Map<string, Set<string>>();
  for (const row of rows) {
    const section = SECTION_BY_FILE[row.file]!;
    counts[section].rows++;
    const reason = reasonOf(row) ?? (unreachableRows.has(row) ? 'unreachable' : undefined);
    if (reason !== undefined) {
      skipped.push({ row, reason });
      continue;
    }
    if (/[ \t\r\n]/.test(row.output)) throw new Error(`見出しに空白文字がある: ${row.file}:${row.line}`);
    const chords = chordsByRow.get(row)!;
    const keys = chords[0]!.filter((op) => op !== LIFT);
    let text: string;
    if (section === 'kana') {
      // かなは、キーの集合を同時に押す1ステップ。押す順序を入れ替えても同じ字が出ることを確かめる（空白キーを先に押す組を除く）
      const set = [...new Set(keys)];
      if (set.length !== keys.length) throw new Error(`かなの押し順に同じキーがある: ${row.file}:${row.line}`);
      if (set.includes('spc')) {
        if (set.length !== 2 || keys[0] !== 'spc') throw new Error(`空白キーを先に押す2キーでないかな: ${row.file}:${row.line}`);
        text = `(_${keyToChar(keys[1]!)})`;
      } else if (set.length === 1) {
        text = keyToChar(set[0]!);
      } else {
        text = `(${set.map(keyToChar).sort().join('')})`;
        const orders = ordersByGroup.get(`${row.output} ${text}`) ?? new Set<string>();
        orders.add(keys.join(' '));
        ordersByGroup.set(`${row.output} ${text}`, orders);
      }
    } else {
      text = keys.map(keyToChar).join('');
    }
    const id = `${section} ${row.output} ${text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    lines[section].push(`${row.output} ${text}`);
    counts[section].used++;
  }
  // かなの同時押しは、押す順序を入れ替えても同じ字が出る（全部の順序の行が表にある）
  for (const [group, orders] of ordersByGroup) {
    const size = group.split(' ')[1]!.length - 2;
    if (orders.size !== factorial(size)) throw new Error(`かなが押す順序で変わる: ${group}（${orders.size}通り）`);
  }
  const table = Object.fromEntries((Object.keys(lines) as SeccaSectionName[]).map((name) => [name, lines[name].join('\n')])) as SeccaTable;
  return { table, skipped, counts };
}
