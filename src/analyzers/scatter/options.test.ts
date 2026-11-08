import assert from 'node:assert/strict';
import test from 'node:test';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { SCATTER_PRESET_IDS } from './axes.ts';
import { ALTERNATE_SCATTER_OPTIONS, DEFAULT_SCATTER_OPTIONS, scatterOptions } from './options.ts';

test('軸の種類: 既定は線形で、URLに載せて読み戻すと同じ設定になる', () => {
  assert.equal(DEFAULT_SCATTER_OPTIONS.tickScale, 'linear');
  const diagnostics: CodecDiagnostic[] = [];
  const params = scatterOptions.encodeOptionsToUrl({ ...DEFAULT_SCATTER_OPTIONS, tickScale: 'log' });
  assert.equal(params.get('scale'), 'log');
  const decoded = scatterOptions.decodeOptionsFromUrl(params, diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.equal(decoded.values.tickScale, 'log');
  // 既定のままならURLに載せない
  assert.equal(scatterOptions.encodeOptionsToUrl(DEFAULT_SCATTER_OPTIONS).has('scale'), false);
});

test('軸の種類: 既定と違う値の組をURLに載せて読み戻すと、軸の種類を含めて同じ設定になる', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const decoded = scatterOptions.decodeOptionsFromUrl(scatterOptions.encodeOptionsToUrl(ALTERNATE_SCATTER_OPTIONS), diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual({ ...DEFAULT_SCATTER_OPTIONS, ...decoded.values }, ALTERNATE_SCATTER_OPTIONS);
});

test('軸の種類: 知らない値のURLは診断に残して読まない', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const decoded = scatterOptions.decodeOptionsFromUrl(new URLSearchParams('scale=sqrt'), diagnostics);
  assert.equal(diagnostics.length, 1);
  assert.equal(decoded.values.tickScale, undefined);
});

test('組み合わせ: 既定はdistanceの1つだけで、既定のままならURLに載せない', () => {
  assert.deepEqual(DEFAULT_SCATTER_OPTIONS.presets, ['distance']);
  assert.equal(scatterOptions.encodeOptionsToUrl(DEFAULT_SCATTER_OPTIONS).has('preset'), false);
});

test('組み合わせ: URLに書き出して読み直すと、同じ並びに戻る', () => {
  for (const presets of [['hand'], ['distance', 'hand'], ['distance', 'hand', 'free'], [...SCATTER_PRESET_IDS]] as const) {
    const diagnostics: CodecDiagnostic[] = [];
    const params = scatterOptions.encodeOptionsToUrl({ ...DEFAULT_SCATTER_OPTIONS, presets });
    const decoded = scatterOptions.decodeOptionsFromUrl(params, diagnostics);
    assert.deepEqual(diagnostics, []);
    const restored = decoded.values.presets ?? DEFAULT_SCATTER_OPTIONS.presets;
    assert.deepEqual(restored, presets);
  }
});

test('組み合わせ: URLの値が一覧と違う順・重複・知らない値・空でも、一覧の順に直し、何も残らなければ既定にする', () => {
  const read = (query: string) => {
    const diagnostics: CodecDiagnostic[] = [];
    const decoded = scatterOptions.decodeOptionsFromUrl(new URLSearchParams(query), diagnostics);
    return { presets: decoded.values.presets, diagnostics };
  };
  assert.deepEqual(read('preset=free,hand,distance').presets, ['distance', 'hand', 'free']);
  assert.deepEqual(read('preset=hand,hand,hand').presets, ['hand']);
  const unknown = read('preset=nothing,hand,other');
  assert.deepEqual(unknown.presets, ['hand']);
  assert.equal(unknown.diagnostics.length, 2);
  assert.deepEqual(read('preset=nothing').presets, ['distance']);
  assert.deepEqual(read('preset=').presets, ['distance']);
});

test('組み合わせ: 保存した解析設定の値が一覧と違う順・重複・知らない値・空でも、同じ規則で直す', () => {
  const decode = (presets: unknown) => {
    const diagnostics: CodecDiagnostic[] = [];
    const options = scatterOptions.decodeOptions({ presets }, diagnostics) as typeof DEFAULT_SCATTER_OPTIONS;
    return { presets: options.presets, diagnostics };
  };
  assert.deepEqual(decode(['free', 'hand', 'distance']).presets, ['distance', 'hand', 'free']);
  assert.deepEqual(decode(['hand', 'hand']).presets, ['hand']);
  const unknown = decode(['nothing', 'hand', 42]);
  assert.deepEqual(unknown.presets, ['hand']);
  assert.equal(unknown.diagnostics.length, 2);
  assert.deepEqual(decode([]).presets, ['distance']);
  assert.deepEqual(decode(['nothing']).presets, ['distance']);
  assert.deepEqual(decode('hand').presets, ['distance']);
});

test('列の数: 既定は自動で、URLに載せて読み戻すと同じ設定になり、知らない値は読まない', () => {
  assert.equal(DEFAULT_SCATTER_OPTIONS.columns, 'auto');
  assert.equal(scatterOptions.encodeOptionsToUrl(DEFAULT_SCATTER_OPTIONS).has('columns'), false);
  const diagnostics: CodecDiagnostic[] = [];
  const params = scatterOptions.encodeOptionsToUrl({ ...DEFAULT_SCATTER_OPTIONS, columns: '3' });
  assert.equal(params.get('columns'), '3');
  assert.equal(scatterOptions.decodeOptionsFromUrl(params, diagnostics).values.columns, '3');
  assert.deepEqual(diagnostics, []);
  const broken: CodecDiagnostic[] = [];
  assert.equal(scatterOptions.decodeOptionsFromUrl(new URLSearchParams('columns=4'), broken).values.columns, undefined);
  assert.equal(broken.length, 1);
});

test('縦軸: 既定は距離/アクションの1つで、URLに0個も複数も載せて読み戻す', () => {
  assert.deepEqual(DEFAULT_SCATTER_OPTIONS.yAxes, ['meanPerStroke']);
  assert.equal(scatterOptions.encodeOptionsToUrl(DEFAULT_SCATTER_OPTIONS).has('y'), false);
  for (const yAxes of [[], ['actions', 'sameFinger']] as const) {
    const diagnostics: CodecDiagnostic[] = [];
    const params = scatterOptions.encodeOptionsToUrl({ ...DEFAULT_SCATTER_OPTIONS, yAxes });
    assert.equal(params.get('y'), yAxes.join(','));
    const decoded = scatterOptions.decodeOptionsFromUrl(params, diagnostics);
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(decoded.values.yAxes, yAxes);
  }
});

test('縦軸: 並び・重複・知らない値は、比較表の列の順に直して知らない値を診断に残す', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const decoded = scatterOptions.decodeOptionsFromUrl(new URLSearchParams('y=sameFinger,nothing,actions,sameFinger'), diagnostics);
  assert.deepEqual(decoded.values.yAxes, ['actions', 'sameFinger']);
  assert.equal(diagnostics.length, 2);
  const stored: CodecDiagnostic[] = [];
  const options = scatterOptions.decodeOptions({ yAxes: ['sameFinger', 'actions', 'nothing'] }, stored) as typeof DEFAULT_SCATTER_OPTIONS;
  assert.deepEqual(options.yAxes, ['actions', 'sameFinger']);
  assert.equal(stored.length, 1);
});

test('横軸: 既定はアクション数/カナの1つで、URLに0個も複数も載せて読み戻す', () => {
  assert.deepEqual(DEFAULT_SCATTER_OPTIONS.xAxes, ['perCharSteps']);
  assert.equal(scatterOptions.encodeOptionsToUrl(DEFAULT_SCATTER_OPTIONS).has('x'), false);
  for (const xAxes of [[], ['actions', 'sameFinger']] as const) {
    const diagnostics: CodecDiagnostic[] = [];
    const params = scatterOptions.encodeOptionsToUrl({ ...DEFAULT_SCATTER_OPTIONS, xAxes });
    assert.equal(params.get('x'), xAxes.join(','));
    const decoded = scatterOptions.decodeOptionsFromUrl(params, diagnostics);
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(decoded.values.xAxes, xAxes);
  }
  const options = scatterOptions.decodeOptions({ xAxes: ['sameFinger', 'actions', 'nothing'] }, []) as typeof DEFAULT_SCATTER_OPTIONS;
  assert.deepEqual(options.xAxes, ['actions', 'sameFinger']);
});

test('図の並び: 既定は横軸ごとで、縦軸ごとをURLに載せて読み戻す', () => {
  assert.equal(DEFAULT_SCATTER_OPTIONS.freeOrder, 'byX');
  assert.equal(scatterOptions.encodeOptionsToUrl(DEFAULT_SCATTER_OPTIONS).has('order'), false);
  const params = scatterOptions.encodeOptionsToUrl({ ...DEFAULT_SCATTER_OPTIONS, freeOrder: 'byY' });
  assert.equal(scatterOptions.decodeOptionsFromUrl(params, []).values.freeOrder, 'byY');
});
