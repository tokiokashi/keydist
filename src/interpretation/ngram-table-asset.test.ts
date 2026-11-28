import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUNSETSU_KEY_SEPARATOR } from './corpus-ngram.ts';
import { derivedOrdersMatch, ngramTableAssetOf, ngramTableMap, ngramTableSetOfFile, parseNgramTableFile } from './ngram-table-asset.ts';

const RAW = JSON.parse(readFileSync(new URL('../input/text/ngram/standard-corpus-bunsetsu.json', import.meta.url), 'utf8')) as unknown;
const FILE = parseNgramTableFile(RAW);

test('同梱の標準のコーパスの表は、統計から導いた選べる次数と既定の次数を持つ', () => {
  assert.equal(derivedOrdersMatch(FILE), true);
  // 続きが1種類の文脈の出現の割合が1次で上限0.1を超えるので、選べる次数は0次だけ（仕様 §13.5）
  assert.deepEqual(FILE.selectableOrders, [0]);
  assert.equal(FILE.defaultOrder, 0);
});

test('同梱の表の鍵は次数+1文節で、出現回数の合計は統計の出現数と一致する', () => {
  for (const table of FILE.tables) {
    assert.equal(table.keys.length, new Set(table.keys).size);
    for (const key of table.keys) assert.equal(key.split(BUNSETSU_KEY_SEPARATOR).length, table.order + 1);
    const total = table.counts.reduce((sum, count) => sum + count, 0);
    assert.equal(total, FILE.sufficiency[table.order]!.occurrences);
    assert.equal(table.keys.length, FILE.sufficiency[table.order]!.grams);
  }
});

test('選べない次数の表は取り出せない', () => {
  assert.throws(() => ngramTableAssetOf(ngramTableSetOfFile(FILE), 1), /選べる次数/);
  const asset = ngramTableAssetOf(ngramTableSetOfFile(FILE), 0);
  assert.equal(ngramTableMap(asset).size, asset.keys.length);
  assert.equal(ngramTableMap(asset), ngramTableMap(asset));
});

test('壊れたファイルは読み込まずに例外を投げる', () => {
  const broken = (change: (file: Record<string, unknown>) => void) => {
    const copy = JSON.parse(JSON.stringify(RAW)) as Record<string, unknown>;
    change(copy);
    return () => parseNgramTableFile(copy);
  };
  assert.throws(
    broken((file) => (file.version = 2)),
    /version/,
  );
  assert.throws(
    broken((file) => (file.selectableOrders = [1])),
    /selectableOrders/,
  );
  assert.throws(
    broken((file) => {
      const tables = file.tables as { keys: string[]; counts: number[] }[];
      tables[0]!.counts.pop();
    }),
    /鍵と回数/,
  );
  assert.throws(
    broken((file) => {
      const tables = file.tables as { keys: string[] }[];
      tables[0]!.keys[0] = `あ${BUNSETSU_KEY_SEPARATOR}い`;
    }),
    /1文節でない/,
  );
});
