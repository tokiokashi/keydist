import { ALL_FINGERS, FINGERS, isThumb, type Finger } from '#input/shapes/geometry.ts';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import type { PhysicalKeyboardKeyBand } from '#ui/keyboard/physical-keyboard.tsx';

/** 指の色の番号（1から8）。親指以外の指を手の並びの順に数える。親指は色を持たない。 */
export function fingerTone(finger: Finger): number | undefined {
  const index = (FINGERS as readonly Finger[]).indexOf(finger);
  return index < 0 ? undefined : index + 1;
}

const handOrder = (finger: Finger): number => ALL_FINGERS.indexOf(finger);

/**
 * 複数の指が担当するキーの、追加の担当の指を示す帯。基本の指はキー全体の色で示すので、帯には含めない。
 * 手の並び（左小指から右小指）で基本の指より左の指は左端、右の指は右端、親指は下端に置く。
 * 同じ側に複数の指が並ぶ時は、手の並びの順に、端から内側へ詰める（左端は左の指から、右端は右の指から）。
 */
export function fingerBands(base: Finger, owners: readonly Finger[]): readonly PhysicalKeyboardKeyBand[] {
  const others = owners.filter((finger) => finger !== base).sort((a, b) => handOrder(a) - handOrder(b));
  const left = others.filter((finger) => !isThumb(finger) && handOrder(finger) < handOrder(base));
  const right = others.filter((finger) => !isThumb(finger) && handOrder(finger) > handOrder(base));
  const bottom = others.filter(isThumb);
  const bandOf = (finger: Finger, edge: PhysicalKeyboardKeyBand['edge'], depth: number): PhysicalKeyboardKeyBand => ({
    tone: fingerTone(finger) ?? 'muted',
    edge,
    depth,
    label: FINGER_LABEL[finger],
  });
  return [
    ...left.map((finger, index) => bandOf(finger, 'left', index)),
    // 右端に近い指ほど端に置くので、手の並びの逆に深さを数える
    ...right.map((finger, index) => bandOf(finger, 'right', right.length - 1 - index)),
    ...bottom.map((finger, index) => bandOf(finger, 'bottom', index)),
  ];
}
