import { kunrei } from '#input/romaji/kunrei.ts';
import { oonishiRomaji } from '#input/romaji/oonishi.ts';
import { tomisukeRomaji } from '#input/romaji/tomisuke.ts';
import { NAGINATA_V18 } from './naginata.ts';
import { CUSTOM_COMBOS } from './combos-custom.ts';
import { fromRows, withAliases, withCombos, withoutRomajiOnlyCombos, withRomaji, withShiftedOutputs, type Layout } from './types.ts';
import { NICOLA } from './nicola.ts';
import { ASUKA } from './asuka.ts';
import { SHIN_KOUME } from './shin-koume.ts';
import { SHIN_JIS_PREFIX, SHIN_JIS_SIMULTANEOUS } from './shin-jis.ts';
import { SHINGETA } from './shingeta.ts';
import { TSUKI_2_263 } from './tsuki-2-263.ts';
import { GEKKOU } from './gekkou.ts';
import { KAWASEMI_PLUS } from './kawasemi-plus.ts';
import { JIS_KANA } from './jis-kana.ts';

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
  LayerPresentationRole,
  Layout,
  ResolvedComboDefinition,
  Sequence,
  Step,
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
  withShiftedOutputs,
  withRomaji,
  withCombos,
  withoutRomajiOnlyCombos,
} from './types.ts';
export { faceCells, handOfKey } from './face-geometry.ts';
export type { Hand } from './face-geometry.ts';
export type { FaceGroups, Layer } from './layers.ts';

const ROMAJI = kunrei();
const ROMAJI_OONISHI = oonishiRomaji();
const ROMAJI_TOMISUKE = tomisukeRomaji();

/** 角度改変の運指で打つ前提の配列に、推奨の指の割り当て（角度改変）を付ける */
function angleModLayout(layout: Layout): Layout {
  return { ...layout, recommendedFingerAssignmentIds: { ansi: 'angle-mod', jis: 'angle-mod-jis' } };
}

/**
 * 英字配列。行ごとの列数はANSIの英数部に合わせる（12 / 12 / 11 / 10）。
 * 大西配列は `-` をホーム段に置くため、数字段には `-` を入れない。
 */
const ALPHA: Layout[] = [
  withAliases(withShiftedOutputs(fromRows('qwerty', 'QWERTY', ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'])), [
    'くわーてぃ',
    'くぉーてぃ',
    'くあーてぃ',
    'くうぇるてぃ',
  ]),
  // キーの並びはQWERTYと同じ。指の割り当ての推奨だけが違う
  withAliases(
    {
      ...withShiftedOutputs(fromRows('qwerty-optimized', 'QWERTY最適化', ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'])),
      recommendedFingerAssignmentIds: { ansi: 'qwerty-optimized', jis: 'qwerty-optimized-jis' },
    },
    ['くわーてぃさいてきか', 'くわーてぃ'],
  ),
  withAliases(withShiftedOutputs(fromRows('dvorak', 'Dvorak', ['1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'])), [
    'どゔぉらっく',
    'どぼらっく',
  ]),
  withAliases(withShiftedOutputs(fromRows('colemak', 'Colemak', ['1234567890-=', 'qwfpgjluy;[]', "arstdhneio'", 'zxcvbkm,./'])), ['こーるまっく']),
  withAliases(withShiftedOutputs(fromRows('colemak-dh', 'Colemak-DH', ['1234567890-=', 'qwfpbjluy;[]', "arstgmneio'", 'zxcdvkh,./'])), [
    'こーるまっくでぃーえいち',
    'こーるまっくdh',
  ]),
  withAliases(withShiftedOutputs(fromRows('workman', 'Workman', ['1234567890-=', 'qdrwbjfup;[]', "ashtgyneoi'", 'zxmcvkl,./'])), ['わーくまん']),
  // 作者が定義したのは30キー（3段×10列）だけで、外側のキーはQWERTYのまま。
  // 数字段・`[` `]`・ホーム段右端の `'` は作者の定義に無いのでQWERTYの位置に残し、
  // 30キーに入った `,` `.` `;` `/` はQWERTYの位置から外してある
  withAliases(withShiftedOutputs(fromRows('eucalyn', 'Eucalyn配列', ['1234567890-=', 'qw,.;mrdyp[]', "aoeiugtksn'", 'zxcvfbhjl/'])), [
    'ゆかりん',
    'ゆかりんはいれつ',
    'eucalyn',
  ]),
  // 作者のKeyboard Layout Analyzer用定義（US配列の全キー）の記号をそのまま写した。作者は記号の位置を「仮」としている
  withAliases(withShiftedOutputs(fromRows('astarte', 'Astarte', ['1234567890;=', 'qpuy,jdhgw[]', "ioea.ktnsr'", 'zx-c/mlfbv'])), [
    'あすたるて',
    'あすたるてはいれつ',
    'astarte',
  ]),
  // 作者配布のUS配列版AutoHotkeyスクリプトのキー置換の写し。作者が記号の位置の標準とした版
  withAliases(withShiftedOutputs(fromRows('tomisuke', 'Tomisuke配列', ['1234567890[]', "',.-=lrdyp;/", 'aoeiugntskf', 'xcvwqjhmbz'])), [
    'とみすけ',
    'とみすけはいれつ',
    'tomisuke',
  ]),
  // Rowstag版。ホーム段の11番目（QWERTYの `'` の位置）に `/` が入り、`'` は下段にある。数字段と `[` `]` はQWERTYのまま
  withAliases(withShiftedOutputs(fromRows('gallium', 'Gallium', ['1234567890-=', 'bldcvjfou,[]', 'nrtsgyhaei/', "xqmwzkp';."])), ['がりうむ', 'gallium']),
  // 作者の定義は30キーに `'` を含み、`;` はホーム段の11番目（QWERTYの `;` の位置）に置かれる。
  // 数字段の `-` `=` と `[` `]` はQWERTYのまま残る
  withAliases(withShiftedOutputs(fromRows('semimak-jq', 'Semimak JQ', ['1234567890-=', "flhvz'wuoy[]", 'srntkcdeai;', 'xjbmqpg,./'])), [
    'せみまっくじぇいきゅー',
    'せみまっく',
    'semimak',
  ]),
  // ホーム段の11番目（QWERTYの `'` の位置）に `/` が入り、`'` は下段の右端にある。`[` `]` と数字段はQWERTYのまま
  withAliases(withShiftedOutputs(fromRows('recurva', 'Recurva', ['1234567890-=', 'frdpvqjuoy[]', 'sntcb.heai/', "zxkgwml;',"])), ['りかーば', 'recurva']),
  // 作者のREADMEにある角度改変なしの並び。`;` はホーム段の11番目（QWERTYの `;` の位置）
  withAliases(withShiftedOutputs(fromRows('aptv3', 'APTv3', ['1234567890-=', 'wgdfbqluoy[]', 'rsthkjneai;', "xcmpvz,.'/"])), [
    'えーぴーてぃーぶいすりー',
    'えーぴーてぃー',
    'apt',
  ]),
  // 公式のANSI用の並び。角度改変で下段の左5キーを1つ左の物理キーへ寄せ、左端の `z` をQWERTYの `b` の位置に移してある（既存の `colemak-dh` は寄せていない並び）。
  // 角度改変の運指で打つ前提なので、推奨の指の割り当ては角度改変
  withAliases(
    angleModLayout(withShiftedOutputs(fromRows('colemak-dh-ansi', 'Colemak-DH（ANSI）', ['1234567890-=', 'qwfpbjluy;[]', "arstgmneio'", 'xcdvzkh,./']))),
    ['こーるまっくでぃーえいちあんし', 'こーるまっくdhあんし', 'あんし'],
  ),
  // 作者の行ずれ（ロウスタッガード）のANSIキーボード用の並び。角度改変済みで、作者が外側のキーに触れているのは `;` `[` `]` `'` だけ。
  // 数字段はQWERTYのまま
  withAliases(
    angleModLayout(withShiftedOutputs(fromRows('canary-ansi', 'Canary（ANSI）', ['1234567890-=', 'wlypkzxou;[]', "crstbfneia'", 'jvdgqmh/,.']))),
    ['かなりああんし', 'かなりあ', 'canary'],
  ),
  // 作者のオーソリニア用の並び（30キー）。作者は外側のキーを指定していないので、`'` は作者の並びのとおり上段の右端、
  // `;` はホーム段の11番目（QWERTYの `'` の位置）に置き、`[` `]` と数字段はQWERTYのまま。角度改変はしないので、推奨の指の割り当ては付けない
  withAliases(withShiftedOutputs(fromRows('canary', 'Canary', ['1234567890-=', "wlypbzfou'[]", 'crstgmneia;', 'qjvdkxh/,.'])), [
    'かなりあ',
    'かなりあおーそりにあ',
    'canary',
  ]),
  // 作者が定義したのはオーソリニア用の30キーだけで、ホーム段の11番目（QWERTYの `'` の位置）には `/` を置く
  // （cyanophageの比較表と同じ）。ANSI用の並びは、作者の説明にある角度改変の規則で下段の左5キーを1つ左へ寄せ、左端の `z` をQWERTYの `b` の位置に移した結果。
  // 数字段と `[` `]` はQWERTYのまま
  withAliases(
    angleModLayout(withShiftedOutputs(fromRows('sturdy-ansi', 'Sturdy（ANSI）', ['1234567890-=', 'vmlcpxfouj[]', 'strdy.naei/', "kqgwzbh';,"]))),
    ['すたーでぃあんし', 'すたーでぃ', 'sturdy'],
  ),
  // 作者の30キーのまま（ずらす前）。外側のキーの置き方は上の `sturdy-ansi` と同じ。推奨の指の割り当ては付けない
  withAliases(withShiftedOutputs(fromRows('sturdy', 'Sturdy', ['1234567890-=', 'vmlcpxfouj[]', 'strdy.naei/', "zkqgwbh';,"])), [
    'すたーでぃおーそりにあ',
    'すたーでぃ',
    'sturdy',
  ]),
  // 作者のREADMEのAscii Versionの並び。作者は記号の置き方も設計の一部としていて、`'` `,` `-` `/` のShiftの組がUS配列と違う。
  // 作者の並びは `[` `]` `=` も含めて全キーを定義している（`` ` `` と `\` はモデル化していないキー）
  withAliases(
    withShiftedOutputs(fromRows('graphite', 'Graphite', ['1234567890[]', "bldwz'fouj;=", 'nrtsgyhaei,', 'qxmcvkp.-/']), undefined, {
      "'": '_',
      ',': '?',
      '-': '"',
      '/': '<',
    }),
    ['ぐらふぁいと', 'graphite'],
  ),
  // 作者のXKB定義の第2グループ（Halmakの面）の並び。記号の置き方も作者の定義で、`9` `0` `,` `.` のShiftの組がUS配列と違う。
  // 数字段・`[` `]` はQWERTYのまま
  withAliases(
    withShiftedOutputs(fromRows('halmak', 'Halmak', ['1234567890-=', 'wlrbz;qudj[]', "shnt,.aeoi'", 'fmvc/gpxky']), undefined, {
      '9': '<',
      '0': '>',
      ',': '(',
      '.': ')',
    }),
    ['はるまっく', 'halmak'],
  ),
  // 作者が定義したのは3段×10列の30キーで、`:` を単打に置き、`;` は `,` のShiftで打つ。作者の組は `,`→`;` `/`→`<` `.`→`>` `:`→`?`。
  // 30キーの外側は作者が指定していないので、数字段・`[` `]`・ホーム段の11番目の `'` はQWERTYの位置に残す。
  // 外側のキーに作者の組が出す文字（`;` `?` `<` `>`）を置くと、その文字のShift経路が足されなくなるので置かない
  withAliases(
    withShiftedOutputs(fromRows('mtgap', 'MTGAP', ['1234567890-=', 'ypoujkdlcw[]', "inea,mhtsr'", 'qz/.:bfgvx']), undefined, {
      ',': ';',
      '/': '<',
      '.': '>',
      ':': '?',
    }),
    ['えむてぃーじーえーぴー', 'mtgap'],
  ),
  withAliases(withShiftedOutputs(fromRows('norman', 'Norman', ['1234567890-=', 'qwdfkjurl;[]', "asetgynioh'", 'zxcvbpm,./'])), ['のーまん']),
  withAliases(withShiftedOutputs(fromRows('qgmlwy', 'QGMLWY', ['1234567890-=', 'qgmlwyfub;[]', "dstnriaeoh'", 'zxcvjkp,./'])), [
    'きゅーじーえむえるだぶりゅーわい',
    'carpalx',
  ]),
  withAliases(withShiftedOutputs(fromRows('oonishi', '大西配列', ['1234567890', 'qlu,.fwryp', 'eiao-ktnsh', 'zxcv;gdmjb'])), [
    'おおにし',
    'おおにしはいれつ',
  ]),
  // コンボはどれもromajiOnly（仕様 §4.3）。かなから展開した綴りの区間はコンボ込み、英文や英字の区間は単打配置だけで打つ。
  withAliases(
    withCombos(
      'oonishi-custom',
      'TK音直入力法',
      withShiftedOutputs(fromRows('oonishi-custom', 'TK音直入力法', ['1234567890', 'qlu,.fwryp', 'eiao-ktnsh', 'xjcv/gdmzb'])),
      CUSTOM_COMBOS,
    ),
    ['てぃーけーおんちょくにゅうりょくほう', 'てぃーけー', 'tk'],
  ),
];

const ALPHA_BY_ID = new Map(ALPHA.map((l) => [l.id, l]));

/**
 * 英文をそのまま打つ配列。ローマ字でしか使わないコンボは外した形で並べ、
 * 配列図・逆引き等の表示にも出さない（評価側もgenerateTraceが同じ規則で外す）。
 */
export const LAYOUTS: Layout[] = ALPHA.map(withoutRomajiOnlyCombos);

/**
 * 日本語のかなテキストを打つ配列。
 * ローマ字配列はテーブルを通して展開し、かな配列はそのまま打つ。
 * 最終形はどちらも打鍵ステップ列なので、同じテキストで比較できる。
 */
export const LAYOUTS_JA: Layout[] = [
  // とみすけ配列は作者が勧める綴り（シャ行sh）で打つ。ほかの配列は訓令式
  ...ALPHA.filter((l) => l.id.startsWith('oonishi') === false).map((l) => withRomaji(l, l.id === 'tomisuke' ? ROMAJI_TOMISUKE : ROMAJI)),
  // 大西配列は公式が前提とする綴り（シャ行sh / じji / じゃ行j）で打つ
  withRomaji(ALPHA_BY_ID.get('oonishi')!, ROMAJI_OONISHI),
  // TK音直入力法のコンボは訓令式（sya / zya）の綴りを前提に組まれている
  withRomaji(ALPHA_BY_ID.get('oonishi-custom')!, ROMAJI),
  NAGINATA_V18,
  NICOLA,
  SHIN_KOUME,
  ASUKA,
  SHIN_JIS_PREFIX,
  SHIN_JIS_SIMULTANEOUS,
  SHINGETA,
  TSUKI_2_263,
  GEKKOU,
  KAWASEMI_PLUS,
  JIS_KANA,
];

export const LAYOUT_BY_ID = new Map([...LAYOUTS, ...LAYOUTS_JA].map((l) => [l.id, l]));
