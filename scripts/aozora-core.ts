// 青空文庫の注記付きテキストを、評価に渡す本文に直す規則。取得や書き出しは持たない（generate-neko-sample.tsが使う）。

/** JIS X 0213の面区点番号（`面-区-点`）からUnicodeの字を引く表。『吾輩は猫である』の本文に現れる外字だけを持つ。 */
export const GAIJI_TABLE: Readonly<Record<string, string>> = {
  '1-6-84': 'ㇶ',
  '1-14-76': '匇',
  '1-15-24': '噱',
  '1-15-89': '媧',
  '1-84-28': '彘',
  '1-84-45': '怳',
  '1-84-54': '惝',
  '1-84-55': '惸',
  '1-86-15': '橛',
  '1-86-62': '泫',
  '1-87-40': '炷',
  '1-87-64': '燄',
  '1-88-22': '璆',
  '1-88-85': '睜',
  '1-91-55': '蛼',
  '1-92-39': '蹰',
  '1-92-78': '鄢',
  '1-94-13': '騃',
  '2-3-54': '卺',
  '2-12-83': '戕',
  '2-88-74': '譃',
  '2-92-67': '餼',
  '2-92-68': '饀',
  '2-92-71': '饍',
};

/** 青空文庫のアクセント分解で、2文字の並びが表す字。 */
const ACCENT_LIGATURES: Readonly<Record<string, string>> = {
  'AE&': 'Æ',
  'ae&': 'æ',
  'OE&': 'Œ',
  'oe&': 'œ',
  's&': 'ß',
  'O/': 'Ø',
  'o/': 'ø',
  'D/': 'Đ',
  'd/': 'đ',
};

/** アクセント分解の符号と、その符号が表す結合文字。 */
const ACCENT_MARKS: Readonly<Record<string, string>> = {
  '`': '̀',
  "'": '́',
  '^': '̂',
  '~': '̃',
  _: '̄',
  ':': '̈',
  '&': '̊',
  ',': '̧',
};

/** 青空文庫のアクセント分解（`〔…〕` の中身）を元の字に直す。直せない並びはそのまま残す。 */
export function decodeAccentSeparation(inner: string): string {
  let out = inner.replace(/(?:AE&|ae&|OE&|oe&|s&|O\/|o\/|D\/|d\/)/g, (match) => ACCENT_LIGATURES[match] ?? match);
  out = out.replace(/([A-Za-z])([`'^~_:&,])/g, (match, letter: string, mark: string) => {
    const composed = (letter + ACCENT_MARKS[mark]).normalize('NFC');
    return composed.length === 1 ? composed : match;
  });
  return out;
}

export interface AozoraConversion {
  readonly text: string;
  /** 面区点番号からUnicodeの字に直した外字の数 */
  readonly gaijiConverted: number;
  /** 表に無く、`※` と注ごと取り除いた外字の数 */
  readonly gaijiRemoved: number;
  /** 行ごと取り除いた章見出しの行の数 */
  readonly headingLinesRemoved: number;
}

/** 外字の注。注の末尾の面区点番号（`第3水準1-87-40`、`小書き片仮名ヒ、1-6-84` など）が表の引き先になる。 */
const GAIJI_ANY = /※［＃[^］]*］/g;
const HEADING_LINE = /^［＃[０-９]+字下げ］[^\n]*［＃「[^」]*」は中見出し］\n/gm;
const NOTE = /［＃[^］]*］/g;
const ACCENT_BRACKET = /〔([^〔〕]*)〕/g;
const RUBY = /《[^》]*》/g;

/** 取得したテキストの先頭の説明と末尾の底本の情報を除き、本文だけを返す。 */
export function extractBody(raw: string): string {
  const text = raw.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const dashed = lines.flatMap((line, index) => (/^-{10,}$/.test(line) ? [index] : []));
  if (dashed.length < 2) throw new Error('先頭の説明を区切る線が見つからない');
  const footer = lines.findIndex((line, index) => index > dashed[1]! && line.startsWith('底本：'));
  if (footer === -1) throw new Error('末尾の底本の情報が見つからない');
  return `${lines
    .slice(dashed[1]! + 1, footer)
    .join('\n')
    .trim()}\n`;
}

/**
 * 本文から、青空文庫の記法を取り除く。
 *
 * 1. 外字（`※［＃…、面-区-点］`）を表でUnicodeの字に直す。表に無い外字は `※` と注ごと取り除く
 * 2. 章見出しの行（`［＃８字下げ］一［＃「一」は中見出し］`）を行ごと取り除く
 * 3. 入力者注（`［＃…］`）を、注だけ取り除く。注が指している本文の字は残す
 * 4. アクセント分解（`〔…〕`）を元の字に直し、括弧を取り除く
 * 5. ルビ（`《…》`）とルビの始まり（`｜`）を取り除く
 *
 * 取り除いた後に記法が残っていたら例外を投げる。
 */
export function convertAozora(body: string, table: Readonly<Record<string, string>> = GAIJI_TABLE): AozoraConversion {
  let gaijiConverted = 0;
  let gaijiRemoved = 0;
  let text = body.replace(GAIJI_ANY, (note) => {
    const key = /(\d+-\d+-\d+)］$/.exec(note)?.[1];
    const char = key === undefined ? undefined : table[key];
    if (char === undefined) {
      gaijiRemoved++;
      return '';
    }
    gaijiConverted++;
    return char;
  });
  let headingLinesRemoved = 0;
  text = text.replace(HEADING_LINE, () => {
    headingLinesRemoved++;
    return '';
  });
  text = text.replace(NOTE, '');
  text = text.replace(ACCENT_BRACKET, (_match, inner: string) => decodeAccentSeparation(inner));
  text = text.replace(RUBY, '').replaceAll('｜', '');
  assertNoMarkup(text);
  return { text, gaijiConverted, gaijiRemoved, headingLinesRemoved };
}

const RESIDUE = ['［＃', '※［', '《', '｜', '〔'];

/** 取り除いたはずの記法が残っていたら例外を投げる。 */
export function assertNoMarkup(text: string): void {
  for (const mark of RESIDUE) {
    const index = text.indexOf(mark);
    if (index !== -1) throw new Error(`記法 ${mark} が残っている: …${text.slice(Math.max(0, index - 20), index + 30)}…`);
  }
}

/**
 * 変換前の本文から、第一章（先頭から二つ目の章見出しの行の手前まで）を返す。
 * `convertAozora` が章見出しの行を取り除くので、章の境目は変換の前に見出しの行で決める。
 */
export function firstChapterOf(body: string): string {
  const second = [...body.matchAll(HEADING_LINE)][1];
  if (second === undefined) throw new Error('二つ目の章見出しが見つからない');
  return body.slice(0, second.index);
}

/**
 * 本文の先頭から、空白を除いた字数が `target` に最も近い文末（`。`）までを返す。
 * 文や語の途中で切ると、打鍵の列の終わりが半端になるので、文末で切る。
 * 字数は評価に渡す前処理と同じく、空白を除いて数える。同じ近さの文末が2つあれば短い方を取る。
 */
export function excerptBySentence(text: string, target: number): string {
  let count = 0;
  let best: { end: number; distance: number } | undefined;
  const chars = [...text];
  let offset = 0;
  for (const char of chars) {
    offset += char.length;
    if (!/\s/.test(char)) count++;
    if (char !== '。') continue;
    const distance = Math.abs(count - target);
    if (best === undefined || distance < best.distance) best = { end: offset, distance };
  }
  if (best === undefined) throw new Error('文末が見つからない');
  return text.slice(0, best.end).trim();
}
