import { SHIFT_KEY } from '../shapes/geometry.ts';
import { DAKUTEN, DAKUTEN_MARK, HANDAKUTEN, HANDAKUTEN_MARK } from './kana-composition.ts';
import { fromFaces, withComposedOutputs, type Face, type Layout } from './types.ts';

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

const base: Face = {
  trigger: [],
  mode: 'simultaneous',
  rows: BASE_ROWS,
  inputRole: 'layer',
};

let layout: Layout = fromFaces('jis-kana', 'JISかな配列', [base, shiftFace(SHIFT_KEY.L), shiftFace(SHIFT_KEY.R)]);
layout = {
  ...layout,
  shiftKeys: [SHIFT_KEY.L, SHIFT_KEY.R],
  requiresJisShape: true,
};
layout.legends.set(SHIFT_KEY.L, 'Shift');
layout.legends.set(SHIFT_KEY.R, 'Shift');

layout = withComposedOutputs(layout, DAKUTEN, DAKUTEN_MARK, 'JISかな配列');
layout = withComposedOutputs(layout, HANDAKUTEN, HANDAKUTEN_MARK, 'JISかな配列');

export const JIS_KANA = layout;
