import { SHIFT_KEY } from '../geometry.ts';
import {
  fromFaces,
  withComposedOutputs,
  type Face,
  type Layout,
} from './types.ts';

const BASE_ROWS = [
  ['ぬ', 'ふ', 'あ', 'う', 'え', 'お', 'や', 'ゆ', 'よ', 'わ', 'ほ', 'へ', 'ー'],
  ['た', 'て', 'い', 'す', 'か', 'ん', 'な', 'に', 'ら', 'せ', '゛', '゜'],
  ['ち', 'と', 'し', 'は', 'き', 'く', 'ま', 'の', 'り', 'れ', 'け', 'む'],
  ['つ', 'さ', 'そ', 'ひ', 'こ', 'み', 'も', 'ね', 'る', 'め', 'ろ'],
] as const;

const SHIFT_ROWS = [
  ['', '', 'ぁ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'を', '', '', ''],
  ['', '', 'ぃ', '', '', '', '', '', '', '', '', '「'],
  ['', '', '', '', '', '', '', '', '', '', '', '」'],
  ['っ', '', '', '', '', '', '', '、', '。', '・', ''],
] as const;

const shiftFace = (key: string): Face => ({
  trigger: [key],
  mode: 'simultaneous',
  rows: SHIFT_ROWS,
  role: 'modifier',
  inputRole: 'modifier',
  triggerPersistence: 'hold-capable',
  triggerOrder: 'prefix',
  modifierGroups: { [key]: 'Shift' },
  presentationLabel: 'Shift',
});

const DAKUTEN: Readonly<Record<string, string>> = {
  う: 'ゔ',
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};

const HANDAKUTEN: Readonly<Record<string, string>> = {
  は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ',
};

const base: Face = {
  trigger: [],
  mode: 'simultaneous',
  rows: BASE_ROWS,
  inputRole: 'layer',
};

let layout: Layout = fromFaces(
  'jis-kana',
  'JISかな配列',
  [base, shiftFace(SHIFT_KEY.L), shiftFace(SHIFT_KEY.R)],
);
layout = {
  ...layout,
  shiftKeys: [SHIFT_KEY.L, SHIFT_KEY.R],
};
layout.legends.set(SHIFT_KEY.L, 'Shift');
layout.legends.set(SHIFT_KEY.R, 'Shift');

layout = withComposedOutputs(layout, DAKUTEN, '゛', 'JISかな配列');
layout = withComposedOutputs(layout, HANDAKUTEN, '゜', 'JISかな配列');

export const JIS_KANA = layout;
