import { COMPARISON_COLUMN_TEXT, COMPARISON_UNIT_NOTE, type ComparisonColumnId } from '../comparison-column-text.ts';
import type { ScatterAxes, ScatterContour } from './axes.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';

/**
 * 散布図の「図の見方」のⓘの中身。点の色と形、軸と細い線の量の名前と説明、3つの量の関係を出す。
 * 量の名前と説明は比較表の列（`comparison-column-text.ts`）のものをそのまま使い、ここでは書き直さない。
 * Reactに依存させない（文の組み立てをunit testで検査するため）。
 */

/** 名前か説明に距離の単位uが出る列か。 */
export function mentionsUnit(column: ComparisonColumnId): boolean {
  const { label, description } = COMPARISON_COLUMN_TEXT[column];
  return /(^|[^A-Za-z])u($|[^A-Za-z])/u.test(`${label}\n${description}`);
}

/** `InfoButton`の`help`に渡せる形（`ui/primitives/info-button.tsx`の`InfoHelp`と同じ。純粋なファイルからはUIをimportできない）。 */
export interface ScatterHelp {
  readonly notes: readonly string[];
  readonly listLabel: string;
  readonly items: readonly { readonly name: string; readonly description: string }[];
}

export interface ScatterQuantityHelp {
  /** ⓘの先頭の文。点の色と形。 */
  readonly description: string;
  readonly help: ScatterHelp;
}

export function scatterQuantityHelp(axes: ScatterAxes, contour: ScatterContour | undefined): ScatterQuantityHelp {
  const description = `${SCATTER_KIND_ORDER.map((kind) => `${SCATTER_KIND_STYLES[kind].colorName}の${SCATTER_KIND_STYLES[kind].shapeName}は${SCATTER_KIND_STYLES[kind].label}`).join('、')}です。`;
  const quantities: { readonly role: string; readonly column: ComparisonColumnId }[] = [
    { role: '横軸', column: axes.x },
    { role: '縦軸', column: axes.y },
  ];
  const notes: string[] = [];
  if (contour !== undefined) {
    quantities.push({ role: '細い線', column: contour.column });
    notes.push(
      `細い線は、${COMPARISON_COLUMN_TEXT[contour.column].label}が同じになる位置を結んでいます。3つの量の関係は、${contour.relation}です。線の端に値を書いています。`,
    );
  }
  if (quantities.some(({ column }) => mentionsUnit(column))) notes.push(COMPARISON_UNIT_NOTE);
  return {
    description,
    help: {
      notes,
      listLabel: '図の量',
      items: quantities.map(({ role, column }) => ({
        name: `${role}　${COMPARISON_COLUMN_TEXT[column].label}`,
        description: COMPARISON_COLUMN_TEXT[column].description,
      })),
    },
  };
}
