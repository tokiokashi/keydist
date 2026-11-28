import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCorpusNgramTables } from './corpus-ngram.ts';
import { derivedOrdersMatch, ngramTableAssetKey, ngramTableAssetOf, type NgramTableFile } from './ngram-table-asset.ts';
import { buildUserNgramTable, USER_TABLE_MAX_ORDER, type UserNgramTableRequest } from './user-ngram-table.ts';

const INFO = { name: 'splitter', version: '1' } as const;
const READING = { library: { name: 'lib', version: '1' }, dictionary: { name: 'dict', version: '1' } } as const;

// 文節: きょうは / あさです / きょうは / ひるです。
const TEXT = 'きょうはあさですきょうはひるです。';
const BOUNDARIES = [4, 8, 12];

function request(change: Partial<UserNgramTableRequest> = {}): UserNgramTableRequest {
  return { name: 'テスト', readingText: TEXT, boundaries: BOUNDARIES, splitter: INFO, reading: READING, ...change };
}

test('0次の表は、文節の読みの出現回数を数え、標準のコーパスと同じ数え方の結果と一致する', () => {
  const set = buildUserNgramTable(request());
  const direct = buildCorpusNgramTables(TEXT, BOUNDARIES, USER_TABLE_MAX_ORDER);
  const order0 = set.tables[0]!;
  assert.deepEqual(new Map(order0.keys.map((key, index) => [key, order0.counts[index]])), direct.bunsetsu.tables[0]);
  assert.equal(order0.counts[order0.keys.indexOf('きょうは')], 2);
  assert.deepEqual(set.sufficiency, direct.bunsetsu.sufficiency);
});

test('選べる次数と既定の次数は、このテキストの統計から導く（仕様 §13.5）', () => {
  // 1次の並びがすべて異なるので、続きが1種類の文脈の出現の割合が上限を超え、0次だけが選べる
  const set = buildUserNgramTable(request());
  assert.deepEqual(set.selectableOrders, [0]);
  assert.equal(set.defaultOrder, 0);
  assert.equal(set.tables.length, 1);
  const file = { sufficiency: set.sufficiency, selectableOrders: set.selectableOrders, defaultOrder: set.defaultOrder } as unknown as NgramTableFile;
  assert.equal(derivedOrdersMatch(file), true);
});

test('文脈ごとに続きが複数あるテキストでは、統計が足りている次数まで選べて、既定は選べる次数の最大', () => {
  const units = ['あ', 'い', 'う', 'え'];
  let text = '';
  const boundaries: number[] = [];
  for (let round = 0; round < 40; round += 1) {
    for (const first of units) {
      for (const second of units) {
        for (const unit of [first, second]) {
          if (text !== '') boundaries.push([...text].length);
          text += unit;
        }
      }
    }
  }
  const set = buildUserNgramTable(request({ readingText: text, boundaries }));
  assert.ok(set.selectableOrders.length > 1, `選べる次数: ${set.selectableOrders.join('・')}`);
  assert.equal(set.defaultOrder, set.selectableOrders[set.selectableOrders.length - 1]);
  assert.equal(set.tables.length, set.selectableOrders.length);
});

test('同じ入力は同じ表と同じ中身のキーになり、読みのテキスト・区切り・分割器と辞書の版のどれが変わってもキーが変わる', () => {
  const base = buildUserNgramTable(request());
  assert.deepEqual(buildUserNgramTable(request()), base);
  const keyOf = (change: Partial<UserNgramTableRequest>) => buildUserNgramTable(request(change)).contentKey;
  const changes: Partial<UserNgramTableRequest>[] = [
    { readingText: TEXT.replace('きょう', 'こんにち') },
    { boundaries: [4, 8] },
    { splitter: { name: 'splitter', version: '2' } },
    { reading: { ...READING, dictionary: { name: 'dict', version: '2' } } },
    { reading: { ...READING, library: { name: 'lib', version: '2' } } },
    { reading: null },
  ];
  const keys = new Set([base.contentKey, ...changes.map(keyOf)]);
  assert.equal(keys.size, changes.length + 1);
  // 名前の違いは中身ではないので、キーを変えない
  assert.equal(keyOf({ name: '別の名前' }), base.contentKey);
});

test('加えた変更の文は、読みに直したかどうかで分け、辞書を読み込めなかった表に読みの置き換えを書かない', () => {
  assert.match(buildUserNgramTable(request()).changesText, /辞書の読みに置き換えて/);
  assert.doesNotMatch(buildUserNgramTable(request({ reading: null })).changesText, /置き換え/);
});

test('抽出が読む表のキーに、中身のキーと次数が入る', () => {
  const set = buildUserNgramTable(request());
  const key = ngramTableAssetKey(ngramTableAssetOf(set, 0));
  assert.deepEqual(key, { id: 'user-text', contentKey: set.contentKey, order: 0 });
  assert.equal(ngramTableAssetOf(set, 0).source.kind, 'user-text');
  assert.throws(() => ngramTableAssetOf(set, 1), /選べる次数/);
});
