import { THUMB_KEY } from '../shapes/geometry.ts';
import { faceFromEntries, fromFaces, type Face, type Layout } from './types.ts';

const face = (
  trigger: string[],
  entries: Record<string, string>,
  inputRole: Face['inputRole'] = 'layer',
): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', entries),
  inputRole,
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

/**
 * 親指シフト（NICOLA）J型。
 *
 * 配置はNICOLA日本語入力コンソーシアムの規格書
 * (http://nicola.sunicom.co.jp/spec/kikaku.htm)を仕様根拠としてkeydist形式で記述した。
 * 紅皿など個別ソフトの派生定義は仕様根拠にしない。
 * 規格書 §3の2018.11注記にあるD12の記載に従い、
 * `゛` はB10 + 無変換、`゜` はD01 + 変換に置き、D12の機能キー出力は追加していない。
 *
 * NICOLA専用キーボードを前提にした配置をANSIのキーidへ写しているため、
 * 既定の物理形状で出す距離の絶対値は参考値である。
 */
export const NICOLA_FACES: Face[] = [
  // 文字キー単打
  face([], {
    q: '。', w: 'か', e: 'た', r: 'こ', t: 'さ', y: 'ら', u: 'ち', i: 'く', o: 'つ',
    p: '，', '[': '、',
    a: 'う', s: 'し', d: 'て', f: 'け', g: 'せ', h: 'は', j: 'と', k: 'き', l: 'い', ';': 'ん',
    z: '．', x: 'ひ', c: 'す', v: 'ふ', b: 'へ', n: 'め', m: 'そ', ',': 'ね', '.': 'ほ', '/': '・',
  }),

  // 無変換キーとの同時打鍵
  face([THUMB_KEY.LT], {
    q: 'ぁ', w: 'え', e: 'り', r: 'ゃ', t: 'れ', y: 'ぱ', u: 'ぢ', i: 'ぐ', o: 'づ', p: 'ぴ',
    a: 'を', s: 'あ', d: 'な', f: 'ゅ', g: 'も', h: 'ば', j: 'ど', k: 'ぎ', l: 'ぽ',
    z: 'ぅ', x: 'ー', c: 'ろ', v: 'や', b: 'ぃ', n: 'ぷ', m: 'ぞ', ',': 'ぺ', '.': 'ぼ', '/': '゛',
  }, 'modifier'),

  // 変換キーとの同時打鍵
  face([THUMB_KEY.RT], {
    q: '゜', w: 'が', e: 'だ', r: 'ご', t: 'ざ', y: 'よ', u: 'に', i: 'る', o: 'ま', p: 'ぇ',
    a: 'ヴ', s: 'じ', d: 'で', f: 'げ', g: 'ぜ', h: 'み', j: 'お', k: 'の', l: 'ょ', ';': 'っ',
    x: 'び', c: 'ず', v: 'ぶ', b: 'べ', n: 'ぬ', m: 'ゆ', ',': 'む', '.': 'わ', '/': 'ぉ',
  }, 'modifier'),
];

export const NICOLA: Layout = fromFaces('nicola', '親指シフト（NICOLA）', NICOLA_FACES);
NICOLA.legends.set(THUMB_KEY.LT, '無変換');
NICOLA.legends.set(THUMB_KEY.RT, '変換');
