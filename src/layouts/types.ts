import {
  compileFaceSemanticInputs,
  compileSequenceInputArtifacts,
  type BaseActionRealizationSequence,
  type SemanticInput,
  type SemanticInputSequence,
} from '../core/semantic-input/index.ts';
import { keyId, QWERTY_LEGEND, resolveKeyId, THUMB_KEY, type NonThumb } from '../geometry.ts';
import { groupFacesIntoLayers } from '../layers.ts';

/** 1ステップで同時に押すキーの集合。キーはQWERTY刻印で指す（`thumb-r` `thumb-l` は親指キー）。`space` も入力互換で受け付ける */
export type Step = string[];

/** 1文字を打つための打鍵ステップ列。順次打鍵はステップを並べる */
export type Sequence = Step[];

/** 面の発火方式。triggerと入力キーを同時に押すか、前後に分けるかを表す。 */
export type FaceMode = 'prefix' | 'suffix' | 'simultaneous';

/** trigger と出力キーの順序制約。Stroke分割を意味せず、同時押し表現にも付与できる。 */
export type TriggerOrder = 'prefix' | 'suffix';

/** Face が担う入力意味。表示上のlayer分類とは独立したsemantic情報。 */
export type InputRole = 'layer' | 'modifier' | 'composition';

/** trigger を複数の対象入力へ保持して作用させられるかという capability。 */
export type TriggerPersistence = 'single' | 'hold-capable';

export type HoldPhase = 'start' | 'continue' | 'end';

/**
 * 1ステップへ展開した後のsemantic情報。
 * outputKeys と triggerKeys は重なってよく、同一キーが output + trigger の複合roleを持てる。
 */
export interface StepSemantic {
  inputRole: InputRole;
  triggerPersistence?: TriggerPersistence;
  outputKeys: readonly string[];
  /** このstepで新たに物理操作するtrigger。 */
  triggerKeys: readonly string[];
  /**
   * このstepが属する対象入力を成立させるtrigger集合。
   * prefix / suffix のoutput stepでも元Faceのtrigger集合を保持し、
   * hold継続判定をstep順序やlayer idから推測しないために使う。
   */
  associatedTriggerKeys?: readonly string[];
  /**
   * associatedTriggerKeysが表すtrigger集合の持続能力。
   * triggerを物理操作しないprefix / suffix output stepでもFace capabilityを保持する。
   */
  associatedTriggerPersistence?: TriggerPersistence;
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
  /** triggerの持続能力。FaceModeとは独立し、triggerを持つcanonical Faceでは明示する。 */
  triggerPersistence?: TriggerPersistence;
  /**
   * trigger が出力キーより先/後である必要がある場合の順序制約。
   * mode='prefix' / 'suffix' は暗黙に同じ制約を持つ。simultaneousのまま
   * 「先押しして重ねる」入力を表す場合だけ明示する。
   */
  triggerOrder?: TriggerOrder;
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

export interface ComboPresentation {
  /** UIでまとめる規則群。解析には使わない。 */
  group?: string;
  /**
   * 配列図で共通triggerとして畳む論理入力。
   * 残りがちょうど1キーの時だけ1面へ畳める。
   */
  foldTriggerInputs?: readonly string[];
}

/** コンボの出力、入力キー、発火条件、表示用属性。 */
export type ComboDefinition = [
  output: string,
  inputs: string[],
  condition?: ComboCondition,
  presentation?: ComboPresentation,
];

/** withCombosで解決済みのコンボ。表示・検証で元定義と物理キー集合を参照する。 */
export interface ResolvedComboDefinition {
  output: string;
  inputs: readonly string[];
  keys: readonly string[];
  condition?: ComboCondition;
  group?: string;
  foldTriggerInputs?: readonly string[];
  foldTriggerKeys?: readonly string[];
  foldTargetKey?: string;
}

export interface Layout {
  id: string;
  name: string;
  /** 文字 → 打鍵ステップ列 */
  map: Map<string, Sequence>;
  /**
   * logical output → canonical SemanticInput列。
   * migration中のみoptionalで、consumer cutover後にrequired化する。
   */
  semanticInputSequences?: ReadonlyMap<string, SemanticInputSequence>;
  /**
   * logical output → authoring source由来のdefault/base action grouping。
   * Requirementから推測せず、ActionRealizationPolicy入力として別管理する。
   */
  baseActionRealizations?: ReadonlyMap<string, BaseActionRealizationSequence>;
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
  /** withCombos由来のコンボ定義。物理キーまで解決済みで、配列図等の表示にも使う。 */
  resolvedComboDefinitions?: readonly ResolvedComboDefinition[];
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
  const semanticInputSequences = new Map<string, SemanticInputSequence>();
  const baseActionRealizations = new Map<string, BaseActionRealizationSequence>();
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
        const sequence: Sequence = [[id]];
        map.set(ch, sequence);
        const artifacts = compileSequenceInputArtifacts(ch, sequence, SINGLE_LAYER_ID);
        semanticInputSequences.set(ch, artifacts.semanticInputs);
        baseActionRealizations.set(ch, artifacts.baseActionRealizations);
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
    const sequence: Sequence = [[THUMB_KEY.LT]];
    map.set(thumbs.LT, sequence);
    const artifacts = compileSequenceInputArtifacts(thumbs.LT, sequence, SINGLE_LAYER_ID);
    semanticInputSequences.set(thumbs.LT, artifacts.semanticInputs);
    baseActionRealizations.set(thumbs.LT, artifacts.baseActionRealizations);
    stepLayers.set(thumbs.LT, [SINGLE_LAYER_ID]);
    stepTriggerKeys.set(thumbs.LT, [[]]);
    stepSemantics.set(thumbs.LT, [{
      inputRole: 'layer',
      outputKeys: [THUMB_KEY.LT],
      triggerKeys: [],
    }]);
  }
  if (thumbs.RT) {
    const sequence: Sequence = [[THUMB_KEY.RT]];
    map.set(thumbs.RT, sequence);
    const artifacts = compileSequenceInputArtifacts(thumbs.RT, sequence, SINGLE_LAYER_ID);
    semanticInputSequences.set(thumbs.RT, artifacts.semanticInputs);
    baseActionRealizations.set(thumbs.RT, artifacts.baseActionRealizations);
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
    semanticInputSequences,
    baseActionRealizations,
    legends,
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions: [{ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' }],
  };
}

function faceHasOutput(face: Face): boolean {
  return face.rows.some((row) => {
    const cells = typeof row === 'string' ? [...row] : [...row];
    return cells.some((output) => output !== '' && output !== ' ');
  });
}

/** 面の集合を、評価器が使うかな → 打鍵ステップ列へ展開する。 */
export function fromFaces(
  id: string,
  name: string,
  faces: readonly Face[],
  thumbs: { LT?: string; RT?: string } = {},
): Layout {
  // legacy fallbackをFace compilerの外で解決し、canonical compiler自体には持ち込まない。
  const canonicalFaces: Face[] = faces.map((face) => ({
    ...face,
    inputRole: face.inputRole ?? face.role ?? (face.trigger.length > 1 ? 'composition' : 'layer'),
  }));
  const semanticInputs = compileFaceSemanticInputs(canonicalFaces);
  const semanticByMembership = new Map<string, SemanticInput>();
  for (const input of semanticInputs) {
    for (const membership of input.faceMemberships) {
      semanticByMembership.set(
        `${membership.faceIndex}\u0000${membership.cellKey}`,
        input,
      );
    }
  }

  // 定義時にレイヤーの宣言を検証し、表示時まで不正な組み合わせを遅延させない。
  groupFacesIntoLayers(faces);
  const map = new Map<string, Sequence>();
  const stepLayers = new Map<string, readonly string[]>();
  const stepTriggerKeys = new Map<string, readonly (readonly string[])[]>();
  const stepSemantics = new Map<string, readonly StepSemantic[]>();
  const legends = new Map<string, string>();
  const layerDefinitions: LayerDefinition[] = [];
  const faceLayerIds = new Map<Face, string>();
  const outputSemanticInputs = new Map<string, SemanticInput>();
  const semanticInputSequences = new Map<string, SemanticInputSequence>();
  const baseActionRealizations = new Map<string, BaseActionRealizationSequence>();

  const addDefinition = (definition: LayerDefinition) => {
    if (!layerDefinitions.some((entry) => entry.id === definition.id)) {
      layerDefinitions.push(definition);
    }
  };

  for (const [faceIndex, face] of faces.entries()) {
    const trigger = [...new Set(face.trigger)];
    if (trigger.length > 0 && faceHasOutput(face) && face.triggerPersistence === undefined) {
      throw new Error(
        `triggerを持つFaceはtriggerPersistenceを明示する必要がある（face:${faceIndex}）`,
      );
    }
    const inputRole = face.inputRole ?? face.role ?? (trigger.length > 1 ? 'composition' : 'layer');
    const isCombo = trigger.length > 1 || inputRole === 'composition';
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

        const key = keyId(r, c);
        const semanticInput = semanticByMembership.get(
          `${faceIndex}\u0000${resolveKeyId(key)}`,
        );
        if (!semanticInput) {
          throw new Error(`Face compilerのmembershipが見つからない（face:${faceIndex}, key:${key}）`);
        }
        if (map.has(output)) {
          if (outputSemanticInputs.get(output) === semanticInput) return;
          throw new Error(`面の出力「${output}」が重複している`);
        }
        outputSemanticInputs.set(output, semanticInput);
        semanticInputSequences.set(output, [semanticInput]);

        const sequence = expandFace(trigger, face.mode, key);
        baseActionRealizations.set(output, [{
          input: semanticInput,
          actions: sequence.map((step) => step.map(resolveKeyId)),
        }]);
        map.set(output, sequence);
        stepLayers.set(output, sequence.map(() => layerId));
        stepTriggerKeys.set(output, expandFaceTriggerKeys(trigger, face.mode));
        stepSemantics.set(output, expandFaceSemantics(
          trigger,
          face.mode,
          key,
          inputRole,
          trigger.length > 0 ? face.triggerPersistence : undefined,
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
    const sequence: Sequence = [[THUMB_KEY.LT]];
    map.set(thumbs.LT, sequence);
    semanticInputSequences.set(
      thumbs.LT,
      compileSequenceSemanticInputs(thumbs.LT, sequence, SINGLE_LAYER_ID),
    );
    stepLayers.set(thumbs.LT, [baseLayerId]);
    stepTriggerKeys.set(thumbs.LT, [[]]);
    stepSemantics.set(thumbs.LT, [{
      inputRole: 'layer',
      outputKeys: [THUMB_KEY.LT],
      triggerKeys: [],
    }]);
  }
  if (thumbs.RT) {
    const sequence: Sequence = [[THUMB_KEY.RT]];
    map.set(thumbs.RT, sequence);
    semanticInputSequences.set(
      thumbs.RT,
      compileSequenceSemanticInputs(thumbs.RT, sequence, SINGLE_LAYER_ID),
    );
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
    semanticInputSequences,
    baseActionRealizations,
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
  if (mode === 'simultaneous') return [[...new Set([...trigger, key])]];
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
  triggerPersistence: TriggerPersistence | undefined,
): readonly StepSemantic[] {
  const triggerKeys = [...trigger];
  const associatedTriggerKeys = [...trigger];
  const output = [key];
  if (trigger.length === 0) {
    return [{
      inputRole,
      outputKeys: output,
      triggerKeys: [],
      associatedTriggerKeys: [],
    }];
  }
  if (mode === 'simultaneous') {
    return [{
      inputRole,
      triggerPersistence,
      outputKeys: output,
      triggerKeys,
      associatedTriggerKeys,
      associatedTriggerPersistence: triggerPersistence,
    }];
  }
  if (mode === 'prefix') {
    return [
      {
        inputRole,
        triggerPersistence,
        outputKeys: [],
        triggerKeys,
        associatedTriggerKeys,
        associatedTriggerPersistence: triggerPersistence,
      },
      {
        inputRole,
        outputKeys: output,
        triggerKeys: [],
        associatedTriggerKeys,
        associatedTriggerPersistence: triggerPersistence,
      },
    ];
  }
  return [
    {
      inputRole,
      outputKeys: output,
      triggerKeys: [],
      associatedTriggerKeys,
      associatedTriggerPersistence: triggerPersistence,
    },
    {
      inputRole,
      triggerPersistence,
      outputKeys: [],
      triggerKeys,
      associatedTriggerKeys,
      associatedTriggerPersistence: triggerPersistence,
    },
  ];
}

/** かな → 打鍵ステップ列を直接書いた配列（薙刀式など） */
export function fromKana(id: string, name: string, def: Record<string, string[][]>): Layout {
  const map = new Map<string, Sequence>(Object.entries(def));
  const semanticInputSequences = new Map<string, SemanticInputSequence>();
  const baseActionRealizations = new Map<string, BaseActionRealizationSequence>();
  for (const [output, sequence] of map) {
    const artifacts = compileSequenceInputArtifacts(output, sequence, SINGLE_LAYER_ID);
    semanticInputSequences.set(output, artifacts.semanticInputs);
    baseActionRealizations.set(output, artifacts.baseActionRealizations);
  }
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
    semanticInputSequences,
    baseActionRealizations,
    legends,
    maxCharLength: maxKeyLength(map.keys()),
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions: [{ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' }],
  };
}

/**
 * 既存outputと合成記号の入力列を連結し、新しいlogical outputを追加する。
 * canonical側は既存SemanticInput列を再利用し、Requirement等を再推測しない。
 */
export function withComposedOutputs(
  layout: Layout,
  entries: Readonly<Record<string, string>>,
  mark: string,
  context = '合成出力',
): Layout {
  const markSequence = layout.map.get(mark);
  const markSemanticInputs = layout.semanticInputSequences?.get(mark);
  const markBaseRealizations = layout.baseActionRealizations?.get(mark);
  if (!markSequence || !markSemanticInputs || !markBaseRealizations) {
    throw new Error(`${context}の合成記号「${mark}」が未定義`);
  }

  const map = new Map(layout.map);
  const semanticInputSequences = new Map(layout.semanticInputSequences ?? []);
  const baseActionRealizations = new Map(layout.baseActionRealizations ?? []);
  const stepLayers = new Map(layout.stepLayers ?? []);
  const stepTriggerKeys = new Map(layout.stepTriggerKeys ?? []);
  const stepSemantics = new Map(layout.stepSemantics ?? []);

  for (const [source, output] of Object.entries(entries)) {
    const sourceSequence = layout.map.get(source);
    const sourceSemanticInputs = layout.semanticInputSequences?.get(source);
    const sourceBaseRealizations = layout.baseActionRealizations?.get(source);
    if (!sourceSequence || !sourceSemanticInputs || !sourceBaseRealizations) {
      throw new Error(`${context}の元出力「${source}」が未定義`);
    }
    if (map.has(output)) {
      throw new Error(`${context}「${output}」が重複している`);
    }

    const sequence: Sequence = [
      ...sourceSequence.map((step) => [...step]),
      ...markSequence.map((step) => [...step]),
    ];
    map.set(output, sequence);
    semanticInputSequences.set(output, [
      ...sourceSemanticInputs,
      ...markSemanticInputs,
    ]);
    baseActionRealizations.set(output, [
      ...sourceBaseRealizations,
      ...markBaseRealizations,
    ]);

    const sourceLayers = layout.stepLayers?.get(source)
      ?? sourceSequence.map(() => SINGLE_LAYER_ID);
    const markLayers = layout.stepLayers?.get(mark)
      ?? markSequence.map(() => SINGLE_LAYER_ID);
    stepLayers.set(output, [...sourceLayers, ...markLayers]);

    const sourceTriggers = layout.stepTriggerKeys?.get(source)
      ?? sourceSequence.map(() => []);
    const markTriggers = layout.stepTriggerKeys?.get(mark)
      ?? markSequence.map(() => []);
    stepTriggerKeys.set(output, [...sourceTriggers, ...markTriggers]);

    const sourceSemantics = layout.stepSemantics?.get(source);
    const markSemantics = layout.stepSemantics?.get(mark);
    if (!sourceSemantics || !markSemantics) {
      throw new Error(`${context}semantic「${source}」「${mark}」が未定義`);
    }
    stepSemantics.set(output, [...sourceSemantics, ...markSemantics]);
  }

  return {
    ...layout,
    map,
    semanticInputSequences,
    baseActionRealizations,
    maxCharLength: maxKeyLength(map.keys()),
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
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
  const semanticInputSequences = new Map(layout.semanticInputSequences ?? []);
  const baseActionRealizations = new Map(layout.baseActionRealizations ?? []);
  const stepLayers = new Map(layout.stepLayers ?? []);
  const stepTriggerKeys = new Map(layout.stepTriggerKeys ?? []);
  const stepSemantics = new Map(layout.stepSemantics ?? []);
  const layerDefinitions = [...(layout.layerDefinitions ?? [])];
  const comboConditions = new Map(layout.comboConditions);
  const resolvedComboDefinitions: ResolvedComboDefinition[] = [...(layout.resolvedComboDefinitions ?? [])];
  let hasCombo = layerDefinitions.some((definition) => definition.id === COMBO_LAYER_ID);
  for (const [output, inputs, condition, presentation] of combos) {
    const keys = inputs.map((ch) => layout.map.get(ch)?.[0]?.[0]);
    if (keys.some((k) => k === undefined)) continue;
    const resolvedKeys = (keys as string[]).map(resolveKeyId);
    const foldTriggerInputs = presentation?.foldTriggerInputs;
    const foldTriggerKeys = foldTriggerInputs?.map((ch) => layout.map.get(ch)?.[0]?.[0])
      .filter((key): key is string => key !== undefined)
      .map(resolveKeyId);
    const foldTriggerSet = new Set(foldTriggerKeys ?? []);
    const foldTargets = foldTriggerKeys !== undefined
      && foldTriggerInputs !== undefined
      && foldTriggerKeys.length === foldTriggerInputs.length
      ? resolvedKeys.filter((key) => !foldTriggerSet.has(key))
      : [];
    resolvedComboDefinitions.push({
      output,
      inputs: [...inputs],
      keys: resolvedKeys,
      ...(condition === undefined ? {} : { condition }),
      ...(presentation?.group === undefined ? {} : { group: presentation.group }),
      ...(foldTriggerInputs === undefined ? {} : { foldTriggerInputs: [...foldTriggerInputs] }),
      ...(foldTriggerKeys === undefined ? {} : { foldTriggerKeys }),
      ...(foldTargets.length === 1 ? { foldTargetKey: foldTargets[0] } : {}),
    });
    const sequence: Sequence = [keys as string[]];
    map.set(output, sequence);
    const artifacts = compileSequenceInputArtifacts(output, sequence, COMBO_LAYER_ID);
    semanticInputSequences.set(output, artifacts.semanticInputs);
    baseActionRealizations.set(output, artifacts.baseActionRealizations);
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
    semanticInputSequences,
    baseActionRealizations,
    maxCharLength: maxKeyLength(map.keys()),
    comboConditions,
    resolvedComboDefinitions,
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions,
  };
}
