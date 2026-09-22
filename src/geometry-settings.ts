import {
  ALL_FINGERS,
  DEFAULT_FINGER_ASSIGNMENT,
  FINGERS,
  buildGeometry,
  defaultFingerForColumn,
  isPresetGeometryKind,
  keyId,
  PHYSICAL_SHAPES,
  type ExtraPhysicalKeySpec,
  type Finger,
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

  const reservedIds = new Set<string>();
  rowWidths.forEach((width, row) => {
    for (let col = 0; col < width; col++) reservedIds.add(keyId(row, col));
  });
  for (const thumb of usableThumbs) reservedIds.add(thumb.id);

  const seenExtraIds = new Set<string>();
  const fallbackExtraKeys = fallback.extraKeys?.map((key) => ({ ...key })) ?? [];
  const extraKeys: ExtraPhysicalKeySpec[] = Array.isArray(source.extraKeys)
    ? source.extraKeys.flatMap((candidate) => {
      const item = record(candidate);
      if (typeof item.id !== 'string' || item.id.length === 0) return [];
      if (reservedIds.has(item.id) || seenExtraIds.has(item.id)) return [];
      if (
        typeof item.x !== 'number' || !Number.isFinite(item.x)
        || typeof item.y !== 'number' || !Number.isFinite(item.y)
        || typeof item.row !== 'number' || !Number.isFinite(item.row)
        || typeof item.col !== 'number' || !Number.isFinite(item.col)
      ) return [];
      seenExtraIds.add(item.id);
      return [{
        id: item.id,
        x: finite(item.x, 0, -64, 64),
        y: finite(item.y, 0, -64, 64),
        row: finite(item.row, 0, -64, 64),
        col: finite(item.col, 0, -64, 64),
        ...(item.width === undefined
          ? {}
          : { width: finite(item.width, 1, 0.25, 16) }),
      }];
    })
    : fallbackExtraKeys;

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
    thumbs: usableThumbs,
    ...(extraKeys.length === 0 ? {} : { extraKeys }),
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

function sanitizeAssignment(value: unknown, fallback: FingerAssignment, shape: PhysicalShape): FingerAssignment {
  const source = record(value);
  const sourceKeyFinger = record(source.keyFinger);
  const fallbackKeyFingerMap = record(fallback.keyFinger);
  const keyFinger: Record<string, Exclude<Finger, 'LT' | 'RT'>> = {};
  shape.rowWidths.forEach((width, row) => {
    for (let col = 0; col < width; col++) {
      const id = keyId(row, col);
      const candidate = sourceKeyFinger[id] ?? fallbackKeyFingerMap[id];
      keyFinger[id] = isNonThumb(candidate) ? candidate : defaultFingerForColumn(col);
    }
  });
  for (const extraKey of shape.extraKeys ?? []) {
    const candidate = sourceKeyFinger[extraKey.id] ?? fallbackKeyFingerMap[extraKey.id];
    keyFinger[extraKey.id] = isNonThumb(candidate)
      ? candidate
      : defaultFingerForColumn(extraKey.col);
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
    extraKeys: undefined,
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
