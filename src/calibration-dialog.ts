import {
  ALL_FINGERS, assignmentWithHomeKeys, buildGeometry, isPresetGeometryKind, resolveKeyId, type Finger,
} from './geometry.ts';
import { ARPEGGIO_PRESETS, type ArpeggioConditions } from './playback-arpeggio.ts';
import {
  actionsPerSecondFromIntervals, calibrationActionPair, calibrationAdjacentSameHandPairs,
  calibrationEligibleKeyIds,
  calibrationKeyMatches, calibrationKeyPairs, calibrationSameHandPairs,
  CALIBRATION_ACTION_SAMPLES, CALIBRATION_ACTIONS_PER_SECOND_MAX,
  CALIBRATION_ACTIONS_PER_SECOND_MIN,
  CALIBRATION_FINGER_SAMPLES, CALIBRATION_FINGER_SPEED_MAX,
  CALIBRATION_FINGER_SPEED_MIN, CALIBRATION_SAME_HAND_SAMPLES,
  fallbackFingerSpeedFromSamples, fingerSpeedFromSamples, handDirection,
  sameHandDirectedFingerPairKey, sameHandFingerPairKey,
  type CalibrationKeyPair, type FingerSpeedSample, type PlaybackCalibration,
} from './playback-calibration.ts';
import type { Layout } from './layouts/index.ts';
import { FINGER_LABEL, type AppElements } from './app-dom.ts';
import type { UiPlaybackState, UiStateStorage, UiStateV1 } from './ui-state.ts';
import { savePlaybackCalibration } from './playback-calibration.ts';
import type { GeometrySettings } from './geometry-settings.ts';

export interface CalibrationDialogContext {
  el: AppElements;
  storage: UiStateStorage | undefined;
  getUiState: () => UiStateV1;
  updateUiState: (change: (draft: UiStateV1) => void) => void;
  updatePlaybackSetting: <K extends keyof UiPlaybackState>(key: K, value: UiPlaybackState[K]) => void;
  getPlaybackGeometry: () => ReturnType<typeof buildGeometry> | undefined;
  getGeometrySettings: () => GeometrySettings;
  getPlaybackLayout: () => Layout | undefined;
  getCalibration: () => PlaybackCalibration | undefined;
  setCalibration: (calibration: PlaybackCalibration) => void;
  setPlaybackCalibration: (calibration: PlaybackCalibration) => void;
}

export interface CalibrationDialogController {
  setup: () => void;
  open: () => void;
  openEdit: () => void;
  readArpeggioConditions: () => ArpeggioConditions | undefined;
  syncArpeggioConditionControls: () => void;
  arpeggioPresetId: () => string;
}

export function createCalibrationDialog(ctx: CalibrationDialogContext): CalibrationDialogController {
  const elements = ctx.el;

type CalibrationPhase = 'actions' | 'finger' | 'same-hand' | 'arpeggio' | 'result';
type CalibrationMode = 'normal' | 'arpeggio';
interface CalibrationArpeggioPair {
  kind: 'direction' | 'directed-pair';
  token: string;
  keys: [string, string];
}
interface CalibrationSession {
  phase: CalibrationPhase;
  actionKeys: [string, string];
  actionIntervals: number[];
  actionIntervalsByDirection: Record<'L→R' | 'R→L', number[]>;
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
type CalibrationFocusKind = 'actions' | 'direction' | 'finger' | 'same-hand-pair' | 'directed-pair';
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
let calibrationSession: CalibrationSession | undefined;
let calibrationFocusSession: CalibrationFocusSession | undefined;
let calibrationEditMode = false;
let calibrationDirectionalDraft: {
  actionsPerSecondByDirection?: Readonly<Partial<Record<'L→R' | 'R→L', number>>>;
  sameHandDifferentFingerActionsPerSecondByDirectedPair?: Readonly<Record<string, number>>;
} = {};

function currentCalibrationDirectionalDraft(): typeof calibrationDirectionalDraft {
  const calibration = ctx.getCalibration();
  return {
    actionsPerSecondByDirection: calibration?.actionsPerSecondByDirection,
    sameHandDifferentFingerActionsPerSecondByDirectedPair:
      calibration?.sameHandDifferentFingerActionsPerDirectedPair,
  };
}

function calibrationKeyLabel(keyId: string): string {
  const layoutLabel = ctx.getPlaybackLayout()?.legends.get(resolveKeyId(keyId));
  const label = layoutLabel && layoutLabel.trim().length > 0 ? layoutLabel : keyId;
  return /^[a-z]$/i.test(label) ? label.toUpperCase() : label;
}

function calibrationPairText(pair: [string, string]): string {
  return `「${calibrationKeyLabel(pair[0])}」と「${calibrationKeyLabel(pair[1])}」`;
}

function arpeggioPresetId(): string {
  const current = ctx.getUiState().conditions.defaults.arpeggio;
  const entry = Object.entries(ARPEGGIO_PRESETS).find(([, preset]) =>
    preset.minHorizontalSpread === current.minHorizontalSpread
    && preset.maxRowReversal === current.maxRowReversal
    && preset.maxRowStep === current.maxRowStep
    && preset.includeThumb === current.includeThumb
    && preset.breakOnOppositeHand === current.breakOnOppositeHand,
  );
  return entry?.[0] ?? 'custom';
}

function readArpeggioConditions(): ArpeggioConditions | undefined {
  const details = elements.playbackSettingsPanel.querySelector<HTMLElement>('[data-playback-arpeggio-conditions]');
  if (!details) return undefined;
  const input = (name: string): HTMLInputElement | null =>
    details.querySelector<HTMLInputElement>(`[data-playback-arpeggio-condition="${name}"]`);
  const spreadInput = input('minHorizontalSpread');
  const reversalInput = input('maxRowReversal');
  const stepInput = input('maxRowStep');
  const includeThumbInput = input('includeThumb');
  const oppositeHandInput = input('breakOnOppositeHand');
  if (!spreadInput || !reversalInput || !stepInput || !includeThumbInput || !oppositeHandInput) return undefined;
  const spread = Number(spreadInput.value);
  const nullableRowLimit = (rowInput: HTMLInputElement): number | null | undefined => {
    if (rowInput.value.trim() === '') return null;
    const value = Number(rowInput.value);
    return Number.isFinite(value) && value >= 0 && value <= 10 ? value : undefined;
  };
  const maxRowReversal = nullableRowLimit(reversalInput);
  const maxRowStep = nullableRowLimit(stepInput);
  if (!Number.isFinite(spread) || spread < 0 || spread > 20
    || maxRowReversal === undefined || maxRowStep === undefined) return undefined;
  return {
    minHorizontalSpread: spread,
    maxRowReversal,
    maxRowStep,
    includeThumb: includeThumbInput.checked,
    breakOnOppositeHand: oppositeHandInput.checked,
  };
}

function syncArpeggioConditionControls(): void {
  const details = elements.playbackSettingsPanel.querySelector<HTMLElement>('[data-playback-arpeggio-conditions]');
  if (!details) return;
  const conditions = ctx.getUiState().conditions.defaults.arpeggio;
  const input = (name: string): HTMLInputElement | null =>
    details.querySelector<HTMLInputElement>(`[data-playback-arpeggio-condition="${name}"]`);
  const spreadInput = input('minHorizontalSpread');
  const reversalInput = input('maxRowReversal');
  const stepInput = input('maxRowStep');
  const includeThumbInput = input('includeThumb');
  const oppositeHandInput = input('breakOnOppositeHand');
  if (spreadInput) spreadInput.value = String(conditions.minHorizontalSpread);
  if (reversalInput) reversalInput.value = conditions.maxRowReversal === null ? '' : String(conditions.maxRowReversal);
  if (stepInput) stepInput.value = conditions.maxRowStep === null ? '' : String(conditions.maxRowStep);
  if (includeThumbInput) includeThumbInput.checked = conditions.includeThumb;
  if (oppositeHandInput) oppositeHandInput.checked = conditions.breakOnOppositeHand;
}

function setCalibrationError(message: string): void {
  elements.calibrationError.textContent = message;
  elements.calibrationError.hidden = message.length === 0;
}

function calibrationLivePromptText(focus: CalibrationFocusSession): string {
  const expected = focus.keys[focus.expectedKeyIndex];
  return `次は「${calibrationKeyLabel(expected)}」を押してください。`;
}

function syncCalibrationLivePrompts(): void {
  const focus = calibrationFocusSession;
  for (const prompt of elements.calibrationResult.querySelectorAll<HTMLElement>('[data-calibration-live-prompt]')) {
    prompt.textContent = focus && prompt.dataset.calibrationLivePrompt === focus.token
      ? calibrationLivePromptText(focus)
      : '';
  }
}

function calibrationRemeasureButton(token: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost calibration-remeasure';
  button.dataset.calibrationRemeasure = token;
  button.textContent = 'この項目だけ測り直す';
  return button;
}

function appendCalibrationRemeasure(label: HTMLElement, token: string): void {
  const prompt = document.createElement('small');
  prompt.className = 'calibration-live-prompt';
  prompt.dataset.calibrationLivePrompt = token;
  label.append(calibrationRemeasureButton(token), prompt);
}

function renderCalibrationFingerInputs(values: Partial<Record<Finger, number>>): void {
  elements.calibrationFingerInputs.replaceChildren();
  for (const finger of ALL_FINGERS) {
    const label = document.createElement('label');
    label.className = 'ctl calibration-finger-speed';
    const name = document.createElement('span');
    name.textContent = FINGER_LABEL[finger];
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(CALIBRATION_FINGER_SPEED_MIN);
    input.max = String(CALIBRATION_FINGER_SPEED_MAX);
    input.step = '0.01';
    input.dataset.calibrationFinger = finger;
    input.setAttribute('aria-label', `${FINGER_LABEL[finger]}の指移動速度（u/秒）`);
    const value = values[finger];
    if (value !== undefined) input.value = value.toFixed(2);
    label.append(name, input);
    appendCalibrationRemeasure(label, `finger:${finger}`);
    elements.calibrationFingerInputs.append(label);
  }
}

function calibrationSameHandPairLabel(pairKey: string): string {
  const [first, second] = pairKey.split(':') as [Finger, Finger];
  return `${FINGER_LABEL[first] ?? first}・${FINGER_LABEL[second] ?? second}`;
}

function renderCalibrationSameHandInputs(
  values: Readonly<Record<string, number>>,
  pairKeys: readonly string[],
): void {
  elements.calibrationSameHandPairs.replaceChildren();
  for (const pairKey of pairKeys) {
    const label = document.createElement('label');
    label.className = 'ctl calibration-finger-speed';
    const name = document.createElement('span');
    name.textContent = calibrationSameHandPairLabel(pairKey);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(CALIBRATION_ACTIONS_PER_SECOND_MIN);
    input.max = String(CALIBRATION_ACTIONS_PER_SECOND_MAX);
    input.step = '0.01';
    input.dataset.calibrationSameHandPair = pairKey;
    input.setAttribute('aria-label', `${calibrationSameHandPairLabel(pairKey)}のアクション速度`);
    const value = values[pairKey];
    if (value !== undefined) input.value = value.toFixed(2);
    label.append(name, input);
    appendCalibrationRemeasure(label, `same-hand-pair:${pairKey}`);
    elements.calibrationSameHandPairs.append(label);
  }
}

function renderCalibrationDirectionalInputs(
  values: Readonly<Partial<Record<'L→R' | 'R→L', number>>> | undefined,
): void {
  elements.calibrationDirections.replaceChildren();
  for (const direction of ['L→R', 'R→L'] as const) {
    const label = document.createElement('label');
    label.className = 'ctl calibration-finger-speed';
    const name = document.createElement('span');
    name.textContent = direction;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(CALIBRATION_ACTIONS_PER_SECOND_MIN);
    input.max = String(CALIBRATION_ACTIONS_PER_SECOND_MAX);
    input.step = '0.01';
    input.dataset.calibrationDirection = direction;
    const value = values?.[direction];
    if (value !== undefined) input.value = value.toFixed(2);
    label.append(name, input);
    appendCalibrationRemeasure(label, `direction:${direction}`);
    elements.calibrationDirections.append(label);
  }
}

function renderCalibrationDirectedPairInputs(values: Readonly<Record<string, number>> | undefined): void {
  elements.calibrationDirectedPairs.replaceChildren();
  for (const [pairKey, value] of Object.entries(values ?? {})) {
    const label = document.createElement('label');
    label.className = 'ctl calibration-finger-speed';
    const name = document.createElement('span');
    const [from, to] = pairKey.split('>') as [Finger, Finger];
    name.textContent = `${FINGER_LABEL[from] ?? from}→${FINGER_LABEL[to] ?? to}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(CALIBRATION_ACTIONS_PER_SECOND_MIN);
    input.max = String(CALIBRATION_ACTIONS_PER_SECOND_MAX);
    input.step = '0.01';
    input.dataset.calibrationDirectedPair = pairKey;
    input.value = value.toFixed(2);
    label.append(name, input);
    appendCalibrationRemeasure(label, `directed-pair:${pairKey}`);
    elements.calibrationDirectedPairs.append(label);
  }
}

function startFocusedCalibration(token: string): void {
  const geometryKind = ctx.getUiState().conditions.defaults.geometry;
  const assignment = assignmentWithHomeKeys(
    ctx.getGeometrySettings().assignment,
    ctx.getPlaybackLayout()?.homeKeys,
  );
  const geometry = ctx.getPlaybackGeometry() ?? buildGeometry(
    isPresetGeometryKind(geometryKind) ? geometryKind : ctx.getGeometrySettings().shape,
    assignment,
  );
  const eligibleKeyIds = calibrationEligibleKeyIds(geometry, ctx.getPlaybackLayout()?.legends);
  const actionKeys = calibrationActionPair(geometry, eligibleKeyIds);
  const pairs = calibrationKeyPairs(geometry, eligibleKeyIds);
  const sameHandPairs = calibrationSameHandPairs(geometry, eligibleKeyIds);
  const homeKey = (finger: Finger): string | undefined => geometry.assignment.homeKey[finger as Exclude<Finger, 'LT' | 'RT'>];
  let kind: CalibrationFocusKind;
  let keys: [string, string] | undefined;
  let finger: Finger | undefined;
  let distance: number | undefined;
  const prefix = token.split(':', 1)[0];
  const value = prefix === token ? undefined : token.slice(prefix.length + 1);
  if (token === 'actions' && actionKeys) {
    kind = 'actions';
    keys = actionKeys;
  } else if (prefix === 'direction' && actionKeys && (value === 'L→R' || value === 'R→L')) {
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
      return firstFinger && secondFinger && sameHandFingerPairKey(firstFinger, secondFinger) === value;
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
    setCalibrationError('この項目の測定キーを解決できません。');
    return;
  }
  if (!keys || !eligibleKeyIds.has(keys[0]) || !eligibleKeyIds.has(keys[1])) {
    setCalibrationError('この項目では測定用のキーを作れません。');
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
  setCalibrationError('');
  updateCalibrationDialog();
  const prompt = [...elements.calibrationResult.querySelectorAll<HTMLElement>('[data-calibration-live-prompt]')]
    .find((candidate) => candidate.dataset.calibrationLivePrompt === token);
  prompt?.closest<HTMLElement>('label')?.scrollIntoView({ block: 'nearest' });
}

function calibrationFocusSampleCount(kind: CalibrationFocusKind): number {
  if (kind === 'finger') return CALIBRATION_FINGER_SAMPLES;
  if (kind === 'actions' || kind === 'direction') return CALIBRATION_ACTION_SAMPLES;
  if (kind === 'directed-pair') return CALIBRATION_SAME_HAND_SAMPLES;
  // 通常の同手速度は往復それぞれ6回ずつ取る。
  return CALIBRATION_SAME_HAND_SAMPLES * 2;
}

function finishFocusedCalibration(): void {
  const session = calibrationFocusSession;
  if (!session) return;
  const rate = actionsPerSecondFromIntervals(session.intervals);
  if (rate === undefined) {
    setCalibrationError('測定値が不足しています。もう一度測ってください。');
    calibrationFocusSession = undefined;
    updateCalibrationDialog();
    return;
  }
  if (session.kind === 'actions') {
    elements.calibrationActions.value = rate.toFixed(2);
  } else if (session.kind === 'direction') {
    const input = elements.calibrationDirections.querySelector<HTMLInputElement>(
      `[data-calibration-direction="${CSS.escape(session.token.slice('direction:'.length))}"]`,
    );
    if (input) input.value = rate.toFixed(2);
  } else if (session.kind === 'same-hand-pair') {
    const input = elements.calibrationSameHandPairs.querySelector<HTMLInputElement>(
      `[data-calibration-same-hand-pair="${CSS.escape(session.token.slice('same-hand-pair:'.length))}"]`,
    );
    if (input) input.value = rate.toFixed(2);
  } else if (session.kind === 'directed-pair') {
    const input = elements.calibrationDirectedPairs.querySelector<HTMLInputElement>(
      `[data-calibration-directed-pair="${CSS.escape(session.token.slice('directed-pair:'.length))}"]`,
    );
    if (input) input.value = rate.toFixed(2);
  } else if (session.kind === 'finger' && session.finger !== undefined && session.distance !== undefined) {
    const speed = fingerSpeedFromSamples(session.intervals.map((durationMs) => ({
      finger: session.finger!,
      distance: session.distance!,
      durationMs,
    })));
    const input = elements.calibrationFingerInputs.querySelector<HTMLInputElement>(
      `[data-calibration-finger="${CSS.escape(session.finger)}"]`,
    );
    const value = speed.get(session.finger);
    if (input && value !== undefined) input.value = value.toFixed(2);
  }
  calibrationFocusSession = undefined;
  setCalibrationError('');
  updateCalibrationDialog();
}

function updateCalibrationDialog(): void {
  const session = calibrationSession;
  const editingSavedCalibration = calibrationEditMode && ctx.getCalibration() !== undefined;
  const showingResult = session?.phase === 'result' || editingSavedCalibration;
  elements.calibrationResult.hidden = !showingResult;
  elements.calibrationSave.hidden = !showingResult;
  elements.calibrationStart.textContent = session?.phase === 'result' ? '通常を測り直す' : '通常測定を開始';
  const calibrationInProgress = session !== undefined && session.phase !== 'result';
  elements.calibrationStart.disabled = calibrationInProgress || calibrationFocusSession !== undefined;
  elements.calibrationArpeggioStart.disabled = calibrationInProgress || calibrationFocusSession !== undefined;
  syncCalibrationLivePrompts();
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
        ? 'アルペジオを弾く時の速さ'
        : '普段の速度';
      elements.calibrationInstruction.textContent = focus.kind === 'direction' || focus.kind === 'directed-pair'
        ? `${label}: 「${calibrationKeyLabel(focus.keys[0])}」→「${calibrationKeyLabel(focus.keys[1])}」の順で、${speedDescription}で繰り返してください。戻りは位置を戻すための入力です。`
        : `${label}: 「${calibrationKeyLabel(focus.keys[0])}」と「${calibrationKeyLabel(focus.keys[1])}」を${speedDescription}で交互に打ってください。`;
      elements.calibrationProgress.textContent = `残り${Math.max(0, calibrationFocusSampleCount(focus.kind) - focus.intervals.length)}回`;
      return;
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
      elements.calibrationInstruction.textContent = '保存済みの値を確認・編集できます。変更後は「この値を保存」を押してください。';
      elements.calibrationProgress.textContent = `保存済み: 通常 ${calibration.actionsPerSecond.toFixed(2)}、同手・別指 ${calibration.sameHandDifferentFingerActionsPerSecond.toFixed(2)} アクション/秒（組別 ${sameHandPairCount} 組）`;
    } else {
      elements.calibrationInstruction.textContent = calibration
        ? `保存済み: 通常 ${calibration.actionsPerSecond.toFixed(2)}、同手・別指 ${calibration.sameHandDifferentFingerActionsPerSecond.toFixed(2)} アクション/秒（組別 ${sameHandPairCount} 組）、未測定指の指移動 ${calibration.fallbackFingerSpeedUnitsPerSecond.toFixed(2)} u/秒。`
        : `${context} 通常の打鍵速度、同じ手の別指の速度、各指の移動速度を測定して再生に反映します。`;
      elements.calibrationProgress.textContent = calibration ? context : '';
    }
    return;
  }
  if (session.phase === 'actions') {
    elements.calibrationInstruction.textContent = `${calibrationPairText(session.actionKeys)}を交互に、普段の速度で打ってください。`;
    elements.calibrationProgress.textContent = `残り${Math.max(0, CALIBRATION_ACTION_SAMPLES - session.actionIntervals.length)}回`;
    return;
  }
  if (session.phase === 'finger') {
    const pair = session.pairs[session.pairIndex];
    elements.calibrationInstruction.textContent = `${FINGER_LABEL[pair.finger]}: 「${calibrationKeyLabel(pair.fromKey)}」と「${calibrationKeyLabel(pair.toKey)}」を交互に打ってください。`;
    elements.calibrationProgress.textContent = `${session.pairIndex + 1} / ${session.pairs.length} 指、残り${Math.max(0, CALIBRATION_FINGER_SAMPLES - session.pairSampleCount)}回`;
    return;
  }
  if (session.phase === 'same-hand') {
    const pair = session.sameHandPairs[session.sameHandPairIndex];
    elements.calibrationInstruction.textContent = `同じ手の別指: ${calibrationPairText(pair)}を普段の速度で交互に打ってください。`;
    elements.calibrationProgress.textContent = `${session.sameHandPairIndex + 1} / ${session.sameHandPairs.length} 組、残り${Math.max(0, CALIBRATION_SAME_HAND_SAMPLES * 2 - session.sameHandPairSampleCount)}回`;
    return;
  }
  if (session.phase === 'arpeggio') {
    const pair = session.arpeggioPairs[session.arpeggioPairIndex];
    const label = pair.kind === 'direction'
      ? `異手 ${pair.token}`
      : `同手・隣接 ${pair.token}`;
    const requiredSamples = pair.kind === 'direction'
      ? CALIBRATION_ACTION_SAMPLES
      : CALIBRATION_SAME_HAND_SAMPLES;
    elements.calibrationInstruction.textContent = `${label}: 「${calibrationKeyLabel(pair.keys[0])}」→「${calibrationKeyLabel(pair.keys[1])}」の順で、アルペジオを弾くときの速さで繰り返してください。戻りは位置を戻すための入力です。`;
    elements.calibrationProgress.textContent = `${session.arpeggioPairIndex + 1} / ${session.arpeggioPairs.length} 方向、残り${Math.max(0, requiredSamples - session.arpeggioPairSampleCount)}回`;
    return;
  }
  elements.calibrationInstruction.textContent = '測定結果を確認し、必要なら数値を調整して保存してください。';
  elements.calibrationProgress.textContent = '測定完了';
}

function beginCalibrationSession(): void {
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
  const eligibleKeyIds = calibrationEligibleKeyIds(geometry, ctx.getPlaybackLayout()?.legends);
  const actionKeys = calibrationActionPair(geometry, eligibleKeyIds);
  const pairs = calibrationKeyPairs(geometry, eligibleKeyIds);
  const sameHandPairs = calibrationSameHandPairs(geometry, eligibleKeyIds);
  const sameHandPairFingerKeys = sameHandPairs.map(([left, right]) => {
    const leftFinger = geometry.keys.get(left)?.finger;
    const rightFinger = geometry.keys.get(right)?.finger;
    return leftFinger && rightFinger ? sameHandFingerPairKey(leftFinger, rightFinger) : undefined;
  });
  if (!actionKeys
    || pairs.length === 0
    || sameHandPairs.length === 0
    || sameHandPairFingerKeys.some((key) => key === undefined)) {
    setCalibrationError('この物理配列では測定用のキーを作れません。');
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
  setCalibrationError('');
  updateCalibrationDialog();
}

function beginArpeggioCalibrationSession(): void {
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
  const eligibleKeyIds = calibrationEligibleKeyIds(geometry, ctx.getPlaybackLayout()?.legends);
  const actionKeys = calibrationActionPair(geometry, eligibleKeyIds);
  const arpeggioPairs: CalibrationArpeggioPair[] = [];
  if (actionKeys) {
    arpeggioPairs.push(
      { kind: 'direction', token: 'L→R', keys: [actionKeys[0], actionKeys[1]] },
      { kind: 'direction', token: 'R→L', keys: [actionKeys[1], actionKeys[0]] },
    );
  }
  for (const [fromKey, toKey] of calibrationAdjacentSameHandPairs(geometry, eligibleKeyIds)) {
    const fromFinger = geometry.keys.get(fromKey)?.finger;
    const toFinger = geometry.keys.get(toKey)?.finger;
    const token = fromFinger && toFinger
      ? sameHandDirectedFingerPairKey(fromFinger, toFinger)
      : undefined;
    if (token) arpeggioPairs.push({ kind: 'directed-pair', token, keys: [fromKey, toKey] });
  }
  if (!actionKeys || arpeggioPairs.length === 0) {
    setCalibrationError('この物理配列ではアルペジオ用の測定キーを作れません。');
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
  setCalibrationError('');
  updateCalibrationDialog();
}

function finishArpeggioCalibrationSession(session: CalibrationSession): void {
  const actionsPerSecondByDirection = { ...calibrationDirectionalDraft.actionsPerSecondByDirection };
  const directedPairSpeeds = {
    ...calibrationDirectionalDraft.sameHandDifferentFingerActionsPerSecondByDirectedPair,
  };
  for (const [index, pair] of session.arpeggioPairs.entries()) {
    const rate = actionsPerSecondFromIntervals(session.arpeggioPairIntervals[index]);
    if (rate === undefined) {
      setCalibrationError('アルペジオの測定値が不足しています。最初からもう一度測ってください。');
      calibrationSession = undefined;
      updateCalibrationDialog();
      return;
    }
    if (pair.kind === 'direction') {
      actionsPerSecondByDirection[pair.token as 'L→R' | 'R→L'] = rate;
    } else {
      directedPairSpeeds[pair.token] = rate;
    }
  }
  session.phase = 'result';
  calibrationDirectionalDraft = {
    actionsPerSecondByDirection,
    sameHandDifferentFingerActionsPerSecondByDirectedPair: directedPairSpeeds,
  };
  renderCalibrationDirectionalInputs(actionsPerSecondByDirection);
  renderCalibrationDirectedPairInputs(directedPairSpeeds);
  setCalibrationError('');
  updateCalibrationDialog();
}

function finishCalibrationSession(): void {
  if (!calibrationSession) return;
  if (calibrationSession.mode === 'arpeggio') {
    finishArpeggioCalibrationSession(calibrationSession);
    return;
  }
  const actionsPerSecond = actionsPerSecondFromIntervals(calibrationSession.actionIntervals);
  const sameHandDifferentFingerActionsPerSecond = actionsPerSecondFromIntervals(calibrationSession.sameHandIntervals);
  const sameHandPairSpeeds = Object.fromEntries(
    calibrationSession.sameHandPairFingerKeys.map((pairKey, index) => [
      pairKey,
      actionsPerSecondFromIntervals(calibrationSession!.sameHandPairIntervals[index]),
    ]),
  );
  const fingerSpeeds = fingerSpeedFromSamples(calibrationSession.fingerSamples);
  const fallbackFingerSpeedUnitsPerSecond = fallbackFingerSpeedFromSamples(calibrationSession.fingerSamples);
  if (actionsPerSecond === undefined
    || sameHandDifferentFingerActionsPerSecond === undefined
    || Object.values(sameHandPairSpeeds).some((value) => value === undefined)
    || fingerSpeeds.size === 0
    || fallbackFingerSpeedUnitsPerSecond === undefined) {
    setCalibrationError('測定値が不足しています。最初からもう一度測ってください。');
    calibrationSession = undefined;
    updateCalibrationDialog();
    return;
  }
  calibrationSession.phase = 'result';
  elements.calibrationActions.value = actionsPerSecond.toFixed(2);
  elements.calibrationSameHand.value = sameHandDifferentFingerActionsPerSecond.toFixed(2);
  elements.calibrationFingerSpeed.value = fallbackFingerSpeedUnitsPerSecond.toFixed(2);
  renderCalibrationDirectionalInputs(calibrationDirectionalDraft.actionsPerSecondByDirection);
  renderCalibrationSameHandInputs(sameHandPairSpeeds as Record<string, number>, calibrationSession.sameHandPairFingerKeys);
  renderCalibrationDirectedPairInputs(calibrationDirectionalDraft.sameHandDifferentFingerActionsPerSecondByDirectedPair);
  renderCalibrationFingerInputs(Object.fromEntries(fingerSpeeds) as Partial<Record<Finger, number>>);
  setCalibrationError('');
  updateCalibrationDialog();
}

function onCalibrationKeyDown(event: KeyboardEvent): void {
  const session = calibrationSession;
  if (!elements.calibrationDialog.open || event.repeat) return;
  if (calibrationFocusSession) {
    const focus = calibrationFocusSession;
    const expected = focus.keys[focus.expectedKeyIndex];
    if (!calibrationKeyMatches(event, expected, calibrationKeyLabel(expected))) {
      setCalibrationError(`今は「${calibrationKeyLabel(expected)}」を押す番です。`);
      return;
    }
    event.preventDefault();
    setCalibrationError('');
    const now = performance.now();
    if (focus.lastTimestamp !== undefined) {
      const durationMs = now - focus.lastTimestamp;
      if (durationMs <= 0) return;
      const measureForward = focus.kind === 'direction' || focus.kind === 'directed-pair';
      if (!measureForward || focus.expectedKeyIndex === 1) focus.intervals.push(durationMs);
    }
    focus.lastTimestamp = now;
    focus.expectedKeyIndex = focus.expectedKeyIndex === 0 ? 1 : 0;
    if (focus.intervals.length >= calibrationFocusSampleCount(focus.kind)) finishFocusedCalibration();
    else updateCalibrationDialog();
    return;
  }
  if (!session || session.phase === 'result') return;
  const expected = session.phase === 'actions'
    ? session.actionKeys[session.expectedKeyIndex]
    : session.phase === 'finger'
      ? session.pairs[session.pairIndex][session.expectedKeyIndex === 0 ? 'fromKey' : 'toKey']
      : session.phase === 'same-hand'
        ? session.sameHandPairs[session.sameHandPairIndex][session.expectedKeyIndex]
        : session.arpeggioPairs[session.arpeggioPairIndex].keys[session.expectedKeyIndex];
  if (!calibrationKeyMatches(event, expected, calibrationKeyLabel(expected))) {
    setCalibrationError(`今は「${calibrationKeyLabel(expected)}」を押す番です。`);
    return;
  }
  event.preventDefault();
  setCalibrationError('');
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
      const direction = fromFinger && toFinger ? handDirection(fromFinger, toFinger) : undefined;
      if (direction) session.actionIntervalsByDirection[direction].push(durationMs);
    } else if (session.phase === 'finger') {
      session.fingerSamples.push({
        finger: session.pairs[session.pairIndex].finger,
        distance: session.pairs[session.pairIndex].distance,
        durationMs,
      });
      session.pairSampleCount++;
    } else if (session.phase === 'arpeggio') {
      // 戻りは位置を戻すための間隔なので、指定方向の片道だけを残す。
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

  if (session.phase === 'actions' && session.actionIntervals.length >= CALIBRATION_ACTION_SAMPLES) {
    session.phase = 'finger';
    session.expectedKeyIndex = 0;
    session.lastTimestamp = undefined;
  } else if (session.phase === 'finger' && session.pairSampleCount >= CALIBRATION_FINGER_SAMPLES) {
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
  } else if (session.phase === 'same-hand'
    && session.sameHandPairSampleCount >= CALIBRATION_SAME_HAND_SAMPLES * 2) {
    if (session.sameHandPairIndex + 1 >= session.sameHandPairs.length) finishCalibrationSession();
    else {
      session.sameHandPairIndex++;
      session.sameHandPairSampleCount = 0;
      session.expectedKeyIndex = 0;
      session.lastTimestamp = undefined;
    }
  } else if (session.phase === 'arpeggio') {
    const pair = session.arpeggioPairs[session.arpeggioPairIndex];
    const requiredSamples = pair.kind === 'direction'
      ? CALIBRATION_ACTION_SAMPLES
      : CALIBRATION_SAME_HAND_SAMPLES;
    if (session.arpeggioPairSampleCount >= requiredSamples) {
      if (session.arpeggioPairIndex + 1 >= session.arpeggioPairs.length) finishCalibrationSession();
      else {
        session.arpeggioPairIndex++;
        session.arpeggioPairSampleCount = 0;
        session.expectedKeyIndex = 0;
        session.lastTimestamp = undefined;
      }
    }
  }
  updateCalibrationDialog();
}

function openCalibrationDialog(): void {
  calibrationEditMode = false;
  calibrationSession = undefined;
  calibrationFocusSession = undefined;
  calibrationDirectionalDraft = currentCalibrationDirectionalDraft();
  setCalibrationError('');
  updateCalibrationDialog();
  if (!elements.calibrationDialog.open) elements.calibrationDialog.showModal();
}

function openCalibrationEditDialog(): void {
  const calibration = ctx.getCalibration();
  if (!calibration) return;
  calibrationEditMode = true;
  calibrationSession = undefined;
  calibrationFocusSession = undefined;
  calibrationDirectionalDraft = currentCalibrationDirectionalDraft();
  setCalibrationError('');
  elements.calibrationActions.value = calibration.actionsPerSecond.toFixed(2);
  elements.calibrationSameHand.value = calibration.sameHandDifferentFingerActionsPerSecond.toFixed(2);
  elements.calibrationFingerSpeed.value = calibration.fallbackFingerSpeedUnitsPerSecond.toFixed(2);
  renderCalibrationDirectionalInputs(
    calibration.actionsPerSecondByDirection,
  );
  renderCalibrationSameHandInputs(
    calibration.sameHandDifferentFingerActionsPerSecondByPair,
    Object.keys(calibration.sameHandDifferentFingerActionsPerSecondByPair),
  );
  renderCalibrationDirectedPairInputs(calibration.sameHandDifferentFingerActionsPerDirectedPair);
  renderCalibrationFingerInputs(calibration.fingerSpeedUnitsPerSecond);
  updateCalibrationDialog();
  if (!elements.calibrationDialog.open) elements.calibrationDialog.showModal();
}

function saveCalibrationFromDialog(): void {
  const actionsPerSecond = Number(elements.calibrationActions.value);
  const sameHandDifferentFingerActionsPerSecond = Number(elements.calibrationSameHand.value);
  const fallbackFingerSpeedUnitsPerSecond = Number(elements.calibrationFingerSpeed.value);
  if (!Number.isFinite(actionsPerSecond)
    || actionsPerSecond < CALIBRATION_ACTIONS_PER_SECOND_MIN
    || actionsPerSecond > CALIBRATION_ACTIONS_PER_SECOND_MAX) {
    setCalibrationError(`通常速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`);
    return;
  }
  if (!Number.isFinite(sameHandDifferentFingerActionsPerSecond)
    || sameHandDifferentFingerActionsPerSecond < CALIBRATION_ACTIONS_PER_SECOND_MIN
    || sameHandDifferentFingerActionsPerSecond > CALIBRATION_ACTIONS_PER_SECOND_MAX) {
    setCalibrationError(`同手・別指速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`);
    return;
  }
  if (!Number.isFinite(fallbackFingerSpeedUnitsPerSecond)
    || fallbackFingerSpeedUnitsPerSecond < CALIBRATION_FINGER_SPEED_MIN
    || fallbackFingerSpeedUnitsPerSecond > CALIBRATION_FINGER_SPEED_MAX) {
    setCalibrationError(`未測定指の速度は ${CALIBRATION_FINGER_SPEED_MIN}〜${CALIBRATION_FINGER_SPEED_MAX} の範囲で入力してください。`);
    return;
  }
  const fingerSpeedUnitsPerSecond: Partial<Record<Finger, number>> = {};
  for (const input of elements.calibrationFingerInputs.querySelectorAll<HTMLInputElement>('[data-calibration-finger]')) {
    const finger = input.dataset.calibrationFinger as Finger | undefined;
    if (!finger || input.value.trim() === '') continue;
    const value = Number(input.value);
    if (!Number.isFinite(value)
      || value < CALIBRATION_FINGER_SPEED_MIN
      || value > CALIBRATION_FINGER_SPEED_MAX) {
      setCalibrationError(`${FINGER_LABEL[finger]}の速度は ${CALIBRATION_FINGER_SPEED_MIN}〜${CALIBRATION_FINGER_SPEED_MAX} の範囲で入力してください。`);
      return;
    }
    fingerSpeedUnitsPerSecond[finger] = value;
  }
  const sameHandDifferentFingerActionsPerSecondByPair: Record<string, number> = {};
  for (const input of elements.calibrationSameHandPairs.querySelectorAll<HTMLInputElement>('[data-calibration-same-hand-pair]')) {
    const pairKey = input.dataset.calibrationSameHandPair;
    if (!pairKey || input.value.trim() === '') {
      setCalibrationError('同手・別指の組ごとの測定値をすべて入力してください。');
      return;
    }
    const value = Number(input.value);
    if (!Number.isFinite(value)
      || value < CALIBRATION_ACTIONS_PER_SECOND_MIN
      || value > CALIBRATION_ACTIONS_PER_SECOND_MAX) {
      setCalibrationError(`同手・別指の組ごとの速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`);
      return;
    }
    sameHandDifferentFingerActionsPerSecondByPair[pairKey] = value;
  }
  const actionsPerSecondByDirection: Partial<Record<'L→R' | 'R→L', number>> = {};
  for (const input of elements.calibrationDirections.querySelectorAll<HTMLInputElement>('[data-calibration-direction]')) {
    const direction = input.dataset.calibrationDirection as 'L→R' | 'R→L' | undefined;
    if (!direction || input.value.trim() === '') continue;
    const value = Number(input.value);
    if (!Number.isFinite(value)
      || value < CALIBRATION_ACTIONS_PER_SECOND_MIN
      || value > CALIBRATION_ACTIONS_PER_SECOND_MAX) {
      setCalibrationError(`異手・方向別の速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`);
      return;
    }
    actionsPerSecondByDirection[direction] = value;
  }
  const sameHandDifferentFingerActionsPerSecondByDirectedPair: Record<string, number> = {};
  for (const input of elements.calibrationDirectedPairs.querySelectorAll<HTMLInputElement>('[data-calibration-directed-pair]')) {
    const pairKey = input.dataset.calibrationDirectedPair;
    if (!pairKey || input.value.trim() === '') continue;
    const value = Number(input.value);
    if (!Number.isFinite(value)
      || value < CALIBRATION_ACTIONS_PER_SECOND_MIN
      || value > CALIBRATION_ACTIONS_PER_SECOND_MAX) {
      setCalibrationError(`同手・別指の方向別速度は ${CALIBRATION_ACTIONS_PER_SECOND_MIN}〜${CALIBRATION_ACTIONS_PER_SECOND_MAX} の範囲で入力してください。`);
      return;
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
    setCalibrationError('このブラウザには設定を保存できませんでした。');
    return;
  }
  ctx.setCalibration(calibration);
  ctx.updatePlaybackSetting('useCalibration', true);
  ctx.setPlaybackCalibration(calibration);
  calibrationEditMode = false;
  calibrationSession = undefined;
  calibrationFocusSession = undefined;
  elements.calibrationDialog.close('saved');
}



  function setup(): void {
    document.addEventListener('keydown', onCalibrationKeyDown);
    elements.calibrationStart.addEventListener('click', beginCalibrationSession);
    elements.calibrationArpeggioStart.addEventListener('click', beginArpeggioCalibrationSession);
    elements.calibrationSave.addEventListener('click', saveCalibrationFromDialog);
    elements.calibrationDialog.addEventListener('close', () => {
      calibrationEditMode = false;
      calibrationSession = undefined;
      calibrationFocusSession = undefined;
      setCalibrationError('');
      updateCalibrationDialog();
    });
    elements.calibrationDialog.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-calibration-remeasure]');
      if (button?.dataset.calibrationRemeasure) startFocusedCalibration(button.dataset.calibrationRemeasure);
    });
  }

  return {
    setup,
    open: openCalibrationDialog,
    openEdit: openCalibrationEditDialog,
    readArpeggioConditions,
    syncArpeggioConditionControls,
    arpeggioPresetId,
  };
}
