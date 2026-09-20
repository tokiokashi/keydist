import {
  compileFaceSemanticInputs,
  compileSequenceInputAlternative,
  mapInputAlternativePhysicalKeys,
  validateBaseActionRealization,
  validateCanonicalInputMap,
  type CanonicalInputMap,
  type InputAlternative,
  type InputClassification,
  type InputContextRequirement,
  type SemanticInput,
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
  classifications?: readonly InputClassification[],
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
   * logical output → 具体canonical input path群。
   * OR activationをSemanticInput内部へ入れず、合法な物理実現をalternativeとして保持する。
   */
  canonicalInputs: CanonicalInputMap;
  /** 面から作った配列だけが持つ、表示用の元面。自作配列などは省略する */
  faces?: readonly Face[];
  /**
   * mapの見出しの最大文字数。1より大きい場合、入力は最長一致で切り出す
   * （「きゃ」を「き」「ゃ」に分けない）
   */
  maxCharLength?: number;
  /** キーid → そのキーの刻印。表示用 */
  legends: Map<string, string>;
  /** authoring上の既定親指シフトキー。 */
  thumbShiftKey?: string;
  /** 同じshift semanticを成立させられる合法な親指キー集合。 */
  thumbShiftKeys?: readonly string[];
  /** この配列が前提とする非親指のホームキー。省略時は物理形状側の既定値を使う。 */
  homeKeys?: Partial<Record<NonThumb, string>>;
  /**
   * かなテキストをローマ字へ展開してから打つ配列はテーブルを持つ。
   * かな配列は持たない。同じかなテキストを両者に食わせて比較できる。
   */
  romajiTable?: Map<string, string>;
  /**
   * legacy/presentation互換のoutput単位コンボ条件。
   * canonical legalityはInputAlternative.contextRequirementsがauthorityであり、
   * evaluateはこのMapから成立条件を再構成しない。
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

const appendCanonicalAlternative = (
  map: Map<string, InputAlternative[]>,
  output: string,
  alternative: InputAlternative,
): void => {
  const current = map.get(output);
  if (current) current.push(alternative);
  else map.set(output, [alternative]);
};

const cloneCanonicalInputs = (
  inputs: CanonicalInputMap,
): Map<string, InputAlternative[]> =>
  new Map([...inputs].map(([output, alternatives]) => [output, [...alternatives]]));

const mergeContextRequirements = (
  ...groups: readonly (readonly InputContextRequirement[])[]
): InputContextRequirement[] => {
  const byKind = new Map(
    groups.flat().map((requirement) => [requirement.kind, requirement] as const),
  );
  return [...byKind.values()].sort((left, right) =>
    left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0);
};

const sameAlternativeActions = (
  left: InputAlternative,
  right: InputAlternative,
): boolean => {
  const signature = (alternative: InputAlternative) => JSON.stringify({
    actions: alternative.baseRealizations
      .flatMap((realization) => realization.actions)
      .map((action) => action.map(resolveKeyId)),
    contextRequirements: alternative.contextRequirements,
  });
  return signature(left) === signature(right);
};

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
  const canonicalInputs = new Map<string, InputAlternative[]>();
  const stepLayers = new Map<string, readonly string[]>();
  const stepTriggerKeys = new Map<string, readonly (readonly string[])[]>();
  const stepSemantics = new Map<string, readonly StepSemantic[]>();
  const legends = new Map<string, string>();

  const addDirect = (output: string, key: string) => {
    const sequence: Sequence = [[key]];
    appendCanonicalAlternative(
      canonicalInputs,
      output,
      compileSequenceInputAlternative(output, sequence, SINGLE_LAYER_ID),
    );
    if (map.has(output)) return;
    map.set(output, sequence);
    stepLayers.set(output, [SINGLE_LAYER_ID]);
    stepTriggerKeys.set(output, [[]]);
    stepSemantics.set(output, [{
      inputRole: 'layer',
      outputKeys: [key],
      triggerKeys: [],
    }]);
  };

  rows.forEach((row, r) => {
    [...row].forEach((ch, col) => {
      if (ch === ' ') return;
      const key = keyId(r, col);
      addDirect(ch, key);
      legends.set(key, ch);
    });
  });

  legends.set(THUMB_KEY.LT, '親指');
  legends.set(THUMB_KEY.RT, '空白');
  if (thumbs.LT) addDirect(thumbs.LT, THUMB_KEY.LT);
  if (thumbs.RT) addDirect(thumbs.RT, THUMB_KEY.RT);

  validateCanonicalInputMap(canonicalInputs);
  return {
    id,
    name,
    map,
    canonicalInputs,
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
  const canonicalInputs = new Map<string, InputAlternative[]>();

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
      : trigger.length === 0
        ? SINGLE_LAYER_ID
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
        const sequence = expandFace(trigger, face.mode, key);
        const participationView = {
          outputKeys: [resolveKeyId(key)],
          triggerKeys: trigger.map(resolveKeyId),
          ...(face.triggerPersistence === 'hold-capable' && trigger.length > 0
            ? { holdKeys: trigger.map(resolveKeyId) }
            : {}),
        };

        const alternatives = canonicalInputs.get(output) ?? [];
        const sameSemanticIndex = alternatives.findIndex((alternative) =>
          alternative.semanticInputs.length === 1
          && alternative.semanticInputs[0] === semanticInput);

        if (sameSemanticIndex >= 0) {
          const existingAlternative = alternatives[sameSemanticIndex];
          const existing = existingAlternative.baseRealizations[0];
          if (!existing) {
            throw new Error(`面の出力「${output}」のBaseActionRealizationが見つからない`);
          }
          if (!sameActionGrouping(existing.actions, sequence)) {
            throw new Error(
              `同一SemanticInputのreciprocal Faceでaction groupingが一致しない: ${output}`,
            );
          }
          const defaultView = {
            outputKeys: existing.defaultOutputKeys,
            triggerKeys: existing.defaultTriggerKeys ?? [],
            ...(existing.defaultHoldKeys !== undefined
              ? { holdKeys: existing.defaultHoldKeys }
              : {}),
          };
          const alternates = existing.alternateParticipations ?? [];
          if (!sameParticipationView(defaultView, participationView)
            && !alternates.some((view) => sameParticipationView(view, participationView))) {
            const updated = {
              ...existing,
              alternateParticipations: [...alternates, participationView],
            };
            validateBaseActionRealization(updated);
            const updatedAlternatives = [...alternatives];
            updatedAlternatives[sameSemanticIndex] = {
              ...existingAlternative,
              baseRealizations: [updated],
            };
            canonicalInputs.set(output, updatedAlternatives);
          }
          return;
        }

        const baseRealization = {
          input: semanticInput,
          actions: sequence.map((step) => step.map(resolveKeyId)),
          defaultOutputKeys: participationView.outputKeys,
          ...(participationView.triggerKeys.length > 0
            ? { defaultTriggerKeys: participationView.triggerKeys }
            : {}),
          ...(participationView.holdKeys !== undefined
            ? { defaultHoldKeys: participationView.holdKeys }
            : {}),
        };
        validateBaseActionRealization(baseRealization);
        appendCanonicalAlternative(canonicalInputs, output, {
          semanticInputs: [semanticInput],
          baseRealizations: [baseRealization],
          contextRequirements: [],
        });

        // legacy/presentation metadataはauthoring上の先頭pathだけを保持する。
        if (!map.has(output)) {
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
        }
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
    appendCanonicalAlternative(
      canonicalInputs,
      thumbs.LT,
      compileSequenceInputAlternative(thumbs.LT, sequence, SINGLE_LAYER_ID),
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
    appendCanonicalAlternative(
      canonicalInputs,
      thumbs.RT,
      compileSequenceInputAlternative(thumbs.RT, sequence, SINGLE_LAYER_ID),
    );
    stepLayers.set(thumbs.RT, [baseLayerId]);
    stepTriggerKeys.set(thumbs.RT, [[]]);
    stepSemantics.set(thumbs.RT, [{
      inputRole: 'layer',
      outputKeys: [THUMB_KEY.RT],
      triggerKeys: [],
    }]);
  }
  validateCanonicalInputMap(canonicalInputs);
  return {
    id,
    name,
    map,
    canonicalInputs,
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

function sameActionGrouping(
  left: readonly (readonly string[])[],
  right: readonly (readonly string[])[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((step, index) => {
    const l = [...new Set(step.map(resolveKeyId))].sort();
    const r = [...new Set(right[index].map(resolveKeyId))].sort();
    return l.length === r.length && l.every((key, keyIndex) => key === r[keyIndex]);
  });
}

function sameParticipationView(
  left: { outputKeys: readonly string[]; triggerKeys: readonly string[]; holdKeys?: readonly string[] },
  right: { outputKeys: readonly string[]; triggerKeys: readonly string[]; holdKeys?: readonly string[] },
): boolean {
  const same = (a: readonly string[] | undefined, b: readonly string[] | undefined) => {
    const aa = [...new Set((a ?? []).map(resolveKeyId))].sort();
    const bb = [...new Set((b ?? []).map(resolveKeyId))].sort();
    return aa.length === bb.length && aa.every((key, index) => key === bb[index]);
  };
  return same(left.outputKeys, right.outputKeys)
    && same(left.triggerKeys, right.triggerKeys)
    && same(left.holdKeys, right.holdKeys);
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
export type KanaDefinition =
  | Record<string, string[][]>
  | readonly (readonly [string, string[][]])[];

export function fromKana(id: string, name: string, def: KanaDefinition): Layout {
  const entries: readonly (readonly [string, string[][]])[] =
    Array.isArray(def) ? def : Object.entries(def);
  const map = new Map<string, Sequence>();
  const canonicalInputs = new Map<string, InputAlternative[]>();
  const stepLayers = new Map<string, readonly string[]>();
  const stepTriggerKeys = new Map<string, readonly (readonly string[])[]>();
  const stepSemantics = new Map<string, readonly StepSemantic[]>();

  for (const [output, sequence] of entries) {
    appendCanonicalAlternative(
      canonicalInputs,
      output,
      compileSequenceInputAlternative(output, sequence, SINGLE_LAYER_ID),
    );
    if (map.has(output)) continue;
    map.set(output, sequence);
    stepLayers.set(output, sequence.map(() => SINGLE_LAYER_ID));
    stepTriggerKeys.set(output, sequence.map(() => []));
    stepSemantics.set(output, sequence.map((step) => ({
      inputRole: 'layer',
      outputKeys: step.map(resolveKeyId),
      triggerKeys: [],
    })));
  }

  const legends = new Map<string, string>();
  for (const [kana, sequence] of map) {
    if (sequence.length !== 1 || sequence[0].length !== 1) continue;
    const key = sequence[0][0];
    if (!legends.has(key)) legends.set(key, kana);
  }
  legends.set(THUMB_KEY.RT, '空白');
  legends.set(THUMB_KEY.LT, '親指');

  validateCanonicalInputMap(canonicalInputs);
  return {
    id,
    name,
    map,
    canonicalInputs,
    legends,
    maxCharLength: maxKeyLength(map.keys()),
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions: [{ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' }],
  };
}

/**
 * 既存のauthoring default thumb shift pathから、同じsemanticを成立させる合法な
 * physical thumb alternativeをcanonical pathとして派生する。
 */
export function withThumbShiftAlternatives(
  layout: Layout,
  defaultKey: string,
  legalKeys: readonly string[],
): Layout {
  const source = resolveKeyId(defaultKey);
  const legal = [...new Set(legalKeys.map(resolveKeyId))];
  if (!legal.includes(source)) {
    throw new Error('thumb shift alternativesにはdefault keyを含める必要がある');
  }

  const canonicalInputs = cloneCanonicalInputs(layout.canonicalInputs);
  for (const [output, alternatives] of canonicalInputs) {
    const next = [...alternatives];
    for (const alternative of alternatives) {
      const usesSourceAsTrigger = alternative.baseRealizations.some((realization) =>
        (realization.defaultTriggerKeys ?? []).map(resolveKeyId).includes(source)
        || (realization.alternateParticipations ?? []).some((view) =>
          view.triggerKeys.map(resolveKeyId).includes(source)));
      if (!usesSourceAsTrigger) continue;

      for (const target of legal) {
        if (target === source) continue;
        const mapped = mapInputAlternativePhysicalKeys(
          alternative,
          (key) => resolveKeyId(key) === source ? target : resolveKeyId(key),
        );
        if (!next.some((candidate) => sameAlternativeActions(candidate, mapped))) {
          next.push(mapped);
        }
      }
    }
    canonicalInputs.set(output, next);
  }

  validateCanonicalInputMap(canonicalInputs);
  return {
    ...layout,
    canonicalInputs,
    thumbShiftKey: source,
    thumbShiftKeys: legal,
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
  const markAlternatives = layout.canonicalInputs.get(mark);
  if (!markSequence || !markAlternatives) {
    throw new Error(`${context}の合成記号「${mark}」が未定義`);
  }

  const map = new Map(layout.map);
  const canonicalInputs = cloneCanonicalInputs(layout.canonicalInputs);
  const stepLayers = new Map(layout.stepLayers ?? []);
  const stepTriggerKeys = new Map(layout.stepTriggerKeys ?? []);
  const stepSemantics = new Map(layout.stepSemantics ?? []);

  for (const [source, output] of Object.entries(entries)) {
    const sourceSequence = layout.map.get(source);
    const sourceAlternatives = layout.canonicalInputs.get(source);
    if (!sourceSequence || !sourceAlternatives) {
      throw new Error(`${context}の元出力「${source}」が未定義`);
    }

    const generated = sourceAlternatives.flatMap((sourceAlternative) =>
      markAlternatives.map((markAlternative) => ({
        semanticInputs: [
          ...sourceAlternative.semanticInputs,
          ...markAlternative.semanticInputs,
        ],
        baseRealizations: [
          ...sourceAlternative.baseRealizations,
          ...markAlternative.baseRealizations,
        ],
        contextRequirements: mergeContextRequirements(
          sourceAlternative.contextRequirements,
          markAlternative.contextRequirements,
        ),
      })));
    for (const alternative of generated) {
      appendCanonicalAlternative(canonicalInputs, output, alternative);
    }

    // legacy/presentation metadataはauthoring上の先頭pathだけを保持する。
    if (map.has(output)) continue;

    const sequence: Sequence = [
      ...sourceSequence.map((step) => [...step]),
      ...markSequence.map((step) => [...step]),
    ];
    map.set(output, sequence);

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

  validateCanonicalInputMap(canonicalInputs);
  return {
    ...layout,
    map,
    canonicalInputs,
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
  const canonicalInputs = cloneCanonicalInputs(layout.canonicalInputs);
  const stepLayers = new Map(layout.stepLayers ?? []);
  const stepTriggerKeys = new Map(layout.stepTriggerKeys ?? []);
  const stepSemantics = new Map(layout.stepSemantics ?? []);
  const layerDefinitions = [...(layout.layerDefinitions ?? [])];
  const comboConditions = new Map(layout.comboConditions);
  const resolvedComboDefinitions: ResolvedComboDefinition[] = [...(layout.resolvedComboDefinitions ?? [])];
  let hasCombo = layerDefinitions.some((definition) => definition.id === COMBO_LAYER_ID);
  for (const [output, inputs, condition, presentation, classifications = []] of combos) {
    const keyChoices = inputs.map((input) =>
      (layout.canonicalInputs.get(input) ?? []).flatMap((alternative) => {
        if (alternative.baseRealizations.length !== 1) return [];
        const realization = alternative.baseRealizations[0];
        if (realization.actions.length !== 1 || realization.actions[0].length !== 1) return [];
        return [{
          key: resolveKeyId(realization.actions[0][0]),
          contextRequirements: alternative.contextRequirements,
        }];
      }));
    if (keyChoices.some((choices) => choices.length === 0)) continue;

    const combinations = keyChoices.reduce<
      { keys: string[]; contextRequirements: InputContextRequirement[] }[]
    >(
      (acc, choices) => acc.flatMap((prefix) =>
        choices.map((choice) => ({
          keys: [...prefix.keys, choice.key],
          contextRequirements: mergeContextRequirements(
            prefix.contextRequirements,
            choice.contextRequirements,
          ),
        }))),
      [{ keys: [], contextRequirements: [] }],
    );
    const uniqueCombinations = [...new Map(
      combinations.map((combination) => [
        [
          combination.keys.join('\u0000'),
          combination.contextRequirements.map((requirement) => requirement.kind).join('\u0001'),
        ].join('\u0002'),
        combination,
      ] as const),
    ).values()];
    const keys = uniqueCombinations[0].keys;
    const resolvedKeys = keys.map(resolveKeyId);
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
    const comboContextRequirements: readonly InputContextRequirement[] =
      condition?.youonOnly ? [{ kind: 'youon-only' }] : [];
    const generatedAlternatives = uniqueCombinations.map((combination) =>
      compileSequenceInputAlternative(
        output,
        [combination.keys],
        COMBO_LAYER_ID,
        ['composition', ...classifications],
        mergeContextRequirements(
          combination.contextRequirements,
          comboContextRequirements,
        ),
      ));
    for (const alternative of generatedAlternatives) {
      appendCanonicalAlternative(canonicalInputs, output, alternative);
    }

    // legacy/presentation metadataは既存defaultを上書きしない。
    if (!map.has(output)) {
      const sequence: Sequence = [keys];
      map.set(output, sequence);
      stepLayers.set(output, [COMBO_LAYER_ID]);
      stepTriggerKeys.set(output, [[]]);
      stepSemantics.set(output, [{
        inputRole: 'composition',
        outputKeys: keys.map(resolveKeyId),
        triggerKeys: [],
      }]);
      comboConditions.set(output, condition ?? {});
    }
    if (!hasCombo) {
      layerDefinitions.push({ id: COMBO_LAYER_ID, kind: 'combo', label: 'コンボ' });
      hasCombo = true;
    }
  }
  validateCanonicalInputMap(canonicalInputs);
  return {
    ...layout,
    id,
    name,
    map,
    canonicalInputs,
    maxCharLength: maxKeyLength(map.keys()),
    comboConditions,
    resolvedComboDefinitions,
    stepLayers,
    stepTriggerKeys,
    stepSemantics,
    layerDefinitions,
  };
}
