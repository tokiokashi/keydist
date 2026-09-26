import {
  inputAlternativeSelectionIdentity,
  type InputAlternative,
  type InputContextRequirement,
} from '../../core/semantic-input/index.ts';
import { resolveKeyId } from '../../geometry.ts';
import type { Layout } from '../../layouts/index.ts';
import { kanaToRomaji } from '#input/romaji/kunrei.ts';
import { romajiToKana } from './live-romaji.ts';

export interface ReverseLookupActionParticipation {
  /** このactionでoutput側として参加するphysical key。 */
  readonly outputKeys: readonly string[];
  /** このactionでtrigger側として参加するphysical key。outputKeysとの重複を許す。 */
  readonly triggerKeys: readonly string[];
}

export interface ReverseLookupStep {
  readonly output: string;
  readonly actions: readonly (readonly string[])[];
  /** 表示actionごとに受理するphysical key variant。表示代表と入力受理を分離する。 */
  readonly actionKeyAlternatives: readonly (readonly (readonly string[])[])[];
  /**
   * 選択済みcanonical alternativeのauthoring participation。
   * aggregationから再推定せず、対象semanticに対応するrealizationをそのままguideへ流す。
   */
  readonly actionParticipationAlternatives:
    readonly (readonly ReverseLookupActionParticipation[])[];
  readonly origin: InputAlternative['origin'];
  readonly aggregationGroupIds: readonly string[];
  /** physical alternativeだけ異なる等価経路をまとめても全canonical identityを受理する。 */
  readonly acceptedAlternativeSelectionIdentities: readonly string[];
}

export interface ReverseLookupGuideAction {
  readonly output: string;
  readonly routeStepIndex: number;
  readonly actionIndex: number;
  readonly keys: readonly string[];
  readonly keyAlternatives: readonly (readonly string[])[];
  readonly participationAlternatives: readonly ReverseLookupActionParticipation[];
  readonly finalInRouteStep: boolean;
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
      step.acceptedAlternativeSelectionIdentities.join('|'),
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

function normalizedParticipation(
  action: readonly string[],
  outputKeys: readonly string[],
  triggerKeys: readonly string[],
): ReverseLookupActionParticipation {
  const actionKeys = new Set(action.map(resolveKeyId));
  const normalize = (keys: readonly string[]) => [...new Set(
    keys.map(resolveKeyId).filter((key) => actionKeys.has(key)),
  )];
  return {
    outputKeys: normalize(outputKeys),
    triggerKeys: normalize(triggerKeys),
  };
}

function sameParticipation(
  left: ReverseLookupActionParticipation,
  right: ReverseLookupActionParticipation,
): boolean {
  return sameKeys(left.outputKeys, right.outputKeys)
    && sameKeys(left.triggerKeys, right.triggerKeys);
}

function realizationActionParticipations(
  realization: InputAlternative['baseRealizations'][number],
): readonly (readonly ReverseLookupActionParticipation[])[] {
  const views = [
    {
      outputKeys: realization.defaultOutputKeys,
      triggerKeys: realization.defaultTriggerKeys ?? [],
    },
    ...(realization.alternateParticipations ?? []),
  ];

  return realization.actions.map((action) => {
    const participations: ReverseLookupActionParticipation[] = [];
    for (const view of views) {
      const participation = normalizedParticipation(
        action,
        view.outputKeys,
        view.triggerKeys,
      );
      if (!participations.some((candidate) => sameParticipation(candidate, participation))) {
        participations.push(participation);
      }
    }
    return participations;
  });
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
    actionKeyAlternatives: alternative.baseRealizations.flatMap((realization) =>
      realization.actions.map((action) => [[...action]])),
    actionParticipationAlternatives: alternative.baseRealizations.flatMap(
      realizationActionParticipations,
    ),
    acceptedAlternativeSelectionIdentities: [
      inputAlternativeSelectionIdentity(alternative),
    ],
  };
}

function canonicalEquivalentKey(layout: Layout, key: string): string {
  const resolved = key;
  const equivalentKeys = layout.thumbShiftKeys ?? [];
  return layout.thumbShiftKey !== undefined && equivalentKeys.includes(resolved)
    ? layout.thumbShiftKey
    : resolved;
}

function equivalentActionSignature(layout: Layout, action: readonly string[]): string {
  return [...new Set(action.map((key) => canonicalEquivalentKey(layout, key)))]
    .sort()
    .join('+');
}

function equivalentRouteSignature(layout: Layout, route: ReverseLookupRoute): string {
  return route.steps
    .map((step) => [
      step.output,
      step.origin,
      step.aggregationGroupIds.join('|'),
      step.actions.map((action) => equivalentActionSignature(layout, action)).join('>'),
    ].join('\u0001'))
    .join('\u0002');
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  const l = [...new Set(left)].sort();
  const r = [...new Set(right)].sort();
  return l.length === r.length && l.every((key, index) => key === r[index]);
}

function mergeEquivalentRoutes(
  layout: Layout,
  routes: readonly ReverseLookupRoute[],
): ReverseLookupRoute[] {
  const grouped = new Map<string, ReverseLookupRoute>();

  for (const route of routes) {
    const signature = equivalentRouteSignature(layout, route);
    const existing = grouped.get(signature);
    if (existing === undefined) {
      grouped.set(signature, route);
      continue;
    }

    grouped.set(signature, {
      ...existing,
      steps: existing.steps.map((step, stepIndex) => {
        const incoming = route.steps[stepIndex];
        if (incoming === undefined) return step;
        return {
          ...step,
          acceptedAlternativeSelectionIdentities: [...new Set([
            ...step.acceptedAlternativeSelectionIdentities,
            ...incoming.acceptedAlternativeSelectionIdentities,
          ])],
          actionKeyAlternatives: step.actionKeyAlternatives.map((variants, actionIndex) => {
            const nextVariants = incoming.actionKeyAlternatives[actionIndex] ?? [];
            const merged = [...variants];
            for (const variant of nextVariants) {
              if (!merged.some((candidate) => sameKeys(candidate, variant))) merged.push(variant);
            }
            return merged;
          }),
          actionParticipationAlternatives: step.actionParticipationAlternatives.map(
            (participations, actionIndex) => {
              const nextParticipations =
                incoming.actionParticipationAlternatives[actionIndex] ?? [];
              const merged = [...participations];
              for (const participation of nextParticipations) {
                if (!merged.some((candidate) =>
                  sameParticipation(candidate, participation))) {
                  merged.push(participation);
                }
              }
              return merged;
            },
          ),
        };
      }),
    });
  }

  return [...grouped.values()];
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

  const candidates = search(0).sort(compareRoutes);
  return mergeEquivalentRoutes(layout, candidates).slice(0, limit);
}

/**
 * 候補routeの中から、最初のstepでより多くのかなをまとめて打つものを選ぶ。
 *
 * 「最長」の定義: route全体のstep数が少ないほど、平均して1stepあたりで
 * まとめて打っているかなが多いと言えるため、step数の少なさを最優先の基準にする
 * （「にゅ」を1stepで打つ経路と「に→ゅ」の2step経路なら前者）。
 * 以降の基準（action数・key数・最後はroute全体の表示signature）はcompareRoutesと揃え、
 * reverseLookupが返す一覧の並び順と選択結果が食い違わないようにする。
 * 同点の場合のtie-breakもcompareRoutes任せなので、渡す配列の順序には依存しない。
 */
export function longestReverseLookupRoute(
  routes: readonly ReverseLookupRoute[],
): ReverseLookupRoute | undefined {
  return routes.reduce<ReverseLookupRoute | undefined>(
    (best, route) => (best === undefined || compareRoutes(route, best) < 0 ? route : best),
    undefined,
  );
}

export function physicalKeyDisplayLabel(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  if (key === 'thumb-l') return '左親指';
  if (key === 'thumb-r') return '右親指';
  if (key === 'shift-l') return '左Shift';
  if (key === 'shift-r') return '右Shift';
  return key;
}

export function reverseLookupStepMatchesRecognition(
  step: ReverseLookupStep,
  recognition: { readonly output: string; readonly alternative: InputAlternative },
): boolean {
  return recognition.output === step.output
    && step.acceptedAlternativeSelectionIdentities.includes(
      inputAlternativeSelectionIdentity(recognition.alternative),
    );
}

export function reverseLookupGuideActions(
  route: ReverseLookupRoute,
): readonly ReverseLookupGuideAction[] {
  return route.steps.flatMap((step, routeStepIndex) =>
    step.actions.map((keys, actionIndex) => ({
      output: step.output,
      routeStepIndex,
      actionIndex,
      keys,
      keyAlternatives: step.actionKeyAlternatives[actionIndex] ?? [keys],
      participationAlternatives:
        step.actionParticipationAlternatives[actionIndex] ?? [],
      finalInRouteStep: actionIndex === step.actions.length - 1,
    })));
}

export function reverseLookupGuideActionMatchesKeys(
  action: ReverseLookupGuideAction,
  keys: readonly string[],
): boolean {
  return action.keyAlternatives.some((variant) => sameKeys(variant, keys));
}

/**
 * 現在guideしているcanonical alternativeのparticipationだけからtrigger-onlyを求める。
 * 等価alternativeのどれかでoutputにもなるkeyは消さない。
 */
export function reverseLookupGuideActionTriggerOnlyKeys(
  action: ReverseLookupGuideAction,
): readonly string[] {
  const outputKeys = new Set(
    action.participationAlternatives.flatMap((participation) =>
      participation.outputKeys.map(resolveKeyId)),
  );
  const triggerKeys = new Set(
    action.participationAlternatives.flatMap((participation) =>
      participation.triggerKeys.map(resolveKeyId)),
  );
  return [...triggerKeys].filter((key) => !outputKeys.has(key));
}

/**
 * OR alternativeのguide強調keyを返す。
 * 左右等価な親指shiftだけが差分なら両方を候補として強調し、
 * それ以外のalternativeでは共通keyだけを強調する。
 */
export function reverseLookupGuideActionHighlightKeys(
  layout: Layout,
  action: ReverseLookupGuideAction,
): readonly string[] {
  const variants = action.keyAlternatives;
  if (variants.length === 0) return action.keys.map(resolveKeyId);

  const equivalentThumbs = new Set((layout.thumbShiftKeys ?? []).map(resolveKeyId));
  if (equivalentThumbs.size > 1 && variants.length > 1) {
    const normalize = (variant: readonly string[]) =>
      [...new Set(variant.map((key) => {
        const resolved = resolveKeyId(key);
        return equivalentThumbs.has(resolved) ? '__thumb-shift__' : resolved;
      }))].sort();

    const signatures = variants.map((variant) => normalize(variant).join('\u0000'));
    if (signatures.every((signature) => signature === signatures[0])) {
      return [...new Set(variants.flatMap((variant) => variant.map(resolveKeyId)))];
    }
  }

  const common = new Set(variants[0].map(resolveKeyId));
  for (const variant of variants.slice(1)) {
    const current = new Set(variant.map(resolveKeyId));
    for (const key of [...common]) {
      if (!current.has(key)) common.delete(key);
    }
  }
  return action.keys
    .map(resolveKeyId)
    .filter((key, index, keys) => common.has(key) && keys.indexOf(key) === index);
}

export function reverseLookupGuideIndexForText(
  layout: Layout,
  route: ReverseLookupRoute,
  text: string,
): number {
  const actions = reverseLookupGuideActions(route);
  if (actions.length === 0) return 0;

  let logicalPrefix = '';
  let completedRouteSteps = 0;
  for (const [stepIndex, step] of route.steps.entries()) {
    logicalPrefix += step.output;
    const displayPrefix = layout.romajiTable === undefined
      ? logicalPrefix
      : romajiToKana(logicalPrefix, layout.romajiTable);
    if (text.startsWith(displayPrefix)) {
      completedRouteSteps = stepIndex + 1;
    }
  }

  if (completedRouteSteps >= route.steps.length) {
    return actions.length - 1;
  }

  const nextActionIndex = actions.findIndex(
    (action) => action.routeStepIndex === completedRouteSteps,
  );
  return nextActionIndex < 0 ? 0 : nextActionIndex;
}

function equivalentThumbShiftLabel(layout: Layout): string | undefined {
  const keys = [...new Set((layout.thumbShiftKeys ?? []).map(resolveKeyId))];
  if (keys.length < 2) return undefined;
  const labels = [...new Set(
    keys
      .map((key) => layout.legends.get(key))
      .filter((label): label is string => label !== undefined && label.trim() !== ''),
  )];
  return labels.length === 1 ? labels[0] : undefined;
}

function guideActionLabels(
  layout: Layout,
  keys: readonly string[],
  alternatives: readonly (readonly string[])[],
): readonly string[] {
  const equivalentThumbs = new Set((layout.thumbShiftKeys ?? []).map(resolveKeyId));
  const thumbLabel = equivalentThumbShiftLabel(layout);
  if (thumbLabel === undefined || equivalentThumbs.size < 2 || alternatives.length < 2) {
    return keys.map(physicalKeyDisplayLabel);
  }

  const normalize = (variant: readonly string[]) =>
    variant.map((key) =>
      equivalentThumbs.has(resolveKeyId(key)) ? '__thumb-shift__' : resolveKeyId(key));
  const signatures = alternatives.map((variant) =>
    [...normalize(variant)].sort().join('\u0000'));
  if (!signatures.every((signature) => signature === signatures[0])) {
    return keys.map(physicalKeyDisplayLabel);
  }

  return normalize(keys).map((key) =>
    key === '__thumb-shift__' ? thumbLabel : physicalKeyDisplayLabel(key));
}

export function reverseLookupGuideActionLabel(
  layout: Layout,
  action: ReverseLookupGuideAction,
): string {
  return guideActionLabels(layout, action.keys, action.keyAlternatives).join(' + ');
}

export function reverseLookupStepLabel(layout: Layout, step: ReverseLookupStep): string {
  return step.actions
    .map((action, actionIndex) => guideActionLabels(
      layout,
      action,
      step.actionKeyAlternatives[actionIndex] ?? [action],
    ).join(' + '))
    .join(' → ');
}

export function reverseLookupRouteLabel(layout: Layout, route: ReverseLookupRoute): string {
  return route.steps
    .map((step) => reverseLookupStepLabel(layout, step))
    .join(' → ');
}
