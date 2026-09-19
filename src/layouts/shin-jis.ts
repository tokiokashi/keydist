import { THUMB_KEY } from '../geometry.ts';
import {
  faceFromEntries,
  fromFaces,
  SINGLE_LAYER_ID,
  type Face,
  type FaceMode,
  type Layout,
  type Sequence,
} from './types.ts';

/**
 * 新JISけん盤配列（JIS X 6004）。
 *
 * かな配置はJIS X 6004として公開されている配列仕様に基づく。
 * 参考: https://jisx6004.client.jp/layout-kana.html
 * keydistでは規格票の文章・図版ではなく、キーとかなの対応をFace定義として独自に記述する。
 *
 * 規格が定めるのはシフト面への切り替えで、シフト機構自体は実装依存のため、
 * 同じ配置を逐次シフト（prefix）と通常シフト（simultaneous）の2定義として持つ。
 * シフトの物理キーは両定義とも右親指を基準にする。
 * preferOppositeThumb による左右振り替えは simultaneous / prefix の両方で有効。
 */

const face = (
  trigger: string[],
  mode: FaceMode,
  entries: Record<string, string>,
  triggerPersistence?: Face['triggerPersistence'],
): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  inputRole: trigger.length > 0 ? 'modifier' : 'layer',
  ...(trigger.length > 0 && triggerPersistence !== undefined ? { triggerPersistence } : {}),
});

function shinJisFaces(mode: FaceMode, triggerPersistence: NonNullable<Face['triggerPersistence']>): Face[] {
  return [
    face([], mode, {
      q: 'そ', w: 'け', e: 'せ', r: 'て', t: 'ょ', y: 'つ', u: 'ん', i: 'の', o: 'を', p: 'り', '[': 'ち',
      a: 'は', s: 'か', d: 'し', f: 'と', g: 'た', h: 'く', j: 'う', k: 'い', l: '゛', ';': 'き', "'": 'な',
      z: 'す', x: 'こ', c: 'に', v: 'さ', b: 'あ', n: 'っ', m: 'る', ',': '、', '.': '。', '/': 'れ',
    }),
    face([THUMB_KEY.RT], mode, {
      q: 'ぁ', w: '゜', e: 'ほ', r: 'ふ', t: 'め', y: 'ひ', u: 'え', i: 'み', o: 'や', p: 'ぬ', '[': '「',
      a: 'ぃ', s: 'へ', d: 'ら', f: 'ゅ', g: 'よ', h: 'ま', j: 'お', k: 'も', l: 'わ', ';': 'ゆ', "'": '」',
      z: 'ぅ', x: 'ぇ', c: 'ぉ', v: 'ね', b: 'ゃ', n: 'む', m: 'ろ', ',': '・', '.': 'ー',
    }, triggerPersistence),
  ];
}

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
  if (!markSequence) throw new Error(`新JISの合成記号「${mark}」が未定義`);
  const stepLayers = new Map(layout.stepLayers ?? []);
  const stepTriggerKeys = new Map(layout.stepTriggerKeys ?? []);
  const stepSemantics = new Map(layout.stepSemantics ?? []);

  for (const [source, output] of Object.entries(entries)) {
    const sourceSequence = layout.map.get(source);
    if (!sourceSequence) throw new Error(`新JISの清音「${source}」が未定義`);
    if (layout.map.has(output)) throw new Error(`新JISの合成出力「${output}」が重複している`);

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
      throw new Error(`新JISの合成semantic「${source}」「${mark}」が未定義`);
    }
    stepSemantics.set(output, [...sourceSemantics, ...markSemantics]);
  }

  layout.stepLayers = stepLayers;
  layout.stepTriggerKeys = stepTriggerKeys;
  layout.stepSemantics = stepSemantics;
}

function makeLayout(
  id: string,
  name: string,
  mode: FaceMode,
  triggerPersistence: NonNullable<Face['triggerPersistence']>,
): Layout {
  const layout = fromFaces(id, name, shinJisFaces(mode, triggerPersistence));
  appendComposed(layout, VOICED, '゛');
  appendComposed(layout, SEMI_VOICED, '゜');

  layout.thumbShiftKey = THUMB_KEY.RT;
  layout.legends.set(THUMB_KEY.LT, 'シフト');
  layout.legends.set(THUMB_KEY.RT, 'シフト');
  return layout;
}

export const SHIN_JIS_PREFIX = makeLayout('shin-jis-prefix', '新JIS（逐次シフト）', 'prefix', 'single');
export const SHIN_JIS_SIMULTANEOUS = makeLayout(
  'shin-jis-simultaneous',
  '新JIS（通常シフト）',
  'simultaneous',
  'hold-capable',
);
