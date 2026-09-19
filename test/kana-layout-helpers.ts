import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import type { Layout } from '../src/layouts/index.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from '../src/sample-text-ja.ts';

type FixtureFace = {
  trigger: string[];
  mode: 'prefix' | 'suffix' | 'simultaneous';
  cells: string[][];
};

type AuthoringDerivation = {
  faceIndex: number;
  row: number;
  column: number;
  value: string;
  reason: string;
};

const AUTHORING_DERIVATIONS: Readonly<Record<string, readonly AuthoringDerivation[]>> = {
  shingeta: [
    { faceIndex: 2, row: 2, column: 7, value: 'れ', reason: '#261 reciprocal Face membership' },
    { faceIndex: 4, row: 2, column: 8, value: 'さ', reason: '#261 reciprocal Face membership' },
  ],
  'naginata-v18': [
    { faceIndex: 4, row: 2, column: 6, value: 'が', reason: '#261 reciprocal Face membership' },
  ],
};

type KanaLayoutFixture = {
  version: 1;
  layoutId: string;
  faces: FixtureFace[];
  omissions: Array<{
    faceIndex: number;
    row: number;
    column: number;
    value: string;
    reason: string;
  }>;
};

/** かな配列が持つべき標準的な入力文字。配列固有の欠落は呼び出し側で明示する。 */
const EXPECTED_KANA = [...[
  'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの',
  'はひふへほ', 'まみむめも', 'やゆよ', 'らりるれろ', 'わをん',
  'がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ',
  'ぁぃぅぇぉゃゅょっゎ', 'ヴ', 'ー',
].join('')];

/** かな配列の定義を、配列追加時にも使い回せる形で検証する。 */
export function assertKanaLayout(layout: Layout, missing: readonly string[] = []) {
  const allowedMissing = new Set(missing);
  const untypable = EXPECTED_KANA.filter((kana) => !layout.map.has(kana) && !allowedMissing.has(kana));
  assert.deepEqual(untypable, [], `${layout.id} で打てないかな: ${untypable.join(' ')}`);

  const sequenceOwners = new Map<string, string>();
  const duplicates: string[] = [];
  for (const [kana, sequence] of layout.map) {
    // 同時押しのキー順は意味を持たないため、ステップ内では正規化して比較する。
    const signature = JSON.stringify(sequence.map((step) => [...step].sort()));
    const owner = sequenceOwners.get(signature);
    if (owner !== undefined) duplicates.push(`${owner}=${kana}`);
    else sequenceOwners.set(signature, kana);
  }
  assert.deepEqual(duplicates, [], `${layout.id} で同じ打鍵列を共有するかな: ${duplicates.join(' ')}`);

  const geometry = buildGeometry('row-staggered');
  for (const [name, source] of [
    ['現代文', SAMPLE_TEXT_JA],
    ['旧文', SAMPLE_TEXT_JA_LEGACY],
  ] as const) {
    const text = source.replace(/\s+/g, '');
    const trace = evaluate(text, layout, geometry, DEFAULT_OPTIONS);
    assert.equal(trace.skipped, 0, `${layout.id} の ${name} で未定義文字がある`);
    assert.deepEqual(trace.errors, [], `${layout.id} の ${name} でキー解決エラーがある`);
  }
}

/** 出典から生成した面フィクスチャと、実装の全セルを照合する。 */
export function assertKanaLayoutFixture(layout: Layout) {
  const fixture = JSON.parse(
    readFileSync(new URL(`./fixtures/${layout.id}.json`, import.meta.url), 'utf8'),
  ) as KanaLayoutFixture;
  assert.equal(fixture.version, 1);
  assert.equal(fixture.layoutId, layout.id);
  assert.ok(layout.faces, `${layout.id} は面定義を持つ`);
  assert.equal(fixture.faces.length, layout.faces.length, `${layout.id} の面数が出典と違う`);

  const derivations = AUTHORING_DERIVATIONS[layout.id] ?? [];
  const derivationsByFace = new Map<number, AuthoringDerivation[]>();
  for (const derivation of derivations) {
    assert.ok(derivation.reason.length > 0, `${layout.id} のauthoring派生理由が空`);
    const group = derivationsByFace.get(derivation.faceIndex) ?? [];
    group.push(derivation);
    derivationsByFace.set(derivation.faceIndex, group);
  }

  for (const [faceIndex, [actual, expected]] of layout.faces.map((face, index) => [
    face,
    fixture.faces[index],
  ] as const).entries()) {
    assert.ok(expected, `${layout.id} の face ${faceIndex} のフィクスチャが無い`);
    const actualCells = actual.rows.map((row) => [...row]);

    for (const derivation of derivationsByFace.get(faceIndex) ?? []) {
      assert.equal(
        expected.cells[derivation.row]?.[derivation.column],
        '',
        `${layout.id} face ${faceIndex} の派生セル元は出典上空である必要がある`,
      );
      assert.equal(
        actualCells[derivation.row]?.[derivation.column],
        derivation.value,
        `${layout.id} face ${faceIndex} のauthoring派生セルが違う`,
      );
      actualCells[derivation.row][derivation.column] = '';
    }

    assert.deepEqual(
      { trigger: [...actual.trigger], mode: actual.mode, cells: actualCells },
      expected,
      `${layout.id} の face ${faceIndex} が出典フィクスチャと違う`,
    );
  }

  for (const omission of fixture.omissions) {
    assert.ok(omission.reason.length > 0, `${layout.id} の除外理由が空`);
    assert.ok(omission.value.length > 0, `${layout.id} の除外元セルが空`);
  }
}
