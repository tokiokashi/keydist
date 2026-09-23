export interface TesterSelection {
  readonly layoutId?: string;
  readonly geometryId?: string;
}

const STORAGE_KEY = 'keydist:input-tester-selection';

const sanitizeId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id.length > 0 ? id : undefined;
};

export function sanitizeTesterSelection(value: unknown): TesterSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    layoutId: sanitizeId(record.layoutId),
    geometryId: sanitizeId(record.geometryId),
  };
}

export function loadTesterSelection(
  storage?: Pick<Storage, 'getItem'>,
): TesterSelection {
  if (storage === undefined) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? {} : sanitizeTesterSelection(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveTesterSelection(
  selection: Required<TesterSelection>,
  storage?: Pick<Storage, 'setItem'>,
): void {
  if (storage === undefined) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeTesterSelection(selection)));
}
