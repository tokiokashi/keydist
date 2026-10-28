import { QWERTY_LEGEND } from '../shapes/geometry.ts';
import { physicalKeyDisplayLabel } from '../shapes/key-labels.ts';
import { readFaceBody, type UserFace } from './kana-face-layout.ts';
import type { KanaLayoutContent } from './kana-face-layout-file.ts';
import type { FaceMode, Sequence } from './types.ts';

/** 定義ファイルの面1つの中身。形式ごとの読み取りが作り、段の形と面の形の両方の入力になる。 */
export interface ParsedFace {
  /** 注意の文に出す、元の定義での面の名前（見出し・セクション名） */
  heading: string;
  /** triggerの物理キー。空なら見出しの無い面（シフト無しの面） */
  trigger: string[];
  /** 切り替えのキーと出力のキーの打鍵の順序。省略すると同時 */
  mode?: FaceMode;
  /** 切り替えが2打以上など、かなの面の形（切り替えの後に1打だけ続く形か、同時押し）で表せない */
  kanaUnrepresentable?: boolean;
  /** 段の形の打鍵列の作り方。省略すると、triggerとセルのキーの1回の同時押し */
  stroke?: FaceStroke;
  cells: ParsedCell[];
  /** セルの表示が機能キーを含むか（段の形の凡例に使う） */
  isFunctionLabel: (label: string) => boolean;
}

/** 切り替えの打鍵の列と、セルのキーの置き方。 */
export interface FaceStroke {
  /** 切り替えの打鍵の列。1つの打鍵は同時に押すキーの組 */
  steps: string[][];
  /** `with-last` は最後の打鍵にセルのキーを加える。`after`・`before` はセルのキーを別の打鍵として後・前に置く */
  cell: 'with-last' | 'after' | 'before';
}

/** 面の1つのセルを打つ打鍵列。 */
export function faceSequence(face: ParsedFace, physical: string): Sequence {
  if (face.stroke === undefined) return [face.trigger.concat(physical)];
  const { steps, cell } = face.stroke;
  if (steps.length === 0) return [[physical]];
  if (cell === 'with-last') return [...steps.slice(0, -1), [...steps[steps.length - 1], physical]];
  return cell === 'before' ? [[physical], ...steps] : [...steps, [physical]];
}

export interface ParsedCell {
  row: number;
  column: number;
  /** 正規化済みの出力。機能キーだけのセルなど、出力が無いセルは空 */
  output: string | undefined;
  label: string;
}

/** 出力として置けるセルの値。 */
export function printableOutput(value: string | undefined): string | undefined {
  if (value === undefined || value === '' || value === '@@@' || value === '無') return undefined;
  return value;
}

/** 面の形の配列を作る時に決める値。取り込んだ後の画面で利用者が変えられる。打鍵の順序は見出しから読む。 */
const FACE_DEFAULTS = {
  triggerPersistence: 'single',
  inputRole: 'layer',
} as const;

/** 取り込める出力が1つも無い時の理由 */
export const NO_OUTPUT_MESSAGE = '配列表から出力を見つけられませんでした';

/** かなの配列が1回の入力で出す、かな1字ずつの並び。ひらがな（小書きを含む）・長音・句読点と、ヴの音を表す片仮名。 */
const KANA_SYLLABLES = /^[\u3041-\u3096\u309d\u309eー、。,.ヴァィゥェォャュョ]+$/u;

/**
 * 語の登録として置かれたセルか。出力が2文字以上で、かなの並び（`KANA_SYLLABLES`）ではなく、文字（記号以外）を含むもの。
 * 括弧の対（`「」`）のような記号だけの出力は、語ではなく記号の入力なので含めない。
 */
export function isWordRegistration(output: string): boolean {
  return [...output].length >= 2 && !KANA_SYLLABLES.test(output) && /\p{L}/u.test(output);
}

const keyName = (key: string): string => physicalKeyDisplayLabel(key);

/**
 * かなを直接打つ定義を、面の形の中身にする。
 * 同じtriggerのキーの集合の面は1つにまとめ、同じ出力が複数の面にあれば全部の置き場を残す。
 * 面の形で表せないセルは取り込まず、`warnings` に積む。
 */
export function buildKanaContent(faces: readonly ParsedFace[], name: string, warnings: string[]): KanaLayoutContent {
  const groups = new Map<string, { trigger: string[]; mode: FaceMode; headings: string[]; outputs: Record<string, string> }>();
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  for (const face of faces) {
    if (face.kanaUnrepresentable === true) {
      warn(`面「${face.heading}」は、切り替えのキーを順に2回以上打つ面など、かなの面の形で表せないため取り込みませんでした`);
      continue;
    }
    const mode = face.mode ?? 'simultaneous';
    // 切り替えのキーの集合と打鍵の順序が同じ面を、同じ面とみなす
    const identity = `${[...face.trigger].sort().join('+')}|${face.trigger.length === 0 ? '' : mode}`;
    let group = groups.get(identity);
    if (group === undefined) {
      group = { trigger: face.trigger, mode, headings: [], outputs: {} };
      groups.set(identity, group);
    }
    group.headings.push(face.heading);
    for (const cell of face.cells) {
      const output = printableOutput(cell.output);
      const key = QWERTY_LEGEND[cell.row]?.[cell.column];
      if (output === undefined || key === undefined) continue;
      const where = `面「${face.heading}」の${keyName(key)}のキー`;
      if (isWordRegistration(output)) {
        warn(`${where}の「${output}」は、ひらがな1字ずつの出力ではない語の登録のため取り込みませんでした`);
        continue;
      }
      if (face.trigger.includes(key)) {
        warnings.push(`${where}の「${output}」は、切り替えのキー自身の位置にあるため取り込みませんでした`);
        continue;
      }
      const placed = group.outputs[key];
      if (placed !== undefined) {
        if (placed !== output) {
          warnings.push(`${where}の「${output}」は、同じ切り替えのキーの面で先にある「${placed}」と重なるため取り込みませんでした`);
        }
        continue;
      }
      group.outputs[key] = output;
    }
  }

  const userFaces: UserFace[] = [];
  for (const group of groups.values()) {
    if (Object.keys(group.outputs).length === 0) {
      warnings.push(`面「${group.headings.join('」「')}」に取り込めるセルがないため取り込みませんでした`);
      continue;
    }
    userFaces.push(
      group.trigger.length === 0
        ? { trigger: [], inputRole: FACE_DEFAULTS.inputRole, outputs: group.outputs }
        : { trigger: group.trigger, mode: group.mode, ...FACE_DEFAULTS, outputs: group.outputs },
    );
  }
  if (userFaces.length === 0) throw new Error(NO_OUTPUT_MESSAGE);

  const { body, problems } = readFaceBody({ kind: 'kana', faces: userFaces, composition: { dakuten: false, handakuten: false } });
  if (body === undefined || body.kind !== 'kana') throw new Error(`面の形にできませんでした。${problems.map((problem) => problem.message).join('、')}`);
  return { name, ...body };
}
