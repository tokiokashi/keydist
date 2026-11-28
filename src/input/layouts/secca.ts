import { runStepsToEnd } from '../semantics/index.ts';
import { THUMB_KEY } from '../shapes/geometry.ts';
import { NAGINATA_TRIGGER_MEANINGS, NAGINATA_V18_FACES, TWO_LAYER_COMPACT_LABELS } from './naginata.ts';
import {
  SINGLE_LAYER_ID,
  fromFaces,
  withAliases,
  withSequenceInputsSteps,
  withThumbShiftAlternatives,
  type Face,
  type KanjiDirectDeclaration,
  type Layout,
  type Sequence,
} from './types.ts';

/**
 * 雪華（作: h3at2o）。かなは薙刀式を手直しした同時打鍵、漢字は左手の2キーと右手の1〜2キーを順に押す順次打鍵で打つ、漢字直接入力の配列。
 * 異体字はその後にもう1キーを足し、頻出の熟語は「くずし字入力」で短い打鍵に割り当てる。
 *
 * 出典はh3at2o/seccaのコミット`227517ae7c6b1c6268d68f5031b819d264a37031`（MIT）。写しは`test/fixtures/sources/secca/`。
 * 出典は、ソフトKMonadの設定（`config.kbd`）と、KMonadが送り出す記号の並びを文字に変える表（`.XCompose`と読み込む5つの表）に分かれる。
 * 組み込みの表（`tables/secca.json`）は、`scripts/secca-core.ts`が`config.kbd`の動きを再現して、表の行ごとの打鍵列を求めて作る。
 *
 * - かな: 空白キーを押さない1〜3キーの組は、同時に押す1ステップで、薙刀式の同じ種類の面（単打・濁音・半濁音・小書き・拗音・外来音）に持つ。
 *   空白キーを先に押すひらがなの面は、薙刀式のセンターシフトと同じ面（親指は`centerShiftThumb`に従う）に持つ
 * - 漢字・異体字・熟語・固有名詞・記号: 新しく押すキーごとに1ステップの順次打鍵で持つ。空白キーは右親指。どれも層のトリガーに数えない
 *
 * 右手のキーは、作者の表記のQWERTYの位置で打つ。作者の`config.kbd`は右手を1列右の物理キーへずらしているが、それは手の置き方で、字の割り当てではない。
 * 使わない行（出力が空の行・カタカナのモードで出る行・どの押し方でも作れない行）は表に入れていない。
 */

const ID = 'secca';
const NAME = '雪華';
const ALIASES = ['せっか', 'secca', '漢直'];

const QWERTY_ROWS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'] as const;

/** 表の打鍵で空白キーを表す文字 */
const SPACE_CHAR = '_';

const SECTIONS = ['symbol', 'kanji', 'variant', 'jukugo', 'proper', 'kana'] as const;
type Section = (typeof SECTIONS)[number];

/** 順次打鍵で持つ節。表の並びの順に、同じ見出しの先に現れる行が既定の経路になる。 */
const SEQUENTIAL_SECTIONS: readonly Section[] = ['symbol', 'kanji', 'variant', 'jukugo', 'proper'];

interface SeccaRow {
  readonly output: string;
  readonly keys: string;
}

function parseSection(table: unknown, section: Section): SeccaRow[] {
  const text = (table as Record<string, unknown> | null)?.[section];
  if (typeof text !== 'string') throw new Error(`雪華の表の形が違う: ${section}`);
  if (text === '') return [];
  return text.split('\n').map((line) => {
    const at = line.indexOf(' ');
    if (at <= 0 || at === line.length - 1) throw new Error(`雪華の表の行の形が違う: ${line}`);
    return { output: line.slice(0, at), keys: line.slice(at + 1) };
  });
}

const stepsOf = (keys: string): Sequence => [...keys].map((char) => [char === SPACE_CHAR ? THUMB_KEY.RT : char]);

/** 出力 → キー の写像から、QWERTYの4行に並べた面の行を作る。 */
const rowsOf = (cells: ReadonlyMap<string, string>): string[][] => QWERTY_ROWS.map((row) => [...row].map((key) => cells.get(key) ?? ''));

/** かなの節の、キーの集合ごとの出力。キーは並べ替えた文字列（空白キーは先頭の`_`）で表す。 */
interface KanaCells {
  /** 単打 */
  readonly single: Map<string, string>;
  /** 空白キーを先に押す組 */
  readonly spaceShift: Map<string, string>;
  /** 空白キーを押さない2〜3キーの組。`出力 + キーの集合`→ 使われたか */
  readonly chords: Map<string, boolean>;
}

function readKana(rows: readonly SeccaRow[]): KanaCells {
  const cells: KanaCells = { single: new Map(), spaceShift: new Map(), chords: new Map() };
  for (const { output, keys } of rows) {
    if (keys.length === 1) {
      if (cells.single.has(keys)) throw new Error(`雪華の表: 単打のキーが重なる ${keys}`);
      cells.single.set(keys, output);
    } else if (keys.startsWith(`(${SPACE_CHAR}`) && keys.length === 4) {
      cells.spaceShift.set(keys[2]!, output);
    } else if (keys.startsWith('(') && keys.endsWith(')')) {
      cells.chords.set(`${output} ${keys.slice(1, -1)}`, false);
    } else throw new Error(`雪華の表: かなの打鍵の形が違う ${keys}`);
  }
  return cells;
}

/** 空白キー（`space`）を先に押すセンターシフトの面と、単打の面は、出典の表の値を置く。 */
function seccaFaces(kana: KanaCells): Face[] {
  const faces: Face[] = [];
  for (const template of NAGINATA_V18_FACES) {
    if (template.trigger.length === 0) {
      faces.push({ ...template, rows: rowsOf(kana.single) });
    } else if (template.trigger.length === 1 && template.trigger[0] === 'space') {
      faces.push({ ...template, rows: rowsOf(kana.spaceShift) });
    } else {
      // 薙刀式の同じ種類の組と同じ面の形。出典の表にある組だけを残す
      let any = false;
      const rows = template.rows.map((row, r) =>
        [...(typeof row === 'string' ? [...row] : row)].map((output, c) => {
          if (output === '') return '';
          const key = QWERTY_ROWS[r]![c]!;
          const set = [...template.trigger, key].sort().join('');
          const id = `${output} ${set}`;
          if (!kana.chords.has(id)) return '';
          kana.chords.set(id, true);
          any = true;
          return output;
        }),
      );
      if (any) faces.push({ ...template, rows });
    }
  }
  return faces;
}

/** 取得した表（`tables/secca.json`）から配列を作る。作る途中で `yield` する。 */
function* seccaLayoutSteps(table: unknown): Generator<void, Layout> {
  const sections = new Map<Section, SeccaRow[]>();
  for (const section of SECTIONS) {
    sections.set(section, parseSection(table, section));
    yield;
  }
  const kana = readKana(sections.get('kana')!);
  const faces = seccaFaces(kana);
  const unused = [...kana.chords].filter(([, used]) => !used).map(([id]) => id);
  if (unused.length > 0) throw new Error(`雪華の表: 薙刀式の面に無いかなの組がある ${unused.join(',')}`);
  const base = withAliases(
    withThumbShiftAlternatives(
      {
        ...fromFaces(ID, NAME, faces),
        triggerMeanings: NAGINATA_TRIGGER_MEANINGS,
        layerViewPresentation: {
          compact: {
            keepLayerIds: [SINGLE_LAYER_ID, 'layer:SandS'],
            mergeIntoLayerId: SINGLE_LAYER_ID,
            ...TWO_LAYER_COMPACT_LABELS,
            controlLabel: '雪華の表示',
          },
        },
      },
      THUMB_KEY.RT,
      [THUMB_KEY.RT, THUMB_KEY.LT],
    ),
    ALIASES,
  );
  base.legends.set(THUMB_KEY.LT, 'Space');
  base.legends.set(THUMB_KEY.RT, 'Space');
  const sequences: [string, Sequence][] = SEQUENTIAL_SECTIONS.flatMap((section) =>
    sections.get(section)!.map(({ output, keys }): [string, Sequence] => [output, stepsOf(keys)]),
  );
  yield;
  return yield* withSequenceInputsSteps(base, sequences);
}

/** 取得した表（`tables/secca.json`）から配列を作る。 */
const seccaLayout = (table: unknown): Layout => runStepsToEnd(seccaLayoutSteps(table));

/** 表を取得する前に出せる項目（名前・別名・使う物理キー）と、表から配列を作る関数。 */
export const SECCA_DECLARATION: KanjiDirectDeclaration = {
  id: ID,
  name: NAME,
  aliases: ALIASES,
  tableFile: 'secca.json',
  // 英字26キーと`, . / ;`。空白キーは右親指で打つ。センターシフトのかなは、親指の設定で左親指にもなる
  physicalKeys: [...'qwertyuiopasdfghjkl;zxcvbnm,./', THUMB_KEY.RT, THUMB_KEY.LT],
  layoutFromTable: seccaLayout,
  layoutStepsFromTable: seccaLayoutSteps,
};
