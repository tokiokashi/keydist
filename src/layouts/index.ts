import { kunrei } from '../romaji/kunrei.ts';
import { NAGINATA_V18 } from './naginata.ts';
import { CUSTOM_COMBOS } from './combos-custom.ts';
import { fromKana, fromRows, withCombos, withRomaji, type Layout } from './types.ts';

export type { Layout, Sequence, Step } from './types.ts';
export { fromRows, fromKana, withRomaji, withCombos } from './types.ts';

const ROMAJI = kunrei();

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

/** 英文をそのまま打つ配列 */
export const LAYOUTS: Layout[] = ALPHA;

/**
 * 日本語のかなテキストを打つ配列。
 * ローマ字配列はテーブルを通して展開し、かな配列はそのまま打つ。
 * 最終形はどちらも打鍵ステップ列なので、同じテキストで比較できる。
 */
export const LAYOUTS_JA: Layout[] = [
  // Dvorak は英語専用設計で日本語ローマ字の比較に入れる意義が薄いので外す。
  // 色のスロットは 8 つなので、一覧もその数に収める。
  ...ALPHA.filter((l) => l.id !== 'dvorak').map((l) => withRomaji(l, ROMAJI)),
  withRomaji(
    withCombos(
      'oonishi-custom-combo',
      '大西（私家版 + コンボ）',
      ALPHA_BY_ID.get('oonishi-custom')!,
      CUSTOM_COMBOS,
    ),
    ROMAJI,
  ),
  fromKana('naginata-v18', '薙刀式 v18', NAGINATA_V18),
];

export const LAYOUT_BY_ID = new Map([...LAYOUTS, ...LAYOUTS_JA].map((l) => [l.id, l]));
