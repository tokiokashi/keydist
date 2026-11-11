import { ALL_FINGERS, THUMB_KEY, resolveKeyId, type Finger, type Geometry, type Key, type Point } from '#input/shapes/geometry.ts';
import { commitAction, commitKeyOf, commitStrokeRulesOf, needsCommitStroke } from './commit-stroke.ts';
import { decidePress, selectFingers, strokeFingerChoices, targetOf, type PlannedInput, type PlannedStroke } from './finger-selection.ts';
import { COMBO_LAYER_ID, SINGLE_LAYER_ID, type HoldPhase, type LayerDefinition, type Layout, withoutRomajiOnlyInputs } from '#input/layouts/types.ts';
import { layerDefinitionsWithLabels } from '#input/layouts/layers.ts';
import { canTypeSpaceWithLeftThumb, isLoneRightThumbPress } from '#input/layouts/space-thumb.ts';
import { bracketAliasesFor } from '#input/text/bracket-alias.ts';
import { evaluationCanonicalInputs, normalizeEvaluationChar } from '#input/text/char-alias.ts';
import { isSymbolChar } from '#input/text/evaluation-text.ts';
import { isKanjiChar } from '#input/text/reading.ts';
import { kanaToRomajiChunks, type RomajiChunk } from '#input/romaji/kunrei.ts';
import {
  applyActionRealizationPolicy,
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  inputAlternativeSelectionIdentity,
  isComboFrameAlternative,
  mapInputAlternativePhysicalKeys,
  realizeTriggerActions,
  type ActionRealizationPolicy,
  type InputAlternative,
  type InputAlternativeSet,
  type RealizedSemanticAction,
  type InputClassification,
  type InputContextRequirement,
  type Requirement,
  type TriggerHoldState,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';

/**
 * センターシフトを押す親指。`opposite` は出力キーの手と逆の親指で、出力キーが両手にまたがる打鍵は右親指で押す。
 */
export type CenterShiftThumb = 'right' | 'left' | 'opposite';

/** 空白の単打を押す親指。 */
export type SpaceThumb = 'right' | 'left';

export interface TracePolicy {
  /** 先読みNかな。テキストのかなの位置でN文字先まで残す候補を比較する（仕様 §7 R3） */
  windowSize: number;
  /**
   * 同指連続（g=0）で打鍵先がその指のホームキー自身のとき、移動を加算するか。
   * falseにすると距離0として扱う。
   */
  sfbHomeCost: boolean;
  /** 左右どちらの親指でも押せる親指シフト（センターシフト）を、どの親指で押すか。 */
  centerShiftThumb?: CenterShiftThumb;
  /** 左右どちらの親指でも押せる空白の単打を、どの親指で押すか。 */
  spaceThumb?: SpaceThumb;
  /** hold-capable triggerを実際の連続保持へrealizeする条件。 */
  triggerRealizationPolicy?: TriggerRealizationPolicy;
  /** Trigger realization後のaction grouping。 */
  actionRealizationPolicy?: ActionRealizationPolicy;
}

export const DEFAULT_TRACE_POLICY: TracePolicy = {
  windowSize: 3,
  sfbHomeCost: true,
  centerShiftThumb: 'right',
  spaceThumb: 'right',
  triggerRealizationPolicy: { ...DEFAULT_TRIGGER_REALIZATION_POLICY },
  actionRealizationPolicy: { ...DEFAULT_ACTION_REALIZATION_POLICY },
};

export type ParticipationRole = 'output' | 'trigger' | 'held-trigger';

/**
 * triggerのキーが、成立した入力のRequirementのどこに現れるか（仕様 §11.10.1）。
 * `overlap` は同時押し、`before` は前置、`after` は後置。
 */
export type TriggerOrder = 'overlap' | 'before' | 'after';

export interface StrokeParticipation {
  hand: 'left' | 'right';
  finger: Finger;
  keys: readonly Key[];
  roles: readonly ParticipationRole[];
  holdPhase?: HoldPhase;
  /**
   * この指のtriggerのキー（`trigger`・`held-trigger` の役のキー）が、入力のRequirementに現れる位置。
   * triggerの役を持つ参加だけが持ち、Requirementに現れないキーしか無ければ持たない。
   */
  triggerOrders?: readonly TriggerOrder[];
  /** この指のtriggerのキーが、入力の定義で `modifier` の役を持つキーである（仕様 §11.10.1）。 */
  modifier?: true;
}

/** 距離が採用した候補の起点。 */
export interface PressOrigin {
  /** 起点の位置。`from` が `previous` ならその指の直前の位置、`home` ならその指のホーム */
  at: Point;
  from: 'previous' | 'home';
}

/** 1ステップの中の1指分の押下 */
export interface Press {
  finger: Finger;
  /** この指が同時に押すキー。1本の指でキーの間を押す場合は複数になる */
  keys: Key[];
  /** 指の目標位置。キーが複数なら重心（§4.2） */
  target: Point;
  /** 前回この指を使ってから挟まったrealized Stroke数。SFB判定用。 */
  gap: number;
  /**
   * 今の入力の開始が、前回この指が参加した入力の終わりから何かな先か。N判定用。重なる時は0、参加が初めてなら無限大。
   * generateTrace生成時は必ず入る。
   */
  inputDistance?: number;
  /** この押下で計上された移動距離 [u] */
  distance: number;
  /**
   * 距離が採用した候補の起点（仕様 §9, §11.11）。
   * 候補が同値の時は直前の位置（`from: 'previous'`）を採る。
   */
  origin: PressOrigin;
  /**
   * 同指連続（same finger bigram）。
   * 同じ指で**異なる位置**を続けて打った場合のみ真。
   * 同じキーの連打や、押しっぱなしの修飾キー（センターシフト等）は含まない。
   */
  sfb: boolean;
}

/**
 * 1ステップ。同時押しは1ステップに複数の押下を持つ。
 * 順次打鍵（前置・後置シフト等）はステップが分かれる。
 */
export interface Stroke {
  /** ステップの通し番号 */
  index: number;
  char: string;
  /** ローマ字展開前の入力単位。かな配列では char と同じ */
  inputChar: string;
  /** 展開後の入力列における入力単位の開始位置。同じかなを複数ステップで打つ場合も共有する */
  inputIndex: number;
  /** この入力が覆うテキストの最初の文字の位置（評価に渡すテキストの文字で数える。仕様 §7 R3） */
  kanaStart: number;
  /** この入力が覆うテキストの最後の文字の位置。その文字を含む */
  kanaEnd: number;
  /**
   * `char`を決めた1回の入力の選択の通し番号。1つの選択が複数のストロークになる時は、それらが共有する。
   * `inputIndex`はローマ字の配列で別の選択（「きょう」の`k`とコンボ`you`）とも共有されるので、選択の区別には使えない。
   */
  selectionIndex: number;
  /** このステップに含まれるキー押下のaggregation帰属先。入力成立semanticではない。 */
  aggregationGroupId: string;
  /** authoring由来のcanonical classification。 */
  classifications: readonly InputClassification[];
  /**
   * 確定の打鍵（仕様 §4.7）か。確定の打鍵だけが真で持つ。
   * 確定が要る継ぎ目の後の入力単位の最初のステップで、その入力単位の `inputIndex`・`char` などを共有する。
   */
  commit?: true;
  /** このステップで層操作として押したキー。出力キーとの色分けに使う */
  triggerKeys: readonly string[];
  /** 同じ層の文字トリガーを複数同時押下したキー。表示色の例外に使う */
  pairedTriggerKeys: readonly string[];
  /** 後段解析がlayout idを見ずに使う正規化済み参加意味。 */
  participations: readonly StrokeParticipation[];
  presses: Press[];
  /** ステップ内の押下距離の合計 [u] */
  distance: number;
  /** 押下直後の全指位置 */
  positions: Record<Finger, Point>;
}

/** 打鍵できなかった文字の種別ごとの件数。 */
export interface SkippedByKind {
  /** 漢字（読みに直せずに残ったもの） */
  kanji: number;
  /** 記号 */
  symbol: number;
  /** それ以外の文字（読みに直した後に配列が打てないかなを含む） */
  other: number;
}

export interface Trace {
  strokes: Stroke[];
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /**
   * 打鍵できなかった文字の位置（評価に渡すテキストの文字位置。昇順で重複しない）。`skipped` を数えた単位が属する文字を入れる。
   * かな配列では `skipped` と同じ数になる。ローマ字配列では、展開後の英字を数えた時に、その英字を含む綴りの単位のかなを全部入れる。
   * 一部の英字だけ打てたかなも入るので、数は `skipped`（展開後の英字の数）と一致するとは限らない。
   */
  skippedPositions: number[];
  /**
   * `skipped` の内訳。合計は `skipped` と一致する。読みに直せなかった漢字・記号・それ以外の文字に分ける。
   * 漢字は言語や読みの変換の成否によらず、文字が漢字なら漢字に数える。
   */
  skippedByKind: SkippedByKind;
  /**
   * 入力かな数（ローマ字展開・コンボ結合の前。仕様 §4.6）。
   * 打鍵数（ステップ数）は配列で変わるが、これは変わらないので
   * 「1文字あたり」の分母に使える（仕様 §11.4）。
   */
  inputChars: number;
  /** コンボ枠の見出しのうち、評価中に命中した見出し（命中ごとに1件） */
  comboHits: string[];
  /** コンボ枠の見出しの数（コンボ定義と、コンボ枠に計上する面の出力） */
  comboDefinitions: number;
  /** 層・コンボの定義。評価対象外の未使用層も含む */
  layerDefinitions: LayerDefinition[];
  /** 配列定義の不備。同一ステップ内で同じ指が複数のキーを要求された場合など */
  errors: string[];
}

/**
 * Traceのうち打鍵の列（`strokes`）を除いた部分。打鍵の列は長いテキストで数百MBになるので、
 * 図の外側で診断や見出しに使うだけの画面（メインスレッド）にはこちらだけを渡す。
 */
export type TraceSummary = Omit<Trace, 'strokes'>;

export function summarizeTrace(trace: Trace): TraceSummary {
  const { strokes: _strokes, ...summary } = trace;
  return summary;
}

/**
 * コンボ枠の見出しの数（仕様 §11.8の `B`）。コンボ定義の数に、コンボ枠に帰属する面の出力のうち
 * コンボ定義の見出しと重ならないものを見出しごとに1件足す。
 */
function comboFrameHeadingCount(layout: Layout): number {
  const definitions = layout.resolvedComboDefinitions ?? [];
  const definedHeadings = new Set(definitions.map((combo) => combo.output));
  let faceHeadings = 0;
  for (const [output, alternatives] of layout.canonicalInputs) {
    if (definedHeadings.has(output)) continue;
    if (alternatives.some((alternative) => alternative.origin === 'face' && isComboFrameAlternative(alternative))) {
      faceHeadings++;
    }
  }
  return definitions.length + faceHeadings;
}

/**
 * テキストを、見出しを引く単位の列に展開する。ローマ字の配列はかなをテーブルの見出しで切って綴りに展開し、
 * かな配列はテキストの文字をそのまま使う。`generateTrace` と、前処理が見出しに入らない片仮名を探す処理（`uncoveredTextPositions`）が、
 * この関数を共有する。
 */
function evaluationUnitsOf(text: string, layout: Layout, romajiChunks: readonly RomajiChunk[] | undefined) {
  // ローマ字配列はかなテキストを展開してから打つ。コンボの誤命中を防ぐため、
  // 展開前の単位も残しておく。かな配列はそのまま打つ。
  const rawChars = [...text];
  const bracketAliases = bracketAliasesFor(layout);
  const sourceChunks = layout.romajiTable ? (romajiChunks ?? kanaToRomajiChunks(text, layout.romajiTable)) : undefined;
  const chunks = sourceChunks && layout.romajiTable ? aliasBracketChunks(sourceChunks, layout.romajiTable, bracketAliases) : undefined;
  const chars = (chunks ? chunks.flatMap((chunk) => [...chunk.roman]) : rawChars.map((char) => bracketAliases[char] ?? char)).map(
    normalizeEvaluationChar,
  );
  const chunkRanges: RomajiChunkRange[] = [];
  if (chunks) {
    let start = 0;
    let kanaStart = 0;
    for (const chunk of chunks) {
      const length = [...chunk.roman].length;
      chunkRanges.push({
        start,
        end: start + length,
        kana: chunk.kana,
        fromTable: chunk.fromTable,
        kanaStart,
        kanaLength: [...chunk.kana].length,
      });
      start += length;
      kanaStart += [...chunk.kana].length;
    }
  }
  // 見出し探索のauthorityもcanonicalInputs。legacy Layout.map由来の長さmetadataへ依存しない。
  const canonicalInputs = evaluationCanonicalInputs(layout);
  return { rawChars, chunks, chars, chunkRanges, canonicalInputs };
}

/**
 * 前処理の片仮名の書き換え（仕様 §4.6）が使う。`generateTrace` と同じ展開（`evaluationUnitsOf`）と
 * 同じ最長一致で見出しを切り、どの見出しにも入らない文字の、テキストの文字位置（コードポイント）を返す。
 * ローマ字の配列では、かなをテーブルの見出しで切ってから、残りを英字の列で見出しに当てる。
 * 見出しごとの文脈条件（`contextRequirements`）は見ない。条件を作るのは `withCombos` のコンボの条件
 * （`youonOnly`・`romajiOnly`）だけで、条件が付くのは英字の出力の見出しだけである。
 */
export function uncoveredTextPositions(text: string, sourceLayout: Layout): number[] {
  const layout = sourceLayout.romajiTable ? sourceLayout : withoutRomajiOnlyInputs(sourceLayout);
  const { chunks, chars, chunkRanges, canonicalInputs } = evaluationUnitsOf(text, layout, undefined);
  const maxLen = Math.max(1, ...[...canonicalInputs.keys()].map((output) => [...output].length));
  const uncovered: number[] = [];
  for (let cursor = 0; cursor < chars.length; ) {
    let length = Math.min(maxLen, chars.length - cursor);
    while (length >= 1 && !canonicalInputs.has(chars.slice(cursor, cursor + length).join(''))) length--;
    if (length >= 1) {
      cursor += length;
      continue;
    }
    if (chunks) uncovered.push(...skippedKanaPositions(chunkRanges, cursor));
    else uncovered.push(cursor);
    cursor++;
  }
  return uncovered;
}

/**
 * 仕様 §9。テキストを打鍵ステップ列へ展開し、各押下の移動距離を求める。
 *
 * realized Stroke gap = 0 → d_stay（同指連続。戻る時間がない）
 * ΔI ≤ N（かなの位置の差） → min(d_stay, d_home)
 * ΔI > N                   → d_home
 *
 * ホームへの復帰移動そのものは計上しない（§7 R2）。
 * 同時押しステップは1ステップとして数え、距離は各指の単純和を採る。
 */
export function generateTrace(
  text: string,
  sourceLayout: Layout,
  geometry: Geometry,
  options: TracePolicy = DEFAULT_TRACE_POLICY,
  /**
   * ローマ字の配列で、かなの区切りと綴りを呼び出し側が決める時の列。渡すと、配列のローマ字表でかなを展開する代わりに
   * この列を打つ。配列がローマ字表を持たない時は読まない。
   */
  romajiChunks?: readonly RomajiChunk[],
): Trace {
  // 仕様 §4.3。ローマ字を経ない打ち方ではromajiOnlyのコンボを配列に無いものとして扱う。
  // 見出し探索だけでなく定義数B（§11.8）とコンボ枠の有無も揃えるため、alternativeの
  // filterだけで済ませず、評価前に配列ごと外す。
  const layout = sourceLayout.romajiTable ? sourceLayout : withoutRomajiOnlyInputs(sourceLayout);
  const prev = {} as Record<Finger, Point>;
  const last = {} as Record<Finger, number>;
  const lastInputEnd = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    prev[finger] = geometry.homes[finger];
    last[finger] = Number.NEGATIVE_INFINITY;
    lastInputEnd[finger] = Number.NEGATIVE_INFINITY;
  }

  const strokes: Stroke[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const comboHits: string[] = [];
  const comboDefinitions = comboFrameHeadingCount(layout);
  const layerDefinitions: LayerDefinition[] =
    layout.layerDefinitions === undefined ? [{ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' }] : layerDefinitionsWithLabels(layout);
  if (comboDefinitions > 0 && !layerDefinitions.some((definition) => definition.id === COMBO_LAYER_ID)) {
    layerDefinitions.push({ id: COMBO_LAYER_ID, kind: 'combo', label: 'コンボ' });
  }
  let skipped = 0;
  const skippedPositions = new Set<number>();
  const skippedByKind: SkippedByKind = { kanji: 0, symbol: 0, other: 0 };
  let index = 0;
  let inputOrdinal = 0;
  let triggerHoldState: TriggerHoldState | undefined;
  const inputs: PlannedGeneratedInput[] = [];

  const { rawChars, chunks, chars, chunkRanges, canonicalInputs } = evaluationUnitsOf(text, layout, romajiChunks);
  const commitRules = commitStrokeRulesOf(canonicalInputs);
  const commitKey = commitKeyOf(geometry);
  // 直前の入力が選んだpath。打てない文字を挟んだら継ぎ目として扱わないので、そこで外す
  let previousAlternative: InputAlternative | undefined;
  let commitCount = 0;
  const maxLen = Math.max(1, ...[...canonicalInputs.keys()].map((output) => [...output].length));

  for (let cursor = 0; cursor < chars.length; ) {
    let alternatives: InputAlternativeSet | undefined;
    let char = chars[cursor];
    let consumed = 1;

    for (let len = Math.min(maxLen, chars.length - cursor); len >= 1; len--) {
      const candidate = chars.slice(cursor, cursor + len).join('');
      const found = canonicalInputs.get(candidate);
      const eligible = found?.filter((alternative) =>
        alternativeContextSatisfied(alternative.contextRequirements, cursor, cursor + len, chars, chunkRanges, chunks !== undefined),
      );
      if (eligible && eligible.length > 0) {
        alternatives = eligible;
        char = candidate;
        consumed = len;
        break;
      }
    }

    if (!alternatives) {
      skipped++;
      if (chunks) {
        for (const position of skippedKanaPositions(chunkRanges, cursor)) skippedPositions.add(position);
      } else {
        skippedPositions.add(cursor);
      }
      skippedByKind[skippedKindOf(char)]++;
      previousAlternative = undefined;
      cursor++;
      continue;
    }
    const currentInputOrdinal = inputOrdinal++;
    const inputStart = cursor;
    const inputEnd = cursor + consumed;
    const coveredRange = chunks ? coveringChunkRange(chunkRanges, inputStart, inputEnd) : undefined;
    const inputChar = inputCharOf(coveredRange, chunkRanges, rawChars, inputStart, inputEnd);
    const inputIndex = inputIndexOf(coveredRange, chunkRanges, inputStart);
    // 入力が覆うテキストの範囲。ローマ字配列は、覆う英字を含む綴りの単位のかなの範囲
    let kanaStart = inputStart;
    let kanaEnd = inputEnd - 1;
    if (coveredRange) {
      const first = chunkRanges[coveredRange.from];
      const lastCovered = chunkRanges[coveredRange.to - 1];
      if (coveredRange.from < coveredRange.to && first && lastCovered) {
        kanaStart = first.kanaStart;
        kanaEnd = lastCovered.kanaStart + lastCovered.kanaLength - 1;
      }
    }
    cursor += consumed;

    const selectedAlternative = selectInputAlternative(alternatives, layout, geometry, options);
    if (isComboFrameAlternative(selectedAlternative)) comboHits.push(char);
    const commit = previousAlternative !== undefined && needsCommitStroke(commitRules, previousAlternative, selectedAlternative);
    previousAlternative = selectedAlternative;

    const realized = realizeTriggerActions(
      selectedAlternative.baseRealizations,
      options.triggerRealizationPolicy ?? DEFAULT_TRIGGER_REALIZATION_POLICY,
      triggerHoldState,
    );
    triggerHoldState = realized.holdState;
    const actions = applyActionRealizationPolicy(realized.actions, options.actionRealizationPolicy ?? DEFAULT_ACTION_REALIZATION_POLICY);

    const plannedActions: PlannedAction[] = [];
    if (commit) {
      commitCount++;
      plannedActions.push({
        action: commitAction(commitKey),
        stroke: {
          keys: [commitKey],
          candidates: [geometry.fingerCandidates.get(commitKey.id) ?? [commitKey.finger]],
          heldKeys: [],
        },
        commit: true,
      });
    }
    for (const action of actions) {
      const keys: Key[] = [];
      for (const id of action.keys) {
        const key = geometry.keys.get(resolveKeyId(id));
        if (!key) {
          record(errors, seen, `キー ${id} が物理配列に存在しない（文字「${char}」）`);
          continue;
        }
        keys.push(key);
      }
      if (keys.length === 0) continue;
      plannedActions.push({
        action,
        stroke: {
          keys,
          candidates: keys.map((key) => geometry.fingerCandidates.get(key.id) ?? [key.finger]),
          heldKeys: action.heldKeys.map(resolveKeyId),
        },
      });
    }
    inputs.push({
      char,
      inputChar,
      inputIndex,
      ordinal: currentInputOrdinal,
      start: kanaStart,
      end: kanaEnd,
      actions: plannedActions,
      strokes: plannedActions.map((planned) => planned.stroke),
      ambiguous: plannedActions.some((planned) => planned.stroke.candidates.some((fingers) => fingers.length > 1)),
    });
  }

  // 担当する指が2本以上のキーを含む入力では、Nかな先までの範囲で指を選ぶ（仕様 §9.1）。
  // 指が決まった入力から順に、状態を進めて打鍵を作る。
  const selectionPolicy = { windowSize: options.windowSize, sfbHomeCost: options.sfbHomeCost };
  const holders = new Map<string, Finger>();
  const participationPool = new Map<string, readonly StrokeParticipation[]>();
  for (let inputPosition = 0; inputPosition < inputs.length; inputPosition++) {
    const input = inputs[inputPosition];
    const currentInputOrdinal = input.ordinal;
    const chosen = input.ambiguous
      ? selectFingers(
          geometry,
          selectionPolicy,
          { prev, last, lastInputEnd, nextStrokeIndex: index, position: input.start, holders },
          inputs,
          inputPosition,
        ).strokes
      : undefined;

    input.actions.forEach((planned, actionPosition) => {
      const { action, stroke: plannedStroke } = planned;
      const { char, inputChar, inputIndex } = input;
      const fingers = chosen?.[actionPosition] ?? strokeFingerChoices(plannedStroke, holders)[0];
      const triggerKeys = action.triggerKeys;
      const aggregationGroupId = action.input.aggregationGroupId;
      const modifierKeys = new Set(action.input.roles.filter((role) => role.role === 'modifier').map((role) => resolveKeyId(role.key)));
      const pressedModifierKeys = [...new Set(action.keys.map(resolveKeyId))].filter((key) => modifierKeys.has(key));
      const pairedTriggerKeys = pressedModifierKeys.length >= 2 ? triggerKeys.filter((key) => modifierKeys.has(resolveKeyId(key))) : NO_KEYS;
      const byFinger = new Map<Finger, Key[]>();
      plannedStroke.keys.forEach((key, slot) => {
        const finger = fingers[slot];
        const group = byFinger.get(finger);
        if (group) group.push(key);
        else byFinger.set(finger, [key]);
      });

      const inputDistanceByFinger = new Map<Finger, number>();
      const presses: Press[] = [...byFinger].map(([finger, keys]) => {
        const target = targetOf(finger, keys);
        const gap = index - last[finger] - 1;
        const previousInputEnd = lastInputEnd[finger];
        const inputDistance = Number.isFinite(previousInputEnd) ? Math.max(0, input.start - previousInputEnd) : Number.POSITIVE_INFINITY;
        inputDistanceByFinger.set(finger, inputDistance);
        const at = prev[finger];
        return {
          finger,
          keys,
          target,
          gap,
          inputDistance,
          distance: 0,
          // 仮の値。距離と同時に採用した候補の起点で置き換える
          origin: { at: target, from: 'home' as const },
          sfb: gap === 0 && (at.x !== target.x || at.y !== target.y),
        };
      });

      // 押さえ続けているキーを押した指。この打鍵で押すキーはこの打鍵の指、前から押さえているキーは前に押した指
      const heldFingerOf = (id: string): Finger | undefined => {
        const slot = plannedStroke.keys.findIndex((key) => key.id === id);
        if (slot >= 0) return fingers[slot];
        return holders.get(id) ?? geometry.keys.get(id)?.finger;
      };

      const participations = internParticipations(
        participationPool,
        normalizeParticipations(
          presses,
          action.outputKeys,
          action.triggerKeys,
          action.heldKeys,
          action.holdPhase,
          action.input.requirements,
          modifierKeys,
          geometry,
          heldFingerOf,
        ),
      );

      let total = 0;
      for (const press of presses) {
        const decision = decidePress(
          press.finger,
          press.target,
          prev[press.finger],
          geometry.homes[press.finger],
          press.gap === 0,
          inputDistanceByFinger.get(press.finger) ?? Number.POSITIVE_INFINITY,
          selectionPolicy,
        );
        press.distance = decision.distance;
        // 位置は作った後に書き換えない値なので、指の位置と物理配列のホームをそのまま共有する（打鍵ごとに複製しない）
        press.origin = decision.stay ? { at: prev[press.finger], from: 'previous' } : { at: geometry.homes[press.finger], from: 'home' };
        if (decision.stay) {
          restoreStaySnapshots(strokes, last[press.finger], index, press.finger, prev[press.finger]);
        }
        total += press.distance;
      }
      for (const press of presses) {
        prev[press.finger] = press.target;
        last[press.finger] = index;
        lastInputEnd[press.finger] = input.end;
      }

      const heldByFinger = new Map<Finger, Key[]>();
      const nextHolders = new Map<string, Finger>();
      for (const heldId of action.heldKeys) {
        const id = resolveKeyId(heldId);
        const key = geometry.keys.get(id);
        const finger = heldFingerOf(id);
        if (key === undefined || finger === undefined) continue;
        nextHolders.set(id, finger);
        const keys = heldByFinger.get(finger);
        if (keys) keys.push(key);
        else heldByFinger.set(finger, [key]);
      }
      const pressedFingers = new Set(presses.map((press) => press.finger));
      for (const [finger, keys] of heldByFinger) {
        if (pressedFingers.has(finger)) continue;
        prev[finger] = targetOf(finger, keys);
        last[finger] = index;
        lastInputEnd[finger] = input.end;
      }
      holders.clear();
      for (const [id, finger] of nextHolders) holders.set(id, finger);

      const positions = snapshot(prev, last, index, geometry);
      strokes.push({
        index,
        char,
        inputChar,
        inputIndex,
        kanaStart: input.start,
        kanaEnd: input.end,
        selectionIndex: currentInputOrdinal,
        aggregationGroupId,
        classifications: action.input.classifications,
        ...(planned.commit ? { commit: true as const } : {}),
        triggerKeys,
        pairedTriggerKeys,
        participations,
        presses,
        distance: total,
        positions,
      });
      index++;
    });
  }

  if (commitCount > 0 && !layerDefinitions.some((definition) => definition.id === SINGLE_LAYER_ID)) {
    layerDefinitions.push({ id: SINGLE_LAYER_ID, kind: 'layer', label: '単打' });
  }

  return {
    strokes,
    skipped,
    skippedPositions: [...skippedPositions].sort((a, b) => a - b),
    skippedByKind,
    inputChars: [...text].length,
    comboHits,
    comboDefinitions,
    layerDefinitions,
    errors,
  };
}

interface PlannedAction {
  readonly action: RealizedSemanticAction;
  readonly stroke: PlannedStroke;
  /** 確定の打鍵（仕様 §4.7） */
  readonly commit?: true;
}

interface PlannedGeneratedInput extends PlannedInput {
  readonly char: string;
  readonly inputChar: string;
  readonly inputIndex: number;
  readonly ordinal: number;
  readonly actions: readonly PlannedAction[];
}

function normalizeParticipations(
  presses: readonly Press[],
  outputKeys: readonly string[],
  triggerKeys: readonly string[],
  heldTriggerKeys: readonly string[],
  holdPhase: HoldPhase | undefined,
  requirements: readonly Requirement[],
  modifierKeys: ReadonlySet<string>,
  geometry: Geometry,
  heldFingerOf: (id: string) => Finger | undefined,
): readonly StrokeParticipation[] {
  const outputs = new Set(outputKeys.map(resolveKeyId));
  const triggers = new Set(triggerKeys.map(resolveKeyId));
  const held = new Set(heldTriggerKeys.map(resolveKeyId));
  const byFinger = new Map<Finger, { keys: Key[]; roles: Set<ParticipationRole> }>();

  const entry = (finger: Finger) => {
    const existing = byFinger.get(finger);
    if (existing) return existing;
    const created = { keys: [] as Key[], roles: new Set<ParticipationRole>() };
    byFinger.set(finger, created);
    return created;
  };

  for (const press of presses) {
    const current = entry(press.finger);
    for (const key of press.keys) {
      if (!current.keys.some((candidate) => candidate.id === key.id)) current.keys.push(key);
      if (outputs.has(key.id)) current.roles.add('output');
      if (triggers.has(key.id)) current.roles.add('trigger');
      if (held.has(key.id)) current.roles.add('held-trigger');
    }
  }

  for (const keyId of held) {
    const key = geometry.keys.get(keyId);
    const finger = heldFingerOf(keyId);
    if (!key || finger === undefined) continue;
    const current = entry(finger);
    if (!current.keys.some((candidate) => candidate.id === key.id)) current.keys.push(key);
    current.roles.add('held-trigger');
  }

  return [...byFinger].map(([finger, value]) => {
    const isTrigger = value.roles.has('trigger') || value.roles.has('held-trigger');
    const orders = isTrigger ? triggerOrdersOf(value.keys, triggers, held, requirements) : [];
    return {
      hand: finger.startsWith('L') ? 'left' : 'right',
      finger,
      keys: value.keys,
      roles: [...value.roles],
      ...(value.roles.has('held-trigger') && holdPhase !== undefined ? { holdPhase } : {}),
      ...(orders.length > 0 ? { triggerOrders: orders } : {}),
      ...(isTrigger && value.keys.some((key) => (triggers.has(key.id) || held.has(key.id)) && modifierKeys.has(key.id))
        ? { modifier: true as const }
        : {}),
    };
  });
}

const TRIGGER_ORDER_SEQUENCE: readonly TriggerOrder[] = ['overlap', 'before', 'after'];

/** triggerのキーがRequirementのどこに現れるかを、`overlap`・`before`・`after` の順に重複なく返す。 */
function triggerOrdersOf(
  keys: readonly Key[],
  triggers: ReadonlySet<string>,
  held: ReadonlySet<string>,
  requirements: readonly Requirement[],
): TriggerOrder[] {
  const found = new Set<TriggerOrder>();
  for (const key of keys) {
    if (!triggers.has(key.id) && !held.has(key.id)) continue;
    for (const requirement of requirements) {
      if (requirement.kind === 'overlap') {
        if (requirement.keys.some((candidate) => resolveKeyId(candidate) === key.id)) found.add('overlap');
      } else {
        if (requirement.before.some((candidate) => resolveKeyId(candidate) === key.id)) found.add('before');
        if (requirement.after.some((candidate) => resolveKeyId(candidate) === key.id)) found.add('after');
      }
    }
  }
  return TRIGGER_ORDER_SEQUENCE.filter((order) => found.has(order));
}

/**
 * logical outputの合法なcanonical path群から今回のphysical realizationを選ぶ。
 * authoring defaultは先頭。centerShiftThumbはkey rewriteせずpath selectionとして適用する。
 */
function thumbVariantSignature(alternative: InputAlternative, thumbKeys: ReadonlySet<string>): string {
  return inputAlternativeSelectionIdentity(alternative, (key) => (thumbKeys.has(resolveKeyId(key)) ? '<thumb>' : resolveKeyId(key)));
}

/**
 * authoring defaultを基準に、同じpathの合法なthumb variantだけを比較する。
 * non-thumb alternativeや別方式alternativeはcenterShiftThumbでは選ばない。
 */
function shiftVariantSignature(alternative: InputAlternative, shiftKeys: ReadonlySet<string>): string {
  return inputAlternativeSelectionIdentity(alternative, (key) => (shiftKeys.has(resolveKeyId(key)) ? '<shift>' : resolveKeyId(key)));
}

function oppositeHandShiftScore(alternative: InputAlternative, shiftKeys: ReadonlySet<string>, geometry: Geometry): number {
  let value = 0;
  for (const realization of alternative.baseRealizations) {
    const triggerShifts = (realization.defaultTriggerKeys ?? []).map(resolveKeyId).filter((key) => shiftKeys.has(key));
    if (triggerShifts.length === 0) continue;

    const outputHands = nonThumbHands(
      realization.defaultOutputKeys.map(resolveKeyId).filter((key) => !shiftKeys.has(key)),
      geometry,
    );
    if (outputHands.size !== 1) continue;
    const outputHand = [...outputHands][0];

    for (const shift of triggerShifts) {
      const finger = geometry.keys.get(shift)?.finger;
      if (finger === undefined) continue;
      const shiftHand = finger.startsWith('L') ? 'left' : 'right';
      value += shiftHand !== outputHand ? 1 : -1;
    }
  }
  return value;
}

const leftThumbSpaceVariants = new WeakMap<InputAlternative, InputAlternative>();

/**
 * 空白の単打を左親指で押す設定の時、右親指の単打を左親指の単打へ移した経路を返す。
 * 左親指キーをどの入力にも使わない配列（`canTypeSpaceWithLeftThumb`）だけが対象で、他は選んだ経路のまま返す。
 */
function selectInputAlternative(alternatives: InputAlternativeSet, layout: Layout, geometry: Geometry, options: TracePolicy): InputAlternative {
  const selected = selectShiftVariant(alternatives, layout, geometry, options);
  if (options.spaceThumb !== 'left' || !isLoneRightThumbPress(selected) || !canTypeSpaceWithLeftThumb(layout)) return selected;
  let variant = leftThumbSpaceVariants.get(selected);
  if (variant === undefined) {
    variant = mapInputAlternativePhysicalKeys(selected, (key) => (resolveKeyId(key) === THUMB_KEY.RT ? THUMB_KEY.LT : key));
    leftThumbSpaceVariants.set(selected, variant);
  }
  return variant;
}

function selectShiftVariant(alternatives: InputAlternativeSet, layout: Layout, geometry: Geometry, options: TracePolicy): InputAlternative {
  let fallback = alternatives[0];
  if (!fallback) throw new Error('canonical input alternativeが空');

  const shiftKeys = new Set((layout.shiftKeys ?? []).map(resolveKeyId));
  if (shiftKeys.size >= 2) {
    const family = shiftVariantSignature(fallback, shiftKeys);
    let selected = fallback;
    let bestScore = oppositeHandShiftScore(fallback, shiftKeys, geometry);
    for (const alternative of alternatives.slice(1)) {
      if (shiftVariantSignature(alternative, shiftKeys) !== family) continue;
      const score = oppositeHandShiftScore(alternative, shiftKeys, geometry);
      if (score > bestScore) {
        selected = alternative;
        bestScore = score;
      }
    }
    fallback = selected;
  }

  const thumbKeys = new Set((layout.thumbShiftKeys ?? []).map(resolveKeyId));
  if (thumbKeys.size < 2) return fallback;
  const side = options.centerShiftThumb ?? 'right';

  // 親指シフトのtriggerごとに、選んだ側の親指なら+1、逆なら-1。「逆の親指」で出力の手が1つに決まらない打鍵は数えず、
  // 同点の時は右親指の多い候補を採る。出力の手が決まらない打鍵を右親指で打つためである。
  const score = (alternative: InputAlternative): { matched: number; right: number } => {
    let matched = 0;
    let right = 0;
    for (const realization of alternative.baseRealizations) {
      const triggerThumbs = (realization.defaultTriggerKeys ?? []).map(resolveKeyId).filter((key) => thumbKeys.has(key));
      if (triggerThumbs.length === 0) continue;

      let target: 'left' | 'right' | undefined = side === 'opposite' ? undefined : side;
      if (side === 'opposite') {
        const outputHands = nonThumbHands(
          realization.defaultOutputKeys.map(resolveKeyId).filter((key) => !thumbKeys.has(key)),
          geometry,
        );
        if (outputHands.size === 1) target = [...outputHands][0] === 'left' ? 'right' : 'left';
      }

      for (const thumb of triggerThumbs) {
        const finger = geometry.keys.get(thumb)?.finger;
        if (finger !== 'LT' && finger !== 'RT') continue;
        const thumbHand = finger === 'LT' ? 'left' : 'right';
        if (thumbHand === 'right') right += 1;
        if (target !== undefined) matched += thumbHand === target ? 1 : -1;
      }
    }
    return { matched, right };
  };

  const fallbackSignature = thumbVariantSignature(fallback, thumbKeys);
  let selected = fallback;
  let best = score(fallback);
  for (const alternative of alternatives) {
    if (alternative === fallback || thumbVariantSignature(alternative, thumbKeys) !== fallbackSignature) continue;
    const candidate = score(alternative);
    if (candidate.matched > best.matched || (candidate.matched === best.matched && candidate.right > best.right)) {
      selected = alternative;
      best = candidate;
    }
  }
  return selected;
}

function nonThumbHands(keys: readonly string[], geometry: Geometry): Set<'left' | 'right'> {
  return new Set(
    keys
      .map((key) => geometry.keys.get(resolveKeyId(key))?.finger)
      .filter((finger): finger is Finger => finger !== undefined && finger !== 'LT' && finger !== 'RT')
      .map((finger) => (finger.startsWith('L') ? ('left' as const) : ('right' as const))),
  );
}

interface RomajiChunkRange {
  start: number;
  end: number;
  kana: string;
  /** ローマ字テーブルの見出しに当たって展開された塊か（かな由来） */
  fromTable: boolean;
  /** 綴りの単位の最初のかなの、テキストの中の位置 */
  kanaStart: number;
  kanaLength: number;
}

function alternativeContextSatisfied(
  requirements: readonly InputContextRequirement[],
  cursor: number,
  end: number,
  chars: string[],
  chunks: RomajiChunkRange[],
  romajiInput: boolean,
): boolean {
  return requirements.every((requirement) => {
    if (requirement.kind === 'youon-only') {
      return canFireYouonOnlyCombo(cursor, chars, chunks);
    }
    if (requirement.kind === 'romaji-input') {
      // 入力が覆う塊がすべてかな由来の時だけ成立する（仕様 §4.3）。
      // ローマ字を経ない打ち方では配列ごと外すのが主経路で、ここは二重の守り。
      return romajiInput && coveredByKana(cursor, end, chunks);
    }
    return false;
  });
}

/**
 * 英字の範囲[start, end)と重なる綴りの単位を、`chunks`の添字の範囲[from, to)で返す。
 * 綴りの単位は英字の位置の順に隙間なく並ぶので、endがstartを超える最初の単位を二分探索で見つけ、
 * そこからstartが範囲の終わりに届くまで進めばよい。全件を頭から走査しない（テキストの長さに比例した時間にするため）。
 */
function coveringChunkRange(chunks: readonly RomajiChunkRange[], start: number, end: number): { from: number; to: number } {
  let low = 0;
  let high = chunks.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (chunks[mid].end > start) high = mid;
    else low = mid + 1;
  }
  let to = low;
  while (to < chunks.length && chunks[to].start < end) to++;
  return { from: low, to };
}

/**
 * 入力の単位の`inputIndex`。覆う綴りの単位があればその先頭の英字の位置、無ければ入力の単位自身の位置。
 * 覆う単位が無い（from === to）時、chunks[from]は次の綴りの単位を指すので、その`start`を使わない。
 */
export function inputIndexOf(coveredRange: { from: number; to: number } | undefined, chunks: readonly RomajiChunkRange[], inputStart: number): number {
  if (!coveredRange || coveredRange.from >= coveredRange.to) return inputStart;
  return chunks[coveredRange.from]?.start ?? inputStart;
}

/**
 * 入力の単位の`inputChar`。ローマ字展開前の入力単位なので、覆う綴りの単位があればそのかなをつなぐ。
 * 覆う単位が無い（from >= to）時は、展開前の入力単位が無いので空文字にする。
 * 展開後の英字は元の入力ではない（全角形の記号を半角に読み替えた値を含む）ため入れない。
 * かな配列（coveredRangeが無い）は元の文字をそのまま返す。
 */
export function inputCharOf(
  coveredRange: { from: number; to: number } | undefined,
  chunks: readonly RomajiChunkRange[],
  rawChars: readonly string[],
  inputStart: number,
  inputEnd: number,
): string {
  if (!coveredRange) return rawChars.slice(inputStart, inputEnd).join('');
  if (coveredRange.from >= coveredRange.to) return '';
  return chunks
    .slice(coveredRange.from, coveredRange.to)
    .map((range) => range.kana)
    .join('');
}

/**
 * 打てない英字(cursor)が属する綴りの単位のかなの位置。評価に渡すテキストの文字位置で返す。
 * 覆う単位が無い（from >= to）時、chunks[from]は次の綴りの単位を指す。その単位のかなの位置は
 * この英字と無関係で、cursorは展開後の英字の位置で座標系が違うため、どちらも足さず空を返す。
 */
export function skippedKanaPositions(chunks: readonly RomajiChunkRange[], cursor: number): number[] {
  const { from, to } = coveringChunkRange(chunks, cursor, cursor + 1);
  const range = from < to ? chunks[from] : undefined;
  if (range === undefined) return [];
  return Array.from({ length: range.kanaLength }, (_, offset) => range.kanaStart + offset);
}

function coveredByKana(start: number, end: number, chunks: RomajiChunkRange[]): boolean {
  const { from, to } = coveringChunkRange(chunks, start, end);
  for (let i = from; i < to; i++) if (!chunks[i].fromTable) return false;
  return true;
}

function canFireYouonOnlyCombo(cursor: number, chars: string[], chunks: RomajiChunkRange[]): boolean {
  if (cursor === 0 || !/[bcdfghjklmnpqrstvwxyz]/.test(chars[cursor - 1])) return false;
  // cursorの1つ前とcursorの両方を覆う単位は、endがcursorを超える最初の単位に限られる
  const { from } = coveringChunkRange(chunks, cursor, cursor + 1);
  const chunk = chunks[from];
  return chunk !== undefined && chunk.kanaLength > 1 && chunk.start < cursor && cursor < chunk.end;
}

function skippedKindOf(char: string): keyof SkippedByKind {
  if (isKanjiChar(char)) return 'kanji';
  return isSymbolChar(char) ? 'symbol' : 'other';
}

/**
 * ローマ字テーブルに当たらなかった二重かぎ括弧の塊を、かぎ括弧の綴りへ置き換える。
 * 展開前のかな（inputChar）は元の文字のまま残す。かぎ括弧がテーブルに無ければ置き換えない。
 */
function aliasBracketChunks(chunks: readonly RomajiChunk[], table: ReadonlyMap<string, string>, aliases: Record<string, string>): readonly RomajiChunk[] {
  if (Object.keys(aliases).length === 0) return chunks;
  return chunks.map((chunk) => {
    const target = aliases[chunk.kana];
    const roman = target === undefined || chunk.fromTable ? undefined : table.get(target);
    return roman === undefined ? chunk : { kana: chunk.kana, roman, fromTable: true };
  });
}

function record(errors: string[], seen: Set<string>, message: string) {
  if (seen.has(message)) return;
  seen.add(message);
  errors.push(message);
}

/** 空のキー列。打鍵ごとに空の配列を作らず、読み取り専用の1つを共有する。 */
const NO_KEYS: readonly string[] = Object.freeze([]);

/**
 * 参加の列を、同じ中身なら同じ配列にまとめる。同じ配列でよく使うキーの組は繰り返し現れるので、
 * 打鍵ごとに配列・参加・キー列・役割列を作ると打鍵数に比例して重くなる。作った後に書き換えない値だけを共有する。
 */
function internParticipations(
  pool: Map<string, readonly StrokeParticipation[]>,
  participations: readonly StrokeParticipation[],
): readonly StrokeParticipation[] {
  const signature = participations
    .map(
      (entry) =>
        `${entry.hand}|${entry.finger}|${entry.keys.map((key) => key.id).join(',')}|${entry.roles.join(',')}|${entry.holdPhase ?? ''}|${(entry.triggerOrders ?? []).join(',')}|${entry.modifier === true ? 'm' : ''}`,
    )
    .join(';');
  const known = pool.get(signature);
  if (known !== undefined) return known;
  pool.set(signature, participations);
  return participations;
}

/**
 * 仕様 §10。ステップiの押下直後の全指位置。
 * そのステップで押した指は目標位置、それ以外はホームを既定とする。
 * 後続の同指打鍵で「残す」が選ばれた区間だけ、先行スナップショットを
 * restoreStaySnapshotsが前回キーへ戻す。
 */
function snapshot(prev: Record<Finger, Point>, last: Record<Finger, number>, index: number, geometry: Geometry): Record<Finger, Point> {
  const out = {} as Record<Finger, Point>;
  for (const finger of ALL_FINGERS) {
    out[finger] = last[finger] === index ? prev[finger] : geometry.homes[finger];
  }
  return out;
}

/**
 * 後続の同指打鍵で残留が確定した区間を、前回キー位置へ戻す。
 * `strokes[i].index === i` を前提に、区間 (previousIndex, currentIndex) だけを直接引く。
 */
function restoreStaySnapshots(strokes: Stroke[], previousIndex: number, currentIndex: number, finger: Finger, position: Point): void {
  if (!Number.isFinite(previousIndex)) return;
  const end = Math.min(currentIndex, strokes.length);
  for (let i = previousIndex + 1; i < end; i++) {
    strokes[i].positions[finger] = position;
  }
}
