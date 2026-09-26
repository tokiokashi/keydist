import {
  sanitizeRomajiSettings,
  type RomajiSettings,
} from '#input/romaji/rules.ts';

export const ROMAJI_SETTINGS_STORAGE_KEY = 'keydist:romaji-rules';

export function loadRomajiSettings(): RomajiSettings {
  try {
    const raw = localStorage.getItem(ROMAJI_SETTINGS_STORAGE_KEY);
    if (!raw) return { rules: [], assignments: {} };
    return sanitizeRomajiSettings(JSON.parse(raw));
  } catch {
    return { rules: [], assignments: {} };
  }
}

export function saveRomajiSettings(settings: RomajiSettings) {
  try {
    localStorage.setItem(ROMAJI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、その場の評価と編集は成立する
  }
}
