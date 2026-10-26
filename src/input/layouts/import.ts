import { QWERTY_LEGEND } from '../shapes/geometry.ts';
import { buildKanaContent, NO_OUTPUT_MESSAGE, printableOutput, type ParsedCell, type ParsedFace } from './import-faces.ts';
import type { KanaLayoutContent } from './kana-face-layout-file.ts';
import type { Sequence } from './types.ts';

export type ImportFormat = 'dvorakj' | 'vial' | 'benizara';

/** 段の形で受ける取り込み結果（かなを含まない定義）。 */
export interface ImportedLayout {
  name: string;
  /** 物理キー位置に対応する基底面の表示。空白は機能キーまたは未定義。 */
  rows: [string, string, string, string];
  /** keyId → 元ファイルの表示ラベル */
  legends: [string, string][];
  /** かな・コンボを含む出力 → 物理キーの打鍵列 */
  sequences: [string, Sequence][];
  /** 読み飛ばしたセクションなど、取り込み結果に影響する注意事項 */
  warnings: string[];
}

/** かなを直接打つ定義は面の形で、それ以外は段の形で返す。 */
export type ImportedDefinition = { kind: 'kana'; content: KanaLayoutContent; warnings: string[] } | { kind: 'stage'; layout: ImportedLayout };

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
  throw new Error('定義ファイルの文字コードを判定できませんでした');
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
  warnings: string[] = [],
): ImportedLayout {
  if (kinds.kana && kinds.latin) {
    throw new Error(MIXED_KINDS_MESSAGE);
  }
  if (sequences.size === 0) throw new Error(NO_OUTPUT_MESSAGE);
  return {
    name,
    rows: rows.map((row) => row.join('')) as [string, string, string, string],
    legends: [...legends],
    sequences: [...sequences],
    warnings,
  };
}

const MIXED_KINDS_MESSAGE = 'かなを出力する面とローマ字を出力する面が混在しているため、取り込めません';

/** 面ごとの読み取り結果を、かなを含む定義なら面の形に、そうでなければ段の形にする。 */
function resolveFaces(name: string, faces: ParsedFace[], warnings: string[]): ImportedDefinition {
  const kinds = { kana: false, latin: false };
  for (const face of faces) {
    for (const cell of face.cells) {
      const output = printableOutput(cell.output);
      if (output !== undefined) classifyOutput(output, kinds);
    }
  }
  if (kinds.kana && kinds.latin) throw new Error(MIXED_KINDS_MESSAGE);
  if (kinds.kana) return { kind: 'kana', content: buildKanaContent(faces, name, warnings), warnings };

  const rows = emptyRows();
  const legends = new Map<string, string>();
  const sequences = new Map<string, Sequence>();
  for (const face of faces) {
    const base = face.trigger.length === 0;
    for (const cell of face.cells) {
      const physical = QWERTY_LEGEND[cell.row][cell.column];
      const sequence: Sequence = [face.trigger.concat(physical)];
      recordCell(rows, legends, sequences, kinds, cell.row, cell.column, cell.output, cell.label, sequence, base);
      if (!base && face.isFunctionLabel(cell.label)) legends.set(physical, cell.label);
    }
  }
  return { kind: 'stage', layout: finish(name, rows, legends, sequences, kinds, warnings) };
}

function addWarning(warnings: string[], message: string) {
  if (!warnings.includes(message)) warnings.push(message);
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
  const printable = printableOutput(output);
  if (printable === undefined) return;
  const value = normalise(printable);
  if (!value) return;
  classifyOutput(value, kinds);
  if (showBase && [...value].length === 1) rows[row][column] = value;
  if (!sequences.has(value)) sequences.set(value, sequence);
}

const DvorakJ_FUNCTIONS = new Set([
  'BS',
  'BSPC',
  'BACKSPACE',
  'ENTER',
  'ESC',
  'ESCAPE',
  'TAB',
  'SPACE',
  'DEL',
  'DELETE',
  'HOME',
  'END',
  'PGUP',
  'PGDN',
  'PAGEUP',
  'PAGEDOWN',
  'INSERT',
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  '↑',
  '↓',
  '←',
  '→',
  '無',
]);

function isDvorakJFunction(token: string): boolean {
  const value = normalise(token).trim();
  return DvorakJ_FUNCTIONS.has(value.toUpperCase()) || /^[Ff]\d{1,2}$/.test(value);
}

function hasDvorakJFunctionLabel(label: string): boolean {
  return [...label.matchAll(/\{([^}]*)\}/g)].some((match) => isDvorakJFunction(match[1] ?? ''));
}

/** DvorakJの機能キー表記から、機能キーを除いた出力を取り出す。 */
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

function dvorakJAliases(lines: string[], warnings: string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const line of lines) {
    const match = line.trim().match(/^\{([^}]+)\}\s*\|\s*[+-]([0-9a-f]{2}|shift)\s*$/i);
    if (!match) continue;
    const key = match[1];
    const code = match[2].toLowerCase();
    // DvorakJのSはこの形式のセンターシフトを表す。旧idのspaceを返し、評価入口でthumb-rに解決する。
    const physical = code === 'shift' && key.toUpperCase() === 'S' ? 'space' : dvorakJScanCode(code);
    if (physical) aliases.set(key, physical);
    else addWarning(warnings, `DvorakJのエイリアス「${key}」の物理キーを解決できないため無視しました`);
  }
  return aliases;
}

function resolveDvorakJTrigger(token: string, aliases: Map<string, string>): string | undefined {
  const normalized = normalise(token);
  return (
    aliases.get(token) ??
    aliases.get(normalized) ??
    (normalized.length === 1 && (QWERTY_LEGEND.join('').includes(normalized) || normalized === ' ')
      ? normalized === ' '
        ? 'space'
        : normalized.toLowerCase()
      : undefined)
  );
}

function dvorakJHeader(header: string, aliases: Map<string, string>): string[] | undefined {
  if (header === '[') return [];

  const parenthesised = header.match(/^\((.*)\[\s*$/);
  if (parenthesised) {
    if (parenthesised[1].replace(/\{[^}]+\}/g, '').trim()) return undefined;
    const tokens = [...parenthesised[1].matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const triggers = tokens.map((token) => resolveDvorakJTrigger(token, aliases));
    return tokens.length > 0 && triggers.every((trigger): trigger is string => trigger !== undefined) ? triggers : undefined;
  }

  // 一部のDvorakJ配布物は -f-jを、次行の [ と組み合わせて使う。
  if (isDashSeparatedHeader(header)) {
    const triggers = header
      .split('-')
      .filter(Boolean)
      .map((token) => resolveDvorakJTrigger(token, aliases));
    return triggers.length > 0 && triggers.every((trigger): trigger is string => trigger !== undefined) ? triggers : undefined;
  }
  return undefined;
}

/**
 * `-f-j` のように、先頭が `-` で、`-` 以外の並びを `-` で区切った見出しか。
 * 連続する `-` は許さず、末尾の `-` は1つまで許す。
 * 利用者のファイルが通る経路なので、バックトラックが入力の長さに対して線形で済む形で書く。
 */
export function isDashSeparatedHeader(header: string): boolean {
  return /^-[^-]+(?:-[^-]+)*-?$/.test(header);
}

/** DvorakJの配列表ブロックだけを読む。コメント・option-inputの設定・ファイル名は判定材料にしない。 */
export function importDvorakJ(source: string, name = 'DvorakJ取り込み'): ImportedDefinition {
  const text = source.replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  const aliases = dvorakJAliases(lines, warnings);
  const faces: ParsedFace[] = [];

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].trim();
    if (!header || header.startsWith('-option-input')) continue;
    const triggers = dvorakJHeader(header, aliases);
    let bodyStart = i;
    if (isDashSeparatedHeader(header) && lines[i + 1]?.trim() === '[') {
      bodyStart = i + 1;
    }
    const openingBracketIsOnHeader = header.endsWith('[');
    if (!triggers || (!openingBracketIsOnHeader && lines[bodyStart]?.trim() !== '[')) {
      if (header !== '-option-input[' && (header.endsWith('[') || (isDashSeparatedHeader(header) && lines[i + 1]?.trim() === '['))) {
        addWarning(warnings, `DvorakJの面ヘッダ「${header}」を解釈できないため無視しました`);
      }
      continue;
    }

    const body: string[] = [];
    let end = bodyStart;
    while (++end < lines.length && lines[end].trim() !== ']') body.push(lines[end]);
    i = end;
    const grid = body
      .filter((line) => line.includes('|'))
      .map(dvorakJCells)
      .slice(0, 4);
    if (grid.length === 0) {
      addWarning(warnings, `DvorakJの面「${header}」にセルがないため無視しました`);
      continue;
    }
    const cells: ParsedCell[] = [];
    for (const [row, line] of grid.entries()) {
      for (const [column, raw] of line.slice(0, WIDTHS[row] ?? 0).entries()) {
        const cell = dvorakJCell(raw);
        if (cell) cells.push({ row, column, output: cell.output, label: cell.label });
      }
    }
    faces.push({ heading: header, trigger: triggers, cells, isFunctionLabel: hasDvorakJFunctionLabel });
  }
  return resolveFaces(name, faces, warnings);
}

const QMK_PRINTABLE: Record<string, string> = {
  KC_COMM: ',',
  KC_COMMA: ',',
  KC_DOT: '.',
  KC_SLSH: '/',
  KC_SLASH: '/',
  KC_SCLN: ';',
  KC_SCOLON: ';',
  KC_QUOT: "'",
  KC_QUOTE: "'",
  KC_MINS: '-',
  KC_MINUS: '-',
  KC_EQL: '=',
  KC_EQUAL: '=',
  KC_LBRC: '[',
  KC_LBRACKET: '[',
  KC_RBRC: ']',
  KC_RBRACKET: ']',
  KC_BSLS: '\\',
  KC_BSLASH: '\\',
  KC_GRV: String.fromCharCode(96),
  KC_GRAVE: String.fromCharCode(96),
  KC_SPC: ' ',
  KC_SPACE: ' ',
};

const QMK_NOOP = new Set(['KC_NO', 'KC_TRNS', 'KC_TRANSPARENT', '-1']);

function qmkChar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.toUpperCase();
  if (QMK_NOOP.has(code)) return undefined;
  if (/^KC_[A-Z]$/.test(code)) return code.at(-1)!.toLowerCase();
  if (/^KC_[0-9]$/.test(code)) return code.at(-1)!;
  if (Object.hasOwn(QMK_PRINTABLE, code)) return QMK_PRINTABLE[code];

  // Home-row modやlayer-tapは、タップ側が単純な文字ならその文字を表示・逆引きする。
  const inner = code.match(/\((?:[^,()]+,\s*)?(KC_[A-Z0-9_]+)\)$/)?.[1];
  return inner ? qmkChar(inner) : undefined;
}

function qmkLabel(value: unknown): string | undefined {
  if (typeof value === 'number' || value === null || value === undefined) return undefined;
  if (typeof value !== 'string' || QMK_NOOP.has(value.toUpperCase())) return undefined;
  const code = value.toUpperCase();
  const simple = /^KC_[A-Z0-9]$/.test(code) || Object.hasOwn(QMK_PRINTABLE, code);
  return simple ? (qmkChar(value) ?? value) : value;
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

/** Vialの保存JSONから第0層の文字配置と、解決できるコンボを読む。 */
export function importVial(source: string, name = 'Vial取り込み'): ImportedLayout {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error('VialファイルがJSONではない');
  }
  if (!data || typeof data !== 'object') throw new Error('Vialファイルの内容が不正');
  const vil = data as { layout?: unknown; combo?: unknown; macro?: unknown };
  if (!Array.isArray(vil.layout) || !Array.isArray(vil.layout[0])) {
    throw new Error('Vialファイルに第0層のlayoutがない');
  }
  const layer = vil.layout[0] as unknown[];
  const rows = emptyRows();
  const legends = new Map<string, string>();
  const sequences = new Map<string, Sequence>();
  const locations = new Map<string, string>();
  const kinds = { kana: false, latin: false };
  const warnings: string[] = [];

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
    for (const [comboIndex, entry] of vil.combo.entries()) {
      if (!Array.isArray(entry) || entry.length < 5) continue;
      const inputs: string[] = [];
      for (const code of entry.slice(0, 4)) {
        const char = qmkChar(code);
        if (!char) continue;
        const physical = locations.get(char);
        if (!physical) {
          addWarning(warnings, `Vialのコンボ ${comboIndex} は入力キー「${String(code)}」の物理位置を解決できないため無視しました`);
          inputs.length = 0;
          break;
        }
        inputs.push(physical);
      }
      if (inputs.length < 2) {
        const unresolvedCode = entry.slice(0, 4).find((code) => typeof code === 'string' && !QMK_NOOP.has(code.toUpperCase()) && !qmkChar(code));
        if (unresolvedCode !== undefined) {
          addWarning(warnings, `Vialのコンボ ${comboIndex} は入力キー「${String(unresolvedCode)}」を解決できないため無視しました`);
        }
        continue;
      }
      const outputCode = entry[4];
      const macro = macroIndex(outputCode);
      const output = macro === undefined ? qmkChar(outputCode) : macroText(macros[macro]);
      if (!output || output === ' ') {
        addWarning(warnings, `Vialのコンボ ${comboIndex} は出力「${String(outputCode)}」を解決できないため無視しました`);
        continue;
      }
      // コンボの出力が通常キーと同じでも、コンボの打鍵列を優先する。
      sequences.set(output, [inputs]);
    }
  }
  return finish(name, rows, legends, sequences, kinds, warnings);
}

const BENIZARA_FUNCTIONS = new Set([
  'BS',
  'BSPC',
  'BACKSPACE',
  'ENTER',
  'ESC',
  'ESCAPE',
  'TAB',
  'SPACE',
  'DEL',
  'DELETE',
  'HOME',
  'END',
  'PGUP',
  'PGDN',
  'INSERT',
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  '無',
]);

function benizaraCell(raw: string): { output?: string; label: string } | undefined {
  const trimmed = normalise(raw.trim());
  if (!trimmed) return undefined;
  const label = trimmed.replace(/^\+/, '');
  let output = trimmed.replace(/^\+/, '');
  output = output.replace(/\{([^}]*)\}/g, (_, token: string) => (BENIZARA_FUNCTIONS.has(token.toUpperCase()) ? '' : token));
  if (BENIZARA_FUNCTIONS.has(output.toUpperCase()) || output === '無') output = '';
  return { output: output.trim(), label };
}

function hasBenizaraFunctionLabel(label: string): boolean {
  const value = normalise(label).trim().replace(/^\+/, '');
  return (
    BENIZARA_FUNCTIONS.has(value.toUpperCase()) ||
    [...value.matchAll(/\{([^}]*)\}/g)].some((match) =>
      BENIZARA_FUNCTIONS.has(
        normalise(match[1] ?? '')
          .trim()
          .toUpperCase(),
      ),
    )
  );
}

function benizaraTrigger(section: string): string[] | undefined {
  if (section.includes('シフト無し')) return [];
  if (section.includes('左右親指') || section.includes('両親指') || (section.includes('左親指') && section.includes('右親指'))) {
    return ['thumb-l', 'space'];
  }
  if (section.includes('右親指') || section.includes('スペース')) return ['space'];
  if (section.includes('左親指')) return ['thumb-l'];
  // 小指シフトは定義ファイルごとに物理キーが違うため、誤った指を仮定しない。
  return undefined;
}

/** 紅皿のCSVセクションからローマ字面またはかな面を読む。 */
export function importBenizara(source: string, name = '紅皿取り込み'): ImportedDefinition {
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

  const candidates = [...sections.keys()].filter((section) => section.startsWith('ローマ字') || section.startsWith('英数') || section.startsWith('かな'));
  const base = candidates.find((section) => section.includes('シフト無し'));
  if (!base) throw new Error('紅皿の基底面（シフト無し）を見つけられませんでした');
  const prefix = base.startsWith('ローマ字') ? 'ローマ字' : base.startsWith('英数') ? '英数' : 'かな';
  const family = candidates.filter((section) => section.startsWith(prefix));

  const faces: ParsedFace[] = [];
  const warnings: string[] = [];
  for (const section of candidates) {
    if (!family.includes(section)) {
      addWarning(warnings, `面「${section}」は選択した出力形式「${prefix}」と異なるため無視しました`);
    }
  }
  for (const section of [base, ...family.filter((candidate) => candidate !== base)]) {
    const trigger = benizaraTrigger(section);
    if (!trigger) {
      addWarning(warnings, `面「${section}」は対応する親指キーを決められないため無視しました`);
      continue;
    }
    const grid = sections
      .get(section)!
      .map((line) =>
        normalise(line)
          .split(',')
          .map((cell) => cell.trim()),
      )
      .slice(0, 4);
    const cells: ParsedCell[] = [];
    for (const [row, line] of grid.entries()) {
      for (const [column, raw] of line.slice(0, WIDTHS[row] ?? 0).entries()) {
        const cell = benizaraCell(raw);
        if (cell) cells.push({ row, column, output: cell.output, label: cell.label });
      }
    }
    faces.push({ heading: section, trigger, cells, isFunctionLabel: hasBenizaraFunctionLabel });
  }
  return resolveFaces(name, faces, warnings);
}

/** かな配列の画面で定義ファイルを取り込んだ結果。取り込めない時は利用者向けの理由を返す。 */
export type KanaFileImportResult =
  | { readonly ok: true; readonly content: KanaLayoutContent; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly message: string };

/**
 * ファイル名と中身から、かなを直接打つ配列の面の形を作る。
 * 形式が分からないファイル、Vial、かなを含まない定義は取り込まない。
 */
export function importKanaLayoutFile(fileName: string, bytes: ArrayBuffer | Uint8Array): KanaFileImportResult {
  const format = formatForFileName(fileName);
  if (format === undefined) {
    return { ok: false, message: '取り込める形式ではありません。DvorakJ（.txt）と紅皿（.bnz・.ini）の定義ファイルに対応しています' };
  }
  if (format === 'vial') return { ok: false, message: 'Vialの定義ファイル（.vil）は、かな配列として取り込めません' };
  const name = fileName.replace(/\.[^.]+$/, '').trim() || 'かな配列';
  try {
    const source = decodeLayoutFile(bytes, format);
    const result = format === 'dvorakj' ? importDvorakJ(source, name) : importBenizara(source, name);
    if (result.kind === 'stage') return { ok: false, message: 'かな配列ではない定義のため、取り込めません' };
    return { ok: true, content: result.content, warnings: result.warnings };
  } catch (error) {
    return { ok: false, message: `取り込めませんでした。${error instanceof Error ? error.message : String(error)}` };
  }
}
