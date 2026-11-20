import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateTrace, DEFAULT_TRACE_POLICY } from '#trace/generate.ts';
import { buildGeometry, THUMB_KEY } from '../shapes/geometry.ts';
import { TUT_CODE, TUT_EMPTY, TUT_KEYS, TUT_ROOT, type TutTable } from './tut-code.ts';

interface TutSource {
  format: string;
  keys: string;
  empty: string;
  root: TutTable;
}

const source = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/tut-code.json', import.meta.url), 'utf8')) as TutSource;

/** 出典の写しの表から、字 → 打鍵の並び（キーのidで、空白キーは右親指）を作る。 */
function expectedSequences(): Map<string, string[]> {
  const expected = new Map<string, string[]>();
  const add = (output: string, keys: string[]) => {
    assert.ok(!expected.has(output), `重複した字 ${output}`);
    expected.set(output, keys);
  };
  const walk = (table: TutTable, prefix: string[]) => {
    [...table.rows.join('')].forEach((output, index) => {
      if (output !== source.empty) add(output, [...prefix, [...source.keys][index]]);
    });
    if (table.space !== undefined) add(table.space, [...prefix, THUMB_KEY.RT]);
    for (const [key, next] of Object.entries(table.next ?? {})) walk(next, [...prefix, key]);
  };
  walk(source.root, []);
  return expected;
}

test('組み込みの表が、出典の写しの表と一致する', () => {
  assert.equal(source.format, 'tut-code-table');
  assert.equal(TUT_KEYS, source.keys);
  assert.equal(TUT_EMPTY, source.empty);
  assert.deepEqual(TUT_ROOT, source.root);
});

test('2652字の各字が、出典のとおりの打鍵の数のステップで打たれ、空白キーは右親指で打たれる', () => {
  const expected = expectedSequences();
  assert.equal(expected.size, 2652);
  const byLength = new Map<number, number>();
  for (const keys of expected.values()) byLength.set(keys.length, (byLength.get(keys.length) ?? 0) + 1);
  assert.deepEqual([...byLength].sort(), [
    [1, 11],
    [2, 803],
    [3, 1829],
    [4, 9],
  ]);
  assert.deepEqual([...TUT_CODE.map.keys()].sort(), [...expected.keys()].sort());
  for (const [output, keys] of expected)
    assert.deepEqual(
      TUT_CODE.map.get(output),
      keys.map((key) => [key]),
      output,
    );
});

test('層は単打の1つだけで、途中の打鍵はトリガーに数えない。2打目の空白キーは左親指の設定でも右親指のまま', () => {
  assert.deepEqual(
    TUT_CODE.layerDefinitions?.map((definition) => definition.id),
    ['single'],
  );
  assert.equal(TUT_CODE.faces, undefined);
  const geometry = buildGeometry('row-staggered');
  for (const spaceThumb of ['right', 'left'] as const) {
    // あ（2打）・ー（2打目が空白キー）・全角空白（1打）・嫌（3打）
    const { strokes, skipped } = generateTrace('あー　嫌', TUT_CODE, geometry, { ...DEFAULT_TRACE_POLICY, spaceThumb });
    assert.equal(skipped, 0);
    assert.deepEqual(
      strokes.map((stroke) => stroke.char),
      ['あ', 'あ', 'ー', 'ー', '　', '嫌', '嫌', '嫌'],
    );
    assert.ok(strokes.every((stroke) => stroke.aggregationGroupId === 'single' && stroke.triggerKeys.length === 0));
    const keys = strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)));
    assert.deepEqual(keys[3], [THUMB_KEY.RT]);
  }
});
