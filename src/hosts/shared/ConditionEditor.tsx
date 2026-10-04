import { useState, type ReactNode } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { FingerAssignment, PhysicalShape } from '#input/shapes/geometry.ts';
import { groupShapes } from '#input/shapes/shape-groups.ts';
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
  type OptionChoice,
} from '#ui/primitives/option-fields.tsx';
import {
  ACTION_EXCEPTION_CLASSES,
  actionCountModeOf,
  canEditAtLayout,
  classGroupingOf,
  canEditAtWorkspace,
  globalOverrideOf,
  layoutOverrideOf,
  promoteToGlobalCommand,
  promoteWorkspaceToGlobalCommand,
  setGlobalCommand,
  setLayoutCommand,
  setWorkspaceCommand,
  staticDefaultOf,
  workspaceOverrideOf,
  withActionCountMode,
  withClassGrouping,
  type ActionCountMode,
  type GlobalEditableId,
} from './condition-edit.ts';
import { ACTION_COUNT_TEXT, conditionDiagnosticText, type ConditionSummaryRow } from './condition-summary.ts';
import { PaneMenu, type PaneMenuItem } from './PaneHeaderParts.tsx';
import './condition-editor.css';

/**
 * 条件のモーダルの中身。条件を、項目ごとの行で編集する。開いた時の編集先は、単体ページでは全体（グローバル）、
 * Workspaceのペインではそのレベル（Workspaceの中で変えた値は、そのWorkspaceだけに入る）。
 * 行ごとに、全体・Workspace（Workspaceのペインだけ）・「この配列だけ別に」（対象が配列、Setupなら、その配列の時）へ
 * 編集先を切り替えられる（docs/architecture.md「条件の編集とURL」）。
 *
 * 行に出す値は、編集しているレベルの値（上書きが無ければ継承する値。全体なら既定値）で、この画面で効いている値とは限らない。
 * 強いレベル（配列・Setupなど）の上書きが勝っている時は、行の札（出どころ）と理由で分かるようにする。
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
  /**
   * 配列のレベルへ書く先。対象が配列、またはSetupの時に渡す（Setupなら、その配列）。
   * 複数の対象を持つペインは渡さない（行が全体とWorkspaceのレベルだけになる）。
   */
  readonly layout?: { readonly id: string; readonly name: string };
  /**
   * Workspaceのレベルへ書く先。Workspaceのペインだけが渡す（渡すと、行はWorkspaceのレベルで開く）。
   * 単体ページは渡さない（Workspaceのレベルを持たず、全体のレベルで開く）。
   */
  readonly workspace?: { readonly id: string };
  /** 全体で変えても画面が変わらない行の理由（`overrideWinsNotices`）。 */
  readonly notices?: ReadonlyMap<SettingsItemId, string>;
  /** Workspaceのレベルを変えても画面が変わらない行の理由（`overrideWinsNotices`の`'Workspace'`）。 */
  readonly workspaceNotices?: ReadonlyMap<SettingsItemId, string>;
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

/** 行の編集先。 */
type EditScope = 'workspace' | 'global' | 'layout';

/** 編集先の名前。ボタンには出さず、開いたメニューの見出しと読み上げ名に使う。 */
const SCOPE_TEXT: Readonly<Record<EditScope, string>> = {
  workspace: 'Workspace',
  global: '全体',
  layout: 'この配列',
};

const ON_OFF = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
] as const;

export function ConditionEditor({ editor, rows }: ConditionEditorProps) {
  const { overrides, dispatch, layout, workspace } = editor;
  const rowOf = (id: SettingsItemId) => rows.find((row) => row.id === id);

  // 行ごとに、いま編集しているレベル。選ばなければ開いた時の既定（Workspaceのペインは Workspace、単体ページは全体）。
  // 強いレベルの値が勝っている行も、開いた時は既定のレベルの値と、勝つ理由を見せる。
  const [chosenScope, setChosenScope] = useState<ReadonlyMap<SettingsItemId, EditScope>>(new Map());
  const layoutEditable = (id: SettingsItemId) => layout !== undefined && canEditAtLayout(id) && !editor.hiddenIds?.includes(id);
  const defaultScopeOf = (id: SettingsItemId): EditScope => (workspace !== undefined && canEditAtWorkspace(id) ? 'workspace' : 'global');
  const scopeOf = (id: SettingsItemId): EditScope => {
    const chosen = chosenScope.get(id) ?? defaultScopeOf(id);
    if (chosen === 'layout') return layoutEditable(id) ? 'layout' : defaultScopeOf(id);
    if (chosen === 'workspace') return workspace !== undefined && canEditAtWorkspace(id) ? 'workspace' : 'global';
    return 'global';
  };
  const chooseScope = (id: SettingsItemId, scope: EditScope) => setChosenScope((current) => new Map(current).set(id, scope));

  /** 既定と違う値を、いま編集しているレベルで持っているか。行の左線に使う。 */
  const changed = (id: GlobalEditableId) => {
    const scope = scopeOf(id);
    if (layout !== undefined && scope === 'layout') return layoutOverrideOf(overrides, layout.id, id) !== undefined;
    if (scope === 'workspace') return workspaceOverrideOf(overrides, id) !== undefined;
    return globalOverrideOf(overrides, id) !== undefined;
  };

  /**
   * 行の入力と結ぶ。編集しているレベルが配列なら、値は配列の上書き（無ければ継承する値）で、
   * 継承する値と同じ値へ戻せば配列の上書きが消える。全体なら全体の上書き（無ければ既定値）。
   */
  function scoped<K extends GlobalEditableId>(id: K, globalValue: SettingsValueMap[K], globalDefault: SettingsValueMap[K]): OptionBinding<SettingsValueMap[K]> {
    const scope = scopeOf(id);
    if (layout !== undefined && scope === 'layout') {
      const row = rowOf(id);
      const inherited = (row === undefined ? globalValue : row.layoutBase) as SettingsValueMap[K];
      // 継承する値がWorkspaceの値の時は、戻す先をそう呼ぶ（全体の値へ戻すと言うと事実と合わない）
      const workspaceValue = workspaceOverrideOf(overrides, id);
      const fromWorkspace = workspaceValue !== undefined && JSON.stringify(workspaceValue) === JSON.stringify(inherited);
      return {
        value: layoutOverrideOf(overrides, layout.id, id) ?? inherited,
        defaultValue: inherited,
        resetTarget: row?.hasLayoutRecommendation === true ? '推奨' : fromWorkspace ? 'Workspaceの値' : '全体の値',
        onChange: (next) => dispatch(setLayoutCommand(layout.id, id, next, inherited)),
      };
    }
    if (workspace !== undefined && scope === 'workspace') {
      return {
        value: workspaceOverrideOf(overrides, id) ?? globalValue,
        defaultValue: globalValue,
        resetTarget: '全体の値',
        onChange: (next) => dispatch(setWorkspaceCommand(workspace.id, id, next, globalValue)),
      };
    }
    return {
      value: globalValue,
      defaultValue: globalDefault,
      onChange: (next) => dispatch(setGlobalCommand(id, next, globalDefault)),
    };
  }

  function bind<K extends Exclude<GlobalEditableId, 'fingerAssignmentId'>>(id: K): OptionBinding<SettingsValueMap[K]> {
    const defaultValue = staticDefaultOf(id);
    return scoped(id, globalOverrideOf(overrides, id) ?? defaultValue, defaultValue);
  }

  const boolBinding = (id: 'sfbHomeCost' | 'preferOppositeThumb'): OptionBinding<'on' | 'off'> => {
    const inner = bind(id);
    return {
      value: inner.value ? 'on' : 'off',
      defaultValue: inner.defaultValue ? 'on' : 'off',
      ...(inner.resetTarget === undefined ? {} : { resetTarget: inner.resetTarget }),
      onChange: (next) => inner.onChange(next === 'on'),
    };
  };

  /**
   * 行の編集先（Workspace・全体・配列）の切り替え。札の横に置く1つのメニューにまとめる。ボタンは⋯だけにして
   * （書き先の名前の長さで1列に収まらなくなるため）、いま編集しているレベルは開いたメニューの見出しと
   * 読み上げ名が持つ。
   */
  const scopeMenu = (id: GlobalEditableId, label: string, notApplicable: boolean) => {
    const scope = scopeOf(id);
    const canWorkspace = workspace !== undefined && canEditAtWorkspace(id);
    const canLayout = layoutEditable(id) && !notApplicable;
    const items: PaneMenuItem[] = [];
    if (scope === 'layout' && layout !== undefined) {
      // 移した後の継承値が今の値と一致しない行（推奨や、全体より上のレベルの値が勝つ行）は、移すと画面の値が
      // 変わって移した値が消えるので出さない。
      const stored = layoutOverrideOf(overrides, layout.id, id);
      const promotedBase = rowOf(id)?.promotedBase;
      const promotable = stored !== undefined && promotedBase !== undefined && JSON.stringify(promotedBase) === JSON.stringify(stored);
      if (promotable) {
        items.push({
          id: 'promote',
          label: '全体へ移す',
          description: `「${layout.name}」の値を全体の値にして、この配列だけの値は消す`,
          onSelect: () => {
            dispatch(promoteToGlobalCommand(layout.id, id, globalDefaultOf(id) as never));
            chooseScope(id, 'global');
          },
        });
      }
    }
    if (scope === 'workspace' && workspace !== undefined && workspaceOverrideOf(overrides, id) !== undefined) {
      // Workspaceのレベルは全体のすぐ上なので、移してもこのWorkspaceの画面の値は変わらない。
      // 変わるのは、単体ページと、Workspaceの値を持たない他のWorkspace。
      items.push({
        id: 'promote-workspace',
        label: '全体へ移す',
        description: 'Workspaceの値を全体の値にして、Workspaceだけの値は消す。他の画面にも反映される',
        onSelect: () => {
          dispatch(promoteWorkspaceToGlobalCommand(workspace.id, id, globalDefaultOf(id) as never));
          chooseScope(id, 'global');
        },
      });
    }
    if (scope !== 'workspace' && canWorkspace) {
      items.push({ id: 'workspace', label: 'Workspaceを編集', onSelect: () => chooseScope(id, 'workspace') });
    }
    if (scope !== 'global') items.push({ id: 'global', label: '全体を編集', onSelect: () => chooseScope(id, 'global') });
    if (scope !== 'layout' && canLayout && layout !== undefined) {
      const hasOverride = layoutOverrideOf(overrides, layout.id, id) !== undefined;
      items.push({
        id: 'layout',
        label: hasOverride ? 'この配列の値を編集' : 'この配列だけ別に',
        onSelect: () => chooseScope(id, 'layout'),
      });
    }
    if (items.length === 0) return null;
    const text = SCOPE_TEXT[scope];
    return (
      <PaneMenu
        paneName={label}
        label={`${label}の編集先: ${text}`}
        title={scope === 'layout' ? `「${layout?.name ?? 'この配列'}」の値を編集している` : scope === 'workspace' ? 'このWorkspaceの値を編集している' : '全体の値を編集している'}
        caption={`いま編集: ${text}`}
        className="condition-scope-menu"
        data={{ 'data-condition-scope': scope }}
        items={items}
      />
    );
  };

  /** 行の外枠。左線（全体で変えた行）・効かない行・下のレベルが勝つ理由をここで共通に持つ。 */
  const row = (id: GlobalEditableId, content: (badge: ReactNode) => ReactNode) => {
    if (editor.hiddenIds?.includes(id)) return null;
    const summary = rowOf(id);
    const notApplicable = summary !== undefined && !summary.applicable;
    const diagnostics = (summary?.diagnostics ?? [])
      .map((diagnostic) => (summary === undefined ? undefined : conditionDiagnosticText(summary, diagnostic)))
      .filter((text): text is string => text !== undefined);
    // 配列の値を編集している行では、配列の値が勝つ理由は要らない（いま見ているのがその値）。
    const scope = scopeOf(id);
    const notice = scope === 'layout' ? undefined : (scope === 'workspace' ? editor.workspaceNotices : editor.notices)?.get(id);
    return (
      <div
        key={id}
        className="condition-row"
        data-item={id}
        data-changed={changed(id) || undefined}
        data-not-applicable={notApplicable || undefined}
      >
        {content(
          <>
            <OriginBadge id={id} row={summary} changedHere={changed(id) || summary?.origin.kind === 'global'} />
            {scopeMenu(id, summary?.label ?? id, notApplicable)}
          </>,
        )}
        {notApplicable ? <p className="condition-row-flag">この配列・Setupでは効かない</p> : null}
        {notice === undefined ? null : <p className="condition-row-notice" data-condition-notice="true">{notice}</p>}
        {diagnostics.map((text, index) => <p key={index} className="condition-row-diagnostic">{text}</p>)}
      </div>
    );
  };

  const shapeChoices: OptionChoice<string>[] = groupShapes(editor.shapes.values()).flatMap((group) =>
    group.shapes.map((shape) => ({ value: shape.id, label: shape.name, group: group.label })));
  const shapeBinding = bind('defaultShapeId');
  if (!editor.shapes.has(shapeBinding.value)) {
    // 選ばれているidが手持ちに無い時も、実際の状態をそのまま見せる。
    shapeChoices.unshift({ value: shapeBinding.value, label: '（見つからない物理配列）' });
  }

  const fingerChoices = [
    ...Object.values(FINGER_ASSIGNMENT_REGISTRY),
    ...(editor.customFingerAssignments?.values() ?? []),
  ].map((assignment) => ({ value: assignment.id, label: assignment.name }));
  // 指の割当の既定は物理配列で決まる。ここで見せる既定は、編集しているレベルから見た既定の物理配列で決まる値
  // （全体の行は全体の物理配列、Workspaceの行はWorkspaceの物理配列。配列の値で決めない）。
  const globalShapeId = globalOverrideOf(overrides, 'defaultShapeId') ?? DEFAULT_SHAPE_ID;
  const workspaceShapeId = workspaceOverrideOf(overrides, 'defaultShapeId') ?? globalShapeId;
  const derivedFingerIdFor = (shapeId: string) => {
    const shape = editor.shapes.get(shapeId) ?? editor.shapes.get(DEFAULT_SHAPE_ID);
    return shape === undefined ? fingerChoices[0]?.value ?? '' : defaultFingerAssignmentId(shape);
  };
  const derivedFingerId = derivedFingerIdFor(globalShapeId);
  const fingerBinding = scoped(
    'fingerAssignmentId',
    globalOverrideOf(overrides, 'fingerAssignmentId') ?? (scopeOf('fingerAssignmentId') === 'workspace' ? derivedFingerIdFor(workspaceShapeId) : derivedFingerId),
    derivedFingerId,
  );
  if (!fingerChoices.some((choice) => choice.value === fingerBinding.value)) {
    fingerChoices.unshift({ value: fingerBinding.value, label: '（見つからない指の割当）' });
  }
  /** 全体のレベルでの既定値。配列・Workspaceの値を全体へ移す時、これと同じなら全体の上書きは持たない。 */
  const globalDefaultOf = (id: GlobalEditableId): unknown =>
    id === 'fingerAssignmentId' ? derivedFingerId : staticDefaultOf(id);

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
                ...(holdBinding.resetTarget === undefined ? {} : { resetTarget: holdBinding.resetTarget }),
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
                  defaultValue: actionCountModeOf(actionBinding.defaultValue),
                  ...(actionBinding.resetTarget === undefined ? {} : { resetTarget: actionBinding.resetTarget }),
                  // 既定（配列の値の編集中は継承する値）へ戻す操作は、例外ごと戻るよう、戻す先の値から組み直す。
                  onChange: (next) => actionBinding.onChange(
                    withActionCountMode(next === actionCountModeOf(actionBinding.defaultValue) ? actionBinding.defaultValue : actionBinding.value, next),
                  ),
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
