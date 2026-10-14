import { isBuiltin } from '../romaji/rules.ts';
import { FINGER_LABEL } from '../shapes/finger-names.ts';
import { FINGERS, keyId, QWERTY_LEGEND, type NonThumb } from '../shapes/geometry.ts';
import { ROW_LABELS, ROW_LIMITS, toLayout, validate, type UserLayout } from './user-layouts.ts';

/**
 * 自作の配列（段の文字で表せるもの）を作る・直す操作の純関数。
 * 書き込みの規約は`input/romaji/rule-edit.ts`と同じで、変化が無ければ同一の配列参照を返す。
 * コマンド層（`engine/commands.ts`）はこの参照の一致でno-opを判定する。
 */

export const USER_LAYOUT_ID_PREFIX = 'user-';

export const newUserLayoutId = (): string =>
  `${USER_LAYOUT_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 配列の中身（idを除く）。画面の入力欄がそのまま持つ形。 */
export interface UserLayoutContent {
  readonly name: string;
  /** 数字段・上段・ホーム段・下段。数字段は空文字でもよい */
  readonly rows: readonly [string, string, string, string];
  readonly romaji: string;
  /** 指ごとの任意のホームキー。値は物理キーのid。空文字は未指定 */
  readonly homeKeys: Readonly<Partial<Record<NonThumb, string>>>;
}

/**
 * 段の文字だけで表せる配列か。取り込み形式の配列（かな・コンボの定義、表示ラベル、直接入力）は
 * 段の文字だけで保存し直すとそれらが消えるので、この画面では直さない。
 */
export const isEditableUserLayout = (layout: UserLayout): boolean =>
  layout.sequences === undefined && layout.legends === undefined && layout.direct !== true;

/** 配列の定義から画面の入力欄の値を作る。 */
export function contentOf(layout: UserLayout): UserLayoutContent {
  return {
    name: layout.name,
    rows: [layout.rows[0], layout.rows[1], layout.rows[2], layout.rows[3]],
    romaji: layout.romaji,
    homeKeys: { ...layout.homeKeys },
  };
}

/** 保存する形にそろえる。名前と段は前後の空白を落とし、空のホームキーは持たない。 */
export function normalizeContent(content: UserLayoutContent): UserLayoutContent {
  const homeKeys: Partial<Record<NonThumb, string>> = {};
  for (const finger of FINGERS) {
    const key = content.homeKeys[finger];
    if (key !== undefined && key !== '') homeKeys[finger] = key;
  }
  return {
    name: content.name.trim(),
    rows: [content.rows[0].trim(), content.rows[1].trim(), content.rows[2].trim(), content.rows[3].trim()],
    romaji: content.romaji,
    homeKeys,
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
const effectiveRows = (rows: readonly string[]): string[] =>
  rows.map((row, index) => (row === '' ? QWERTY_LEGEND[index] : row));

/** 段に置いた文字と、それが載るキーのid・段。 */
export function placedKeys(rows: readonly string[]): { readonly char: string; readonly keyId: string; readonly row: number }[] {
  return effectiveRows(rows).flatMap((row, rowIndex) =>
    [...row].map((char, col) => ({ char, keyId: keyId(rowIndex, col), row: rowIndex })));
}

function definitionOf(id: string, content: UserLayoutContent): UserLayout {
  const layout: UserLayout = {
    id,
    name: content.name,
    rows: [content.rows[0], content.rows[1], content.rows[2], content.rows[3]],
    romaji: content.romaji,
  };
  return Object.keys(content.homeKeys).length === 0 ? layout : { ...layout, homeKeys: { ...content.homeKeys } };
}

/**
 * 入力の不備を調べる。`error`が1つでもあれば保存できない。
 * 同じ文字が複数のキーに載っているのは、配列のモデルが認めている置き方なので`warning`にとどめる。
 * `knownRomajiRuleIds`が渡された時は、選んだローマ字規則が無ければ`warning`で知らせる
 * （配列は全体の値の規則で打つので、保存はできる）。
 */
export function layoutProblems(
  content: UserLayoutContent,
  knownRomajiRuleIds?: ReadonlySet<string>,
): readonly LayoutProblem[] {
  const normalized = normalizeContent(content);
  const problems: LayoutProblem[] = [];
  const rows = normalized.rows;

  if (normalized.name === '') {
    problems.push({ severity: 'error', field: { kind: 'name' }, message: '名前を入力してください' });
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
  if (rows.slice(1).every((row) => row === '')) {
    problems.push({ severity: 'error', field: { kind: 'letter-rows' }, message: '上段・ホーム段・下段のどれかに文字を入力してください' });
  }

  const placed = new Set(placedKeys(rows).map((entry) => entry.keyId));
  for (const finger of FINGERS) {
    const key = normalized.homeKeys[finger];
    if (key !== undefined && !placed.has(key)) {
      problems.push({
        severity: 'error',
        field: { kind: 'home-key', finger },
        message: `${FINGER_LABEL[finger]}のホームキー「${key}」は、段に無いキーです`,
      });
    }
  }

  // 配列として組み立てられるか。段の長さと空の段は上で伝えているので、その外の失敗だけを拾う
  if (problems.every((problem) => problem.severity !== 'error' || problem.field.kind === 'name')) {
    try {
      toLayout(definitionOf('check', normalized));
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      problems.push({ severity: 'error', field: { kind: 'build' }, message: `配列として組み立てられません（${reason}）` });
    }
  }

  const byChar = new Map<string, string[]>();
  for (const entry of placedKeys(rows)) byChar.set(entry.char, [...(byChar.get(entry.char) ?? []), entry.keyId]);
  for (const [char, keyIds] of byChar) {
    if (keyIds.length < 2) continue;
    problems.push({
      severity: 'warning',
      field: { kind: 'duplicate', char, keyIds },
      message: `「${char}」が複数のキーに載っています（${keyIds.join('・')}）`,
    });
  }

  if (knownRomajiRuleIds !== undefined && !isBuiltin(normalized.romaji) && !knownRomajiRuleIds.has(normalized.romaji)) {
    problems.push({
      severity: 'warning',
      field: { kind: 'romaji' },
      message: '選んでいたローマ字規則が見つかりません。全体の値の規則で打ちます。規則を選び直すと、その規則で打ちます',
    });
  }
  return problems;
}

/** 保存できない不備があるか。 */
export const hasBlockingProblem = (problems: readonly LayoutProblem[]): boolean =>
  problems.some((problem) => problem.severity === 'error');

export type UserLayoutEditResult =
  | { readonly ok: true; readonly layouts: readonly UserLayout[] }
  | { readonly ok: false; readonly reason: string };

/** 保存できない不備の文。`validate()`が弾くものは`layoutProblems`も弾くが、保存の入口で二重に守る。 */
function blockingReason(content: UserLayoutContent): string | undefined {
  const normalized = normalizeContent(content);
  const messages = layoutProblems(normalized)
    .filter((problem) => problem.severity === 'error')
    .map((problem) => problem.message);
  messages.push(...validate([...normalized.rows]).filter((error) => !messages.includes(error)));
  return messages.length > 0 ? messages.join('、') : undefined;
}

/** 新規作成。保存できない不備があれば何もせず理由を返す。 */
export function createUserLayout(
  layouts: readonly UserLayout[],
  generateId: () => string,
  content: UserLayoutContent,
): UserLayoutEditResult {
  const reason = blockingReason(content);
  if (reason !== undefined) return { ok: false, reason };
  return { ok: true, layouts: [...layouts, definitionOf(generateId(), normalizeContent(content))] };
}

/**
 * 中身の書き換え。idは変えない。対象が無い、または中身が変わらない時は同じ参照を返す。
 * 取り込み形式の配列と、保存できない不備のある入力は理由を返す。
 */
export function updateUserLayout(
  layouts: readonly UserLayout[],
  id: string,
  content: UserLayoutContent,
): UserLayoutEditResult {
  const target = layouts.find((layout) => layout.id === id);
  if (target === undefined) return { ok: true, layouts };
  if (!isEditableUserLayout(target)) return { ok: false, reason: '取り込み形式の配列は、段の文字だけでは直せません' };
  const reason = blockingReason(content);
  if (reason !== undefined) return { ok: false, reason };
  const next = definitionOf(id, normalizeContent(content));
  if (JSON.stringify(next) === JSON.stringify(target)) return { ok: true, layouts };
  return { ok: true, layouts: layouts.map((layout) => layout.id === id ? next : layout) };
}
