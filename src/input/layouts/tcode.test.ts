import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateTrace, DEFAULT_TRACE_POLICY } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { TCODE, TCODE_EMPTY, TCODE_KEYS, TCODE_TABLES } from './tcode.ts';

interface TCodeSource {
  format: string;
  keys: string;
  empty: string;
  tables: { first: string; rows: string[] }[];
  functions: { first: string; second: string; code: string }[];
}

const source = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/tcode.json', import.meta.url), 'utf8')) as TCodeSource;

test('組み込みの表が、出典の写しの表と一致する', () => {
  assert.equal(source.format, 't-code-table');
  assert.equal(TCODE_KEYS, source.keys);
  assert.equal(TCODE_EMPTY, source.empty);
  assert.deepEqual(
    TCODE_TABLES.map(([first, rows]) => ({ first, rows })),
    source.tables,
  );
});

test('出典の表は40キーの1打目ごとに4行×10欄で、機能の欄を文字にしていない', () => {
  assert.deepEqual(
    source.tables.map((table) => table.first),
    [...source.keys],
  );
  for (const table of source.tables) {
    assert.equal(table.rows.length, 4, `1打目 ${table.first}`);
    for (const row of table.rows) assert.equal([...row].length, 10, `1打目 ${table.first}`);
  }
  assert.ok(source.functions.length > 0);
  for (const fn of source.functions) {
    const table = source.tables.find((entry) => entry.first === fn.first)!;
    const index = [...source.keys].indexOf(fn.second);
    assert.equal([...table.rows.join('')][index], source.empty, `機能 ${fn.code}（${fn.first}${fn.second}）`);
  }
});

test('1353字の各字が、出典のとおり1打目と2打目の2ステップで打たれる', () => {
  const expected = new Map<string, string[][]>();
  for (const table of source.tables) {
    [...table.rows.join('')].forEach((output, index) => {
      if (output === source.empty) return;
      assert.ok(!expected.has(output), `重複した字 ${output}`);
      expected.set(output, [[table.first], [[...source.keys][index]]]);
    });
  }
  assert.equal(expected.size, 1353);
  assert.deepEqual([...TCODE.map.keys()].sort(), [...expected.keys()].sort());
  for (const [output, sequence] of expected) assert.deepEqual(TCODE.map.get(output), sequence, output);
});

test('層は単打の1つだけで、1打目はトリガーに数えない', () => {
  assert.deepEqual(
    TCODE.layerDefinitions?.map((definition) => definition.id),
    ['single'],
  );
  assert.equal(TCODE.faces, undefined);
  const { strokes, skipped } = generateTrace('あ漢字', TCODE, buildGeometry('row-staggered'), DEFAULT_TRACE_POLICY);
  assert.equal(skipped, 0);
  assert.deepEqual(
    strokes.map((stroke) => stroke.char),
    ['あ', 'あ', '漢', '漢', '字', '字'],
  );
  assert.ok(strokes.every((stroke) => stroke.aggregationGroupId === 'single' && stroke.triggerKeys.length === 0));
});
