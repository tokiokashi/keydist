import {
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN,
  PLAYBACK_RATE_WINDOW_MAX,
  PLAYBACK_RATE_WINDOW_MIN,
  PLAYBACK_SPEED_MULTIPLIER_MAX,
  PLAYBACK_SPEED_MULTIPLIER_MIN,
  PLAYBACK_STEPS_PER_SECOND_MAX,
  PLAYBACK_STEPS_PER_SECOND_MIN,
} from '../playback.ts';
import {
  DEFAULT_TRIGGER_ACTIVATION_GROUPINGS,
  type TriggerActivationGrouping,
} from '../core/semantic-input/index.ts';
import {
  sameModifierGroupSelector,
  samePhysicalTriggerSelector,
  triggerActivationGroups,
  triggerActivationLogicalGroups,
  TRIGGER_ACTIVATION_CLASS_LABELS,
} from '../trigger-activation-groups.ts';
import type {
  AnalyzerPlaybackSettingsActions,
  AnalyzerPlaybackSettingsModel,
  PlaybackSettingsTab,
} from './analyzer-playback-settings-model.ts';

const PLAYBACK_SCALE_MIN = 0.5;
const PLAYBACK_SCALE_MAX = 4;

function NumberSetting({
  value,
  min,
  max,
  step,
  ariaLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number | 'any';
  ariaLabel: string;
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  const current = String(value);

  useEffect(() => {
    setDraft(current);
  }, [current]);

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        const next = Number(draft);
        if (Number.isFinite(next) && next >= min && next <= max) {
          onCommit(next);
        } else {
          setDraft(current);
        }
      }}
    />
  );
}

function GroupingSelect({
  current,
  semanticDefault,
  disabled,
  onChange,
}: {
  current: TriggerActivationGrouping | undefined;
  semanticDefault: TriggerActivationGrouping;
  disabled: boolean;
  onChange(value: TriggerActivationGrouping | undefined): void;
}) {
  return (
    <select
      disabled={disabled}
      value={current ?? 'inherit'}
      onChange={(event) => {
        const value = event.currentTarget.value;
        onChange(
          value === 'combined' || value === 'separate'
            ? value
            : undefined,
        );
      }}
    >
      <option value="inherit">
        既定（{semanticDefault === 'separate' ? '独立action' : 'outputと同じaction'}）
      </option>
      <option value="combined">outputと同じaction</option>
      <option value="separate">独立action</option>
    </select>
  );
}

function PlaybackDetails({
  detailsKey,
  openByKey,
  setOpen,
  className,
  summary,
  children,
}: {
  detailsKey: string;
  openByKey: Record<string, boolean>;
  setOpen(key: string, open: boolean): void;
  className: string;
  summary: string;
  children: React.ReactNode;
}) {
  const open = openByKey[detailsKey] ?? false;
  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next !== open) setOpen(detailsKey, next);
      }}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

function TriggerSettings({
  data,
  actions,
  detailsOpen,
  setDetailsOpen,
}: {
  data: NonNullable<ReturnType<AnalyzerPlaybackSettingsModel['getSnapshot']>['data']>;
  actions: AnalyzerPlaybackSettingsActions;
  detailsOpen: Record<string, boolean>;
  setDetailsOpen(key: string, open: boolean): void;
}) {
  const layout = data.layout;
  const realization = data.triggerRealization;
  const action = data.actionRealization;
  const groups = triggerActivationGroups(layout);
  const relevantClasses = [...new Set(groups.map((group) => group.activationClass))]
    .filter((kind) => kind !== 'postpress-required');
  const logicalGroups = triggerActivationLogicalGroups(layout)
    .filter((group) => !group.activationClasses.includes('postpress-required'));
  const enabled = action.triggerActivation === 'semantic';

  return (
    <PlaybackDetails
      detailsKey="trigger-realization"
      openByKey={detailsOpen}
      setOpen={setDetailsOpen}
      className="playback-settings-group playback-trigger-settings"
      summary="Trigger realization"
    >
      <div className="playback-settings-group-body">
        <label className="playback-finger-toggle playback-setting-row">
          <input
            type="checkbox"
            data-playback-trigger-hold
            checked={realization.useHold}
            onChange={(event) => actions.setTriggerRealization({
              ...realization,
              useHold: event.currentTarget.checked,
            })}
          />
          hold-capable triggerを連続保持する
        </label>

        <div className="playback-trigger-action-group">
          <label className="playback-finger-toggle playback-setting-row playback-trigger-action-toggle">
            <input
              type="checkbox"
              data-playback-trigger-actions
              checked={enabled}
              onChange={(event) => actions.setActionRealization({
                ...action,
                triggerActivation: event.currentTarget.checked ? 'semantic' : 'disabled',
              })}
            />
            trigger押下の独立action化を有効にする
          </label>

          <div className="condition-trigger-subheading">独立action化する対象</div>
          <div className="playback-dialog-grid playback-trigger-option-list">
            {relevantClasses.map((kind) => (
              <label className="playback-range-setting" key={kind}>
                <span>{TRIGGER_ACTIVATION_CLASS_LABELS[kind]}</span>
                <GroupingSelect
                  current={action.triggerActivationClassOverrides?.[kind]}
                  semanticDefault={DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[kind]}
                  disabled={!enabled}
                  onChange={(grouping) => {
                    const overrides = {
                      ...(action.triggerActivationClassOverrides ?? {}),
                    };
                    if (grouping === undefined) delete overrides[kind];
                    else overrides[kind] = grouping;
                    actions.setActionRealization({
                      ...action,
                      triggerActivationClassOverrides: overrides,
                    });
                  }}
                />
              </label>
            ))}
          </div>

          {logicalGroups.length > 0 || groups.length > 0 ? (
            <PlaybackDetails
              detailsKey="trigger-individual"
              openByKey={detailsOpen}
              setOpen={setDetailsOpen}
              className="playback-settings-tree playback-settings-tree-level-2"
              summary="個別設定"
            >
              <div className="playback-dialog-grid playback-trigger-option-list">
                {logicalGroups.map((logical) => {
                  const existing = action.triggerActivationOverrides?.find((override) =>
                    sameModifierGroupSelector(
                      override.selector,
                      logical.modifierGroupIds,
                    ));
                  const defaults = logical.activationClasses.map((kind) =>
                    action.triggerActivationClassOverrides?.[kind]
                    ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[kind]);
                  const semanticDefault = defaults.every((value) => value === 'separate')
                    ? 'separate'
                    : 'combined';
                  return (
                    <label className="playback-range-setting" key={logical.label}>
                      <span>{logical.label}</span>
                      <GroupingSelect
                        current={existing?.grouping}
                        semanticDefault={semanticDefault}
                        disabled={!enabled}
                        onChange={(grouping) => {
                          const overrides = (action.triggerActivationOverrides ?? [])
                            .filter((override) =>
                              !sameModifierGroupSelector(
                                override.selector,
                                logical.modifierGroupIds,
                              ));
                          if (grouping !== undefined) {
                            overrides.push({
                              selector: {
                                modifierGroupIds: logical.modifierGroupIds,
                              },
                              grouping,
                            });
                          }
                          actions.setActionRealization({
                            ...action,
                            triggerActivationOverrides: overrides,
                          });
                        }}
                      />
                    </label>
                  );
                })}
              </div>

              {groups.length > 0 ? (
                <PlaybackDetails
                  detailsKey="trigger-physical"
                  openByKey={detailsOpen}
                  setOpen={setDetailsOpen}
                  className="playback-settings-tree playback-settings-tree-level-3"
                  summary="物理trigger単位の詳細"
                >
                  <div className="playback-dialog-grid playback-trigger-option-list">
                    {groups
                      .filter((group) => group.activationClass !== 'postpress-required')
                      .map((group) => {
                        const existing = action.triggerActivationOverrides?.find((override) =>
                          samePhysicalTriggerSelector(override.selector, group));
                        const logicalOverride = action.triggerActivationOverrides?.find((override) =>
                          sameModifierGroupSelector(
                            override.selector,
                            group.modifierGroupIds,
                          ));
                        const semanticDefault = logicalOverride?.grouping
                          ?? action.triggerActivationClassOverrides?.[group.activationClass]
                          ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[group.activationClass];
                        return (
                          <label className="playback-range-setting" key={group.label}>
                            <span>{group.label}</span>
                            <GroupingSelect
                              current={existing?.grouping}
                              semanticDefault={semanticDefault}
                              disabled={!enabled}
                              onChange={(grouping) => {
                                const overrides = (action.triggerActivationOverrides ?? [])
                                  .filter((override) =>
                                    !samePhysicalTriggerSelector(
                                      override.selector,
                                      group,
                                    ));
                                if (grouping !== undefined) {
                                  overrides.push({
                                    selector: {
                                      ...(group.modifierGroupIds.length === 0
                                        ? {}
                                        : {
                                            modifierGroupIds:
                                              group.modifierGroupIds,
                                          }),
                                      triggerKeys: group.triggerKeys,
                                    },
                                    grouping,
                                  });
                                }
                                actions.setActionRealization({
                                  ...action,
                                  triggerActivationOverrides: overrides,
                                });
                              }}
                            />
                          </label>
                        );
                      })}
                  </div>
                </PlaybackDetails>
              ) : null}
            </PlaybackDetails>
          ) : null}
        </div>
      </div>
    </PlaybackDetails>
  );
}

export function AnalyzerPlaybackSettings({
  model,
  actions,
}: {
  model: AnalyzerPlaybackSettingsModel;
  actions: AnalyzerPlaybackSettingsActions;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const [tab, setTab] = useState<PlaybackSettingsTab>('display');
  const [detailsOpen, setDetailsOpenState] = useState<Record<string, boolean>>({
    'chain-policy': true,
    'arpeggio-policy': true,
  });
  const data = snapshot.data;
  if (!data) return null;

  const playback = data.playback;
  const setDetailsOpen = (key: string, open: boolean) =>
    setDetailsOpenState((current) => (
      current[key] === open ? current : { ...current, [key]: open }
    ));

  return (
    <div
      className="playback-settings-content"
      data-react-feature="playback-settings"
    >
      <div className="dialog-head">
        <h2>打鍵再生の設定</h2>
        <button
          type="button"
          className="ghost close"
          data-playback-settings-close
          onClick={() => actions.close()}
        >
          閉じる
        </button>
      </div>

      <div className="playback-settings-scope">
        <span>
          適用先:{' '}
          <strong data-playback-settings-scope>
            {data.layoutOverride ? `${data.layout.name}専用` : '共通設定'}
          </strong>
        </span>
        <button
          type="button"
          className="ghost"
          data-playback-layout-override={data.layoutOverride ? 'disable' : 'enable'}
          onClick={() => actions.setLayoutOverride(!data.layoutOverride)}
        >
          {data.layoutOverride ? '共通設定に戻す' : 'この配列専用にする'}
        </button>
        <small>配列固有にすると、この配列を表示したときだけ設定を使います。</small>
      </div>

      <div
        className="playback-settings-tabs"
        role="tablist"
        aria-label="打鍵再生設定の分類"
      >
        {([
          ['display', '表示設定'],
          ['graph', 'グラフ設定'],
          ['conditions', 'シミュレーション条件'],
        ] as const).map(([id, label]) => (
          <button
            type="button"
            className="playback-settings-tab"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`playback-settings-${id}`}
            data-playback-settings-tab={id}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        id="playback-settings-display"
        className="playback-settings-panel"
        role="tabpanel"
        data-playback-settings-panel="display"
        hidden={tab !== 'display'}
      >
        <p className="note">
          キーボード画面に重ねる情報を設定します。変更はすぐに反映されます。
        </p>
        <div className="playback-dialog-grid">
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-fingers
              checked={playback.showFingers}
              onChange={(event) =>
                actions.setPlayback('showFingers', event.currentTarget.checked)}
            />
            指の位置を色で表示
          </label>
          <label className="playback-range-setting">
            <span>押下フィードバック</span>
            <select
              data-playback-key-feedback
              aria-label="キー押下のフィードバック"
              value={playback.keyFeedbackStyle}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (
                  value === 'off'
                  || value === 'fade'
                  || value === 'pulse'
                  || value === 'bounce'
                ) actions.setPlayback('keyFeedbackStyle', value);
              }}
            >
              <option value="off">オフ</option>
              <option value="fade">フェード</option>
              <option value="pulse">パルス</option>
              <option value="bounce">バウンス</option>
            </select>
          </label>
          <label
            className="playback-range-setting"
            title="次の実Pressへ向け、指位置表示を打鍵時刻より先に到着させる時間。0なら従来どおり"
          >
            <span>準備時間</span>{' '}
            <NumberSetting
              value={playback.fingerPreparationSeconds}
              min={0}
              max={60}
              step={0.05}
              ariaLabel="指位置表示の準備時間（秒）"
              onCommit={(value) =>
                actions.setPlayback('fingerPreparationSeconds', value)}
            />{' '}
            秒
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-romaji-plan
              checked={playback.showRomajiPlan}
              disabled={data.layout.romajiTable === undefined}
              onChange={(event) =>
                actions.setPlayback('showRomajiPlan', event.currentTarget.checked)}
            />
            予定ローマ字の盤面表示
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-plan-keys
              checked={playback.showPlanKeys}
              onChange={(event) =>
                actions.setPlayback('showPlanKeys', event.currentTarget.checked)}
            />
            押下予定キーを表示
          </label>
          <div className="playback-window-setting" title="選択中の配列に適用される先読みN">
            N <output data-playback-window>{data.options.windowSize}</output> 入力先
          </div>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-trail
              checked={playback.showTrail}
              onChange={(event) =>
                actions.setPlayback('showTrail', event.currentTarget.checked)}
            />
            押下履歴を残す
          </label>
          <label className="playback-range-setting" title="押下履歴を残すステップ数">
            τ{' '}
            <NumberSetting
              value={playback.trailTau}
              min={1}
              max={20}
              step={1}
              ariaLabel="押下履歴のステップ数"
              onCommit={(value) =>
                actions.setPlayback('trailTau', Math.round(value))}
            />{' '}
            ステップ
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-order-labels
              checked={playback.showOrderLabels}
              onChange={(event) =>
                actions.setPlayback('showOrderLabels', event.currentTarget.checked)}
            />
            順番ラベルを表示
          </label>
          <label
            className="playback-scale-setting"
            title="0.5〜4倍。上下キーは1倍刻みで、数値を直接入力できます"
          >
            配列図{' '}
            <NumberSetting
              value={playback.scale}
              min={PLAYBACK_SCALE_MIN}
              max={PLAYBACK_SCALE_MAX}
              step={1}
              ariaLabel="配列図の表示倍率"
              onCommit={(value) => actions.setPlayback('scale', value)}
            />{' '}
            倍
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-chain
              checked={playback.showChain}
              onChange={(event) =>
                actions.setPlayback('showChain', event.currentTarget.checked)}
            />
            Analysis Chainの動的表示
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-arpeggio
              checked={playback.showArpeggio}
              onChange={(event) =>
                actions.setPlayback('showArpeggio', event.currentTarget.checked)}
            />
            ArpeggioSpanの動的表示
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-same-finger-motion
              checked={playback.showSameFingerMotion}
              onChange={(event) =>
                actions.setPlayback(
                  'showSameFingerMotion',
                  event.currentTarget.checked,
                )}
            />
            同指移動の動的表示
          </label>
        </div>
      </section>

      <section
        id="playback-settings-graph"
        className="playback-settings-panel"
        role="tabpanel"
        data-playback-settings-panel="graph"
        hidden={tab !== 'graph'}
      >
        <p className="note">
          かな/秒・アクション/秒の平均と、グラフ上に重ねる構造区間を設定します。平均条件は全配列共通です。
        </p>
        <div className="playback-dialog-grid">
          <label className="playback-range-setting">
            <span>平均方式</span>
            <select
              data-playback-rate-average
              aria-label="速度グラフの平均方式"
              value={data.rate.playbackRateAverage}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === 'sma' || value === 'ewma') {
                  actions.setRateAverage(value);
                }
              }}
            >
              <option value="sma">SMA（単純移動平均）</option>
              <option value="ewma">EWMA（指数移動平均）</option>
            </select>
          </label>
          <label className="playback-range-setting">
            <span>SMA窓幅</span>{' '}
            <NumberSetting
              value={data.rate.playbackRateWindow}
              min={PLAYBACK_RATE_WINDOW_MIN}
              max={PLAYBACK_RATE_WINDOW_MAX}
              step={1}
              ariaLabel="SMAの窓幅"
              onCommit={(value) => actions.setRateWindow(Math.round(value))}
            />{' '}
            打鍵
          </label>
          <label className="playback-range-setting">
            <span>EWMA半減期</span>{' '}
            <NumberSetting
              value={data.rate.playbackRateHalfLifeSeconds}
              min={PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN}
              max={PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX}
              step={0.1}
              ariaLabel="EWMAの半減期（秒）"
              onCommit={(value) => actions.setRateHalfLife(value)}
            />{' '}
            秒
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-chart-chain
              checked={playback.showChainOnRateChart}
              onChange={(event) =>
                actions.setPlayback(
                  'showChainOnRateChart',
                  event.currentTarget.checked,
                )}
            />
            Chain区間をグラフに表示
          </label>
          <label className="playback-finger-toggle">
            <input
              type="checkbox"
              data-playback-chart-arpeggio
              checked={playback.showArpeggioOnRateChart}
              onChange={(event) =>
                actions.setPlayback(
                  'showArpeggioOnRateChart',
                  event.currentTarget.checked,
                )}
            />
            Arpeggio区間をグラフに表示
          </label>
        </div>
      </section>

      <section
        id="playback-settings-conditions"
        className="playback-settings-panel"
        role="tabpanel"
        data-playback-settings-panel="conditions"
        hidden={tab !== 'conditions'}
      >
        <p className="note">
          再生時間はTransition Calibration、構造表示はAnalysis Chain / ArpeggioPolicyを使用します。
        </p>
        <div className="playback-dialog-grid">
          <label className="playback-speed">
            <span>標準速度</span>
            <NumberSetting
              value={playback.stepsPerSecond}
              min={PLAYBACK_STEPS_PER_SECOND_MIN}
              max={PLAYBACK_STEPS_PER_SECOND_MAX}
              step="any"
              ariaLabel="再生の標準速度（ステップ毎秒）"
              onCommit={(value) =>
                actions.setPlayback('stepsPerSecond', value)}
            />
            <span>ステップ/秒</span>
          </label>
          <label
            className="playback-finger-toggle"
            title="同じ指の連続打鍵に指の移動速度を反映。個人速度が無ければ距離に比例した簡易換算で代用"
          >
            <input
              type="checkbox"
              data-playback-sfb-delay
              checked={playback.sameFingerDelay}
              onChange={(event) =>
                actions.setPlayback('sameFingerDelay', event.currentTarget.checked)}
            />
            指の移動速度を考慮
          </label>
          <label
            className="playback-finger-toggle"
            title="全指について次のPressまでの物理移動時間を確認し、base Timingに間に合わないStrokeだけ必要量を延長"
          >
            <input
              type="checkbox"
              data-playback-all-finger-delay
              checked={playback.allFingerMovementDelay}
              onChange={(event) =>
                actions.setPlayback(
                  'allFingerMovementDelay',
                  event.currentTarget.checked,
                )}
            />
            全指の移動時間で律速
          </label>
          <label
            className="playback-finger-toggle"
            title="キャリブレーションした通常速度・Transition方向別速度・指移動速度を再生へ反映"
          >
            <input
              type="checkbox"
              data-playback-calibration
              checked={playback.useCalibration}
              disabled={!data.calibrationAvailable}
              onChange={(event) =>
                actions.setPlayback('useCalibration', event.currentTarget.checked)}
            />
            個人速度を適用
          </label>
          <button
            type="button"
            className="ghost"
            data-playback-action="calibration-edit"
            onClick={() => actions.openCalibration()}
          >
            {data.calibrationAvailable ? '保存値を確認・編集' : '個人速度を測定'}
          </button>
        </div>

        <TriggerSettings
          data={data}
          actions={actions}
          detailsOpen={detailsOpen}
          setDetailsOpen={setDetailsOpen}
        />

        <PlaybackDetails
          detailsKey="chain-policy"
          openByKey={detailsOpen}
          setOpen={setDetailsOpen}
          className="playback-settings-group"
          summary="Analysis Chain境界"
        >
          {(Object.keys(data.chainPolicy) as Array<keyof typeof data.chainPolicy>)
            .map((key) => {
              const labels = {
                breakOnSameFinger: '非親指SFB Strokeで区切る',
                breakOnTriggerOnly: 'trigger-only Strokeで区切る',
                breakOnThumbOnly: '親指only Strokeで区切る',
                breakOnOppositeHandSimultaneous: '逆手同時outputで区切る',
              };
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    data-playback-chain-policy={key}
                    checked={data.chainPolicy[key]}
                    onChange={(event) => actions.setChainPolicy({
                      ...data.chainPolicy,
                      [key]: event.currentTarget.checked,
                    })}
                  />
                  {labels[key]}
                </label>
              );
            })}
        </PlaybackDetails>

        <PlaybackDetails
          detailsKey="arpeggio-policy"
          openByKey={detailsOpen}
          setOpen={setDetailsOpen}
          className="playback-settings-group"
          summary="ArpeggioPolicy"
        >
          <label>
            <input
              type="checkbox"
              data-playback-arpeggio-policy="includeThumb"
              checked={data.arpeggioPolicy.includeThumb}
              onChange={(event) => actions.setArpeggioPolicy({
                ...data.arpeggioPolicy,
                includeThumb: event.currentTarget.checked,
              })}
            />
            output親指をcoreに含める
          </label>
          <label>
            <input
              type="checkbox"
              data-playback-arpeggio-policy="bridgeSameFinger"
              checked={data.arpeggioPolicy.bridgeSameFinger}
              onChange={(event) => actions.setArpeggioPolicy({
                ...data.arpeggioPolicy,
                bridgeSameFinger: event.currentTarget.checked,
              })}
            />
            same Transitionを中立bridgeとしてSpanを拡張
          </label>
          <label>
            <input
              type="checkbox"
              data-playback-arpeggio-policy="includeSingleRedirectTail"
              checked={data.arpeggioPolicy.includeSingleRedirectTail}
              onChange={(event) => actions.setArpeggioPolicy({
                ...data.arpeggioPolicy,
                includeSingleRedirectTail: event.currentTarget.checked,
              })}
            />
            末尾直後の逆方向1 Transitionを含める
          </label>
        </PlaybackDetails>

        <label className="playback-speed playback-speed-final">
          <span>再生倍率</span>
          <NumberSetting
            value={playback.speedMultiplier}
            min={PLAYBACK_SPEED_MULTIPLIER_MIN}
            max={PLAYBACK_SPEED_MULTIPLIER_MAX}
            step={0.1}
            ariaLabel="再生速度の倍率"
            onCommit={(value) =>
              actions.setPlayback('speedMultiplier', value)}
          />
          <span>倍</span>
        </label>
      </section>
    </div>
  );
}
