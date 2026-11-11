import type { SentenceBuildResult } from '#interpretation/timing/sentence-measurement.ts';
import { sentencePlan, sentenceSteps, sentenceUnmeasurable, type SentencePlan } from '#interpretation/timing/sentence-session.ts';
import { sentenceUnmeasurableText } from './calibration-text.ts';

/** 文章を打つ測定の準備。打てる時は文ごとの測定の計画を持ち、打てない時は理由の文を持つ。 */
export type SentenceSetup = { readonly ok: true; readonly plans: readonly SentencePlan[] } | { readonly ok: false; readonly message: string };

/** 示す文の全部が打てる時だけ、測れる。1本でも作れない・測れない文があれば、その理由を返す。 */
export function sentenceSetupOf(builds: readonly SentenceBuildResult[], phraseBreaks: readonly (readonly number[])[]): SentenceSetup {
  const plans: SentencePlan[] = [];
  for (const [index, build] of builds.entries()) {
    if (!build.ok) return build;
    const unmeasurable = sentenceUnmeasurable(sentenceSteps(build.analysis));
    if (unmeasurable !== undefined) return { ok: false, message: sentenceUnmeasurableText(unmeasurable) };
    plans.push({ ...sentencePlan(build.analysis, build.spelling), phraseBreaks: phraseBreaks[index] ?? [] });
  }
  return { ok: true, plans };
}
