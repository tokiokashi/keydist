import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { ADJACENT_PAIRS, ALL_FINGERS, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import { createEngineCache } from '#engine/cache.ts';
import { computeFingerDistanceExtraction } from '#analyzers/finger-distance/extract.ts';
import {
  FINGER_MATRIX_SURFACES,
  computeFingerMatrixExtraction,
  fingerMatrixDefinition,
  type FingerMatrixExtracted,
  type FingerMatrixOkRow,
} from './extract.ts';
import { ALTERNATE_FINGER_MATRIX_OPTIONS, DEFAULT_FINGER_MATRIX_OPTIONS, FINGER_MATRIX_SURFACE_IDS } from './options.ts';

/**
 * 配列×指のマトリックスの抽出（仕様 §11.1・§11.2・§11.6）を、実際のengine経路で検証する。
 * 条件: 物理配列`row-staggered`・指割当は既定・テキスト "hello world"（英語）・
 * windowSizeなどはengineの既定（`EMPTY_SETTINGS_OVERRIDES`）。配列は`qwerty`と`dvorak`。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function memberFor(layoutId: string, text: string): EngineSetMemberInput {
  const setup: Setup = { id: `setup-${layoutId}`, number: 1, layoutId, shapeId: 'row-staggered' };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'en',
  });
  assert.ok(resolution.ok, resolution.ok ? '' : JSON.stringify(resolution.error));
  return { target: { kind: 'setup', setupId: setup.id }, resolution };
}

function okRow(extracted: FingerMatrixExtracted, layoutId: string): FingerMatrixOkRow {
  const row = extracted.rows.find((candidate) => candidate.targetKey === `setup:setup-${layoutId}`);
  assert.equal(row?.kind, 'ok', layoutId);
  if (row?.kind !== 'ok') throw new Error('unreachable');
  return row;
}

function assertCloseArray(actual: readonly number[], expected: readonly number[], message: string): void {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]!) < 1e-9, `${message}[${i}] actual=${value} expected=${expected[i]}`));
}

const MEMBERS = [memberFor('qwerty', 'hello world'), memberFor('dvorak', 'hello world')];

// 実行して出した値（列の順は`FINGER_MATRIX_SURFACES`の`columns`）。
// 指の列: LP LR LM LI LT RT RI RM RR RP。指間の列: LP-LR LR-LM LM-LI RI-RM RM-RR RR-RP。
const EXPECTED: Readonly<Record<string, Readonly<Record<string, readonly number[]>>>> = {
  qwerty: {
    presses: [0, 1, 2, 1, 0, 1, 1, 0, 5, 0],
    distance: [0, 1.0307764064044151, 1.0307764064044151, 1.0307764064044151, 0, 0, 1, 0, 1.0307764064044151, 0],
    pairMean: [0.022727272727272728, 0.07734373266892837, 0.07734373266892837, 0.09090909090909091, 0.09090909090909091, 0.2184658397666226],
    pairStdDev: [0.07186994682200862, 0.18031167422216116, 0.18031167422216118, 0.2874797872880344, 0.12026142323020866, 0.28900314099268426],
  },
  dvorak: {
    presses: [0, 2, 1, 0, 0, 1, 2, 1, 1, 3],
    distance: [0, 0, 0, 0, 0, 0, 1, 1.118033988749895, 1.0307764064044151, 2.0615528128088303],
    pairMean: [0, 0, 0, 0.16388869433927225, 0.03345763534089954, 0.12279827812347383],
    pairStdDev: [0, 0, 0, 0.35019399546815677, 0.07634757572596979, 0.18649013941092904],
  },
};

test('4種の面の値: 配列qwerty・dvorak、テキスト "hello world" で固定した値と一致する', () => {
  const { extracted } = createEngineCache().getSetExtraction(MEMBERS, fingerMatrixDefinition, DEFAULT_FINGER_MATRIX_OPTIONS);
  for (const layoutId of ['qwerty', 'dvorak']) {
    const row = okRow(extracted, layoutId);
    assert.equal(row.inputChars, 11);
    for (const id of FINGER_MATRIX_SURFACE_IDS) {
      assertCloseArray(row.surfaces[id], EXPECTED[layoutId]![id]!, `${layoutId}/${id}`);
    }
  }
});

test('面の列: 指の面は親指を含む10本、指間の面は仕様 §11.6の6組で、値の並びと列が揃う', () => {
  const { extracted } = createEngineCache().getSetExtraction(MEMBERS, fingerMatrixDefinition, DEFAULT_FINGER_MATRIX_OPTIONS);
  assert.deepEqual(extracted.surfaces.map((surface) => surface.id), [...FINGER_MATRIX_SURFACE_IDS]);
  for (const surface of extracted.surfaces) {
    const expectedIds = surface.id === 'presses' || surface.id === 'distance'
      ? [...ALL_FINGERS]
      : ADJACENT_PAIRS.map((pair) => `${pair[0]}-${pair[1]}`);
    assert.deepEqual(surface.columns.map((column) => column.id), expectedIds, surface.id);
    for (const row of extracted.rows) {
      if (row.kind === 'ok') assert.equal(row.surfaces[surface.id].length, surface.columns.length, surface.id);
    }
  }
  assert.equal(FINGER_MATRIX_SURFACES, extracted.surfaces);
});

test('既存の抽出と同じ量: 指ごとの押下数・距離は指ごとの距離の抽出、全体の和は`Metrics`と一致する', () => {
  const cache = createEngineCache();
  const { extracted } = cache.getSetExtraction(MEMBERS, fingerMatrixDefinition, DEFAULT_FINGER_MATRIX_OPTIONS);
  for (const [layoutId, member] of [['qwerty', MEMBERS[0]!], ['dvorak', MEMBERS[1]!]] as const) {
    assert.ok(member.resolution.ok);
    if (!member.resolution.ok) return;
    const { metrics } = cache.getInterpretation(member.resolution.input);
    const fingerDistance = computeFingerDistanceExtraction(metrics);
    const row = okRow(extracted, layoutId);
    assert.deepEqual(row.surfaces.presses, fingerDistance.fingers.map((item) => item.presses));
    assert.deepEqual(row.surfaces.distance, fingerDistance.fingers.map((item) => item.distance));
    assert.deepEqual(row.surfaces.pairMean, fingerDistance.adjacent.map((item) => item.meanExcess));
    assert.deepEqual(row.surfaces.pairStdDev, fingerDistance.adjacent.map((item) => item.stdDev));
    assert.equal(row.surfaces.presses.reduce((sum, value) => sum + value, 0), metrics.presses);
    assert.ok(Math.abs(row.surfaces.distance.reduce((sum, value) => sum + value, 0) - metrics.totalUnits) < 1e-9);
  }
});

test('面を切り替えても抽出は作り直さない: 面の選択は抽出のキャッシュキーに入らず、同じ結果を返す', () => {
  const cache = createEngineCache();
  const first = cache.getSetExtraction(MEMBERS, fingerMatrixDefinition, DEFAULT_FINGER_MATRIX_OPTIONS);
  const sizeAfterFirst = cache.size;
  const second = cache.getSetExtraction(MEMBERS, fingerMatrixDefinition, ALTERNATE_FINGER_MATRIX_OPTIONS);
  assert.equal(second.extracted, first.extracted);
  assert.deepEqual(cache.size, sizeAfterFirst);
});

test('順位や最小の印を持たない: 行は`targetKey`・`inputChars`・面の値だけ', () => {
  const { extracted } = createEngineCache().getSetExtraction(MEMBERS, fingerMatrixDefinition, DEFAULT_FINGER_MATRIX_OPTIONS);
  for (const row of extracted.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['inputChars', 'kind', 'surfaces', 'targetKey']);
  }
});

test('解決に失敗したメンバーは `failed`行になり、行を消さない', () => {
  const missing: AnalysisTarget = { kind: 'setup', setupId: 'setup-deleted' };
  const extracted = computeFingerMatrixExtraction(
    [],
    [{ target: missing, kind: 'reference', message: '配列が見つかりません（削除された可能性があります）' }],
  );
  assert.equal(extracted.rows.length, 1);
  const row = extracted.rows[0]!;
  assert.equal(row.kind, 'failed');
  if (row.kind === 'failed') {
    assert.equal(row.targetKey, 'setup:setup-deleted');
    assert.equal(row.failureKind, 'reference');
  }
});
