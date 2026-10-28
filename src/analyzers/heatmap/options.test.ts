import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heatmapOptions } from './options.ts';

test('描き方の既定はキーの塗りで、共有リンクと保存に読み書きでき、既定ならURLに出ない', () => {
  assert.equal(heatmapOptions.defaultOptions.drawStyle, 'fill');
  assert.equal(heatmapOptions.encodeOptionsToUrl(heatmapOptions.defaultOptions).has('drawStyle'), false);
  const params = heatmapOptions.encodeOptionsToUrl({ ...heatmapOptions.defaultOptions, drawStyle: 'blob' });
  assert.equal(params.get('drawStyle'), 'blob');
  assert.deepEqual(heatmapOptions.decodeOptionsFromUrl(params, []).values, { drawStyle: 'blob' });
  assert.equal(heatmapOptions.decodeOptions({ drawStyle: 'blob' }, []).drawStyle, 'blob');
  assert.equal(heatmapOptions.decodeOptions({ drawStyle: 'none' }, []).drawStyle, 'none');
  assert.equal(heatmapOptions.encodeOptionsToUrl({ ...heatmapOptions.defaultOptions, drawStyle: 'none' }).get('drawStyle'), 'none');
});

test('未知の描き方は捨てて、キーの塗りに戻す', () => {
  const diagnostics: unknown[] = [];
  assert.equal(heatmapOptions.decodeOptions({ drawStyle: 'glow' }, diagnostics as never).drawStyle, 'fill');
  assert.equal(diagnostics.length, 1);
});

test('描き方は表示だけの設定で、抽出のキーに入らない', () => {
  const key = (drawStyle: 'fill' | 'blob' | 'none') => JSON.stringify(heatmapOptions.extractKeyOf({ ...heatmapOptions.defaultOptions, drawStyle }));
  assert.equal(key('blob'), key('fill'));
  assert.equal(key('none'), key('fill'));
});

test('配色の既定は単色で、共有リンクと保存に読み書きでき、既定ならURLに出ない。未知の配色は単色に戻す', () => {
  assert.equal(heatmapOptions.defaultOptions.palette, 'single');
  assert.equal(heatmapOptions.encodeOptionsToUrl(heatmapOptions.defaultOptions).has('palette'), false);
  const params = heatmapOptions.encodeOptionsToUrl({ ...heatmapOptions.defaultOptions, palette: 'multi' });
  assert.equal(params.get('palette'), 'multi');
  assert.deepEqual(heatmapOptions.decodeOptionsFromUrl(params, []).values, { palette: 'multi' });
  assert.equal(heatmapOptions.decodeOptions({ palette: 'multi' }, []).palette, 'multi');
  const diagnostics: unknown[] = [];
  assert.equal(heatmapOptions.decodeOptions({ palette: 'rainbow' }, diagnostics as never).palette, 'single');
  assert.equal(diagnostics.length, 1);
});

test('配色は表示だけの設定で、抽出のキーに入らない', () => {
  const key = (palette: 'single' | 'multi') => JSON.stringify(heatmapOptions.extractKeyOf({ ...heatmapOptions.defaultOptions, palette }));
  assert.equal(key('multi'), key('single'));
});

test('2打鍵の線は既定で表示せず、線の組は続けて打った2打鍵。どちらも共有リンクと保存に読み書きでき、既定ならURLに出ない', () => {
  assert.equal(heatmapOptions.defaultOptions.flowLines, false);
  assert.equal(heatmapOptions.defaultOptions.flowLineSource, 'actual');
  const defaults = heatmapOptions.encodeOptionsToUrl(heatmapOptions.defaultOptions);
  assert.equal(defaults.has('flowLines'), false);
  assert.equal(defaults.has('flowLineSource'), false);
  const next = { ...heatmapOptions.defaultOptions, flowLines: true, flowLineSource: 'within-hand' as const };
  const params = heatmapOptions.encodeOptionsToUrl(next);
  assert.equal(params.get('flowLines'), 'true');
  assert.equal(params.get('flowLineSource'), 'within-hand');
  assert.deepEqual(heatmapOptions.decodeOptionsFromUrl(params, []).values, { flowLines: true, flowLineSource: 'within-hand' });
  const stored = heatmapOptions.decodeOptions({ flowLines: true, flowLineSource: 'within-hand' }, []);
  assert.equal(stored.flowLines, true);
  assert.equal(stored.flowLineSource, 'within-hand');
});

test('線の表示と線の組は表示だけの設定で、抽出のキーに入らない', () => {
  const key = (flowLines: boolean, flowLineSource: 'actual' | 'within-hand') =>
    JSON.stringify(heatmapOptions.extractKeyOf({ ...heatmapOptions.defaultOptions, flowLines, flowLineSource }));
  assert.equal(key(true, 'within-hand'), key(false, 'actual'));
});
