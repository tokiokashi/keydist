import type {
  RomajiRuleId,
  RomajiSettings,
  UserRomajiRule,
} from './romaji/rules.ts';
import type { UserLayout } from './user-layouts.ts';

export interface AnalyzerRomajiDialogSnapshot {
  settings: RomajiSettings;
  userLayouts: readonly UserLayout[];
  revision: number;
  refreshRevision: number;
}

export interface AnalyzerRomajiDialogModel {
  getSnapshot(): AnalyzerRomajiDialogSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): void;
  saveRule(rule: UserRomajiRule): void;
  setBuiltinAssignment(layoutId: string, ruleId: RomajiRuleId): void;
  setUserAssignment(layoutId: string, ruleId: RomajiRuleId): void;
}

export interface AnalyzerRomajiDialogModelContext {
  getRomajiSettings(): RomajiSettings;
  getUserLayouts(): UserLayout[];
  commitRomajiSettings(settings: RomajiSettings, rulesChanged: boolean): void;
  commitUserLayouts(layouts: UserLayout[]): void;
  onApplied(): void;
}

function cloneSettings(settings: RomajiSettings): RomajiSettings {
  return {
    rules: settings.rules.map((rule) => ({
      ...rule,
      overrides: { ...rule.overrides },
    })),
    assignments: { ...settings.assignments },
  };
}

function snapshotFromContext(
  context: AnalyzerRomajiDialogModelContext,
  revision: number,
  refreshRevision: number,
): AnalyzerRomajiDialogSnapshot {
  return {
    settings: cloneSettings(context.getRomajiSettings()),
    userLayouts: context.getUserLayouts().map((layout) => ({ ...layout })),
    revision,
    refreshRevision,
  };
}

/**
 * Romaji dialog向けのheadless store。
 * DOMやReact stateは持たず、既存の設定authorityへ変更をcommitしてsnapshotだけ配信する。
 */
export function createAnalyzerRomajiDialogModel(
  context: AnalyzerRomajiDialogModelContext,
): AnalyzerRomajiDialogModel {
  let snapshot = snapshotFromContext(context, 0, 0);
  const listeners = new Set<() => void>();

  const emit = (refresh: boolean) => {
    snapshot = snapshotFromContext(
      context,
      snapshot.revision + 1,
      snapshot.refreshRevision + (refresh ? 1 : 0),
    );
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      emit(true);
    },
    saveRule(rule) {
      const current = context.getRomajiSettings();
      const rules = current.rules.some((candidate) => candidate.id === rule.id)
        ? current.rules.map((candidate) => candidate.id === rule.id ? rule : candidate)
        : [...current.rules, rule];
      context.commitRomajiSettings({ ...current, rules }, true);
      emit(false);
      context.onApplied();
    },
    setBuiltinAssignment(layoutId, ruleId) {
      const current = context.getRomajiSettings();
      context.commitRomajiSettings({
        ...current,
        assignments: {
          ...current.assignments,
          [layoutId]: ruleId,
        },
      }, false);
      emit(false);
      context.onApplied();
    },
    setUserAssignment(layoutId, ruleId) {
      const current = context.getUserLayouts();
      const next = current.map((layout) => (
        layout.id === layoutId ? { ...layout, romaji: ruleId } : layout
      ));
      context.commitUserLayouts(next);
      emit(false);
      context.onApplied();
    },
  };
}
