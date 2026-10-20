import { resolveWorkspacePaneTarget, type Workspace } from '#engine/workspace.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { findWorkspaceAnalyzer } from './analyzer-registry.ts';

/**
 * Workspaceのテキストを使うペインが映している対象（配列・Setup）。余白のペインと、対象を解決できないペインは含めない。
 * 1つを見るAnalyzerは1つの対象、集合を見るAnalyzerは集合の全員を数える。読みの候補の並べ方が比べる配列の集まりになる。
 */
export function workspacePaneTargets(workspace: Pick<Workspace, 'groups' | 'panes'>): AnalysisTarget[] {
  const targets: AnalysisTarget[] = [];
  for (const pane of workspace.panes) {
    const kind = findWorkspaceAnalyzer(pane.analyzerId)?.cardinality;
    if (kind === undefined) continue;
    const resolved = resolveWorkspacePaneTarget(pane.binding, workspace.groups, kind);
    if (resolved === undefined) continue;
    if (resolved.kind === 'single') targets.push(resolved.target);
    else targets.push(...resolved.selection.targets);
  }
  return targets;
}
