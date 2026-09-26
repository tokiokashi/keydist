import {
  sanitizeUserLayouts,
  type UserLayout,
} from '#input/layouts/user-layouts.ts';

export const USER_LAYOUTS_STORAGE_KEY = 'keydist:layouts';

export function load(): UserLayout[] {
  try {
    const raw = localStorage.getItem(USER_LAYOUTS_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeUserLayouts(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function save(layouts: UserLayout[]) {
  try {
    localStorage.setItem(USER_LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // 保存できなくてもその場の評価は成立する
  }
}
