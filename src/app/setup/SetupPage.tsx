import { useMemo, useState, type FormEvent } from 'react';
import type { Command } from '#input/commands/index.ts';
import {
  createSetupCommand,
  duplicateSetupCommand,
  relabelSetupCommand,
  setSetupShapeCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import { resolveDefaultShapeId } from '#engine/settings-items.ts';
import { groupShapes } from '#input/shapes/shape-groups.ts';
import type { Setup } from '#input/setup/index.ts';
import { ConditionEditor, type ConditionEditorContext } from '#hosts/shared/ConditionEditor.tsx';
import { PresetSection } from '#hosts/shared/PresetSection.tsx';
import { resettableSetupIds, resetSetupConditionsCommand } from '#hosts/shared/condition-edit.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { targetChoiceGroups } from '#hosts/shared/target-choices.ts';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';
import { SETUP_LABEL } from './label.ts';
import { SETUP_HIDDEN_ITEM_IDS, setupConditionRows, setupListItems } from './setup-view.ts';
import './setup.css';

export interface SetupPageProps {
  readonly assets: Pick<KeydistAssets, 'setupLibrary' | 'presetLibrary'>;
  /** 保存の読み込みが済むまでは、Setupが無いように見せない。 */
  readonly ready: boolean;
  readonly catalog: PaneCatalog;
  /**
   * URLで指定された、最初に選ぶSetupのid。手持ちに無ければ、どのSetupも選ばず見つからないことを知らせる。
   * 画面の中で一覧から選ぶ・作る・複製すると、以後は指定を使わない。
   */
  readonly initialSetupId?: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  /** 新しいSetupのidの発行（純粋層は乱数を持たないので、`app`が注入する）。 */
  readonly generateSetupId: () => string;
  readonly generatePresetId: () => string;
}

const DEFAULT_LAYOUT_ID = 'qwerty';

/**
 * Setup（配列と物理配列の組に、その組だけの条件を足したもの）を作る・編集する画面。
 * 作る・複製・名前の変更・物理配列の付け替え・Setupのレベルの条件の変更は、すべてコマンドを通すので元に戻せる。
 * 削除は自作の資産の画面で行う。選んでいるSetupはこの画面の中だけの値で、保存しない。
 */
export function SetupPage({
  assets,
  ready,
  catalog,
  initialSetupId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  dispatch,
  generateSetupId,
  generatePresetId,
}: SetupPageProps) {
  useHistoryShortcuts({ canUndo, canRedo, undo: onUndo, redo: onRedo });
  const { setups, overrides } = assets.setupLibrary;
  const { layouts, shapes } = catalog.setupCatalog;

  const [selectedId, setSelectedId] = useState<string | undefined>(initialSetupId);
  // 選んでいるidがURLの指定のまま（画面の中で選び直していない）かどうか。
  // 画面の中で選んだSetupが後から無くなった時（元に戻す・別のタブでの削除）は、先頭に切り替える。
  const [fromUrl, setFromUrl] = useState(initialSetupId !== undefined);
  const [layoutId, setLayoutId] = useState<string | undefined>(undefined);
  const [shapeId, setShapeId] = useState<string | undefined>(undefined);
  const [labelDraft, setLabelDraft] = useState('');
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly draft: string } | undefined>(undefined);

  const items = useMemo(() => setupListItems(setups, catalog, overrides), [setups, catalog, overrides]);
  const selectedFound = setups.find((setup) => setup.id === selectedId);
  // URLで指定されたSetupが手持ちに無い時は、先頭のSetupに逃がさず知らせる（別のSetupを編集していると気づけなくなるため）。
  // 資産の読み込み前は手持ちが空に見えるので、判定しない。
  const requestedMissing = ready && fromUrl && selectedId !== undefined && selectedFound === undefined;
  const selected: Setup | undefined = requestedMissing ? undefined : (selectedFound ?? setups[0]);
  // 画面の中で選んだSetupを選び直す。URLの指定はここで使い終わる。
  const choose = (id: string) => {
    setSelectedId(id);
    setFromUrl(false);
  };

  const layoutGroups = useMemo(
    () => targetChoiceGroups({
      layouts,
      userLayoutIds: new Set(catalog.userLayouts.keys()),
      shapes,
      setups: [],
      selected: [],
    }).filter((group) => group.id !== 'setup'),
    [layouts, shapes, catalog.userLayouts],
  );
  const shapeGroups = useMemo(() => groupShapes(shapes.values()), [shapes]);

  const createLayoutId = layoutId !== undefined && layouts.has(layoutId)
    ? layoutId
    : layouts.has(DEFAULT_LAYOUT_ID) ? DEFAULT_LAYOUT_ID : [...layouts.keys()][0];
  // 物理配列を選んでいない間は、その配列で使う既定の物理配列にする
  const defaultShapeId = createLayoutId === undefined ? undefined : resolveDefaultShapeId(overrides, createLayoutId);
  const createShapeId = shapeId !== undefined && shapes.has(shapeId)
    ? shapeId
    : defaultShapeId !== undefined && shapes.has(defaultShapeId) ? defaultShapeId : [...shapes.keys()][0];

  const create = (event: FormEvent) => {
    event.preventDefault();
    if (createLayoutId === undefined || createShapeId === undefined) return;
    const id = generateSetupId();
    dispatch(createSetupCommand(createLayoutId, createShapeId, () => id, labelDraft));
    choose(id);
    setLabelDraft('');
  };
  const duplicate = (sourceId: string) => {
    const id = generateSetupId();
    dispatch(duplicateSetupCommand(sourceId, () => id));
    choose(id);
  };
  const commitRename = (event: FormEvent) => {
    event.preventDefault();
    if (renaming === undefined) return;
    dispatch(relabelSetupCommand(renaming.id, renaming.draft));
    setRenaming(undefined);
  };

  const rows = selected === undefined ? undefined : setupConditionRows(selected, catalog, overrides);
  const selectedLayout = selected === undefined ? undefined : layouts.get(selected.layoutId);
  const selectedShapeMissing = selected !== undefined && !shapes.has(selected.shapeId);
  const resettable = selected === undefined ? [] : resettableSetupIds(overrides, selected.id, SETUP_HIDDEN_ITEM_IDS);

  const editor: ConditionEditorContext | undefined = selected === undefined ? undefined : {
    overrides,
    dispatch,
    shapes,
    ...(catalog.customFingerAssignments === undefined ? {} : { customFingerAssignments: catalog.customFingerAssignments }),
    ...(catalog.customRomajiRules === undefined ? {} : { customRomajiRules: catalog.customRomajiRules }),
    setup: { id: selected.id, layoutId: selected.layoutId },
    hiddenIds: SETUP_HIDDEN_ITEM_IDS,
    presetLibrary: assets.presetLibrary,
    generatePresetId,
    undo: onUndo,
  };

  return (
    <article className="setup-page" data-setup-page>
      <h1>{SETUP_LABEL}</h1>
      <p className="setup-note">
        配列と物理配列の組に、その組だけの条件を足せます。作ったSetupは、Analyzerの対象やWorkspaceのペインから選べます。削除は自作の配列・規則の画面で行います。
      </p>
      <div className="setup-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>元に戻す</button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>やり直す</button>
      </div>

      {!ready ? null : (
        <>
          <section className="setup-section" aria-labelledby="setup-create-title">
            <h2 id="setup-create-title">Setupを作る</h2>
            <form className="setup-create" onSubmit={create}>
              <label>
                配列
                <select aria-label="配列を選ぶ" value={createLayoutId ?? ''} onChange={(event) => { setLayoutId(event.currentTarget.value); setShapeId(undefined); }}>
                  {layoutGroups.map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {group.choices.map((choice) => (
                        <option key={choice.key} value={choice.target.kind === 'layout' ? choice.target.layoutId : ''}>{choice.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                物理配列
                <select aria-label="作るSetupの物理配列を選ぶ" value={createShapeId ?? ''} onChange={(event) => setShapeId(event.currentTarget.value)}>
                  {shapeGroups.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      {group.shapes.map((shape) => <option key={shape.id} value={shape.id}>{shape.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                名前
                <input
                  type="text"
                  aria-label="Setupの名前"
                  placeholder="省略できます"
                  value={labelDraft}
                  onChange={(event) => setLabelDraft(event.currentTarget.value)}
                />
              </label>
              <button type="submit" data-setup-create disabled={createLayoutId === undefined || createShapeId === undefined}>作る</button>
            </form>
            <p className="setup-note">名前を入れなければ、配列と物理配列から自動で付きます。</p>
          </section>

          <section className="setup-section" aria-labelledby="setup-list-title">
            <h2 id="setup-list-title">Setup（{items.length}）</h2>
            {items.length === 0 ? <p className="setup-note">Setupはありません。</p> : (
              <ul className="setup-list">
                {items.map(({ setup, displayName, fullName }) => (
                  <li key={setup.id} className="setup-row" data-setup-row={setup.id} data-selected={setup.id === selected?.id || undefined}>
                    {renaming?.id === setup.id ? (
                      <form className="setup-rename" onSubmit={commitRename}>
                        <input
                          type="text"
                          aria-label="新しい名前"
                          value={renaming.draft}
                          autoFocus
                          onChange={(event) => setRenaming({ id: setup.id, draft: event.currentTarget.value })}
                          onKeyDown={(event) => {
                            if (event.key !== 'Escape') return;
                            event.preventDefault();
                            setRenaming(undefined);
                          }}
                        />
                        <button type="submit">変更</button>
                        <button type="button" onClick={() => setRenaming(undefined)}>やめる</button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="setup-row-name"
                          title={fullName}
                          aria-pressed={setup.id === selected?.id}
                          onClick={() => choose(setup.id)}
                        >
                          <span>{displayName}</span>
                          <span className="setup-row-tag">Setup {setup.number}</span>
                        </button>
                        <button type="button" aria-label={`「${displayName}」を複製`} onClick={() => duplicate(setup.id)}>複製</button>
                        <button
                          type="button"
                          aria-label={`「${displayName}」の名前を変更`}
                          onClick={() => setRenaming({ id: setup.id, draft: setup.label ?? '' })}
                        >
                          名前を変更
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {requestedMissing ? (
            <p className="setup-note" data-setup-problem="missing">指定されたSetupは見つかりません。削除されたSetupの可能性があります。一覧からSetupを選んでください。</p>
          ) : null}
          {selected === undefined ? null : (
            <section className="setup-section" aria-labelledby="setup-edit-title" data-setup-editor={selected.id}>
              <h2 id="setup-edit-title">
                {items.find((item) => item.setup.id === selected.id)?.displayName ?? SETUP_LABEL}
              </h2>
              {selectedLayout === undefined ? (
                <p className="setup-note" data-setup-problem="layout">このSetupの配列が見つかりません。配列は変えられないので、新しいSetupを作ってください。</p>
              ) : null}
              <label className="setup-shape">
                物理配列
                <select
                  aria-label="このSetupの物理配列を選ぶ"
                  value={selected.shapeId}
                  onChange={(event) => dispatch(setSetupShapeCommand(selected.id, event.currentTarget.value))}
                >
                  {selectedShapeMissing ? <option value={selected.shapeId}>（見つからない物理配列）</option> : null}
                  {shapeGroups.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      {group.shapes.map((shape) => <option key={shape.id} value={shape.id}>{shape.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              {selectedShapeMissing ? (
                <p className="setup-note" data-setup-problem="shape">このSetupの物理配列が見つかりません。物理配列を選び直してください。</p>
              ) : null}

              {rows === undefined || editor === undefined ? null : (
                <div className="setup-conditions" data-setup-conditions>
                  <div className="setup-conditions-head">
                    <h3>条件</h3>
                    <p className="setup-note">全体と配列の条件を引き継ぎます。変えた項目は、このSetupを対象にした計算にだけ入ります。</p>
                    <button
                      type="button"
                      data-setup-reset-all
                      disabled={resettable.length === 0}
                      onClick={() => dispatch(resetSetupConditionsCommand(selected.id, resettable))}
                    >
                      このSetupの変更をすべて戻す
                    </button>
                  </div>
                  <PresetSection editor={editor} />
                  <ConditionEditor editor={editor} rows={rows} />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </article>
  );
}
