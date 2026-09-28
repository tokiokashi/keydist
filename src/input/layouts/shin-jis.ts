import { THUMB_KEY } from '../shapes/geometry.ts';
import {
  faceFromEntries,
  fromFaces,
  withComposedOutputs,
  withThumbShiftAlternatives,
  type Face,
  type FaceMode,
  type Layout,
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
 * ここで通常シフトは、jisx6004.client.jp が「普通のシフト」として説明する
 * 「シフトを押しながらキーを押す」方式に合わせ、simultaneous + triggerOrder='prefix'
 * として表す。NICOLA型の押し順不問な同時打鍵とは区別する。
 * シフトの物理キーは両定義とも右親指を基準にする。
 * preferOppositeThumb による左右振り替えは simultaneous / prefix の両方で有効。
 */

const face = (
  trigger: string[],
  mode: FaceMode,
  entries: Record<string, string>,
  triggerPersistence?: Face['triggerPersistence'],
  triggerOrder?: Face['triggerOrder'],
): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  inputRole: trigger.length > 0 ? 'modifier' : 'layer',
  ...(trigger.length > 0 && triggerPersistence !== undefined ? { triggerPersistence } : {}),
  ...(trigger.length > 0 && triggerOrder !== undefined ? { triggerOrder } : {}),
});

function shinJisFaces(
  mode: FaceMode,
  triggerPersistence: NonNullable<Face['triggerPersistence']>,
  triggerOrder?: Face['triggerOrder'],
): Face[] {
  const shifted = face([THUMB_KEY.RT], mode, {
    q: 'ぁ', w: '゜', e: 'ほ', r: 'ふ', t: 'め', y: 'ひ', u: 'え', i: 'み', o: 'や', p: 'ぬ', '[': '「',
    a: 'ぃ', s: 'へ', d: 'ら', f: 'ゅ', g: 'よ', h: 'ま', j: 'お', k: 'も', l: 'わ', ';': 'ゆ', "'": '」',
    z: 'ぅ', x: 'ぇ', c: 'ぉ', v: 'ね', b: 'ゃ', n: 'む', m: 'ろ', ',': '・', '.': 'ー',
  }, triggerPersistence, triggerOrder);

  return [
    face([], mode, {
      q: 'そ', w: 'け', e: 'せ', r: 'て', t: 'ょ', y: 'つ', u: 'ん', i: 'の', o: 'を', p: 'り', '[': 'ち',
      a: 'は', s: 'か', d: 'し', f: 'と', g: 'た', h: 'く', j: 'う', k: 'い', l: '゛', ';': 'き', "'": 'な',
      z: 'す', x: 'こ', c: 'に', v: 'さ', b: 'あ', n: 'っ', m: 'る', ',': '、', '.': '。', '/': 'れ',
    }),
    {
      ...shifted,
      presentationTriggerAlternatives: [[THUMB_KEY.LT], [THUMB_KEY.RT]],
      presentationTriggerText: 'Space',
      presentationLabel: 'Shift',
    },
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

function makeLayout(
  id: string,
  name: string,
  mode: FaceMode,
  triggerPersistence: NonNullable<Face['triggerPersistence']>,
): Layout {
  const layout = withThumbShiftAlternatives(
    withComposedOutputs(
      withComposedOutputs(
        fromFaces(id, name, shinJisFaces(mode, triggerPersistence, mode === 'simultaneous' ? 'prefix' : undefined)),
        VOICED,
        '゛',
        '新JIS',
      ),
      SEMI_VOICED,
      '゜',
      '新JIS',
    ),
    THUMB_KEY.RT,
    [THUMB_KEY.RT, THUMB_KEY.LT],
  );
  layout.legends.set(THUMB_KEY.LT, 'Space');
  layout.legends.set(THUMB_KEY.RT, 'Space');
  return layout;
}

export const SHIN_JIS_PREFIX = makeLayout('shin-jis-prefix', '新JIS（逐次シフト）', 'prefix', 'single');
export const SHIN_JIS_SIMULTANEOUS = makeLayout(
  'shin-jis-simultaneous',
  '新JIS（通常シフト）',
  'simultaneous',
  'hold-capable',
);
