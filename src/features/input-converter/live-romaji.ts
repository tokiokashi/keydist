import type { InputContextRequirement } from '../../core/semantic-input/index.ts';

interface RomanKanaEntry {
  readonly kana: string;
  readonly roman: string;
}

/**
 * かな->ローマ字tableを逆向きに最長一致して、実入力のraw roman streamを表示かなへ戻す。
 * 未完成の綴りやtable外文字はそのまま残すので、入力途中でも文字を失わない。
 */
export function romajiToKana(
  text: string,
  table: ReadonlyMap<string, string>,
): string {
  const entries: RomanKanaEntry[] = [...table]
    .map(([kana, roman]) => ({ kana, roman }))
    .filter((entry) => entry.roman.length > 0)
    .sort((left, right) =>
      [...right.roman].length - [...left.roman].length
      || [...right.kana].length - [...left.kana].length);

  const chars = [...text];
  let result = '';
  for (let cursor = 0; cursor < chars.length;) {
    let matched: RomanKanaEntry | undefined;
    for (const entry of entries) {
      const roman = [...entry.roman];
      if (roman.length > chars.length - cursor) continue;
      if (roman.every((char, offset) => chars[cursor + offset] === char)) {
        matched = entry;
        break;
      }
    }

    if (matched === undefined) {
      result += chars[cursor];
      cursor += 1;
      continue;
    }

    result += matched.kana;
    cursor += [...matched.roman].length;
  }
  return result;
}

/**
 * live inputには評価時のtarget kana chunkがないため、youon-onlyは
 * 「直前に子音が確定している」ことをruntime contextとして扱う。
 * これで standalone の ya/yu/yo comboは奪わず、k + (ya combo) -> kya のような
 * 実入力だけを許可する。
 */
export function liveRomajiContextSatisfied(
  requirements: readonly InputContextRequirement[],
  rawRomanText: string,
): boolean {
  return requirements.every((requirement) => {
    if (requirement.kind !== 'youon-only') return false;
    return /[bcdfghjklmnpqrstvwxyz]$/i.test(rawRomanText);
  });
}
