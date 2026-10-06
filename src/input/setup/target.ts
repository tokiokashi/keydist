/**
 * 対象（`AnalysisTarget`、docs/architecture.md 用語表「対象」）。
 *
 * Analyzerが見るものは**配列**（カスケードの実効値をそのまま使う。物理配列はカスケードの
 * グローバル項目「既定の物理配列」から決める。`engine/settings-items.ts`の`defaultShapeId`）か
 * **Setup**（配列 × 物理配列 × 上書き）のどちらか。旧Setup 18件を自動生成する案は
 * 採らず、対象そのものを
 * 「配列」か「Setup」で選べるようにすることで、上書きを持たない配列をSetupという器を
 * 作らずに対象にできるようにした。
 *
 * Setupは「上書きを持ちたい時にだけ作る」資産のまま（用語表参照）。
 */
export type AnalysisTarget =
  | { readonly kind: 'layout'; readonly layoutId: string }
  | { readonly kind: 'setup'; readonly setupId: string };

/** 対象の同一性。Map/Reactのkeyにも使える文字列。 */
export function analysisTargetKey(target: AnalysisTarget): string {
  return target.kind === 'layout' ? `layout:${target.layoutId}` : `setup:${target.setupId}`;
}

export function sameAnalysisTarget(a: AnalysisTarget, b: AnalysisTarget): boolean {
  return analysisTargetKey(a) === analysisTargetKey(b);
}

/** 対象の列に含まれる配列のid（重複なし）。Setupの対象は物理配列を自分で持つので含めない。 */
export function layoutIdsOfTargets(targets: readonly AnalysisTarget[]): readonly string[] {
  const ids = new Set<string>();
  for (const target of targets) {
    if (target.kind === 'layout') ids.add(target.layoutId);
  }
  return [...ids];
}

/** 対象の既定値。手持ちが空でも必ず選べる（QWERTYは英語直接入力・ローマ字入力のどちらでも使える）。 */
export const DEFAULT_ANALYSIS_TARGET: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
