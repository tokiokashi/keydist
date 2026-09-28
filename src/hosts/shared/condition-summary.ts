import type { CascadeLevel, Diagnostic, ResolvedOrigin } from '#input/settings/index.ts';
import type { ResolvedSettingsCascade, SettingsItemId } from '#engine/settings-items.ts';
import type { FingerAssignment, Geometry, PhysicalShape } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';

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
  { id: 'triggerRealizationPolicy', label: 'trigger実現方式' },
  { id: 'actionRealizationPolicy', label: 'action実現方式' },
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
  readonly applicable: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

function formatOrigin(origin: ResolvedOrigin): string {
  if (origin.kind === 'default') return '既定値';
  return `上書き: ${cascadeLevelLabel(origin)}`;
}

function cascadeLevelLabel(level: CascadeLevel): string {
  switch (level.kind) {
    case 'global': return 'グローバル';
    case 'shape': return `形状「${level.shapeId}」`;
    case 'inputMethod': return `打ち方「${level.inputMethod}」`;
    case 'layout': return `配列「${level.layoutId}」`;
    case 'setup': return 'このSetup';
  }
}

function formatValue(value: unknown): { format: ConditionValueFormat; displayValue: string } {
  if (value === null) return { format: 'primitive', displayValue: 'なし' };
  if (typeof value === 'boolean') return { format: 'primitive', displayValue: value ? 'ON' : 'OFF' };
  if (typeof value === 'string' || typeof value === 'number') {
    return { format: 'primitive', displayValue: String(value) };
  }
  // オブジェクト値（trigger/action実現方式）は要約せず「詳細設定」とだけ示す。
  // 個々のフィールドを一覧化すると項目が増えるたびにこのファイルを直す必要が生じるため、
  // 出どころ・診断の表示だけをここでは保証する（値そのものの詳細UIは編集導線と一緒に作る。
  // #544 Phase 6「条件を編集する導線」）。
  return { format: 'object', displayValue: '(詳細設定)' };
}

/** カスケードの解決結果から、Traceに効く項目だけを抜き出して表示用の行にする。 */
export function traceConditionSummary(
  cascade: ResolvedSettingsCascade,
): readonly ConditionSummaryRow[] {
  return TRACE_AFFECTING_ITEMS.map(({ id, label }) => {
    const resolved = cascade[id];
    const { format, displayValue } = formatValue(resolved.value);
    return {
      id,
      label,
      format,
      displayValue,
      origin: resolved.origin,
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
 * `traceConditionSummary`の結果から、既定値と違う項目だけを残す（#544 Phase 3レビュー
 * 「集合対象ページ（比較表・N感度）は各行に効いている条件を併記する」）。
 *
 * 集合対象のページは1画面に複数Setupを並べるため、`PaneFrame`（単一Setup対象）のように
 * 全項目を`<details>`で出すと行ごとに同じ既定値の羅列が並んでしまい読みにくい。
 * 「このSetupだけ何が違うか」が知りたい場面なので、`origin.kind !== 'default'`
 * （カスケードのどこかのレベルで上書きされている）の行だけを残す。
 *
 * `excludeIds`は呼び出し側が「この項目は元々全員に共通の軸として見せているので、
 * ここでは重複して出さない」という項目を落とすためのフック（N感度の`windowSize`。
 * Nを振ること自体がそのページの主題なので、個別の上書きと並べて出すと紛らわしい）。
 */
export function nonDefaultConditionRows(
  rows: readonly ConditionSummaryRow[],
  excludeIds: readonly SettingsItemId[] = [],
): readonly ConditionSummaryRow[] {
  return rows.filter((row) => row.origin.kind !== 'default' && !excludeIds.includes(row.id));
}

/**
 * `nonDefaultConditionRows`の結果を、行の短い併記用に1行の文字列へまとめる。
 * 空なら`undefined`（呼び出し側は「併記するものが無い」として省略する）。
 */
export function summarizeNonDefaultConditions(rows: readonly ConditionSummaryRow[]): string | undefined {
  if (rows.length === 0) return undefined;
  return rows.map((row) => `${row.label}: ${row.displayValue}`).join(' ・ ');
}
