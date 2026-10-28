import { isRecord } from '../codec/index.ts';
import { FINGERS, type NonThumb } from '../shapes/geometry.ts';
import {
  duplicateOutputNotices,
  FACE_BODY_PROPERTIES,
  isFaceOutputKey,
  readFaceBody,
  type AlphaFaceBody,
  type FaceLayoutNotice,
  type FaceLayoutProblem,
  type KanaFaceBody,
  type UserFaceBody,
} from './kana-face-layout.ts';
import { checkFaceLayout, draftOf } from './face-layout-edit.ts';
import type { LayoutKind } from './kind.ts';

/**
 * 面で定義する配列を貼り付ける・書き出すJSON。
 *
 * 外殻は自作の資産の書き出しファイルと同じく `format` の印と `version` を持ち、中身は `UserLayout` の面の形
 * （`kind`・`faces` と、種類ごとの `composition`（かなの種類）・`romaji`（英字の種類））と同じ。
 * ほかに配列の名前（`name`）と、任意でホームキー（`homeKeys`）を持つ。
 * `id` は持たない（貼り付けた側が付ける）。
 * 貼り付けは画面の種類（かな配列の画面ならかな、ローマ字配列の画面なら英字）の定義だけを受け、
 * 違う種類の定義は、どちらの画面で開けるかを添えて取り込まない。
 */

export const FACE_LAYOUT_FILE_FORMAT = 'keydist-face-layout';
export const FACE_LAYOUT_FILE_VERSION = 1;

interface LayoutContentCommon {
  name: string;
  homeKeys?: Partial<Record<NonThumb, string>>;
}

/** 面の形の配列の中身（idを除く）。種類はかなでも英字でもよい。作成・更新のコマンドが受ける形。 */
export type FaceLayoutContent = LayoutContentCommon & UserFaceBody;

/** かなの種類の面の形の中身（idを除く）。 */
export type KanaLayoutContent = LayoutContentCommon & KanaFaceBody;

/** 英字の種類の面の形の中身（idを除く）。 */
export type AlphaLayoutContent = LayoutContentCommon & AlphaFaceBody;

export type FaceLayoutFileReadResult =
  | { readonly ok: true; readonly layout: FaceLayoutContent; readonly notices: readonly FaceLayoutNotice[] }
  | { readonly ok: false; readonly problems: readonly FaceLayoutProblem[] };

const FILE_PROPERTIES: ReadonlySet<string> = new Set(['format', 'version', 'name', 'homeKeys', 'kind', 'romaji', ...FACE_BODY_PROPERTIES]);

const fail = (...problems: FaceLayoutProblem[]): FaceLayoutFileReadResult => ({ ok: false, problems });

/** 画面の種類ごとの、その種類の定義を開く画面の名前。 */
const SCREEN_OF_KIND: Readonly<Record<LayoutKind, string>> = { kana: 'かな配列', alpha: 'ローマ字配列' };
const KIND_NAME: Readonly<Record<LayoutKind, string>> = { kana: 'かな', alpha: '英字' };

function readHomeKeys(raw: unknown, problems: FaceLayoutProblem[]): Partial<Record<NonThumb, string>> | undefined {
  if (!isRecord(raw)) {
    problems.push({ path: 'homeKeys', message: 'ホームキー（homeKeys）を、指の名前 → キーのオブジェクトで書いてください' });
    return undefined;
  }
  const homeKeys: Partial<Record<NonThumb, string>> = {};
  const before = problems.length;
  for (const [finger, key] of Object.entries(raw)) {
    const path = `homeKeys.${finger}`;
    if (!(FINGERS as readonly string[]).includes(finger)) {
      problems.push({ path, message: `ホームキーの指の名前「${finger}」は、${FINGERS.join('・')} のどれかで書いてください` });
    } else if (typeof key !== 'string' || !isFaceOutputKey(key)) {
      problems.push({ path, message: `ホームキーのキー ${JSON.stringify(key) ?? String(key)} は、物理キーの名前ではありません` });
    } else {
      homeKeys[finger as NonThumb] = key;
    }
  }
  return problems.length > before ? undefined : homeKeys;
}

/**
 * 貼り付けたJSONを、`expected` の種類の定義として読む。誤りは、どの定義のどこかを示す位置（`faces[2].outputs.q` など）付きで全部返す。
 * 違う種類の定義は、読まずに、どちらの画面で開けるかを返す。
 * 読めた時は、同じ出力が2か所以上にある旨（誤りではない）を注意として返す。
 */
export function parseFaceLayoutFile(text: string, expected: LayoutKind): FaceLayoutFileReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail({
      path: '',
      message: 'JSONとして読めません。括弧や引用符、カンマを確かめてください',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed) || parsed.format !== FACE_LAYOUT_FILE_FORMAT) {
    const format = isRecord(parsed) ? parsed.format : undefined;
    return fail({
      path: 'format',
      message: `keydistの面で定義する配列ではありません。formatを「${FACE_LAYOUT_FILE_FORMAT}」にしてください（${JSON.stringify(format) ?? 'なし'}）`,
    });
  }
  if (parsed.version === undefined) return fail({ path: 'version', message: '版（version）がありません' });
  if (typeof parsed.version !== 'number' || !Number.isInteger(parsed.version) || parsed.version < 1) {
    return fail({ path: 'version', message: `版（version）は1以上の整数で書いてください（${JSON.stringify(parsed.version)}）` });
  }
  if (parsed.version > FACE_LAYOUT_FILE_VERSION) {
    return fail({
      path: 'version',
      message: `新しい形式の定義です。keydistを更新してから貼り付けてください（版 ${parsed.version}、対応は版 ${FACE_LAYOUT_FILE_VERSION}）`,
    });
  }
  if ((parsed.kind === 'kana' || parsed.kind === 'alpha') && parsed.kind !== expected) {
    return fail({
      path: 'kind',
      message: `${KIND_NAME[parsed.kind]}の配列の定義です。${SCREEN_OF_KIND[parsed.kind]}の画面で貼り付けてください`,
    });
  }

  const problems: FaceLayoutProblem[] = [];
  for (const name of Object.keys(parsed)) {
    if (!FILE_PROPERTIES.has(name)) problems.push({ path: name, message: `知らない項目「${name}」があります` });
  }
  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    problems.push({ path: 'name', message: '配列の名前（name）を、空でない文字列で書いてください' });
  }
  const homeKeys = parsed.homeKeys === undefined ? undefined : readHomeKeys(parsed.homeKeys, problems);
  const { body, problems: bodyProblems } = readFaceBody(parsed);
  problems.push(...bodyProblems);
  if (problems.length > 0 || body === undefined) return { ok: false, problems };

  const layout: FaceLayoutContent = {
    name: (parsed.name as string).trim(),
    ...body,
    ...(homeKeys === undefined || Object.keys(homeKeys).length === 0 ? {} : { homeKeys }),
  };
  // 面の組み合わせが配列として組めるか。組めない時は、組めなくなった面を位置で返す
  const check = checkFaceLayout(draftOf(layout));
  if (check.problems.length > 0) return { ok: false, problems: check.problems };
  return { ok: true, layout, notices: duplicateOutputNotices(layout) };
}

/** 書き出すJSONの本体。種類ごとに、持てる項目（かなは `composition`、英字は `romaji`）だけを書く。 */
export function faceLayoutFileBody(layout: FaceLayoutContent): Record<string, unknown> {
  return {
    format: FACE_LAYOUT_FILE_FORMAT,
    version: FACE_LAYOUT_FILE_VERSION,
    name: layout.name,
    kind: layout.kind,
    faces: structuredClone(layout.faces),
    ...(layout.kind === 'kana' ? { composition: { ...layout.composition } } : layout.romaji === undefined ? {} : { romaji: layout.romaji }),
    ...(layout.homeKeys === undefined ? {} : { homeKeys: { ...layout.homeKeys } }),
  };
}

/** 書き出すJSONの文字列。 */
export const faceLayoutFileText = (layout: FaceLayoutContent): string => `${JSON.stringify(faceLayoutFileBody(layout), null, 2)}\n`;
