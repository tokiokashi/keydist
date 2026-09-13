import { fromRows, type Layout } from './types.ts';

export type { Layout, Sequence, Step } from './types.ts';
export { fromRows, composeRomaji } from './types.ts';

// 行ごとの列数は ANSI の英数部に合わせる: 12 / 12 / 11 / 10
export const LAYOUTS: Layout[] = [
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
];

export const LAYOUT_BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));
