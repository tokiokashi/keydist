import type { ReactNode } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { FingerAssignment, PhysicalShape } from '#input/shapes/geometry.ts';
import type { ChainInterpretation } from '#interpretation/structure/chain.ts';
import type { ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import { DEFAULT_TRIGGER_ACTIVATION_GROUPINGS } from '#input/semantics/index.ts';
import { ROMAJI_RULES, type UserRomajiRule } from '#input/romaji/rules.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { PresetIdGenerator, PresetLibrary } from '#input/presets/index.ts';
import { FINGER_ASSIGNMENT_REGISTRY, defaultFingerAssignmentId } from '#engine/finger-assignment.ts';
import {
  DEFAULT_SHAPE_ID,
  type SettingsCascadeOverrides,
  type SettingsItemId,
  type SettingsValueMap,
} from '#engine/settings-items.ts';
import {
  CheckboxOptionField,
  OptionField,
  SegmentedOptionField,
  SelectOptionField,
  type OptionBinding,
} from '#ui/primitives/option-fields.tsx';
import {
  ACTION_EXCEPTION_CLASSES,
  actionCountModeOf,
  classGroupingOf,
  globalOverrideOf,
  setGlobalCommand,
  staticDefaultOf,
  withActionCountMode,
  withClassGrouping,
  type ActionCountMode,
  type GlobalEditableId,
} from './condition-edit.ts';
import { ACTION_COUNT_TEXT, conditionDiagnosticText, type ConditionSummaryRow } from './condition-summary.ts';
import './condition-editor.css';

/**
 * 条件のモーダルの中身。全体（グローバル）のレベルの条件を、項目ごとの行で編集する
 * （docs/architecture.md「条件の編集とURL」）。
 *
 * 行に出す値は**全体のレベルの値**（上書きが無ければ既定値）で、この画面で効いている値ではない。
 * 下のレベル（配列・Setup）の上書きが勝っている時は、行の札（出どころ）と理由で分かるようにする。
 * 書き込みは`dispatch`のコマンドだけ（`condition-edit.ts`）。
 */
export interface ConditionEditorContext {
  readonly overrides: SettingsCascadeOverrides;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  /** 既定の物理配列に選べるもの。 */
  readonly shapes: ReadonlyMap<string, PhysicalShape>;
  /** 自作の指の割当（組み込みの2つに足して選べる）。 */
  readonly customFingerAssignments?: ReadonlyMap<string, FingerAssignment>;
  /** 自作のローマ字規則（組み込みに足して選べる）。 */
  readonly customRomajiRules?: readonly UserRomajiRule[];
  /** 全体で変えても画面が変わらない行の理由（`overrideWinsNotices`）。 */
  readonly notices?: ReadonlyMap<SettingsItemId, string>;
  /** このペインが自分で動かす項目（N感度の先読みN）。全体の値として編集させない。 */
  readonly hiddenIds?: readonly SettingsItemId[];
  /** 保存したプリセット。モーダル上部のプリセットの節が読む。 */
  readonly presetLibrary: PresetLibrary<SettingsValueMap>;
  /** プリセットの新しいidの発行（純粋層は乱数を持たないので、`app`が注入する）。 */
  readonly generatePresetId: PresetIdGenerator;
  /**
   * 直前の操作を元に戻す（文脈バーの元に戻すと同じもの）。モーダルは背後を操作できなくするので、
   * プリセットの流し込み・削除の直後に、モーダルの中から戻せるようにするために渡す。
   */
  readonly undo: () => void;
}

export interface ConditionEditorProps {
  readonly editor: ConditionEditorContext;
  /** この画面で効いている条件（出どころ・効くか・診断）。行の札と注記に使う。 */
  readonly rows: readonly ConditionSummaryRow[];
}

const ON_OFF = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
] as const;

export function ConditionEditor({ editor, rows }: ConditionEditorProps) {
  const { overrides, dispatch } = editor;
  const rowOf = (id: SettingsItemId) => rows.find((row) => row.id === id);

  /** 既定と違う値を全体で持っているか。行の左線と札に使う。 */
  const changed = (id: GlobalEditableId) => globalOverrideOf(overrides, id) !== undefined;

  function bind<K extends Exclude<GlobalEditableId, 'fingerAssignmentId'>>(id: K): OptionBinding<SettingsValueMap[K]> {
    const defaultValue = staticDefaultOf(id);
    return {
      value: globalOverrideOf(overrides, id) ?? defaultValue,
      defaultValue,
      onChange: (next) => dispatch(setGlobalCommand(id, next, defaultValue)),
    };
  }

  const boolBinding = (id: 'sfbHomeCost' | 'preferOppositeThumb'): OptionBinding<'on' | 'off'> => {
    const inner = bind(id);
    return {
      value: inner.value ? 'on' : 'off',
      defaultValue: inner.defaultValue ? 'on' : 'off',
      onChange: (next) => inner.onChange(next === 'on'),
    };
  };

  /** 行の外枠。左線（全体で変えた行）・効かない行・下のレベルが勝つ理由をここで共通に持つ。 */
  const row = (id: GlobalEditableId, content: (badge: ReactNode) => ReactNode) => {
    if (editor.hiddenIds?.includes(id)) return null;
    const summary = rowOf(id);
    const notApplicable = summary !== undefined && !summary.applicable;
    const diagnostics = (summary?.diagnostics ?? [])
      .map((diagnostic) => (summary === undefined ? undefined : conditionDiagnosticText(summary, diagnostic)))
      .filter((text): text is string => text !== undefined);
    const notice = editor.notices?.get(id);
    return (
      <div
        key={id}
        className="condition-row"
        data-item={id}
        data-changed={changed(id) || undefined}
        data-not-applicable={notApplicable || undefined}
      >
        {content(<OriginBadge id={id} row={summary} changedHere={changed(id)} />)}
        {notApplicable ? <p className="condition-row-flag">この配列・Setupでは効かない</p> : null}
        {notice === undefined ? null : <p className="condition-row-notice" data-condition-notice="true">{notice}</p>}
        {diagnostics.map((text, index) => <p key={index} className="condition-row-diagnostic">{text}</p>)}
      </div>
    );
  };

  const shapeChoices = [...editor.shapes.values()].map((shape) => ({ value: shape.id, label: shape.name }));
  const shapeBinding = bind('defaultShapeId');
  if (!editor.shapes.has(shapeBinding.value)) {
    // 選ばれているidが手持ちに無い時も、実際の状態をそのまま見せる。
    shapeChoices.unshift({ value: shapeBinding.value, label: '（見つからない物理配列）' });
  }

  const fingerChoices = [
    ...Object.values(FINGER_ASSIGNMENT_REGISTRY),
    ...(editor.customFingerAssignments?.values() ?? []),
  ].map((assignment) => ({ value: assignment.id, label: assignment.name }));
  // 指の割当の既定は物理配列で決まる。ここで見せる既定は、全体の既定の物理配列で決まる値。
  const shapeForDefault = editor.shapes.get(shapeBinding.value) ?? editor.shapes.get(DEFAULT_SHAPE_ID);
  const derivedFingerId = shapeForDefault === undefined ? fingerChoices[0]?.value ?? '' : defaultFingerAssignmentId(shapeForDefault);
  const fingerOverride = globalOverrideOf(overrides, 'fingerAssignmentId');
  const fingerValue = fingerOverride ?? derivedFingerId;
  if (!fingerChoices.some((choice) => choice.value === fingerValue)) {
    fingerChoices.unshift({ value: fingerValue, label: '（見つからない指の割当）' });
  }
  const fingerBinding: OptionBinding<string> = {
    value: fingerValue,
    defaultValue: derivedFingerId,
    onChange: (next) => dispatch(setGlobalCommand('fingerAssignmentId', next, derivedFingerId)),
  };

  const windowBinding = bind('windowSize');
  const holdBinding = bind('triggerRealizationPolicy');
  const actionBinding = bind('actionRealizationPolicy');
  const chainBinding = bind('chainInterpretation');
  const arpeggioBinding = bind('arpeggioInterpretation');

  const actionMode = actionCountModeOf(actionBinding.value);
  const exceptionCount = ACTION_EXCEPTION_CLASSES
    .filter(({ key }) => classGroupingOf(actionBinding.value, key) !== DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[key])
    .length;

  const romajiRow = rowOf('romajiRuleId');
  const romajiBinding = bind('romajiRuleId');
  const romajiChoices = [
    ...Object.entries(ROMAJI_RULES).map(([id, rule]) => ({ value: id, label: rule.name })),
    ...(editor.customRomajiRules ?? []).map((rule) => ({ value: rule.id, label: rule.name })),
  ];
  if (!romajiChoices.some((choice) => choice.value === romajiBinding.value)) {
    romajiChoices.unshift({ value: romajiBinding.value, label: '（見つからないローマ字規則）' });
  }

  return (
    <div className="condition-editor">
      <div className="condition-groups">
        <section className="condition-group" aria-label="距離の測り方">
          <h3 className="condition-group-title">距離の測り方</h3>
          {row('windowSize', (badge) => (
            <OptionField
              label="先読みN"
              binding={windowBinding}
              badge={badge}
              hint="同じ指を残すかホームへ戻すかを決める時に、先の何入力まで見るか"
            >
              {(id) => (
                <div className="condition-stepper" id={id} role="group" aria-labelledby={`${id}-label`}>
                  <button
                    type="button"
                    aria-label="先読みNを1減らす"
                    disabled={windowBinding.value <= 1}
                    onClick={() => windowBinding.onChange(windowBinding.value - 1)}
                  >
                    −
                  </button>
                  <output aria-label="先読みN">{windowBinding.value}</output>
                  <button type="button" aria-label="先読みNを1増やす" onClick={() => windowBinding.onChange(windowBinding.value + 1)}>
                    ＋
                  </button>
                </div>
              )}
            </OptionField>
          ))}
          {row('sfbHomeCost', (badge) => (
            <SegmentedOptionField
              label="同指連続のホーム復帰距離"
              binding={boolBinding('sfbHomeCost')}
              choices={ON_OFF}
              badge={badge}
              hint="同じ指で続けて打つ時、ホームキーへ戻る移動も距離に入れる"
            />
          ))}
          {row('preferOppositeThumb', (badge) => (
            <SegmentedOptionField
              label="親指シフトの振り替え"
              binding={boolBinding('preferOppositeThumb')}
              choices={ON_OFF}
              badge={badge}
              hint="親指シフトを、出力するキーと反対側の親指で押す"
            />
          ))}
        </section>

        <section className="condition-group" aria-label="シフト系キー">
          <h3 className="condition-group-title">シフト系キー</h3>
          {row('triggerRealizationPolicy', (badge) => (
            <SegmentedOptionField
              label="シフト系キーの押し続け"
              binding={{
                value: holdBinding.value.useHold ? 'on' : 'off',
                defaultValue: holdBinding.defaultValue.useHold ? 'on' : 'off',
                onChange: (next) => holdBinding.onChange({ useHold: next === 'on' }),
              }}
              choices={[{ value: 'on', label: 'する' }, { value: 'off', label: 'しない' }]}
              badge={badge}
              hint="押し続けられるシフト系キーを、続けて打つ間は押したままにする"
            />
          ))}
          {row('actionRealizationPolicy', (badge) => (
            <>
              <SegmentedOptionField<ActionCountMode>
                label="動作数の扱い"
                binding={{
                  value: actionMode,
                  defaultValue: 'combined',
                  // 既定へ戻す操作（value === default）は例外ごと消えるよう、写像側で正規化する。
                  onChange: (next) => actionBinding.onChange(withActionCountMode(actionBinding.value, next)),
                }}
                choices={[
                  { value: 'combined', label: ACTION_COUNT_TEXT.combined },
                  { value: 'separate', label: ACTION_COUNT_TEXT.separate },
                ]}
                badge={badge}
              />
              {actionMode === 'separate' ? (
                <details className="condition-fold" data-condition-fold="action-exceptions">
                  <summary>
                    <span>例外</span>
                    <span className="condition-fold-count">{exceptionCount === 0 ? '既定のまま' : `${exceptionCount}件を変更`}</span>
                  </summary>
                  <div className="condition-fold-body">
                    {ACTION_EXCEPTION_CLASSES.map(({ key, label }) => (
                      <div key={key} className="condition-fold-row" data-exception-class={key}>
                        <span id={`condition-exception-${key}`}>{label}</span>
                        <div className="option-segmented" role="group" aria-labelledby={`condition-exception-${key}`}>
                          {(['combined', 'separate'] as const).map((grouping) => (
                            <button
                              key={grouping}
                              type="button"
                              aria-pressed={classGroupingOf(actionBinding.value, key) === grouping}
                              onClick={() => actionBinding.onChange(withClassGrouping(actionBinding.value, key, grouping))}
                            >
                              {grouping === 'combined' ? '1動作' : '2動作'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ))}
        </section>

        {romajiRow === undefined ? null : (
          <section className="condition-group" aria-label="ローマ字">
            <h3 className="condition-group-title">ローマ字</h3>
            {row('romajiRuleId', (badge) => (
              <SelectOptionField
                label="ローマ字規則"
                binding={romajiBinding}
                choices={romajiChoices}
                badge={badge}
                hint="かなをローマ字で打つ時の綴り。かな配列には効かない"
              />
            ))}
          </section>
        )}

        <section className="condition-group" aria-label="物理配列と指の割当">
          <h3 className="condition-group-title">物理配列と指の割当</h3>
          {row('defaultShapeId', (badge) => (
            <SelectOptionField
              label="既定の物理配列"
              binding={shapeBinding}
              choices={shapeChoices}
              badge={badge}
              hint="配列を選んだ時に使う物理配列。Setup は自分の物理配列を使う"
            />
          ))}
          {row('fingerAssignmentId', (badge) => (
            <SelectOptionField
              label="指の割当"
              binding={fingerBinding}
              choices={fingerChoices}
              badge={badge}
              hint="既定は物理配列で決まる（JIS の物理配列なら JIS既定）"
            />
          ))}
        </section>

        <section className="condition-group" aria-label="チェーンの区切り">
          <h3 className="condition-group-title">チェーンの区切り</h3>
          {row('chainInterpretation', () => (
            <>
              {CHAIN_FIELDS.map(({ key, label }) => (
                <CheckboxOptionField
                  key={key}
                  label={label}
                  binding={{
                    value: chainBinding.value[key],
                    defaultValue: chainBinding.defaultValue[key],
                    onChange: (next) => chainBinding.onChange({ ...chainBinding.value, [key]: next }),
                  }}
                />
              ))}
            </>
          ))}
        </section>

        <section className="condition-group" aria-label="アルペジオ">
          <h3 className="condition-group-title">アルペジオ</h3>
          {row('arpeggioInterpretation', () => (
            <>
              {ARPEGGIO_FIELDS.map(({ key, label }) => (
                <CheckboxOptionField
                  key={key}
                  label={label}
                  binding={{
                    value: arpeggioBinding.value[key],
                    defaultValue: arpeggioBinding.defaultValue[key],
                    onChange: (next) => arpeggioBinding.onChange({ ...arpeggioBinding.value, [key]: next }),
                  }}
                />
              ))}
            </>
          ))}
        </section>
      </div>
    </div>
  );
}

const CHAIN_FIELDS: readonly { readonly key: keyof ChainInterpretation; readonly label: string }[] = [
  { key: 'breakOnSameFinger', label: '同じ指の連続（親指を除く）で区切る' },
  { key: 'breakOnTriggerOnly', label: 'シフト系キーだけの打鍵で区切る' },
  { key: 'breakOnThumbOnly', label: '親指だけの打鍵で区切る' },
  { key: 'breakOnOppositeHandSimultaneous', label: '左右の手で同時に出力したら区切る' },
];

const ARPEGGIO_FIELDS: readonly { readonly key: keyof ArpeggioInterpretation; readonly label: string }[] = [
  { key: 'includeThumb', label: '親指の出力を含める' },
  { key: 'bridgeSameFinger', label: '同じ指の連続をつなぎとして扱う' },
  { key: 'includeSingleRedirectTail', label: '直後の逆向きの1回を末尾に含める' },
];

/**
 * 行の出どころの札。この画面で効いている値の出どころ（下のレベルが勝っていればそのレベル）を出し、
 * 全体で変えていなければ「既定値」。値は行の入力が全体の値を示すので、札だけが食い違いを伝える。
 */
function OriginBadge({ id, row, changedHere }: { id: GlobalEditableId; row: ConditionSummaryRow | undefined; changedHere: boolean }) {
  const lower = row !== undefined && row.origin.kind !== 'default' && row.origin.kind !== 'global';
  if (lower) {
    return <span className="condition-origin" data-origin="lower">{row.originLabel.replace(/^上書き: /, '')}で変更</span>;
  }
  if (changedHere) return <span className="condition-origin" data-origin="global">全体で変更</span>;
  return (
    <span className="condition-origin" data-origin="default">
      {id === 'fingerAssignmentId' ? '既定値（物理配列から）' : '既定値'}
    </span>
  );
}
