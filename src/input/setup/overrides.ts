import { levelOverrides, withLevelOverrides, type CascadeOverrides } from '#input/settings/index.ts';

/**
 * Setup固有の上書きの置き場についての判断（#544 §4）。
 *
 * 選択肢は2つ:
 *   (a) `Setup` オブジェクトの中に上書きの値そのものを持つ
 *   (b) カスケードの `setup` レベル（`CascadeOverrides.setup[id]`）に置く（levels.ts参照）
 *
 * ここでは (b) を選ぶ。
 *
 * - カスケードはすでに `setup` レベルを持っている。読み書き・妥当性判定・出どころ表示
 *   （`levelOverrides` / `withLevelOverrides` / `setOverride` / `resetItem` / `resetLevel` /
 *   `resolveCascade`）はレベルの種類を問わず同じ形で扱える。Setup側にも上書きを持たせると、
 *   「Setup用の書き込み・検証・codec」をカスケードとは別にもう1本作ることになり、
 *   両者が食い違いうる状態を増やす
 * - コマンド層（Phase 2の別項目、#544 §8-2）は「書き込むレベルを必ず指定する」設計。
 *   カスケード1本に寄せておけば、Setupへの上書きの書き込みも既存のコマンドの形にそのまま乗る
 * - Undoの単位は「コマンドの履歴1本」に決まっている（#544 issueコメント）。カスケードの
 *   上書き1本の履歴で足りる。Setup側にも状態を持たせると、1回のUndoがどちらの状態を
 *   戻すのか、順序をどう揃えるのかという別の問題が生まれる
 * - 共有リンクはSetup本体（配列id・形状id・ラベル）とカスケードの該当上書きを別々に運べる。
 *   Setup単体を共有しても、受け取り側のグローバル設定に従って実効値が決まる
 *   （#544 §4「ユーザーが保存するのは配列・形状・Setup固有の上書きの3つ」の3つ目が、
 *   すでにカスケードの上書きの形をしている）
 *
 * この場所を選んだことで、Setupの削除・複製はカスケードの `setup` レベルも一緒に
 * 操作する必要がある。下の2関数がそれを行う（collection.ts の `deleteSetup` /
 * `duplicateSetup` から呼ぶ）。
 */
export function copySetupOverrides<V>(
  overrides: CascadeOverrides<V>,
  fromSetupId: string,
  toSetupId: string,
): CascadeOverrides<V> {
  const source = levelOverrides(overrides, { kind: 'setup', setupId: fromSetupId });
  if (source === undefined) return overrides;
  return withLevelOverrides(overrides, { kind: 'setup', setupId: toSetupId }, { ...source });
}

export function dropSetupOverrides<V>(
  overrides: CascadeOverrides<V>,
  setupId: string,
): CascadeOverrides<V> {
  return withLevelOverrides(overrides, { kind: 'setup', setupId }, undefined);
}
