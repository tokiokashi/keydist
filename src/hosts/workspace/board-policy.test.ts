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

test('余白のペインの下限は、見出しとその周りの隙間だけ（Analyzerの本体の窓を取らない）。タブを隠しても2段にならず、Dockviewの最小の高さで頭打ち', () => {
  assert.ok(Math.abs(workspaceBoardPolicy(false).floorRemOfAnalyzer('blank') - (4.2 + 2.6)) < 1e-9);
  // タブを隠すと見出しだけの4.2remはDockviewの最小の高さ（100px = 6.25rem）を下回るので、6.25remまで引き上げる
  assert.ok(Math.abs(workspaceBoardPolicy(true).floorRemOfAnalyzer('blank') - 6.25) < 1e-9);
});

test('どのペインの下限もDockviewの最小の高さ（6.25rem）以上。タブの有無によらない', () => {
  for (const hideTabs of [false, true]) {
    const policy = workspaceBoardPolicy(hideTabs);
    for (const id of ['blank', 'bigram-flow', 'comparison', 'n-sensitivity', 'unknown']) {
      assert.ok(policy.floorRemOfAnalyzer(id) >= 6.25, `${id} (hideTabs=${hideTabs})`);
    }
  }
});

test('縮められるペインの高さはDockviewの最小の高さ（6.25rem）。ペインの下限より低く、タブの有無によらない（#896）', () => {
  for (const hideTabs of [false, true]) {
    const policy = workspaceBoardPolicy(hideTabs);
    assert.equal(policy.minPaneRem, 6.25);
    for (const id of ['blank', 'bigram-flow', 'comparison', 'n-sensitivity']) {
      assert.ok(policy.minPaneRem <= policy.floorRemOfAnalyzer(id), `${id} (hideTabs=${hideTabs})`);
    }
  }
});
