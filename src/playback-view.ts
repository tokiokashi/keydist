import { buildGeometry, THUMB_ROW, type Finger } from './geometry.ts';
import { type Options, type Stroke, type Trace } from './evaluate.ts';
import {
  advancePlayback, clampPlaybackCursor, createPlaybackState,
  playbackPreparedFingerPositionKeys, playbackInputPreview, playbackPlannedKeys,
  playbackPlannedOrders, playbackRomajiPlan, playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders, playbackOrderLabel, playbackRateChartData,
  playbackRecentActionsPerSecond, playbackRecentKanaPerSecond,
  playbackSameFingerKeyMotions,
  playbackStrokeAt, playbackStepDurationMs, playbackTimingSchedule, playbackTimingStepDurationMs, playbackCursorForEquivalentInputPosition, reconcilePlaybackStateAfterAnalysisRefresh, setPlaybackSameFingerDelay,
  setPlaybackStepsPerSecond, stepPlayback, playbackTrailKeys, playbackTrailOrders,
  playbackStrokeDisplay, setPlaybackCalibration, setPlaybackSpeedMultiplier,
  type PlaybackStepsPerSecond, type PlaybackState, type PlaybackTimingStep, PLAYBACK_SPEED_MULTIPLIER_MAX,
  PLAYBACK_SPEED_MULTIPLIER_MIN, PLAYBACK_STEPS_PER_SECOND_MAX,
  PLAYBACK_STEPS_PER_SECOND_MIN, PLAYBACK_RATE_WINDOW_MIN,
  PLAYBACK_RATE_WINDOW_MAX, PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX,
} from './playback.ts';
import { renderPlaybackRateChart, updatePlaybackRateChartCursor } from './playback-rate-chart.ts';
import { FINGER_LABEL, type AppElements } from './app-dom.ts';
import { escapeAttr, escapeText } from './chart.ts';
import type { Layout } from './layouts/index.ts';
import type { PlaybackCalibration } from './playback-calibration.ts';
import type {
  PlaybackKeyFeedbackStyle,
  UiPlaybackState,
  UiStateStorage,
  UiStateV1,
} from './ui-state.ts';
import type { AggregatedAnalysisResult } from './analysis-aggregate.ts';
import type { ChainPolicy } from './analysis-chain.ts';
import type { ArpeggioPolicy } from './analysis-arpeggio.ts';
import {
  DEFAULT_TRIGGER_ACTIVATION_GROUPINGS,
  type ActionRealizationPolicy,
  type TriggerActivationClass,
  type TriggerActivationGrouping,
  type TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';
import {
  sameModifierGroupSelector,
  samePhysicalTriggerSelector,
  triggerActivationGroups,
  triggerActivationLogicalGroups,
  TRIGGER_ACTIVATION_CLASS_LABELS,
} from './trigger-activation-groups.ts';
import {
  playbackAnalysisArpeggioMotions,
  playbackAnalysisArpeggioOrders,
  playbackAnalysisChainMotions,
  playbackAnalysisChainOrders,
  playbackRedirectWindows,
  playbackStrokeAnnotation,
  type PlaybackOrderSpan,
} from './playback-analysis-display.ts';

export interface PlaybackViewContext {
  el: AppElements;
  storage: UiStateStorage | undefined;
  getUiState: () => UiStateV1;
  getPlaybackSettings: () => UiPlaybackState;
  updatePlaybackSetting: <K extends keyof UiPlaybackState>(key: K, value: UiPlaybackState[K]) => void;
  isPlaybackLayoutOverride: () => boolean;
  setPlaybackLayoutOverride: (enabled: boolean) => void;
  updateUiState: (change: (draft: UiStateV1) => void) => void;
  getCalibration: () => PlaybackCalibration | undefined;
  getChainPolicy: () => ChainPolicy;
  updateChainPolicy: (policy: ChainPolicy) => void;
  getArpeggioPolicy: () => ArpeggioPolicy;
  updateArpeggioPolicy: (policy: ArpeggioPolicy) => void;
  getTriggerRealizationPolicy: () => TriggerRealizationPolicy;
  updateTriggerRealizationPolicy: (policy: TriggerRealizationPolicy) => void;
  getActionRealizationPolicy: () => ActionRealizationPolicy;
  updateActionRealizationPolicy: (policy: ActionRealizationPolicy) => void;
  refreshAnalysis: () => void;
  openCalibration: () => void;
  openCalibrationEdit: () => void;
}

export type PlaybackPreserveMode = 'cursor' | 'input-position';

export interface PlaybackViewController {
  setup: () => void;
  render: (
    trace: Trace,
    layout: Layout,
    geometry: ReturnType<typeof buildGeometry>,
    options: Options,
    analysis: AggregatedAnalysisResult,
  ) => void;
  clear: () => void;
  update: () => void;
  preserveNextRender: (mode: PlaybackPreserveMode) => void;
  setCalibration: (calibration: PlaybackCalibration | undefined) => void;
  getGeometry: () => ReturnType<typeof buildGeometry> | undefined;
  getLayout: () => Layout | undefined;
}

export function createPlaybackView(ctx: PlaybackViewContext): PlaybackViewController {
  const elements = ctx.el;

const PLAYBACK_KEY = 30;
const PLAYBACK_PAD = 6;
const PLAYBACK_THUMB_WIDTH = 1.9;
const PLAYBACK_SCALE_MIN = 0.5;
const PLAYBACK_SCALE_MAX = 4;

type PlaybackDynamicDisplay = 'none' | 'chain' | 'arpeggio' | 'both';

const CHAIN_POLICY_KEYS: Record<keyof ChainPolicy, true> = {
  breakOnSameFinger: true,
  breakOnTriggerOnly: true,
  breakOnThumbOnly: true,
  breakOnOppositeHandSimultaneous: true,
};

function isChainPolicyKey(value: string | undefined): value is keyof ChainPolicy {
  return value !== undefined && Object.prototype.hasOwnProperty.call(CHAIN_POLICY_KEYS, value);
}

function dynamicPlaybackDisplay(settings: UiPlaybackState): PlaybackDynamicDisplay {
  if (settings.showChainOnRateChart && settings.showArpeggioOnRateChart) return 'both';
  if (settings.showChainOnRateChart) return 'chain';
  if (settings.showArpeggioOnRateChart) return 'arpeggio';
  return 'none';
}

function displayedOrders(spans: readonly PlaybackOrderSpan[]): ReadonlyMap<string, number> {
  const orders = new Map<string, number>();
  for (const span of spans) {
    for (const [key, order] of span.orders) {
      if (!orders.has(key)) orders.set(key, order);
    }
  }
  return orders;
}

let playbackState: PlaybackState = createPlaybackState(
  ctx.getUiState().ui.playback.stepsPerSecond,
  ctx.getUiState().ui.playback.sameFingerDelay,
  ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined,
  ctx.getUiState().ui.playback.speedMultiplier,
);
let playbackTrace: Trace | undefined;
let playbackAnalysis: AggregatedAnalysisResult | undefined;
let playbackGeometry: ReturnType<typeof buildGeometry> | undefined;
let playbackLayout: Layout | undefined;
let playbackOptions: Options | undefined;
let playbackAnimationFrame: number | undefined;
let playbackLastTimestamp: number | undefined;
let playbackSeekWasPlaying: boolean | undefined;
let playbackMotionCursor = -1;
let playbackFeedbackPending = false;
let playbackRateChartSignature: string | undefined;
let playbackTiming: readonly PlaybackTimingStep[] = [];
type PlaybackSettingsTab = 'display' | 'graph' | 'conditions';

let playbackSettingsOpen = false;
let playbackSettingsTab: PlaybackSettingsTab = 'display';
const playbackSettingsDetailsOpen = new Map<string, boolean>();
let preserveStateOnNextRender: PlaybackPreserveMode | undefined;

function playbackDetailsOpenAttribute(
  key: string,
  defaultOpen = false,
): string {
  return (playbackSettingsDetailsOpen.get(key) ?? defaultOpen) ? ' open' : '';
}

function refreshPlaybackTiming(): void {
  const settings = ctx.getPlaybackSettings();
  playbackTiming = playbackAnalysis
    ? playbackTimingSchedule(
      playbackAnalysis,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      playbackState.calibration,
      playbackState.speedMultiplier,
      {
        allFingerMovementDelay: settings.allFingerMovementDelay && playbackGeometry !== undefined,
        geometry: playbackGeometry,
      },
    )
    : [];
  playbackRateChartSignature = undefined;
}

function setPlaybackSettingsOpen(open: boolean): void {
  playbackSettingsOpen = open;
  elements.app.classList.toggle('playback-settings-open', open);
  elements.playbackSettingsPanel.setAttribute('aria-hidden', String(!open));
  elements.playbackSettingsPanel.toggleAttribute('inert', !open);
  const trigger = elements.playback.querySelector<HTMLButtonElement>('[data-playback-settings-open]');
  trigger?.setAttribute('aria-expanded', String(open));
}

function triggerGroupingOptions(
  current: TriggerActivationGrouping | undefined,
  semanticDefault: TriggerActivationGrouping,
): string {
  const inherited = `既定（${semanticDefault === 'separate' ? '独立action' : 'outputと同じaction'}）`;
  return [
    ['inherit', inherited],
    ['combined', 'outputと同じaction'],
    ['separate', '独立action'],
  ].map(([value, label]) =>
    `<option value="${value}"${(current ?? 'inherit') === value ? ' selected' : ''}>${escapeText(label)}</option>`
  ).join('');
}

function triggerSettingsMarkup(layout: Layout): string {
  const realization = ctx.getTriggerRealizationPolicy();
  const action = ctx.getActionRealizationPolicy();
  const groups = triggerActivationGroups(layout);
  const relevantClasses = [...new Set(groups.map((group) => group.activationClass))]
    .filter((kind): kind is Exclude<TriggerActivationClass, 'postpress-required'> =>
      kind !== 'postpress-required');
  const classRows = relevantClasses.map((kind) => {
    const current = action.triggerActivationClassOverrides?.[kind];
    return `<label class="playback-range-setting"><span>${escapeText(TRIGGER_ACTIVATION_CLASS_LABELS[kind])}</span>
      <select data-playback-trigger-class="${kind}"${action.triggerActivation === 'semantic' ? '' : ' disabled'}>
        ${triggerGroupingOptions(current, DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[kind])}
      </select>
    </label>`;
  }).join('');

  const logicalRows = triggerActivationLogicalGroups(layout)
    .filter((group) => !group.activationClasses.includes('postpress-required'))
    .map((logical) => {
      const existing = action.triggerActivationOverrides?.find((override) =>
        sameModifierGroupSelector(override.selector, logical.modifierGroupIds));
      const defaults = logical.activationClasses.map((kind) =>
        action.triggerActivationClassOverrides?.[kind]
          ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[kind]);
      const semanticDefault = defaults.every((value) => value === 'separate')
        ? 'separate'
        : 'combined';
      return `<label class="playback-range-setting"><span>${escapeText(logical.label)}</span>
        <select data-playback-trigger-modifier-groups="${escapeAttr(JSON.stringify(logical.modifierGroupIds))}"${action.triggerActivation === 'semantic' ? '' : ' disabled'}>
          ${triggerGroupingOptions(existing?.grouping, semanticDefault)}
        </select>
      </label>`;
    }).join('');

  const physicalRows = groups
    .filter((group) => group.activationClass !== 'postpress-required')
    .map((group) => {
      const existing = action.triggerActivationOverrides?.find((override) =>
        samePhysicalTriggerSelector(override.selector, group));
      const logicalOverride = action.triggerActivationOverrides?.find((override) =>
        sameModifierGroupSelector(override.selector, group.modifierGroupIds));
      const semanticDefault = logicalOverride?.grouping
        ?? action.triggerActivationClassOverrides?.[group.activationClass]
        ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[group.activationClass];
      const selector = {
        modifierGroupIds: group.modifierGroupIds,
        triggerKeys: group.triggerKeys,
      };
      return `<label class="playback-range-setting"><span>${escapeText(group.label)}</span>
        <select data-playback-trigger-physical="${escapeAttr(JSON.stringify(selector))}"${action.triggerActivation === 'semantic' ? '' : ' disabled'}>
          ${triggerGroupingOptions(existing?.grouping, semanticDefault)}
        </select>
      </label>`;
    }).join('');

  const details = logicalRows.length === 0 && physicalRows.length === 0
    ? ''
    : `<details class="playback-settings-tree playback-settings-tree-level-2" data-playback-details="trigger-individual"${playbackDetailsOpenAttribute('trigger-individual')}>
        <summary>個別設定</summary>
        <div class="playback-dialog-grid playback-trigger-option-list">${logicalRows}</div>
        ${physicalRows.length === 0 ? '' : `<details class="playback-settings-tree playback-settings-tree-level-3" data-playback-details="trigger-physical"${playbackDetailsOpenAttribute('trigger-physical')}>
          <summary>物理trigger単位の詳細</summary>
          <div class="playback-dialog-grid playback-trigger-option-list">${physicalRows}</div>
        </details>`}
      </details>`;

  return `<details class="playback-settings-group playback-trigger-settings" data-playback-details="trigger-realization"${playbackDetailsOpenAttribute('trigger-realization')}>
    <summary>Trigger realization</summary>
    <div class="playback-settings-group-body">
      <label class="playback-finger-toggle playback-setting-row">
        <input type="checkbox" data-playback-trigger-hold${realization.useHold ? ' checked' : ''} />
        hold-capable triggerを連続保持する
      </label>
      <div class="playback-trigger-action-group">
        <label class="playback-finger-toggle playback-setting-row playback-trigger-action-toggle">
          <input type="checkbox" data-playback-trigger-actions${action.triggerActivation === 'semantic' ? ' checked' : ''} />
          trigger押下の独立action化を有効にする
        </label>
        <div class="condition-trigger-subheading">独立action化する対象</div>
        <div class="playback-dialog-grid playback-trigger-option-list">
          ${classRows}
        </div>
        ${details}
      </div>
    </div>
  </details>`;

}

function playbackSettingsMarkup(layout: Layout, options: Options): string {
  const activeTab = playbackSettingsTab;
  const chainPolicy = ctx.getChainPolicy();
  const arpeggioPolicy = ctx.getArpeggioPolicy();
  const triggerSettings = triggerSettingsMarkup(layout);
  return `<div class="playback-settings-content">
    <div class="dialog-head">
      <h2>打鍵再生の設定</h2>
      <button type="button" class="ghost close" data-playback-settings-close>閉じる</button>
    </div>
    <div class="playback-settings-scope">
      <span>適用先: <strong data-playback-settings-scope>${ctx.isPlaybackLayoutOverride() ? `${escapeText(layout.name)}専用` : '共通設定'}</strong></span>
      <button type="button" class="ghost" data-playback-layout-override="${ctx.isPlaybackLayoutOverride() ? 'disable' : 'enable'}">${ctx.isPlaybackLayoutOverride() ? '共通設定に戻す' : 'この配列専用にする'}</button>
      <small>配列固有にすると、この配列を表示したときだけ設定を使います。</small>
    </div>
    <div class="playback-settings-tabs" role="tablist" aria-label="打鍵再生設定の分類">
      <button type="button" class="playback-settings-tab" role="tab" aria-selected="${activeTab === 'display'}" aria-controls="playback-settings-display" data-playback-settings-tab="display">表示設定</button>
      <button type="button" class="playback-settings-tab" role="tab" aria-selected="${activeTab === 'graph'}" aria-controls="playback-settings-graph" data-playback-settings-tab="graph">グラフ設定</button>
      <button type="button" class="playback-settings-tab" role="tab" aria-selected="${activeTab === 'conditions'}" aria-controls="playback-settings-conditions" data-playback-settings-tab="conditions">シミュレーション条件</button>
    </div>
    <section id="playback-settings-display" class="playback-settings-panel" role="tabpanel" data-playback-settings-panel="display"${activeTab === 'display' ? '' : ' hidden'}>
      <p class="note">キーボード画面に重ねる情報を設定します。変更はすぐに反映されます。</p>
      <div class="playback-dialog-grid">
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-fingers${ctx.getUiState().ui.playback.showFingers ? ' checked' : ''} />指の位置を色で表示</label>
        <label class="playback-range-setting"><span>押下フィードバック</span>
          <select data-playback-key-feedback aria-label="キー押下のフィードバック">
            <option value="off"${ctx.getUiState().ui.playback.keyFeedbackStyle === 'off' ? ' selected' : ''}>オフ</option>
            <option value="fade"${ctx.getUiState().ui.playback.keyFeedbackStyle === 'fade' ? ' selected' : ''}>フェード</option>
            <option value="pulse"${ctx.getUiState().ui.playback.keyFeedbackStyle === 'pulse' ? ' selected' : ''}>パルス</option>
            <option value="bounce"${ctx.getUiState().ui.playback.keyFeedbackStyle === 'bounce' ? ' selected' : ''}>バウンス</option>
          </select>
        </label>
        <label class="playback-range-setting" title="次の実Pressへ向け、指位置表示を打鍵時刻より先に到着させる時間。0なら従来どおり"><span>準備時間</span> <input type="number" data-playback-finger-preparation min="0" step="0.05" value="${ctx.getUiState().ui.playback.fingerPreparationSeconds}" aria-label="指位置表示の準備時間（秒）" /> 秒</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-romaji-plan${ctx.getUiState().ui.playback.showRomajiPlan ? ' checked' : ''} />予定ローマ字の盤面表示</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-plan-keys${ctx.getUiState().ui.playback.showPlanKeys ? ' checked' : ''} />押下予定キーを表示</label>
        <div class="playback-window-setting" title="選択中の配列に適用される窓幅N">N <output data-playback-window>${options.windowSize}</output> ステップ</div>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-trail${ctx.getUiState().ui.playback.showTrail ? ' checked' : ''} />押下履歴を残す</label>
        <label class="playback-range-setting" title="押下履歴を残すステップ数">τ <input type="number" data-playback-trail-tau min="1" max="20" step="1" value="${ctx.getUiState().ui.playback.trailTau}" aria-label="押下履歴のステップ数" /> ステップ</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-order-labels${ctx.getUiState().ui.playback.showOrderLabels ? ' checked' : ''} />順番ラベルを表示</label>
        <label class="playback-scale-setting" title="0.5〜4倍。上下キーは1倍刻みで、数値を直接入力できます">配列図 <input type="number" data-playback-scale min="${PLAYBACK_SCALE_MIN}" max="${PLAYBACK_SCALE_MAX}" step="1" value="${ctx.getUiState().ui.playback.scale}" aria-label="配列図の表示倍率" /> 倍</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-chain${ctx.getUiState().ui.playback.showChain ? ' checked' : ''} />Analysis Chainの動的表示</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-arpeggio${ctx.getUiState().ui.playback.showArpeggio ? ' checked' : ''} />ArpeggioSpanの動的表示</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-same-finger-motion${ctx.getUiState().ui.playback.showSameFingerMotion ? ' checked' : ''} />同指移動の動的表示</label>
      </div>
    </section>
    <section id="playback-settings-graph" class="playback-settings-panel" role="tabpanel" data-playback-settings-panel="graph"${activeTab === 'graph' ? '' : ' hidden'}>
      <p class="note">かな/秒・アクション/秒の平均と、グラフ上に重ねる構造区間を設定します。平均条件は全配列共通です。</p>
      <div class="playback-dialog-grid">
        <label class="playback-range-setting"><span>平均方式</span>
          <select data-playback-rate-average aria-label="速度グラフの平均方式">
            <option value="sma"${ctx.getUiState().conditions.defaults.playbackRateAverage === 'sma' ? ' selected' : ''}>SMA（単純移動平均）</option>
            <option value="ewma"${ctx.getUiState().conditions.defaults.playbackRateAverage === 'ewma' ? ' selected' : ''}>EWMA（指数移動平均）</option>
          </select>
        </label>
        <label class="playback-range-setting"><span>SMA窓幅</span> <input type="number" data-playback-rate-window min="${PLAYBACK_RATE_WINDOW_MIN}" max="${PLAYBACK_RATE_WINDOW_MAX}" step="1" value="${ctx.getUiState().conditions.defaults.playbackRateWindow}" aria-label="SMAの窓幅" /> 打鍵</label>
        <label class="playback-range-setting"><span>EWMA半減期</span> <input type="number" data-playback-rate-half-life min="${PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN}" max="${PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX}" step="0.1" value="${ctx.getUiState().conditions.defaults.playbackRateHalfLifeSeconds}" aria-label="EWMAの半減期（秒）" /> 秒</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-chart-chain${ctx.getUiState().ui.playback.showChainOnRateChart ? ' checked' : ''} />Chain区間をグラフに表示</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-chart-arpeggio${ctx.getUiState().ui.playback.showArpeggioOnRateChart ? ' checked' : ''} />Arpeggio区間をグラフに表示</label>
      </div>
    </section>
    <section id="playback-settings-conditions" class="playback-settings-panel" role="tabpanel" data-playback-settings-panel="conditions"${activeTab === 'conditions' ? '' : ' hidden'}>
      <p class="note">再生時間はTransition Calibration、構造表示はAnalysis Chain / ArpeggioPolicyを使用します。</p>
      <div class="playback-dialog-grid">
        <label class="playback-speed"><span>標準速度</span><input type="number" data-playback-rate min="${PLAYBACK_STEPS_PER_SECOND_MIN}" max="${PLAYBACK_STEPS_PER_SECOND_MAX}" step="any" value="${playbackState.stepsPerSecond}" aria-label="再生の標準速度（ステップ毎秒）" /> <span>ステップ/秒</span></label>
        <label class="playback-finger-toggle" title="同じ指の連続打鍵に指の移動速度を反映。個人速度が無ければ距離に比例した簡易換算で代用"><input type="checkbox" data-playback-sfb-delay${playbackState.sameFingerDelay ? ' checked' : ''} />指の移動速度を考慮</label>
        <label class="playback-finger-toggle" title="全指について次のPressまでの物理移動時間を確認し、base Timingに間に合わないStrokeだけ必要量を延長"><input type="checkbox" data-playback-all-finger-delay${ctx.getUiState().ui.playback.allFingerMovementDelay ? ' checked' : ''} />全指の移動時間で律速</label>
        <label class="playback-finger-toggle" title="キャリブレーションした通常速度・Transition方向別速度・指移動速度を再生へ反映"><input type="checkbox" data-playback-calibration${ctx.getUiState().ui.playback.useCalibration ? ' checked' : ''}${ctx.getCalibration() ? '' : ' disabled'} />個人速度を適用</label>
        <button type="button" class="ghost" data-playback-action="calibration-edit">${ctx.getCalibration() ? '保存値を確認・編集' : '個人速度を測定'}</button>
      </div>
      ${triggerSettings}
      <details class="playback-settings-group" data-playback-details="chain-policy"${playbackDetailsOpenAttribute('chain-policy', true)}>
        <summary>Analysis Chain境界</summary>
        <label><input type="checkbox" data-playback-chain-policy="breakOnSameFinger"${chainPolicy.breakOnSameFinger ? ' checked' : ''} />非親指SFB Strokeで区切る</label>
        <label><input type="checkbox" data-playback-chain-policy="breakOnTriggerOnly"${chainPolicy.breakOnTriggerOnly ? ' checked' : ''} />trigger-only Strokeで区切る</label>
        <label><input type="checkbox" data-playback-chain-policy="breakOnThumbOnly"${chainPolicy.breakOnThumbOnly ? ' checked' : ''} />親指only Strokeで区切る</label>
        <label><input type="checkbox" data-playback-chain-policy="breakOnOppositeHandSimultaneous"${chainPolicy.breakOnOppositeHandSimultaneous ? ' checked' : ''} />逆手同時outputで区切る</label>
      </details>
      <details class="playback-settings-group" data-playback-details="arpeggio-policy"${playbackDetailsOpenAttribute('arpeggio-policy', true)}>
        <summary>ArpeggioPolicy</summary>
        <label><input type="checkbox" data-playback-arpeggio-policy="includeThumb"${arpeggioPolicy.includeThumb ? ' checked' : ''} />output親指をcoreに含める</label>
        <label><input type="checkbox" data-playback-arpeggio-policy="bridgeSameFinger"${arpeggioPolicy.bridgeSameFinger ? ' checked' : ''} />same Transitionを中立bridgeとしてSpanを拡張</label>
        <label><input type="checkbox" data-playback-arpeggio-policy="includeSingleRedirectTail"${arpeggioPolicy.includeSingleRedirectTail ? ' checked' : ''} />末尾直後の逆方向1 Transitionを含める</label>
      </details>
      <label class="playback-speed playback-speed-final"><span>再生倍率</span><input type="number" data-playback-multiplier min="${PLAYBACK_SPEED_MULTIPLIER_MIN}" max="${PLAYBACK_SPEED_MULTIPLIER_MAX}" step="0.1" value="${playbackState.speedMultiplier}" aria-label="再生速度の倍率" /> <span>倍</span></label>
    </section>
  </div>`;
}

function cancelPlaybackAnimation() {
  if (playbackAnimationFrame !== undefined) cancelAnimationFrame(playbackAnimationFrame);
  playbackAnimationFrame = undefined;
  playbackLastTimestamp = undefined;
}

function playbackLayerLabel(trace: Trace, stroke: Stroke | undefined): string {
  if (!stroke) return '開始前';
  return trace.layerDefinitions.find((definition) => definition.id === stroke.aggregationGroupId)?.label ?? stroke.aggregationGroupId;
}

function updatePlaybackView() {
  if (!playbackTrace || !playbackGeometry || !playbackAnalysis) return;
  const total = playbackTrace.strokes.length;
  const cursor = clampPlaybackCursor(playbackState.cursor, total);
  const stroke = playbackStrokeAt(playbackTrace.strokes, cursor);
  const display = playbackLayout && stroke ? playbackStrokeDisplay(playbackLayout, stroke) : undefined;
  const isRomaji = playbackLayout?.romajiTable !== undefined;
  const windowSize = playbackOptions?.windowSize ?? ctx.getUiState().conditions.defaults.windowSize;
  const rateAverage = ctx.getUiState().conditions.defaults.playbackRateAverage;
  const rateWindow = ctx.getUiState().conditions.defaults.playbackRateWindow;
  const rateHalfLife = ctx.getUiState().conditions.defaults.playbackRateHalfLifeSeconds;
  const activeKeys = new Set(stroke?.presses.flatMap((press) => press.keys.map((key) => key.id)) ?? []);
  const triggerKeys = new Set(stroke?.triggerKeys ?? []);
  const fingerPositionKeys = ctx.getUiState().ui.playback.showFingers
    ? playbackPreparedFingerPositionKeys(
      playbackAnalysis,
      playbackTiming,
      cursor,
      playbackState.elapsedMs,
      playbackGeometry,
      ctx.getUiState().ui.playback.fingerPreparationSeconds,
      playbackState.stepsPerSecond,
      playbackState.calibration,
      playbackState.speedMultiplier,
    )
    : new Map<string, Finger>();
  const trailKeys = ctx.getUiState().ui.playback.showTrail
    ? playbackTrailKeys(playbackTrace.strokes, cursor, ctx.getUiState().ui.playback.trailTau)
    : new Map<string, number>();
  const romajiPlannedKeys = isRomaji && ctx.getUiState().ui.playback.showRomajiPlan
    ? playbackRomajiPlannedKeys(playbackTrace.strokes, cursor)
    : new Map<string, number>();
  const plannedKeys = ctx.getUiState().ui.playback.showPlanKeys
    ? playbackPlannedKeys(playbackTrace.strokes, cursor, windowSize)
    : romajiPlannedKeys;
  const plannedOrders = ctx.getUiState().ui.playback.showOrderLabels
    ? ctx.getUiState().ui.playback.showPlanKeys
      ? playbackPlannedOrders(playbackTrace.strokes, cursor, windowSize)
      : ctx.getUiState().ui.playback.showRomajiPlan
        ? playbackRomajiPlannedOrders(playbackTrace.strokes, cursor)
        : new Map<string, number>()
    : new Map<string, number>();
  const trailOrders = ctx.getUiState().ui.playback.showOrderLabels && ctx.getUiState().ui.playback.showTrail
    ? playbackTrailOrders(playbackTrace.strokes, cursor, ctx.getUiState().ui.playback.trailTau)
    : new Map<string, number>();
  const dynamicDisplay = dynamicPlaybackDisplay(ctx.getUiState().ui.playback);
  const chainDisplays = ctx.getUiState().ui.playback.showChain
    ? playbackAnalysisChainOrders(playbackAnalysis, cursor)
    : [];
  const chainOrders = displayedOrders(chainDisplays);
  const arpeggioDisplays = ctx.getUiState().ui.playback.showArpeggio
    ? playbackAnalysisArpeggioOrders(playbackAnalysis, cursor)
    : [];
  const arpeggioOrders = displayedOrders(arpeggioDisplays);
  const sameFingerMotions = playbackState.sameFingerDelay
    && ctx.getUiState().ui.playback.showSameFingerMotion
    ? playbackSameFingerKeyMotions(playbackTrace.strokes, cursor)
    : [];
  const sameFingerTargets = new Set(sameFingerMotions.flatMap((motion) => motion.toKeys));
  const handMotions = (ctx.getUiState().ui.playback.showChain
    ? playbackAnalysisChainMotions(playbackAnalysis, cursor)
    : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const arpeggioMotions = (ctx.getUiState().ui.playback.showArpeggio
    ? playbackAnalysisArpeggioMotions(playbackAnalysis, cursor)
    : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  // 起点と終点が同じキーなら動きが無く、クローンは描かれない。それでも
  // animatedKeys に入れてしまうと打鍵中の塗りだけが抑止されて空白になる。
  // 面が違えば同じ物理キーに別のかなが乗るため、かな配列では普通に起きる。
  const motions = [
    ...sameFingerMotions.map((motion) => ({ ...motion, kind: 'sameFinger' as const })),
    ...handMotions.map((motion) => ({ ...motion, kind: 'chain' as const })),
    ...arpeggioMotions.map((motion) => ({ ...motion, kind: 'chain' as const })),
  ].flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => key !== motion.fromKey);
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const animatedKeys = new Set(motions.flatMap((motion) => motion.toKeys));
  for (const key of elements.playback.querySelectorAll<SVGGElement>('[data-playback-key]')) {
    const id = key.dataset.playbackKey!;
    key.dataset.playbackActive = String(activeKeys.has(id) && !animatedKeys.has(id));
    key.dataset.playbackTrigger = String(triggerKeys.has(id));
    key.dataset.playbackFingerPosition = fingerPositionKeys.get(id) ?? '';
    const trailOpacity = trailKeys.get(id);
    key.dataset.playbackTrail = trailOpacity === undefined ? 'false' : 'true';
    if (trailOpacity === undefined) key.style.removeProperty('--playback-trail-opacity');
    else key.style.setProperty('--playback-trail-opacity', String(trailOpacity));
    const plannedOpacity = plannedKeys.get(id);
    key.dataset.playbackPlan = plannedOpacity === undefined ? 'false' : 'true';
    if (plannedOpacity === undefined) key.style.removeProperty('--playback-plan-opacity');
    else key.style.setProperty('--playback-plan-opacity', String(plannedOpacity));
    const plannedOrder = plannedOrders.get(id);
    const plannedOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="plan"]');
    if (plannedOrderLabel) {
      plannedOrderLabel.textContent = plannedOrder === undefined ? '' : playbackOrderLabel(plannedOrder);
      plannedOrderLabel.setAttribute('visibility', plannedOrder === undefined ? 'hidden' : 'visible');
    }
    const trailOrder = trailOrders.get(id);
    const trailOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="trail"]');
    if (trailOrderLabel) {
      trailOrderLabel.textContent = trailOrder === undefined ? '' : playbackOrderLabel(trailOrder);
      trailOrderLabel.setAttribute('visibility', trailOrder === undefined ? 'hidden' : 'visible');
    }
    const chainOrder = chainOrders.get(id);
    const chainOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="chain"]');
    if (chainOrderLabel) {
      chainOrderLabel.textContent = chainOrder === undefined ? '' : String(chainOrder);
      chainOrderLabel.setAttribute('visibility', chainOrder === undefined ? 'hidden' : 'visible');
    }
    key.dataset.playbackChain = chainOrder === undefined ? 'false' : 'true';
    const arpeggioOrder = arpeggioOrders.get(id);
    const arpeggioOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="arpeggio"]');
    if (arpeggioOrderLabel) {
      arpeggioOrderLabel.textContent = arpeggioOrder === undefined ? '' : String(arpeggioOrder);
      arpeggioOrderLabel.setAttribute('visibility', arpeggioOrder === undefined ? 'hidden' : 'visible');
    }
    key.dataset.playbackArpeggio = arpeggioOrder === undefined ? 'false' : 'true';
    const label = key.querySelector<SVGTextElement>('[data-playback-label]');
    if (label) label.textContent = display?.keyLabels.get(id) ?? key.dataset.playbackBaseLabel ?? '';
  }

  // クローンは cloneNode で盤面のキーを丸ごと写すため、刻印を今のステップへ
  // 更新し終えてから作る。先に作ると前のレイヤーの文字を持ったまま移動する。
  if (cursor !== playbackMotionCursor) {
    renderPlaybackMotions(motions, cursor, stroke);
    playbackMotionCursor = cursor;
  }
  if (playbackFeedbackPending) {
    triggerPlaybackKeyFeedback(activeKeys, ctx.getUiState().ui.playback.keyFeedbackStyle);
    playbackFeedbackPending = false;
  }

  const settingsRoot = elements.playbackSettingsPanel;
  const position = elements.playback.querySelector<HTMLElement>('[data-playback-position]');
  const current = elements.playback.querySelector<HTMLElement>('[data-playback-current]');
  const romaji = elements.playback.querySelector<HTMLElement>('[data-playback-romaji]');
  const kana = elements.playback.querySelector<HTMLElement>('[data-playback-kana]');
  const typed = elements.playback.querySelector<HTMLElement>('[data-playback-typed]');
  const history = elements.playback.querySelector<HTMLElement>('[data-playback-history]');
  const historyText = elements.playback.querySelector<HTMLElement>('[data-playback-history-text]');
  const rateChart = elements.playback.querySelector<HTMLElement>('[data-playback-rate-chart]');
  const planned = elements.playback.querySelector<HTMLElement>('[data-playback-planned]');
  const layer = elements.playback.querySelector<HTMLElement>('[data-playback-layer]');
  const structure = elements.playback.querySelector<HTMLElement>('[data-playback-structure]');
  const seek = elements.playback.querySelector<HTMLInputElement>('[data-playback-seek]');
  const toggle = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="toggle"]');
  const stop = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="stop"]');
  const back = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="back"]');
  const forward = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="forward"]');
  const fingers = settingsRoot.querySelector<HTMLInputElement>('[data-playback-fingers]');
  const keyFeedback = settingsRoot.querySelector<HTMLSelectElement>('[data-playback-key-feedback]');
  const fingerPreparation = settingsRoot.querySelector<HTMLInputElement>('[data-playback-finger-preparation]');
  const planKeys = settingsRoot.querySelector<HTMLInputElement>('[data-playback-plan-keys]');
  const trail = settingsRoot.querySelector<HTMLInputElement>('[data-playback-trail]');
  const trailTau = settingsRoot.querySelector<HTMLInputElement>('[data-playback-trail-tau]');
  const orderLabels = settingsRoot.querySelector<HTMLInputElement>('[data-playback-order-labels]');
  const sameFingerMotion = settingsRoot.querySelector<HTMLInputElement>('[data-playback-same-finger-motion]');
  const scale = settingsRoot.querySelector<HTMLInputElement>('input[data-playback-scale]');
  const sameFingerDelay = settingsRoot.querySelector<HTMLInputElement>('[data-playback-sfb-delay]');
  const allFingerMovementDelay = settingsRoot.querySelector<HTMLInputElement>('[data-playback-all-finger-delay]');
  const chain = settingsRoot.querySelector<HTMLInputElement>('[data-playback-chain]');
  const calibration = settingsRoot.querySelector<HTMLInputElement>('[data-playback-calibration]');
  const showArpeggio = settingsRoot.querySelector<HTMLInputElement>('[data-playback-arpeggio]');
  const chartChain = settingsRoot.querySelector<HTMLInputElement>('[data-playback-chart-chain]');
  const chartArpeggio = settingsRoot.querySelector<HTMLInputElement>('[data-playback-chart-arpeggio]');
  const rateAverageControl = settingsRoot.querySelector<HTMLSelectElement>('[data-playback-rate-average]');
  const rateWindowControl = settingsRoot.querySelector<HTMLInputElement>('[data-playback-rate-window]');
  const rateHalfLifeControl = settingsRoot.querySelector<HTMLInputElement>('[data-playback-rate-half-life]');
  const rate = settingsRoot.querySelector<HTMLInputElement>('input[data-playback-rate]');
  const multiplier = settingsRoot.querySelector<HTMLInputElement>('input[data-playback-multiplier]');
  const effectiveKanaRate = elements.playback.querySelector<HTMLElement>('[data-playback-effective-kana-rate]');
  const effectiveRate = elements.playback.querySelector<HTMLElement>('[data-playback-effective-rate]');
  const playbackWindow = settingsRoot.querySelector<HTMLOutputElement>('[data-playback-window]');
  const settingsSummary = elements.playback.querySelector<HTMLElement>('[data-playback-settings-summary]');
  if (position) position.textContent = `${cursor} / ${total} ステップ`;
  const inputPreview = playbackInputPreview(
    playbackTrace.strokes,
    cursor,
    windowSize,
  );
  if (current) {
    current.hidden = isRomaji;
    current.textContent = stroke
      ? display?.character ?? (stroke.triggerKeys.length > 0 ? '⇧' : stroke.char)
      : '—';
  }
  if (romaji) romaji.hidden = !isRomaji;
  if (kana) {
    kana.textContent = isRomaji
      ? inputPreview.find((segment) => segment.kind === 'current')?.text ?? '—'
      : stroke?.inputChar ?? '—';
  }
  if (typed) typed.textContent = stroke?.char ?? '—';
  const plan = isRomaji
    ? playbackRomajiPlan(playbackTrace.strokes, cursor)
    : undefined;
  if (planned) {
    planned.hidden = plan === undefined;
    planned.textContent = plan ? `予定: ${plan.planned}` : '';
  }
  if (history) history.hidden = inputPreview.length === 0;
  if (historyText) {
    historyText.replaceChildren();
    for (const segment of inputPreview) {
      const span = document.createElement('span');
      span.className = `playback-input-segment playback-input-${segment.kind}`;
      span.textContent = segment.text;
      if (segment.kind === 'current') span.setAttribute('aria-current', 'step');
      historyText.append(span);
    }
  }
  if (rateChart) {
    const chartSignature = JSON.stringify({
      stepsPerSecond: playbackState.stepsPerSecond,
      speedMultiplier: playbackState.speedMultiplier,
      sameFingerDelay: playbackState.sameFingerDelay,
      calibration: playbackState.calibration,
      allFingerMovementDelay: ctx.getUiState().ui.playback.allFingerMovementDelay,
      rateAverage,
      rateWindow,
      rateHalfLife,
      dynamicDisplay,
      strokeCount: playbackTrace.strokes.length,
    });
    if (playbackRateChartSignature !== chartSignature) {
      rateChart.innerHTML = renderPlaybackRateChart(playbackRateChartData(
        playbackAnalysis,
        playbackState.stepsPerSecond,
        playbackState.sameFingerDelay,
        rateWindow,
        playbackState.calibration,
        playbackState.speedMultiplier,
        playbackTiming,
        rateAverage,
        rateHalfLife,
      ), dynamicDisplay);
      playbackRateChartSignature = chartSignature;
    }
    updatePlaybackRateChartCursor(rateChart, cursor);
  }
  if (layer) layer.textContent = playbackLayerLabel(playbackTrace, stroke);
  if (structure) {
    const annotation = playbackStrokeAnnotation(playbackAnalysis, cursor);
    const tags: string[] = [];
    if (annotation?.inLongRoll) tags.push('LongRoll');
    if (annotation?.inTwoRoll) tags.push('TwoRoll');
    if (annotation?.inArpeggio) tags.push('Arpeggio');
    if (playbackRedirectWindows(playbackAnalysis, cursor).length > 0) tags.push('Redirect(3打)');
    if (annotation?.inSfb) tags.push('SFB');
    structure.textContent = tags.length > 0 ? tags.join(' / ') : '—';
  }
  if (seek) seek.value = String(cursor);
  if (toggle) {
    const toggleIcon = toggle.querySelector<HTMLElement>('[data-playback-toggle-icon]');
    const toggleLabel = toggle.querySelector<HTMLElement>('[data-playback-toggle-label]');
    if (toggleIcon) toggleIcon.textContent = playbackState.playing ? '⏸' : '▶';
    if (toggleLabel) toggleLabel.textContent = playbackState.playing ? '一時停止' : '再生';
    toggle.setAttribute('aria-label', playbackState.playing ? '再生を一時停止する' : '再生する');
    toggle.disabled = total === 0 || cursor >= total;
  }
  if (stop) stop.disabled = cursor === 0 && !playbackState.playing;
  if (back) back.disabled = playbackState.playing || cursor === 0;
  if (forward) forward.disabled = playbackState.playing || cursor >= total;
  if (fingers) fingers.checked = ctx.getUiState().ui.playback.showFingers;
  if (keyFeedback) keyFeedback.value = ctx.getUiState().ui.playback.keyFeedbackStyle;
  if (fingerPreparation) fingerPreparation.value = String(ctx.getUiState().ui.playback.fingerPreparationSeconds);
  const romajiPlan = settingsRoot.querySelector<HTMLInputElement>('[data-playback-romaji-plan]');
  if (romajiPlan) {
    romajiPlan.checked = ctx.getUiState().ui.playback.showRomajiPlan;
    romajiPlan.disabled = !isRomaji;
  }
  if (planKeys) {
    planKeys.checked = ctx.getUiState().ui.playback.showPlanKeys;
    planKeys.disabled = false;
  }
  if (trail) trail.checked = ctx.getUiState().ui.playback.showTrail;
  if (trailTau) trailTau.value = String(ctx.getUiState().ui.playback.trailTau);
  if (orderLabels) orderLabels.checked = ctx.getUiState().ui.playback.showOrderLabels;
  if (sameFingerMotion) sameFingerMotion.checked = ctx.getUiState().ui.playback.showSameFingerMotion;
  if (scale) scale.value = String(ctx.getUiState().ui.playback.scale);
  if (sameFingerDelay) sameFingerDelay.checked = playbackState.sameFingerDelay;
  if (allFingerMovementDelay) {
    allFingerMovementDelay.checked = ctx.getUiState().ui.playback.allFingerMovementDelay;
  }
  if (chain) chain.checked = ctx.getUiState().ui.playback.showChain;
  if (showArpeggio) showArpeggio.checked = ctx.getUiState().ui.playback.showArpeggio;
  if (chartChain) chartChain.checked = ctx.getUiState().ui.playback.showChainOnRateChart;
  if (chartArpeggio) chartArpeggio.checked = ctx.getUiState().ui.playback.showArpeggioOnRateChart;
  if (rateAverageControl) rateAverageControl.value = rateAverage;
  if (rateWindowControl) rateWindowControl.value = String(rateWindow);
  if (rateHalfLifeControl) rateHalfLifeControl.value = String(rateHalfLife);
  if (calibration) {
    calibration.checked = ctx.getUiState().ui.playback.useCalibration;
    calibration.disabled = ctx.getCalibration() === undefined;
  }
  const calibrationEditButton = settingsRoot.querySelector<HTMLButtonElement>('[data-playback-action="calibration-edit"]');
  if (calibrationEditButton) {
    calibrationEditButton.disabled = false;
    calibrationEditButton.textContent = ctx.getCalibration() ? '保存値を確認・編集' : '個人速度を測定';
  }
  if (rate) rate.value = String(playbackState.stepsPerSecond);
  if (multiplier) multiplier.value = String(playbackState.speedMultiplier);
  const chainPolicy = ctx.getChainPolicy();
  for (const input of settingsRoot.querySelectorAll<HTMLInputElement>('[data-playback-chain-policy]')) {
    const key = input.dataset.playbackChainPolicy;
    if (isChainPolicyKey(key)) input.checked = chainPolicy[key];
  }
  const arpeggioPolicy = ctx.getArpeggioPolicy();
  for (const input of settingsRoot.querySelectorAll<HTMLInputElement>('[data-playback-arpeggio-policy]')) {
    const key = input.dataset.playbackArpeggioPolicy;
    if (key === 'includeThumb' || key === 'bridgeSameFinger' || key === 'includeSingleRedirectTail') {
      input.checked = arpeggioPolicy[key];
    }
  }
  if (settingsSummary) {
    settingsSummary.textContent = `${playbackState.stepsPerSecond}ステップ/秒・${playbackState.speedMultiplier}倍`;
  }
  const scope = settingsRoot.querySelector<HTMLElement>('[data-playback-settings-scope]');
  if (scope) scope.textContent = ctx.isPlaybackLayoutOverride() ? `${playbackLayout?.name ?? 'この配列'}専用` : '共通設定';
  const scopeButton = settingsRoot.querySelector<HTMLButtonElement>('[data-playback-layout-override]');
  if (scopeButton) {
    const override = ctx.isPlaybackLayoutOverride();
    scopeButton.dataset.playbackLayoutOverride = override ? 'disable' : 'enable';
    scopeButton.textContent = override ? '共通設定に戻す' : 'この配列専用にする';
  }
  if (effectiveKanaRate) {
    const value = playbackRecentKanaPerSecond(
      playbackAnalysis,
      cursor,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      rateWindow,
      playbackState.calibration,
      playbackState.speedMultiplier,
      playbackTiming,
      rateAverage,
      rateHalfLife,
    );
    const rateLabel = rateAverage === 'ewma' ? `EWMA(${rateHalfLife}秒)` : `直近${rateWindow}打鍵`;
    effectiveKanaRate.textContent = value === undefined
      ? `${rateLabel} — かな/秒`
      : `${rateLabel} ${value.toFixed(2)} かな/秒`;
  }
  if (effectiveRate) {
    const value = playbackRecentActionsPerSecond(
      playbackAnalysis,
      cursor,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      rateWindow,
      playbackState.calibration,
      playbackState.speedMultiplier,
      playbackTiming,
      rateAverage,
      rateHalfLife,
    );
    const rateLabel = rateAverage === 'ewma' ? `EWMA(${rateHalfLife}秒)` : `直近${rateWindow}打鍵`;
    effectiveRate.textContent = value === undefined
      ? `${rateLabel} — アクション/秒`
      : `${rateLabel} ${value.toFixed(2)} アクション/秒`;
  }
  if (playbackWindow) playbackWindow.textContent = String(windowSize);
}

function renderPlaybackSvg(layout: Layout, geometry: ReturnType<typeof buildGeometry>): string {
  let maxX = 0;
  let maxY = 0;
  const keys = [...geometry.keys.values()].map((key) => {
    const thumb = key.row === THUMB_ROW;
    const width = (thumb ? PLAYBACK_THUMB_WIDTH : 1) * PLAYBACK_KEY;
    const x = (key.x - (thumb ? (PLAYBACK_THUMB_WIDTH - 1) / 2 : 0)) * PLAYBACK_KEY;
    const y = key.y * PLAYBACK_KEY;
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + PLAYBACK_KEY);
    const label = layout.legends.get(key.id) ?? '';
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const tip = `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>${escapeText(FINGER_LABEL[key.finger])}`;
    return `<g data-tip="${escapeAttr(tip)}" data-playback-key="${escapeAttr(key.id)}" data-playback-finger="${key.finger}" data-playback-base-label="${escapeAttr(label)}" data-playback-active="false" data-playback-trigger="false" data-playback-finger-position="" data-playback-plan="false">
      <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${PLAYBACK_KEY - 2}" rx="5" fill="var(--panel)" stroke="var(--line)"/>
      <rect data-playback-feedback-overlay x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${PLAYBACK_KEY - 2}" rx="5" fill="var(--panel)" opacity="0" pointer-events="none"/>
      <text class="playback-order playback-order-plan" data-playback-order="plan" x="${x + 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-trail" data-playback-order="trail" x="${x + width - 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-chain" data-playback-order="chain" x="${x + width / 2}" y="${y + PLAYBACK_KEY - 5}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-arpeggio" data-playback-order="arpeggio" x="${x + width / 2}" y="${y + 11}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-key-label" data-playback-label x="${x + width / 2}" y="${y + PLAYBACK_KEY / 2 + 4}" text-anchor="middle" font-size="${fontSize}" fill="var(--fg)" pointer-events="none">${escapeText(label)}</text>
    </g>`;
  });
  const W = maxX + PLAYBACK_PAD;
  const H = maxY + PLAYBACK_PAD;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W * ctx.getUiState().ui.playback.scale}" height="${H * ctx.getUiState().ui.playback.scale}" role="img"
    aria-label="${escapeAttr(`${layout.name}の打鍵再生`)}">${keys.join('')}<g data-playback-motion-layer aria-hidden="true"></g></svg>`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderPlaybackMotions(
  motions: readonly (ReturnType<typeof playbackSameFingerKeyMotions>[number] & {
    kind: 'sameFinger' | 'chain';
  })[],
  cursor: number,
  stroke: Stroke | undefined,
) {
  const layer = elements.playback.querySelector<SVGGElement>('[data-playback-motion-layer]');
  if (!layer) return;
  layer.replaceChildren();
  if (!stroke || motions.length === 0) return;

  const sourceKeys = new Map<string, SVGGElement>();
  for (const key of elements.playback.querySelectorAll<SVGGElement>('[data-playback-key]')) {
    sourceKeys.set(key.dataset.playbackKey!, key);
  }
  const durationIndex = Math.max(0, cursor - 1);
  const durationMs = Math.max(
    150,
    Math.min(
      1500,
      playbackTimingStepDurationMs(playbackTiming, durationIndex)
        ?? playbackStepDurationMs(
          playbackAnalysis!,
          durationIndex,
          playbackState.stepsPerSecond,
          playbackState.sameFingerDelay,
          playbackState.calibration,
          playbackState.speedMultiplier,
        ),
    ),
  );
  let motionIndex = 0;
  for (const motion of motions) {
    const from = sourceKeys.get(motion.fromKey);
    if (!from) continue;
    const fromRect = from.querySelector<SVGRectElement>('rect');
    if (!fromRect) continue;
    for (const toKeyId of motion.toKeys) {
      const to = sourceKeys.get(toKeyId);
      const toRect = to?.querySelector<SVGRectElement>('rect');
      if (!to || !toRect) continue;
      const dx = Number(fromRect.getAttribute('x')) - Number(toRect.getAttribute('x'));
      const dy = Number(fromRect.getAttribute('y')) - Number(toRect.getAttribute('y'));
      if (dx === 0 && dy === 0) continue;
      const clone = to.cloneNode(true) as SVGGElement;
      clone.removeAttribute('data-playback-key');
      clone.removeAttribute('data-playback-base-label');
      clone.setAttribute('data-playback-motion-key', `${cursor}-${motionIndex++}`);
      clone.setAttribute('data-playback-motion-kind', motion.kind);
      clone.setAttribute('transform', `translate(${dx} ${dy})`);
      clone.style.pointerEvents = 'none';
      const animation = document.createElementNS(SVG_NS, 'animateTransform');
      animation.setAttribute('attributeName', 'transform');
      animation.setAttribute('type', 'translate');
      // animateTransform の from/to は type で指定した変換関数の「引数だけ」を書く。
      // translate(...) と関数名を付けると不正値として無視され、静的な transform 属性
      // （＝移動元）が残ったままアニメーションが一切適用されない。
      animation.setAttribute('from', `${dx} ${dy}`);
      animation.setAttribute('to', '0 0');
      animation.setAttribute('dur', `${durationMs}ms`);
      animation.setAttribute('fill', 'freeze');
      // begin既定値の0sはDOM挿入時ではなくSVGドキュメントのタイムライン基準の0秒を指す。
      // 再生パネルのSVGは描画時点からタイムラインが進み続けているため、
      // 再生が進んだ後にクローンを挿入するとbegin=0sは既に過去になっており、
      // fill="freeze"によって終了状態（translate(0 0)）へ張り付いた状態で出現してしまう。
      // indefiniteにして挿入後にbeginElement()を呼び、挿入時点を起点に明示的に開始させる。
      animation.setAttribute('begin', 'indefinite');
      clone.append(animation);
      layer.append(clone);
      // SMIL未対応環境ではbeginElementが存在しない、または呼び出しが例外を投げうる。
      // アニメーションが始まらないだけに留め、再生全体を壊さないようtry/catchで防御する。
      const animatable = animation as SVGAnimationElement & { beginElement?: () => void };
      let started = false;
      if (typeof animatable.beginElement === 'function') {
        try {
          animatable.beginElement();
          started = true;
        } catch {
          started = false;
        }
      }
      // 開始できなければ begin='indefinite' のまま永久に走らないため、クローンは
      // 移動元の位置に幽霊として残る。表示しない方が縮退として素直なので捨てる。
      if (!started) clone.remove();
    }
  }
}

/**
 * 現在Strokeで実際に押した全キーへ同じフィードバック経路を適用する。
 * 連打も通常打鍵も区別せず、cursorが進むたびに既存animationをcancelして再発火する。
 */
function triggerPlaybackKeyFeedback(
  keyIds: ReadonlySet<string>,
  style: PlaybackKeyFeedbackStyle,
): void {
  if (style === 'off' || keyIds.size === 0) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  for (const id of keyIds) {
    const key = elements.playback.querySelector<SVGGElement>(
      `[data-playback-key="${CSS.escape(id)}"]`,
    );
    const overlay = key?.querySelector<SVGRectElement>('[data-playback-feedback-overlay]');
    if (!key || !overlay) continue;

    key.getAnimations().forEach((animation) => animation.cancel());
    overlay.getAnimations().forEach((animation) => animation.cancel());
    overlay.style.transition = 'none';
    overlay.style.opacity = '0';

    if (reducedMotion) {
      // motionは出さず、1フレームだけ押下を示す。
      overlay.style.opacity = '0.45';
      requestAnimationFrame(() => { overlay.style.opacity = '0'; });
      continue;
    }

    if (style === 'fade') {
      const face = key.querySelector<SVGRectElement>('rect:not([data-playback-feedback-overlay])');
      if (face) {
        // 押下色そのものを地色からaccentへ遷移させる。連打でも毎回同じ経路を再発火する。
        face.getAnimations().forEach((animation) => animation.cancel());
        face.animate(
          [
            { fill: 'var(--panel)', stroke: 'var(--line)' },
            { fill: 'var(--accent)', stroke: 'var(--accent)' },
          ],
          { duration: 120, easing: 'ease-out' },
        );
      }
      continue;
    }

    if (style === 'pulse') {
      overlay.animate(
        [{ opacity: 0.62 }, { opacity: 0 }],
        { duration: 220, easing: 'ease-out' },
      );
      continue;
    }

    key.style.transformBox = 'fill-box';
    key.style.transformOrigin = 'center';
    key.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.065)' }, { transform: 'scale(1)' }],
      { duration: 160, easing: 'ease-out' },
    );
  }
}

function rerenderPlaybackFigure() {
  if (!playbackLayout || !playbackGeometry) return;
  const figure = elements.playback.querySelector<HTMLElement>('.playback-figure');
  if (figure) {
    figure.innerHTML = renderPlaybackSvg(playbackLayout, playbackGeometry);
    playbackMotionCursor = -1;
  }
}

function renderPlayback(
  trace: Trace,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
  options: Options,
  analysis: AggregatedAnalysisResult,
) {
  const previousAnalysis = playbackAnalysis;
  const previousState = playbackState;
  const previousTiming = playbackTiming;
  const preserveMode = preserveStateOnNextRender;
  preserveStateOnNextRender = undefined;
  const preserveState = preserveMode !== undefined && previousAnalysis !== undefined;
  cancelPlaybackAnimation();
  playbackTrace = trace;
  playbackAnalysis = analysis;
  playbackGeometry = geometry;
  playbackLayout = layout;
  playbackOptions = options;
  const nextSettings = ctx.getPlaybackSettings();
  const nextBaseState = createPlaybackState(
    nextSettings.stepsPerSecond,
    nextSettings.sameFingerDelay,
    nextSettings.useCalibration ? ctx.getCalibration() : undefined,
    nextSettings.speedMultiplier,
  );
  const nextCursor = preserveMode === 'input-position' && previousAnalysis
    ? playbackCursorForEquivalentInputPosition(
      previousAnalysis.strokes,
      analysis.strokes,
      previousState.cursor,
    )
    : previousState.cursor;
  const nextTiming = playbackTimingSchedule(
    analysis,
    nextBaseState.stepsPerSecond,
    nextBaseState.sameFingerDelay,
    nextBaseState.calibration,
    nextBaseState.speedMultiplier,
    {
      allFingerMovementDelay: nextSettings.allFingerMovementDelay,
      geometry,
    },
  );
  playbackState = preserveState
    ? reconcilePlaybackStateAfterAnalysisRefresh(
      previousState,
      nextBaseState,
      previousAnalysis,
      analysis,
      nextCursor,
      previousTiming,
      nextTiming,
    )
    : nextBaseState;
  playbackTiming = nextTiming;
  playbackMotionCursor = -1;
  playbackSeekWasPlaying = undefined;
  playbackRateChartSignature = undefined;
  playbackFeedbackPending = false;
  const rateAverage = ctx.getUiState().conditions.defaults.playbackRateAverage;
  const rateWindow = ctx.getUiState().conditions.defaults.playbackRateWindow;
  const rateHalfLife = ctx.getUiState().conditions.defaults.playbackRateHalfLifeSeconds;
  const rateInitialLabel = rateAverage === 'ewma'
    ? `EWMA(${rateHalfLife}秒)`
    : `直近${rateWindow}打鍵`;
  elements.playback.innerHTML = `<details class="playback-panel"${ctx.getUiState().ui.panels.playback ? ' open' : ''}>
    <summary><span>打鍵再生</span><span class="playback-summary-hint">クリックして開く</span></summary>
    <div class="playback-body">
      <div class="playback-head">
        <button type="button" class="secondary playback-setting-button" data-playback-settings-open aria-controls="playback-settings-panel" aria-expanded="false">
          <span>再生設定</span><small data-playback-settings-summary>—</small>
        </button>
      </div>
      <div class="playback-controls" role="group" aria-label="打鍵再生の操作">
        <button type="button" class="ghost" data-playback-action="back"><span class="playback-control-icon" aria-hidden="true">◀</span><span>1 ステップ戻る</span></button>
        <button type="button" data-playback-action="toggle" aria-label="再生する"><span class="playback-control-icon" data-playback-toggle-icon aria-hidden="true">▶</span><span data-playback-toggle-label>再生</span></button>
        <button type="button" class="secondary" data-playback-action="stop" disabled><span class="playback-control-icon" aria-hidden="true">■</span><span>停止</span></button>
        <button type="button" class="ghost" data-playback-action="forward"><span class="playback-control-icon" aria-hidden="true">▶</span><span>1 ステップ進む</span></button>
        <span class="playback-position" aria-live="polite" data-playback-position>0 / ${trace.strokes.length} ステップ</span>
        <span class="playback-effective-rates"><span class="playback-effective-kana-rate" data-playback-effective-kana-rate>${rateInitialLabel} — かな/秒</span><span class="playback-effective-rate" data-playback-effective-rate>${rateInitialLabel} — アクション/秒</span></span>
      </div>
      <label class="playback-seek"><span>再生位置</span><input type="range" data-playback-seek min="0" max="${trace.strokes.length}" step="1" value="0" /></label>
      <div class="playback-status" aria-live="polite">
        <div class="playback-status-line">
          <span class="playback-current" data-playback-current>—</span>
          <span class="playback-romaji" data-playback-romaji hidden><span class="playback-current" data-playback-kana>—</span><span class="playback-typed">打鍵: <code data-playback-typed>—</code><span class="playback-planned" data-playback-planned hidden></span></span></span>
          <span class="playback-attribution">帰属: <b data-playback-layer>開始前</b></span>
          <span class="playback-attribution">構造: <b data-playback-structure>—</b></span>
        </div>
        <div class="playback-history" data-playback-history hidden>
          <span class="playback-history-label">入力:</span>
          <span data-playback-history-text></span>
        </div>
      </div>
      <details class="playback-rate-chart-panel"${ctx.getUiState().ui.panels.playbackRateChart ? ' open' : ''}>
        <summary>かな/秒・アクション/秒の平均推移</summary>
        <div class="playback-rate-chart" data-playback-rate-chart></div>
      </details>
      <div class="fig-fixed playback-figure">${renderPlaybackSvg(layout, geometry)}</div>
    </div>
  </details>`;
  elements.playbackSettingsPanel.innerHTML = playbackSettingsMarkup(layout, options);
  setPlaybackSettingsOpen(playbackSettingsOpen);
  updatePlaybackView();
  if (preserveState && playbackState.playing) {
    playbackAnimationFrame = requestAnimationFrame((timestamp) => playbackFrame(timestamp));
  }
}

function startPlayback() {
  if (!playbackTrace || playbackState.cursor >= playbackTrace.strokes.length) return;
  cancelPlaybackAnimation();
  // 一時停止からの再開では現在Stroke内の経過時間を維持する。
  // 準備表示もelapsedMsを使うため、0へ戻すと到着済みの指が逆戻りしてしまう。
  playbackState = { ...playbackState, playing: true };
  updatePlaybackView();
  playbackAnimationFrame = requestAnimationFrame((timestamp) => playbackFrame(timestamp));
}

function pausePlayback() {
  cancelPlaybackAnimation();
  playbackState = { ...playbackState, playing: false };
  updatePlaybackView();
}

function stopPlayback() {
  cancelPlaybackAnimation();
  playbackState = createPlaybackState(
    playbackState.stepsPerSecond,
    playbackState.sameFingerDelay,
    ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined,
    playbackState.speedMultiplier,
  );
  playbackMotionCursor = -1;
  updatePlaybackView();
}

function playbackFrame(timestamp: number) {
  playbackAnimationFrame = undefined;
  if (!playbackState.playing || !playbackTrace || !playbackAnalysis) return;
  if (playbackLastTimestamp === undefined) playbackLastTimestamp = timestamp;
  else {
    const previousCursor = playbackState.cursor;
    const nextState = advancePlayback(
      playbackState,
      timestamp - playbackLastTimestamp,
      playbackAnalysis,
      playbackTiming,
    );
    playbackFeedbackPending ||= nextState.cursor > previousCursor;
    playbackState = nextState;
    playbackLastTimestamp = timestamp;
    updatePlaybackView();
  }
  if (playbackState.playing) playbackAnimationFrame = requestAnimationFrame((next) => playbackFrame(next));
  else playbackLastTimestamp = undefined;
}

function beginPlaybackSeek() {
  if (playbackSeekWasPlaying !== undefined) return;
  playbackSeekWasPlaying = playbackState.playing;
  if (playbackState.playing) pausePlayback();
}

function finishPlaybackSeek() {
  if (playbackSeekWasPlaying === undefined) return;
  const resume = playbackSeekWasPlaying;
  playbackSeekWasPlaying = undefined;
  if (resume) startPlayback();
}

function seekPlayback(value: string, playing = false) {
  if (!playbackTrace) return;
  playbackState = {
    ...playbackState,
    cursor: clampPlaybackCursor(Number(value), playbackTrace.strokes.length),
    elapsedMs: 0,
    playing,
  };
  updatePlaybackView();
}

function refreshStructuralAnalysis(): void {
  preserveStateOnNextRender = 'cursor';
  ctx.refreshAnalysis();
}

function refreshInputRealizationAnalysis(): void {
  preserveStateOnNextRender = 'input-position';
  ctx.refreshAnalysis();
}


  function setup(): void {
    elements.playback.addEventListener('toggle', (e) => {
      const details = e.target as HTMLDetailsElement;
      if (!(details instanceof HTMLDetailsElement)) return;
      if (details.classList.contains('playback-panel')) {
        ctx.updateUiState((draft) => { draft.ui.panels.playback = details.open; });
        if (!details.open) setPlaybackSettingsOpen(false);
      } else if (details.classList.contains('playback-rate-chart-panel')) {
        ctx.updateUiState((draft) => { draft.ui.panels.playbackRateChart = details.open; });
      }
    }, true);
    elements.playback.addEventListener('click', (e) => {
      const rateCursor = (e.target as Element).closest<SVGElement>('[data-playback-rate-cursor]');
      if (rateCursor) {
        seekPlayback(rateCursor.getAttribute('data-playback-rate-cursor') ?? '0');
        return;
      }
      const settingsOpen = (e.target as Element).closest<HTMLButtonElement>('[data-playback-settings-open]');
      if (settingsOpen) {
        setPlaybackSettingsOpen(!playbackSettingsOpen);
        return;
      }
      const target = (e.target as Element).closest<HTMLButtonElement>('button[data-playback-action]');
      if (!target) return;
      if (target.dataset.playbackAction === 'calibration') {
        ctx.openCalibration();
        return;
      }
      if (target.dataset.playbackAction === 'calibration-edit') {
        if (ctx.getCalibration()) ctx.openCalibrationEdit();
        else ctx.openCalibration();
        return;
      }
      switch (target.dataset.playbackAction) {
        case 'toggle': if (playbackState.playing) pausePlayback(); else startPlayback(); break;
        case 'stop': stopPlayback(); break;
        case 'back':
          if (!playbackTrace) return;
          playbackState = stepPlayback(playbackState, -1, playbackTrace.strokes.length);
          updatePlaybackView();
          break;
        case 'forward': {
          if (!playbackTrace) return;
          const previousCursor = playbackState.cursor;
          const nextState = stepPlayback(playbackState, 1, playbackTrace.strokes.length);
          playbackFeedbackPending ||= nextState.cursor > previousCursor;
          playbackState = nextState;
          updatePlaybackView();
          break;
        }
      }
    });
    elements.playbackSettingsPanel.addEventListener('toggle', (e) => {
      const details = e.target as HTMLDetailsElement;
      if (!(details instanceof HTMLDetailsElement)) return;
      const key = details.dataset.playbackDetails;
      if (key) playbackSettingsDetailsOpen.set(key, details.open);
    }, true);
    elements.playbackSettingsPanel.addEventListener('click', (e) => {
      const targetElement = e.target as Element;
      const close = targetElement.closest<HTMLButtonElement>('[data-playback-settings-close]');
      if (close) {
        setPlaybackSettingsOpen(false);
        return;
      }
      const settingsTab = targetElement.closest<HTMLButtonElement>('[data-playback-settings-tab]');
      if (settingsTab?.dataset.playbackSettingsTab) {
        const tabId = settingsTab.dataset.playbackSettingsTab;
        if (tabId !== 'display' && tabId !== 'graph' && tabId !== 'conditions') return;
        playbackSettingsTab = tabId;
        for (const tab of elements.playbackSettingsPanel.querySelectorAll<HTMLButtonElement>('[data-playback-settings-tab]')) {
          tab.setAttribute('aria-selected', String(tab === settingsTab));
        }
        for (const panel of elements.playbackSettingsPanel.querySelectorAll<HTMLElement>('[data-playback-settings-panel]')) {
          panel.hidden = panel.dataset.playbackSettingsPanel !== tabId;
        }
        return;
      }
      const layoutOverride = targetElement.closest<HTMLButtonElement>('[data-playback-layout-override]');
      if (layoutOverride) {
        ctx.setPlaybackLayoutOverride(layoutOverride.dataset.playbackLayoutOverride === 'enable');
        return;
      }
      const action = targetElement.closest<HTMLButtonElement>('button[data-playback-action]');
      if (action?.dataset.playbackAction === 'calibration-edit') {
        if (ctx.getCalibration()) ctx.openCalibrationEdit();
        else ctx.openCalibration();
      }
    });
    elements.app.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && playbackSettingsOpen) {
        e.preventDefault();
        setPlaybackSettingsOpen(false);
      }
    });
    elements.playback.addEventListener('input', (e) => {
      const target = (e.target as Element).closest<HTMLInputElement>('input[data-playback-seek]');
      if (!target) return;
      beginPlaybackSeek(); seekPlayback(target.value);
    });
    elements.playback.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('input[data-playback-seek]')) beginPlaybackSeek();
    });
    elements.playback.addEventListener('pointerup', (e) => {
      if ((e.target as Element).closest('input[data-playback-seek]')) finishPlaybackSeek();
    });
    elements.app.addEventListener('change', (e) => {
      const target = e.target as Element;
      const sameFingerDelay = target.closest<HTMLInputElement>('[data-playback-sfb-delay]');
      if (sameFingerDelay) {
        playbackState = setPlaybackSameFingerDelay(playbackState, sameFingerDelay.checked);
        refreshPlaybackTiming();
        ctx.updatePlaybackSetting('sameFingerDelay', sameFingerDelay.checked);
        playbackMotionCursor = -1; updatePlaybackView(); return;
      }
      const allFingerDelay = target.closest<HTMLInputElement>('[data-playback-all-finger-delay]');
      if (allFingerDelay) {
        ctx.updatePlaybackSetting('allFingerMovementDelay', allFingerDelay.checked);
        playbackState = { ...playbackState, elapsedMs: 0 };
        refreshPlaybackTiming();
        playbackMotionCursor = -1;
        updatePlaybackView();
        return;
      }
      const sameFingerMotion = target.closest<HTMLInputElement>('[data-playback-same-finger-motion]');
      if (sameFingerMotion) {
        ctx.updatePlaybackSetting('showSameFingerMotion', sameFingerMotion.checked);
        playbackMotionCursor = -1; updatePlaybackView(); return;
      }
      const chain = target.closest<HTMLInputElement>('[data-playback-chain]');
      if (chain) {
        ctx.updatePlaybackSetting('showChain', chain.checked);
        playbackMotionCursor = -1;
        updatePlaybackView();
        return;
      }
      const showArpeggio = target.closest<HTMLInputElement>('[data-playback-arpeggio]');
      if (showArpeggio) {
        ctx.updatePlaybackSetting('showArpeggio', showArpeggio.checked);
        playbackMotionCursor = -1;
        updatePlaybackView();
        return;
      }
      const chartChain = target.closest<HTMLInputElement>('[data-playback-chart-chain]');
      if (chartChain) {
        ctx.updatePlaybackSetting('showChainOnRateChart', chartChain.checked);
        playbackRateChartSignature = undefined;
        updatePlaybackView();
        return;
      }
      const chartArpeggio = target.closest<HTMLInputElement>('[data-playback-chart-arpeggio]');
      if (chartArpeggio) {
        ctx.updatePlaybackSetting('showArpeggioOnRateChart', chartArpeggio.checked);
        playbackRateChartSignature = undefined;
        updatePlaybackView();
        return;
      }
      const rateAverage = target.closest<HTMLSelectElement>('select[data-playback-rate-average]');
      if (rateAverage) {
        const value = rateAverage.value;
        if (value === 'sma' || value === 'ewma') {
          ctx.updateUiState((draft) => { draft.conditions.defaults.playbackRateAverage = value; });
          playbackRateChartSignature = undefined;
          updatePlaybackView();
        }
        return;
      }
      const rateWindow = target.closest<HTMLInputElement>('input[data-playback-rate-window]');
      if (rateWindow) {
        const value = Number(rateWindow.value);
        if (Number.isInteger(value) && value >= PLAYBACK_RATE_WINDOW_MIN && value <= PLAYBACK_RATE_WINDOW_MAX) {
          ctx.updateUiState((draft) => { draft.conditions.defaults.playbackRateWindow = value; });
          playbackRateChartSignature = undefined;
          updatePlaybackView();
        }
        return;
      }
      const rateHalfLife = target.closest<HTMLInputElement>('input[data-playback-rate-half-life]');
      if (rateHalfLife) {
        const value = Number(rateHalfLife.value);
        if (Number.isFinite(value) && value >= PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN && value <= PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX) {
          ctx.updateUiState((draft) => { draft.conditions.defaults.playbackRateHalfLifeSeconds = value; });
          playbackRateChartSignature = undefined;
          updatePlaybackView();
        }
        return;
      }
      const triggerHold = target.closest<HTMLInputElement>('[data-playback-trigger-hold]');
      if (triggerHold) {
        ctx.updateTriggerRealizationPolicy({
          ...ctx.getTriggerRealizationPolicy(),
          useHold: triggerHold.checked,
        });
        refreshInputRealizationAnalysis();
        return;
      }
      const triggerActions = target.closest<HTMLInputElement>('[data-playback-trigger-actions]');
      if (triggerActions) {
        ctx.updateActionRealizationPolicy({
          ...ctx.getActionRealizationPolicy(),
          triggerActivation: triggerActions.checked ? 'semantic' : 'disabled',
        });
        refreshInputRealizationAnalysis();
        return;
      }
      const triggerClass = target.closest<HTMLSelectElement>('select[data-playback-trigger-class]');
      if (triggerClass) {
        const kind = triggerClass.dataset.playbackTriggerClass;
        if (kind === 'prepress-required' || kind === 'order-free' || kind === 'postpress-required') {
          const action = ctx.getActionRealizationPolicy();
          const overrides = { ...(action.triggerActivationClassOverrides ?? {}) };
          if (triggerClass.value === 'combined' || triggerClass.value === 'separate') {
            overrides[kind] = triggerClass.value;
          } else {
            delete overrides[kind];
          }
          ctx.updateActionRealizationPolicy({
            ...action,
            triggerActivationClassOverrides: overrides,
          });
          refreshInputRealizationAnalysis();
        }
        return;
      }
      const triggerModifierGroups = target.closest<HTMLSelectElement>('select[data-playback-trigger-modifier-groups]');
      if (triggerModifierGroups) {
        const encoded = triggerModifierGroups.dataset.playbackTriggerModifierGroups;
        if (encoded) {
          const modifierGroupIds = JSON.parse(encoded) as string[];
          const action = ctx.getActionRealizationPolicy();
          const overrides = (action.triggerActivationOverrides ?? [])
            .filter((override) =>
              !sameModifierGroupSelector(override.selector, modifierGroupIds));
          if (triggerModifierGroups.value === 'combined' || triggerModifierGroups.value === 'separate') {
            overrides.push({
              selector: { modifierGroupIds },
              grouping: triggerModifierGroups.value,
            });
          }
          ctx.updateActionRealizationPolicy({
            ...action,
            triggerActivationOverrides: overrides,
          });
          refreshInputRealizationAnalysis();
        }
        return;
      }
      const triggerPhysical = target.closest<HTMLSelectElement>('select[data-playback-trigger-physical]');
      if (triggerPhysical) {
        const encoded = triggerPhysical.dataset.playbackTriggerPhysical;
        if (encoded) {
          const selector = JSON.parse(encoded) as {
            modifierGroupIds: string[];
            triggerKeys: string[];
          };
          const action = ctx.getActionRealizationPolicy();
          const group = {
            modifierGroupIds: selector.modifierGroupIds,
            triggerKeys: selector.triggerKeys,
            label: '',
            activationClass: 'order-free' as const,
          };
          const overrides = (action.triggerActivationOverrides ?? [])
            .filter((override) =>
              !samePhysicalTriggerSelector(override.selector, group));
          if (triggerPhysical.value === 'combined' || triggerPhysical.value === 'separate') {
            overrides.push({
              selector,
              grouping: triggerPhysical.value,
            });
          }
          ctx.updateActionRealizationPolicy({
            ...action,
            triggerActivationOverrides: overrides,
          });
          refreshInputRealizationAnalysis();
        }
        return;
      }
      const chainPolicyInput = target.closest<HTMLInputElement>('[data-playback-chain-policy]');
      if (chainPolicyInput) {
        const key = chainPolicyInput.dataset.playbackChainPolicy;
        if (isChainPolicyKey(key)) {
          ctx.updateChainPolicy({ ...ctx.getChainPolicy(), [key]: chainPolicyInput.checked });
          refreshStructuralAnalysis();
        }
        return;
      }
      const arpeggioPolicyInput = target.closest<HTMLInputElement>('[data-playback-arpeggio-policy]');
      if (arpeggioPolicyInput) {
        const key = arpeggioPolicyInput.dataset.playbackArpeggioPolicy;
        if (key === 'includeThumb' || key === 'bridgeSameFinger' || key === 'includeSingleRedirectTail') {
          ctx.updateArpeggioPolicy({ ...ctx.getArpeggioPolicy(), [key]: arpeggioPolicyInput.checked });
          refreshStructuralAnalysis();
        }
        return;
      }
      const calibration = target.closest<HTMLInputElement>('[data-playback-calibration]');
      if (calibration) {
        ctx.updatePlaybackSetting('useCalibration', calibration.checked);
        playbackState = setPlaybackCalibration(playbackState, ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined);
        refreshPlaybackTiming();
        updatePlaybackView(); return;
      }
      const rate = target.closest<HTMLInputElement>('input[data-playback-rate]');
      if (rate) {
        const value = Number(rate.value);
        if (Number.isFinite(value) && value >= PLAYBACK_STEPS_PER_SECOND_MIN && value <= PLAYBACK_STEPS_PER_SECOND_MAX) {
          playbackState = setPlaybackStepsPerSecond(playbackState, value as PlaybackStepsPerSecond);
          refreshPlaybackTiming();
          ctx.updatePlaybackSetting('stepsPerSecond', value);
        }
        updatePlaybackView(); return;
      }
      const multiplier = target.closest<HTMLInputElement>('input[data-playback-multiplier]');
      if (multiplier) {
        const value = Number(multiplier.value);
        if (Number.isFinite(value) && value >= PLAYBACK_SPEED_MULTIPLIER_MIN && value <= PLAYBACK_SPEED_MULTIPLIER_MAX) {
          playbackState = setPlaybackSpeedMultiplier(playbackState, value);
          refreshPlaybackTiming();
          ctx.updatePlaybackSetting('speedMultiplier', value);
        }
        updatePlaybackView(); return;
      }
      const fingers = target.closest<HTMLInputElement>('input[data-playback-fingers]');
      if (fingers) { ctx.updatePlaybackSetting('showFingers', fingers.checked); updatePlaybackView(); return; }
      const keyFeedback = target.closest<HTMLSelectElement>('select[data-playback-key-feedback]');
      if (keyFeedback) {
        const value = keyFeedback.value;
        if (value === 'off' || value === 'fade' || value === 'pulse' || value === 'bounce') {
          ctx.updatePlaybackSetting('keyFeedbackStyle', value);
        }
        return;
      }
      const fingerPreparation = target.closest<HTMLInputElement>('input[data-playback-finger-preparation]');
      if (fingerPreparation) {
        const value = Number(fingerPreparation.value);
        if (Number.isFinite(value) && value >= 0) {
          ctx.updatePlaybackSetting('fingerPreparationSeconds', value);
        }
        updatePlaybackView(); return;
      }
      const romajiPlan = target.closest<HTMLInputElement>('input[data-playback-romaji-plan]');
      if (romajiPlan) { ctx.updatePlaybackSetting('showRomajiPlan', romajiPlan.checked); updatePlaybackView(); return; }
      const planKeys = target.closest<HTMLInputElement>('input[data-playback-plan-keys]');
      if (planKeys) { ctx.updatePlaybackSetting('showPlanKeys', planKeys.checked); updatePlaybackView(); return; }
      const trail = target.closest<HTMLInputElement>('input[data-playback-trail]');
      if (trail) { ctx.updatePlaybackSetting('showTrail', trail.checked); updatePlaybackView(); return; }
      const trailTau = target.closest<HTMLInputElement>('input[data-playback-trail-tau]');
      if (trailTau) {
        const value = Number(trailTau.value);
        if (Number.isInteger(value) && value >= 1 && value <= 20) ctx.updatePlaybackSetting('trailTau', value);
        updatePlaybackView(); return;
      }
      const orderLabels = target.closest<HTMLInputElement>('input[data-playback-order-labels]');
      if (orderLabels) { ctx.updatePlaybackSetting('showOrderLabels', orderLabels.checked); updatePlaybackView(); return; }
      const scale = target.closest<HTMLInputElement>('input[data-playback-scale]');
      if (scale) {
        const value = Number(scale.value);
        if (Number.isFinite(value) && value >= PLAYBACK_SCALE_MIN && value <= PLAYBACK_SCALE_MAX) {
          ctx.updatePlaybackSetting('scale', value); rerenderPlaybackFigure(); updatePlaybackView();
        }
        return;
      }
      const seek = target.closest<HTMLInputElement>('input[data-playback-seek]');
      if (seek) {
        seekPlayback(seek.value, playbackState.playing);
        if (playbackSeekWasPlaying !== undefined) finishPlaybackSeek();
      }
    });
  }

  return {
    setup,
    render: renderPlayback,
    clear: () => {
      cancelPlaybackAnimation();
      playbackTrace = undefined; playbackAnalysis = undefined; playbackGeometry = undefined; playbackLayout = undefined; playbackOptions = undefined;
      playbackTiming = [];
      playbackFeedbackPending = false;
      preserveStateOnNextRender = undefined;
          setPlaybackSettingsOpen(false);
      elements.playbackSettingsPanel.innerHTML = '';
      elements.playback.innerHTML = '';
    },
    update: updatePlaybackView,
    preserveNextRender: (mode) => { preserveStateOnNextRender = mode; },
    setCalibration: (calibration) => {
      playbackState = setPlaybackCalibration(playbackState, calibration);
      refreshPlaybackTiming();
      updatePlaybackView();
    },
    getGeometry: () => playbackGeometry,
    getLayout: () => playbackLayout,
  };
}
