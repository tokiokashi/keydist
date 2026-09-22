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
  const hatsuonRoman = table.get('ん');
  const hatsuonChars = hatsuonRoman === undefined ? [] : [...hatsuonRoman];
  let result = '';
  for (let cursor = 0; cursor < chars.length;) {
    // 促音自動生成には n 始まりも含まれるため、単純な最長一致だと
    // "onnya" を o + "nnya"(っにゃ) と誤分割する。
    // 明示された撥音綴りを先に確定し、「おん」+「や」の境界を守る。
    if (
      hatsuonChars.length > 0
      && hatsuonChars.every((char, offset) => chars[cursor + offset] === char)
    ) {
      result += 'ん';
      cursor += hatsuonChars.length;
      continue;
    }

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
    if (!/[bcdfghjklmnpqrstvwxyz]$/i.test(rawRomanText)) return false;
    // "nn" は既に撥音として完結している。後続の ya/yu/yo を
    // 拗音comboとして吸収せず、「ん」+「や/ゆ/よ」の境界を保つ。
    return !rawRomanText.endsWith('nn');
  });
}
