import assert from 'node:assert/strict';
import test from 'node:test';
import { testerShareQuery } from './tester-share.ts';

test('組み込みの配列はlayoutにidを載せ、知らせは付けない', () => {
  const query = testerShareQuery({ layoutId: 'tk-onchoku', builtIn: true });
  assert.equal(query.params.toString(), 'layout=tk-onchoku');
  assert.equal(query.notices, undefined);
});

test('自作の配列はlayoutを載せず、載らないことを知らせる', () => {
  const query = testerShareQuery({ layoutId: 'user-abc', builtIn: false });
  assert.equal(query.params.toString(), '');
  assert.deepEqual(query.notices, ['自作の配列はリンクに載りません']);
});
