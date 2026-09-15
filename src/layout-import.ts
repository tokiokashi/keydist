import { QWERTY_LEGEND } from './geometry.ts';
import type { Sequence } from './layouts/types.ts';

export type ImportFormat = 'dvorakj' | 'vial' | 'benizara';

export interface ImportedLayout {
  name: string;
  /** 物理キー位置に対応する基底面の表示。空白は機能キーまたは未定義。 */
  rows: [string, string, string, string];
  /** keyId → 元ファイルの表示ラベル */
  legends: [string, string][];
  /** かな・コンボを含む出力 → 物理キーの打鍵列 */
  sequences: [string, Sequence][];
  /** true の時は評価テキストをかなのまま打つ */
  direct: boolean;
}

const WIDTHS = QWERTY_LEGEND.map((row) => [...row].length);
const LATIN = /[A-Za-z]/;
const KANA = /[\u3040-\u30ff]/u;

/** 拡張子ごとの標準的な文字コードを優先しつつ、公開されている配布物の揺れも受け入れる。 */
export function decodeLayoutFile(bytes: ArrayBuffer | Uint8Array, format: ImportFormat): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const encodings: string[] = [];
  if (format === 'vial') {
    encodings.push('utf-8');
  } else if (format === 'dvorakj') {
    encodings.push('utf-8', 'shift_jis', 'utf-16le');
  } else {
    const hasUtf16LeBom = data.length >= 2 && data[0] === 0xff && data[1] === 0xfe;
    const hasUtf16LeNul = data.some((byte, i) => i % 2 === 1 && byte === 0);
    if (hasUtf16LeBom || hasUtf16LeNul) encodings.push('utf-16le');
    encodings.push('utf-8', 'shift_jis');
  }

  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(data);
    } catch {
      // 次の候補へ進む。最後の候補で内容のエラーを報告する。
    }
  }
  throw new Error('定義ファイルの文字コードを判定できない');
}

export function formatForFileName(fileName: string): ImportFormat | undefined {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (extension === '.txt') return 'dvorakj';
  if (extension === '.vil') return 'vial';
  if (extension === '.bnz' || extension === '.ini') return 'benizara';
  return undefined;
}

function emptyRows(): string[][] {
  return WIDTHS.map((width) => Array.from({ length: width }, () => ' '));
}

function normalise(value: string): string {
  return value.normalize('NFKC');
}

function hasPrintableOutput(value: string): boolean {
  return value !== '' && value !== '@@@' && value !== '無';
}

function classifyOutput(value: string, kinds: { kana: boolean; latin: boolean }) {
  if (KANA.test(value)) kinds.kana = true;
  if (LATIN.test(value)) kinds.latin = true;
}

function finish(
  name: string,
  rows: string[][],
  legends: Map<string, string>,
  sequences: Map<string, Sequence>,
  kinds: { kana: boolean; latin: boolean },
): ImportedLayout {
  if (kinds.kana && kinds.latin) {
    throw new Error('かなを直接出力する面とローマ字を出力する面が混在している');
  }
  if (sequences.size === 0) throw new Error('配列表から出力を見つけられない');
  return {
    name,
    rows: rows.map((row) => row.join('')) as [string, string, string, string],
    legends: [...legends],
    sequences: [...sequences],
    direct: kinds.kana,
  };
}

function recordCell(
  rows: string[][],
  legends: Map<string, string>,
  sequences: Map<string, Sequence>,
  kinds: { kana: boolean; latin: boolean },
  row: number,
  column: number,
  output: string | undefined,
  label: string,
  sequence: Sequence,
  showBase: boolean,
) {
  const physical = QWERTY_LEGEND[row]?.[column];
  if (physical === undefined || !label) return;
  if (showBase && !legends.has(physical)) legends.set(physical, label);
  if (!output || !hasPrintableOutput(output)) return;
  const value = normalise(output);
  if (!value) return;
  classifyOutput(value, kinds);
  if (showBase && [...value].length === 1) rows[row][column] = value;
  if (!sequences.has(value)) sequences.set(value, sequence);
}

const DvorakJ_FUNCTIONS = new Set([
  'BS', 'BSPC', 'BACKSPACE', 'ENTER', 'ESC', 'ESCAPE', 'TAB', 'SPACE',
  'DEL', 'DELETE', 'HOME', 'END', 'PGUP', 'PGDN', 'PAGEUP', 'PAGEDOWN',
  'INSERT', 'UP', 'DOWN', 'LEFT', 'RIGHT', '↑', '↓', '←', '→', '無',
]);

function isDvorakJFunction(token: string): boolean {
  const value = normalise(token).trim();
  return DvorakJ_FUNCTIONS.has(value.toUpperCase()) || /^[Ff]\d{1,2}$/.test(value);
}

function hasDvorakJFunctionLabel(label: string): boolean {
  return [...label.matchAll(/\{([^}]*)\}/g)].some((match) => isDvorakJFunction(match[1] ?? ''));
}

/** DvorakJ の機能キー表記から、機能キーを除いた出力を取り出す。 */
function dvorakJCell(raw: string): { output?: string; label: string } | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '@@@') return undefined;
  const label = trimmed.replace(/^\+/, '');
  let output = '';
  let cursor = 0;
  const tokenPattern = /\{([^}]*)\}/g;
  for (const match of trimmed.matchAll(tokenPattern)) {
    output += trimmed.slice(cursor, match.index).replace(/^\+/, '');
    const token = match[1] ?? '';
    if (!isDvorakJFunction(token)) output += token;
    cursor = (match.index ?? 0) + match[0].length;
  }
  output += trimmed.slice(cursor).replace(/^\+/, '');
  return { output: normalise(output.trim()), label };
}

function dvorakJCells(line: string): string[] {
  return line.split('|').map((cell) => cell.trim());
}

const SCAN_CODE_ROWS = [
  { start: 0x10, row: 1 },
  { start: 0x1e, row: 2 },
  { start: 0x2c, row: 3 },
] as const;

function dvorakJScanCode(code: string): string | undefined {
  const numeric = Number.parseInt(code, 16);
  if (!Number.isFinite(numeric)) return undefined;
  for (const { start, row } of SCAN_CODE_ROWS) {
    const column = numeric - start;
    if (column >= 0 && column < WIDTHS[row]) return QWERTY_LEGEND[row][column];
  }
  return undefined;
}

function dvorakJAliases(lines: string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const line of lines) {
    const match = line.trim().match(/^\{([^}]+)\}\s*\|\s*[+-]([0-9a-f]{2}|shift)\s*$/i);
    if (!match) continue;
    const key = match[1];
    const code = match[2].toLowerCase();
    // DvorakJ の S はこの形式のセンターシフトを表す。物理キーは配列の出典どおり space に固定する。
    const physical = code === 'shift' && key.toUpperCase() === 'S'
      ? 'space'
      : dvorakJScanCode(code);
    if (physical) aliases.set(key, physical);
  }
  return aliases;
}

function resolveDvorakJTrigger(token: string, aliases: Map<string, string>): string | undefined {
  const normalized = normalise(token);
  return aliases.get(token) ?? aliases.get(normalized) ??
    (normalized.length === 1 && (QWERTY_LEGEND.join('').includes(normalized) || normalized === ' ')
      ? (normalized === ' ' ? 'space' : normalized.toLowerCase())
      : undefined);
}

function dvorakJHeader(
  header: string,
  aliases: Map<string, string>,
): string[] | undefined {
  if (header === '[') return [];

  const parenthesised = header.match(/^\((.*)\[\s*$/);
  if (parenthesised) {
    if (parenthesised[1].replace(/\{[^}]+\}/g, '').trim()) return undefined;
    const tokens = [...parenthesised[1].matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const triggers = tokens.map((token) => resolveDvorakJTrigger(token, aliases));
    return tokens.length > 0 && triggers.every((trigger): trigger is string => trigger !== undefined)
      ? triggers
      : undefined;
  }

  // 一部の DvorakJ 配布物は -f-j を、次行の [ と組み合わせて使う。
  if (/^-(?:[^-]+-?)+$/.test(header)) {
    const triggers = header.split('-').filter(Boolean).map((token) => resolveDvorakJTrigger(token, aliases));
    return triggers.length > 0 && triggers.every((trigger): trigger is string => trigger !== undefined)
      ? triggers
      : undefined;
  }
  return undefined;
}

/** DvorakJ の配列表ブロックだけを読む。コメント・option-input の設定・ファイル名は判定材料にしない。 */
export function importDvorakJ(source: string, name = 'DvorakJ 取り込み'): ImportedLayout {
  const text = source.replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = text.split(/\r?\n/);
  const aliases = dvorakJAliases(lines);
  const rows = emptyRows();
  const legends = new Map<string, string>();
  const sequences = new Map<string, Sequence>();
  const kinds = { kana: false, latin: false };

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].trim();
    if (!header || header.startsWith('-option-input')) continue;
    let triggers = dvorakJHeader(header, aliases);
    let bodyStart = i;
    if (/^-(?:[^-]+-?)+$/.test(header) && lines[i + 1]?.trim() === '[') {
      bodyStart = i + 1;
    }
    const openingBracketIsOnHeader = header.endsWith('[');
    if (!triggers || (!openingBracketIsOnHeader && lines[bodyStart]?.trim() !== '[')) continue;

    const body: string[] = [];
    let end = bodyStart;
    while (++end < lines.length && lines[end].trim() !== ']') body.push(lines[end]);
    i = end;
    const grid = body.filter((line) => line.includes('|')).map(dvorakJCells).slice(0, 4);
    if (grid.length === 0) continue;
    const base = triggers.length === 0;
    grid.forEach((line, row) => line.slice(0, WIDTHS[row] ?? 0).forEach((raw, column) => {
      const cell = dvorakJCell(raw);
      if (!cell) return;
      const sequence: Sequence = [triggers!.concat(QWERTY_LEGEND[row][column])];
      recordCell(rows, legends, sequences, kinds, row, column, cell.output, cell.label, sequence, base);
      if (!base && hasDvorakJFunctionLabel(cell.label)) {
        legends.set(QWERTY_LEGEND[row][column], cell.label);
      }
    }));
  }
  return finish(name, rows, legends, sequences, kinds);
}

const QMK_PRINTABLE: Record<string, string> = {
  KC_COMM: ',', KC_COMMA: ',', KC_DOT: '.', KC_SLSH: '/', KC_SLASH: '/',
  KC_SCLN: ';', KC_SCOLON: ';', KC_QUOT: "'", KC_QUOTE: "'",
  KC_MINS: '-', KC_MINUS: '-', KC_EQL: '=', KC_EQUAL: '=',
  KC_LBRC: '[', KC_LBRACKET: '[', KC_RBRC: ']', KC_RBRACKET: ']',
  KC_BSLS: '\\', KC_BSLASH: '\\', KC_GRV: String.fromCharCode(96), KC_GRAVE: String.fromCharCode(96),
  KC_SPC: ' ', KC_SPACE: ' ',
};

const QMK_NOOP = new Set(['KC_NO', 'KC_TRNS', 'KC_TRANSPARENT', '-1']);

function qmkChar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.toUpperCase();
  if (QMK_NOOP.has(code)) return undefined;
  if (/^KC_[A-Z]$/.test(code)) return code.at(-1)!.toLowerCase();
  if (/^KC_[0-9]$/.test(code)) return code.at(-1)!;
  if (Object.prototype.hasOwnProperty.call(QMK_PRINTABLE, code)) return QMK_PRINTABLE[code];

  // Home-row mod や layer-tap は、タップ側が単純な文字ならその文字を表示・逆引きする。
  const inner = code.match(/\((?:[^,()]+,\s*)?(KC_[A-Z0-9_]+)\)$/)?.[1];
  return inner ? qmkChar(inner) : undefined;
}

function qmkLabel(value: unknown): string | undefined {
  if (typeof value === 'number' || value === null || value === undefined) return undefined;
  if (typeof value !== 'string' || QMK_NOOP.has(value.toUpperCase())) return undefined;
  const code = value.toUpperCase();
  const simple = /^KC_[A-Z0-9]$/.test(code) || Object.prototype.hasOwnProperty.call(QMK_PRINTABLE, code);
  return simple ? qmkChar(value) ?? value : value;
}

function macroText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  let text = '';
  for (const action of value) {
    if (typeof action === 'string') {
      text += action;
      continue;
    }
    if (!Array.isArray(action) || action.length === 0) return undefined;
    const kind = action[0];
    if (kind === 'delay') continue;
    if (kind === 'text' && typeof action[1] === 'string') {
      text += action[1];
      continue;
    }
    if (kind === 'tap') {
      const codes = Array.isArray(action[1]) ? action[1] : action.slice(1);
      for (const code of codes) {
        const char = qmkChar(code);
        if (!char) return undefined;
        text += char;
      }
      continue;
    }
    return undefined;
  }
  return text || undefined;
}

function macroIndex(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(?:M|MACRO_|QK_MACRO_)(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}

/** Vial の保存 JSON から第0層の文字配置と、解決できるコンボを読む。 */
export function importVial(source: string, name = 'Vial 取り込み'): ImportedLayout {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error('Vial ファイルが JSON ではない');
  }
  if (!data || typeof data !== 'object') throw new Error('Vial ファイルの内容が不正');
  const vil = data as { layout?: unknown; combo?: unknown; macro?: unknown };
  if (!Array.isArray(vil.layout) || !Array.isArray(vil.layout[0])) {
    throw new Error('Vial ファイルに第0層の layout がない');
  }
  const layer = vil.layout[0] as unknown[];
  const rows = emptyRows();
  const legends = new Map<string, string>();
  const sequences = new Map<string, Sequence>();
  const locations = new Map<string, string>();
  const kinds = { kana: false, latin: false };

  layer.slice(0, 4).forEach((rawRow, row) => {
    if (!Array.isArray(rawRow)) return;
    rawRow.slice(0, WIDTHS[row] ?? 0).forEach((raw, column) => {
      const physical = QWERTY_LEGEND[row][column];
      const output = qmkChar(raw);
      const label = qmkLabel(raw);
      if (label) legends.set(physical, label);
      if (!output || output === ' ') return;
      const value = normalise(output);
      classifyOutput(value, kinds);
      if ([...value].length === 1) rows[row][column] = value;
      if (!sequences.has(value)) sequences.set(value, [[physical]]);
      if (!locations.has(value)) locations.set(value, physical);
    });
  });

  const macros = Array.isArray(vil.macro) ? vil.macro : [];
  if (Array.isArray(vil.combo)) {
    for (const entry of vil.combo) {
      if (!Array.isArray(entry) || entry.length < 5) continue;
      const inputs: string[] = [];
      for (const code of entry.slice(0, 4)) {
        const char = qmkChar(code);
        if (!char) continue;
        const physical = locations.get(char);
        if (!physical) {
          inputs.length = 0;
          break;
        }
        inputs.push(physical);
      }
      if (inputs.length < 2) continue;
      const outputCode = entry[4];
      const index = macroIndex(outputCode);
      const output = index === undefined ? qmkChar(outputCode) : macroText(macros[index]);
      if (!output || output === ' ') continue;
      // コンボの出力が通常キーと同じでも、コンボの打鍵列を優先する。
      sequences.set(output, [inputs]);
    }
  }
  return finish(name, rows, legends, sequences, kinds);
}

const BENIZARA_FUNCTIONS = new Set([
  'BS', 'BSPC', 'BACKSPACE', 'ENTER', 'ESC', 'ESCAPE', 'TAB', 'SPACE',
  'DEL', 'DELETE', 'HOME', 'END', 'PGUP', 'PGDN', 'INSERT',
  'UP', 'DOWN', 'LEFT', 'RIGHT', '無',
]);

function benizaraCell(raw: string): { output?: string; label: string } | undefined {
  const trimmed = normalise(raw.trim());
  if (!trimmed) return undefined;
  const label = trimmed.replace(/^\+/, '');
  let output = trimmed.replace(/^\+/, '');
  output = output.replace(/\{([^}]*)\}/g, (_, token: string) =>
    BENIZARA_FUNCTIONS.has(token.toUpperCase()) ? '' : token);
  if (BENIZARA_FUNCTIONS.has(output.toUpperCase()) || output === '無') output = '';
  return { output: output.trim(), label };
}

function hasBenizaraFunctionLabel(label: string): boolean {
  const value = normalise(label).trim().replace(/^\+/, '');
  return BENIZARA_FUNCTIONS.has(value.toUpperCase()) ||
    [...value.matchAll(/\{([^}]*)\}/g)].some((match) =>
      BENIZARA_FUNCTIONS.has(normalise(match[1] ?? '').trim().toUpperCase()));
}

function benizaraTrigger(section: string): string[] | undefined {
  if (section.includes('シフト無し')) return [];
  if (section.includes('右親指') || section.includes('スペース')) return ['space'];
  if (section.includes('左親指')) return ['thumb-l'];
  // 小指シフトは定義ファイルごとに物理キーが違うため、誤った指を仮定しない。
  return undefined;
}

/** 紅皿の CSV セクションからローマ字面またはかな面を読む。 */
export function importBenizara(source: string, name = '紅皿取り込み'): ImportedLayout {
  const sections = new Map<string, string[]>();
  let current: string | undefined;
  for (const raw of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      current = normalise(header[1]);
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(raw);
  }

  const candidates = [...sections.keys()].filter((section) =>
    section.startsWith('ローマ字') || section.startsWith('英数'));
  const base = candidates.find((section) => section.includes('シフト無し'));
  if (!base) throw new Error('紅皿の基底面（シフト無し）を見つけられない');
  const prefix = base.startsWith('ローマ字') ? 'ローマ字' : '英数';
  const family = candidates.filter((section) => section.startsWith(prefix));

  const rows = emptyRows();
  const legends = new Map<string, string>();
  const sequences = new Map<string, Sequence>();
  const kinds = { kana: false, latin: false };
  for (const section of [base, ...family.filter((candidate) => candidate !== base)]) {
    const trigger = benizaraTrigger(section);
    if (!trigger) continue;
    const grid = sections.get(section)!
      .map((line) => normalise(line).split(',').map((cell) => cell.trim()))
      .slice(0, 4);
    const isBase = section === base;
    grid.forEach((line, row) => line.slice(0, WIDTHS[row] ?? 0).forEach((raw, column) => {
      const cell = benizaraCell(raw);
      if (!cell) return;
      const physical = QWERTY_LEGEND[row][column];
      const sequence: Sequence = [trigger.concat(physical)];
      recordCell(rows, legends, sequences, kinds, row, column, cell.output, cell.label, sequence, isBase);
      if (!isBase && hasBenizaraFunctionLabel(cell.label)) legends.set(physical, cell.label);
    }));
  }
  return finish(name, rows, legends, sequences, kinds);
}
