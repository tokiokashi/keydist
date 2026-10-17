/**
 * 参照先（配列・物理配列・Setup）が手持ちに無い時に画面へ出す文。
 * 失敗の理由の文と、対象の名前の代わりに出す文を、ここだけに書く。
 * どの層からも読めるよう、Setupの解決と同じ`input`に置く。
 */

/** 配列が見つからない時の、失敗の理由。 */
export const LAYOUT_MISSING_REASON = '配列が見つかりません（削除された可能性があります）';
/** 物理配列が見つからない時の、失敗の理由。 */
export const SHAPE_MISSING_REASON = '物理配列が見つかりません（削除された可能性があります）';
/** Setupが見つからない時の、失敗の理由。 */
export const SETUP_MISSING_REASON = 'Setupが削除されました';

/** 見つからない配列の、名前の代わり。 */
export const MISSING_LAYOUT_NAME = '見つからない配列';
/** 見つからない物理配列の、名前の代わり。 */
export const MISSING_SHAPE_NAME = '見つからない物理配列';
/** 見つからないSetupの、名前の代わり。 */
export const MISSING_SETUP_NAME = '削除されたSetup';
/** 見つからないローマ字規則の、名前の代わり。 */
export const MISSING_ROMAJI_RULE_NAME = '見つからないローマ字規則';
/** 見つからない指の割当の、名前の代わり。 */
export const MISSING_FINGER_ASSIGNMENT_NAME = '見つからない指の割当';

/** 既定に選んでいた物理配列が手持ちに無く、代わりの物理配列で測った時の知らせ。 */
export function describeShapeFallback(usedShapeName: string): string {
  return `既定に選んでいた物理配列が見つからないため、「${usedShapeName}」で測りました`;
}
