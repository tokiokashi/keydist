import assert from 'node:assert/strict';
import test from 'node:test';
import { isShownOnScreen } from './use-pane-on-screen.ts';

test('表示領域に面積を持って入っていれば、画面に入っている', () => {
  assert.equal(isShownOnScreen({ isIntersecting: true, intersectionRect: { width: 120, height: 30 } }), true);
  assert.equal(isShownOnScreen({ isIntersecting: true, intersectionRect: { width: 1, height: 1 } }), true);
});

test('表示領域の外にあれば、画面に入っていない', () => {
  assert.equal(isShownOnScreen({ isIntersecting: false, intersectionRect: { width: 0, height: 0 } }), false);
});

test('辺だけが触れている場合と、表示されていない要素（幅か高さが0）は、画面に入っていない', () => {
  assert.equal(isShownOnScreen({ isIntersecting: true, intersectionRect: { width: 400, height: 0 } }), false);
  assert.equal(isShownOnScreen({ isIntersecting: true, intersectionRect: { width: 0, height: 300 } }), false);
});
