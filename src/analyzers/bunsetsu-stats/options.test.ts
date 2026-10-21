import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bunsetsuStatsOptions } from './options.ts';

test('並び替えの既定は並び替えなしで、列id:向きでURLに読み書きでき、解除するとURLに出ない', () => {
  assert.equal(bunsetsuStatsOptions.defaultOptions.sort, null);
  const sort = { column: 'segmentP90', direction: 'desc' } as const;
  const params = bunsetsuStatsOptions.encodeOptionsToUrl({ sort });
  assert.equal(params.get('sort'), 'segmentP90:desc');
  assert.deepEqual(bunsetsuStatsOptions.decodeOptionsFromUrl(params, []).values, { sort });
  assert.equal(bunsetsuStatsOptions.encodeOptionsToUrl(bunsetsuStatsOptions.defaultOptions).has('sort'), false);
});

test('未知の列や向きのURL・保存値は捨てて並び替えなしに戻す', () => {
  for (const raw of ['x:asc', 'skipped:up', 'skipped']) {
    const diagnostics: unknown[] = [];
    const decoded = bunsetsuStatsOptions.decodeOptionsFromUrl(new URLSearchParams({ sort: raw }), diagnostics as never);
    assert.deepEqual(decoded.values, {}, raw);
    assert.equal(diagnostics.length, 1, raw);
  }
  assert.equal(bunsetsuStatsOptions.decodeOptions({ sort: { column: 'x', direction: 'asc' } }, []).sort, null);
});

test('並び替えは表示だけの設定で、抽出のキーに入らない', () => {
  const key = (sort: unknown) => JSON.stringify(bunsetsuStatsOptions.extractKeyOf({ sort } as never));
  assert.equal(key({ column: 'skipped', direction: 'asc' }), key(null));
});
