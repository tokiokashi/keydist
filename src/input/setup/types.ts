/**
 * Setup（#544 §4 / docs/architecture.md 用語表）。計算の単位 = 配列 × 物理形状 × ポリシー。
 *
 * ユーザーが保存するのは「配列・物理形状・Setup固有の上書き」の3つだけ（#544 §4）。
 * このうち上書きは、この型ではなくカスケードの `setup` レベル（`CascadeOverrides.setup[id]`）
 * に置く。理由は overrides.ts の先頭コメントにまとめてある。そのため `Setup` 自身は
 * ポリシーの値もTraceも持たない。ポリシーの実効値はカスケードから、Traceは
 * Setup + テキストから求める（#544 §1・§4）。
 *
 * mode（en/ja）は持たない（docs/architecture.mdの「使わない語」）。Setupがどのテキストに
 * 使えるかは打ち方の導出（Phase 2の別項目）が判断する。その項目が要る情報は `layoutId` から
 * 配列を引けば足りる（配列がローマ字表を持つか＝ `Layout.romajiTable` で「打ち方」の種類が
 * 決まる。#544用語集）ので、Setupに別枠でフィールドを足さない。
 */
export interface Setup {
  readonly id: string;
  readonly layoutId: string;
  readonly shapeId: string;
  /**
   * ユーザーが付けたラベル。名前と色は「配列名 + 形状名」から自動で付け、
   * 同名になる時だけユーザーがラベルを付ける（#544 §4）。表示名の決め方は naming.ts。
   */
  readonly label?: string;
}

/**
 * Setupの新規idを払い出す関数。`input` は純粋層で `crypto.randomUUID` 等のブラウザ/Node APIを
 * 直接使わない（AGENTS.md「計算部はDOMに依存させない」、#544 §8-2）ため、呼び出し側
 * （将来のコマンド層・app）が注入する。ユニークさの保証は呼び出し側の責任とする
 * （このモジュールは払い出されたidをそのまま使うだけで、衝突検出はしない）。
 */
export type SetupIdGenerator = () => string;
