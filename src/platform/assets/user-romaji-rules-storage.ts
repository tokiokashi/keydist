/**
 * 自作のローマ字規則（`readonly UserRomajiRule[]`）の保存先キー。
 * 版付きのcodec（`USER_ROMAJI_RULES_CODEC`、`input/romaji/user-rules-codec.ts`）の文書を書く。
 * 版を持たない旧形式の`keydist:romaji-rules`とは別のキーにして、互いの値を読み違えない。
 */
export const USER_ROMAJI_RULES_STORAGE_KEY = 'keydist:user-romaji-rules';
