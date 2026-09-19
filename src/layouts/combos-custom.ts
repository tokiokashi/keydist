import type { ComboCondition, ComboDefinition, ComboPresentation } from './types.ts';

/**
 * 利用者のVialキーマップ（Corne V4）から起こしたコンボ。
 *
 * 出力は打鍵する文字列、入力はその文字を出すキーの集合で書く。
 * キーを物理位置ではなく文字で指すことで、配列が変わっても同じ定義が使える。
 */
const YOUON_ONLY: ComboCondition = { youonOnly: true };

const RAW_CUSTOM_COMBOS: ComboDefinition[] = [
  ['desita', ['d', 's', 't']],
  ['masita', ['m', 's', 't']],
  ['siteha', ['s', 't', 'h']],
  ['deha', ['d', 'h']],
  ['desu', ['d', 's']],
  ['kara', ['k', 'r']],
  ['koto', ['t', 'n']],
  ['masu', ['m', 's']],
  ['mono', ['d', 'm']],
  ['nado', ['n', 'd']],
  ['niha', ['n', 'h']],
  ['sika', ['s', 'k']],
  ['sita', ['s', 't', 'n']],
  ['site', ['s', 't']],
  ['suru', ['s', 'r']],
  ['tame', ['t', 'm']],
  ['toha', ['t', 'h']],
  ['yaku', ['i', 'a', 'x'], YOUON_ONLY],
  ['yann', ['i', 'a', 'v'], YOUON_ONLY],
  ['yatu', ['i', 'a', ','], YOUON_ONLY],
  ['yeku', ['i', 'a', 'o', 'x'], YOUON_ONLY],
  ['yenn', ['i', 'e', 'v'], YOUON_ONLY],
  ['yetu', ['i', 'e', ','], YOUON_ONLY],
  ['yoku', ['i', 'o', 'x'], YOUON_ONLY],
  ['yonn', ['i', 'o', 'v'], YOUON_ONLY],
  ['yotu', ['i', 'o', ','], YOUON_ONLY],
  ['yuku', ['i', 'u', 'x'], YOUON_ONLY],
  ['yunn', ['i', 'u', 'v'], YOUON_ONLY],
  ['yutu', ['i', 'u', ','], YOUON_ONLY],
  ['-nn', ['-', 'j']],
  ['aki', ['a', 'j']],
  ['aku', ['a', 'x']],
  ['ann', ['a', 'v']],
  ['ati', ['a', 'l']],
  ['atu', ['a', ',']],
  ['eki', ['e', 'c']],
  ['eku', ['a', 'x', 'o']],
  ['enn', ['e', 'v']],
  ['eti', ['e', 'l']],
  ['etu', ['e', ',']],
  ['iki', ['i', 'c']],
  ['iku', ['i', 'x']],
  ['inn', ['i', 'v']],
  ['iti', ['i', 'o', 'a', 'e']],
  ['itu', ['i', ',']],
  ['oki', ['o', 'c']],
  ['oku', ['o', 'x']],
  ['onn', ['j', 'o']],
  ['oti', ['o', 'l']],
  ['otu', ['o', ',']],
  ['uki', ['u', 'c']],
  ['uku', ['u', 'x']],
  ['unn', ['u', 'v']],
  ['uti', ['u', 'l']],
  ['utu', ['u', ',']],
  ['yau', ['i', 'a', '-'], YOUON_ONLY],
  ['you', ['i', 'a', 'o'], YOUON_ONLY],
  ['yuu', ['i', 'u', 'o'], YOUON_ONLY],
  ['ae', ['a', 'e', 'i']],
  ['ai', ['e', 'a']],
  ['au', ['a', '-']],
  ['ei', ['e', 'o']],
  ['ii', ['i', '-']],
  ['nn', ['n', 's']],
  ['oi', ['e', 'i', 'o']],
  ['oo', ['o', 'a', 'e']],
  ['ou', ['o', 'a']],
  ['ui', ['e', 'u']],
  ['uu', ['u', 'o']],
  ['ya', ['i', 'a'], YOUON_ONLY],
  ['ye', ['i', 'e'], YOUON_ONLY],
  ['yo', ['i', 'o'], YOUON_ONLY],
  ['yu', ['i', 'u'], YOUON_ONLY],
];


const VOCABULARY_OUTPUTS = new Set([
  'desita', 'masita', 'siteha', 'deha', 'desu', 'kara', 'koto', 'masu', 'mono',
  'nado', 'niha', 'sika', 'sita', 'site', 'suru', 'tame', 'toha',
]);

function comboPresentation(
  output: string,
  condition: ComboCondition | undefined,
): ComboPresentation {
  if (VOCABULARY_OUTPUTS.has(output)) return { group: '語彙拡張' };

  if (condition?.youonOnly) {
    const foldTriggerInputs =
      ['ya', 'ye', 'yo', 'yu'].includes(output) ? ['i']
      : ['yaku', 'yann', 'yatu', 'yau', 'you'].includes(output) ? ['i', 'a']
      : ['yenn', 'yetu'].includes(output) ? ['i', 'e']
      : ['yoku', 'yonn', 'yotu'].includes(output) ? ['i', 'o']
      : ['yuku', 'yunn', 'yutu', 'yuu'].includes(output) ? ['i', 'u']
      : undefined;
    return { group: '拗音拡張', ...(foldTriggerInputs ? { foldTriggerInputs } : {}) };
  }

  if (/^[-aeiou](ki|ku|nn|ti|tu)$/.test(output)) {
    const foldTriggerInputs =
      /^(eki|iki|oki|uki)$/.test(output) ? ['c']
      : /^(aku|iku|oku|uku)$/.test(output) ? ['x']
      : /^(ann|enn|inn|unn)$/.test(output) ? ['v']
      : /^(ati|eti|oti|uti)$/.test(output) ? ['l']
      : /^[aeiou]tu$/.test(output) ? [',']
      : undefined;
    return {
      group: 'き・く・ん・ち・つ拡張',
      ...(foldTriggerInputs ? { foldTriggerInputs } : {}),
    };
  }

  const foldTriggerInputs = /^(ai|ei|ui)$/.test(output) ? ['e'] : undefined;
  return {
    group: '二重母音・撥音拡張',
    ...(foldTriggerInputs ? { foldTriggerInputs } : {}),
  };
}

export const CUSTOM_COMBOS: ComboDefinition[] = RAW_CUSTOM_COMBOS.map(
  ([output, inputs, condition]) => [
    output,
    inputs,
    condition,
    comboPresentation(output, condition),
  ],
);
