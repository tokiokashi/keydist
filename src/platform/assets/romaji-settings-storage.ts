import type { CodecDiagnostic, DecodedWithDiagnostics } from '#input/codec/index.ts';
import {
  decodeStoredRomajiSettings,
  type RomajiSettings,
} from '#input/romaji/rules.ts';

export const ROMAJI_SETTINGS_STORAGE_KEY = 'keydist:romaji-rules';

/**
 * 保存を読み、捨てたものの診断も返す。保存が無い時は診断なしの空、
 * JSONとして読めない時は空と診断（壊れたまま次の保存で上書きされることを示すため）。
 */
export function loadRomajiSettingsWithDiagnostics(): DecodedWithDiagnostics<RomajiSettings> {
  try {
    const raw = localStorage.getItem(ROMAJI_SETTINGS_STORAGE_KEY);
    if (!raw) return decodeStoredRomajiSettings(undefined);
    return decodeStoredRomajiSettings(JSON.parse(raw));
  } catch {
    const diagnostics: CodecDiagnostic[] = [{ path: '', message: '読み取れないため自作のローマ字規則を捨てました' }];
    return { value: { rules: [], assignments: {} }, diagnostics };
  }
}

export function loadRomajiSettings(): RomajiSettings {
  return loadRomajiSettingsWithDiagnostics().value;
}

export function saveRomajiSettings(settings: RomajiSettings) {
  try {
    localStorage.setItem(ROMAJI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、その場の評価と編集は成立する
  }
}
