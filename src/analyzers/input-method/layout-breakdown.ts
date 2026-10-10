import {
  aggregationLegendMap,
  aggregationTriggerDisplayText,
  classifyPresentationFaces,
  displayTriggerAlternatives,
  displayTriggerKeys,
  faceCells,
  faceDisplayCells,
  layerDefinitionsWithLabels,
  triggerChordsDisplayText,
} from '#input/layouts/layers.ts';
import { resolveKeyId, type PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import type { Face, Layout } from '#input/layouts/types.ts';

/**
 * 配列の定義から出す、修飾の一覧・コンボ表・コンボの配列図の材料（純粋な計算）。
 *
 * 押下の数え方には関わらない。配列は、評価するテキストの打ち方で使えるコンボだけに
 * 絞られた形（`ResolvedInput.layout`）を渡す。英文を打つ時にローマ字の時だけ使うコンボは、
 * 配列に無いものとして扱われるので、ここでは何も除かない。
 */

/** 修飾のレイヤー1つぶん。 */
export interface ModifierRow {
  readonly id: string;
  readonly label: string;
  /** 修飾を成立させる押し方 */
  readonly trigger: string;
  /** 修飾の下で出る文字 */
  readonly outputs: string;
}

/** コンボ表の1行。 */
export interface ComboRow {
  readonly trigger: string;
  readonly output: string;
}

/** コンボの配列図1枚ぶん。 */
export interface ComboDiagramItem {
  /** 選ぶ時に出す名前 */
  readonly label: string;
  /** コンボを成立させる物理キーid */
  readonly triggerKeys: readonly string[];
  /** 物理キーid → 出る文字 */
  readonly outputs: ReadonlyMap<string, string>;
}

function faceTriggerText(layout: Layout, face: Face, standard: PhysicalKeyboardStandard | undefined): string {
  return face.presentationTriggerText
    ?? triggerChordsDisplayText(layout, displayTriggerAlternatives(face), standard);
}

/** コンボ枠に計上すると宣言された面。面を持たない配列は空。 */
function faceCombos(layout: Layout): readonly Face[] {
  return (layout.faces?.length ?? 0) === 0 ? [] : classifyPresentationFaces(layout).combos;
}

/** 表示区分が修飾のレイヤー。宣言の順。 */
export function modifierRows(layout: Layout): ModifierRow[] {
  return layerDefinitionsWithLabels(layout)
    .filter((definition) => definition.kind === 'layer' && definition.presentationRole === 'modifier')
    .map((definition) => ({
      id: definition.id,
      label: definition.label,
      trigger: aggregationTriggerDisplayText(layout, definition.id),
      outputs: [...new Set([...aggregationLegendMap(layout, definition.id).values()])].join(' / '),
    }));
}

/**
 * コンボ表の行。配列のコンボ定義を1件ずつ並べ、コンボ枠に計上すると宣言された面は
 * 面ごとに1行を足す（面の行は複数の出力をまとめるので、行数は仕様 §11.8の `B` と一致しない）。
 */
export function comboRows(layout: Layout, standard: PhysicalKeyboardStandard | undefined): ComboRow[] {
  const faceRows = faceCombos(layout).map((face): ComboRow => ({
    trigger: faceTriggerText(layout, face, standard),
    output: [...faceCells(face).values()].join(' / '),
  }));
  const definitionRows = (layout.resolvedComboDefinitions ?? []).map((combo): ComboRow => ({
    trigger: `${combo.group ? `${combo.group}: ` : ''}${combo.inputs.join(' + ')}`,
    output: combo.output,
  }));
  return [...faceRows, ...definitionRows];
}

/**
 * コンボの配列図の材料。コンボ枠に計上すると宣言された面は面ごとに1枚。コンボ定義は、
 * 同じ組・同じ押し方で別のキーを押すものを1枚にまとめる。
 */
export function comboDiagramItems(layout: Layout, standard: PhysicalKeyboardStandard | undefined): ComboDiagramItem[] {
  const faceItems = faceCombos(layout).map((face): ComboDiagramItem => ({
    label: faceTriggerText(layout, face, standard),
    triggerKeys: [...new Set(displayTriggerKeys(face).map(resolveKeyId))],
    outputs: faceDisplayCells(face),
  }));

  const folded = new Map<string, { label: string; triggerKeys: readonly string[]; outputs: Map<string, string> }>();
  for (const combo of layout.resolvedComboDefinitions ?? []) {
    if (combo.foldTriggerInputs === undefined || combo.foldTriggerKeys === undefined || combo.foldTargetKey === undefined) continue;
    const group = combo.group ?? 'コンボ';
    const id = `${group}\0${combo.foldTriggerKeys.join('\0')}`;
    const item = folded.get(id) ?? {
      label: `${group}: ${combo.foldTriggerInputs.join(' + ')}`,
      triggerKeys: combo.foldTriggerKeys.map(resolveKeyId),
      outputs: new Map<string, string>(),
    };
    item.outputs.set(resolveKeyId(combo.foldTargetKey), combo.output);
    folded.set(id, item);
  }
  return [...faceItems, ...folded.values()];
}
