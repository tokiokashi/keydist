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
