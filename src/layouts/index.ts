import { kunrei } from '../romaji/kunrei.ts';
import { oonishiRomaji } from '../romaji/oonishi.ts';
import { NAGINATA_V18 } from './naginata.ts';
import { CUSTOM_COMBOS } from './combos-custom.ts';
import { fromRows, withCombos, withRomaji, type Layout } from './types.ts';
import { NICOLA } from './nicola.ts';
import { ASUKA } from './asuka.ts';
import { SHIN_KOUME } from './shin-koume.ts';
import { SHIN_JIS_PREFIX, SHIN_JIS_SIMULTANEOUS } from './shin-jis.ts';
import { SHINGETA } from './shingeta.ts';
import { TSUKI_2_263 } from './tsuki-2-263.ts';
import { KAWASEMI_PLUS } from './kawasemi-plus.ts';
import { KAWASEMI_KAI } from './kawasemi-kai.ts';

export type {
  ComboCondition,
  ComboDefinition,
  ComboPresentation,
  Face,
  FaceMode,
  FaceRow,
  HoldPhase,
  InputRole,
  KanaDefinition,
  LayerDefinition,
  LayerKind,
  Layout,
  ResolvedComboDefinition,
  Sequence,
  Step,
  StepSemantic,
  TriggerPersistence,
  TriggerOrder,
} from './types.ts';
export { COMBO_LAYER_ID, SINGLE_LAYER_ID } from './types.ts';
export {
  faceFromEntries,
  fromRows,
  fromFaces,
  fromKana,
  withComposedOutputs,
  withThumbShiftAlternatives,
  withRomaji,
  withCombos,
} from './types.ts';
export { canFoldFaces, classifyFaces, faceCells, groupFacesIntoLayers, handOfKey } from '../layers.ts';
export type { FaceGroups, Hand, Layer } from '../layers.ts';

const ROMAJI = kunrei();
const ROMAJI_OONISHI = oonishiRomaji();

/**
 * 英字配列。行ごとの列数はANSIの英数部に合わせる（12 / 12 / 11 / 10）。
 * 大西配列は `-` をホーム段に置くため、数字段には `-` を入れない。
 */
const ALPHA: Layout[] = [
  fromRows('qwerty', 'QWERTY', [
    '1234567890-=',
    'qwertyuiop[]',
    "asdfghjkl;'",
    'zxcvbnm,./',
  ]),
  fromRows('dvorak', 'Dvorak', [
    '1234567890[]',
    "',.pyfgcrl/=",
    'aoeuidhtns-',
    ';qjkxbmwvz',
  ]),
  fromRows('colemak', 'Colemak', [
    '1234567890-=',
    'qwfpgjluy;[]',
    "arstdhneio'",
    'zxcvbkm,./',
  ]),
  fromRows('colemak-dh', 'Colemak-DH', [
    '1234567890-=',
    'qwfpbjluy;[]',
    "arstgmneio'",
    'zxcdvkh,./',
  ]),
  fromRows('workman', 'Workman', [
    '1234567890-=',
    'qdrwbjfup;[]',
    "ashtgyneoi'",
    'zxmcvkl,./',
  ]),
  fromRows('oonishi', '大西配列', [
    '1234567890',
    'qlu,.fwryp',
    'eiao-ktnsh',
    'zxcv;gdmjb',
  ]),
  fromRows('oonishi-custom', 'TK音直入力法', [
    '1234567890',
    'qlu,.fwryp',
    'eiao-ktnsh',
    'xjcv/gdmzb',
  ]),
];

const ALPHA_BY_ID = new Map(ALPHA.map((l) => [l.id, l]));

/** 英文をそのまま打つ配列。TK音直入力法も英字配置として選択できる。 */
export const LAYOUTS: Layout[] = ALPHA;

/**
 * 日本語のかなテキストを打つ配列。
 * ローマ字配列はテーブルを通して展開し、かな配列はそのまま打つ。
 * 最終形はどちらも打鍵ステップ列なので、同じテキストで比較できる。
 */
export const LAYOUTS_JA: Layout[] = [
  // TK音直入力法はコンボ込みでのみ意味を持つので、素の形では出さない。
  ...ALPHA.filter((l) => l.id.startsWith('oonishi') === false).map((l) =>
    withRomaji(l, ROMAJI),
  ),
  // 大西配列は公式が前提とする綴り（シャ行sh / じji / じゃ行j）で打つ
  withRomaji(ALPHA_BY_ID.get('oonishi')!, ROMAJI_OONISHI),
  // TK音直入力法のコンボは訓令式（sya / zya）の綴りを前提に組まれている
  withRomaji(
    withCombos(
      'oonishi-custom-combo',
      'TK音直入力法',
      ALPHA_BY_ID.get('oonishi-custom')!,
      CUSTOM_COMBOS,
    ),
    ROMAJI,
  ),
  NAGINATA_V18,
  NICOLA,
  SHIN_KOUME,
  ASUKA,
  SHIN_JIS_PREFIX,
  SHIN_JIS_SIMULTANEOUS,
  SHINGETA,
  TSUKI_2_263,
  KAWASEMI_KAI,
  KAWASEMI_PLUS,
];

export const LAYOUT_BY_ID = new Map([...LAYOUTS, ...LAYOUTS_JA].map((l) => [l.id, l]));
