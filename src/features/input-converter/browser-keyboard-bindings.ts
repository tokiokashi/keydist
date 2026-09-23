import type { PhysicalKeyEvent } from '../../core/input-converter/index.ts';

export type BrowserKeyBindingOverrides = Readonly<
  Record<string, PhysicalKeyEvent['key'] | null>
>;

export interface ThumbKeyBindings {
  readonly leftCodes: readonly string[];
  readonly rightCodes: readonly string[];
}

export const DEFAULT_THUMB_KEY_BINDINGS: ThumbKeyBindings = {
  leftCodes: ['NonConvert'],
  rightCodes: ['Space', 'Convert'],
};

export const EMPTY_BROWSER_KEY_BINDING_OVERRIDES: BrowserKeyBindingOverrides = {};

const LEGACY_THUMB_STORAGE_KEY = 'keydist:input-thumb-key-bindings';
const STORAGE_KEY = 'keydist:input-key-bindings';
const DEFAULT_THUMB_CODES = ['NonConvert', 'Space', 'Convert'] as const;
const MAX_CODES_PER_THUMB = 8;

const uniqueCodes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const code = raw.trim();
    if (code.length === 0 || result.includes(code)) continue;
    result.push(code);
    if (result.length >= MAX_CODES_PER_THUMB) break;
  }
  return result;
};

export function sanitizeThumbKeyBindings(value: unknown): ThumbKeyBindings {
  if (value === null || typeof value !== 'object') {
    return {
      leftCodes: [...DEFAULT_THUMB_KEY_BINDINGS.leftCodes],
      rightCodes: [...DEFAULT_THUMB_KEY_BINDINGS.rightCodes],
    };
  }

  const record = value as Record<string, unknown>;
  const leftCodes = uniqueCodes(record.leftCodes);
  const left = new Set(leftCodes);
  const rightCodes = uniqueCodes(record.rightCodes)
    .filter((code) => !left.has(code));

  return { leftCodes, rightCodes };
}

export function assignThumbKeyCode(
  bindings: ThumbKeyBindings,
  side: 'left' | 'right',
  code: string,
): ThumbKeyBindings {
  const canonical = code.trim();
  if (canonical.length === 0) return bindings;

  const leftCodes = bindings.leftCodes.filter((entry) => entry !== canonical);
  const rightCodes = bindings.rightCodes.filter((entry) => entry !== canonical);

  if (side === 'left') leftCodes.push(canonical);
  else rightCodes.push(canonical);

  return sanitizeThumbKeyBindings({ leftCodes, rightCodes });
}

export function removeThumbKeyCode(
  bindings: ThumbKeyBindings,
  side: 'left' | 'right',
  code: string,
): ThumbKeyBindings {
  return sanitizeThumbKeyBindings({
    leftCodes: side === 'left'
      ? bindings.leftCodes.filter((entry) => entry !== code)
      : bindings.leftCodes,
    rightCodes: side === 'right'
      ? bindings.rightCodes.filter((entry) => entry !== code)
      : bindings.rightCodes,
  });
}

/**
 * browser code overrideへ落とす。
 *
 * 既定thumb codeは一旦nullで無効化してから現在設定を適用するため、
 * Spaceを左親指へ移した時に既定thumb-r mappingが残らない。
 * KeyA等の通常physical codeも明示設定すればthumbへ上書きできる。
 */
export function thumbKeyBindingsToOverrides(
  bindings: ThumbKeyBindings,
): BrowserKeyBindingOverrides {
  const overrides: Record<string, PhysicalKeyEvent['key'] | null> =
    Object.fromEntries(DEFAULT_THUMB_CODES.map((code) => [code, null]));

  for (const code of bindings.leftCodes) overrides[code] = 'thumb-l';
  for (const code of bindings.rightCodes) overrides[code] = 'thumb-r';
  return overrides;
}

export function thumbBindingLabel(
  bindings: ThumbKeyBindings,
  side: 'left' | 'right',
): string {
  const codes = side === 'left' ? bindings.leftCodes : bindings.rightCodes;
  return codes.length === 0 ? '未割当' : codes.join(' / ');
}

export function loadThumbKeyBindings(
  storage?: Pick<Storage, 'getItem'>,
): ThumbKeyBindings {
  if (storage === undefined) {
    return {
      leftCodes: [...DEFAULT_THUMB_KEY_BINDINGS.leftCodes],
      rightCodes: [...DEFAULT_THUMB_KEY_BINDINGS.rightCodes],
    };
  }
  try {
    const raw = storage.getItem(LEGACY_THUMB_STORAGE_KEY);
    if (raw === null) return sanitizeThumbKeyBindings(DEFAULT_THUMB_KEY_BINDINGS);
    return sanitizeThumbKeyBindings(JSON.parse(raw));
  } catch {
    return sanitizeThumbKeyBindings(DEFAULT_THUMB_KEY_BINDINGS);
  }
}

export function saveThumbKeyBindings(
  bindings: ThumbKeyBindings,
  storage?: Pick<Storage, 'setItem'>,
): void {
  if (storage === undefined) return;
  storage.setItem(
    LEGACY_THUMB_STORAGE_KEY,
    JSON.stringify(sanitizeThumbKeyBindings(bindings)),
  );
}


const sanitizeBindingValue = (
  value: unknown,
): PhysicalKeyEvent['key'] | null | undefined =>
  value === null
    ? null
    : typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;

export function sanitizeBrowserKeyBindingOverrides(
  value: unknown,
): BrowserKeyBindingOverrides {
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

export function assignBrowserKeyCode(
  overrides: BrowserKeyBindingOverrides,
  key: PhysicalKeyEvent['key'],
  code: string,
): BrowserKeyBindingOverrides {
  const canonical = code.trim();
  if (canonical.length === 0) return overrides;
  return { ...overrides, [canonical]: key };
}

export function unassignBrowserKeyCode(
  overrides: BrowserKeyBindingOverrides,
  code: string,
): BrowserKeyBindingOverrides {
  const canonical = code.trim();
  if (canonical.length === 0) return overrides;
  return { ...overrides, [canonical]: null };
}

export function loadBrowserKeyBindingOverrides(
  storage?: Pick<Storage, 'getItem'>,
): BrowserKeyBindingOverrides {
  if (storage === undefined) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      return sanitizeBrowserKeyBindingOverrides(JSON.parse(raw));
    }

    const legacyRaw = storage.getItem(LEGACY_THUMB_STORAGE_KEY);
    if (legacyRaw === null) return {};
    return thumbKeyBindingsToOverrides(
      sanitizeThumbKeyBindings(JSON.parse(legacyRaw)),
    );
  } catch {
    return {};
  }
}

export function saveBrowserKeyBindingOverrides(
  overrides: BrowserKeyBindingOverrides,
  storage?: Pick<Storage, 'setItem'>,
): void {
  if (storage === undefined) return;
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify(sanitizeBrowserKeyBindingOverrides(overrides)),
  );
}
