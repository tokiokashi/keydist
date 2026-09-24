import {
  ALL_FINGERS,
  assignmentWithHomeKeys,
  buildGeometry,
  isPresetGeometryKind,
  resolveKeyId,
  type Finger,
} from './geometry.ts';
import type { GeometrySettings } from './geometry-settings.ts';
import type { Layout } from './layouts/index.ts';
import {
  actionsPerSecondFromIntervals,
  calibrationActionPair,
  calibrationDirectedSameHandPairs,
  calibrationEligibleKeyIds,
  calibrationKeyMatches,
  calibrationKeyPairs,
  calibrationSameHandPairs,
  CALIBRATION_ACTION_SAMPLES,
  CALIBRATION_ACTIONS_PER_SECOND_MAX,
  CALIBRATION_ACTIONS_PER_SECOND_MIN,
  CALIBRATION_FINGER_SAMPLES,
  CALIBRATION_FINGER_SPEED_MAX,
  CALIBRATION_FINGER_SPEED_MIN,
  CALIBRATION_SAME_HAND_SAMPLES,
  clearPlaybackCalibration,
  fallbackFingerSpeedFromSamples,
  fingerSpeedFromSamples,
  handDirection,
  sameHandDirectedFingerPairKey,
  sameHandFingerPairKey,
  savePlaybackCalibration,
  type CalibrationKeyPair,
  type FingerSpeedSample,
  type PlaybackCalibration,
} from './playback-calibration.ts';
import type { UiPlaybackState, UiStateStorage, UiStateV1 } from './ui-state.ts';

export type CalibrationDirection = 'L→R' | 'R→L';

export interface AnalyzerCalibrationValues {
  actions: string;
  directions: Record<CalibrationDirection, string>;
  sameHand: string;
  sameHandPairs: Record<string, string>;
  directedPairs: Record<string, string>;
  fingerSpeed: string;
  fingers: Record<Finger, string>;
}

export interface AnalyzerCalibrationSnapshot {
  values: AnalyzerCalibrationValues;
  instruction: string;
  progress: string;
  error: string;
  showingResult: boolean;
  startLabel: string;
  startDisabled: boolean;
  arpeggioDisabled: boolean;
  focusedToken?: string;
  livePrompt?: string;
  revision: number;
}

export interface AnalyzerCalibrationModel {
  getSnapshot(): AnalyzerCalibrationSnapshot;
  subscribe(listener: () => void): () => void;
  open(editSaved: boolean): boolean;
  close(): void;
  beginNormal(): void;
  beginArpeggio(): void;
  startFocused(token: string): void;
  handleKeyDown(event: KeyboardEvent): void;
  setBaseValue(field: 'actions' | 'sameHand' | 'fingerSpeed', value: string): void;
  setDirection(direction: CalibrationDirection, value: string): void;
  setSameHandPair(pairKey: string, value: string): void;
  setDirectedPair(pairKey: string, value: string): void;
  setFinger(finger: Finger, value: string): void;
  save(): boolean;
  discard(): boolean;
}

export interface AnalyzerCalibrationModelContext {
  storage: UiStateStorage | undefined;
  getUiState(): UiStateV1;
  updatePlaybackSetting<K extends keyof UiPlaybackState>(
    key: K,
    value: UiPlaybackState[K],
  ): void;
  getPlaybackGeometry(): ReturnType<typeof buildGeometry> | undefined;
  getGeometrySettings(): GeometrySettings;
  getPlaybackLayout(): Layout | undefined;
  getCalibration(): PlaybackCalibration | undefined;
  setCalibration(calibration: PlaybackCalibration | undefined): void;
  setPlaybackCalibration(calibration: PlaybackCalibration | undefined): void;
}

type CalibrationPhase = 'actions' | 'finger' | 'same-hand' | 'arpeggio' | 'result';
type CalibrationMode = 'normal' | 'arpeggio';
type CalibrationFocusKind =
  | 'actions'
  | 'direction'
  | 'finger'
  | 'same-hand-pair'
  | 'directed-pair';

interface CalibrationArpeggioPair {
  kind: 'direction' | 'directed-pair';
  token: string;
  keys: [string, string];
}

interface CalibrationSession {
  phase: CalibrationPhase;
  actionKeys: [string, string];
  actionIntervals: number[];
  actionIntervalsByDirection: Record<CalibrationDirection, number[]>;
  expectedKeyIndex: number;
  lastTimestamp?: number;
  pairs: CalibrationKeyPair[];
  pairIndex: number;
  fingerSamples: FingerSpeedSample[];
  pairSampleCount: number;
  sameHandPairs: [string, string][];
  sameHandPairFingerKeys: string[];
  sameHandPairIndex: number;
  sameHandIntervals: number[];
  sameHandPairIntervals: number[][];
  sameHandPairDirectedIntervals: Record<string, number[]>;
  sameHandPairSampleCount: number;
  mode: CalibrationMode;
  arpeggioPairs: CalibrationArpeggioPair[];
  arpeggioPairIndex: number;
  arpeggioPairIntervals: number[][];
  arpeggioPairSampleCount: number;
}

interface CalibrationFocusSession {
  kind: CalibrationFocusKind;
  token: string;
  keys: [string, string];
  finger?: Finger;
  distance?: number;
  intervals: number[];
  expectedKeyIndex: number;
  lastTimestamp?: number;
}

interface CalibrationDirectionalDraft {
  actionsPerSecondByDirection?: Readonly<Partial<Record<CalibrationDirection, number>>>;
  sameHandDifferentFingerActionsPerSecondByDirectedPair?: Readonly<Record<string, number>>;
}

const FINGER_LABEL: Record<Finger, string> = {
  LP: '左小指',
  LR: '左薬指',
  LM: '左中指',
  LI: '左人差指',
  LT: '左親指',
  RT: '右親指',
  RI: '右人差指',
  RM: '右中指',
  RR: '右薬指',
  RP: '右小指',
};

function emptyFingerValues(): Record<Finger, string> {
  return Object.fromEntries(ALL_FINGERS.map((finger) => [finger, ''])) as Record<Finger, string>;
}

function emptyValues(): AnalyzerCalibrationValues {
  return {
    actions: '',
    directions: { 'L→R': '', 'R→L': '' },
    sameHand: '',
    sameHandPairs: {},
    directedPairs: {},
    fingerSpeed: '',
    fingers: emptyFingerValues(),
  };
}

function cloneValues(values: AnalyzerCalibrationValues): AnalyzerCalibrationValues {
  return {
    ...values,
    directions: { ...values.directions },
    sameHandPairs: { ...values.sameHandPairs },
    directedPairs: { ...values.directedPairs },
    fingers: { ...values.fingers },
  };
}

function numberString(value: number | undefined): string {
  return value === undefined ? '' : value.toFixed(2);
}

export function createAnalyzerCalibrationModel(
  ctx: AnalyzerCalibrationModelContext,
): AnalyzerCalibrationModel {
  let values = emptyValues();
  let calibrationSession: CalibrationSession | undefined;
  let calibrationFocusSession: CalibrationFocusSession | undefined;
  let calibrationEditMode = false;
  let active = false;
  let error = '';
  let revision = 0;
  let calibrationDirectionalDraft: CalibrationDirectionalDraft = {};
  const listeners = new Set<() => void>();

  const currentCalibrationDirectionalDraft = (): CalibrationDirectionalDraft => {
    const calibration = ctx.getCalibration();
    return {
      actionsPerSecondByDirection: calibration?.actionsPerSecondByDirection,
      sameHandDifferentFingerActionsPerSecondByDirectedPair:
        calibration?.sameHandDifferentFingerActionsPerDirectedPair,
    };
  };

  const calibrationKeyLabel = (keyId: string): string => {
    const layoutLabel = ctx.getPlaybackLayout()?.legends.get(resolveKeyId(keyId));
    const label = layoutLabel && layoutLabel.trim().length > 0 ? layoutLabel : keyId;
    return /^[a-z]$/i.test(label) ? label.toUpperCase() : label;
  };

  const calibrationPairText = (pair: [string, string]): string =>
    `「${calibrationKeyLabel(pair[0])}」と「${calibrationKeyLabel(pair[1])}」`;

  const calibrationLivePromptText = (focus: CalibrationFocusSession): string => {
    const firstKey = calibrationKeyLabel(focus.keys[0]);
    const secondKey = calibrationKeyLabel(focus.keys[1]);
    const expected = focus.keys[focus.expectedKeyIndex];
    const combination = focus.kind === 'direction' || focus.kind === 'directed-pair'
      ? `「${firstKey}」→「${secondKey}」`
      : `「${firstKey}」↔「${secondKey}」`;
    return `${combination}を入力してください。次は「${calibrationKeyLabel(expected)}」です。`;
  };

  const view = (): Omit<AnalyzerCalibrationSnapshot, 'values' | 'revision'> => {
    const session = calibrationSession;
    const editingSavedCalibration = calibrationEditMode && ctx.getCalibration() !== undefined;
    const showingResult = session?.phase === 'result' || editingSavedCalibration;
    const calibrationInProgress = session !== undefined && session.phase !== 'result';
    const common = {
      error,
      showingResult,
      startLabel: session?.phase === 'result' ? '通常を測り直す' : '通常測定を開始',
      startDisabled: calibrationInProgress || calibrationFocusSession !== undefined,
      arpeggioDisabled: calibrationInProgress || calibrationFocusSession !== undefined,
      ...(calibrationFocusSession
        ? {
            focusedToken: calibrationFocusSession.token,
            livePrompt: calibrationLivePromptText(calibrationFocusSession),
          }
        : {}),
    };

    if (!session) {
      if (calibrationFocusSession) {
        const focus = calibrationFocusSession;
        const label = focus.kind === 'finger' && focus.finger
          ? `${FINGER_LABEL[focus.finger]}の指移動`
          : focus.kind === 'direction'
            ? `異手 ${focus.token.slice('direction:'.length)}`
            : focus.kind === 'directed-pair'
              ? `同手別指 ${focus.token.slice('directed-pair:'.length)}`
              : focus.kind === 'same-hand-pair'
                ? `同手別指 ${focus.token.slice('same-hand-pair:'.length)}`
                : '通常速度';
        const speedDescription = focus.kind === 'direction' || focus.kind === 'directed-pair'
          ? '方向をそろえたTransitionとして入力するときの速さ'
          : '普段の速度';
        return {
          ...common,
          instruction: focus.kind === 'direction' || focus.kind === 'directed-pair'
            ? `${label}: 「${calibrationKeyLabel(focus.keys[0])}」→「${calibrationKeyLabel(focus.keys[1])}」の順で、${speedDescription}で繰り返してください。この有向Transitionの時間だけを測定します。`
            : `${label}: 「${calibrationKeyLabel(focus.keys[0])}」と「${calibrationKeyLabel(focus.keys[1])}」を${speedDescription}で交互に打ってください。`,
          progress: `残り${Math.max(0, calibrationFocusSampleCount(focus.kind) - focus.intervals.length)}回`,
        };
      }

      const geometry = ctx.getPlaybackGeometry();
      const layout = ctx.getPlaybackLayout();
      const context = geometry && layout
        ? `${geometry.name}の形状で${layout.name}配列のキーを使ってキャリブレーションします。`
        : '選択中の物理形状と配列のキーを使ってキャリブレーションします。';
      const calibration = ctx.getCalibration();
      const sameHandPairCount = calibration
        ? Object.keys(calibration.sameHandDifferentFingerActionsPerSecondByPair).length
        : 0;

      if (editingSavedCalibration && calibration) {
        return {
          ...common,
          instruction: '保存済みの値を確認・編集できます。変更後は「この値を保存」を押してください。',
          progress: `保存済み: 通常 ${calibration.actionsPerSecond.toFixed(2)}、同手・別指 ${calibration.sameHandDifferentFingerActionsPerSecond.toFixed(2)} アクション/秒（組別 ${sameHandPairCount} 組）`,
        };
      }

      return {
        ...common,
        instruction: calibration
          ? `保存済み: 通常 ${calibration.actionsPerSecond.toFixed(2)}、同手・別指 ${calibration.sameHandDifferentFingerActionsPerSecond.toFixed(2)} アクション/秒（組別 ${sameHandPairCount} 組）、未測定指の指移動 ${calibration.fallbackFingerSpeedUnitsPerSecond.toFixed(2)} u/秒。`
          : `${context} 通常の打鍵速度、同じ手の別指の速度、各指の移動速度を測定して再生に反映します。`,
        progress: calibration ? context : '',
      };
    }

    if (session.phase === 'actions') {
      return {
        ...common,
        instruction: `${calibrationPairText(session.actionKeys)}を交互に、普段の速度で打ってください。`,
        progress: `残り${Math.max(0, CALIBRATION_ACTION_SAMPLES - session.actionIntervals.length)}回`,
      };
    }

    if (session.phase === 'finger') {
      const pair = session.pairs[session.pairIndex];
      return {
        ...common,
        instruction: `${FINGER_LABEL[pair.finger]}: 「${calibrationKeyLabel(pair.fromKey)}」と「${calibrationKeyLabel(pair.toKey)}」を交互に打ってください。`,
        progress: `${session.pairIndex + 1} / ${session.pairs.length} 指、残り${Math.max(0, CALIBRATION_FINGER_SAMPLES - session.pairSampleCount)}回`,
      };
    }

    if (session.phase === 'same-hand') {
      const pair = session.sameHandPairs[session.sameHandPairIndex];
      return {
        ...common,
        instruction: `同じ手の別指: ${calibrationPairText(pair)}を普段の速度で交互に打ってください。`,
        progress: `${session.sameHandPairIndex + 1} / ${session.sameHandPairs.length} 組、残り${Math.max(0, CALIBRATION_SAME_HAND_SAMPLES * 2 - session.sameHandPairSampleCount)}回`,
      };
    }

    if (session.phase === 'arpeggio') {
      const pair = session.arpeggioPairs[session.arpeggioPairIndex];
      const label = pair.kind === 'direction'
        ? `異手 ${pair.token}`
        : `同手・別指 ${pair.token}`;
      const requiredSamples = pair.kind === 'direction'
        ? CALIBRATION_ACTION_SAMPLES
        : CALIBRATION_SAME_HAND_SAMPLES;
      return {
        ...common,
        instruction: `${label}: 「${calibrationKeyLabel(pair.keys[0])}」→「${calibrationKeyLabel(pair.keys[1])}」の順で、方向をそろえたTransitionとして入力するときの速さで繰り返してください。この有向Transitionの時間だけを測定します。`,
        progress: `${session.arpeggioPairIndex + 1} / ${session.arpeggioPairs.length} 方向、残り${Math.max(0, requiredSamples - session.arpeggioPairSampleCount)}回`,
      };
    }

    return {
      ...common,
      instruction: '測定結果を確認し、必要なら数値を調整して保存してください。',
      progress: '測定完了',
    };
  };

  let snapshot: AnalyzerCalibrationSnapshot = {
    values: cloneValues(values),
    ...view(),
    revision,
  };

  const emit = (): void => {
    revision += 1;
    snapshot = {
      values: cloneValues(values),
      ...view(),
      revision,
    };
    for (const listener of listeners) listener();
  };

  const setError = (message: string): void => {
    error = message;
  };

  const restoreCalibrationForm = (calibration: PlaybackCalibration): void => {
    calibrationDirectionalDraft = currentCalibrationDirectionalDraft();
    values.actions = calibration.actionsPerSecond.toFixed(2);
    values.sameHand = calibration.sameHandDifferentFingerActionsPerSecond.toFixed(2);
    values.fingerSpeed = calibration.fallbackFingerSpeedUnitsPerSecond.toFixed(2);
    values.directions = {
      'L→R': numberString(calibration.actionsPerSecondByDirection?.['L→R']),
      'R→L': numberString(calibration.actionsPerSecondByDirection?.['R→L']),
    };
    values.sameHandPairs = Object.fromEntries(
      Object.entries(calibration.sameHandDifferentFingerActionsPerSecondByPair)
        .map(([pairKey, value]) => [pairKey, value.toFixed(2)]),
    );
    values.directedPairs = Object.fromEntries(
      Object.entries(calibration.sameHandDifferentFingerActionsPerDirectedPair ?? {})
        .map(([pairKey, value]) => [pairKey, value.toFixed(2)]),
    );
    values.fingers = emptyFingerValues();
    for (const [finger, value] of Object.entries(calibration.fingerSpeedUnitsPerSecond)) {
      if (value !== undefined) values.fingers[finger as Finger] = value.toFixed(2);
    }
  };

  const clearCalibrationForm = (): void => {
    values = emptyValues();
    calibrationDirectionalDraft = {};
  };

  const hasNormalCalibrationFormValues = (): boolean => {
    const baseValuesPresent = values.actions.trim() !== ''
      && values.sameHand.trim() !== ''
      && values.fingerSpeed.trim() !== '';
    if (!baseValuesPresent) return false;
    return Object.values(values.sameHandPairs).every((value) => value.trim() !== '');
  };

  const calibrationFocusSampleCount = (kind: CalibrationFocusKind): number => {
    if (kind === 'finger') return CALIBRATION_FINGER_SAMPLES;
    if (kind === 'actions' || kind === 'direction') return CALIBRATION_ACTION_SAMPLES;
    if (kind === 'directed-pair') return CALIBRATION_SAME_HAND_SAMPLES;
    return CALIBRATION_SAME_HAND_SAMPLES * 2;
  };

  const finishFocusedCalibration = (): void => {
    const session = calibrationFocusSession;
    if (!session) return;
    const rate = actionsPerSecondFromIntervals(session.intervals);
    if (rate === undefined) {
      setError('測定値が不足しています。もう一度測ってください。');
      calibrationFocusSession = undefined;
      emit();
      return;
    }

    if (session.kind === 'actions') {
      values.actions = rate.toFixed(2);
    } else if (session.kind === 'direction') {
      const direction = session.token.slice('direction:'.length) as CalibrationDirection;
      values.directions[direction] = rate.toFixed(2);
    } else if (session.kind === 'same-hand-pair') {
      values.sameHandPairs[session.token.slice('same-hand-pair:'.length)] = rate.toFixed(2);
    } else if (session.kind === 'directed-pair') {
      values.directedPairs[session.token.slice('directed-pair:'.length)] = rate.toFixed(2);
    } else if (
      session.kind === 'finger'
      && session.finger !== undefined
      && session.distance !== undefined
    ) {
      const speed = fingerSpeedFromSamples(session.intervals.map((durationMs) => ({
        finger: session.finger!,
        distance: session.distance!,
        durationMs,
      })));
      const value = speed.get(session.finger);
      if (value !== undefined) values.fingers[session.finger] = value.toFixed(2);
    }

    calibrationFocusSession = undefined;
    setError('');
    emit();
  };

  const finishArpeggioCalibrationSession = (session: CalibrationSession): void => {
    if (!hasNormalCalibrationFormValues()) {
      const calibration = ctx.getCalibration();
      if (calibration) restoreCalibrationForm(calibration);
      if (!hasNormalCalibrationFormValues()) {
        setError('通常測定の保存値が必要です。先に通常測定を完了してください。');
        calibrationSession = undefined;
        emit();
        return;
      }
    }

    const actionsPerSecondByDirection = {
      ...calibrationDirectionalDraft.actionsPerSecondByDirection,
    };
    const directedPairSpeeds = {
      ...calibrationDirectionalDraft.sameHandDifferentFingerActionsPerSecondByDirectedPair,
    };

    for (const [index, pair] of session.arpeggioPairs.entries()) {
      const rate = actionsPerSecondFromIntervals(session.arpeggioPairIntervals[index]);
      if (rate === undefined) {
        setError('方向別Transitionの測定値が不足しています。最初からもう一度測ってください。');
        calibrationSession = undefined;
        emit();
        return;
      }
      if (pair.kind === 'direction') {
        actionsPerSecondByDirection[pair.token as CalibrationDirection] = rate;
      } else {
        directedPairSpeeds[pair.token] = rate;
      }
    }

    session.phase = 'result';
    calibrationDirectionalDraft = {
      actionsPerSecondByDirection,
      sameHandDifferentFingerActionsPerSecondByDirectedPair: directedPairSpeeds,
    };
    values.directions = {
      'L→R': numberString(actionsPerSecondByDirection['L→R']),
      'R→L': numberString(actionsPerSecondByDirection['R→L']),
    };
    values.directedPairs = Object.fromEntries(
      Object.entries(directedPairSpeeds).map(([pairKey, value]) => [pairKey, numberString(value)]),
    );
    setError('');
    emit();
  };

  const finishCalibrationSession = (): void => {
    if (!calibrationSession) return;
    if (calibrationSession.mode === 'arpeggio') {
      finishArpeggioCalibrationSession(calibrationSession);
      return;
    }

    const actionsPerSecond = actionsPerSecondFromIntervals(calibrationSession.actionIntervals);
    const sameHandDifferentFingerActionsPerSecond =
      actionsPerSecondFromIntervals(calibrationSession.sameHandIntervals);
    const sameHandPairSpeeds = Object.fromEntries(
      calibrationSession.sameHandPairFingerKeys.map((pairKey, index) => [
        pairKey,
        actionsPerSecondFromIntervals(calibrationSession!.sameHandPairIntervals[index]),
      ]),
    );
    const fingerSpeeds = fingerSpeedFromSamples(calibrationSession.fingerSamples);
    const fallbackFingerSpeedUnitsPerSecond =
      fallbackFingerSpeedFromSamples(calibrationSession.fingerSamples);

    if (
      actionsPerSecond === undefined
      || sameHandDifferentFingerActionsPerSecond === undefined
      || Object.values(sameHandPairSpeeds).some((value) => value === undefined)
      || fingerSpeeds.size === 0
      || fallbackFingerSpeedUnitsPerSecond === undefined
    ) {
      setError('測定値が不足しています。最初からもう一度測ってください。');
      calibrationSession = undefined;
      emit();
      return;
    }

    calibrationSession.phase = 'result';
    values.actions = actionsPerSecond.toFixed(2);
    values.sameHand = sameHandDifferentFingerActionsPerSecond.toFixed(2);
    values.fingerSpeed = fallbackFingerSpeedUnitsPerSecond.toFixed(2);
    values.directions = {
      'L→R': numberString(calibrationDirectionalDraft.actionsPerSecondByDirection?.['L→R']),
      'R→L': numberString(calibrationDirectionalDraft.actionsPerSecondByDirection?.['R→L']),
    };
    values.sameHandPairs = Object.fromEntries(
      Object.entries(sameHandPairSpeeds).map(([pairKey, value]) => [pairKey, numberString(value)]),
    );
    values.directedPairs = Object.fromEntries(
      Object.entries(
        calibrationDirectionalDraft.sameHandDifferentFingerActionsPerSecondByDirectedPair ?? {},
      ).map(([pairKey, value]) => [pairKey, numberString(value)]),
    );
    values.fingers = emptyFingerValues();
    for (const [finger, value] of fingerSpeeds) {
      values.fingers[finger] = value.toFixed(2);
    }
    setError('');
    emit();
  };

  const beginNormal = (): void => {
    calibrationEditMode = false;
    calibrationFocusSession = undefined;
    const geometryKind = ctx.getUiState().conditions.defaults.geometry;
    const assignment = assignmentWithHomeKeys(
      ctx.getGeometrySettings().assignment,
      ctx.getPlaybackLayout()?.homeKeys,
    );
    const geometry = ctx.getPlaybackGeometry() ?? buildGeometry(
      isPresetGeometryKind(geometryKind) ? geometryKind : ctx.getGeometrySettings().shape,
      assignment,
    );
    const eligibleKeyIds = calibrationEligibleKeyIds(
      geometry,
      ctx.getPlaybackLayout()?.legends,
    );
    const actionKeys = calibrationActionPair(geometry, eligibleKeyIds);
    const pairs = calibrationKeyPairs(geometry, eligibleKeyIds);
    const sameHandPairs = calibrationSameHandPairs(geometry, eligibleKeyIds);
    const sameHandPairFingerKeys = sameHandPairs.map(([left, right]) => {
      const leftFinger = geometry.keys.get(left)?.finger;
      const rightFinger = geometry.keys.get(right)?.finger;
      return leftFinger && rightFinger
        ? sameHandFingerPairKey(leftFinger, rightFinger)
        : undefined;
    });

    if (
      !actionKeys
      || pairs.length === 0
      || sameHandPairs.length === 0
      || sameHandPairFingerKeys.some((key) => key === undefined)
    ) {
      setError('この物理配列では測定用のキーを作れません。');
      emit();
      return;
    }

    calibrationSession = {
      phase: 'actions',
      actionKeys,
      actionIntervals: [],
      actionIntervalsByDirection: { 'L→R': [], 'R→L': [] },
      expectedKeyIndex: 0,
      pairs,
      pairIndex: 0,
      fingerSamples: [],
      pairSampleCount: 0,
      sameHandPairs,
      sameHandPairFingerKeys: sameHandPairFingerKeys as string[],
      sameHandPairIndex: 0,
      sameHandIntervals: [],
      sameHandPairIntervals: sameHandPairs.map(() => []),
      sameHandPairDirectedIntervals: {},
      sameHandPairSampleCount: 0,
      mode: 'normal',
      arpeggioPairs: [],
      arpeggioPairIndex: 0,
      arpeggioPairIntervals: [],
      arpeggioPairSampleCount: 0,
    };
    setError('');
    emit();
  };

  const beginArpeggio = (): void => {
    calibrationEditMode = false;
    calibrationFocusSession = undefined;
    if (!hasNormalCalibrationFormValues()) {
      const calibration = ctx.getCalibration();
      if (!calibration) {
        setError('先に通常測定を完了して保存値を用意してください。');
        emit();
        return;
      }
      restoreCalibrationForm(calibration);
    }

    const geometryKind = ctx.getUiState().conditions.defaults.geometry;
    const assignment = assignmentWithHomeKeys(
      ctx.getGeometrySettings().assignment,
      ctx.getPlaybackLayout()?.homeKeys,
    );
    const geometry = ctx.getPlaybackGeometry() ?? buildGeometry(
      isPresetGeometryKind(geometryKind) ? geometryKind : ctx.getGeometrySettings().shape,
      assignment,
    );
    const eligibleKeyIds = calibrationEligibleKeyIds(
      geometry,
      ctx.getPlaybackLayout()?.legends,
    );
    const actionKeys = calibrationActionPair(geometry, eligibleKeyIds);
    const arpeggioPairs: CalibrationArpeggioPair[] = [];
    if (actionKeys) {
      arpeggioPairs.push(
        { kind: 'direction', token: 'L→R', keys: [actionKeys[0], actionKeys[1]] },
        { kind: 'direction', token: 'R→L', keys: [actionKeys[1], actionKeys[0]] },
      );
    }
    for (const [fromKey, toKey] of calibrationDirectedSameHandPairs(geometry, eligibleKeyIds)) {
      const fromFinger = geometry.keys.get(fromKey)?.finger;
      const toFinger = geometry.keys.get(toKey)?.finger;
      const token = fromFinger && toFinger
        ? sameHandDirectedFingerPairKey(fromFinger, toFinger)
        : undefined;
      if (token) {
        arpeggioPairs.push({
          kind: 'directed-pair',
          token,
          keys: [fromKey, toKey],
        });
      }
    }

    if (!actionKeys || arpeggioPairs.length === 0) {
      setError('この物理配列では方向別Transition測定用のキーを作れません。');
      emit();
      return;
    }

    calibrationSession = {
      phase: 'arpeggio',
      actionKeys,
      actionIntervals: [],
      actionIntervalsByDirection: { 'L→R': [], 'R→L': [] },
      expectedKeyIndex: 0,
      pairs: [],
      pairIndex: 0,
      fingerSamples: [],
      pairSampleCount: 0,
      sameHandPairs: [],
      sameHandPairFingerKeys: [],
      sameHandPairIndex: 0,
      sameHandIntervals: [],
      sameHandPairIntervals: [],
      sameHandPairDirectedIntervals: {},
      sameHandPairSampleCount: 0,
      mode: 'arpeggio',
      arpeggioPairs,
      arpeggioPairIndex: 0,
      arpeggioPairIntervals: arpeggioPairs.map(() => []),
      arpeggioPairSampleCount: 0,
    };
    setError('');
    emit();
  };

  const startFocused = (token: string): void => {
    const geometryKind = ctx.getUiState().conditions.defaults.geometry;
    const assignment = assignmentWithHomeKeys(
      ctx.getGeometrySettings().assignment,
      ctx.getPlaybackLayout()?.homeKeys,
    );
    const geometry = ctx.getPlaybackGeometry() ?? buildGeometry(
      isPresetGeometryKind(geometryKind) ? geometryKind : ctx.getGeometrySettings().shape,
      assignment,
    );
    const eligibleKeyIds = calibrationEligibleKeyIds(
      geometry,
      ctx.getPlaybackLayout()?.legends,
    );
    const actionKeys = calibrationActionPair(geometry, eligibleKeyIds);
    const pairs = calibrationKeyPairs(geometry, eligibleKeyIds);
    const sameHandPairs = calibrationSameHandPairs(geometry, eligibleKeyIds);
    const homeKey = (finger: Finger): string | undefined =>
      geometry.assignment.homeKey[finger as Exclude<Finger, 'LT' | 'RT'>];

    let kind: CalibrationFocusKind;
    let keys: [string, string] | undefined;
    let finger: Finger | undefined;
    let distance: number | undefined;
    const prefix = token.split(':', 1)[0];
    const value = prefix === token ? undefined : token.slice(prefix.length + 1);

    if (token === 'actions' && actionKeys) {
      kind = 'actions';
      keys = actionKeys;
    } else if (
      prefix === 'direction'
      && actionKeys
      && (value === 'L→R' || value === 'R→L')
    ) {
      kind = 'direction';
      keys = value === 'L→R' ? actionKeys : [actionKeys[1], actionKeys[0]];
    } else if (prefix === 'finger' && value && ALL_FINGERS.includes(value as Finger)) {
      const pair = pairs.find((candidate) => candidate.finger === value);
      kind = 'finger';
      finger = value as Finger;
      keys = pair ? [pair.fromKey, pair.toKey] : undefined;
      distance = pair?.distance;
    } else if (prefix === 'same-hand-pair' && value) {
      const pair = sameHandPairs.find(([first, second]) => {
        const firstFinger = geometry.keys.get(first)?.finger;
        const secondFinger = geometry.keys.get(second)?.finger;
        return firstFinger
          && secondFinger
          && sameHandFingerPairKey(firstFinger, secondFinger) === value;
      });
      kind = 'same-hand-pair';
      keys = pair;
    } else if (prefix === 'directed-pair' && value) {
      const [from, to] = value.split('>') as [Finger, Finger];
      kind = 'directed-pair';
      const fromKey = homeKey(from);
      const toKey = homeKey(to);
      keys = fromKey && toKey ? [fromKey, toKey] : undefined;
    } else {
      setError('この項目の測定キーを解決できません。');
      emit();
      return;
    }

    if (!keys || !eligibleKeyIds.has(keys[0]) || !eligibleKeyIds.has(keys[1])) {
      setError('この項目では測定用のキーを作れません。');
      emit();
      return;
    }

    calibrationFocusSession = {
      kind,
      token,
      keys,
      finger,
      distance,
      intervals: [],
      expectedKeyIndex: 0,
    };
    calibrationSession = undefined;
    calibrationEditMode = true;
    setError('');
    emit();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!active || event.repeat) return;
    const session = calibrationSession;

    if (calibrationFocusSession) {
      const focus = calibrationFocusSession;
      const expected = focus.keys[focus.expectedKeyIndex];
      if (!calibrationKeyMatches(event, expected, calibrationKeyLabel(expected))) {
        setError(`今は「${calibrationKeyLabel(expected)}」を押す番です。`);
        emit();
        return;
      }

      event.preventDefault();
      setError('');
      const now = performance.now();
      if (focus.lastTimestamp !== undefined) {
        const durationMs = now - focus.lastTimestamp;
        if (durationMs <= 0) return;
        const measureForward = focus.kind === 'direction' || focus.kind === 'directed-pair';
        if (!measureForward || focus.expectedKeyIndex === 1) focus.intervals.push(durationMs);
      }
      focus.lastTimestamp = now;
      focus.expectedKeyIndex = focus.expectedKeyIndex === 0 ? 1 : 0;
      if (focus.intervals.length >= calibrationFocusSampleCount(focus.kind)) {
        finishFocusedCalibration();
      } else {
        emit();
      }
      return;
    }

    if (!session || session.phase === 'result') return;
    const expected = session.phase === 'actions'
      ? session.actionKeys[session.expectedKeyIndex]
      : session.phase === 'finger'
        ? session.pairs[session.pairIndex][
            session.expectedKeyIndex === 0 ? 'fromKey' : 'toKey'
          ]
        : session.phase === 'same-hand'
          ? session.sameHandPairs[session.sameHandPairIndex][session.expectedKeyIndex]
          : session.arpeggioPairs[session.arpeggioPairIndex].keys[session.expectedKeyIndex];

    if (!calibrationKeyMatches(event, expected, calibrationKeyLabel(expected))) {
      setError(`今は「${calibrationKeyLabel(expected)}」を押す番です。`);
      emit();
      return;
    }

    event.preventDefault();
    setError('');
    const now = performance.now();
    if (session.lastTimestamp !== undefined) {
      const durationMs = now - session.lastTimestamp;
      if (durationMs <= 0) return;

      if (session.phase === 'actions') {
        session.actionIntervals.push(durationMs);
        const fromKey = session.actionKeys[session.expectedKeyIndex];
        const toKey = session.actionKeys[session.expectedKeyIndex === 0 ? 1 : 0];
        const fromFinger = ctx.getPlaybackGeometry()?.keys.get(fromKey)?.finger;
        const toFinger = ctx.getPlaybackGeometry()?.keys.get(toKey)?.finger;
        const direction = fromFinger && toFinger
          ? handDirection(fromFinger, toFinger)
          : undefined;
        if (direction) session.actionIntervalsByDirection[direction].push(durationMs);
      } else if (session.phase === 'finger') {
        session.fingerSamples.push({
          finger: session.pairs[session.pairIndex].finger,
          distance: session.pairs[session.pairIndex].distance,
          durationMs,
        });
        session.pairSampleCount++;
      } else if (session.phase === 'arpeggio') {
        if (session.expectedKeyIndex === 1) {
          session.arpeggioPairIntervals[session.arpeggioPairIndex].push(durationMs);
          session.arpeggioPairSampleCount++;
        }
      } else {
        session.sameHandIntervals.push(durationMs);
        session.sameHandPairIntervals[session.sameHandPairIndex].push(durationMs);
        const pair = session.sameHandPairs[session.sameHandPairIndex];
        const fromKey = pair[session.expectedKeyIndex];
        const toKey = pair[session.expectedKeyIndex === 0 ? 1 : 0];
        const fromFinger = ctx.getPlaybackGeometry()?.keys.get(fromKey)?.finger;
        const toFinger = ctx.getPlaybackGeometry()?.keys.get(toKey)?.finger;
        const directedPair = fromFinger && toFinger
          ? sameHandDirectedFingerPairKey(fromFinger, toFinger)
          : undefined;
        if (directedPair) {
          const intervals = session.sameHandPairDirectedIntervals[directedPair] ?? [];
          intervals.push(durationMs);
          session.sameHandPairDirectedIntervals[directedPair] = intervals;
        }
        session.sameHandPairSampleCount++;
      }
    }

    session.lastTimestamp = now;
    session.expectedKeyIndex = session.expectedKeyIndex === 0 ? 1 : 0;

    if (
      session.phase === 'actions'
      && session.actionIntervals.length >= CALIBRATION_ACTION_SAMPLES
    ) {
      session.phase = 'finger';
      session.expectedKeyIndex = 0;
      session.lastTimestamp = undefined;
    } else if (
      session.phase === 'finger'
      && session.pairSampleCount >= CALIBRATION_FINGER_SAMPLES
    ) {
      if (session.pairIndex + 1 >= session.pairs.length) {
        session.phase = 'same-hand';
        session.sameHandPairIndex = 0;
        session.sameHandPairSampleCount = 0;
        session.expectedKeyIndex = 0;
        session.lastTimestamp = undefined;
      } else {
        session.pairIndex++;
        session.pairSampleCount = 0;
        session.expectedKeyIndex = 0;
        session.lastTimestamp = undefined;
      }
    } else if (
      session.phase === 'same-hand'
      && session.sameHandPairSampleCount >= CALIBRATION_SAME_HAND_SAMPLES * 2
    ) {
      if (session.sameHandPairIndex + 1 >= session.sameHandPairs.length) {
        finishCalibrationSession();
        return;
      }
      session.sameHandPairIndex++;
      session.sameHandPairSampleCount = 0;
      session.expectedKeyIndex = 0;
      session.lastTimestamp = undefined;
    } else if (session.phase === 'arpeggio') {
      const pair = session.arpeggioPairs[session.arpeggioPairIndex];
      const requiredSamples = pair.kind === 'direction'
        ? CALIBRATION_ACTION_SAMPLES
        : CALIBRATION_SAME_HAND_SAMPLES;
      if (session.arpeggioPairSampleCount >= requiredSamples) {
        if (session.arpeggioPairIndex + 1 >= session.arpeggioPairs.length) {
          finishCalibrationSession();
          return;
        }
        session.arpeggioPairIndex++;
        session.arpeggioPairSampleCount = 0;
        session.expectedKeyIndex = 0;
        session.lastTimestamp = undefined;
      }
    }

    emit();
  };

  const save = (): boolean => {
    const actionsPerSecond = Number(values.actions);
    const sameHandDifferentFingerActionsPerSecond = Number(values.sameHand);
    const fallbackFingerSpeedUnitsPerSecond = Number(values.fingerSpeed);

    if (
      !Number.isFinite(actionsPerSecond)
      || actionsPerSecond < CALIBRATION_ACTIONS_PER_SECOND_MIN
      || actionsPerSecond > CALIBRATION_ACTIONS_PER_SECOND_MAX
    ) {
      setError(
        `通常速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`,
      );
      emit();
      return false;
    }
    if (
      !Number.isFinite(sameHandDifferentFingerActionsPerSecond)
      || sameHandDifferentFingerActionsPerSecond < CALIBRATION_ACTIONS_PER_SECOND_MIN
      || sameHandDifferentFingerActionsPerSecond > CALIBRATION_ACTIONS_PER_SECOND_MAX
    ) {
      setError(
        `同手・別指速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`,
      );
      emit();
      return false;
    }
    if (
      !Number.isFinite(fallbackFingerSpeedUnitsPerSecond)
      || fallbackFingerSpeedUnitsPerSecond < CALIBRATION_FINGER_SPEED_MIN
      || fallbackFingerSpeedUnitsPerSecond > CALIBRATION_FINGER_SPEED_MAX
    ) {
      setError(
        `未測定指の速度は ${CALIBRATION_FINGER_SPEED_MIN}〜${CALIBRATION_FINGER_SPEED_MAX} の範囲で入力してください。`,
      );
      emit();
      return false;
    }

    const fingerSpeedUnitsPerSecond: Partial<Record<Finger, number>> = {};
    for (const finger of ALL_FINGERS) {
      const raw = values.fingers[finger];
      if (raw.trim() === '') continue;
      const value = Number(raw);
      if (
        !Number.isFinite(value)
        || value < CALIBRATION_FINGER_SPEED_MIN
        || value > CALIBRATION_FINGER_SPEED_MAX
      ) {
        setError(
          `${FINGER_LABEL[finger]}の速度は ${CALIBRATION_FINGER_SPEED_MIN}〜${CALIBRATION_FINGER_SPEED_MAX} の範囲で入力してください。`,
        );
        emit();
        return false;
      }
      fingerSpeedUnitsPerSecond[finger] = value;
    }

    const sameHandDifferentFingerActionsPerSecondByPair: Record<string, number> = {};
    for (const [pairKey, raw] of Object.entries(values.sameHandPairs)) {
      if (raw.trim() === '') {
        setError('同手・別指の組ごとの測定値をすべて入力してください。');
        emit();
        return false;
      }
      const value = Number(raw);
      if (
        !Number.isFinite(value)
        || value < CALIBRATION_ACTIONS_PER_SECOND_MIN
        || value > CALIBRATION_ACTIONS_PER_SECOND_MAX
      ) {
        setError(
          `同手・別指の組ごとの速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`,
        );
        emit();
        return false;
      }
      sameHandDifferentFingerActionsPerSecondByPair[pairKey] = value;
    }

    const actionsPerSecondByDirection: Partial<Record<CalibrationDirection, number>> = {};
    for (const direction of ['L→R', 'R→L'] as const) {
      const raw = values.directions[direction];
      if (raw.trim() === '') continue;
      const value = Number(raw);
      if (
        !Number.isFinite(value)
        || value < CALIBRATION_ACTIONS_PER_SECOND_MIN
        || value > CALIBRATION_ACTIONS_PER_SECOND_MAX
      ) {
        setError(
          `異手・方向別の速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`,
        );
        emit();
        return false;
      }
      actionsPerSecondByDirection[direction] = value;
    }

    const sameHandDifferentFingerActionsPerSecondByDirectedPair: Record<string, number> = {};
    for (const [pairKey, raw] of Object.entries(values.directedPairs)) {
      if (raw.trim() === '') continue;
      const value = Number(raw);
      if (
        !Number.isFinite(value)
        || value < CALIBRATION_ACTIONS_PER_SECOND_MIN
        || value > CALIBRATION_ACTIONS_PER_SECOND_MAX
      ) {
        setError(
          `同手・別指の方向別速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`,
        );
        emit();
        return false;
      }
      sameHandDifferentFingerActionsPerSecondByDirectedPair[pairKey] = value;
    }

    const calibration: PlaybackCalibration = {
      actionsPerSecond,
      ...(Object.keys(actionsPerSecondByDirection).length === 0
        ? {}
        : { actionsPerSecondByDirection }),
      sameHandDifferentFingerActionsPerSecond,
      sameHandDifferentFingerActionsPerSecondByPair,
      ...(Object.keys(sameHandDifferentFingerActionsPerSecondByDirectedPair).length === 0
        ? {}
        : {
            sameHandDifferentFingerActionsPerDirectedPair:
              sameHandDifferentFingerActionsPerSecondByDirectedPair,
          }),
      fingerSpeedUnitsPerSecond,
      fallbackFingerSpeedUnitsPerSecond,
      measuredAt: Date.now(),
    };

    try {
      if (!ctx.storage) throw new Error('storage unavailable');
      savePlaybackCalibration(ctx.storage, calibration);
    } catch {
      setError('このブラウザには設定を保存できませんでした。');
      emit();
      return false;
    }

    ctx.setCalibration(calibration);
    ctx.updatePlaybackSetting('useCalibration', true);
    ctx.setPlaybackCalibration(calibration);
    calibrationEditMode = false;
    calibrationSession = undefined;
    calibrationFocusSession = undefined;
    active = false;
    setError('');
    emit();
    return true;
  };

  const discard = (): boolean => {
    try {
      if (!ctx.storage) throw new Error('storage unavailable');
      clearPlaybackCalibration(ctx.storage);
    } catch {
      setError('このブラウザの保存値を破棄できませんでした。');
      emit();
      return false;
    }

    ctx.setCalibration(undefined);
    ctx.updatePlaybackSetting('useCalibration', false);
    ctx.setPlaybackCalibration(undefined);
    calibrationEditMode = false;
    calibrationSession = undefined;
    calibrationFocusSession = undefined;
    clearCalibrationForm();
    setError('');
    emit();
    return true;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open(editSaved) {
      calibrationSession = undefined;
      calibrationFocusSession = undefined;
      setError('');
      if (editSaved) {
        const calibration = ctx.getCalibration();
        if (!calibration) return false;
        calibrationEditMode = true;
        restoreCalibrationForm(calibration);
      } else {
        calibrationEditMode = false;
        calibrationDirectionalDraft = currentCalibrationDirectionalDraft();
      }
      active = true;
      emit();
      return true;
    },
    close() {
      active = false;
      calibrationEditMode = false;
      calibrationSession = undefined;
      calibrationFocusSession = undefined;
      setError('');
      emit();
    },
    beginNormal,
    beginArpeggio,
    startFocused,
    handleKeyDown,
    setBaseValue(field, value) {
      values[field] = value;
      emit();
    },
    setDirection(direction, value) {
      values.directions[direction] = value;
      emit();
    },
    setSameHandPair(pairKey, value) {
      values.sameHandPairs[pairKey] = value;
      emit();
    },
    setDirectedPair(pairKey, value) {
      values.directedPairs[pairKey] = value;
      emit();
    },
    setFinger(finger, value) {
      values.fingers[finger] = value;
      emit();
    },
    save,
    discard,
  };
}
