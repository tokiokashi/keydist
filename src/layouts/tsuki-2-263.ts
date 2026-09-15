import { THUMB_KEY } from '../geometry.ts';
import { faceFromEntries, fromFaces, type Face, type Layout, type Sequence } from './types.ts';

/**
 * 月配列 2-263 式。
 * 準公式定義: https://github.com/k-ayaki/dvorakj_2023 の
 * `data/lang/jpn/順に打鍵する配列/月配列系/月2-263.txt`。
 * 解説ページ: https://jisx6004.client.jp/tsuki.html
 * DvorakJ の `[d],[k]` シフト面は、クロスシフトとして左側の対象キーを `k`、
 * 右側の対象キーを `d` に割り当てる。JIS 専用キーの `・` は ANSI では表現しない。
 */

const face = (trigger: string[], entries: Record<string, string>): Face =>
  faceFromEntries(trigger, 'prefix', entries);

export const TSUKI_2_263_FACES: Face[] = [
  face([], {
    q: 'そ', w: 'こ', e: 'し', r: 'て', t: 'ょ', y: 'つ', u: 'ん', i: 'い', o: 'の', p: 'り', '[': 'ち',
    a: 'は', s: 'か', f: 'と', g: 'た', h: 'く', j: 'う', l: '゛', ';': 'き', "'": 'れ',
    z: 'す', x: 'け', c: 'に', v: 'な', b: 'さ', n: 'っ', m: 'る', ',': '、', '.': '。', '/': '゜',
  }),
  face(['d'], {
    y: 'ぬ', u: 'え', i: 'み', o: 'や', p: 'ぇ', '[': '「',
    h: 'ま', j: 'お', k: 'も', l: 'わ', ';': 'ゆ', "'": '」',
    n: 'む', m: 'ろ', ',': 'ね', '.': 'ー', '/': 'ぉ',
  }),
  face(['k'], {
    q: 'ぁ', w: 'ひ', e: 'ほ', r: 'ふ', t: 'め',
    a: 'ぃ', s: 'を', d: 'ら', f: 'あ', g: 'よ',
    z: 'ぅ', x: 'へ', c: 'せ', v: 'ゅ', b: 'ゃ',
  }),
];

const layout: Layout = fromFaces('tsuki-2-263', '月 2-263 式', TSUKI_2_263_FACES);

const VOICED: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
  う: 'ゔ',
};

const SEMI_VOICED: Record<string, string> = {
  は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ',
};

function appendComposed(layout: Layout, entries: Record<string, string>, mark: string) {
  const markSequence = layout.map.get(mark);
  if (!markSequence) throw new Error(`月配列の合成記号「${mark}」が未定義`);
  for (const [source, output] of Object.entries(entries)) {
    const sourceSequence = layout.map.get(source);
    if (!sourceSequence) throw new Error(`月配列の清音「${source}」が未定義`);
    if (layout.map.has(output)) throw new Error(`月配列の合成出力「${output}」が重複している`);
    const sequence: Sequence = [
      ...sourceSequence.map((step) => [...step]),
      ...markSequence.map((step) => [...step]),
    ];
    layout.map.set(output, sequence);
  }
}

appendComposed(layout, VOICED, '゛');
appendComposed(layout, SEMI_VOICED, '゜');
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKI_2_263 = layout;
