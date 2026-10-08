/**
 * 自作の配列（`readonly UserLayout[]`）の保存先キー。
 * 版付きのcodec（`USER_LAYOUTS_CODEC`、`input/layouts/user-layouts.ts`）の文書を書く。
 * 版を持たない旧形式の`keydist:layouts`とは別のキーにして、互いの値を読み違えない。
 */
export const USER_LAYOUTS_ASSET_STORAGE_KEY = 'keydist:user-layouts';
