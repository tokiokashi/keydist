import type { CascadeLevel, Diagnostic, ResolvedOrigin } from '#input/settings/index.ts';
import type { ResolvedSettingsCascade, SettingsItemId } from '#engine/settings-items.ts';
import type { FingerAssignment, Geometry, PhysicalShape } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { InputMethod } from '#input/settings/levels.ts';
import { ROMAJI_RULES } from '#input/romaji/rules.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';

/**
 * ペインの条件表示（#544 §3「実効値の出どころを表示する」・指示書「少なくともTraceに
 * 効く項目と、診断・警告があれば」）。
 *
 * 表示対象はTracePolicy（`generateTrace`が直接読む値）に効く項目 + 指の割当id。
 * 解釈（chain/arpeggio）・速度平均はTraceそのものには効かない（docs/architecture.mdの
 * 「解釈はTraceの読み方」）ため、この一覧には含めない（先回りして足さない。
 * AGENTS.md「設定項目を足すか決める」）。行が要ると分かった時点で足す。
 */
const TRACE_AFFECTING_ITEMS: readonly { readonly id: SettingsItemId; readonly label: string }[] = [
  { id: 'windowSize', label: '先読みN' },
  { id: 'sfbHomeCost', label: '同指連続のホーム復帰距離' },
  { id: 'preferOppositeThumb', label: '親指シフトの振り替え' },
  { id: 'triggerRealizationPolicy', label: 'シフト系キーの押し続け' },
  // 文字キーと一緒に押したシフト系キーを、別の動作（Stroke）として数えるか。動作数の列が変わる。
  { id: 'actionRealizationPolicy', label: 'シフト系キーを別の動作として数える' },
  { id: 'romajiRuleId', label: 'ローマ字規則' },
  { id: 'fingerAssignmentId', label: '指の割当' },
  /**
   * 配列を対象にした時だけ意味を持つ（`isApplicable`がSetup対象では`applicable: false`を
   * 返す。#578指摘6「defaultShapeIdの診断はfingerAssignmentIdと同じ形で出す」）。
   */
  { id: 'defaultShapeId', label: '既定の形状' },
];

export type ConditionValueFormat = 'primitive' | 'object';

export interface ConditionSummaryRow {
  readonly id: SettingsItemId;
  readonly label: string;
  /** プリミティブならそのまま描ける文字列、オブジェクトなら要約できないので詳細行だけ示す。 */
  readonly format: ConditionValueFormat;
  readonly displayValue: string;
  readonly origin: ResolvedOrigin;
  /** `origin`を画面に出す文言（「既定値」「上書き: 配列「QWERTY」」等）。idは名前へ引いてある。 */
  readonly originLabel: string;
  readonly applicable: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

function formatOrigin(origin: ResolvedOrigin, names?: ConditionValueNames): string {
  if (origin.kind === 'default') return '既定値';
  return `上書き: ${cascadeLevelLabel(origin, names)}`;
}

const INPUT_METHOD_LABELS: Readonly<Record<InputMethod, string>> = {
  'direct': '英字を直接打つ配列',
  'romaji': 'ローマ字入力',
  'kana-direct': 'かなを直接打つ配列',
};

/** 上書きの置き場所。形状・配列はidでなく名前で出す（引けなければ「この形状」等）。 */
function cascadeLevelLabel(level: CascadeLevel, names: ConditionValueNames | undefined): string {
  switch (level.kind) {
    case 'global': return '全体';
    case 'shape': {
      const name = names?.shapes.get(level.shapeId)?.name;
      return name === undefined ? 'この形状' : `形状「${name}」`;
    }
    case 'inputMethod': return INPUT_METHOD_LABELS[level.inputMethod];
    case 'layout': {
      const name = names?.layouts?.get(level.layoutId)?.name;
      return name === undefined ? 'この配列' : `配列「${name}」`;
    }
    case 'setup': return 'このSetup';
  }
}

/**
 * 値がidである項目を、利用者が読める名前へ引くための手持ち。形状idをそのまま見せても
 * 利用者は形状の選択肢（名前で並ぶ）と対応を取れないため。引けないidはそのまま出す。
 */
export interface ConditionValueNames {
  readonly shapes: ReadonlyMap<string, { readonly name: string }>;
  readonly layouts?: ReadonlyMap<string, { readonly name: string }>;
}

function formatValue(
  id: SettingsItemId,
  value: unknown,
  names: ConditionValueNames | undefined,
): { format: ConditionValueFormat; displayValue: string } {
  // 値がidの項目は名前へ引く。引けないid（削除済み・自作で手持ちに無い）もidのままは出さない。
  if (id === 'defaultShapeId' && typeof value === 'string') {
    return { format: 'primitive', displayValue: names?.shapes.get(value)?.name ?? '見つからない形状' };
  }
  if (id === 'romajiRuleId' && typeof value === 'string') {
    const builtin = Object.hasOwn(ROMAJI_RULES, value) ? ROMAJI_RULES[value as keyof typeof ROMAJI_RULES] : undefined;
    return { format: 'primitive', displayValue: builtin?.name ?? '自作のローマ字規則' };
  }
  if (id === 'fingerAssignmentId' && typeof value === 'string') {
    const builtin = Object.hasOwn(FINGER_ASSIGNMENT_REGISTRY, value) ? FINGER_ASSIGNMENT_REGISTRY[value] : undefined;
    return { format: 'primitive', displayValue: builtin?.name ?? '自作の指の割当' };
  }
  // 実現方式の2項目は、利用者が選べる主な値（する/しない）で出す。配列ごとの例外は中身を
  // 並べず、あることだけを示す（例外は配列のキー単位の指定で、短い1行に収まらないため）。
  if (id === 'triggerRealizationPolicy' && isRecord(value)) {
    return { format: 'primitive', displayValue: value['useHold'] === true ? 'する' : 'しない' };
  }
  if (id === 'actionRealizationPolicy' && isRecord(value)) {
    const base = value['triggerActivation'] === 'semantic' ? 'する' : 'しない';
    const classOverrides = isRecord(value['triggerActivationClassOverrides'])
      ? Object.keys(value['triggerActivationClassOverrides']).length
      : 0;
    const overrides = Array.isArray(value['triggerActivationOverrides']) ? value['triggerActivationOverrides'].length : 0;
    return {
      format: 'primitive',
      displayValue: classOverrides + overrides > 0 ? `${base}（キーごとの例外あり）` : base,
    };
  }
  if (value === null) return { format: 'primitive', displayValue: 'なし' };
  if (typeof value === 'boolean') return { format: 'primitive', displayValue: value ? 'ON' : 'OFF' };
  if (typeof value === 'string' || typeof value === 'number') {
    return { format: 'primitive', displayValue: String(value) };
  }
  // 上で扱っていないオブジェクト値は要約せず「詳細設定」とだけ示す（今のTRACE_AFFECTING_ITEMSには無い）。
  return { format: 'object', displayValue: '（詳細設定）' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** カスケードの解決結果から、Traceに効く項目だけを抜き出して表示用の行にする。 */
export function traceConditionSummary(
  cascade: ResolvedSettingsCascade,
  names?: ConditionValueNames,
): readonly ConditionSummaryRow[] {
  return TRACE_AFFECTING_ITEMS.map(({ id, label }) => {
    const resolved = cascade[id];
    const { format, displayValue } = formatValue(id, resolved.value, names);
    return {
      id,
      label,
      format,
      displayValue,
      origin: resolved.origin,
      originLabel: formatOrigin(resolved.origin, names),
      applicable: resolved.applicable,
      diagnostics: resolved.diagnostics,
    };
  });
}

/** ペイン見出しに出す、Setupの実体名（配列・形状・実際に使われた指の割当）。 */
export interface ConditionHeaderInfo {
  readonly layoutName: string;
  readonly shapeName: string;
  readonly fingerAssignmentName: string;
}

export function conditionHeaderInfo(
  layout: Layout,
  shape: PhysicalShape,
  fingerAssignment: FingerAssignment,
): ConditionHeaderInfo {
  return { layoutName: layout.name, shapeName: shape.name, fingerAssignmentName: fingerAssignment.name };
}

/**
 * `resolveEngineInput`の結果（`ResolvedInput`）から直接作る版。`Geometry`は既に
 * 実際に使われた指の割当（`geometry.assignment`。#544 §3の実現可能性判定・fallbackを
 * 経た後の値）を持っているので、`hosts/standalone`のように解決済み入力しか手元に無い
 * 場面ではこちらを使う（`resolveSetup`直後のPhysicalShapeしか無い場面は上の版を使う）。
 */
export function conditionHeaderInfoFromResolvedInput(layout: Layout, geometry: Geometry): ConditionHeaderInfo {
  return { layoutName: layout.name, shapeName: geometry.name, fingerAssignmentName: geometry.assignment.name };
}

export { formatOrigin };

/**
 * 条件の行に付いた診断を、画面に出す文言にする。`input/settings`の診断文は項目id・レベル名を
 * 含む開発者向けの文なので、ここで項目の表示名から組み立て直す。「効かない」は行の目印
 * （`applicable: false`）で既に示しているので出さない（`undefined`）。
 */
export function conditionDiagnosticText(row: ConditionSummaryRow, diagnostic: Diagnostic): string | undefined {
  switch (diagnostic.kind) {
    case 'not-applicable': return undefined;
    case 'ignored-disallowed-level': return `「${row.label}」の上書きのうち、置けない場所にあった値を無視した`;
    case 'invalid-fallback': return diagnostic.message;
  }
}

/**
 * `traceConditionSummary`の結果から、既定値と違う項目だけを残す（#544 Phase 3レビュー
 * 「集合対象ページ（比較表・N感度）は各行に効いている条件を併記する」）。
 *
 * 集合対象のページは1画面に複数Setupを並べるため、`PaneFrame`（単一Setup対象）のように
 * 全項目を`<details>`で出すと行ごとに同じ既定値の羅列が並んでしまい読みにくい。
 * 「このSetupだけ何が違うか」が知りたい場面なので、`origin.kind !== 'default'`
 * （カスケードのどこかのレベルで上書きされている）の行だけを残す。
 * その対象に効かない行（`applicable: false`。Setup対象の「既定の形状」、かな配列の
 * ローマ字規則等）は上書きされていても落とす。効かない値を併記すると、その条件で
 * 測ったように読めてしまうため。
 *
 * 「既定の形状」は常に落とす。これが効く配列対象では、実際に使った形状の名前を名前・条件欄に
 * 必ず出しているので、併記すると同じ形状名が2回並ぶため（レビュー指摘L-c）。
 *
 * `excludeIds`は呼び出し側が「この項目は元々全員に共通の軸として見せているので、
 * ここでは重複して出さない」という項目を落とすためのフック（N感度の`windowSize`。
 * Nを振ること自体がそのページの主題なので、個別の上書きと並べて出すと紛らわしい）。
 */
const SHOWN_AS_SHAPE_NAME: readonly SettingsItemId[] = ['defaultShapeId'];

export function nonDefaultConditionRows(
  rows: readonly ConditionSummaryRow[],
  excludeIds: readonly SettingsItemId[] = [],
): readonly ConditionSummaryRow[] {
  return rows.filter((row) => row.applicable
    && row.origin.kind !== 'default'
    && !SHOWN_AS_SHAPE_NAME.includes(row.id)
    && !excludeIds.includes(row.id));
}

/**
 * `nonDefaultConditionRows`の結果を、行の短い併記用に1行の文字列へまとめる。
 * 空なら`undefined`（呼び出し側は「併記するものが無い」として省略する）。
 */
export function summarizeNonDefaultConditions(rows: readonly ConditionSummaryRow[]): string | undefined {
  if (rows.length === 0) return undefined;
  return rows.map((row) => `${row.label}: ${row.displayValue}`).join(' ・ ');
}
