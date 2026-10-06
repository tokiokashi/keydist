import { readOverride, type CascadeLevel, type Diagnostic, type ResolvedOrigin } from '#input/settings/index.ts';
import { SETTINGS_ITEMS, type ResolvedSettingsCascade, type SettingsCascadeOverrides, type SettingsItemId } from '#engine/settings-items.ts';
import { DEFAULT_FINGER_ASSIGNMENT, type FingerAssignment, type Geometry, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { InputMethod } from '#input/settings/levels.ts';
import { ROMAJI_RULES } from '#input/romaji/rules.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';

/**
 * ペインの条件表示（実効値の出どころを表示する。少なくともTraceに
 * 効く項目と、診断・警告があれば出す）。
 *
 * 表示対象はTracePolicy（`generateTrace`が直接読む値）に効く項目 + 指の割当id。
 * 解釈（chain/arpeggio）・速度平均はTraceそのものには効かない（docs/architecture.mdの
 * 「解釈はTraceの読み方」）うえ、今の画面（Bigram Flow・比較表・N感度）にこれらを読む数値も無い。
 * 効かない上書きを「変えた項目」に数えると、その条件で測ったように読めるため、この一覧
 * （要約の閉じた1行・対象名の併記）には含めない。チェーン・アルペジオは条件のモーダルの
 * 行としてだけ編集できる（`ConditionEditor`。全体のレベルを直接読む）。
 */
const TRACE_AFFECTING_ITEMS: readonly { readonly id: SettingsItemId; readonly label: string }[] = [
  { id: 'windowSize', label: '先読みN' },
  { id: 'sfbHomeCost', label: '同指連続のホーム復帰距離' },
  { id: 'preferOppositeThumb', label: '親指シフトの振り替え' },
  { id: 'triggerRealizationPolicy', label: 'シフト系キーの押し続け' },
  // 文字キーと一緒に押したシフト系キーを、別の動作（Stroke）として数えるか。動作数の列が変わる。
  { id: 'actionRealizationPolicy', label: '動作数の扱い' },
  { id: 'romajiRuleId', label: 'ローマ字規則' },
  { id: 'fingerAssignmentId', label: '指の割当' },
  /**
   * 配列を対象にした時だけ意味を持つ（`isApplicable`がSetup対象では`applicable: false`を
   * 返す）。
   */
  { id: 'defaultShapeId', label: '既定の物理配列' },
];

/**
 * 条件の項目を、画面に出す名前へ写す。プリセットの流し込みで「入れなかった項目」を、内部の項目idでなく
 * 利用者が見る行の名前で伝えるため。要約に出ない項目（チェーン・アルペジオ）は、モーダルの節の名前で出す。
 * 行の無い項目（再生速度の平均など）と未知のidは`undefined`（呼び出し側が件数だけで伝える）。
 */
export function conditionItemLabel(id: string): string | undefined {
  const traced = TRACE_AFFECTING_ITEMS.find((item) => item.id === id);
  if (traced !== undefined) return traced.label;
  if (id === 'chainInterpretation') return 'チェーンの区切り';
  if (id === 'arpeggioInterpretation') return 'アルペジオ';
  return undefined;
}

export type ConditionValueFormat = 'primitive' | 'object';

export interface ConditionSummaryRow {
  readonly id: SettingsItemId;
  readonly label: string;
  /** プリミティブならそのまま描ける文字列、オブジェクトなら要約できないので詳細行だけ示す。 */
  readonly format: ConditionValueFormat;
  readonly displayValue: string;
  /**
   * 効く値の同一判定に使うキー。`displayValue`は自作のidを「自作の…」に畳むため、
   * 別々の自作どうしを区別できない。対象どうしの差（`multiTargetConditionSummary`）はこちらで比べる。
   */
  readonly valueKey: string;
  /** この画面で効く値そのもの。配列のレベルの編集が、書く前の値を出すのに使う。 */
  readonly value: unknown;
  /** 配列のレベルの上書きを除いた時の値（`ResolvedItem.layoutBase`）。配列のレベルの編集の「継承する値」。 */
  readonly layoutBase: unknown;
  /** 配列が推奨を持つか（`layoutBase`が推奨か）。配列の値を戻す先の呼び名に使う。 */
  readonly hasLayoutRecommendation: boolean;
  /** 配列の上書きを全体へ移した後の継承値（`ResolvedItem.promotedBase`）。 */
  readonly promotedBase?: unknown;
  readonly origin: ResolvedOrigin;
  /** `origin`を画面に出す文言（「既定値」「上書き: 配列「QWERTY」」等）。idは名前へ引いてある。 */
  readonly originLabel: string;
  readonly applicable: boolean;
  /**
   * 上書きされていても、効く値が既定と同じか。「動作数の扱い」は、Shift+Aを1動作にする時は例外を
   * 一切読まないため、例外だけ違う上書きは既定と同じに働く。
   */
  readonly sameAsDefault: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /**
   * 配列の推奨が効いていて、全体に置いた別の値が負けている（全体を変えても画面が変わらない）。
   * 出どころは「既定値」のまま（推奨は利用者が変えた値ではないので、変えた項目には数えない）。
   */
  readonly recommendationWinsOverGlobal: boolean;
  /** 同じく、Workspaceに置いた別の値が負けている（Workspaceの値を変えても画面が変わらない）。 */
  readonly recommendationWinsOverWorkspace: boolean;
}

/** 効く値が既定と同じか。効かない部分（数えない時の例外）の違いは見ない。 */
function effectivelySameAsDefault(id: SettingsItemId, value: unknown): boolean {
  if (id !== 'actionRealizationPolicy') return false;
  const defaultValue: unknown = SETTINGS_ITEMS.actionRealizationPolicy.defaultValue;
  const semantic = (policy: unknown) => isRecord(policy) && policy['triggerActivation'] === 'semantic';
  return !semantic(value) && !semantic(defaultValue);
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

/** 上書きの置き場所。物理配列・配列はidでなく名前で出す（引けなければ「この物理配列」等）。 */
function cascadeLevelLabel(level: CascadeLevel, names: ConditionValueNames | undefined): string {
  switch (level.kind) {
    case 'global': return '全体';
    case 'workspace': return 'Workspace';
    case 'shape': {
      const name = names?.shapes.get(level.shapeId)?.name;
      return name === undefined ? 'この物理配列' : `物理配列「${name}」`;
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
 * 値がidである項目を、利用者が読める名前へ引くための手持ち。物理配列idをそのまま見せても
 * 利用者は物理配列の選択肢（名前で並ぶ）と対応を取れないため。引けないidはそのまま出す。
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
    return { format: 'primitive', displayValue: names?.shapes.get(value)?.name ?? '見つからない物理配列' };
  }
  if (id === 'romajiRuleId' && typeof value === 'string') {
    const builtin = Object.hasOwn(ROMAJI_RULES, value) ? ROMAJI_RULES[value as keyof typeof ROMAJI_RULES] : undefined;
    return { format: 'primitive', displayValue: builtin?.name ?? '自作のローマ字規則' };
  }
  if (id === 'fingerAssignmentId' && typeof value === 'string') {
    const builtin = Object.hasOwn(FINGER_ASSIGNMENT_REGISTRY, value) ? FINGER_ASSIGNMENT_REGISTRY[value] : undefined;
    return { format: 'primitive', displayValue: builtin?.name ?? '自作の指の割当' };
  }
  // 実現方式の2項目は、利用者が選べる主な値（する/しない）で出す。例外は中身を並べず、
  // あることだけを示す（例外は打ち方の大分類・キーごとの指定で、短い1行に収まらないため）。
  if (id === 'triggerRealizationPolicy' && isRecord(value)) {
    return { format: 'primitive', displayValue: value['useHold'] === true ? 'する' : 'しない' };
  }
  if (id === 'actionRealizationPolicy' && isRecord(value)) {
    // Shift+Aを1動作にする時は例外を一切読まない（`input/semantics/action-realization.ts`）ので、
    // 例外が残っていても出さない。出すと効いていない例外で測ったように読めてしまう。
    if (value['triggerActivation'] !== 'semantic') return { format: 'primitive', displayValue: ACTION_COUNT_TEXT.combined };
    const classOverrides = isRecord(value['triggerActivationClassOverrides'])
      ? Object.keys(value['triggerActivationClassOverrides']).length
      : 0;
    const overrides = Array.isArray(value['triggerActivationOverrides']) ? value['triggerActivationOverrides'].length : 0;
    return {
      format: 'primitive',
      displayValue: classOverrides + overrides > 0 ? `${ACTION_COUNT_TEXT.separate}（例外あり）` : ACTION_COUNT_TEXT.separate,
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

/** 「動作数の扱い」の2つの選択肢の文言（条件のモーダルと要約で同じ語を使う）。 */
export const ACTION_COUNT_TEXT = {
  combined: 'Shift+A で1動作',
  separate: 'Shift→A で2動作',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 実現方式の2項目は、画面に出す効く値（例外を数えない時は例外を読まない）が同一性の基準。
 * それ以外は値そのもの（idを含む）で比べる。
 */
function valueKeyOf(id: SettingsItemId, value: unknown, displayValue: string): string {
  if (id === 'triggerRealizationPolicy' || id === 'actionRealizationPolicy') return displayValue;
  return JSON.stringify(value) ?? displayValue;
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
      valueKey: valueKeyOf(id, resolved.value, displayValue),
      value: resolved.value,
      layoutBase: resolved.layoutBase,
      hasLayoutRecommendation: resolved.hasLayoutRecommendation,
      ...(resolved.promotedBase === undefined ? {} : { promotedBase: resolved.promotedBase }),
      origin: resolved.origin,
      originLabel: formatOrigin(resolved.origin, names),
      applicable: resolved.applicable,
      sameAsDefault: effectivelySameAsDefault(id, resolved.value),
      diagnostics: resolved.diagnostics,
      recommendationWinsOverGlobal: resolved.recommendationWins?.shadowed.includes('global') ?? false,
      recommendationWinsOverWorkspace: resolved.recommendationWins?.shadowed.includes('workspace') ?? false,
    };
  });
}

/** ペイン見出しに出す、Setupの実体名（配列・物理配列・実際に使われた指の割当）。 */
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
 * 実際に使われた指の割当（`geometry.assignment`。実現可能性判定・fallbackを
 * 経た後の値）を持っているので、`hosts/standalone`のように解決済み入力しか手元に無い
 * 場面ではこちらを使う（`resolveSetup`直後のPhysicalShapeしか無い場面は上の版を使う）。
 */
export function conditionHeaderInfoFromResolvedInput(layout: Layout, geometry: Geometry): ConditionHeaderInfo {
  return { layoutName: layout.name, shapeName: geometry.name, fingerAssignmentName: geometry.assignment.name };
}

export { formatOrigin, cascadeLevelLabel as conditionLevelLabel };

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
 * `traceConditionSummary`の結果から、既定値と違う項目だけを残す。
 * 集合対象ページ（比較表・N感度）は各行に効いている条件を併記する。
 *
 * 集合対象のページは1画面に複数Setupを並べるため、`PaneFrame`（単一Setup対象）のように
 * 全項目を`<details>`で出すと行ごとに同じ既定値の羅列が並んでしまい読みにくい。
 * 「このSetupだけ何が違うか」が知りたい場面なので、`origin.kind !== 'default'`
 * （カスケードのどこかのレベルで上書きされている）の行だけを残す。
 * その対象に効かない行（`applicable: false`。Setup対象の「既定の物理配列」、かな配列の
 * ローマ字規則等）は上書きされていても落とす。効かない値を併記すると、その条件で
 * 測ったように読めてしまうため。
 *
 * 「既定の物理配列」は常に落とす。これが効く配列対象では、実際に使った物理配列の名前を名前・条件欄に
 * 必ず出しているので、併記すると同じ物理配列名が2回並ぶため。
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
  return rows.filter((row) => isChangedConditionRow(row)
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

/**
 * 条件の要約で「変えた項目」とみなすか（docs/architecture.md「条件の要約」）。
 * カスケードのどこかで上書きされていて、その対象に効き、効く値が既定と違う行だけ。
 * 効かない上書きを変えた項目に数えると、その条件で測ったように読めてしまうため。
 * 対象ボタンの名前（`nonDefaultConditionRows`）と閉じた1行が食い違わないよう、両方がこれを使う。
 */
export function isChangedConditionRow(row: ConditionSummaryRow): boolean {
  return row.applicable && row.origin.kind !== 'default' && !row.sameAsDefault;
}

/** 閉じた1行に名前を出す、変えた項目の件数。残りは「他N件」に畳む。 */
const SUMMARY_LINE_ITEMS = 2;

export interface ConditionSummaryLine {
  /** 変えた項目の件数。0なら「すべて既定値」。 */
  readonly changedCount: number;
  /** 閉じた1行に出す項目（項目の定義順の先頭から）。 */
  readonly shown: readonly ConditionSummaryRow[];
  /** 「他N件」のN。 */
  readonly restCount: number;
}

/** 閉じた1行の中身。`rows`は項目の定義順（`traceConditionSummary`の順）で渡す。 */
export function conditionSummaryLine(rows: readonly ConditionSummaryRow[]): ConditionSummaryLine {
  const changed = rows.filter(isChangedConditionRow);
  const shown = changed.slice(0, SUMMARY_LINE_ITEMS);
  return { changedCount: changed.length, shown, restCount: changed.length - shown.length };
}

/** 複数の対象を持つペインに渡す、対象1つぶんの条件。 */
export interface TargetConditionInput {
  readonly key: string;
  /** 「対象ごとの差」に出す対象の表示名（集合に対して計算したもの）。 */
  readonly label: string;
  readonly rows: readonly ConditionSummaryRow[];
}

export interface ConditionTargetDiffItem {
  readonly id: SettingsItemId;
  readonly label: string;
  readonly displayValue: string;
}

/** 共通の条件と違う対象と、その違う項目だけ。 */
export interface ConditionTargetDiff {
  readonly key: string;
  readonly label: string;
  readonly items: readonly ConditionTargetDiffItem[];
}

export interface MultiTargetConditionSummary {
  /** 共通の条件の行。項目の定義順。 */
  readonly rows: readonly ConditionSummaryRow[];
  /** 差のある対象だけ。全対象が同じなら空。 */
  readonly diffs: readonly ConditionTargetDiff[];
}

/**
 * 複数の対象の条件を「共通の条件」と「対象ごとの差」にまとめる（docs/architecture.md「条件の要約」）。
 *
 * 共通の行は**この画面で効く値**。対象ごとの上書きも、配列・物理配列ごとの既定も受けない時の値
 * （全体のレベルの値、それも無ければ項目の既定値）で、対象の並びに依らない。
 * 差は、効く値が共通の行の値と違う対象だけを、違う項目だけで出す。
 * 最初の対象の値を共通に採ると、配列ごとに既定が変わる項目（指の割当・ローマ字規則）で
 * 他の対象を偽って示すため、共通の値は対象から取らない。
 * 効かない項目・効かない対象は数えない（その条件で測ったように読めるため）。
 * `excludeIds`はペイン自身が掃引する項目（N感度の先読みN）。
 */
export function multiTargetConditionSummary(
  targets: readonly TargetConditionInput[],
  options: {
    readonly excludeIds?: readonly SettingsItemId[];
    /** 全体（Workspaceでは、それに重ねたWorkspace）のレベルの値（`globalConditionValues`）。共通の行はここから作る。 */
    readonly globalValues: GlobalConditionValues;
    /** `globalValues`の出どころ（`globalConditionLevels`）。省略時はすべて全体。 */
    readonly globalLevels?: GlobalConditionLevels;
    readonly names?: ConditionValueNames;
  },
): MultiTargetConditionSummary {
  const excluded = options.excludeIds ?? [];
  const first = targets[0];
  if (first === undefined) return { rows: [], diffs: [] };

  const rows: ConditionSummaryRow[] = [];
  const diffItems = new Map<string, ConditionTargetDiffItem[]>();
  for (const templateRow of first.rows) {
    if (excluded.includes(templateRow.id)) continue;
    const applicable = targets.flatMap((target) => {
      const row = target.rows.find((r) => r.id === templateRow.id);
      return row !== undefined && row.applicable ? [{ target, row }] : [];
    });
    // どの対象にも効かない項目は、効かない旨の行のまま出す（Singleと同じ）
    if (applicable.length === 0) {
      rows.push(templateRow);
      continue;
    }
    const screen = screenRow(templateRow, options.globalValues, options.names, options.globalLevels);
    rows.push(screen);
    for (const { target, row } of applicable) {
      if (row.valueKey === screen.valueKey) continue;
      const list = diffItems.get(target.key) ?? [];
      list.push({ id: row.id, label: row.label, displayValue: row.displayValue });
      diffItems.set(target.key, list);
    }
  }
  const diffs = targets.flatMap((target) => {
    const items = diffItems.get(target.key);
    return items === undefined ? [] : [{ key: target.key, label: target.label, items }];
  });
  return { rows, diffs };
}

/**
 * 対象に依らずこの画面に入るレベルの値（許可されている項目だけ）。全体のレベルの値に、Workspaceのレベルの値を重ねたもの
 * （単体ページはWorkspaceのレベルを持たないので、全体の値だけ）。対象の解決結果とは独立に読む。
 */
export type GlobalConditionValues = Readonly<Partial<Record<SettingsItemId, unknown>>>;

/** `globalConditionValues`の各値の出どころ（Workspaceのレベルが全体の値を上書きしていれば`workspace`）。 */
export type GlobalConditionLevels = Readonly<Partial<Record<SettingsItemId, 'global' | 'workspace'>>>;

/**
 * 上書きの全体・Workspaceのレベルから値を読む。共通の行を対象の行の出どころから拾うと、全対象が下位
 * （Setup・配列）で上書きしている時に全体の値が見つからず、画面で効く値でない既定値を出すため。
 */
export function globalConditionValues(overrides: SettingsCascadeOverrides): GlobalConditionValues {
  const values: Partial<Record<SettingsItemId, unknown>> = {};
  for (const id of Object.keys(SETTINGS_ITEMS) as SettingsItemId[]) {
    const value = screenLevelValue(overrides, id)?.value;
    if (value !== undefined) values[id] = value;
  }
  return values;
}

/** 共通の行の値の出どころ。`globalConditionValues`と同じ項目・同じ値を指す。 */
export function globalConditionLevels(overrides: SettingsCascadeOverrides): GlobalConditionLevels {
  const levels: Partial<Record<SettingsItemId, 'global' | 'workspace'>> = {};
  for (const id of Object.keys(SETTINGS_ITEMS) as SettingsItemId[]) {
    const level = screenLevelValue(overrides, id)?.level;
    if (level !== undefined) levels[id] = level;
  }
  return levels;
}

function screenLevelValue(
  overrides: SettingsCascadeOverrides,
  id: SettingsItemId,
): { readonly value: unknown; readonly level: 'global' | 'workspace' } | undefined {
  const allowed = SETTINGS_ITEMS[id].allowedLevels;
  const workspace: unknown = allowed.has('workspace') ? readOverride(overrides, { kind: 'workspace' }, id) : undefined;
  if (workspace !== undefined) return { value: workspace, level: 'workspace' };
  const global: unknown = allowed.has('global') ? readOverride(overrides, { kind: 'global' }, id) : undefined;
  return global === undefined ? undefined : { value: global, level: 'global' };
}

/**
 * 1項目の、この画面で効く値の行。全体・Workspaceのレベルの値があればそれ（出どころはそのレベル）、無ければ項目の既定値。
 * 既定値が物理配列ごとに変わる項目は、物理配列を持たない時の値（指の割当は列固定）を画面の値とする。
 * ローマ字規則の配列ごとの推奨は画面の値に入れない（推奨を持つ配列は「対象ごとの差」に出る）。
 */
function screenRow(
  template: ConditionSummaryRow,
  globalValues: GlobalConditionValues,
  names: ConditionValueNames | undefined,
  levels?: GlobalConditionLevels,
): ConditionSummaryRow {
  const globalValue = globalValues[template.id];
  const origin: ResolvedOrigin = globalValue === undefined
    ? { kind: 'default' }
    : { kind: levels?.[template.id] ?? 'global' };
  const rawDefault: unknown = SETTINGS_ITEMS[template.id].defaultValue;
  const value = globalValue !== undefined
    ? globalValue
    : template.id === 'fingerAssignmentId'
      ? DEFAULT_FINGER_ASSIGNMENT.id
      : rawDefault;
  const { format, displayValue } = formatValue(template.id, value, names);
  return {
    ...template,
    format,
    displayValue,
    valueKey: valueKeyOf(template.id, value, displayValue),
    value,
    layoutBase: value,
    hasLayoutRecommendation: false,
    origin,
    originLabel: formatOrigin(origin, names),
    applicable: true,
    sameAsDefault: globalValue !== undefined && effectivelySameAsDefault(template.id, value),
    diagnostics: [],
    recommendationWinsOverGlobal: false,
    recommendationWinsOverWorkspace: false,
  };
}
