import { keyId, QWERTY_LEGEND, resolveKeyId, THUMB_KEY, type NonThumb } from '../geometry.ts';
import { groupFacesIntoLayers } from '../layers.ts';

/** 1ステップで同時に押すキーの集合。キーはQWERTY刻印で指す（`thumb-r` `thumb-l` は親指キー）。`space` も入力互換で受け付ける */
export type Step = string[];

/** 1文字を打つための打鍵ステップ列。順次打鍵はステップを並べる */
export type Sequence = Step[];

/** 面の発火方式。triggerと入力キーを同時に押すか、前後に分けるかを表す。 */
export type FaceMode = 'prefix' | 'suffix' | 'simultaneous';

/** Face が担う入力意味。表示上のlayer分類とは独立したsemantic情報。 */
export type InputRole = 'layer' | 'modifier' | 'composition';

/** trigger が対象Strokeごとに同期押下されるか、複数Strokeへ保持可能か。 */
export type TriggerBehavior = 'chord' | 'hold';

export type HoldPhase = 'start' | 'continue' | 'end';

/**
 * 1ステップへ展開した後のsemantic情報。
 * outputKeys と triggerKeys は重なってよく、同一キーが output + trigger の複合roleを持てる。
 */
export interface StepSemantic {
  inputRole: InputRole;
  triggerBehavior?: TriggerBehavior;
  outputKeys: readonly string[];
  triggerKeys: readonly string[];
  /** holdの開始/継続/終了は静的Faceから推測せず、必要な呼び出し側だけが明示する。 */
  holdPhase?: HoldPhase;
}

/**
 * 面の1行。文字列なら1文字ずつ、配列ならセルごとの文字列として読む。
 * 配列形式は「きゃ」のような複数文字の見出しを1セルに置くために使う。
 */
export type FaceRow = string | readonly string[];

/** triggerで発火するキー面。rowsはQWERTY刻印の4行に対応する。 */
export interface Face {
  trigger: readonly string[];
  mode: FaceMode;
  rows: readonly FaceRow[];
  /** 同じ値を持つ単一キー面は1レイヤーへ畳む。省略時はその面が単独で1レイヤー */
  layer?: string;
  /** 面の表示分類。既存UI互換用。省略時はlayer。triggerが2キー以上の面は常にcombo */
  role?: 'layer' | 'modifier';
  /** 解析へ渡す入力意味。省略時は既存role（無ければlayer）を使う。 */
  inputRole?: InputRole;
  /** triggerの成立方法。triggerを持つFaceで省略時は既存互換のchord。 */
  triggerBehavior?: TriggerBehavior;
}

export type LayerKind = 'layer' | 'combo';

/** 打鍵の帰属先。面を持たない配列も単打という暗黙の層を持つ。 */
export interface LayerDefinition {
  id: string;
  kind: LayerKind;
  label: string;
}

export const SINGLE_LAYER_ID = 'single';
export const COMBO_LAYER_ID = 'combo';

/** コンボを発火できる入力の条件。条件を省略したコンボは常に最長一致する。 */
export interface ComboCondition {
  /** 拗音のローマ字塊の内部だけで発火する */
  youonOnly?: boolean;
}

/** コンボの出力、入力キー、発火条件。 */
export type ComboDefinition = [
  output: string,
  inputs: string[],
  condition?: ComboCondition,
];

export interface Layout {
  id: string;
  name: string;
  /** 文字 → 打鍵ステップ列 */
  map: Map<string, Sequence>;
  /** 面から作った配列だけが持つ、表示用の元面。自作配列などは省略する */
  faces?: readonly Face[];
  /**
   * mapの見出しの最大文字数。1より大きい場合、入力は最長一致で切り出す
   * （「きゃ」を「き」「ゃ」に分けない）
   */
  maxCharLength?: number;
  /** キーid → そのキーの刻印。表示用 */
  legends: Map<string, string>;
  /** 運指設定で左右の親指を振り替えられるシフトキー。 */
  thumbShiftKey?: string;
  /** この配列が前提とする非親指のホームキー。省略時は物理形状側の既定値を使う。 */
  homeKeys?: Partial<Record<NonThumb, string>>;
  /**
   * かなテキストをローマ字へ展開してから打つ配列はテーブルを持つ。
   * かな配列は持たない。同じかなテキストを両者に食わせて比較できる。
   */
  romajiTable?: Map<string, string>;
  /**
   * mapのうちコンボとして追加した見出しと、その発火条件。ローマ字化で
   * 失われるかなの境界を使った命中判定と、コンボの命中件数の集計に使う。
   */
  comboConditions?: ReadonlyMap<string, ComboCondition>;
  /** 各見出しのSequenceのステップごとの帰属先。合成出力では層が混在しうる */
  stepLayers?: ReadonlyMap<string, readonly string[]>;
  /** 各見出しのSequenceのステップごとに、層操作として押すキー */
  stepTriggerKeys?: ReadonlyMap<string, readonly (readonly string[])[]>;
  /** 各見出しをStrokeへ正規化するためのstep単位semantic metadata。 */
  stepSemantics?: ReadonlyMap<string, readonly StepSemantic[]>;
  /** 層・コンボの表示順と種別。 */
  layerDefinitions?: readonly LayerDefinition[];
  /** 面から展開した配列で、各面がどの帰属先へ属するかをUIが引くための表 */
  faceLayerIds?: ReadonlyMap<Face, string>;
}

const maxKeyLength = (keys: Iterable<string>) => Math.max(1, ...[...keys].map((k) => k.length));

const QWERTY_KEYS = new Set([...QWERTY_LEGEND.join('')]);

/** QWERTY刻印のキーidで面を作る。未知のキーは空欄にせず定義ミスとして弾く。 */
export function faceFromEntries(
  trigger: readonly string[],
  mode: FaceMode,
  entries: Record<string, string>,
): Face {
  const invalidKeys = Object.keys(entries).filter((key) => !QWERTY_KEYS.has(key));
  if (invalidKeys.length > 0) throw new Error(`面に未知のキーがある: ${invalidKeys.join(', ')}`);
  return {
    trigger,
    mode,
    rows: QWERTY_LEGEND.map((row) => [...row].map((key) => entries[key] ?? '')),
  };
}

/**
 * 4行 × N列のグリッドに文字を並べた配列。
 * 単打のみの配列（QWERTY・大西配列など）はこの形で書ける。
 */
export function fromRows(
  id: string,
  name: string,
  rows: string[],
  thumbs: { LT?: string; RT?: string } = { RT: ' ' },
): Layout {
  const map = new Map<string, Sequence>();
  const stepLayers = new Map<string, readonly string[]>();
  const stepTriggerKeys = new Map<string, readonly (readonly string[])[]>();
  const stepSemantics = new Map<string, readonly StepSemantic[]>();
  const legends = new Map<string, string>();
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === ' ') return;
      const id = keyId(r, c);
      // 同じ文字が複数のキーに載る配列もある。打鍵には先に書いた方を使い、
      // 後の方は刻印だけ残す（どちらを使うか決めないと、静かに片方が死ぬ）
      if (!map.has(ch)) {
        map.set(ch, [[id]]);
        stepLayers.set(ch, [SINGLE_LAYER_ID]);
        stepTriggerKeys.set(ch, [[]]);
        stepSemantics.set(ch, [{
          inputRole: 'layer',
          outputKeys: [id],
          triggerKeys: [],
        }]);
      }
      legends.set(id, ch);
    });
  });
  // 親指の刻印は、親指キーを文字入力へ追加しないかな配列でも表示する。
  legends.set(THUMB_KEY.LT, '親指');
  legends.set(THUMB_KEY.RT, '空白');
  if (thumbs.LT) {
    map.set(thumbs.LT, [[THUMB_KEY.LT]]);
    stepLayers.set(thumbs.LT, [SINGLE_LAYER_ID]);
    stepTriggerKeys.set(thumbs.LT, [[]]);
    stepSemantics.set(thumbs.LT, [{
      inputRole: 'layer',
      outputKeys: [THUMB_KEY.LT],
      triggerKeys: [],
    }]);
  }
  if (thumbs.RT) {
    map.set(thumbs.RT, [[THUMB_KEY.RT]]);
    stepLayers.set(thumbs.RT, [SINGLE_LAYER_ID]);
    stepTriggerKeys.set(thumbs.RT, [[]]);
    stepSemantics.set(thumbs.RT, [{
      inputRole: 'layer',
      outputKeys: [THUMB_KEY.RT],
      triggerKeys: [],
    }]);
  }
  return {
    id,
    name,
    map,
    legends,
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions: [{ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' }],
  };
}

/** 面の集合を、評価器が使うかな → 打鍵ステップ列へ展開する。 */
export function fromFaces(
  id: string,
  name: string,
  faces: readonly Face[],
  thumbs: { LT?: string; RT?: string } = {},
): Layout {
  // 定義時にレイヤーの宣言を検証し、表示時まで不正な組み合わせを遅延させない。
  groupFacesIntoLayers(faces);
  const map = new Map<string, Sequence>();
  const stepLayers = new Map<string, readonly string[]>();
  const stepTriggerKeys = new Map<string, readonly (readonly string[])[]>();
  const stepSemantics = new Map<string, readonly StepSemantic[]>();
  const legends = new Map<string, string>();
  const layerDefinitions: LayerDefinition[] = [];
  const faceLayerIds = new Map<Face, string>();

  const addDefinition = (definition: LayerDefinition) => {
    if (!layerDefinitions.some((entry) => entry.id === definition.id)) {
      layerDefinitions.push(definition);
    }
  };

  for (const [faceIndex, face] of faces.entries()) {
    const trigger = [...new Set(face.trigger)];
    const isCombo = trigger.length > 1;
    const layerId = isCombo
      ? COMBO_LAYER_ID
      : face.layer === undefined ? `face:${faceIndex}` : `layer:${face.layer}`;
    faceLayerIds.set(face, layerId);
    addDefinition({
      id: layerId,
      kind: isCombo ? 'combo' : 'layer',
      label: isCombo ? 'コンボ' : face.layer ?? (trigger.length === 0 ? '単打' : `面 ${faceIndex + 1}`),
    });
    face.rows.forEach((row, r) => {
      const cells = typeof row === 'string' ? [...row] : [...row];
      cells.forEach((output, c) => {
        if (output === '' || output === ' ') return;
        if (map.has(output)) {
          throw new Error(`面の出力「${output}」が重複している`);
        }

        const key = keyId(r, c);
        const sequence = expandFace(trigger, face.mode, key);
        map.set(output, sequence);
        stepLayers.set(output, sequence.map(() => layerId));
        stepTriggerKeys.set(output, expandFaceTriggerKeys(trigger, face.mode));
        stepSemantics.set(output, expandFaceSemantics(
          trigger,
          face.mode,
          key,
          face.inputRole ?? face.role ?? 'layer',
          trigger.length > 0 ? face.triggerBehavior ?? 'chord' : undefined,
        ));
        // 刻印は単打面の1文字だけを表示する。シフト面の出力で上書きしない。
        if (trigger.length === 0 && [...output].length === 1) legends.set(key, output);
      });
    });
  }

  // 親指の刻印は、親指キーを文字入力へ追加しないかな配列でも表示する。
  legends.set(THUMB_KEY.LT, '親指');
  legends.set(THUMB_KEY.RT, '空白');
  const baseFace = faces.find((face) => face.trigger.length === 0);
  const baseLayerId = baseFace ? faceLayerIds.get(baseFace)! : SINGLE_LAYER_ID;
  if (!baseFace && (thumbs.LT || thumbs.RT)) {
    addDefinition({ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' });
  }
  if (thumbs.LT) {
    map.set(thumbs.LT, [[THUMB_KEY.LT]]);
    stepLayers.set(thumbs.LT, [baseLayerId]);
    stepTriggerKeys.set(thumbs.LT, [[]]);
    stepSemantics.set(thumbs.LT, [{
      inputRole: 'layer',
      outputKeys: [THUMB_KEY.LT],
      triggerKeys: [],
    }]);
  }
  if (thumbs.RT) {
    map.set(thumbs.RT, [[THUMB_KEY.RT]]);
    stepLayers.set(thumbs.RT, [baseLayerId]);
    stepTriggerKeys.set(thumbs.RT, [[]]);
    stepSemantics.set(thumbs.RT, [{
      inputRole: 'layer',
      outputKeys: [THUMB_KEY.RT],
      triggerKeys: [],
    }]);
  }
  return {
    id,
    name,
    map,
    legends,
    faces: [...faces],
    maxCharLength: maxKeyLength(map.keys()),
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions,
    faceLayerIds,
  };
}

function expandFace(trigger: string[], mode: FaceMode, key: string): Sequence {
  if (trigger.length === 0) return [[key]];
  if (mode === 'simultaneous') return [[...trigger, key]];
  if (mode === 'prefix') return [[...trigger], [key]];
  return [[key], [...trigger]];
}

function expandFaceTriggerKeys(trigger: string[], mode: FaceMode): readonly (readonly string[])[] {
  if (trigger.length === 0) return [[]];
  if (mode === 'simultaneous') return [trigger];
  if (mode === 'prefix') return [trigger, []];
  return [[], trigger];
}

function expandFaceSemantics(
  trigger: readonly string[],
  mode: FaceMode,
  key: string,
  inputRole: InputRole,
  triggerBehavior: TriggerBehavior | undefined,
): readonly StepSemantic[] {
  const triggerKeys = [...trigger];
  const output = [key];
  if (trigger.length === 0) {
    return [{ inputRole, outputKeys: output, triggerKeys: [] }];
  }
  if (mode === 'simultaneous') {
    return [{ inputRole, triggerBehavior, outputKeys: output, triggerKeys }];
  }
  if (mode === 'prefix') {
    return [
      { inputRole, triggerBehavior, outputKeys: [], triggerKeys },
      { inputRole, outputKeys: output, triggerKeys: [] },
    ];
  }
  return [
    { inputRole, outputKeys: output, triggerKeys: [] },
    { inputRole, triggerBehavior, outputKeys: [], triggerKeys },
  ];
}

/** かな → 打鍵ステップ列を直接書いた配列（薙刀式など） */
export function fromKana(id: string, name: string, def: Record<string, string[][]>): Layout {
  const map = new Map<string, Sequence>(Object.entries(def));
  const stepLayers = new Map<string, readonly string[]>(
    [...map].map(([kana, sequence]) => [kana, sequence.map(() => SINGLE_LAYER_ID)]),
  );
  const stepTriggerKeys = new Map<string, readonly (readonly string[])[]>();
  const stepSemantics = new Map<string, readonly StepSemantic[]>();
  for (const [kana, sequence] of map) {
    stepTriggerKeys.set(kana, sequence.map(() => []));
    stepSemantics.set(kana, sequence.map((step) => ({
      inputRole: 'layer',
      outputKeys: step.map(resolveKeyId),
      triggerKeys: [],
    })));
  }
  // 単打で出るかなをそのキーの刻印にする
  const legends = new Map<string, string>();
  for (const [kana, sequence] of map) {
    if (sequence.length !== 1 || sequence[0].length !== 1) continue;
    const key = sequence[0][0];
    if (!legends.has(key)) legends.set(key, kana);
  }
  legends.set(THUMB_KEY.RT, '空白');
  legends.set(THUMB_KEY.LT, '親指');
  return {
    id,
    name,
    map,
    legends,
    maxCharLength: maxKeyLength(map.keys()),
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions: [{ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' }],
  };
}

/** ローマ字テーブルを付ける。評価時にかなテキストがローマ字へ展開される */
export function withRomaji(layout: Layout, table: Map<string, string>): Layout {
  return { ...layout, romajiTable: table };
}

/**
 * コンボを足す。入力は「その文字を出すキー」で指定する。
 * 物理位置ではなく文字で指すので、同じ定義を別の英字配列にも適用できる。
 */
export function withCombos(
  id: string,
  name: string,
  layout: Layout,
  combos: ComboDefinition[],
): Layout {
  const map = new Map(layout.map);
  const stepLayers = new Map(layout.stepLayers ?? []);
  const stepTriggerKeys = new Map(layout.stepTriggerKeys ?? []);
  const stepSemantics = new Map(layout.stepSemantics ?? []);
  const layerDefinitions = [...(layout.layerDefinitions ?? [])];
  const comboConditions = new Map(layout.comboConditions);
  let hasCombo = layerDefinitions.some((definition) => definition.id === COMBO_LAYER_ID);
  for (const [output, inputs, condition] of combos) {
    const keys = inputs.map((ch) => layout.map.get(ch)?.[0]?.[0]);
    if (keys.some((k) => k === undefined)) continue;
    map.set(output, [keys as string[]]);
    stepLayers.set(output, [COMBO_LAYER_ID]);
    stepTriggerKeys.set(output, [[]]);
    stepSemantics.set(output, [{
      inputRole: 'composition',
      outputKeys: (keys as string[]).map(resolveKeyId),
      triggerKeys: [],
    }]);
    comboConditions.set(output, condition ?? {});
    if (!hasCombo) {
      layerDefinitions.push({ id: COMBO_LAYER_ID, kind: 'combo', label: 'コンボ' });
      hasCombo = true;
    }
  }
  return {
    ...layout,
    id,
    name,
    map,
    maxCharLength: maxKeyLength(map.keys()),
    comboConditions,
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions,
  };
}
