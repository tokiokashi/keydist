import { isBuiltin } from '../romaji/rules.ts';
import { ActivationConflictError, type ActivationConflictSide } from '../semantics/index.ts';
import { FINGER_LABEL } from '../shapes/finger-names.ts';
import { physicalKeyDisplayLabel } from '../shapes/key-labels.ts';
import { assignmentHasKey, FINGERS, homeKeyOverrideApplies, keyId, QWERTY_LEGEND, type FingerAssignment, type NonThumb } from '../shapes/geometry.ts';
import type { Sequence } from './types.ts';
import { isFaceUserLayout, ROW_LABELS, ROW_LIMITS, toLayout, validate, type StageUserLayout, type UserLayout } from './user-layouts.ts';

/**
 * 自作の配列（段の文字で表せるもの）を作る・直す操作の純関数。
 * 書き込みの規約は`input/romaji/rule-edit.ts`と同じで、変化が無ければ同一の配列参照を返す。
 * コマンド層（`engine/commands.ts`）はこの参照の一致でno-opを判定する。
 */

export const USER_LAYOUT_ID_PREFIX = 'user-';

/** 名前が空の時の誤りの文。段の配列と面の配列の画面で同じ文を出す。 */
export const NAME_REQUIRED_MESSAGE = '名前を入力してください';

export const newUserLayoutId = (): string => `${USER_LAYOUT_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 配列の中身（idを除く）。画面の入力欄がそのまま持つ形。 */
export interface UserLayoutContent {
  readonly name: string;
  /** 数字段・上段・ホーム段・下段。数字段は空文字でもよい */
  readonly rows: readonly [string, string, string, string];
  /** 推奨のローマ字規則。省略した配列は推奨を持たず、全体の値の規則で打つ */
  readonly romaji?: string;
  /** 指ごとの任意のホームキー。値は物理キーのid。空文字は未指定 */
  readonly homeKeys: Readonly<Partial<Record<NonThumb, string>>>;
  /**
   * 取り込み形式が持つ、段の文字では表せない出力（同時押しなど）。この項目か `legends` を持つ配列は取り込み形式の配列で、
   * 段の文字・この項目・`legends` は画面で直さず、保存し直しても元の値のまま残す
   */
  readonly sequences?: readonly (readonly [string, Sequence])[];
  /** 取り込み形式が持つ、keyId → 取り込み元の表示ラベル */
  readonly legends?: readonly (readonly [string, string])[];
}

/** 取り込み形式の配列か。段の文字・同時押しの出力・表示ラベルを読み取り専用にする配列。 */
export const isImportedContent = (content: { readonly sequences?: unknown; readonly legends?: unknown }): boolean =>
  content.sequences !== undefined || content.legends !== undefined;

/**
 * 段の形の配列か。段の文字を受ける作成・更新（`createUserLayout`・`updateUserLayout`）の対象で、
 * 面で定義する配列は段を持たないので扱わない（面の形は `face-layout-edit.ts` の作成・更新が受け持つ）。
 * 取り込み形式の配列は、名前・ローマ字規則・ホームキーだけを直せ、段の文字・`sequences`・`legends` は元の値のまま残す。
 */
export const isStageUserLayout = (layout: UserLayout): layout is StageUserLayout => !isFaceUserLayout(layout);

/** 同時押しや複数の打鍵になる出力の数。1キーの単打は数えない。 */
export const chordOutputCount = (sequences: readonly (readonly [string, Sequence])[]): number =>
  sequences.filter(([, sequence]) => sequence.length > 1 || sequence.some((step) => step.length > 1)).length;

/** 配列の定義から画面の入力欄の値を作る。 */
export function contentOf(layout: StageUserLayout): UserLayoutContent {
  return {
    name: layout.name,
    rows: [layout.rows[0], layout.rows[1], layout.rows[2], layout.rows[3]],
    ...(layout.romaji === undefined ? {} : { romaji: layout.romaji }),
    homeKeys: { ...layout.homeKeys },
    ...(layout.sequences === undefined ? {} : { sequences: layout.sequences }),
    ...(layout.legends === undefined ? {} : { legends: layout.legends }),
  };
}

/** 取り込んだ結果から、保存していない新しい配列の入力欄の値を作る。 */
export function contentOfImported(
  imported: {
    readonly name: string;
    readonly rows: UserLayoutContent['rows'];
    readonly sequences: NonNullable<UserLayoutContent['sequences']>;
    readonly legends: NonNullable<UserLayoutContent['legends']>;
  },
  romaji: string,
): UserLayoutContent {
  return { name: imported.name, rows: imported.rows, romaji, homeKeys: {}, sequences: imported.sequences, legends: imported.legends };
}

/**
 * 保存する形にそろえる。名前と段は前後の空白を落とし、空のホームキーは持たない。
 * 取り込み形式の配列の段は、空白が機能キーや未定義のキーの位置を表し、`sequences` が物理キーで指すので落とさない。
 */
export function normalizeContent(content: UserLayoutContent): UserLayoutContent {
  const homeKeys: Partial<Record<NonThumb, string>> = {};
  for (const finger of FINGERS) {
    const key = content.homeKeys[finger];
    if (key !== undefined && key !== '') homeKeys[finger] = key;
  }
  const rows: UserLayoutContent['rows'] = isImportedContent(content)
    ? content.rows
    : [content.rows[0].trim(), content.rows[1].trim(), content.rows[2].trim(), content.rows[3].trim()];
  return {
    name: content.name.trim(),
    rows,
    ...(content.romaji === undefined ? {} : { romaji: content.romaji }),
    homeKeys,
    ...(content.sequences === undefined ? {} : { sequences: content.sequences }),
    ...(content.legends === undefined ? {} : { legends: content.legends }),
  };
}

/** 問題の場所。画面はこれで、どの欄に出すかを決める。 */
export type LayoutProblemField =
  | { readonly kind: 'name' }
  | { readonly kind: 'row'; readonly index: number }
  /** 英字の段をまとめて指す */
  | { readonly kind: 'letter-rows' }
  | { readonly kind: 'home-key'; readonly finger: NonThumb }
  | { readonly kind: 'duplicate'; readonly char: string; readonly keyIds: readonly string[] }
  | { readonly kind: 'romaji' }
  | { readonly kind: 'build' };

export interface LayoutProblem {
  /** `error`は保存できない。`warning`は保存できる */
  readonly severity: 'error' | 'warning';
  readonly field: LayoutProblemField;
  readonly message: string;
}

/** 数字段が空ならQWERTYのものを使う（`toLayout`と同じ）。 */
const effectiveRows = (rows: readonly string[]): string[] => rows.map((row, index) => (row === '' ? QWERTY_LEGEND[index] : row));

/** 段に置いた文字と、それが載るキーのid・段。 */
export function placedKeys(rows: readonly string[]): { readonly char: string; readonly keyId: string; readonly row: number }[] {
  // 段の中の空白はキーを置かない（列の位置だけ進む）。`fromRows`と同じ
  return effectiveRows(rows).flatMap((row, rowIndex) =>
    [...row].flatMap((char, col) => (char === ' ' ? [] : [{ char, keyId: keyId(rowIndex, col), row: rowIndex }])),
  );
}

const romajiOf = (content: UserLayoutContent): { romaji?: string } => (content.romaji === undefined ? {} : { romaji: content.romaji });

function definitionOf(id: string, content: UserLayoutContent): StageUserLayout {
  const layout: StageUserLayout = {
    id,
    name: content.name,
    kind: 'alpha',
    rows: [content.rows[0], content.rows[1], content.rows[2], content.rows[3]],
    ...(content.romaji === undefined ? {} : { romaji: content.romaji }),
    ...(content.sequences === undefined ? {} : { sequences: content.sequences.map(([output, sequence]) => [output, sequence] as [string, Sequence]) }),
    ...(content.legends === undefined ? {} : { legends: content.legends.map(([key, label]) => [key, label] as [string, string]) }),
  };
  return Object.keys(content.homeKeys).length === 0 ? layout : { ...layout, homeKeys: { ...content.homeKeys } };
}

/**
 * 指のホームキーに選んだキーを、その指が担当しない割り当てがある時の注意文。無ければ`undefined`。
 * そのキーをどの指も担当しない割り当ては、物理配列の違いなので照合から外す。
 * ローマ字配列とかな配列の編集画面が同じ文面を出すために共有する。
 */
export function ignoredHomeKeyMessage(finger: NonThumb, key: string, fingerAssignments: readonly FingerAssignment[]): string | undefined {
  const ignoring = fingerAssignments.filter((assignment) => assignmentHasKey(assignment, key) && !homeKeyOverrideApplies(assignment, finger, key));
  if (ignoring.length === 0) return undefined;
  const names = ignoring.map((assignment) => `「${assignment.name}」`).join('');
  return `${FINGER_LABEL[finger]}のホームキー「${physicalKeyDisplayLabel(key)}」は、指の割り当て${names}では${FINGER_LABEL[finger]}の担当ではないため使われず、その割り当てのホームキーで測ります。${FINGER_LABEL[finger]}が担当するキーを選んでください`;
}

/** 指ごとのホームキーの指定のうち、ignoredHomeKeyMessageの注意が出るもの。空の指定は数えない。 */
export function ignoredHomeKeyWarnings(
  homeKeys: Readonly<Partial<Record<NonThumb, string>>>,
  fingerAssignments: readonly FingerAssignment[],
): readonly { readonly finger: NonThumb; readonly message: string }[] {
  return FINGERS.flatMap((finger) => {
    const key = homeKeys[finger];
    if (key === undefined || key === '') return [];
    const message = ignoredHomeKeyMessage(finger, key, fingerAssignments);
    return message === undefined ? [] : [{ finger, message }];
  });
}

/**
 * 入力の不備を調べる。`error`が1つでもあれば保存できない。
 * 同じ文字が複数のキーに載っているのは、配列のモデルが認めている置き方なので`warning`にとどめる。
 * `knownRomajiRuleIds`が渡された時は、選んだローマ字規則が無ければ`warning`で知らせる
 * （配列は全体の値の規則で打つので、保存はできる）。
 * `fingerAssignments`が渡された時は、ホームキーをその指が担当しない割り当てを`warning`で知らせる
 * （その割り当てでは指定が使われず、割り当て自身のホームキーで測る）。
 * そのキーをどの指も担当しない割り当ては、物理配列の違いなので照合から外す。
 */
export function layoutProblems(
  content: UserLayoutContent,
  knownRomajiRuleIds?: ReadonlySet<string>,
  fingerAssignments?: readonly FingerAssignment[],
): readonly LayoutProblem[] {
  const normalized = normalizeContent(content);
  const imported = isImportedContent(normalized);
  const problems: LayoutProblem[] = [];
  const rows = normalized.rows;

  if (normalized.name === '') {
    problems.push({ severity: 'error', field: { kind: 'name' }, message: NAME_REQUIRED_MESSAGE });
  }
  rows.forEach((row, index) => {
    const length = [...row].length;
    if (length > ROW_LIMITS[index]) {
      problems.push({
        severity: 'error',
        field: { kind: 'row', index },
        message: `${ROW_LABELS[index]}が${length}文字です。この物理配列には${ROW_LIMITS[index]}個までしか置けません`,
      });
    }
  });
  if (!imported && rows.slice(1).every((row) => row === '')) {
    problems.push({ severity: 'error', field: { kind: 'letter-rows' }, message: '上段・ホーム段・下段のどれかに文字を入力してください' });
  }

  const placed = new Set(placedKeys(rows).map((entry) => entry.keyId));
  for (const finger of FINGERS) {
    const key = normalized.homeKeys[finger];
    if (key !== undefined && !placed.has(key)) {
      problems.push({
        severity: 'error',
        field: { kind: 'home-key', finger },
        message: `${FINGER_LABEL[finger]}のホームキー「${physicalKeyDisplayLabel(key)}」は、段に無いキーです`,
      });
    } else if (key !== undefined && fingerAssignments !== undefined) {
      const message = ignoredHomeKeyMessage(finger, key, fingerAssignments);
      if (message !== undefined) problems.push({ severity: 'warning', field: { kind: 'home-key', finger }, message });
    }
  }

  // 配列として組み立てられるか。段の長さと空の段は上で伝えているので、その外の失敗だけを拾う
  if (problems.every((problem) => problem.severity !== 'error' || problem.field.kind === 'name')) {
    try {
      toLayout(definitionOf('check', normalized));
    } catch (cause) {
      problems.push({ severity: 'error', field: { kind: 'build' }, message: buildFailureMessage(cause) });
    }
  }

  // 取り込み形式の配列の段は直せないので、同じ文字の重なりは注意にしない
  const byChar = new Map<string, string[]>();
  for (const entry of imported ? [] : placedKeys(rows)) byChar.set(entry.char, [...(byChar.get(entry.char) ?? []), entry.keyId]);
  for (const [char, keyIds] of byChar) {
    if (keyIds.length < 2) continue;
    problems.push({
      severity: 'warning',
      field: { kind: 'duplicate', char, keyIds },
      message: `「${char}」が複数のキーに載っています（${keyIds.map((id) => physicalKeyDisplayLabel(id)).join('・')}）`,
    });
  }

  if (
    knownRomajiRuleIds !== undefined &&
    normalized.romaji !== undefined &&
    !isBuiltin(normalized.romaji) &&
    !knownRomajiRuleIds.has(normalized.romaji)
  ) {
    problems.push({
      severity: 'warning',
      field: { kind: 'romaji' },
      message: '選んでいたローマ字規則が見つかりません。全体の値の規則で打ちます。規則を選び直すと、その規則で打ちます',
    });
  }
  return problems;
}

const conflictSideText = (side: ActivationConflictSide): string =>
  `「${side.output}」の打鍵（${side.steps.map((keys) => keys.map((key) => physicalKeyDisplayLabel(key)).join('・')).join('→')}）`;

/** 配列を組み立てられなかった時の誤りの文。同時に成り立つ出力どうしの衝突は、出力と打鍵で示す。 */
export const buildFailureMessage = (cause: unknown): string => {
  if (cause instanceof ActivationConflictError) {
    return `${conflictSideText(cause.left)}と${conflictSideText(cause.right)}が同時に成り立つため、配列として組み立てられません`;
  }
  return `配列として組み立てられません（${cause instanceof Error ? cause.message : String(cause)}）`;
};

/** 保存できない不備があるか。 */
export const hasBlockingProblem = (problems: readonly LayoutProblem[]): boolean => problems.some((problem) => problem.severity === 'error');

export type UserLayoutEditResult = { readonly ok: true; readonly layouts: readonly UserLayout[] } | { readonly ok: false; readonly reason: string };

/** 保存できない不備の文。`validate()`が弾くものは`layoutProblems`も弾くが、保存の入口で二重に守る。 */
function blockingReason(content: UserLayoutContent): string | undefined {
  const normalized = normalizeContent(content);
  const messages = layoutProblems(normalized)
    .filter((problem) => problem.severity === 'error')
    .map((problem) => problem.message);
  // 取り込み形式の配列の段は元の定義のままなので、段の文字の検査は掛けない
  if (!isImportedContent(normalized)) messages.push(...validate([...normalized.rows]).filter((error) => !messages.includes(error)));
  return messages.length > 0 ? messages.join('、') : undefined;
}

/** 新規作成。保存できない不備があれば何もせず理由を返す。 */
export function createUserLayout(layouts: readonly UserLayout[], generateId: () => string, content: UserLayoutContent): UserLayoutEditResult {
  const reason = blockingReason(content);
  if (reason !== undefined) return { ok: false, reason };
  return { ok: true, layouts: [...layouts, definitionOf(generateId(), normalizeContent(content))] };
}

/**
 * 中身の書き換え。idは変えない。対象が無い、または中身が変わらない時は同じ参照を返す。
 * 面で定義する配列と、保存できない不備のある入力は理由を返す。
 * 取り込み形式の配列は、名前・ローマ字規則・ホームキーだけを書き換え、段の文字・`sequences`・`legends` は元の値のまま残す。
 */
export function updateUserLayout(layouts: readonly UserLayout[], id: string, content: UserLayoutContent): UserLayoutEditResult {
  const target = layouts.find((layout) => layout.id === id);
  if (target === undefined) return { ok: true, layouts };
  if (!isStageUserLayout(target)) return { ok: false, reason: '面で定義する配列は、段の文字の編集では直せません' };
  // 取り込み形式の配列は、画面で直せる3項目だけを入力から取り、残りは保存済みの値を使う
  const { romaji: _stored, ...stored } = contentOf(target);
  const kept: UserLayoutContent = isImportedContent(target)
    ? { ...stored, name: content.name, homeKeys: content.homeKeys, ...romajiOf(content) }
    : content;
  const reason = blockingReason(kept);
  if (reason !== undefined) return { ok: false, reason };
  const next = definitionOf(id, normalizeContent(kept));
  if (JSON.stringify(next) === JSON.stringify(target)) return { ok: true, layouts };
  return { ok: true, layouts: layouts.map((layout) => (layout.id === id ? next : layout)) };
}
