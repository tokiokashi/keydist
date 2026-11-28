import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_EXTRACTION_ASSETS, type AnalyzerSetMember } from '#analyzers/contract.ts';
import { createEngineCache } from '#engine/cache.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { analyzeNgramTable } from '#interpretation/ngram-table-analysis.ts';
import { ngramTableAssetOf, ngramTableMap, parseNgramTableFile, type NgramTableAsset } from '#interpretation/ngram-table-asset.ts';
import { LOADED_LAYOUT_BY_ID } from '../../../test/kanji-direct-tables.ts';
import { computeNgramTableExtraction, ngramTableDefinition, type NgramTableOkRow } from './extract.ts';
import { distributionBoxRows, ngramTableModel } from './figure-model.ts';
import { DEFAULT_NGRAM_TABLE_OPTIONS, DEFAULT_TABLE_ORDER, MAX_TABLE_ORDER } from './options.ts';

const CATALOG = {
  layouts: LOADED_LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolved(layoutId: string, ngramTable?: NgramTableAsset) {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'あ',
    language: 'ja',
    ngramTable,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('解決できない');
  return result.input;
}

const SOURCE = {
  kind: 'corpus',
  name: 'テスト用の表',
  archive: { fileName: 'fixture.zip', sha256: 'f'.repeat(64) },
  segmentation: { origin: 'splitter', splitter: { name: 'fixture', version: '0' } },
  reading: null,
} as const;

/** 小さな表。次数1の項目3つ。先読みを1文節にすると、直前の文節で動いた指の位置が引き継がれず、距離が変わる項目を含む。 */
const SMALL_TABLE: NgramTableAsset = {
  id: 'fixture',
  order: 1,
  source: SOURCE,
  colophon: { work: 'テスト', original: 'テスト', changes: 'テスト' },
  keys: ['ひ\u0000ふ', 'あい\u0000あい', 'ほ\u0000ほ'],
  counts: [3, 2, 1],
};

function memberOf(layoutId: string, table: NgramTableAsset | undefined): AnalyzerSetMember {
  const input = resolved(layoutId, table);
  const { layout, geometry, tracePolicy, romajiRuleId } = input;
  return {
    target: { kind: 'layout', layoutId },
    trace: undefined as never,
    analysis: undefined as never,
    metrics: undefined as never,
    requestTrace: undefined as never,
    setup: { layout, geometry, tracePolicy, romajiRuleId },
    assets: { ...DEFAULT_EXTRACTION_ASSETS, ngramTable: table },
    remember: (_key, compute) => compute(),
  };
}

test('抽出の値は、表の解析（analyzeNgramTable）を同じ条件で呼んだ値と一致し、結果の条件に要求した先読みが入る', () => {
  const member = memberOf('qwerty', SMALL_TABLE);
  const direct = analyzeNgramTable(ngramTableMap(SMALL_TABLE), 1, member.setup!, 2, SOURCE);
  const extracted = computeNgramTableExtraction([member], [], { order: 1, lookahead: 5 });
  const row = extracted.rows[0] as NgramTableOkRow;
  assert.equal(row.kind, 'ok');
  // 先読みNは次数+1より大きくしても結果が同じ（仕様 §13.3）。条件には要求した値を書く
  assert.equal(row.analysis.totalDistance, direct.totalDistance);
  assert.equal(row.analysis.perChar, direct.perChar);
  assert.deepEqual(row.analysis.conditions.lookahead, { unit: 'bunsetsu', value: 5 });
  assert.equal(row.analysis.occurrences, 6);
  assert.equal(row.analysis.entries, 3);
});

test('表が渡されなかった枠は値を出さず、解決に失敗した枠は失敗として並べる', () => {
  const extracted = computeNgramTableExtraction(
    [memberOf('qwerty', undefined)],
    [{ target: { kind: 'setup', setupId: 'missing' }, kind: 'reference', message: '参照切れ' }],
    DEFAULT_NGRAM_TABLE_OPTIONS,
  );
  assert.deepEqual(
    extracted.rows.map((row) => row.kind),
    ['no-table', 'failed'],
  );
  assert.equal(extracted.basis, undefined);
});

test('先読みだけを変えた時、次数+1以上なら計算し直さず、次数+1より小さければ計算し直す', () => {
  const calls: string[] = [];
  const memo = new Map<string, unknown>();
  const member: AnalyzerSetMember = {
    ...memberOf('qwerty', SMALL_TABLE),
    remember: (key, compute) => {
      calls.push(key);
      if (!memo.has(key)) memo.set(key, compute());
      return memo.get(key) as never;
    },
  };
  const at = (lookahead: number) => (computeNgramTableExtraction([member], [], { order: 1, lookahead }).rows[0] as NgramTableOkRow).analysis;
  const two = at(2);
  const eight = at(8);
  const one = at(1);
  assert.equal(new Set(calls).size, 2, '先読み2と8は同じ計算を使い回す');
  assert.equal(two.totalDistance, eight.totalDistance);
  assert.notEqual(one.totalDistance, two.totalDistance);
});

test('engineを通した集合の抽出が、解決済みの入力の配列・物理配列・方針で表を打つ（Traceのテキストには依らない）', () => {
  const cache = createEngineCache();
  const members = ['qwerty', 'jis-kana'].map((layoutId) => ({
    target: { kind: 'layout', layoutId } as const,
    resolution: { ok: true, input: resolved(layoutId, SMALL_TABLE) } as const,
  }));
  const { extracted } = cache.getSetExtraction(members, ngramTableDefinition, { order: 1, lookahead: 2 });
  for (const member of members) {
    const input = member.resolution.input;
    const direct = analyzeNgramTable(ngramTableMap(SMALL_TABLE), 1, input, 2, SMALL_TABLE.source);
    const row = extracted.rows.find((candidate) => candidate.targetKey === `layout:${member.target.layoutId}`) as NgramTableOkRow;
    assert.equal(row.analysis.totalDistance, direct.totalDistance, member.target.layoutId);
  }
  // 次数と先読みは抽出のキーに入るので、変えると別の結果になる
  const other = cache.getSetExtraction(members, ngramTableDefinition, { order: 1, lookahead: 1 }).extracted;
  const before = (extracted.rows[0] as NgramTableOkRow).analysis.totalDistance;
  assert.notEqual((other.rows[0] as NgramTableOkRow).analysis.totalDistance, before);
});

const SHIPPED = parseNgramTableFile(JSON.parse(readFileSync(new URL('../../input/text/ngram/standard-corpus-bunsetsu.json', import.meta.url), 'utf8')));

test('解析設定の次数の既定と上限は、同梱の表の既定の次数と、統計を確かめた最大の次数と一致する', () => {
  // 表を作り直して既定の次数や確かめる最大の次数が変わったら、解析設定の既定と上限も直す
  assert.equal(DEFAULT_TABLE_ORDER, SHIPPED.defaultOrder);
  assert.equal(MAX_TABLE_ORDER, SHIPPED.sufficiency.length - 1);
});

test('同梱の標準のコーパスの表で、QWERTYの0次の値が、スクリプトで測った値と一致する', { timeout: 120_000 }, () => {
  const asset = ngramTableAssetOf(SHIPPED, 0);
  const member = memberOf('qwerty', asset);
  const row = computeNgramTableExtraction([member], [], DEFAULT_NGRAM_TABLE_OPTIONS).rows[0] as NgramTableOkRow;
  assert.equal(row.analysis.occurrences, 79736);
  assert.equal(row.analysis.entries, 37981);
  assert.equal(row.analysis.chars, 385782);
  assert.equal(row.analysis.totalDistance.toFixed(1), '446516.2');
  assert.equal(row.analysis.perChar!.toFixed(4), '1.1574');
  assert.equal(row.analysis.skipped, 97);
  // 分布の分位点は箱ひげ図の5つの値へ、10%点・25%点・中央値・75%点・90%点の順に入る
  const model = ngramTableModel(
    { basis: undefined, rows: [row] },
    ['layout:qwerty'],
    new Map([['layout:qwerty', { targetKey: 'layout:qwerty', label: 'QWERTY', fullName: '' }]]),
  );
  const [box] = distributionBoxRows(model.rows, 'distance');
  assert.equal(box!.row.box.median.toFixed(4), '5.2411');
  assert.equal(box!.row.box.lowerWhisker.toFixed(4), '2.2808');
  assert.equal(box!.row.box.upperWhisker.toFixed(4), '9.0919');
  const [perKana] = distributionBoxRows(model.rows, 'perKana');
  assert.equal(perKana!.row.box.median.toFixed(4), '1.1292');
});
