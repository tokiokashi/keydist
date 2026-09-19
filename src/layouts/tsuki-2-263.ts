import { THUMB_KEY } from '../geometry.ts';
import { faceFromEntries, fromFaces, SINGLE_LAYER_ID, type Face, type Layout, type Sequence } from './types.ts';

/**
 * 月配列2-263式。
 * 成立時の配列表（新JIS・月スレッド2の263番）:
 * https://jisx6004.client.jp/data/2chlog/1055763380.html
 * 解説・配列表: https://jisx6004.client.jp/tsuki.html
 * keydistでは公開された2-263式の配列仕様をFace定義として独自に記述する。
 * クロスシフトとして左側の対象キーを `k`、右側の対象キーを `d` に割り当て、
 * JIS専用キーの `・` はANSIでは表現しない。
 */

const face = (trigger: string[], entries: Record<string, string>, layer?: string): Face => ({
  ...faceFromEntries(trigger, 'prefix', entries),
  layer,
  inputRole: trigger.length > 0 ? 'modifier' : 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

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
  }, '中指シフト'),
  face(['k'], {
    q: 'ぁ', w: 'ひ', e: 'ほ', r: 'ふ', t: 'め',
    a: 'ぃ', s: 'を', d: 'ら', f: 'あ', g: 'よ',
    z: 'ぅ', x: 'へ', c: 'せ', v: 'ゅ', b: 'ゃ',
  }, '中指シフト'),
];

const layout: Layout = fromFaces('tsuki-2-263', '月配列2-263式', TSUKI_2_263_FACES);

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
  const stepLayers = new Map(layout.stepLayers ?? []);
  const stepTriggerKeys = new Map(layout.stepTriggerKeys ?? []);
  const stepSemantics = new Map(layout.stepSemantics ?? []);
  for (const [source, output] of Object.entries(entries)) {
    const sourceSequence = layout.map.get(source);
    if (!sourceSequence) throw new Error(`月配列の清音「${source}」が未定義`);
    if (layout.map.has(output)) throw new Error(`月配列の合成出力「${output}」が重複している`);
    const sequence: Sequence = [
      ...sourceSequence.map((step) => [...step]),
      ...markSequence.map((step) => [...step]),
    ];
    layout.map.set(output, sequence);
    const sourceLayers = layout.stepLayers?.get(source) ?? sourceSequence.map(() => SINGLE_LAYER_ID);
    const markLayers = layout.stepLayers?.get(mark) ?? markSequence.map(() => SINGLE_LAYER_ID);
    stepLayers.set(output, [...sourceLayers, ...markLayers]);
    const sourceTriggers = layout.stepTriggerKeys?.get(source) ?? sourceSequence.map(() => []);
    const markTriggers = layout.stepTriggerKeys?.get(mark) ?? markSequence.map(() => []);
    stepTriggerKeys.set(output, [...sourceTriggers, ...markTriggers]);
    const sourceSemantics = layout.stepSemantics?.get(source);
    const markSemantics = layout.stepSemantics?.get(mark);
    if (!sourceSemantics || !markSemantics) {
      throw new Error(`月配列の合成semantic「${source}」「${mark}」が未定義`);
    }
    stepSemantics.set(output, [...sourceSemantics, ...markSemantics]);
  }
  layout.stepLayers = stepLayers;
  layout.stepTriggerKeys = stepTriggerKeys;
  layout.stepSemantics = stepSemantics;
}

appendComposed(layout, VOICED, '゛');
appendComposed(layout, SEMI_VOICED, '゜');
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKI_2_263 = layout;
