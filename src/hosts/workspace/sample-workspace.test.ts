import assert from 'node:assert/strict';
import test from 'node:test';
import { createSampleWorkspace, SAMPLE_FINGER_DISTANCE_SIZE } from '#engine/sample-workspace.ts';
import { initialWorkspaceLibrary } from '#engine/workspace.ts';
import { findWorkspaceAnalyzer } from './analyzer-registry.ts';
import { defaultGridSize } from './grid-metrics.ts';

// サンプルのAnalyzerのidは engine が文字列で持つ（engine は analyzers/<name>/ を読めない）。
// 組み込みのAnalyzerのidが変わったら、ペインが「使えない」ままのサンプルになる前にここで落とす。
test('サンプルのペインのAnalyzerは、Workspaceに置ける組み込みのAnalyzerで、対象の持ち方も合う', () => {
  let n = 0;
  const { created } = createSampleWorkspace(initialWorkspaceLibrary(), () => 'w', () => `p${(n += 1)}`);
  for (const pane of created.panes) {
    const entry = findWorkspaceAnalyzer(pane.analyzerId);
    assert.ok(entry, `組み込みのAnalyzerに無い: ${pane.analyzerId}`);
    if (pane.binding.mode !== 'follow') assert.fail('サンプルのペインは連動の組に従う');
    const group = created.groups.find((candidate) => candidate.id === (pane.binding as { group: string }).group);
    assert.ok(group, '従う組が無い');
    // 集合を見るAnalyzerは組の集合、1つを見るAnalyzerは組の単体の対象が空でない
    if (entry.cardinality === 'set') assert.ok(group.target.set.targets.length > 0);
    else assert.ok(group.target.single.target !== undefined);
  }
});

test('サンプルの指ごとの距離の高さは、ペインを足した時の既定の高さより低い', () => {
  assert.ok(SAMPLE_FINGER_DISTANCE_SIZE.h < defaultGridSize('finger-distance').h);
});
