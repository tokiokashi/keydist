import assert from 'node:assert/strict';
import test from 'node:test';
import { BIGRAM_FLOW_PANE_META } from './bigram-flow/pane-meta.ts';
import { COMPARISON_PANE_META } from './comparison/pane-meta.ts';
import { DEFAULT_MIN_BODY_HEIGHT_REM, minBodyHeightRemOf } from './min-body-height.ts';
import { N_SENSITIVITY_PANE_META } from './n-sensitivity/pane-meta.ts';

test('本体の縦の下限: 宣言が無ければ既定（本体の窓の最小）、Bigram Flowは縦積みの下限、N感度は図と畳んだ表の分', () => {
  assert.equal(DEFAULT_MIN_BODY_HEIGHT_REM, 12);
  assert.equal(minBodyHeightRemOf(COMPARISON_PANE_META), DEFAULT_MIN_BODY_HEIGHT_REM);
  assert.equal(minBodyHeightRemOf(BIGRAM_FLOW_PANE_META), 26);
  assert.equal(minBodyHeightRemOf(N_SENSITIVITY_PANE_META), 13.6);
  assert.equal(minBodyHeightRemOf({}), DEFAULT_MIN_BODY_HEIGHT_REM);
});
