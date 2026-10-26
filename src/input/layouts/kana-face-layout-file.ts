import { isRecord } from '../codec/index.ts';
import { FINGERS, type NonThumb } from '../shapes/geometry.ts';
import {
  buildFaceLayout,
  duplicateOutputNotices,
  FACE_BODY_PROPERTIES,
  FaceLayoutBuildError,
  gridPositionOf,
  readFaceBody,
  type FaceLayoutNotice,
  type FaceLayoutProblem,
  type UserFaceBody,
} from './kana-face-layout.ts';

/**
 * 面で定義するかな配列を貼り付ける・書き出すJSON。
 *
 * 外殻は自作の資産の書き出しファイルと同じく `format` の印と `version` を持ち、中身は `UserLayout` の面の形
 * （`faces` と `composition`）と同じ。ほかに配列の名前（`name`）と、任意でホームキー（`homeKeys`）を持つ。
 * `id` は持たない（貼り付けた側が付ける）。
 */

export const KANA_LAYOUT_FILE_FORMAT = 'keydist-kana-layout';
export const KANA_LAYOUT_FILE_VERSION = 1;

/** 読み込んだ配列の中身（idを除く）。 */
export interface KanaLayoutContent extends UserFaceBody {
  name: string;
  homeKeys?: Partial<Record<NonThumb, string>>;
}

export type KanaLayoutFileReadResult =
  | { readonly ok: true; readonly layout: KanaLayoutContent; readonly notices: readonly FaceLayoutNotice[] }
  | { readonly ok: false; readonly problems: readonly FaceLayoutProblem[] };

const FILE_PROPERTIES: ReadonlySet<string> = new Set(['format', 'version', 'name', 'homeKeys', ...FACE_BODY_PROPERTIES]);

const fail = (...problems: FaceLayoutProblem[]): KanaLayoutFileReadResult => ({ ok: false, problems });

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
    } else if (typeof key !== 'string' || gridPositionOf(key) === undefined) {
      problems.push({ path, message: `ホームキーのキー ${JSON.stringify(key) ?? String(key)} は、物理キーの名前ではありません` });
    } else {
      homeKeys[finger as NonThumb] = key;
    }
  }
  return problems.length > before ? undefined : homeKeys;
}

/**
 * 貼り付けたJSONを読む。誤りは、どの定義のどこかを示す位置（`faces[2].outputs.q` など）付きで全部返す。
 * 読めた時は、同じかなが2か所以上にある旨（誤りではない）を注意として返す。
 */
export function parseKanaLayoutFile(text: string): KanaLayoutFileReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail({ path: '', message: `JSONとして読めません（${error instanceof Error ? error.message : String(error)}）` });
  }
  if (!isRecord(parsed) || parsed.format !== KANA_LAYOUT_FILE_FORMAT) {
    const format = isRecord(parsed) ? parsed.format : undefined;
    return fail({
      path: 'format',
      message: `keydistのかな配列の定義ではありません。formatを「${KANA_LAYOUT_FILE_FORMAT}」にしてください（${JSON.stringify(format) ?? 'なし'}）`,
    });
  }
  if (parsed.version === undefined) return fail({ path: 'version', message: '版（version）がありません' });
  if (typeof parsed.version !== 'number' || !Number.isInteger(parsed.version) || parsed.version < 1) {
    return fail({ path: 'version', message: `版（version）は1以上の整数で書いてください（${JSON.stringify(parsed.version)}）` });
  }
  if (parsed.version > KANA_LAYOUT_FILE_VERSION) {
    return fail({
      path: 'version',
      message: `新しい形式の定義です。keydistを更新してから貼り付けてください（版 ${parsed.version}、対応は版 ${KANA_LAYOUT_FILE_VERSION}）`,
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

  const layout: KanaLayoutContent = {
    name: (parsed.name as string).trim(),
    ...body,
    ...(homeKeys === undefined || Object.keys(homeKeys).length === 0 ? {} : { homeKeys }),
  };
  // 面の組み合わせが配列として組めるか。組めない時は、組めなくなった面を位置で返す
  try {
    buildFaceLayout('check', layout.name, layout);
  } catch (error) {
    if (error instanceof FaceLayoutBuildError) return { ok: false, problems: error.problems };
    throw error;
  }
  return { ok: true, layout, notices: duplicateOutputNotices(layout) };
}

/** 書き出すJSONの本体。 */
export function kanaLayoutFileBody(layout: KanaLayoutContent): Record<string, unknown> {
  return {
    format: KANA_LAYOUT_FILE_FORMAT,
    version: KANA_LAYOUT_FILE_VERSION,
    name: layout.name,
    faces: structuredClone(layout.faces),
    composition: { ...layout.composition },
    ...(layout.homeKeys === undefined ? {} : { homeKeys: { ...layout.homeKeys } }),
  };
}

/** 書き出すJSONの文字列。 */
export const kanaLayoutFileText = (layout: KanaLayoutContent): string => `${JSON.stringify(kanaLayoutFileBody(layout), null, 2)}\n`;
