import { QWERTY_LEGEND } from '../shapes/geometry.ts';
import { readDvorakJHeading, isSequentialDeclaration, parseSubstitution, type HeadingSubstitution } from './dvorakj-heading.ts';
import { buildKanaContent, faceSequence, NO_OUTPUT_MESSAGE, printableOutput, type ParsedCell, type ParsedFace } from './import-faces.ts';
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
/**
 * かなの文字。ひらがな・カタカナの字と繰り返し記号だけを数える。
 * 中黒（U+30FB）・長音（U+30FC）・濁点と半濁点の記号は、ローマ字を出す定義にも置かれるので数えない。
 * かなを出す定義は、これらの記号のほかにかなの字も必ず出す。
 */
const KANA = /[\u3041-\u3096\u309d\u309e\u30a1-\u30fa\u30fd\u30fe]/u;

/** 出力にかなの文字が含まれるか。 */
export const hasKanaLetter = (value: string): boolean => KANA.test(value);

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
  if (hasKanaLetter(value)) kinds.kana = true;
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
function resolveFaces(name: string, allFaces: ParsedFace[], warnings: string[]): ImportedDefinition {
  const faceKinds = (face: ParsedFace) => {
    const found = { kana: false, latin: false };
    for (const cell of face.cells) {
      const output = printableOutput(cell.output);
      if (output !== undefined) classifyOutput(output, found);
    }
    return found;
  };
  // 定義の出力の種類（かな・ローマ字）は、切り替えのキーの無い面（基底面）で決める。基底面に両方の種類があれば取り込まない。
  // 切り替えのキーを持つ面が基底面と違う種類の出力を持つ時は、その面だけを取り込まず注意に入れる
  const base = { kana: false, latin: false };
  for (const face of allFaces) {
    if (face.trigger.length > 0) continue;
    const found = faceKinds(face);
    base.kana ||= found.kana;
    base.latin ||= found.latin;
  }
  if (base.kana && base.latin) throw new Error(MIXED_KINDS_MESSAGE);
  const faces: ParsedFace[] = [];
  for (const face of allFaces) {
    const found = faceKinds(face);
    const differs = (base.kana && found.latin) || (base.latin && found.kana);
    if (face.trigger.length > 0 && differs) {
      addWarning(warnings, `面「${face.heading}」は、基底面と出力の種類（かな・ローマ字）が違うため取り込みませんでした`);
      continue;
    }
    faces.push(face);
  }
  const kinds = { kana: false, latin: false };
  for (const face of faces) {
    const found = faceKinds(face);
    kinds.kana ||= found.kana;
    kinds.latin ||= found.latin;
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
      const sequence: Sequence = faceSequence(face, physical);
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

/** 機能キーの名前に回数が付いた形（`{Del 2}`）の、回数を除いた名前を取り出す。 */
const functionName = (token: string): string =>
  normalise(token)
    .trim()
    .replace(/\s+\d+$/, '');

function isDvorakJFunction(token: string): boolean {
  const value = functionName(token);
  return DvorakJ_FUNCTIONS.has(value.toUpperCase()) || /^[Ff]\d{1,2}$/.test(value);
}

function hasDvorakJFunctionLabel(label: string): boolean {
  return [...label.matchAll(/\{([^}]*)\}/g)].some((match) => isDvorakJFunction(match[1] ?? ''));
}

/**
 * セルがAutoHotkeyの送信の書式を含むか。キーの操作や修飾（`^i`、`+{End}`）、機能キー以外の名前（`{vkF2}`、`{改行}`）が該当する。
 * 1文字を括弧で囲んだ形（`{!}`、`{{}`）はその文字そのもので、機能キーの名前（`{Enter}`）は出力を持たないだけで書式として扱わない。
 */
function hasSendFormat(cell: string): boolean {
  let plain = '';
  let cursor = 0;
  for (const match of cell.matchAll(/\{([^}]*)\}/g)) {
    plain += `${cell.slice(cursor, match.index)}\u0000`;
    cursor = (match.index ?? 0) + match[0].length;
    const token = match[1] ?? '';
    if ([...token].length > 1 && !isDvorakJFunction(token)) return true;
  }
  plain += cell.slice(cursor);
  // 修飾（`^` `!` `#` `+`）は後ろに続くキーを修飾する。セルの末尾にあるものは、その文字そのもの
  return /[\^!#+](?=[\s\S])/.test(plain);
}

/** DvorakJの機能キー表記から、機能キーを除いた出力を取り出す。送信の書式を含むセルは出力を持たない。 */
function dvorakJCell(raw: string): { output?: string; label: string } | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '@@@') return undefined;
  const label = trimmed.replace(/^\+/, '');
  if (hasSendFormat(trimmed)) return { label };
  let output = '';
  let cursor = 0;
  const tokenPattern = /\{([^}]*)\}/g;
  for (const match of trimmed.matchAll(tokenPattern)) {
    output += trimmed.slice(cursor, match.index);
    const token = match[1] ?? '';
    if (!isDvorakJFunction(token)) output += token;
    cursor = (match.index ?? 0) + match[0].length;
  }
  output += trimmed.slice(cursor);
  return { output: normalise(output.trim()), label };
}

function dvorakJCells(line: string): string[] {
  return line.split('|').map((cell) => cell.trim());
}

/**
 * 表の見出しの行を、`[` の前の文字列と `[` の数に分ける。見出しは `[` と同じ行に書く。
 * 行末の数字（窓の名前）は読み飛ばす。正規表現を使わず、行の長さに対して線形で読む。
 */
function splitTableHeader(line: string): { header: string; brackets: number } | undefined {
  const text = line.trim();
  let digits = text.length;
  while (digits > 0 && text.charCodeAt(digits - 1) >= 48 && text.charCodeAt(digits - 1) <= 57) digits--;
  let start = digits;
  while (start > 0 && text[start - 1] === '[') start--;
  if (start === digits) return undefined;
  return { header: text.slice(0, start).trim(), brackets: digits - start };
}

/** DvorakJの配列表ブロックだけを読む。コメントやファイル名は判定材料にしない。 */
export function importDvorakJ(source: string, name = 'DvorakJ取り込み'): ImportedDefinition {
  const text = source.replace(/^﻿/, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  const sequential = isSequentialDeclaration(lines.find((line) => line.trim() !== '')?.trim() ?? '');
  const substitutions: HeadingSubstitution[] = [];
  const faces: ParsedFace[] = [];

  for (let i = 0; i < lines.length; i++) {
    const block = splitTableHeader(lines[i]);
    if (block === undefined) continue;
    const heading = lines[i].trim();
    const body: string[] = [];
    let end = i;
    while (++end < lines.length && lines[end].trim() !== ']') body.push(lines[end]);
    i = end;

    const { header, brackets } = block;
    if (header === '-option-input' || header === '-option') {
      for (const line of body) {
        const substitution = parseSubstitution(line);
        if (substitution) substitutions.push(substitution);
      }
      continue;
    }
    if (header === '-option-output' || header === '-raw') continue;

    const resolved = readDvorakJHeading(header, brackets === 2, { substitutions, sequential });
    for (const entry of resolved) {
      if (entry.kind === 'unresolved') {
        addWarning(warnings, `DvorakJの面ヘッダ「${heading}」のキー「${entry.key}」を解決できないため無視しました`);
      }
    }
    const headings = resolved.filter((entry) => entry.kind === 'face');
    if (headings.length === 0) continue;

    const grid = body
      .filter((line) => line.includes('|'))
      .map(dvorakJCells)
      .slice(0, 4);
    if (grid.length === 0) {
      addWarning(warnings, `DvorakJの面「${heading}」にセルがないため無視しました`);
      continue;
    }
    const cells: ParsedCell[] = [];
    for (const [row, line] of grid.entries()) {
      for (const [column, raw] of line.slice(0, WIDTHS[row] ?? 0).entries()) {
        const cell = dvorakJCell(raw);
        if (cell) cells.push({ row, column, output: cell.output, label: cell.label });
      }
    }
    for (const entry of headings) {
      faces.push({
        heading,
        trigger: entry.trigger,
        mode: entry.mode,
        kanaUnrepresentable: entry.kanaUnrepresentable,
        stroke: { steps: entry.steps, cell: entry.cell },
        cells,
        isFunctionLabel: hasDvorakJFunctionLabel,
      });
    }
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
      addWarning(warnings, `面「${section}」は、基底面「${base}」と名前の始まり（${prefix}）が異なるため読み飛ばしました`);
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

/** 定義ファイルを読んだ結果。かなを直接打つ定義は面の形、それ以外は段の形で返る。読めない時は利用者向けの理由を返す。 */
type ClassifiedFile =
  | { readonly kind: 'kana'; readonly content: KanaLayoutContent; readonly warnings: readonly string[] }
  | { readonly kind: 'stage'; readonly layout: ImportedLayout }
  | { readonly kind: 'error'; readonly message: string };

const UNKNOWN_FORMAT_MESSAGE = '取り込める形式ではありません。DvorakJ（.txt）、Vial（.vil）、紅皿（.bnz・.ini）の定義ファイルに対応しています';

/**
 * ファイル名と中身から、定義の種類を判定して読む。
 * Vialは段の形しか作れないので、出力にかなを含む定義は面の形へ変換できず取り込まない。
 */
function classifyLayoutFile(fileName: string, bytes: ArrayBuffer | Uint8Array): ClassifiedFile {
  const format = formatForFileName(fileName);
  if (format === undefined) return { kind: 'error', message: UNKNOWN_FORMAT_MESSAGE };
  const name = fileName.replace(/\.[^.]+$/, '').trim();
  try {
    const source = decodeLayoutFile(bytes, format);
    if (format === 'vial') {
      const layout = importVial(source, name || undefined);
      if (layout.sequences.some(([output]) => hasKanaLetter(output))) {
        return { kind: 'error', message: 'かなを出力するVialの定義は、取り込めません' };
      }
      return { kind: 'stage', layout };
    }
    const result = format === 'dvorakj' ? importDvorakJ(source, name || undefined) : importBenizara(source, name || undefined);
    return result.kind === 'kana' ? { kind: 'kana', content: result.content, warnings: result.warnings } : { kind: 'stage', layout: result.layout };
  } catch (error) {
    return {
      kind: 'error',
      message: `取り込めませんでした。${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** かな配列の画面で定義ファイルを取り込んだ結果。取り込めない時は利用者向けの理由を返す。 */
export type KanaFileImportResult =
  | {
      readonly ok: true;
      readonly content: KanaLayoutContent;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly message: string;
      /** ローマ字配列の画面で取り込める定義か（画面がリンクを添える） */
      readonly romajiLayout?: true;
    };

/**
 * ファイル名と中身から、かなを直接打つ配列の面の形を作る。
 * 形式が分からないファイル、かなを出力するVial、かなを含まない定義は取り込まない。
 */
export function importKanaLayoutFile(fileName: string, bytes: ArrayBuffer | Uint8Array): KanaFileImportResult {
  const result = classifyLayoutFile(fileName, bytes);
  if (result.kind === 'error') return { ok: false, message: result.message };
  if (result.kind === 'stage') return { ok: false, message: 'かな配列ではない定義のため、取り込めません', romajiLayout: true };
  return { ok: true, content: result.content, warnings: result.warnings };
}

/** ローマ字配列の画面で定義ファイルを取り込んだ結果。取り込めない時は利用者向けの理由を返す。 */
export type RomajiFileImportResult =
  | { readonly ok: true; readonly layout: ImportedLayout }
  | {
      readonly ok: false;
      readonly message: string;
      /** かな配列の画面で取り込める定義か（画面がリンクを添える） */
      readonly kanaLayout?: true;
    };

/**
 * ファイル名と中身から、段の形の取り込み結果を作る。
 * 形式が分からないファイルと、かなを直接打つ定義は取り込まない。
 */
export function importRomajiLayoutFile(fileName: string, bytes: ArrayBuffer | Uint8Array): RomajiFileImportResult {
  const result = classifyLayoutFile(fileName, bytes);
  if (result.kind === 'error') return { ok: false, message: result.message };
  if (result.kind === 'kana') return { ok: false, message: 'かなを直接打つ定義のため、取り込めません', kanaLayout: true };
  return { ok: true, layout: result.layout };
}
