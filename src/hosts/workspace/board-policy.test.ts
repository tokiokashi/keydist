import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceBoardPolicy } from './board-policy.ts';

test('ペインの下限は、見出し・余白とAnalyzerが宣言した本体の下限の和。タブを隠す表示は名前が枠の中に残るので見出しが高い', () => {
  const shown = workspaceBoardPolicy(false);
  const hidden = workspaceBoardPolicy(true);
  const flow = shown.floorRemOfAnalyzer('bigram-flow');
  const comparison = shown.floorRemOfAnalyzer('comparison');
  // 宣言していないAnalyzerと、未知のAnalyzerは既定の本体の下限
  assert.equal(shown.floorRemOfAnalyzer('unknown'), comparison);
  assert.ok(Math.abs(flow - comparison - (26 - 12)) < 1e-9);
  // タブを出す時は、見出しが1行（4.2rem）+ タブの帯（2.6rem）。隠す時は枠の中の名前の行が増え、狭いペインで2段（9.9rem）
  assert.ok(Math.abs(comparison - (4.2 + 2.6 + 12)) < 1e-9);
  assert.ok(Math.abs(hidden.floorRemOfAnalyzer('comparison') - (9.9 + 12)) < 1e-9);
});

test('余白のペインの下限は、見出しと余白だけ（Analyzerの本体の窓を取らない）。タブを隠しても2段にならない', () => {
  assert.ok(Math.abs(workspaceBoardPolicy(false).floorRemOfAnalyzer('blank') - (4.2 + 2.6)) < 1e-9);
  assert.ok(Math.abs(workspaceBoardPolicy(true).floorRemOfAnalyzer('blank') - 4.2) < 1e-9);
});
