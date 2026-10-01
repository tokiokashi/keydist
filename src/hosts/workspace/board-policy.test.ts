import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceBoardPolicy } from './board-policy.ts';

test('ペインの下限は、見出し・余白とAnalyzerが宣言した本体の下限の和。タブを隠すとタブの帯の分だけ低い', () => {
  const shown = workspaceBoardPolicy(false);
  const hidden = workspaceBoardPolicy(true);
  const flow = shown.floorRemOfAnalyzer('bigram-flow');
  const comparison = shown.floorRemOfAnalyzer('comparison');
  // 宣言していないAnalyzerと、未知のAnalyzerは既定の本体の下限
  assert.equal(shown.floorRemOfAnalyzer('unknown'), comparison);
  assert.ok(Math.abs(flow - comparison - (26 - 12)) < 1e-9);
  assert.ok(Math.abs(shown.floorRemOfAnalyzer('comparison') - hidden.floorRemOfAnalyzer('comparison') - 2.6) < 1e-9);
});
