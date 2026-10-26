import { FINGERS, type NonThumb } from '../shapes/geometry.ts';
import type { KanaLayoutContent } from './kana-face-layout-file.ts';
import {
  buildFaceLayout,
  duplicateOutputNotices,
  FaceLayoutBuildError,
  gridPositionOf,
  readFaceBody,
  type FaceLayoutNotice,
  type FaceLayoutProblem,
  type UserFace,
} from './kana-face-layout.ts';
import { uncoveredKana } from './kana-coverage.ts';
import type { FaceMode, InputRole, LayerKind, TriggerOrder, TriggerPersistence } from './types.ts';
import { isFaceUserLayout, type FaceUserLayout, type UserLayout } from './user-layouts.ts';
import { NAME_REQUIRED_MESSAGE, type UserLayoutEditResult } from './layout-edit.ts';

/**
 * 面で定義する自作のかな配列を作る・直す操作の純関数。
 *
 * 画面は入力の途中の値（順序や持続をまだ選んでいない面など）を持つので、書きかけを許す下書きの形を持つ。
 * 下書きを保存できるかは、JSONの貼り付けと同じ読み込み（`readFaceBody`）と組み立て（`buildFaceLayout`）で決める。
 * 画面が独自の検査を持つと、貼り付けた時と画面で作った時で通る定義が食い違う。
 */

/** 書きかけの面。`UserFace` のうち、利用者がまだ選んでいない項目を `undefined` で持てる。 */
export interface DraftFace {
  trigger: string[];
  mode?: FaceMode | undefined;
  triggerPersistence?: TriggerPersistence | undefined;
  inputRole?: InputRole | undefined;
  compositionAggregation?: LayerKind | undefined;
  triggerOrder?: TriggerOrder | undefined;
  layer?: string | undefined;
  modifierGroups?: Record<string, string> | undefined;
  outputs: Record<string, string>;
}

/** 画面の入力欄の値。ホームキーは空文字で「指定しない」を持てる。 */
export interface FaceLayoutDraft {
  name: string;
  faces: DraftFace[];
  composition: { dakuten: boolean; handakuten: boolean };
  homeKeys: Partial<Record<NonThumb, string>>;
}

/** 新しい配列の下書き。単打の面を1つ持つ。入力の意味は見えて変えられる既定として「レイヤー」から始める。 */
export const blankFaceLayoutDraft = (): FaceLayoutDraft => ({
  name: '',
  faces: [blankFace()],
  composition: { dakuten: false, handakuten: false },
  homeKeys: {},
});

/** 新しい面。triggerを持たない単打の面から始める。 */
export const blankFace = (): DraftFace => ({ trigger: [], inputRole: 'layer', outputs: {} });

/** 保存してある中身から下書きを作る。 */
export function draftOf(content: KanaLayoutContent): FaceLayoutDraft {
  return {
    name: content.name,
    faces: structuredClone(content.faces) as DraftFace[],
    composition: { ...content.composition },
    homeKeys: { ...content.homeKeys },
  };
}

/** 保存してある面で定義する配列から、保存する中身を取り出す。 */
export function contentOfFaceLayout(layout: FaceUserLayout): KanaLayoutContent {
  return {
    name: layout.name,
    faces: structuredClone(layout.faces),
    composition: { ...layout.composition },
    ...(layout.homeKeys === undefined || Object.keys(layout.homeKeys).length === 0 ? {} : { homeKeys: { ...layout.homeKeys } }),
  };
}

/** 下書きの検査結果。 */
export interface FaceLayoutCheck {
  /** 保存を止める誤り。空なら保存できる */
  readonly problems: readonly FaceLayoutProblem[];
  /** 保存を止めない注意（同じかなが2か所以上にある旨） */
  readonly notices: readonly FaceLayoutNotice[];
  /** 打てない対象のかな。誤りがあって配列を組めない間は `undefined` */
  readonly uncovered: readonly string[] | undefined;
  /** 誤りが無い時の、保存する中身 */
  readonly content: KanaLayoutContent | undefined;
}

/** 面の下書きの、未選択の項目を持たない形（`undefined` の項目を落とす）。 */
function compactFace(face: DraftFace): Record<string, unknown> {
  return Object.fromEntries(Object.entries(face).filter(([, value]) => value !== undefined));
}

/** 空のホームキーを落とす。 */
function compactHomeKeys(homeKeys: Readonly<Partial<Record<NonThumb, string>>>): Partial<Record<NonThumb, string>> {
  const result: Partial<Record<NonThumb, string>> = {};
  for (const finger of FINGERS) {
    const key = homeKeys[finger];
    if (key !== undefined && key !== '') result[finger] = key;
  }
  return result;
}

/**
 * 下書きを検査する。誤りは全部集めて返す。誤りが無ければ配列として組めることまで確かめ、
 * 打てないかなと、同じかなが2か所以上にある旨を添える。
 */
export function checkFaceLayout(draft: FaceLayoutDraft): FaceLayoutCheck {
  const problems: FaceLayoutProblem[] = [];
  const name = draft.name.trim();
  if (name === '') problems.push({ path: 'name', message: NAME_REQUIRED_MESSAGE });
  const homeKeys = compactHomeKeys(draft.homeKeys);
  for (const [finger, key] of Object.entries(homeKeys)) {
    if (gridPositionOf(key) === undefined) {
      problems.push({ path: `homeKeys.${finger}`, message: `ホームキーのキー ${JSON.stringify(key)} は、物理キーの名前ではありません` });
    }
  }

  const { body, problems: bodyProblems } = readFaceBody({ faces: draft.faces.map(compactFace), composition: draft.composition });
  problems.push(...bodyProblems);
  if (body === undefined) return { problems, notices: [], uncovered: undefined, content: undefined };

  const content: KanaLayoutContent = { name, ...body, ...(Object.keys(homeKeys).length === 0 ? {} : { homeKeys }) };
  let uncovered: readonly string[] | undefined;
  try {
    uncovered = uncoveredKana(buildFaceLayout('check', name === '' ? '名前なし' : name, content));
  } catch (error) {
    if (!(error instanceof FaceLayoutBuildError)) throw error;
    problems.push(...error.problems);
  }
  return {
    problems,
    notices: duplicateOutputNotices(body),
    uncovered,
    content: problems.length === 0 ? content : undefined,
  };
}

/** 保存する定義にする。キーの並びを固定して、同じ中身が同じ文字列になるようにする。 */
function definitionOf(id: string, content: KanaLayoutContent): FaceUserLayout {
  return {
    id,
    name: content.name,
    ...(content.homeKeys === undefined || Object.keys(content.homeKeys).length === 0 ? {} : { homeKeys: { ...content.homeKeys } }),
    faces: structuredClone(content.faces) as UserFace[],
    composition: { ...content.composition },
  };
}

/** 保存の入口の検査。画面が検査を通した値でも、コマンドが直接呼ばれても同じ基準で守る。 */
function blockingReason(content: KanaLayoutContent): string | undefined {
  const { problems } = checkFaceLayout(draftOf(content));
  return problems.length === 0 ? undefined : problems.map((problem) => problem.message).join('、');
}

/** 面で定義する配列の新規作成。保存できない誤りがあれば何もせず理由を返す。 */
export function createUserFaceLayout(layouts: readonly UserLayout[], generateId: () => string, content: KanaLayoutContent): UserLayoutEditResult {
  const reason = blockingReason(content);
  if (reason !== undefined) return { ok: false, reason };
  return { ok: true, layouts: [...layouts, definitionOf(generateId(), content)] };
}

/**
 * 面で定義する配列の中身の書き換え。idは変えない。対象が無い、または中身が変わらない時は同じ参照を返す。
 * 面で定義する配列でない対象と、保存できない誤りのある入力は理由を返す。
 */
export function updateUserFaceLayout(layouts: readonly UserLayout[], id: string, content: KanaLayoutContent): UserLayoutEditResult {
  const target = layouts.find((layout) => layout.id === id);
  if (target === undefined) return { ok: true, layouts };
  if (!isFaceUserLayout(target)) return { ok: false, reason: '面で定義する配列ではないため、この画面では直せません' };
  const reason = blockingReason(content);
  if (reason !== undefined) return { ok: false, reason };
  const next = definitionOf(id, content);
  // 保存済みの定義と同じ並びにそろえて比べる（項目の並びの違いだけで書き換えにしない）
  if (JSON.stringify(next) === JSON.stringify(definitionOf(id, contentOfFaceLayout(target)))) return { ok: true, layouts };
  return { ok: true, layouts: layouts.map((layout) => (layout.id === id ? next : layout)) };
}
