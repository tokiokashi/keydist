/**
 * 雪華（secca）の定義から、字ごとの打鍵列を求める。
 *
 * 出典は2種類のファイルに分かれる。`config.kbd`はソフトKMonadの設定で、物理キーの押し方と、それが送り出す記号の並びを決める。
 * `.XCompose`と読み込む表は、送り出された記号の並びを文字に変える。物理キーから文字への対応は、この2つをつなげて求める。
 * XComposeの表の左辺は物理キーではなく、KMonadが送り出す記号の並びである。そのため、`config.kbd`が使う構文の動きを再現し、
 * キーを押して出る記号の並びを、表の左辺と突き合わせる。
 *
 * 再現する構文は`tap-next`・`tap-next-release`・`tap-hold-next`・`layer-toggle`・`layer-switch`・`around`・
 * マクロ`#(...)`（中の待ち`P10`と`XX`を含む）・層の`_`（下の層を透過）・`XX`（押しを捨てる）。
 *
 * 押し方は、押したキーを最後の打鍵まで押したままにし、最後に打ったキーから順に離す形に固定する。作者の定義が
 * 「同時打鍵」と呼ぶ打ち方で、保留中の`tap-next-release`は、自分の離しでタップに、自分より後に押したキーの離しでホールドに決まる。
 * - 最後のキーは、自分の離しが最初なので「打つ」になる
 * - 最後でないキーは、後から押されたキーの離しが先に来るので「押したまま」になる
 * 保留中の`tap-next-release`が溜めるのは、自分より後に押したキーのイベントだけである。自分より前に押したキーの離しは溜まらず即時に処理される。
 * 最後のキーより前のキーは、`tap-next`と`tap-hold-next`でも、次の押しが来るので「押したまま」になる。
 * `tap-hold-next`の待ち時間は、押し方が速く、待ち時間の内に次のキーが来るものとして扱う。
 *
 * 出力は、押したままのキーの状態を持つ。すでに押されている出力のキーを押す指示はカーネルが捨てるので、
 * 記号の並びに現れない（作者の表の`<Multi_key> <bracketleft> <f> <d> <bracketright> <j> <f> <d> <minus> <k>`のように、
 * 押したままの`ralt`と`[`の後ろに、次のキーのマクロの文字だけが続く）。
 */

export interface SeccaRow {
  /** 表のファイル名 */
  readonly file: string;
  /** 表の中の行番号（1始まり） */
  readonly line: number;
  /** 左辺の記号の並び（`Multi_key`を含む） */
  readonly symbols: readonly string[];
  /** 出力の文字列。ひらがなの時に無効にするための行は空になる */
  readonly output: string;
}

/** 物理キー（`defsrc`の名前）の押し順。最後のキーの前のキーは押したまま、最後のキーは打つ */
export type Chord = readonly string[];

type Sexp = { readonly atom: string } | { readonly items: readonly Sexp[]; readonly macro: boolean };

type Button =
  | { readonly t: 'key'; readonly key: string }
  | { readonly t: 'block' }
  | { readonly t: 'trans' }
  | { readonly t: 'ref'; readonly name: string }
  | { readonly t: 'macro'; readonly items: readonly Button[] }
  | { readonly t: 'around'; readonly outer: Button; readonly inner: Button }
  | { readonly t: 'tapnext'; readonly tap: Button; readonly hold: Button; readonly release: boolean }
  | { readonly t: 'layer'; readonly name: string }
  | { readonly t: 'switch'; readonly name: string }
  | { readonly t: 'pause' };

export interface KmonadConfig {
  readonly srcKeys: readonly string[];
  readonly aliases: ReadonlyMap<string, Button>;
  readonly layers: ReadonlyMap<string, readonly Button[]>;
  readonly firstLayer: string;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === ';' && text[i + 1] === ';') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
      continue;
    }
    if (ch === '#' && text[i + 1] === '(') {
      tokens.push('#(');
      i += 2;
      continue;
    }
    let atom = '';
    while (i < n) {
      const c = text[i]!;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '(' || c === ')') break;
      if (c === '\\' && i + 1 < n) {
        atom += `\\${text[i + 1]}`;
        i += 2;
        continue;
      }
      atom += c;
      i++;
    }
    tokens.push(atom);
  }
  return tokens;
}

function parseSexps(tokens: readonly string[]): Sexp[] {
  let pos = 0;
  const parseOne = (): Sexp => {
    const token = tokens[pos++]!;
    if (token === '(' || token === '#(') {
      const items: Sexp[] = [];
      while (tokens[pos] !== ')') {
        if (pos >= tokens.length) throw new Error('config.kbdの括弧が閉じていない');
        items.push(parseOne());
      }
      pos++;
      return { items, macro: token === '#(' };
    }
    return { atom: token };
  };
  const out: Sexp[] = [];
  while (pos < tokens.length) out.push(parseOne());
  return out;
}

const isAtom = (s: Sexp): s is { readonly atom: string } => 'atom' in s;

function toButton(s: Sexp): Button {
  if (isAtom(s)) {
    const a = s.atom;
    if (a.startsWith('@') && a.length > 1) return { t: 'ref', name: a.slice(1) };
    if (a === '_') return { t: 'trans' };
    if (a === 'XX') return { t: 'block' };
    if (/^P\d+$/.test(a)) return { t: 'pause' };
    return { t: 'key', key: a.startsWith('\\') ? a.slice(1) : a };
  }
  if (s.macro) return { t: 'macro', items: s.items.map(toButton) };
  const [head, ...args] = s.items;
  const op = head !== undefined && isAtom(head) ? head.atom : '';
  const name = (x: Sexp | undefined): string => (x !== undefined && isAtom(x) ? x.atom : '');
  switch (op) {
    case 'around':
      return { t: 'around', outer: toButton(args[0]!), inner: toButton(args[1]!) };
    case 'tap-next':
      return { t: 'tapnext', tap: toButton(args[0]!), hold: toButton(args[1]!), release: false };
    case 'tap-next-release':
      return { t: 'tapnext', tap: toButton(args[0]!), hold: toButton(args[1]!), release: true };
    case 'tap-hold-next':
      return { t: 'tapnext', tap: toButton(args[1]!), hold: toButton(args[2]!), release: false };
    case 'layer-toggle':
      return { t: 'layer', name: name(args[0]) };
    case 'layer-switch':
      return { t: 'switch', name: name(args[0]) };
    default:
      // マクロの中の`(around ...)`などは上で扱う。ここに来るのは、操作を持たない括弧（`(esc P10 ...)`のような未対応の形）
      throw new Error(`未対応の構文: ${op}`);
  }
}

/** `config.kbd`を読む。 */
export function parseKmonadConfig(text: string): KmonadConfig {
  const forms = parseSexps(tokenize(text));
  let srcKeys: string[] = [];
  const aliases = new Map<string, Button>();
  const layers = new Map<string, Button[]>();
  let firstLayer = '';
  for (const form of forms) {
    if (isAtom(form)) continue;
    const [head, ...rest] = form.items;
    const op = head !== undefined && isAtom(head) ? head.atom : '';
    if (op === 'defsrc') {
      srcKeys = rest.map((x) => (isAtom(x) ? x.atom : ''));
    } else if (op === 'defalias') {
      for (let i = 0; i + 1 < rest.length; i += 2) {
        const nameNode = rest[i]!;
        if (!isAtom(nameNode)) throw new Error('defaliasの名前が括弧');
        aliases.set(nameNode.atom, toButton(rest[i + 1]!));
      }
    } else if (op === 'deflayer') {
      const nameNode = rest[0]!;
      if (!isAtom(nameNode)) throw new Error('deflayerの名前が括弧');
      const cells = rest.slice(1).map(toButton);
      if (cells.length !== srcKeys.length) throw new Error(`層${nameNode.atom}のキー数がdefsrcと合わない: ${cells.length} / ${srcKeys.length}`);
      if (firstLayer === '') firstLayer = nameNode.atom;
      layers.set(nameNode.atom, cells);
    }
  }
  return { srcKeys, aliases, layers, firstLayer };
}

const SHIFTED_BY_KEY: Readonly<Record<string, string>> = {
  '1': 'exclam',
  '2': 'at',
  '3': 'numbersign',
  '4': 'dollar',
  '5': 'percent',
  '6': 'asciicircum',
  '7': 'ampersand',
  '8': 'asterisk',
  '9': 'parenleft',
  '0': 'parenright',
  '-': 'underscore',
  '=': 'plus',
  '[': 'braceleft',
  ']': 'braceright',
  '\\': 'bar',
  ';': 'colon',
  "'": 'quotedbl',
  ',': 'less',
  '.': 'greater',
  '/': 'question',
  '`': 'asciitilde',
};

const PLAIN_BY_KEY: Readonly<Record<string, string>> = {
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '0': '0',
  '-': 'minus',
  '=': 'equal',
  '[': 'bracketleft',
  ']': 'bracketright',
  '\\': 'backslash',
  ';': 'semicolon',
  "'": 'apostrophe',
  ',': 'comma',
  '.': 'period',
  '/': 'slash',
  '`': 'grave',
  spc: 'space',
};

/** すでにShiftを押した形で書かれたキー名（KMonadが`_` `{`のように書けるキー）のkeysym */
const SHIFT_IMPLIED: Readonly<Record<string, string>> = {
  '!': 'exclam',
  '@': 'at',
  '#': 'numbersign',
  $: 'dollar',
  '%': 'percent',
  '^': 'asciicircum',
  '&': 'ampersand',
  '*': 'asterisk',
  '(': 'parenleft',
  ')': 'parenright',
  _: 'underscore',
  '+': 'plus',
  '{': 'braceleft',
  '}': 'braceright',
  '|': 'bar',
  ':': 'colon',
  '"': 'quotedbl',
  '<': 'less',
  '>': 'greater',
  '?': 'question',
  '~': 'asciitilde',
};

const MODIFIERS = new Set(['ralt', 'lsft', 'rsft', 'lctl', 'rctl', 'lalt', 'lmet', 'rmet']);

/** 出力のキー名と、Shiftの状態から、XComposeのkeysym名を作る。 */
function keysymOf(key: string, shift: boolean): string {
  if (/^[a-z]$/.test(key)) return shift ? key.toUpperCase() : key;
  if (/^[A-Z]$/.test(key)) return key;
  const implied = SHIFT_IMPLIED[key];
  if (implied !== undefined) return implied;
  if (shift && SHIFTED_BY_KEY[key] !== undefined) return SHIFTED_BY_KEY[key];
  return PLAIN_BY_KEY[key] ?? `?${key}`;
}

interface HeldKey {
  readonly key: string;
  /** このキーを押して積んだ層 */
  readonly layers: readonly string[];
  /** `tap-next-release`のホールド側の役で押したキー */
  readonly pendingRelease: boolean;
}

/** 表の左辺の記号の並びの木。行の左辺の先頭と合う間だけ、押す列をたどるために使う。 */
interface TrieNode {
  readonly children: Map<string, TrieNode>;
  readonly rows: SeccaRow[];
}

interface SimState {
  stack: string[];
  base: string;
  down: Set<string>;
  /** 今までに出た記号の並びが当たる木の節。どの行の左辺の先頭にも合わなくなったら`null`*/
  node: TrieNode | null;
  /** 今までに出た記号の数 */
  outLength: number;
  invalid: boolean;
  /** 押したままのキー（最後のキーを除く） */
  held: HeldKey[];
}

const cloneState = (s: SimState): SimState => ({
  stack: [...s.stack],
  base: s.base,
  down: new Set(s.down),
  node: s.node,
  outLength: s.outLength,
  invalid: s.invalid,
  held: [...s.held],
});

class Simulator {
  readonly cfg: KmonadConfig;
  readonly srcIndex = new Map<string, number>();
  constructor(cfg: KmonadConfig) {
    this.cfg = cfg;
    for (const [index, key] of cfg.srcKeys.entries()) this.srcIndex.set(key, index);
  }

  resolve(button: Button): Button {
    let b = button;
    for (let guard = 0; b.t === 'ref'; guard++) {
      if (guard > 20) throw new Error('aliasが循環している');
      const next = this.cfg.aliases.get(b.name);
      if (next === undefined) throw new Error(`未定義のalias: ${b.name}`);
      b = next;
    }
    return b;
  }

  /** 層の積み上げの上から探し、`_`は下の層へ渡す。`undefined`は押しを捨てる（`XX`） */
  lookup(state: SimState, key: string): Button | undefined {
    const index = this.srcIndex.get(key)!;
    const names = [...state.stack].reverse();
    names.push(state.base);
    for (const name of names) {
      const layer = this.cfg.layers.get(name);
      if (layer === undefined) throw new Error(`未定義の層: ${name}`);
      const cell = this.resolve(layer[index]!);
      if (cell.t === 'trans') continue;
      if (cell.t === 'block') return undefined;
      return cell;
    }
    // 一番下の層で`_`のキーは、キーそのものを出す（`fallthrough true`）
    return { t: 'key', key };
  }

  emit(state: SimState, symbol: string): void {
    state.outLength++;
    state.node = state.node?.children.get(symbol) ?? null;
  }

  pressKey(state: SimState, key: string): void {
    if (state.down.has(key)) return;
    state.down.add(key);
    if (key === 'ralt') {
      this.emit(state, 'Multi_key');
      return;
    }
    if (MODIFIERS.has(key)) {
      if (key !== 'lsft' && key !== 'rsft') state.invalid = true;
      return;
    }
    const shift = state.down.has('lsft') || state.down.has('rsft');
    this.emit(state, keysymOf(key, shift));
  }

  releaseKey(state: SimState, key: string): void {
    state.down.delete(key);
  }

  press(state: SimState, button: Button): void {
    const b = this.resolve(button);
    switch (b.t) {
      case 'key':
        this.pressKey(state, b.key);
        return;
      case 'macro':
        for (const item of b.items) this.tap(state, item);
        return;
      case 'around':
        this.press(state, b.outer);
        this.press(state, b.inner);
        return;
      case 'tapnext':
        // 押したままの役（次のキーが来る）として押す
        this.press(state, b.hold);
        return;
      case 'layer':
        state.stack.push(b.name);
        return;
      case 'switch':
        state.invalid = true;
        return;
      default:
        return;
    }
  }

  release(state: SimState, button: Button): void {
    const b = this.resolve(button);
    switch (b.t) {
      case 'key':
        this.releaseKey(state, b.key);
        return;
      case 'around':
        this.release(state, b.inner);
        this.release(state, b.outer);
        return;
      case 'layer': {
        const at = state.stack.lastIndexOf(b.name);
        if (at >= 0) state.stack.splice(at, 1);
        return;
      }
      default:
        return;
    }
  }

  tap(state: SimState, button: Button): void {
    this.press(state, button);
    this.release(state, button);
  }

  /** 最後に打つキーとして押す。`tap-next`系は打つ側の割り当てが出る。 */
  pressAsLast(state: SimState, button: Button): void {
    const b = this.resolve(button);
    if (b.t === 'tapnext') this.tap(state, b.tap);
    else this.press(state, b);
  }
}

/** `.XCompose`の表を読む。`include`の行は読まない。 */
export function parseComposeFile(file: string, text: string): SeccaRow[] {
  const rows: SeccaRow[] = [];
  const lines = text.split('\n');
  const pattern = /^((?:<[^>]+>\s*)+):\s*"((?:[^"\\]|\\.)*)"/;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || line.startsWith('include') || line.startsWith('#')) return;
    const match = pattern.exec(line);
    if (match === null) throw new Error(`${file}:${index + 1} を読めない: ${line}`);
    const symbols = [...match[1]!.matchAll(/<([^>]+)>/g)].map((m) => m[1]!);
    rows.push({ file, line: index + 1, symbols, output: match[2]!.replace(/\\(.)/g, '$1') });
  });
  return rows;
}

/** 押し順の中の、左手を離す操作（層を保つキーを全部離す）。 */
export const LIFT = '^';

export interface SeccaChords {
  /** 表の行ごとの、その行を出す押し順の候補（見つけた順）。`LIFT`を含む */
  readonly chordsByRow: ReadonlyMap<SeccaRow, readonly Chord[]>;
  /** どの押し順でも作れなかった行 */
  readonly unreachable: readonly SeccaRow[];
}

const MAX_DEPTH = 10;
export const MAX_CHORDS_PER_ROW = 8;

const keyCount = (chord: Chord): number => chord.filter((op) => op !== LIFT).length;
/** 空白を押す位置の、後ろからの近さ。空白は、シフトを要する打鍵の直前に押す形を優先する。 */
const spaceEarliness = (chord: Chord): number => chord.reduce((sum, op, index) => sum + (op === 'spc' ? chord.length - index : 0), 0);

/** 押し順の優先: キーの数が少ない順、離す操作が無い順、空白が後ろに近い順、キーの並びの辞書順。 */
export function compareChords(a: Chord, b: Chord): number {
  return (
    keyCount(a) - keyCount(b) ||
    a.filter((op) => op === LIFT).length - b.filter((op) => op === LIFT).length ||
    spaceEarliness(a) - spaceEarliness(b) ||
    a.join(' ').localeCompare(b.join(' '))
  );
}

/**
 * 表の各行を出す押し順を探す。キーを押す列を深さ優先でたどり、出た記号の並びが、表の左辺の先頭と合う間だけ進む。
 * 操作は、キーを押す操作と、層を保っているキーを全部離す操作（`LIFT`）の2つ。
 * 離す操作は、記号が出た後に1回だけ入れる。左手の2キーを離して、右手の押したままのキーの後に続けて打つ打ち方（くずし字入力）を表す。
 * 離す操作は、押したままのキーに`tap-next-release`が無い時と、最初の`tap-next-release`が最後に押したキーで、そのキーのホールド側が層を持たない時に許す。
 * 保留中の`tap-next-release`より前に押したキーの離しは、溜まらず即時に処理されて層が外れる。
 * 最初の`tap-next-release`が最後でない時は、後に押したキーの離しでそのキーがホールドに決まり、溜めたイベントをその時点の層で再生する。
 * それ以外の、`tap-next-release`が待つ間に押したキーは、待ちが決まった後にまとめて処理されるが、押す順と離す順は保たれるので、押す列を順にたどる再現と同じ結果になる。
 * `isUsable`が偽の行は、探す対象に入れない。
 */
export function findChords(config: KmonadConfig, rows: readonly SeccaRow[], isUsable: (row: SeccaRow) => boolean = () => true): SeccaChords {
  const sim = new Simulator(config);
  const usable = rows.filter(isUsable);
  const root: TrieNode = { children: new Map(), rows: [] };
  for (const row of usable) {
    let node = root;
    for (const symbol of row.symbols) {
      let next = node.children.get(symbol);
      if (next === undefined) {
        next = { children: new Map(), rows: [] };
        node.children.set(symbol, next);
      }
      node = next;
    }
    node.rows.push(row);
  }
  const found = new Map<SeccaRow, Chord[]>();
  // 作者の表記に位置が無い物理キー（修飾キー・Tab・Enterなど）と、キーそのものを出すだけの割り当てには、文字の打鍵が無い
  const keys = config.srcKeys.filter((key) => authorKey(key) !== undefined);

  const explore = (state: SimState, ops: readonly string[]): void => {
    for (const key of keys) {
      if (state.held.some((h) => h.key === key)) continue;
      const button = sim.lookup(state, key);
      if (button === undefined || sim.resolve(button).t === 'key') continue;
      const last = cloneState(state);
      sim.pressAsLast(last, button);
      // 最後のキーは、記号を足す打鍵でなければならない（足さないキーを並べて、同じ出力の押し順を水増ししない）
      if (!last.invalid && last.node !== null && last.node.rows.length > 0 && last.outLength > state.outLength) {
        for (const row of last.node.rows) {
          const list = found.get(row);
          const chord = [...ops, key];
          if (list === undefined) found.set(row, [chord]);
          else {
            list.push(chord);
            list.sort(compareChords);
            if (list.length > MAX_CHORDS_PER_ROW) list.length = MAX_CHORDS_PER_ROW;
          }
        }
      }
      if (ops.length + 1 >= MAX_DEPTH) continue;
      const next = cloneState(state);
      const before = next.stack.length;
      sim.press(next, button);
      if (next.invalid || next.node === null) continue;
      const resolved = sim.resolve(button);
      next.held.push({ key, layers: next.stack.slice(before), pendingRelease: resolved.t === 'tapnext' && resolved.release });
      explore(next, [...ops, key]);
    }
    // 押したままのキーの中で最初の`tap-next-release`が、最後に押したキーで、層を持たない時だけ許す。
    // それより前に`tap-next-release`があると、後から押したキーの離しでそのキーがホールドに決まり、溜めたイベントをその時点の層で再生する
    const firstPending = state.held.findIndex((h) => h.pendingRelease);
    const liftable = firstPending === -1 || (firstPending === state.held.length - 1 && state.held[firstPending]!.layers.length === 0);
    if (liftable && ops.length + 1 < MAX_DEPTH && state.outLength > 0 && !ops.includes(LIFT) && state.held.some((h) => h.layers.length > 0)) {
      const next = cloneState(state);
      const kept: HeldKey[] = [];
      for (const h of next.held) {
        if (h.layers.length === 0) {
          kept.push(h);
          continue;
        }
        for (const name of h.layers) {
          const at = next.stack.lastIndexOf(name);
          if (at >= 0) next.stack.splice(at, 1);
        }
      }
      next.held = kept;
      explore(next, [...ops, LIFT]);
    }
  };
  explore({ stack: [], base: 'kana1', down: new Set(), node: root, outLength: 0, invalid: false, held: [] }, []);
  const unreachable = usable.filter((row) => !found.has(row));
  return { chordsByRow: found, unreachable };
}

/**
 * 物理キー（`defsrc`の名前）から、作者の表記のキー（QWERTYの位置）へ。作者の`config.kbd`は右手を1列右の物理キーへずらす。
 * 右手のキーは1列左へ戻す。左手と、右手の外のキーはそのまま。
 */
const ORZ_TO_AUTHOR: Readonly<Record<string, string>> = {
  u: 'y',
  i: 'u',
  o: 'i',
  p: 'o',
  '[': 'p',
  ']': '[',
  j: 'h',
  k: 'j',
  l: 'k',
  ';': 'l',
  "'": ';',
  m: 'n',
  ',': 'm',
  '.': ',',
  '/': '.',
  rsft: '/',
};

/** 作者の表記で打つキーを表すid。左手と数字の段はQWERTYの刻印、空白は`space`。 */
export function authorKey(physical: string): string | undefined {
  if (physical === 'spc') return 'space';
  const mapped = ORZ_TO_AUTHOR[physical];
  if (mapped !== undefined) return mapped;
  return /^[a-z0-9]$/.test(physical) ? physical : undefined;
}
