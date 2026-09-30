import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPARISON_PANE_META } from './comparison/pane-meta.ts';
import { N_SENSITIVITY_PANE_META } from './n-sensitivity/pane-meta.ts';
import { DEFAULT_RECOMMENDED_WIDTH_REM, WIDE_RECOMMENDED_WIDTH_REM, recommendedWidthRemOf } from './recommended-width.ts';

test('推奨幅: 指定が無ければ既定、比較表だけ広い', () => {
  assert.equal(recommendedWidthRemOf(N_SENSITIVITY_PANE_META), DEFAULT_RECOMMENDED_WIDTH_REM);
  assert.equal(recommendedWidthRemOf(COMPARISON_PANE_META), WIDE_RECOMMENDED_WIDTH_REM);
  assert.ok(WIDE_RECOMMENDED_WIDTH_REM > DEFAULT_RECOMMENDED_WIDTH_REM);
});
