import { QWERTY_LEGEND, SHIFT_KEY } from '../shapes/geometry.ts';
import type { FaceMode } from './types.ts';

/**
 * DvorakJの定義ファイルの表の見出しを、キーの組に読む。
 * DvorakJ本体の読み込み（`ReadLayout-Keyboard.ahk` の `conv_from_table_to_lines`）と同じ規則で、
 * 別名の置き換え・カンマで分けた別の面・`-` と `+` のキーの区切り・スキャンコード・括弧による同時押しを扱う。
 */

/** 別名の置き換え。DvorakJは定義した順の逆に、見出しの文字列へそのまま置き換える。 */
export type HeadingSubstitution = readonly [from: string, to: string];

/** 見出しを読む時の、ファイル全体で決まる条件。 */
export interface HeadingContext {
  /** `-option` と `-option-input` で、ここまでに定義された別名（定義した順） */
  readonly substitutions: readonly HeadingSubstitution[];
  /** 1行目の宣言が順の打鍵（「順」「逐次」を含む）か。含まなければ見出しのキーとセルのキーの同時押し */
  readonly sequential: boolean;
}

/** セルのキーを、見出しの打鍵のどこに置くか。 */
export type CellPlacement = 'with-last' | 'after' | 'before';

/** 見出し1つ（カンマで分けた1つ）から読んだ面。 */
export interface HeadingFace {
  readonly kind: 'face';
  /** 切り替えの打鍵の列。1つの打鍵は同時に押すキーの組。切り替えのキーが無い面は空 */
  readonly steps: string[][];
  /** セルのキーの位置。`with-last` は最後の打鍵に加える（同時押し）、`after`・`before` は別の打鍵として後・前に置く */
  readonly cell: CellPlacement;
  /** 切り替えのキー全部（重複を除く） */
  readonly trigger: string[];
  /** かなの面の形での打鍵の順序。`kanaUnrepresentable` の時は参考値 */
  readonly mode: FaceMode;
  /** 切り替えが2打以上など、かなの面の形（triggerの後に1打だけ続く形か、同時押し）で表せない */
  readonly kanaUnrepresentable: boolean;
}

/** 解決できないキーを含む面。 */
export interface HeadingProblem {
  readonly kind: 'unresolved';
  /** 解決できなかったキーの名前（別名を置き換えた後の表記） */
  readonly key: string;
}

export type HeadingResult = HeadingFace | HeadingProblem;

/** 1行目の宣言が順の打鍵か。DvorakJは「逐次」か「順」を含むかで決める。 */
export const isSequentialDeclaration = (firstLine: string): boolean => /逐次|順/.test(firstLine);

const DEFAULT_SUBSTITUTIONS: readonly HeadingSubstitution[] = [
  ['apps', 'appskey'],
  ['29', 'zenkaku'],
  ['-', '_'],
  ['（', '('],
  ['）', ')'],
];

/** 見出しの長さの上限。別名の置き換えを重ねた結果にも掛け、互いを含む別名が指数的に伸びるのを止める。 */
const MAX_HEADING_LENGTH = 4096;

/** 左右どちらでもよいキー（`shift`）を含む見出しが展開する面の数の上限。 */
const MAX_FACES_PER_ITEM = 16;

/** `-option`の1行（`名前 | 値`）を読む。読めない行はundefined。線形時間で読む。 */
export function parseSubstitution(line: string): HeadingSubstitution | undefined {
  const text = line.trim();
  const bar = text.indexOf('|', 1);
  if (bar < 1) return undefined;
  const from = text.slice(0, bar).trim();
  const to = text.slice(bar + 1).trim();
  if (from === '' || to === '') return undefined;
  // `{S}`はDvorakJが定める名前ではなく、定義ファイルの作者が付けた別名で、`shift`はShiftのキーを指す。
  // それでも`{S}`をspaceとして読むのは、薙刀式v18の定義（nag.txt）がコメントで`({S}[`の面を「センターシフト」と呼ぶことと、
  // スペースをShiftとして使う設定（SandS）が定義ファイルの外にあることによる、keydistの読み方
  if (from.toUpperCase() === '{S}') {
    const shift = /^([+-]?)shift$/i.exec(to);
    if (shift) return [from, `${shift[1]}space`];
  }
  return [from, to];
}

/** 見出しの文字列に別名を置き換える。長さが上限を超えたらundefined。 */
function substitute(header: string, user: readonly HeadingSubstitution[]): string | undefined {
  let text = header;
  for (const [from, to] of [...DEFAULT_SUBSTITUTIONS, ...user].reverse()) {
    if (from === '') continue;
    text = text.split(from).join(to);
    if (text.length > MAX_HEADING_LENGTH) return undefined;
  }
  return text;
}

/** スキャンコードの段。キーの刻印の段ごとの先頭のコード。 */
const SCAN_CODE_ROWS = [
  { start: 0x02, row: 0 },
  { start: 0x10, row: 1 },
  { start: 0x1e, row: 2 },
  { start: 0x2c, row: 3 },
] as const;

/** スキャンコード（16進）に当たる物理キー。物理配列に無いコードはundefined。 */
export function dvorakJScanCode(code: string): string | undefined {
  if (!/^[0-9a-f]+$/i.test(code)) return undefined;
  const numeric = Number.parseInt(code, 16);
  for (const { start, row } of SCAN_CODE_ROWS) {
    const column = numeric - start;
    const legend = QWERTY_LEGEND[row];
    if (column >= 0 && column < legend.length) return legend[column];
  }
  return undefined;
}

/** キーの名前（`_`で区切った1つ）に当たる物理キーの候補。当たらなければundefined。 */
function resolveKeyName(name: string): string[] | undefined {
  // DvorakJは、2文字なら `sc0XX`、3文字なら `scXXX` のスキャンコードとして扱う
  if (name.length === 2 || name.length === 3) {
    const physical = dvorakJScanCode(name);
    return physical === undefined ? undefined : [physical];
  }
  const lower = name.toLowerCase();
  // `shift`は左右どちらのShiftも指す
  if (lower === 'shift') return [SHIFT_KEY.L, SHIFT_KEY.R];
  if (lower === 'space') return ['space'];
  return undefined;
}

type Token = { readonly kind: 'open' } | { readonly kind: 'close' } | { readonly kind: 'key'; readonly candidates: string[] };

/** `_` で区切った見出し1つ（カンマで分けた1つ）を、括弧とキーの並びにする。解決できないキーは名前を返す。 */
function tokenize(item: string): Token[] | string {
  const tokens: Token[] = [];
  for (const raw of item.split('_')) {
    const part = raw.trim();
    if (part === '') continue;
    if (part === '(') {
      tokens.push({ kind: 'open' });
      continue;
    }
    if (part === ')') {
      tokens.push({ kind: 'close' });
      continue;
    }
    // 括弧にキーの名前が続く表記（`(12`）はDvorakJも別のキーとして扱い、当たるキーが無い
    if (part.startsWith('(') || part.startsWith(')')) return part;
    // `+` が付けた「真に同時に打鍵するキー」の印。キーの組は変えないので捨てる
    const name = part.replace(/true/gi, '').trim();
    const candidates = resolveKeyName(name);
    if (candidates === undefined) return name === '' ? part : name;
    tokens.push({ kind: 'key', candidates });
  }
  return tokens;
}

type Slot = string[];

/** 括弧とキーの並びを、切り替えの打鍵の列とセルの位置にする。 */
function arrange(tokens: Token[], ctx: HeadingContext, firstMode: boolean): { steps: Slot[][]; cell: CellPlacement } {
  const keys = tokens.filter((token): token is Extract<Token, { kind: 'key' }> => token.kind === 'key').map((token) => token.candidates);
  if (!ctx.sequential) {
    // 同時に打鍵するファイルは、見出しのキー全部とセルのキーを1つの括弧に入れる
    return { steps: keys.length === 0 ? [] : [keys], cell: 'with-last' };
  }
  const steps: Slot[][] = [];
  let group: Slot[] | undefined;
  for (const token of tokens) {
    if (token.kind === 'open') {
      group = group ?? [];
    } else if (token.kind === 'close') {
      if (group !== undefined && group.length > 0) steps.push(group);
      group = undefined;
    } else if (group === undefined) {
      steps.push([token.candidates]);
    } else {
      group.push(token.candidates);
    }
  }
  if (group === undefined) return { steps, cell: firstMode ? 'before' : 'after' };
  // 閉じていない括弧は末尾で閉じる。セルのキーは、通常は括弧の中に入り、先に打つ表（`[[`）では括弧の前に置く
  if (group.length > 0) steps.push(group);
  return { steps, cell: firstMode ? 'before' : 'with-last' };
}

function faceOf(steps: string[][], cell: CellPlacement): HeadingFace {
  const trigger = [...new Set(steps.flat())];
  let mode: FaceMode = 'simultaneous';
  let kanaUnrepresentable = false;
  if (steps.length > 0) {
    if (cell === 'with-last') {
      kanaUnrepresentable = steps.length > 1;
    } else if (steps.length === 1 && steps[0].length === 1) {
      mode = cell === 'after' ? 'prefix' : 'suffix';
    } else {
      kanaUnrepresentable = true;
    }
  }
  return { kind: 'face', steps, cell, trigger, mode, kanaUnrepresentable };
}

/** 候補が複数あるキー（`shift`）を、候補ごとに1つずつ選んだ全部の組み合わせにする。 */
function expandCandidates(steps: Slot[][]): string[][][] | undefined {
  const count = steps.flat().reduce((product, slot) => product * slot.length, 1);
  if (count > MAX_FACES_PER_ITEM) return undefined;
  let results: string[][][] = [steps.map(() => [])];
  steps.forEach((step, index) => {
    for (const slot of step) {
      results = results.flatMap((result) => slot.map((key) => result.map((chosen, position) => (position === index ? [...chosen, key] : chosen))));
    }
  });
  return results;
}

/**
 * 見出し（`[` の前の文字列）を読む。カンマで分けた1つずつが別の面になる。
 * 見出しが空、または末尾のカンマで空の項目がある時は、切り替えのキーの無い面も1つ足す。
 * 解決できないキーを含む項目は、その項目だけ `unresolved` で返す。
 */
export function readDvorakJHeading(header: string, firstMode: boolean, ctx: HeadingContext): HeadingResult[] {
  const text = header.trim();
  if (text === '') return [faceOf([], 'with-last')];
  const expanded = text.length > MAX_HEADING_LENGTH ? undefined : substitute(text, ctx.substitutions);
  if (expanded === undefined) return [{ kind: 'unresolved', key: text.length > 40 ? `${text.slice(0, 40)}…` : text }];

  const results: HeadingResult[] = [];
  let hasEmptyItem = false;
  for (const raw of expanded.split(',')) {
    const item = raw.trim();
    if (item === '') {
      hasEmptyItem = true;
      continue;
    }
    const tokens = tokenize(item.replaceAll('+', '_TRUE'));
    if (typeof tokens === 'string') {
      results.push({ kind: 'unresolved', key: tokens });
      continue;
    }
    const { steps, cell } = arrange(tokens, ctx, firstMode);
    const concretes = expandCandidates(steps);
    if (concretes === undefined) {
      results.push({ kind: 'unresolved', key: 'shift' });
      continue;
    }
    for (const concrete of concretes) results.push(faceOf(concrete, cell));
  }
  if (hasEmptyItem) results.push(faceOf([], 'with-last'));
  return results;
}
