export type VersionedStateDecodeResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'empty' }
  | { status: 'invalid' }
  | {
      status: 'unsupported-version';
      version: number;
      value: Record<string, unknown>;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeVersionedState<T>(
  raw: string | null,
  expectedVersion: number,
  validate: (value: unknown) => value is T,
): VersionedStateDecodeResult<T> {
  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { status: 'invalid' };
  }

  if (
    !isRecord(parsed)
    || typeof parsed.version !== 'number'
    || !Number.isInteger(parsed.version)
  ) {
    return { status: 'invalid' };
  }

  const version = parsed.version;
  if (version !== expectedVersion) {
    return { status: 'unsupported-version', version, value: parsed };
  }

  if (!validate(parsed)) {
    return { status: 'invalid' };
  }

  return { status: 'ok', value: parsed };
}
