import { THUMB_KEY } from '../shapes/geometry.ts';
import {
  SINGLE_LAYER_ID,
  faceFromEntries,
  fromFaces,
  withAliases,
  charMeaning as char,
  modifierKeyMeaning as modifierKey,
  type Face,
  type Layout,
  type TriggerMeanings,
} from './types.ts';
import { SAME_HAND_LAYER } from './gekkou.ts';
import { TWO_LAYER_COMPACT_LABELS } from './naginata.ts';

/**
 * 薙刀式私家版（tokiokashiの試用版）。
 * 定義の出典は、tokiokashi/vial-qmkのコミット623e3ccbの薙刀式エンジン`users/tokioka/naginata.c`である。
 * https://github.com/tokiokashi/vial-qmk/blob/623e3ccb99e98129b6e8df1f3f246fa74fd7fb57/users/tokioka/naginata.c
 * 出典の表を写したものは`test/fixtures/sources/naginata-private.json`にある。
 *
 * 薙刀式v17のセンターシフトを中指シフト（d・k）に置き換えた同時押しの配列で、
 * 濁音はf・j、半濁音はv・m、小書きはqを押しながら打つ。どのシフトも左右のどちらのキーでも同じ出力になるので、
 * かなのキーと反対の手のシフトを既定の打ち方にする。反対の手の面を先に、同じ手の面を後に並べると、
 * 同じかなを2通りで打てるセルは先に並べた面が打鍵の既定になる。
 * 拗音と外来音は、子音のキーと反対の手の印を既定にし、同じ手の印の打ち方は持たない。
 *
 * 出典が文字を出さない入力は面に入れない。qの単打のEsc、j+hとf+gのIMEの切り替え、
 * 中指シフトとqの後の1キーを小書きにする入力（qを押しながら打つ小書きと同じかなを出す）である。
 * j+hとf+gがIMEの切り替えになるので、「ぐ」はfとh、「ぢ」はjとgの組だけで打つ。
 */

const LEFT_KEYS = new Set([...'qwertasdfgzxcvb']);

const pick = (entries: Record<string, string>, left: boolean, except: readonly string[] = []): Record<string, string> =>
  Object.fromEntries(Object.entries(entries).filter(([key]) => LEFT_KEYS.has(key) === left && !except.includes(key)));

type FaceOptions = Pick<
  Face,
  'layer' | 'role' | 'modifierGroups' | 'triggerOrder' | 'presentationLabel' | 'inputRole' | 'compositionAggregation' | 'triggerPersistence'
>;

const face = (trigger: string[], entries: Record<string, string>, options: FaceOptions): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', entries),
  ...options,
});

/** 修飾の面。シフトを押したまま続けて打てる。 */
const modifierFace = (trigger: string[], entries: Record<string, string>, groups: Record<string, string>, layer?: string): Face =>
  face(trigger, entries, {
    ...(layer === undefined ? {} : { layer }),
    modifierGroups: groups,
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
  });

const BASE: Record<string, string> = {
  w: 'き',
  e: 'て',
  r: 'し',
  t: 'り',
  y: 'さ',
  u: 'た',
  i: 'す',
  o: 'る',
  p: 'へ',
  a: 'お',
  s: 'け',
  d: 'ん',
  f: 'か',
  g: 'ー',
  h: 'く',
  j: 'あ',
  k: 'い',
  l: 'う',
  ';': 'っ',
  z: 'ほ',
  x: 'ひ',
  c: 'は',
  v: 'こ',
  b: 'そ',
  m: 'な',
  ',': 'と',
  '.': 'ら',
  '/': 'れ',
};

/** dかkを押しながら打つ面。dとkの同時押しは も になる。 */
const SHIFT: Record<string, string> = {
  w: 'め',
  e: 'に',
  r: 'ね',
  u: 'え',
  i: 'よ',
  o: 'ろ',
  p: 'ゆ',
  a: 'せ',
  s: 'み',
  d: 'も',
  f: 'ま',
  g: 'ち',
  h: 'や',
  j: 'の',
  l: 'つ',
  ';': 'ふ',
  x: 'を',
  c: 'ぬ',
  v: '、',
  m: '。',
  ',': 'む',
  '.': 'わ',
  '/': '・',
};

/** fかjを押しながら打つ面。単打か中指シフトのかなのうち、濁音を持つものが濁音になる。fとjの同時押しは が。 */
const DAKU: Record<string, string> = {
  w: 'ぎ',
  e: 'で',
  r: 'じ',
  y: 'ざ',
  u: 'だ',
  i: 'ず',
  p: 'べ',
  a: 'ぜ',
  s: 'げ',
  f: 'が',
  g: 'ぢ',
  h: 'ぐ',
  l: 'づ',
  ';': 'ぶ',
  z: 'ぼ',
  x: 'び',
  c: 'ば',
  v: 'ご',
  b: 'ぞ',
  ',': 'ど',
};

/** vかmを押しながら打つ面。 */
const HANDAKU: Record<string, string> = { p: 'ぺ', ';': 'ぷ', z: 'ぽ', x: 'ぴ', c: 'ぱ' };

/** qを先に押し、押したまま打つ面。 */
const SMALL: Record<string, string> = {
  u: 'ぇ',
  i: 'ょ',
  p: 'ゅ',
  a: 'ぉ',
  s: 'ヶ',
  f: 'ヵ',
  h: 'ゃ',
  j: 'ぁ',
  k: 'ぃ',
  l: 'ぅ',
  ';': 'っ',
  '.': 'ゎ',
};

/** 拗音の行のキー。hでゃ、pでゅ、iでょ。濁音・半濁音の行は印のキーを足して打つ。 */
const YOUON_ROWS: Array<{ key: string; plain: string; daku?: string; handaku?: string }> = [
  { key: 'w', plain: 'き', daku: 'ぎ' },
  { key: 'r', plain: 'し', daku: 'じ' },
  { key: 'g', plain: 'ち', daku: 'ぢ' },
  { key: 'x', plain: 'ひ', daku: 'び', handaku: 'ぴ' },
  { key: 's', plain: 'み' },
  { key: 't', plain: 'り' },
  { key: 'e', plain: 'に' },
];
const YOUON_VOWELS: Record<string, string> = { h: 'ゃ', p: 'ゅ', i: 'ょ' };

const youonFaces = (kind: 'plain' | 'daku' | 'handaku', marker?: string): Face[] =>
  Object.entries(YOUON_VOWELS).map(([vowel, small]) => {
    const entries = Object.fromEntries(
      YOUON_ROWS.flatMap((row) => {
        const head = row[kind];
        return head === undefined ? [] : [[row.key, head + small]];
      }),
    );
    const groups: Record<string, string> = { [vowel]: '拗音' };
    if (marker !== undefined) groups[marker] = kind === 'daku' ? '濁音' : '半濁音';
    return modifierFace(marker === undefined ? [vowel] : [vowel, marker], entries, groups);
  });

/**
 * 外来音。印・子音・母音の3キーの同時押しで、出典の並び（印の種類・子音のキー・母音のキー）のまま持つ。
 * 印のキーは、子音のキーと反対の手のキーにする（子音が左手ならmかj、右手ならvかf）。
 */
const GAIRAI: Array<{ marker: 'handaku' | 'daku'; consonant: string; vowel: string; output: string }> = [
  { marker: 'handaku', consonant: 'e', vowel: 'p', output: 'てゅ' },
  { marker: 'handaku', consonant: 'e', vowel: 'k', output: 'てぃ' },
  { marker: 'handaku', consonant: ',', vowel: 'l', output: 'とぅ' },
  { marker: 'handaku', consonant: 'r', vowel: 'u', output: 'しぇ' },
  { marker: 'handaku', consonant: 'g', vowel: 'u', output: 'ちぇ' },
  { marker: 'handaku', consonant: ';', vowel: 'j', output: 'ふぁ' },
  { marker: 'handaku', consonant: ';', vowel: 'k', output: 'ふぃ' },
  { marker: 'handaku', consonant: ';', vowel: 'u', output: 'ふぇ' },
  { marker: 'handaku', consonant: ';', vowel: 'a', output: 'ふぉ' },
  { marker: 'handaku', consonant: ';', vowel: 'p', output: 'ふゅ' },
  { marker: 'handaku', consonant: 'l', vowel: 'k', output: 'うぃ' },
  { marker: 'handaku', consonant: 'l', vowel: 'u', output: 'うぇ' },
  { marker: 'handaku', consonant: 'l', vowel: 'a', output: 'うぉ' },
  { marker: 'handaku', consonant: 'k', vowel: 'u', output: 'いぇ' },
  // 出典は、kを子音、lを母音にした「うぃ」も持つ。上のlとkの「うぃ」と同じ3キーなので、ここには置かない
  { marker: 'handaku', consonant: 'h', vowel: 'j', output: 'くぁ' },
  { marker: 'handaku', consonant: 'h', vowel: 'k', output: 'くぃ' },
  { marker: 'handaku', consonant: 'h', vowel: 'u', output: 'くぇ' },
  { marker: 'handaku', consonant: 'h', vowel: 'a', output: 'くぉ' },
  { marker: 'handaku', consonant: 'h', vowel: 'l', output: 'くゎ' },
  { marker: 'handaku', consonant: 'h', vowel: '.', output: 'くゎ' },
  { marker: 'handaku', consonant: '.', vowel: 'j', output: 'つぁ' },
  { marker: 'handaku', consonant: '.', vowel: 'k', output: 'つぃ' },
  { marker: 'handaku', consonant: '.', vowel: 'u', output: 'つぇ' },
  { marker: 'handaku', consonant: '.', vowel: 'a', output: 'つぉ' },
  { marker: 'daku', consonant: 'r', vowel: 'u', output: 'じぇ' },
  { marker: 'daku', consonant: 'g', vowel: 'u', output: 'ぢぇ' },
  { marker: 'daku', consonant: 'e', vowel: 'p', output: 'でゅ' },
  { marker: 'daku', consonant: 'e', vowel: 'k', output: 'でぃ' },
  { marker: 'daku', consonant: ',', vowel: 'l', output: 'どぅ' },
  { marker: 'daku', consonant: 'l', vowel: 'j', output: 'ゔぁ' },
  { marker: 'daku', consonant: 'l', vowel: 'k', output: 'ゔぃ' },
  { marker: 'daku', consonant: 'l', vowel: 'u', output: 'ゔぇ' },
  { marker: 'daku', consonant: 'l', vowel: 'a', output: 'ゔぉ' },
  { marker: 'daku', consonant: 'l', vowel: 'p', output: 'ゔゅ' },
  { marker: 'daku', consonant: 'l', vowel: ';', output: 'ゔ' },
  { marker: 'daku', consonant: 'h', vowel: 'j', output: 'ぐぁ' },
  { marker: 'daku', consonant: 'h', vowel: 'k', output: 'ぐぃ' },
  { marker: 'daku', consonant: 'h', vowel: 'u', output: 'ぐぇ' },
  { marker: 'daku', consonant: 'h', vowel: 'a', output: 'ぐぉ' },
  { marker: 'daku', consonant: 'h', vowel: 'l', output: 'ぐゎ' },
  { marker: 'daku', consonant: 'h', vowel: '.', output: 'ぐゎ' },
];

/**
 * 外来音の面。面のトリガーは印と母音のキー、セルは子音のキーにする。
 * 「ゔ」だけは、「う」のlをトリガー、;をセルにする。出典はlを子音、;を母音とする。
 * 3キーの組は同じで、修飾の表の押し方が「濁音 + う」と読めるようにするためである。
 */
function gairaiFaces(): Face[] {
  const byTrigger = new Map<string, { trigger: string[]; entries: Record<string, string>; groups: Record<string, string> }>();
  for (const { marker, consonant, vowel, output } of GAIRAI) {
    const [triggerKey, cellKey] = output === 'ゔ' ? [consonant, vowel] : [vowel, consonant];
    const markerKey = marker === 'handaku' ? (LEFT_KEYS.has(consonant) ? 'm' : 'v') : LEFT_KEYS.has(consonant) ? 'j' : 'f';
    const trigger = [markerKey, triggerKey].sort();
    const id = trigger.join(' ');
    const group = byTrigger.get(id) ?? {
      trigger,
      entries: {},
      groups: { [markerKey]: marker === 'handaku' ? '半濁音' : '濁音', [triggerKey]: triggerKey === 'p' ? '拗音' : '外来音' },
    };
    // 「くゎ」「ぐゎ」でlと.のどちらかを母音にする組は別の面になるので、ここで重なるのは同じセルの書き直しだけ
    if (group.entries[cellKey] !== undefined) throw new Error(`外来音の面 ${id} のセル ${cellKey} が重なる`);
    group.entries[cellKey] = output;
    byTrigger.set(id, group);
  }
  return [...byTrigger.values()].map(({ trigger, entries, groups }) => modifierFace(trigger, entries, groups));
}

const CHUU = '中指シフト';
const CHUU_SAME = SAME_HAND_LAYER;
const DAKU_LAYER = '濁音';
const DAKU_SAME = '濁音（同じ手）';
const HANDAKU_LAYER = '半濁音';
const HANDAKU_SAME = '半濁音（同じ手）';

/** 2キーの同時押しで記号を出す面。打鍵はコンボ枠に数える。 */
const comboFace = (trigger: string[], entries: Record<string, string>, triggerOrder?: Face['triggerOrder']): Face =>
  face(trigger, entries, {
    inputRole: 'composition',
    compositionAggregation: 'combo',
    triggerPersistence: 'single',
    ...(triggerOrder === undefined ? {} : { triggerOrder }),
  });

export const NAGINATA_PRIVATE_FACES: Face[] = [
  face([], BASE, { inputRole: 'layer' }),

  // 反対の手のシフト（既定の打ち方）
  modifierFace(['k'], pick(SHIFT, true), { k: CHUU }, CHUU),
  modifierFace(['d'], pick(SHIFT, false), { d: CHUU }, CHUU),
  modifierFace(['j'], pick(DAKU, true), { j: '濁音' }, DAKU_LAYER),
  // f+hは「ぐ」。j+hはIMEの切り替えになるので、「ぐ」はこの面だけにある
  modifierFace(['f'], pick(DAKU, false), { f: '濁音' }, DAKU_LAYER),
  modifierFace(['m'], pick(HANDAKU, true), { m: '半濁音' }, HANDAKU_LAYER),
  modifierFace(['v'], pick(HANDAKU, false), { v: '半濁音' }, HANDAKU_LAYER),
  face(['q'], SMALL, {
    modifierGroups: { q: '小書き' },
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
    triggerOrder: 'prefix',
  }),

  // 拗音・濁音の拗音・半濁音の拗音・外来音
  ...youonFaces('plain'),
  ...youonFaces('daku', 'j'),
  ...youonFaces('handaku', 'm'),
  ...gairaiFaces(),

  // ！ と ？
  comboFace(['.'], { ',': '！', '/': '？' }),

  // 同じ手のシフト。d+kの「も」とf+jの「が」は反対の手の面にあるので、シフトのキー自身のセルは置かない
  modifierFace(['d'], pick(SHIFT, true, ['d']), { d: CHUU }, CHUU_SAME),
  modifierFace(['k'], pick(SHIFT, false), { k: CHUU }, CHUU_SAME),
  // f+gはIMEの切り替えになるので、「ぢ」はjの面だけにある
  modifierFace(['f'], pick(DAKU, true, ['f', 'g']), { f: '濁音' }, DAKU_SAME),
  modifierFace(['j'], pick(DAKU, false, ['h']), { j: '濁音' }, DAKU_SAME),
  modifierFace(['v'], pick(HANDAKU, true), { v: '半濁音' }, HANDAKU_SAME),
  modifierFace(['m'], pick(HANDAKU, false), { m: '半濁音' }, HANDAKU_SAME),

  // vとmの同時押しは、先に押した方で 、 か 。 になる。中指シフトの 、 。 の別の打ち方
  comboFace(['m'], { v: '、' }, 'prefix'),
  comboFace(['v'], { m: '。' }, 'prefix'),
];

/**
 * 修飾のトリガーのキーが、修飾の組の中で持つ意味。
 * 拗音は中指シフトの面の「や」「ゆ」「よ」の位置を押す。外来音は母音の位置を押す。
 * j・k・lは単打の「あ」「い」「う」、uは中指シフトの「え」、aは単打の「お」、.は中指シフトの「わ」の位置である。
 */
const NAGINATA_PRIVATE_TRIGGER_MEANINGS: TriggerMeanings = {
  拗音: { h: char('や'), p: char('ゆ'), i: char('よ') },
  外来音: {
    j: char('あ'),
    k: char('い'),
    l: char('う'),
    u: char('え'),
    a: char('お'),
    '.': char('わ'),
  },
  濁音: { f: modifierKey('濁音'), j: modifierKey('濁音') },
  半濁音: { v: modifierKey('半濁音'), m: modifierKey('半濁音') },
  中指シフト: { d: modifierKey('中指シフト'), k: modifierKey('中指シフト') },
};

export const NAGINATA_PRIVATE: Layout = withAliases(
  {
    ...fromFaces('naginata-private', '薙刀式私家版', NAGINATA_PRIVATE_FACES),
    triggerMeanings: NAGINATA_PRIVATE_TRIGGER_MEANINGS,
    // 中指シフトは、反対の手のキーが前後のかなと同じ指になる時に同じ手のキーで押す。
    // 濁音・半濁音のシフトは前後によらず反対の手で押す
    sameFingerAvoidingShiftKeys: ['d', 'k'],
    layerViewPresentation: {
      compact: {
        keepLayerIds: [SINGLE_LAYER_ID, 'layer:中指シフト'],
        mergeIntoLayerId: SINGLE_LAYER_ID,
        ...TWO_LAYER_COMPACT_LABELS,
        controlLabel: '薙刀式私家版の表示',
      },
    },
  },
  ['なぎなたしきしかばん', 'しかばん'],
);
// 親指のキーは何も出さないので、刻印を出さない
NAGINATA_PRIVATE.legends.delete(THUMB_KEY.LT);
NAGINATA_PRIVATE.legends.delete(THUMB_KEY.RT);
