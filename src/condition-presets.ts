import { ARPEGGIO_PRESETS } from './playback-arpeggio.ts';
import {
  DEFAULT_CONDITION_DEFAULTS,
  sanitizeConditionDefaults,
  type UiStateConditionsDefaults,
  type UiStateStorage,
} from './ui-state.ts';

const STORAGE_KEY = 'keydist:condition-presets';

export interface ConditionPreset {
  id: string;
  name: string;
  conditions: UiStateConditionsDefaults;
}

const copyDefaults = (): UiStateConditionsDefaults => structuredClone(DEFAULT_CONDITION_DEFAULTS);

/** 同梱プリセットはコードで固定し、ユーザー保存領域から分離する。 */
export const BUILTIN_CONDITION_PRESETS: readonly ConditionPreset[] = [
  { id: 'standard', name: '標準', conditions: copyDefaults() },
  {
    id: 'strict',
    name: '厳格なアルペジオ',
    conditions: { ...copyDefaults(), arpeggio: structuredClone(ARPEGGIO_PRESETS.strict) },
  },
  {
    id: 'loose',
    name: '緩いアルペジオ',
    conditions: { ...copyDefaults(), arpeggio: structuredClone(ARPEGGIO_PRESETS.loose) },
  },
];

function storageOrUndefined(): UiStateStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeConditionPresets(value: unknown): ConditionPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)
      || typeof candidate.id !== 'string'
      || !candidate.id.startsWith('custom-')
      || typeof candidate.name !== 'string'
      || candidate.name.trim() === ''
      || seen.has(candidate.id)) return [];
    seen.add(candidate.id);
    return [{
      id: candidate.id,
      name: candidate.name.trim(),
      conditions: sanitizeConditionDefaults(candidate.conditions, DEFAULT_CONDITION_DEFAULTS),
    }];
  });
}

export function loadConditionPresets(storage = storageOrUndefined()): ConditionPreset[] {
  if (!storage) return [];
  try {
    return sanitizeConditionPresets(JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveConditionPresets(
  presets: readonly ConditionPreset[],
  storage = storageOrUndefined(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // 保存に失敗しても、現在の設定とその場の切り替えは成立する。
  }
}

export const newConditionPresetId = (): string =>
  `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function allConditionPresets(userPresets: readonly ConditionPreset[]): ConditionPreset[] {
  return [...BUILTIN_CONDITION_PRESETS, ...userPresets].map((preset) => ({
    ...preset,
    conditions: structuredClone(preset.conditions),
  }));
}
