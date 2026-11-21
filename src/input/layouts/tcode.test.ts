import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateTrace, DEFAULT_TRACE_POLICY } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { loadedKanjiDirectLayout } from '../../../test/kanji-direct-tables.ts';
import { isKanjiDirectLayout } from './kanji-direct.ts';
import { pendingKanjiDirectLayouts } from './kanji-direct-tables.ts';
import { physicalKeysUsedByLayout } from './physical-keys.ts';
import { TCODE_EMPTY, TCODE_KEYS, type TcodeTable } from './tcode.ts';

interface TCodeSource {
  format: string;
  keys: string;
  empty: string;
  tables: { first: string; rows: string[] }[];
  functions: { first: string; second: string; code: string }[];
}

const TCODE = loadedKanjiDirectLayout('tcode');
const TCODE_TABLES = JSON.parse(readFileSync(new URL('./tables/tcode.json', import.meta.url), 'utf8')) as TcodeTable[];
const source = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/tcode.json', import.meta.url), 'utf8')) as TCodeSource;

test('組み込みの表が、出典の写しの表と一致する', () => {
  assert.equal(source.format, 't-code-table');
  assert.equal(TCODE_KEYS, source.keys);
  assert.equal(TCODE_EMPTY, source.empty);
  assert.deepEqual(TCODE_TABLES, source.tables);
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

test('表を取得する前の配列の宣言が、表から導いた漢直であることと使う物理キーに一致する', () => {
  const pending = pendingKanjiDirectLayouts().find((layout) => layout.id === 'tcode');
  assert.ok(pending !== undefined);
  assert.notEqual(pending, TCODE);
  assert.ok(pending.pendingTable !== undefined);
  assert.equal(pending.name, TCODE.name);
  assert.deepEqual(pending.aliases, TCODE.aliases);
  assert.equal(isKanjiDirectLayout(pending), isKanjiDirectLayout(TCODE));
  assert.deepEqual([...physicalKeysUsedByLayout(pending)].sort(), [...physicalKeysUsedByLayout(TCODE)].sort());
});
