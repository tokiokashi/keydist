import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import {
  configureKanjiDirectLoader,
  describeKanjiDirectWait,
  KANJI_DIRECT_DECLARATIONS,
  kanjiDirectLayout,
  kanjiDirectStatus,
  requestKanjiDirectLayout,
  retryFailedKanjiDirectLayouts,
} from '#input/layouts/kanji-direct-tables.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Setup } from '#input/setup/index.ts';
import { fixedTestText } from '../../test/kana-test-text.ts';
import { describeResolvedInputError } from './resolved-input-errors.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';

// このファイルは表を置くテスト用の補助（`test/kanji-direct-tables.ts`）をimportしない。表を取得する前の状態から始める。

const TABLE_DIR = new URL('../input/layouts/tables/', import.meta.url);

function readTable(tableFile: string): unknown {
  return JSON.parse(readFileSync(new URL(tableFile, TABLE_DIR), 'utf8')) as unknown;
}

/** アプリのカタログと同じく、漢直の配列は今の姿（取得済みなら表から作った配列、まだなら取得する前の配列）を入れる。 */
function resolveTcode() {
  const layouts = new Map<string, Layout>(LAYOUT_BY_ID);
  for (const declaration of KANJI_DIRECT_DECLARATIONS) layouts.set(declaration.id, kanjiDirectLayout(declaration.id)!);
  const setup: Setup = { id: 'setup-tcode', number: 1, layoutId: 'tcode', shapeId: 'row-staggered' };
  return resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: { layouts, shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])) },
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: fixedTestText('ja'),
    language: 'ja',
  });
}

test('配布する表のファイルが、宣言した表のファイルと一対一に対応する', () => {
  const declared = KANJI_DIRECT_DECLARATIONS.map((declaration) => declaration.tableFile).sort();
  const shipped = readdirSync(TABLE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert.deepEqual(shipped, declared);
});

test('表を取得する前は計算せず、取得に失敗すると取得し直すまで失敗のまま、取得できると数値の入力が解決できる', async () => {
  // 取得する手段が渡されていない間は、取得中のまま
  const first = resolveTcode();
  assert.ok(!first.ok);
  assert.ok(first.error.kind === 'layout-table');
  assert.equal(first.error.status, 'loading');
  assert.equal(describeResolvedInputError(first.error), describeKanjiDirectWait('T-Code', 'loading'));
  await requestKanjiDirectLayout('tcode');
  assert.equal(kanjiDirectStatus('tcode'), 'loading');

  // 取得に失敗した配列は、選び直すまで取得し直さない。ほかの配列の解決には響かない
  let calls = 0;
  configureKanjiDirectLoader(async () => {
    calls++;
    throw new Error('取得できない');
  });
  await requestKanjiDirectLayout('tcode');
  await requestKanjiDirectLayout('tcode');
  assert.equal(calls, 1);
  assert.equal(kanjiDirectStatus('tcode'), 'failed');
  const failed = resolveTcode();
  assert.ok(!failed.ok);
  assert.ok(failed.error.kind === 'layout-table');
  assert.equal(failed.error.status, 'failed');
  assert.equal(describeResolvedInputError(failed.error), describeKanjiDirectWait('T-Code', 'failed'));
  assert.equal(kanjiDirectStatus('tut-code'), 'loading');

  // 選び直すと取得し直し、表を使える
  retryFailedKanjiDirectLayouts();
  configureKanjiDirectLoader(async (tableFile) => readTable(tableFile));
  await requestKanjiDirectLayout('tcode');
  assert.equal(calls, 1);
  assert.equal(kanjiDirectStatus('tcode'), 'loaded');
  const loaded = resolveTcode();
  assert.ok(loaded.ok);
  assert.equal(loaded.input.layout.pendingTable, undefined);
  assert.ok(loaded.input.layout.canonicalInputs.size > 1000);
});
