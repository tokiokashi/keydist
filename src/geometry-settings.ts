import {
  ALL_FINGERS,
  DEFAULT_FINGER_ASSIGNMENT,
  FINGERS,
  buildGeometry,
  isPresetGeometryKind,
  keyId,
  PHYSICAL_SHAPES,
  resolveKeyId,
  SHIFT_KEY,
  type Finger,
  type ExtraPhysicalKeySpec,
  type FingerAssignment,
  type PhysicalShape,
  type PresetGeometryKind,
  type ThumbKeySpec,
} from './geometry.ts';

export const GEOMETRY_SETTINGS_VERSION = 1;

export interface GeometrySettings {
  assignment: FingerAssignment;
  shape: PhysicalShape;
}

// TODO(#8): 配列定義JSONの書き出し・読み込みへ統合する際、geometrySettingsを同じファイルへ含める方針を検討する。
export interface GeometrySettingsFile {
  version: typeof GEOMETRY_SETTINGS_VERSION;
  settings: GeometrySettings;
}

export const DEFAULT_GEOMETRY_SETTINGS: GeometrySettings = {
  assignment: DEFAULT_FINGER_ASSIGNMENT,
  shape: PHYSICAL_SHAPES['row-staggered'],
};

const isNonThumb = (value: unknown): value is Exclude<Finger, 'LT' | 'RT'> =>
  typeof value === 'string' && FINGERS.includes(value as Exclude<Finger, 'LT' | 'RT'>);

const finite = (value: unknown, fallback: number, min = -100, max = 100): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;

const integer = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rowNumbers(
  value: unknown,
  fallback: number[] | undefined,
  min = -100,
  max = 100,
): number[] | undefined {
  if (value === undefined || value === null) return fallback === undefined ? undefined : [...fallback];
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    return fallback === undefined ? undefined : [...fallback];
  }
  return value.map((candidate, index) => finite(candidate, fallback?.[index] ?? 0, min, max));
}

export function sanitizePhysicalShape(value: unknown, fallback: PhysicalShape): PhysicalShape {
  const source = record(value);
  const rowWidths = Array.isArray(source.rowWidths) && source.rowWidths.length === 4
    ? source.rowWidths.map((width, index) => integer(width, fallback.rowWidths[index] ?? 1, 1, 32))
    : [...fallback.rowWidths];
  const fallbackExtraKeys = fallback.extraKeys
    ?.filter((key) => resolveKeyId(key.id) === key.id)
    .map((key) => ({ ...key })) ?? [];
  const fallbackExtraById = new Map(fallbackExtraKeys.map((key) => [key.id, key]));
  const seenExtraIds = new Set<string>();
  const extraKeys: ExtraPhysicalKeySpec[] = Array.isArray(source.extraKeys)
    ? source.extraKeys.slice(0, 64).flatMap((candidate) => {
      const item = record(candidate);
      if (typeof item.id !== 'string' || item.id.length === 0) return [];
      const canonicalId = resolveKeyId(item.id);
      if (canonicalId !== item.id || seenExtraIds.has(canonicalId)) return [];
      seenExtraIds.add(canonicalId);
      const fallbackKey = fallbackExtraById.get(canonicalId);
      return [{
        id: canonicalId,
        row: integer(item.row, fallbackKey?.row ?? -1, -32, 32),
        col: integer(item.col, fallbackKey?.col ?? 0, -32, 32),
        x: finite(item.x, fallbackKey?.x ?? 0, -32, 32),
        y: finite(item.y, fallbackKey?.y ?? 0, -32, 32),
        ...(item.width === undefined
          ? (fallbackKey?.width === undefined ? {} : { width: fallbackKey.width })
          : { width: finite(item.width, fallbackKey?.width ?? 1, 0.25, 16) }),
      }];
    })
    : fallbackExtraKeys;
  const fallbackThumbs = fallback.thumbs.map((thumb) => ({ ...thumb }));
  const thumbs: ThumbKeySpec[] = Array.isArray(source.thumbs)
    ? source.thumbs.flatMap((candidate, index) => {
      const item = record(candidate);
      const fallbackThumb = fallbackThumbs[index];
      if (!fallbackThumb || typeof item.id !== 'string' || (item.finger !== 'LT' && item.finger !== 'RT')) return [];
      return [{
        id: item.id,
        finger: item.finger,
        col: finite(item.col, fallbackThumb.col, -32, 32),
        y: finite(item.y, fallbackThumb.y, -32, 32),
      }];
    })
    : fallbackThumbs;
  const usableThumbs = thumbs.length > 0 && thumbs.some((thumb) => thumb.finger === 'LT')
    && thumbs.some((thumb) => thumb.finger === 'RT')
    ? thumbs
    : fallbackThumbs;
  const reservedIds = new Set([
    ...usableThumbs.map((thumb) => resolveKeyId(thumb.id)),
    SHIFT_KEY.L,
    SHIFT_KEY.R,
  ]);
  rowWidths.forEach((width, row) => {
    for (let col = 0; col < width; col++) reservedIds.add(keyId(row, col));
  });
  const usableExtraKeys = extraKeys.filter((key) => !reservedIds.has(key.id));
  const thumbHomeSource = record(source.thumbHome);
  const thumbHome: Partial<Record<'LT' | 'RT', string>> = {};
  for (const finger of ['LT', 'RT'] as const) {
    if (typeof thumbHomeSource[finger] === 'string'
      && usableThumbs.some((thumb) => thumb.finger === finger && thumb.id === thumbHomeSource[finger])) {
      thumbHome[finger] = thumbHomeSource[finger] as string;
    } else if (fallback.thumbHome?.[finger] !== undefined) {
      thumbHome[finger] = fallback.thumbHome[finger];
    }
  }
  const result: PhysicalShape = {
    id: typeof source.id === 'string' && source.id.length > 0 ? source.id : fallback.id,
    name: typeof source.name === 'string' && source.name.length > 0 ? source.name : fallback.name,
    pitchMm: finite(source.pitchMm, fallback.pitchMm, 1, 100),
    rowWidths,
    ...(usableExtraKeys.length === 0 ? {} : { extraKeys: usableExtraKeys }),
    thumbs: usableThumbs,
    ...(rowNumbers(source.rowStagger, fallback.rowStagger, -32, 32) === undefined
      ? {}
      : { rowStagger: rowNumbers(source.rowStagger, fallback.rowStagger, -32, 32) }),
    ...(rowNumbers(source.columnStagger, fallback.columnStagger, -32, 32) === undefined
      ? {}
      : { columnStagger: rowNumbers(source.columnStagger, fallback.columnStagger, -32, 32) }),
    ...(source.splitAt === undefined || source.splitAt === null
      ? (fallback.splitAt === undefined ? {} : { splitAt: fallback.splitAt })
      : { splitAt: integer(source.splitAt, fallback.splitAt ?? 0, 0, 32) }),
    ...(source.splitGap === undefined || source.splitGap === null
      ? (fallback.splitGap === undefined ? {} : { splitGap: fallback.splitGap })
      : { splitGap: finite(source.splitGap, fallback.splitGap ?? 0, 0, 32) }),
    ...(Object.keys(thumbHome).length === 0 ? {} : { thumbHome }),
  };
  return result;
}

function fallbackKeyFinger(column: number): Exclude<Finger, 'LT' | 'RT'> {
  const fingers: Exclude<Finger, 'LT' | 'RT'>[] = [
    'LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP',
  ];
  return fingers[Math.min(column, fingers.length - 1)] ?? 'RP';
}

function sanitizeAssignment(value: unknown, fallback: FingerAssignment, shape: PhysicalShape): FingerAssignment {
  const source = record(value);
  const sourceKeyFinger = record(source.keyFinger);
  const fallbackKeyFingerMap = record(fallback.keyFinger);
  const keyFinger: Record<string, Exclude<Finger, 'LT' | 'RT'>> = {};
  shape.rowWidths.forEach((width, row) => {
    for (let col = 0; col < width; col++) {
      const id = keyId(row, col);
      const candidate = sourceKeyFinger[id] ?? fallbackKeyFingerMap[id];
      keyFinger[id] = isNonThumb(candidate) ? candidate : fallbackKeyFinger(col);
    }
  });
  for (const key of shape.extraKeys ?? []) {
    const candidate = sourceKeyFinger[key.id] ?? fallbackKeyFingerMap[key.id];
    keyFinger[key.id] = isNonThumb(candidate)
      ? candidate
      : fallbackKeyFinger(Math.max(0, Math.round(key.x)));
  }

  const sourceHomeKey = record(source.homeKey);
  const fallbackHomeKey = record(fallback.homeKey);
  const homeKey = {} as FingerAssignment['homeKey'];
  const defaultHomeColumns: Record<Exclude<Finger, 'LT' | 'RT'>, number> = {
    LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9,
  };
  for (const finger of FINGERS) {
    const candidate = sourceHomeKey[finger] ?? fallbackHomeKey[finger];
    const defaultId = keyId(2, Math.min(defaultHomeColumns[finger], (shape.rowWidths[2] ?? 1) - 1));
    homeKey[finger] = typeof candidate === 'string' && keyFinger[candidate] !== undefined
      ? candidate
      : (keyFinger[defaultId] !== undefined ? defaultId : keyId(2, 0));
  }

  return {
    id: typeof source.id === 'string' && source.id.length > 0 ? source.id : fallback.id,
    name: typeof source.name === 'string' && source.name.length > 0 ? source.name : fallback.name,
    keyFinger,
    homeKey,
  };
}

export function cloneGeometrySettings(settings: GeometrySettings): GeometrySettings {
  return structuredClone(settings);
}

export function clonePhysicalShape(shape: PhysicalShape): PhysicalShape {
  return structuredClone(shape);
}

export function geometrySettingsForPreset(kind: PresetGeometryKind): GeometrySettings {
  return {
    assignment: DEFAULT_FINGER_ASSIGNMENT,
    shape: PHYSICAL_SHAPES[kind],
  };
}

export function sanitizeGeometrySettings(value: unknown, fallback = DEFAULT_GEOMETRY_SETTINGS): GeometrySettings {
  const source = record(value);
  const rawShape = record(source.shape);
  const emptyOffsetFallback: PhysicalShape = {
    ...fallback.shape,
    rowStagger: undefined,
    columnStagger: undefined,
    splitAt: undefined,
    splitGap: undefined,
    thumbHome: undefined,
  };
  const shapeFallback = typeof rawShape.id === 'string' && isPresetGeometryKind(rawShape.id)
    ? PHYSICAL_SHAPES[rawShape.id]
    : typeof rawShape.id === 'string' && rawShape.id.startsWith('shape-')
      ? emptyOffsetFallback
    : fallback.shape;
  const shape = sanitizePhysicalShape(rawShape, shapeFallback);
  const assignment = sanitizeAssignment(source.assignment, fallback.assignment, shape);
  try {
    buildGeometry(shape, assignment);
    return { shape, assignment };
  } catch {
    return cloneGeometrySettings(fallback);
  }
}

export function geometrySettingsFile(settings: GeometrySettings): GeometrySettingsFile {
  return { version: GEOMETRY_SETTINGS_VERSION, settings: cloneGeometrySettings(settings) };
}

export function serializeGeometrySettings(settings: GeometrySettings): string {
  return JSON.stringify(geometrySettingsFile(settings), null, 2);
}

export function parseGeometrySettings(source: string, fallback = DEFAULT_GEOMETRY_SETTINGS): GeometrySettings {
  try {
    const parsed = JSON.parse(source) as unknown;
    const value = record(parsed);
    if (value.version !== GEOMETRY_SETTINGS_VERSION || !value.settings) throw new Error('設定ファイルのバージョンが違う');
    return sanitizeGeometrySettings(value.settings, fallback);
  } catch (error) {
    throw error instanceof Error ? error : new Error('設定ファイルを読み込めない');
  }
}

export const isFinger = (value: unknown): value is Finger =>
  typeof value === 'string' && ALL_FINGERS.includes(value as Finger);
