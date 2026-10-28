import { kunrei } from './kunrei.ts';

/**
 * せおと配列（通常版）の綴り。作者の拡張（`c` = K、`x` = YA、`j` = YU、`q` = YO）と、
 * 左親指を押しながら打つレイヤー（`ん` `っ` `ー`）を訓令式に当てて作る。
 *
 * 作者が綴りを書いているのは、拡張の4つ、じゃ行を `z` で打つこと（`zx`）、小書きのかなを `l` で打つこと、
 * `ye` を `y` で打つこと、`てぃ` `でぃ` を `thi` `dhi` で打つことである。
 * し・ち・つ・ふ の綴りは書いておらず、訓令式のままにしている。
 * 作者は `しゅ(shu)` `しぇ(she)` で打つこともできると書くが、規則は1つの綴りに決めるので、拡張に合う `sj` `sye` を採る。
 * 訓令式のテーブルに見出しの無いかな（`ふぁ` `ヴ` など）は足さない。
 * 作者が配るGoogle日本語入力のローマ字テーブルは暗号化された共有にあり読めないので、表とは突き合わせていない。
 *
 * `ん` `っ` `ー` の綴りは、レイヤーの出力と同じ文字そのものにする。英字の綴り（`nn` `-` など）にすると、
 * 英文の同じ英字にもレイヤーが使われるか、レイヤーが使われなくなるため。この綴りは、レイヤーを持つせおと配列でだけ打てる。
 *
 * 促音は子音を重ねる見出しを自動生成しない。作者は促音をレイヤーの1打で打つ。
 */
const LAYER_SPELLINGS: Readonly<Record<string, string>> = {
  ん: 'ん',
  っ: 'っ',
  ー: 'ー',
};

/** 拗音の `ya` `yu` `yo` を1打にする拡張。`ye` は対象に含めない */
const YOON_KEYS: Readonly<Record<string, string>> = { a: 'x', u: 'j', o: 'q' };

/** 訓令式の綴りに作者の拡張を当てる */
function applyExtensions(roman: string): string {
  // 小書きのかなは `l` で始める。訓令式の `x` は `x` = YA と重なる
  const body = roman.startsWith('x') ? roman.slice(1) : roman;
  const head = roman.startsWith('x') ? 'l' : '';
  const yoon = body.replace(/y([auo])$/, (_, vowel: string) => YOON_KEYS[vowel]);
  const consonant = head === '' && yoon.startsWith('k') ? `c${yoon.slice(1)}` : yoon;
  return head + consonant;
}

export function seotoRomaji(): Map<string, string> {
  const table = new Map<string, string>();
  for (const [kana, roman] of kunrei({}, false)) {
    table.set(kana, Object.hasOwn(LAYER_SPELLINGS, kana) ? LAYER_SPELLINGS[kana] : applyExtensions(roman));
  }
  // 訓令式のテーブルには無い見出し。`ゎ` は小書きのかなの `l` の規則で綴りが決まり、`てぃ` `でぃ` は作者が書く綴り
  table.set('ゎ', 'lwa');
  table.set('てぃ', 'thi');
  table.set('でぃ', 'dhi');
  return table;
}
