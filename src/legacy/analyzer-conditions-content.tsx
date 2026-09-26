import {
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ArpeggioPolicy } from '../analysis-arpeggio.ts';
import type { ChainPolicy } from '../analysis-chain.ts';
import type {
  AnalyzerConditionsActions,
  AnalyzerConditionsModel,
} from './analyzer-conditions-model.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import {
  describeConditions,
  describePlaybackConditions,
} from './condition-description.ts';
import { sameConditionDefaults } from './condition-presets.ts';
import type { GeometryKind } from '../geometry.ts';
import type { Layout } from '../layouts/index.ts';
import {
  DEFAULT_CONDITION_DEFAULTS,
  type UiStateConditionsDefaults,
  type UiStateLayoutConditions,
} from './ui-state.ts';
import {
  DEFAULT_TRIGGER_ACTIVATION_GROUPINGS,
  type ActionRealizationPolicy,
  type TriggerActivationClass,
  type TriggerActivationGrouping,
  type TriggerRealizationPolicy,
} from '../core/semantic-input/index.ts';
import {
  sameModifierGroupSelector,
  samePhysicalTriggerSelector,
  triggerActivationGroups,
  triggerActivationLogicalGroups,
  TRIGGER_ACTIVATION_CLASS_LABELS,
} from '../trigger-activation-groups.ts';

export type ConditionTab =
  | 'romaji'
  | 'physical'
  | 'model'
  | 'trigger'
  | 'chain'
  | 'arpeggio'
  | 'delay';

const CONDITION_TABS: readonly [ConditionTab, string][] = [
  ['romaji', 'ローマ字'],
  ['physical', '物理形状'],
  ['model', 'モデル'],
  ['trigger', 'Trigger'],
  ['chain', 'Chain'],
  ['arpeggio', 'Arpeggio'],
  ['delay', '再生'],
];

function NumberField({
  value,
  disabled = false,
  min,
  max,
  step,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  min: number;
  max: number;
  step: number | 'any';
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <input
      type="number"
      value={draft}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        const next = Number(draft);
        if (Number.isFinite(next) && next >= min && next <= max) {
          onCommit(next);
        } else {
          setDraft(String(value));
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
        onChange(value === 'combined' || value === 'separate' ? value : undefined);
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

function StatefulDetails({
  detailsKey,
  openByKey,
  setOpen,
  children,
  summary,
}: {
  detailsKey: string;
  openByKey: Record<string, boolean>;
  setOpen(key: string, open: boolean): void;
  summary: string;
  children: React.ReactNode;
}) {
  const open = openByKey[detailsKey] ?? false;
  return (
    <details
      open={open}
      data-condition-details-key={detailsKey}
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

function ConditionRow({
  tab,
  layout,
  state,
  catalog,
  actions,
  detailsOpen,
  setDetailsOpen,
}: {
  tab: ConditionTab;
  layout: Layout | undefined;
  state: ReturnType<AnalyzerUiStateOwner['getSnapshot']>;
  catalog: ReturnType<AnalyzerConditionsModel['getSnapshot']>;
  actions: AnalyzerConditionsActions;
  detailsOpen: Record<string, boolean>;
  setDetailsOpen(key: string, open: boolean): void;
}) {
  const override = layout ? state.conditions.perLayout[layout.id] : undefined;
  const enabled = layout === undefined
    || Object.prototype.hasOwnProperty.call(state.conditions.perLayout, layout.id);
  const defaults = state.conditions.defaults;
  const value = <K extends keyof UiStateConditionsDefaults>(
    key: K,
  ): UiStateConditionsDefaults[K] => {
    if (key === 'playbackRateWindow') return defaults[key];
    const layoutValue = override?.[key as keyof UiStateLayoutConditions];
    return (layoutValue ?? defaults[key]) as UiStateConditionsDefaults[K];
  };
  const commit = (key: string, next: unknown) =>
    actions.commitCondition(layout?.id, key, next);

  let content: React.ReactNode;

  if (tab === 'romaji') {
    if (layout && !layout.romajiTable) {
      content = 'かな入力の設定は不要';
    } else if (!layout) {
      content = '各かな配列の既定値を使用';
    } else {
      const current = override?.romajiRule
        ?? catalog.romajiRuleIds[layout.id]
        ?? '';
      content = (
        <select
          value={current}
          disabled={!enabled}
          onChange={(event) =>
            actions.commitCondition(layout.id, 'romajiRule', event.currentTarget.value)}
        >
          {catalog.romajiRules.map((rule) => (
            <option key={rule.value} value={rule.value}>{rule.label}</option>
          ))}
        </select>
      );
    }
  } else if (tab === 'physical') {
    content = (
      <select
        value={value('geometry')}
        disabled={!enabled}
        onChange={(event) => commit('geometry', event.currentTarget.value as GeometryKind)}
      >
        {catalog.geometryOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  } else if (tab === 'model') {
    content = (
      <div className="condition-fields">
        <label>
          先読みN{' '}
          <NumberField
            value={value('windowSize')}
            disabled={!enabled}
            min={0}
            max={12}
            step={1}
            onCommit={(next) => commit('windowSize', next)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={value('sfbHomeCost')}
            disabled={!enabled}
            onChange={(event) => commit('sfbHomeCost', event.currentTarget.checked)}
          />{' '}
          SFBホーム
        </label>
        <label>
          <input
            type="checkbox"
            checked={value('preferOppositeThumb')}
            disabled={!enabled}
            onChange={(event) => commit('preferOppositeThumb', event.currentTarget.checked)}
          />{' '}
          逆側親指
        </label>
      </div>
    );
  } else if (tab === 'trigger') {
    const detailsScope = layout?.id ?? 'defaults';
    const realization = value('triggerRealization') as TriggerRealizationPolicy;
    const action = value('actionRealization') as ActionRealizationPolicy;
    const relevantClasses: TriggerActivationClass[] = layout
      ? [...new Set(triggerActivationGroups(layout).map((group) => group.activationClass))]
      : ['prepress-required', 'order-free'];

    content = (
      <div className="condition-fields condition-trigger-fields">
        <label>
          <input
            type="checkbox"
            checked={realization.useHold}
            disabled={!enabled}
            onChange={(event) => commit('triggerRealization', {
              ...realization,
              useHold: event.currentTarget.checked,
            })}
          />{' '}
          hold-capable triggerを連続保持する
        </label>
        <label>
          <input
            type="checkbox"
            checked={action.triggerActivation === 'semantic'}
            disabled={!enabled}
            onChange={(event) => commit('actionRealization', {
              ...action,
              triggerActivation: event.currentTarget.checked ? 'semantic' : 'disabled',
            })}
          />{' '}
          trigger押下の独立action化を有効にする
        </label>

        <div className="condition-trigger-subheading">独立action化する対象</div>
        {relevantClasses
          .filter((activationClass) => activationClass !== 'postpress-required')
          .map((activationClass) => {
            const current = action.triggerActivationClassOverrides?.[activationClass];
            return (
              <label key={activationClass}>
                {TRIGGER_ACTIVATION_CLASS_LABELS[activationClass]}{' '}
                <GroupingSelect
                  current={current}
                  semanticDefault={DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[activationClass]}
                  disabled={!enabled || action.triggerActivation !== 'semantic'}
                  onChange={(grouping) => {
                    const next = { ...(action.triggerActivationClassOverrides ?? {}) };
                    if (grouping === undefined) delete next[activationClass];
                    else next[activationClass] = grouping;
                    commit('actionRealization', {
                      ...action,
                      triggerActivationClassOverrides: next,
                    });
                  }}
                />
              </label>
            );
          })}

        {layout ? (() => {
          const logicalGroups = triggerActivationLogicalGroups(layout)
            .filter((group) => !group.activationClasses.includes('postpress-required'));
          if (logicalGroups.length === 0) return null;
          return (
            <StatefulDetails
              detailsKey={`${detailsScope}:trigger-individual`}
              openByKey={detailsOpen}
              setOpen={setDetailsOpen}
              summary="個別設定"
            >
              <div className="condition-fields condition-trigger-fields">
                {logicalGroups.map((logical) => {
                  const existing = action.triggerActivationOverrides?.find((candidate) =>
                    sameModifierGroupSelector(candidate.selector, logical.modifierGroupIds));
                  const semanticDefaults = logical.activationClasses.map((kind) =>
                    action.triggerActivationClassOverrides?.[kind]
                      ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[kind]);
                  const semanticDefault = semanticDefaults.every((item) => item === 'separate')
                    ? 'separate'
                    : 'combined';
                  return (
                    <label key={logical.label}>
                      {logical.label}{' '}
                      <GroupingSelect
                        current={existing?.grouping}
                        semanticDefault={semanticDefault}
                        disabled={!enabled || action.triggerActivation !== 'semantic'}
                        onChange={(grouping) => {
                          const overrides = (action.triggerActivationOverrides ?? [])
                            .filter((candidate) =>
                              !sameModifierGroupSelector(
                                candidate.selector,
                                logical.modifierGroupIds,
                              ));
                          if (grouping !== undefined) {
                            overrides.push({
                              selector: { modifierGroupIds: logical.modifierGroupIds },
                              grouping,
                            });
                          }
                          actions.commitCondition(layout.id, 'actionRealization', {
                            ...action,
                            triggerActivationOverrides: overrides,
                          });
                        }}
                      />
                    </label>
                  );
                })}

                <StatefulDetails
                  detailsKey={`${detailsScope}:trigger-physical`}
                  openByKey={detailsOpen}
                  setOpen={setDetailsOpen}
                  summary="物理trigger単位の詳細"
                >
                  <div className="condition-fields condition-trigger-fields">
                    {triggerActivationGroups(layout)
                      .filter((group) => group.activationClass !== 'postpress-required')
                      .map((group) => {
                        const existing = action.triggerActivationOverrides?.find((candidate) =>
                          samePhysicalTriggerSelector(candidate.selector, group));
                        const logicalOverride = action.triggerActivationOverrides?.find((candidate) =>
                          sameModifierGroupSelector(candidate.selector, group.modifierGroupIds));
                        const semanticDefault = logicalOverride?.grouping
                          ?? action.triggerActivationClassOverrides?.[group.activationClass]
                          ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[group.activationClass];
                        return (
                          <label key={group.label}>
                            {group.label}{' '}
                            <GroupingSelect
                              current={existing?.grouping}
                              semanticDefault={semanticDefault}
                              disabled={!enabled || action.triggerActivation !== 'semantic'}
                              onChange={(grouping) => {
                                const overrides = (action.triggerActivationOverrides ?? [])
                                  .filter((candidate) =>
                                    !samePhysicalTriggerSelector(candidate.selector, group));
                                if (grouping !== undefined) {
                                  overrides.push({
                                    selector: {
                                      ...(group.modifierGroupIds.length === 0
                                        ? {}
                                        : { modifierGroupIds: group.modifierGroupIds }),
                                      triggerKeys: group.triggerKeys,
                                    },
                                    grouping,
                                  });
                                }
                                actions.commitCondition(layout.id, 'actionRealization', {
                                  ...action,
                                  triggerActivationOverrides: overrides,
                                });
                              }}
                            />
                          </label>
                        );
                      })}
                  </div>
                </StatefulDetails>
              </div>
            </StatefulDetails>
          );
        })() : null}
      </div>
    );
  } else if (tab === 'chain') {
    const policy = value('chain') as ChainPolicy;
    const checkbox = (key: keyof ChainPolicy, label: string) => (
      <label key={key}>
        <input
          type="checkbox"
          checked={policy[key]}
          disabled={!enabled}
          onChange={(event) => commit('chain', {
            ...policy,
            [key]: event.currentTarget.checked,
          })}
        />{' '}
        {label}
      </label>
    );
    content = (
      <div className="condition-fields condition-chain-fields">
        {checkbox('breakOnSameFinger', '非親指SFB Strokeで区切る')}
        {checkbox('breakOnTriggerOnly', 'trigger-only Strokeで区切る')}
        {checkbox('breakOnThumbOnly', '親指only Strokeで区切る')}
        {checkbox('breakOnOppositeHandSimultaneous', '逆手同時outputで区切る')}
      </div>
    );
  } else if (tab === 'arpeggio') {
    const policy = value('arpeggioPolicy') as ArpeggioPolicy;
    const checkbox = (key: keyof ArpeggioPolicy, label: string) => (
      <label key={key}>
        <input
          type="checkbox"
          checked={policy[key]}
          disabled={!enabled}
          onChange={(event) => commit('arpeggioPolicy', {
            ...policy,
            [key]: event.currentTarget.checked,
          })}
        />{' '}
        {label}
      </label>
    );
    content = (
      <div className="condition-fields condition-arpeggio-fields">
        {checkbox('includeThumb', 'output親指をcoreに含める')}
        {checkbox('bridgeSameFinger', 'same Transitionを中立bridgeにする')}
        {checkbox('includeSingleRedirectTail', '末尾直後の逆方向1 Transitionを含める')}
      </div>
    );
  } else {
    content = 'この項目は全体設定です。配列ごとの上書きはできません。';
  }

  return (
    <tr>
      <th scope="row">{layout?.name ?? '既定値（全配列）'}</th>
      <td>
        {layout ? (
          <input
            type="checkbox"
            checked={enabled}
            title={`${layout.name}だけ個別設定する`}
            aria-label={`${layout.name}を個別設定する`}
            onChange={(event) => actions.toggleOverride(layout.id, event.currentTarget.checked)}
          />
        ) : '全体'}
      </td>
      <td>{content}</td>
    </tr>
  );
}

function ConditionsTable({
  tab,
  state,
  catalog,
  actions,
  detailsOpen,
  setDetailsOpen,
}: {
  tab: ConditionTab;
  state: ReturnType<AnalyzerUiStateOwner['getSnapshot']>;
  catalog: ReturnType<AnalyzerConditionsModel['getSnapshot']>;
  actions: AnalyzerConditionsActions;
  detailsOpen: Record<string, boolean>;
  setDetailsOpen(key: string, open: boolean): void;
}) {
  return (
    <div className="scroll-x condition-table-wrap">
      <table className="condition-grid">
        <thead>
          <tr>
            <th>配列</th>
            <th>個別設定</th>
            <th>{tab === 'romaji' ? '設定値' : '条件'}</th>
          </tr>
        </thead>
        <tbody>
          <ConditionRow
            tab={tab}
            layout={undefined}
            state={state}
            catalog={catalog}
            actions={actions}
            detailsOpen={detailsOpen}
            setDetailsOpen={setDetailsOpen}
          />
          {catalog.layouts.map((layout) => (
            <ConditionRow
              key={layout.id}
              tab={tab}
              layout={layout}
              state={state}
              catalog={catalog}
              actions={actions}
              detailsOpen={detailsOpen}
              setDetailsOpen={setDetailsOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DelayControls({
  state,
  catalog,
  actions,
}: {
  state: ReturnType<AnalyzerUiStateOwner['getSnapshot']>;
  catalog: ReturnType<AnalyzerConditionsModel['getSnapshot']>;
  actions: AnalyzerConditionsActions;
}) {
  const playback = state.ui.playback;
  const defaults = state.conditions.defaults;
  return (
    <section className="condition-global">
      <h3>全体の再生設定</h3>
      <div className="condition-delay-fields">
        <label>
          基準速度{' '}
          <NumberField
            value={playback.stepsPerSecond}
            min={0.1}
            max={20}
            step="any"
            onCommit={(value) => actions.setPlaybackUi('stepsPerSecond', value)}
          />{' '}
          ステップ/秒
        </label>
        <label>
          再生倍率{' '}
          <NumberField
            value={playback.speedMultiplier}
            min={0.1}
            max={8}
            step={0.1}
            onCommit={(value) => actions.setPlaybackUi('speedMultiplier', value)}
          />{' '}
          倍
        </label>
        <label>
          速度平均{' '}
          <select
            value={defaults.playbackRateAverage}
            onChange={(event) => actions.setPlaybackCondition(
              'playbackRateAverage',
              event.currentTarget.value,
            )}
          >
            <option value="sma">SMA（単純移動平均）</option>
            <option value="ewma">EWMA（指数移動平均）</option>
          </select>
        </label>
        <label>
          SMA窓幅{' '}
          <NumberField
            value={defaults.playbackRateWindow}
            min={1}
            max={50}
            step={1}
            onCommit={(value) => {
              if (Number.isInteger(value)) {
                actions.setPlaybackCondition('playbackRateWindow', value);
              }
            }}
          />{' '}
          打鍵
        </label>
        <label>
          EWMA半減期{' '}
          <NumberField
            value={defaults.playbackRateHalfLifeSeconds}
            min={0.1}
            max={10}
            step={0.1}
            onCommit={(value) =>
              actions.setPlaybackCondition('playbackRateHalfLifeSeconds', value)}
          />{' '}
          秒
        </label>
        <label>
          <input
            type="checkbox"
            checked={playback.sameFingerDelay}
            onChange={(event) =>
              actions.setPlaybackUi('sameFingerDelay', event.currentTarget.checked)}
          />{' '}
          指の移動速度を考慮
        </label>
        <label>
          <input
            type="checkbox"
            checked={playback.allFingerMovementDelay}
            onChange={(event) =>
              actions.setPlaybackUi('allFingerMovementDelay', event.currentTarget.checked)}
          />{' '}
          全指の移動時間で律速
        </label>
        <label>
          <input
            type="checkbox"
            checked={playback.useCalibration}
            disabled={!catalog.calibrationAvailable}
            onChange={(event) =>
              actions.setPlaybackUi('useCalibration', event.currentTarget.checked)}
          />{' '}
          個人速度を使う
        </label>
      </div>
      <p className="note">再生速度と個人速度は構造解析条件とは分離して扱います。</p>
    </section>
  );
}

function ConditionSummary({
  state,
  catalog,
}: {
  state: ReturnType<AnalyzerUiStateOwner['getSnapshot']>;
  catalog: ReturnType<AnalyzerConditionsModel['getSnapshot']>;
}) {
  const layoutNames = Object.fromEntries(
    catalog.allLayouts.map((layout) => [layout.id, layout.name]),
  );
  const description = describeConditions({
    defaults: DEFAULT_CONDITION_DEFAULTS,
    current: state.conditions.defaults,
    perLayout: state.conditions.perLayout,
    layoutNames,
  });
  const playbackDescription = describePlaybackConditions({
    defaults: catalog.playbackDefaults,
    current: state.ui.playback,
  });
  const list = (
    heading: string,
    conditions: readonly {
      label: string;
      value: string;
      defaultValue: string;
      differsFromDefault: boolean;
      effect: string;
    }[],
  ) => (
    <>
      <h3>{heading}</h3>
      <dl className="condition-list">
        {conditions.map((condition) => (
          <div key={condition.label}>
            <dt>{condition.label}</dt>
            <dd>
              <strong>現在: {condition.value}</strong>{' '}
              <span className={
                condition.differsFromDefault ? 'condition-changed' : 'condition-default'
              }>
                {condition.differsFromDefault
                  ? `（既定: ${condition.defaultValue}）`
                  : '（既定どおり）'}
              </span>
              <p>{condition.effect}</p>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );

  return (
    <details className="condition-summary">
      <summary>現在値と既定値の差分を見る</summary>
      {list('解析・集計条件', description.conditions)}
      {list('打鍵再生条件', playbackDescription)}
      <p className="note">
        {description.overrides.length === 0
          ? '配列ごとの上書きはありません。'
          : `配列ごとの上書き: ${description.overrides.map((item) => item.layoutName).join('、')}`}
      </p>
    </details>
  );
}

export function AnalyzerConditionsContent({
  dialog,
  stateOwner,
  model,
  actions,
}: {
  dialog: HTMLDialogElement;
  stateOwner: AnalyzerUiStateOwner;
  model: AnalyzerConditionsModel;
  actions: AnalyzerConditionsActions;
}) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const catalog = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const [tab, setTab] = useState<ConditionTab>('model');
  const [detailsOpen, setDetailsOpenState] = useState<Record<string, boolean>>({});
  const [importStatus, setImportStatus] = useState('');

  const currentPresetId = catalog.presets.find((preset) =>
    sameConditionDefaults(preset.conditions, state.conditions.defaults))?.id ?? '';

  const setDetailsOpen = (key: string, open: boolean) => {
    setDetailsOpenState((current) => (
      current[key] === open ? current : { ...current, [key]: open }
    ));
  };

  return (
    <div data-react-feature="conditions">
      <div className="condition-toolbar">
        <label>
          プリセット{' '}
          <select
            value={currentPresetId}
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (id) actions.applyPreset(id);
            }}
          >
            <option value="">選ばない</option>
            {catalog.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const name = window.prompt('プリセット名');
            if (name?.trim()) actions.savePreset(name.trim());
          }}
        >
          現在値を保存
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            if (currentPresetId.startsWith('custom-')) actions.deletePreset(currentPresetId);
          }}
        >
          保存したプリセットを削除
        </button>
        <button type="button" className="secondary" onClick={() => actions.exportBundle()}>
          条件と配列を書き出す
        </button>
        <label className="secondary file-button">
          条件と配列を読み込む
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              setImportStatus(await actions.importBundle(file));
              event.currentTarget.value = '';
            }}
          />
        </label>
        <span className="note condition-import-status">{importStatus}</span>
      </div>

      <p className="note">
        行は配列、列は条件です。個別設定をオフにすると既定値を使い、選択した項目だけ既定値から差し替えます。プリセットは全体の既定値だけを置き換え、配列ごとの個別設定は保持します。
      </p>

      <div className="condition-tabs" role="tablist">
        {CONDITION_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="ghost"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              dialog.scrollTop = 0;
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'delay' ? (
        <DelayControls state={state} catalog={catalog} actions={actions} />
      ) : (
        <ConditionsTable
          tab={tab}
          state={state}
          catalog={catalog}
          actions={actions}
          detailsOpen={detailsOpen}
          setDetailsOpen={setDetailsOpen}
        />
      )}

      <ConditionSummary state={state} catalog={catalog} />
    </div>
  );
}
