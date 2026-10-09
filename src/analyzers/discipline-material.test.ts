import assert from 'node:assert/strict';
import test from 'node:test';
import { attributeMetrics } from '#interpretation/attribution.ts';
import { layerComboDisciplineContext, plainDisciplineContext } from './discipline-material.ts';

/**
 * 入れ忘れ防止テストの材料が、検査したい形（レイヤーが複数、コンボあり、左右の手をまたぐ）を
 * 実際に含んでいること。材料が痩せると、レイヤーやコンボの中身を表示だけの設定に依存させる誤りを
 * 検査が見逃す。
 */

test('レイヤーとコンボの材料: 2つ以上のレイヤーとコンボのどれにも押下がある', () => {
  const { trace, metrics } = layerComboDisciplineContext();
  assert.equal(trace.skipped, 0);
  const attribution = attributeMetrics(trace.layerDefinitions, metrics);
  assert.ok(attribution.layers.filter((layer) => layer.presses > 0).length >= 2);
  assert.ok(attribution.combo !== undefined && attribution.combo.presses > 0);
});

test('材料のkeyDetailsとrequestTraceは実際の値を返す', () => {
  const context = plainDisciplineContext();
  assert.equal(context.trace.skipped, 0);
  assert.ok(context.keyDetails() !== undefined);
  assert.equal(context.requestTrace.requestTrace({ tracePolicy: { windowSize: 2 } }).skipped, 0);
});
