import { resolveSettings, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import { comboSetSpellingDiffers, overlaySetupComboSet, type SetupComboSetStatus } from '#engine/setup-combo-set.ts';
import { isBuiltin, ROMAJI_RULES } from '#input/romaji/rules.ts';
import { layoutKind } from '#input/layouts/kind.ts';
import {
  deriveInputMethod,
  effectiveLabel,
  MISSING_LAYOUT_NAME,
  MISSING_SHAPE_NAME,
  nameTargets,
  resolveSetup,
  type Setup,
  type SetupCatalog,
  type TargetNameSource,
} from '#input/setup/index.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import {
  nonDefaultConditionRows,
  summarizeNonDefaultConditions,
  traceConditionSummary,
  withComboSetSummary,
  type ConditionSummaryRow,
} from '#hosts/shared/condition-summary.ts';

/**
 * Setupの編集画面（`SetupPage.tsx`）の、表示の計算。Setupの条件はテキストに依らないので、
 * 打ち方はかな配列ならかな直接、英字の配列ならローマ字入力として求める（ローマ字規則の行が効く打ち方）。
 */

/** Setupのレベルの編集画面に行を出さない項目。Setupは自分の物理配列を持ち、解釈の項目はSetupのレベルに置かない。 */
export const SETUP_HIDDEN_ITEM_IDS = ['defaultShapeId', 'chainInterpretation', 'arpeggioInterpretation'] as const;

export interface SetupListItem {
  readonly setup: Setup;
  /** 一覧に並ぶ集合に対して計算した表示名。 */
  readonly displayName: string;
  /** 集合によらない、配列・物理配列・条件を全部含む名前。 */
  readonly fullName: string;
}

/** 配列と物理配列が手持ちにあれば、そのSetupの条件の行。無ければ`undefined`。 */
export function setupConditionRows(setup: Setup, catalog: PaneCatalog, overrides: SettingsCascadeOverrides): readonly ConditionSummaryRow[] | undefined {
  const layout = catalog.setupCatalog.layouts.get(setup.layoutId);
  if (layout === undefined) return undefined;
  const derivation = deriveInputMethod('ja', layoutKind(layout, catalog.userLayouts));
  if (!derivation.ok) return undefined;
  const resolution = resolveSetup(setup, catalog.setupCatalog, derivation.inputMethod);
  if (!resolution.ok) return undefined;
  return traceConditionSummary(resolveSettings(overrides, resolution.context), catalog.setupCatalog);
}

function failedDescription(setup: Setup, catalog: SetupCatalog): string {
  const layoutName = catalog.layouts.get(setup.layoutId)?.name ?? MISSING_LAYOUT_NAME;
  const shapeName = catalog.shapes.get(setup.shapeId)?.name ?? MISSING_SHAPE_NAME;
  return `${layoutName}/${shapeName}`;
}

/** 手持ちのSetup全部を同じ画面に並ぶ集合として名前を付ける。 */
export function setupListItems(setups: readonly Setup[], catalog: PaneCatalog, overrides: SettingsCascadeOverrides): readonly SetupListItem[] {
  const sources = setups.map((setup): TargetNameSource => {
    const label = effectiveLabel(setup.label);
    const base = {
      key: setup.id,
      kind: 'setup' as const,
      setupNumber: setup.number,
      ...(label === undefined ? {} : { label }),
    };
    const rows = setupConditionRows(setup, catalog, overrides);
    if (rows === undefined) return { ...base, failed: true, description: failedDescription(setup, catalog.setupCatalog) };
    // 選んだコンボの組は数値を変えるので、変えた条件と同じく名前の併記に入れる（仕様 §4.3）
    const comboName = setup.comboSetId === undefined ? undefined : catalog.comboSets?.get(setup.comboSetId)?.name;
    const overrideSummary = withComboSetSummary(summarizeNonDefaultConditions(nonDefaultConditionRows(rows)), comboName);
    return {
      ...base,
      layoutName: catalog.setupCatalog.layouts.get(setup.layoutId)!.name,
      shapeName: catalog.setupCatalog.shapes.get(setup.shapeId)!.name,
      ...(overrideSummary === undefined ? {} : { overrideSummary }),
    };
  });
  const named = nameTargets(sources);
  return setups.map((setup, index) => ({
    setup,
    displayName: named[index]!.displayName,
    fullName: named[index]!.fullName,
  }));
}

/** Setupの画面に出す、コンボの組の状態。組を選べない配列（かな配列・見つからない配列）は`undefined`。 */
export interface SetupComboSetView {
  readonly status: SetupComboSetStatus;
  /** 組の基準の綴りと、Setupの実効のローマ字規則が違い、組を作り直す必要がある。 */
  readonly spellingDiffers: boolean;
  /** 実効のローマ字規則の名前。違いを伝える文に使う。 */
  readonly effectiveRuleName: string | undefined;
  /** 組の基準の綴りの名前。見つからなければ`undefined`。 */
  readonly comboSetRuleName: string | undefined;
  /** 組を選べない配列か（かな配列。ローマ字を経ないので組のコンボが成立しない）。 */
  readonly selectable: boolean;
}

/** Setupが選んだコンボの組の状態。配列が手持ちに無いSetupは`undefined`。 */
export function setupComboSetView(setup: Setup, catalog: PaneCatalog, overrides: SettingsCascadeOverrides): SetupComboSetView | undefined {
  const layout = catalog.setupCatalog.layouts.get(setup.layoutId);
  if (layout === undefined) return undefined;
  const kind = layoutKind(layout, catalog.userLayouts);
  const overlay = overlaySetupComboSet(setup, layout, kind, catalog.comboSets);
  const derivation = deriveInputMethod('ja', kind);
  const resolution = derivation.ok ? resolveSetup(setup, catalog.setupCatalog, derivation.inputMethod) : undefined;
  const cascade = resolution?.ok === true ? resolveSettings(overrides, resolution.context) : undefined;
  const ruleItem = cascade?.romajiRuleId;
  const effectiveRuleId = ruleItem?.applicable === true ? ruleItem.value : null;
  const comboSet = overlay.status.kind === 'applied' || overlay.status.kind === 'kana-layout' ? overlay.status.comboSet : undefined;
  const ruleName = (id: string): string | undefined =>
    catalog.setupCatalog.romajiRules?.get(id)?.name ?? (isBuiltin(id) ? ROMAJI_RULES[id].name : undefined);
  const effectiveRuleName = effectiveRuleId === null ? undefined : ruleName(effectiveRuleId);
  return {
    status: overlay.status,
    spellingDiffers: comboSet !== undefined && comboSetSpellingDiffers(comboSet, effectiveRuleId),
    effectiveRuleName,
    comboSetRuleName: comboSet === undefined ? undefined : ruleName(comboSet.romajiRuleId),
    selectable: kind !== 'kana',
  };
}
