import { guardedSetItem } from '#platform/persistence/storage-write.ts';
import type { BrowserKeyBindingOverrides } from '#input/shapes/browser-key-codes.ts';
import type { PhysicalKeyEvent } from './engine/index.ts';

const STORAGE_KEY = 'keydist:input-key-bindings';

const sanitizeBindingValue = (value: unknown): PhysicalKeyEvent['key'] | null | undefined =>
  value === null ? null : typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

export function sanitizeBrowserKeyBindingOverrides(value: unknown): BrowserKeyBindingOverrides {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, PhysicalKeyEvent['key'] | null> = {};
  for (const [rawCode, rawKey] of Object.entries(value as Record<string, unknown>)) {
    const code = rawCode.trim();
    const key = sanitizeBindingValue(rawKey);
    if (code.length === 0 || key === undefined) continue;
    result[code] = key;
  }
  return result;
}

export function assignBrowserKeyCode(overrides: BrowserKeyBindingOverrides, key: PhysicalKeyEvent['key'], code: string): BrowserKeyBindingOverrides {
  const canonical = code.trim();
  if (canonical.length === 0) return overrides;
  return { ...overrides, [canonical]: key };
}

export function unassignBrowserKeyCode(overrides: BrowserKeyBindingOverrides, code: string): BrowserKeyBindingOverrides {
  const canonical = code.trim();
  if (canonical.length === 0) return overrides;
  return { ...overrides, [canonical]: null };
}

export function loadBrowserKeyBindingOverrides(storage?: Pick<Storage, 'getItem'>): BrowserKeyBindingOverrides {
  if (storage === undefined) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? {} : sanitizeBrowserKeyBindingOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveBrowserKeyBindingOverrides(overrides: BrowserKeyBindingOverrides, storage?: Pick<Storage, 'setItem'>): void {
  if (storage === undefined) return;
  guardedSetItem(storage, STORAGE_KEY, JSON.stringify(sanitizeBrowserKeyBindingOverrides(overrides)));
}
