import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heatmapOptions } from './options.ts';

test('描き方の既定はキーの塗りで、共有リンクと保存に読み書きでき、既定ならURLに出ない', () => {
  assert.equal(heatmapOptions.defaultOptions.drawStyle, 'fill');
  assert.equal(heatmapOptions.encodeOptionsToUrl(heatmapOptions.defaultOptions).has('drawStyle'), false);
  const params = heatmapOptions.encodeOptionsToUrl({ drawStyle: 'blob' });
  assert.equal(params.get('drawStyle'), 'blob');
  assert.deepEqual(heatmapOptions.decodeOptionsFromUrl(params, []).values, { drawStyle: 'blob' });
  assert.equal(heatmapOptions.decodeOptions({ drawStyle: 'blob' }, []).drawStyle, 'blob');
});

test('未知の描き方は捨てて、キーの塗りに戻す', () => {
  const diagnostics: unknown[] = [];
  assert.equal(heatmapOptions.decodeOptions({ drawStyle: 'glow' }, diagnostics as never).drawStyle, 'fill');
  assert.equal(diagnostics.length, 1);
});

test('描き方は表示だけの設定で、抽出のキーに入らない', () => {
  const key = (drawStyle: 'fill' | 'blob') => JSON.stringify(heatmapOptions.extractKeyOf({ drawStyle }));
  assert.equal(key('blob'), key('fill'));
});
