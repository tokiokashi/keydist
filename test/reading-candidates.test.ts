import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { buildCandidateTable, readCsvFilesFromTarGz, serializeCandidateTable } from '../scripts/reading-candidates-core.ts';
import { isCorrectableSurface, isCorrectionReading } from '../src/input/text/reading.ts';

/** mecab-ipadicのCSVの形（EUC-JP）の数行。日本×3（読みは2通り）・花・斥（読みの1つに漢字が混ざる）・行く×2・あ・未（読み無し）。 */
const CSV_HEX =
  'c6fccbdc2c312c312c3130302cccbebbec2cb8c7cdadccbebbec2cc3cfb0e82cb9f12c2a2c2a2cc6fccbdc2ca5cba5c3a5dda5f32ca5cba5c3a5dda5f30ac6fccbdc2c312c312c35302cccbebbec2cb8c7cdadccbebbec2cc3cfb0e82cb9f12c2a2c2a2cc6fccbdc2ca5cba5dba5f32ca5cba5dba5f30ac6fccbdc2c312c312c37302cccbebbec2cb8c7cdadccbebbec2cc3cfb0e82cb9f12c2a2c2a2cc6fccbdc2ca5cba5dba5f32ca5cba5dba5f30ab2d62c312c312c31302cccbebbec2cb0ecc8cc2c2a2c2a2c2a2c2a2cb2d62ca5cfa5ca2ca5cfa5ca0ac0cd2c312c312c31302cccbebbec2cb0ecc8cc2c2a2c2a2c2a2c2a2cc0cd2ca5d2a5f3c0cd2ca5d2a5f3c0cd0ac0cd2c312c312c31302cccbebbec2cb0ecc8cc2c2a2c2a2c2a2c2a2cc0cd2ca5bba5ad2ca5bba5ad0ab9d4a4af2c312c312c31302cc6b0bbec2cbcabcea92c2a2c2a2c2a2c2a2cb9d4a4af2ca5a4a5af2ca5a4a5af0ab9d4a4af2c312c312c32302cc6b0bbec2cbcabcea92c2a2c2a2c2a2c2a2cb9d4a4af2ca5e6a5af2ca5e6a5af0aa4a22c312c312c31302cccbebbec2cb0ecc8cc2c2a2c2a2c2a2c2a2ca4a22ca5a22ca5a20acca42c312c312c31302cccbebbec2cb0ecc8cc2c2a2c2a2c2a2c2a2c2a2c2a2c2a0a';

const csv = (name: string) => ({ name, bytes: Uint8Array.from(Buffer.from(CSV_HEX, 'hex')) });

test('漢字を含み、読みが2つ以上ある表記だけが残り、候補は読みのコストの小さい順に並ぶ', () => {
  assert.deepEqual(buildCandidateTable([csv('Noun.csv')]), {
    日本: ['にほん', 'にっぽん'],
    行く: ['いく', 'ゆく'],
  });
});

test('読みが1つしか無い表記・読みが打てる文字に収まらない読み・読みの無い語・漢字を含まない語は載せない', () => {
  const table = buildCandidateTable([csv('Noun.csv')]);
  for (const surface of ['花', '斥', '未', 'あ']) assert.equal(Object.hasOwn(table, surface), false, surface);
});

test('同じCSVからは同じ表ができ、CSVを渡す順に依らない', () => {
  const a = serializeCandidateTable(buildCandidateTable([csv('A.csv'), csv('B.csv')]));
  const b = serializeCandidateTable(buildCandidateTable([csv('B.csv'), csv('A.csv')]));
  assert.equal(a, b);
  assert.equal(a, serializeCandidateTable(buildCandidateTable([csv('A.csv'), csv('B.csv')])));
});

/** 1ファイルだけを持つ最小のtar。 */
function tarOf(entries: readonly { name: string; bytes: Uint8Array }[]): Uint8Array {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 'utf8');
    header.write(`${entry.bytes.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
    header.write('0', 156, 'ascii');
    blocks.push(header, Buffer.from(entry.bytes), Buffer.alloc((512 - (entry.bytes.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

test('tar.gzの最上位のディレクトリ直下のCSVだけを取り出す', () => {
  const bytes = csv('x').bytes;
  const archive = gzipSync(
    tarOf([
      { name: 'mecab-ipadic/Noun.csv', bytes },
      { name: 'mecab-ipadic/README', bytes: new Uint8Array([65]) },
      { name: 'mecab-ipadic/sub/Other.csv', bytes },
    ]),
  );
  const files = readCsvFilesFromTarGz(archive);
  assert.deepEqual(
    files.map((file) => file.name),
    ['mecab-ipadic/Noun.csv'],
  );
  assert.deepEqual(Uint8Array.from(files[0]!.bytes), bytes);
});

test('置いてある候補の表は、漢字を含む表記と、打てる読み2つ以上だけを持つ', () => {
  const table = JSON.parse(readFileSync(new URL('../src/platform/reading/candidates.json', import.meta.url), 'utf8')) as Record<string, string[]>;
  const surfaces = Object.keys(table);
  assert.ok(surfaces.length > 10000);
  for (const surface of surfaces) {
    const readings = table[surface]!;
    assert.ok(isCorrectableSurface(surface), surface);
    assert.ok(readings.length >= 2, surface);
    assert.equal(new Set(readings).size, readings.length, surface);
    for (const reading of readings) assert.ok(isCorrectionReading(reading), `${surface}:${reading}`);
  }
  assert.ok(table.日本!.includes('にほん') && table.日本!.includes('にっぽん'));
});
