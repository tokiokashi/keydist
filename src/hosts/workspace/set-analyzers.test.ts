import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { WORKSPACE_ANALYZERS } from './analyzer-registry.ts';

// set-analyzers.tsは可視化（.tsx・CSS）を読み込むので、unit testからは読み込まず、
// 書かれたimportを検査する。Analyzerのidと`analyzers/`のディレクトリ名は同じ。
const source = readFileSync(new URL('./set-analyzers.ts', import.meta.url), 'utf8');

test('Workspaceに載せるSetは、どれもペインに渡すものを登録している', () => {
  for (const entry of WORKSPACE_ANALYZERS.filter((candidate) => candidate.cardinality === 'set')) {
    assert.ok(
      source.includes(`'#analyzers/${entry.id}/definition.tsx'`),
      `${entry.id}のペインに渡すものがset-analyzers.tsに無い`,
    );
  }
});

test('登録したAnalyzerは、Workspaceに載せるSetの一覧にも載っている', () => {
  const ids = [...source.matchAll(/'#analyzers\/([^/]+)\/definition\.tsx'/g)].map((match) => match[1]);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const entry = WORKSPACE_ANALYZERS.find((candidate) => candidate.id === id);
    assert.equal(entry?.cardinality, 'set', `${id}がanalyzer-registry.tsのSetに無い`);
  }
});
