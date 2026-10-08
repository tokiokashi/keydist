import type { CodecDiagnostic, DecodedWithDiagnostics } from '#input/codec/index.ts';
import {
  decodeUserLayouts,
  type UserLayout,
} from '#input/layouts/user-layouts.ts';

export const USER_LAYOUTS_STORAGE_KEY = 'keydist:layouts';

/**
 * 保存を読み、捨てたものの診断も返す。保存が無い時は診断なしの空、
 * JSONとして読めない時は空と診断（壊れたまま次の保存で上書きされることを示すため）。
 */
export function loadWithDiagnostics(): DecodedWithDiagnostics<UserLayout[]> {
  try {
    const raw = localStorage.getItem(USER_LAYOUTS_STORAGE_KEY);
    if (!raw) return { value: [], diagnostics: [] };
    return decodeUserLayouts(JSON.parse(raw));
  } catch {
    const diagnostics: CodecDiagnostic[] = [{ path: '', message: '読み取れないため自作の配列を捨てました' }];
    return { value: [], diagnostics };
  }
}

export function load(): UserLayout[] {
  return loadWithDiagnostics().value;
}

export function save(layouts: UserLayout[]) {
  try {
    localStorage.setItem(USER_LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // 保存できなくてもその場の評価は成立する
  }
}
