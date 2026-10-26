import { QWERTY_LEGEND } from '../shapes/geometry.ts';
import { physicalKeyDisplayLabel } from '../shapes/key-labels.ts';
import { readFaceBody, type UserFace } from './kana-face-layout.ts';
import type { KanaLayoutContent } from './kana-face-layout-file.ts';

/** 定義ファイルの面1つの中身。形式ごとの読み取りが作り、段の形と面の形の両方の入力になる。 */
export interface ParsedFace {
  /** 注意の文に出す、元の定義での面の名前（見出し・セクション名） */
  heading: string;
  /** triggerの物理キー。空なら見出しの無い面（シフト無しの面） */
  trigger: string[];
  cells: ParsedCell[];
  /** セルの表示が機能キーを含むか（段の形の凡例に使う） */
  isFunctionLabel: (label: string) => boolean;
  /** ハイフン区切りの見出し（`-f-j[`）の面か。同時に押す面か順に押す面かを見出しの形から決められない */
  dashHeading?: boolean;
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

/** 面の形の配列を作る時に決める値。取り込んだ後の画面で利用者が変えられる。 */
const FACE_DEFAULTS = {
  mode: 'simultaneous',
  triggerPersistence: 'single',
  inputRole: 'layer',
} as const;

/** 取り込める出力が1つも無い時の理由 */
export const NO_OUTPUT_MESSAGE = '配列表から出力を見つけられませんでした';

const keyName = (key: string): string => physicalKeyDisplayLabel(key);

/**
 * かなを直接打つ定義を、面の形の中身にする。
 * 同じtriggerのキーの集合の面は1つにまとめ、同じ出力が複数の面にあれば全部の置き場を残す。
 * 面の形で表せないセルは取り込まず、`warnings` に積む。
 */
export function buildKanaContent(faces: readonly ParsedFace[], name: string, warnings: string[]): KanaLayoutContent {
  const groups = new Map<string, { trigger: string[]; headings: string[]; outputs: Record<string, string> }>();
  for (const face of faces) {
    if (face.dashHeading === true) {
      warnings.push(`面「${face.heading}」は、同時に押す面か順に押す面かを判定できないため取り込みませんでした`);
      continue;
    }
    const identity = [...face.trigger].sort().join('+');
    let group = groups.get(identity);
    if (group === undefined) {
      group = { trigger: face.trigger, headings: [], outputs: {} };
      groups.set(identity, group);
    }
    group.headings.push(face.heading);
    for (const cell of face.cells) {
      const output = printableOutput(cell.output);
      const key = QWERTY_LEGEND[cell.row]?.[cell.column];
      if (output === undefined || key === undefined) continue;
      const where = `面「${face.heading}」の${keyName(key)}のキー`;
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
        : { trigger: group.trigger, ...FACE_DEFAULTS, outputs: group.outputs },
    );
  }
  if (userFaces.length === 0) throw new Error(NO_OUTPUT_MESSAGE);

  const { body, problems } = readFaceBody({ faces: userFaces, composition: { dakuten: false, handakuten: false } });
  if (body === undefined) throw new Error(`面の形にできませんでした。${problems.map((problem) => problem.message).join('、')}`);
  return { name, ...body };
}
