import { kunrei } from '../romaji/kunrei.ts';
import { oonishiRomaji } from '../romaji/oonishi.ts';
import { NAGINATA_V18_FACES } from './naginata.ts';
import { CUSTOM_COMBOS } from './combos-custom.ts';
import { fromFaces, fromRows, withCombos, withRomaji, type Layout } from './types.ts';

export type {
  ComboCondition,
  ComboDefinition,
  Face,
  FaceMode,
  FaceRow,
  Layout,
  Sequence,
  Step,
} from './types.ts';
export { fromRows, fromFaces, fromKana, withRomaji, withCombos } from './types.ts';

const ROMAJI = kunrei();
const ROMAJI_OONISHI = oonishiRomaji();

/**
 * 英字配列。行ごとの列数は ANSI の英数部に合わせる（12 / 12 / 11 / 10）。
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
  fromRows('oonishi', '大西', [
    '1234567890',
    'qlu,.fwryp',
    'eiao-ktnsh',
    'zxcv;gdmjb',
  ]),
  fromRows('oonishi-custom', '大西（私家版）', [
    '1234567890',
    'qlu,.fwryp',
    'eiao-ktnsh',
    'xjcv/gdmzb',
  ]),
];

const ALPHA_BY_ID = new Map(ALPHA.map((l) => [l.id, l]));

/**
 * 英文をそのまま打つ配列。
 * 大西の私家版は日本語のコンボ運用と対で意味を持つので、英文の一覧には出さない。
 */
export const LAYOUTS: Layout[] = ALPHA.filter((l) => l.id !== 'oonishi-custom');

/**
 * 日本語のかなテキストを打つ配列。
 * ローマ字配列はテーブルを通して展開し、かな配列はそのまま打つ。
 * 最終形はどちらも打鍵ステップ列なので、同じテキストで比較できる。
 */
export const LAYOUTS_JA: Layout[] = [
  // Dvorak は英語専用設計で日本語ローマ字の比較に入れる意義が薄いので外す。
  // 私家版はコンボ込みでのみ意味を持つので、素の形では出さない。
  ...ALPHA.filter((l) => l.id !== 'dvorak' && l.id.startsWith('oonishi') === false).map((l) =>
    withRomaji(l, ROMAJI),
  ),
  // 大西は公式が前提とする綴り（シャ行 sh / じ ji / じゃ行 j）で打つ
  withRomaji(ALPHA_BY_ID.get('oonishi')!, ROMAJI_OONISHI),
  // 私家版のコンボは訓令式（sya / zya）の綴りを前提に組まれている
  withRomaji(
    withCombos(
      'oonishi-custom-combo',
      '大西（私家版 + コンボ）',
      ALPHA_BY_ID.get('oonishi-custom')!,
      CUSTOM_COMBOS,
    ),
    ROMAJI,
  ),
  fromFaces('naginata-v18', '薙刀式 v18', NAGINATA_V18_FACES),
];

export const LAYOUT_BY_ID = new Map([...LAYOUTS, ...LAYOUTS_JA].map((l) => [l.id, l]));
