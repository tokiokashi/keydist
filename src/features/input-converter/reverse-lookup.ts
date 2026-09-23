import type {
  InputAlternative,
  InputContextRequirement,
} from '../../core/semantic-input/index.ts';
import type { Layout } from '../../layouts/index.ts';
import { kanaToRomaji } from '../../romaji/kunrei.ts';

export interface ReverseLookupStep {
  readonly output: string;
  readonly actions: readonly (readonly string[])[];
  readonly origin: InputAlternative['origin'];
  readonly aggregationGroupIds: readonly string[];
}

export interface ReverseLookupRoute {
  readonly steps: readonly ReverseLookupStep[];
  readonly actionCount: number;
  readonly keyCount: number;
}

function contextSatisfied(
  requirements: readonly InputContextRequirement[],
  logicalText: string,
  cursor: number,
): boolean {
  return requirements.every((requirement) => {
    if (requirement.kind !== 'youon-only') return false;
    if (cursor <= 0) return false;
    return /[bcdfghjklmnpqrstvwxyz]/i.test(logicalText[cursor - 1] ?? '');
  });
}

function routeSignature(route: ReverseLookupRoute): string {
  return route.steps
    .map((step) => [
      step.output,
      step.origin,
      step.actions.map((action) => action.join('+')).join('>'),
    ].join('\u0001'))
    .join('\u0002');
}

function compareRoutes(left: ReverseLookupRoute, right: ReverseLookupRoute): number {
  // まずcanonical outputをできるだけ長くまとめて一致させる。
  // 同じ文字列を複数stepへ細分化する経路より、長いoutputを一度に出す経路を優先する。
  return left.steps.length - right.steps.length
    || left.actionCount - right.actionCount
    || left.keyCount - right.keyCount
    || routeSignature(left).localeCompare(routeSignature(right));
}

function stepFromAlternative(
  output: string,
  alternative: InputAlternative,
): ReverseLookupStep {
  return {
    output,
    origin: alternative.origin,
    actions: alternative.baseRealizations.flatMap((realization) =>
      realization.actions.map((action) => [...action])),
    aggregationGroupIds: [...new Set(
      alternative.semanticInputs.map((input) => input.aggregationGroupId),
    )],
  };
}

function prependStep(
  step: ReverseLookupStep,
  tail: ReverseLookupRoute,
): ReverseLookupRoute {
  const actionCount = step.actions.length + tail.actionCount;
  const keyCount = step.actions.reduce((total, action) => total + action.length, 0)
    + tail.keyCount;
  return {
    steps: [step, ...tail.steps],
    actionCount,
    keyCount,
  };
}

/**
 * 入力したい文字列からcanonical inputを逆引きする。
 *
 * - かな配列: queryをそのままcanonical outputへ照合
 * - romaji配列: layoutのromajiTableでqueryをlogical roman streamへ変換して照合
 * - routeはaction数、総キー数、step数の順で少ないものを優先
 * - context requirementもquery内の位置を使って評価する
 */
export function reverseLookup(
  layout: Layout,
  query: string,
  limit = 5,
): readonly ReverseLookupRoute[] {
  if (query.length === 0 || limit <= 0) return [];

  const logicalText = layout.romajiTable === undefined
    ? query
    : kanaToRomaji(query, layout.romajiTable);
  const outputs = [...layout.canonicalInputs.keys()]
    .filter((output) => output.length > 0)
    .sort((left, right) =>
      [...right].length - [...left].length
      || left.localeCompare(right));

  const memo = new Map<number, ReverseLookupRoute[]>();

  const search = (cursor: number): ReverseLookupRoute[] => {
    if (cursor === logicalText.length) {
      return [{ steps: [], actionCount: 0, keyCount: 0 }];
    }
    const cached = memo.get(cursor);
    if (cached !== undefined) return cached;

    const routes: ReverseLookupRoute[] = [];
    for (const output of outputs) {
      if (!logicalText.startsWith(output, cursor)) continue;
      const nextCursor = cursor + output.length;
      for (const alternative of layout.canonicalInputs.get(output) ?? []) {
        if (!contextSatisfied(alternative.contextRequirements, logicalText, cursor)) continue;
        const step = stepFromAlternative(output, alternative);
        if (step.actions.length === 0) continue;
        for (const tail of search(nextCursor)) {
          routes.push(prependStep(step, tail));
        }
      }
    }

    const unique = [...new Map(
      routes.map((route) => [routeSignature(route), route] as const),
    ).values()]
      .sort(compareRoutes)
      .slice(0, Math.max(limit * 3, limit));

    memo.set(cursor, unique);
    return unique;
  };

  return search(0).sort(compareRoutes).slice(0, limit);
}

export function physicalKeyDisplayLabel(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  if (key === 'thumb-l') return '左親指';
  if (key === 'thumb-r') return '右親指';
  if (key === 'shift-l') return '左Shift';
  if (key === 'shift-r') return '右Shift';
  return key;
}

export function reverseLookupStepLabel(step: ReverseLookupStep): string {
  return step.actions
    .map((action) => action.map(physicalKeyDisplayLabel).join(' + '))
    .join(' → ');
}

export function reverseLookupRouteLabel(route: ReverseLookupRoute): string {
  return route.steps
    .map(reverseLookupStepLabel)
    .join(' → ');
}
