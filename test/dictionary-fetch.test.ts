import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ensureDictionaryZip } from '../scripts/dictionary-fetch.ts';
import { DICTIONARY_SPEC } from '../src/platform/reading/dictionary-spec.ts';

const body = new TextEncoder().encode('dictionary zip stand-in');
const sha = createHash('sha256').update(body).digest('hex');

async function withDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'keydist-dictionary-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function counting(response: () => Response) {
  const state = { calls: 0 };
  return {
    state,
    fetchImpl: async () => {
      state.calls += 1;
      return response();
    },
  };
}

test('ハッシュが合うzipを取得して置き場に書き、2回目は取り直さない', async () => {
  await withDir(async (dir) => {
    const network = counting(() => new Response(body));
    assert.deepEqual(await ensureDictionaryZip({ dir, sha256: sha, fetchImpl: network.fetchImpl }), body);
    assert.deepEqual(new Uint8Array(await readFile(join(dir, DICTIONARY_SPEC.fileName))), body);
    await ensureDictionaryZip({ dir, sha256: sha, fetchImpl: network.fetchImpl });
    assert.equal(network.state.calls, 1);
  });
});

test('ハッシュが違うzipは失敗し、置き場に何も書かない', async () => {
  await withDir(async (dir) => {
    const network = counting(() => new Response(body));
    await assert.rejects(ensureDictionaryZip({ dir, sha256: '0'.repeat(64), fetchImpl: network.fetchImpl }), /sha256/);
    assert.deepEqual(await readdir(dir), []);
  });
});

test('置き場のzipのハッシュが違う時は取り直し、取り直した物も違えば失敗する', async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, DICTIONARY_SPEC.fileName), 'damaged');
    const network = counting(() => new Response(body));
    assert.deepEqual(await ensureDictionaryZip({ dir, sha256: sha, fetchImpl: network.fetchImpl }), body);
    assert.equal(network.state.calls, 1);

    await writeFile(join(dir, DICTIONARY_SPEC.fileName), 'damaged');
    await assert.rejects(ensureDictionaryZip({ dir, sha256: '1'.repeat(64), fetchImpl: network.fetchImpl }), /sha256/);
  });
});

test('取得の応答が失敗なら失敗する', async () => {
  await withDir(async (dir) => {
    const network = counting(() => new Response('gone', { status: 404 }));
    await assert.rejects(ensureDictionaryZip({ dir, sha256: sha, fetchImpl: network.fetchImpl }), /404/);
  });
});

test('辞書の版・取得元・ファイル名はlindera-wasmの版と一致する', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
  assert.equal(pkg.dependencies['lindera-wasm'], DICTIONARY_SPEC.version);
  assert.ok(DICTIONARY_SPEC.fileName.includes(DICTIONARY_SPEC.version));
  assert.ok(DICTIONARY_SPEC.upstreamUrl.includes(`/v${DICTIONARY_SPEC.version}/`));
  assert.ok(DICTIONARY_SPEC.upstreamUrl.endsWith(`/${DICTIONARY_SPEC.fileName}`));
  assert.match(DICTIONARY_SPEC.sha256, /^[0-9a-f]{64}$/);
});
