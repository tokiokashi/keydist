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
