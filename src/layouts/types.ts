import {
  canonicalInputAlternativeIdentity,
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
import { validateFaceAuthoring } from './face-authoring-validation.ts';

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
 * 面の1行。文字列なら1文字ずつ、配列ならセルごとの文字列として読む。
 * 配列形式は「きゃ」のような複数文字の見出しを1セルに置くために使う。
 */
export type FaceRow = string | readonly string[];

/** triggerで発火するキー面。rowsはQWERTY刻印の4行に対応する。 */
export type PresentationTriggerChord = readonly [string, ...string[]];
export type PresentationTriggerAlternatives = readonly [
  PresentationTriggerChord,
  ...PresentationTriggerChord[],
];

export interface Face {
  trigger: readonly string[];
  mode: FaceMode;
  rows: readonly FaceRow[];
  /** 同じ値を持つ単一キー面は1レイヤーへ畳む。省略時はその面が単独で1レイヤー */
  layer?: string;
  /** 面の表示分類。既存UI互換用。省略時はlayer。canonical semanticには使わない。 */
  role?: 'layer' | 'modifier';
  /** authoring時に明示する入力意味。fromFacesは値を推測しない。 */
  inputRole?: InputRole;
  /** triggerの持続能力。FaceModeとは独立し、triggerを持つcanonical Faceでは明示する。 */
  triggerPersistence?: TriggerPersistence;
  /**
   * modifier inputで各trigger keyが担うlogical semantic group。
   * keyはFace.trigger内のauthoring key。複数triggerが異なるgroupを同時に要求できる。
   */
  modifierGroups?: Readonly<Record<string, string>>;
  /**
   * trigger が出力キーより先/後である必要がある場合の順序制約。
   * mode='prefix' / 'suffix' は暗黙に同じ制約を持つ。simultaneousのまま
   * 「先押しして重ねる」入力を表す場合だけ明示する。
   */
  triggerOrder?: TriggerOrder;
  /**
   * semantic activationを追加せず、このFace上にも表示する既存入力のセル。
   * key -> output。compilerは同じphysical operation/outputのSemanticInputが
   * rows側に既に存在することを要求し、faceMembershipだけを追加する。
   */
  presentationCells?: Readonly<Record<string, string>>;
  /**
   * triggerのsemantic activationを変えず、presentation上の成立形だけを明示する。
   * 外側配列はOR alternative、内側配列は1つのchord。
   * 明示時は外側・内側ともnon-empty。省略時はFace.trigger全体を1 chordとして表示する。
   */
  presentationTriggerAlternatives?: PresentationTriggerAlternatives;
  /** trigger集合の表示文言。physical key集合から導出不能な表記だけ明示する。 */
  presentationTriggerText?: string;
  /** 入力方式・層のpresentation-only名称。semantic classificationには使わない。composition Faceでは指定不可。 */
  presentationLabel?: string;
}

export type LayerKind = 'layer' | 'combo';
export type LayerPresentationRole = 'layer' | 'modifier';

/** 打鍵の帰属先。面を持たない配列も単打という暗黙の層を持つ。 */
export interface LayerDefinition {
  id: string;
  kind: LayerKind;
  label: string;
  /** aggregation単位のpresentation-only区分。Face.roleはconstructorでここへcompileする。 */
  presentationRole?: LayerPresentationRole;
  /** aggregation titleに添えるpresentation-onlyの入力方式表示。 */
  presentationModeLabel?: string;
}

export interface CompactLayerViewPresentation {
  /** コンパクト表示で個別に残すpresentation layer ID。指定順が表示順になる。 */
  keepLayerIds: readonly string[];
  /** keepLayerIds以外のlayerを合算する先。keepLayerIds内に含める。 */
  mergeIntoLayerId: string;
  /** 合算先タイトルへ付ける表示用suffix。 */
  mergedTitleSuffix: string;
  /** 表示切替UIの見出し。 */
  controlLabel: string;
  /** compact側のボタン文言。 */
  compactLabel: string;
  /** detail側のボタン文言。 */
  detailLabel: string;
}

export interface LayerViewPresentation {
  /** 複数layerを明示した代表layerへ畳むpresentation-only policy。 */
  compact?: CompactLayerViewPresentation;
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
  /** authoring defaultとして表示に使う先頭physical path。 */
  keys: readonly string[];
  /** 同じlogical comboを成立させる全physical path。presentation provenance用。 */
  keyVariants?: readonly (readonly string[])[];
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
  /** withCombos由来のコンボ定義。物理キーまで解決済みで、配列図等の表示にも使う。 */
  resolvedComboDefinitions?: readonly ResolvedComboDefinition[];
  /** 層・コンボの表示順と種別。 */
  layerDefinitions?: readonly LayerDefinition[];
  /** 面から展開した配列で、各面がどのpresentation layerへ属するかをUIが引くための表 */
  faceLayerIds?: ReadonlyMap<Face, string>;
  /** layer表示だけに使うLayout-level presentation metadata。semantic評価には使わない。 */
  layerViewPresentation?: LayerViewPresentation;
}

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

const sameCanonicalAlternative = (
  left: InputAlternative,
  right: InputAlternative,
): boolean =>
  canonicalInputAlternativeIdentity(left) === canonicalInputAlternativeIdentity(right);


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
  const semanticInputs = compileFaceSemanticInputs(faces);
  const semanticByMembership = new Map<string, SemanticInput>();
  for (const input of semanticInputs) {
    for (const membership of input.faceMemberships) {
      semanticByMembership.set(
        `${membership.faceIndex}\u0000${membership.cellKey}`,
        input,
      );
    }
  }

  // 定義時にFace authoring invariantを検証し、consumerまで不正を遅延させない。
  validateFaceAuthoring(faces);
  const map = new Map<string, Sequence>();
  const legends = new Map<string, string>();
  const layerDefinitions: LayerDefinition[] = [];
  const faceLayerIds = new Map<Face, string>();
  const canonicalInputs = new Map<string, InputAlternative[]>();

  const explicitLayerLabels = new Map<string, string>();
  const addDefinition = (definition: LayerDefinition, explicitLabel?: string) => {
    const index = layerDefinitions.findIndex((entry) => entry.id === definition.id);
    if (index < 0) {
      layerDefinitions.push(definition);
      if (explicitLabel !== undefined) explicitLayerLabels.set(definition.id, explicitLabel);
      return;
    }

    const existing = layerDefinitions[index];
    if (existing.kind !== definition.kind) {
      throw new Error(`aggregation「${definition.id}」のkindが競合している`);
    }

    let merged = existing;
    if (
      existing.presentationRole !== undefined
      && definition.presentationRole !== undefined
      && existing.presentationRole !== definition.presentationRole
    ) {
      throw new Error(
        `aggregation「${definition.id}」のpresentation roleが競合している: `
        + `${existing.presentationRole} / ${definition.presentationRole}`,
      );
    }
    if (existing.presentationRole === undefined && definition.presentationRole !== undefined) {
      merged = { ...merged, presentationRole: definition.presentationRole };
    }

    if (
      existing.presentationModeLabel !== undefined
      && definition.presentationModeLabel !== undefined
      && existing.presentationModeLabel !== definition.presentationModeLabel
    ) {
      throw new Error(
        `aggregation「${definition.id}」のpresentation modeが競合している: `
        + `${existing.presentationModeLabel} / ${definition.presentationModeLabel}`,
      );
    }
    if (
      existing.presentationModeLabel === undefined
      && definition.presentationModeLabel !== undefined
    ) {
      merged = { ...merged, presentationModeLabel: definition.presentationModeLabel };
    }

    const previousExplicit = explicitLayerLabels.get(definition.id);
    if (explicitLabel !== undefined) {
      if (previousExplicit !== undefined && previousExplicit !== explicitLabel) {
        throw new Error(
          `aggregation「${definition.id}」のpresentationLabelが競合している: ${previousExplicit} / ${explicitLabel}`,
        );
      }
      if (previousExplicit === undefined) {
        explicitLayerLabels.set(definition.id, explicitLabel);
        merged = { ...merged, label: explicitLabel };
      }
    }

    layerDefinitions[index] = merged;
  };

  for (const [faceIndex, face] of faces.entries()) {
    const trigger = [...new Set(face.trigger)];
    if (trigger.length > 0 && faceHasOutput(face) && face.triggerPersistence === undefined) {
      throw new Error(
        `triggerを持つFaceはtriggerPersistenceを明示する必要がある（face:${faceIndex}）`,
      );
    }
    const isCombo = face.inputRole === 'composition';
    if (isCombo && face.presentationLabel !== undefined) {
      throw new Error(
        `composition FaceではpresentationLabelを指定できない（face:${faceIndex}）`,
      );
    }
    const layerId = isCombo
      ? COMBO_LAYER_ID
      : trigger.length === 0
        ? SINGLE_LAYER_ID
        : face.layer === undefined ? `face:${faceIndex}` : `layer:${face.layer}`;
    faceLayerIds.set(face, layerId);
    const presentationRole: LayerPresentationRole | undefined = isCombo
      ? undefined
      : face.role === 'modifier' ? 'modifier' : 'layer';
    const presentationModeLabel = trigger.length === 0 || isCombo
      ? undefined
      : face.mode === 'simultaneous' ? '同時' : face.mode === 'prefix' ? '前置' : '後置';
    addDefinition({
      id: layerId,
      kind: isCombo ? 'combo' : 'layer',
      label: isCombo
        ? 'コンボ'
        : face.presentationLabel ?? face.layer ?? (trigger.length === 0 ? '単打' : `面 ${faceIndex + 1}`),
      ...(presentationRole === undefined ? {} : { presentationRole }),
      ...(presentationModeLabel === undefined ? {} : { presentationModeLabel }),
    }, isCombo ? undefined : face.presentationLabel);
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
          origin: 'face',
        });

        // legacy/presentation mapはauthoring上の先頭pathだけを保持する。
        if (!map.has(output)) map.set(output, sequence);
        // 刻印は単打面の1文字だけを表示する。シフト面の出力で上書きしない。
        if (trigger.length === 0 && [...output].length === 1) legends.set(key, output);
      });
    });
  }

  // 親指の刻印は、親指キーを文字入力へ追加しないかな配列でも表示する。
  legends.set(THUMB_KEY.LT, '親指');
  legends.set(THUMB_KEY.RT, '空白');
  const baseFace = faces.find((face) => face.trigger.length === 0);
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
  }
  if (thumbs.RT) {
    const sequence: Sequence = [[THUMB_KEY.RT]];
    map.set(thumbs.RT, sequence);
    appendCanonicalAlternative(
      canonicalInputs,
      thumbs.RT,
      compileSequenceInputAlternative(thumbs.RT, sequence, SINGLE_LAYER_ID),
    );
  }
  validateCanonicalInputMap(canonicalInputs);
  return {
    id,
    name,
    map,
    canonicalInputs,
    legends,
    faces: [...faces],
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

/** かな → 打鍵ステップ列を直接書いた配列（薙刀式など） */
export type KanaDefinition =
  | Record<string, string[][]>
  | readonly (readonly [string, string[][]])[];

export function fromKana(id: string, name: string, def: KanaDefinition): Layout {
  const entries: readonly (readonly [string, string[][]])[] =
    Array.isArray(def) ? def : Object.entries(def);
  const map = new Map<string, Sequence>();
  const canonicalInputs = new Map<string, InputAlternative[]>();

  for (const [output, sequence] of entries) {
    appendCanonicalAlternative(
      canonicalInputs,
      output,
      compileSequenceInputAlternative(output, sequence, SINGLE_LAYER_ID),
    );
    if (map.has(output)) continue;
    map.set(output, sequence);
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
        if (!next.some((candidate) => sameCanonicalAlternative(candidate, mapped))) {
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
  const markAlternatives = layout.canonicalInputs.get(mark);
  if (!markAlternatives) {
    throw new Error(`${context}の合成記号「${mark}」が未定義`);
  }
  const markSequence = layout.map.get(mark);

  const map = new Map(layout.map);
  const canonicalInputs = cloneCanonicalInputs(layout.canonicalInputs);

  for (const [source, output] of Object.entries(entries)) {
    const sourceAlternatives = layout.canonicalInputs.get(source);
    if (!sourceAlternatives) {
      throw new Error(`${context}の元出力「${source}」が未定義`);
    }
    const sourceSequence = layout.map.get(source);

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
        origin: 'composed' as const,
      })));
    for (const alternative of generated) {
      appendCanonicalAlternative(canonicalInputs, output, alternative);
    }

    // legacy/presentation mapは両componentにdefault sequenceがある場合だけ補完する。
    // canonical composition自体の成立条件には使わない。
    if (map.has(output) || !sourceSequence || !markSequence) continue;

    const sequence: Sequence = [
      ...sourceSequence.map((step) => [...step]),
      ...markSequence.map((step) => [...step]),
    ];
    map.set(output, sequence);

  }

  validateCanonicalInputMap(canonicalInputs);
  return {
    ...layout,
    map,
    canonicalInputs,
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
  const layerDefinitions = [...(layout.layerDefinitions ?? [])];
  const resolvedComboDefinitions: ResolvedComboDefinition[] = [...(layout.resolvedComboDefinitions ?? [])];
  let hasCombo = layerDefinitions.some((definition) => definition.id === COMBO_LAYER_ID);
  const singleActionKeyChoices = (input: string) =>
    (layout.canonicalInputs.get(input) ?? []).flatMap((alternative) => {
      if (alternative.baseRealizations.length !== 1) return [];
      const realization = alternative.baseRealizations[0];
      if (realization.actions.length !== 1 || realization.actions[0].length !== 1) return [];
      return [{
        key: resolveKeyId(realization.actions[0][0]),
        contextRequirements: alternative.contextRequirements,
      }];
    });
  for (const [output, inputs, condition, presentation, classifications = []] of combos) {
    const keyChoices = inputs.map(singleActionKeyChoices);
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
    const resolvedKeyVariants = uniqueCombinations.map((combination) =>
      combination.keys.map(resolveKeyId));
    const foldTriggerInputs = presentation?.foldTriggerInputs;
    const foldTriggerKeys = foldTriggerInputs?.map((input) =>
      singleActionKeyChoices(input)[0]?.key)
      .filter((key): key is string => key !== undefined);
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
      ...(resolvedKeyVariants.length <= 1 ? {} : { keyVariants: resolvedKeyVariants }),
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
        'combo',
      ));
    for (const alternative of generatedAlternatives) {
      appendCanonicalAlternative(canonicalInputs, output, alternative);
    }

    // legacy/presentation metadataは既存defaultを上書きしない。
    if (!map.has(output)) {
      const sequence: Sequence = [keys];
      map.set(output, sequence);
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
    resolvedComboDefinitions,
    layerDefinitions,
  };
}
