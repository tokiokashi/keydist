import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeVersionedState } from '#platform/persistence/versioned-state.ts';

interface ExampleState {
  version: 1;
  value: string;
}

function isExampleState(value: unknown): value is ExampleState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1 && typeof candidate.value === 'string';
}

test('versioned decoder distinguishes missing, invalid and unsupported state', () => {
  assert.deepEqual(decodeVersionedState(null, 1, isExampleState), { status: 'empty' });
  assert.deepEqual(decodeVersionedState('{', 1, isExampleState), { status: 'invalid' });
  assert.deepEqual(decodeVersionedState('{}', 1, isExampleState), { status: 'invalid' });
  assert.deepEqual(
    decodeVersionedState('{"version":2,"value":"x"}', 1, isExampleState),
    {
      status: 'unsupported-version',
      version: 2,
      value: { version: 2, value: 'x' },
    },
  );
});

test('unsupported-version payload can be passed to a migrator without reparsing', () => {
  const decoded = decodeVersionedState('{"version":0,"value":"legacy"}', 1, isExampleState);
  assert.equal(decoded.status, 'unsupported-version');
  if (decoded.status !== 'unsupported-version') return;

  const migrated: ExampleState = {
    version: 1,
    value: String(decoded.value.value),
  };
  assert.deepEqual(migrated, { version: 1, value: 'legacy' });
});

test('versioned decoder validates matching-version payloads before returning them', () => {
  assert.deepEqual(
    decodeVersionedState('{"version":1,"value":1}', 1, isExampleState),
    { status: 'invalid' },
  );
  assert.deepEqual(
    decodeVersionedState('{"version":1,"value":"ok"}', 1, isExampleState),
    { status: 'ok', value: { version: 1, value: 'ok' } },
  );
});
