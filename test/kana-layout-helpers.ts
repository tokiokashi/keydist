import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import type { Layout } from '../src/layouts/index.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from '../src/sample-text-ja.ts';

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
