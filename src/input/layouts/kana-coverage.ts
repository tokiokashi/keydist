import { SEMI_VOICED, VOICED } from './kana-kind.ts';
import type { Layout } from './types.ts';

/**
 * かな配列が打てるべきかなの組。日本語の文章に普通に出るかなを対象にし、特殊な用途のかなは入れない。
 */
export interface KanaCoverageGroup {
  readonly name: string;
  readonly kana: readonly string[];
}

export const KANA_COVERAGE_GROUPS: readonly KanaCoverageGroup[] = [
  { name: '清音', kana: [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'] },
  // 「ゔ」は外来語の表記に限られ、「ヴ」を別に持つ配列もあるので対象に入れない
  { name: '濁音', kana: [...VOICED].filter((kana) => kana !== 'ゔ') },
  { name: '半濁音', kana: [...SEMI_VOICED] },
  // 「ゎ」は「くゎ」など限られた語にしか出ないので対象に入れない
  { name: '小書き', kana: [...'ぁぃぅぇぉゃゅょっ'] },
  { name: '長音', kana: ['ー'] },
  { name: '句読点', kana: ['、', '。'] },
];

/** 対象のかな全部。組の並びのまま。 */
export const KANA_COVERAGE_TARGETS: readonly string[] = KANA_COVERAGE_GROUPS.flatMap((group) => group.kana);

/**
 * 配列が打てない対象のかな。組の並びのまま返し、全部打てるなら空。
 * 打てるかは組んだ配列の入力（`canonicalInputs`）で決める。後置の濁点で合成して打てるかなは、
 * 合成を組んだ時に入力が足されているので打てるものに数える。
 */
export function uncoveredKana(layout: Layout): readonly string[] {
  return KANA_COVERAGE_TARGETS.filter((kana) => !layout.canonicalInputs.has(kana));
}
