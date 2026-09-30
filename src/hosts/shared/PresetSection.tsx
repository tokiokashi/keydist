import { useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { applyPresetValues, normalizePresetName } from '#input/presets/index.ts';
import { SETTINGS_ITEMS } from '#engine/settings-items.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';
import { ROMAJI_RULES } from '#input/romaji/rules.ts';
import {
  applyPresetCommand,
  deletePresetCommand,
  importPresetsCommand,
  renamePresetCommand,
  savePresetCommand,
} from '#engine/preset-commands.ts';
import { GLOBAL_LEVEL } from './condition-edit.ts';
import type { ConditionEditorContext } from './ConditionEditor.tsx';
import { ErrorDetails } from './ErrorDetails.tsx';
import { PaneMenu } from './PaneHeaderParts.tsx';
import { PresetFileIoContext } from './preset-file-io.ts';
import {
  PRESET_FILE_FORMAT,
  PRESET_FILE_MAX_BYTES,
  PRESET_FILE_TOO_LARGE_MESSAGE,
  PRESET_FILE_UNREADABLE_MESSAGE,
  parsePresetFile,
  presetFileBody,
  presetFileName,
  type PresetReferences,
} from './preset-file.ts';
import {
  applyResultText,
  changedGlobalItemCount,
  deletedResultText,
  isSavableName,
  presetRows,
  savedResultText,
} from './preset-panel.ts';

/**
 * 条件のモーダルの上部に置くプリセットの節（閉じたまま開く折りたたみ）。
 * 保存・流し込み・名前の変更・削除はすべてコマンド（文脈バーの元に戻す/やり直すが効く）。
 *
 * モーダルは背後の文脈バーを操作できなくするので、保存・流し込み・削除の直後は
 * 結果の行を出し、そこに元に戻すを置く。結果の行は、その後に条件やプリセットが
 * 変わったら（元に戻す・行の編集など）消す。古い結果に「元に戻す」が残ると、
 * 別の操作を戻してしまうため。
 */

interface Notice {
  readonly text: string;
  readonly undoable: boolean;
  /** 不具合報告用の原文（読み込みで捨てた値の診断など）。 */
  readonly details?: readonly string[];
  /** 操作の直前の資産。これと違う参照になった最初の描画で、結果の反映後の参照を`settled`に記録する。 */
  readonly base: { readonly overrides: unknown; readonly library: unknown };
  readonly settled?: { readonly overrides: unknown; readonly library: unknown };
}

export function PresetSection({ editor }: { readonly editor: ConditionEditorContext }) {
  const { overrides, presetLibrary, dispatch } = editor;
  const rows = useMemo(() => presetRows(presetLibrary, overrides), [presetLibrary, overrides]);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly draft: string } | undefined>();
  const [notice, setNotice] = useState<Notice | undefined>();

  // 操作の結果が資産に反映された最初の描画で、その時点の参照を控える。以後に参照が変わったら結果は古い。
  useEffect(() => {
    if (notice === undefined || notice.settled !== undefined) return;
    if (notice.base.overrides === overrides && notice.base.library === presetLibrary) return;
    setNotice({ ...notice, settled: { overrides, library: presetLibrary } });
  }, [notice, overrides, presetLibrary]);

  const stale = notice?.settled !== undefined
    && (notice.settled.overrides !== overrides || notice.settled.library !== presetLibrary);
  const visibleNotice = stale ? undefined : notice;

  const show = (text: string, undoable: boolean, details?: readonly string[]) => {
    setNotice({ text, undoable, details, base: { overrides, library: presetLibrary } });
  };

  const fileIo = useContext(PresetFileIoContext);
  const fileInput = useRef<HTMLInputElement>(null);

  /** この端末にある参照先。ファイルの値がこれに無いidを指していたら、読み込みの結果で注記する。 */
  const references = (): PresetReferences => ({
    fingerAssignmentIds: new Set([
      ...Object.values(FINGER_ASSIGNMENT_REGISTRY).map((assignment) => assignment.id),
      ...(editor.customFingerAssignments?.keys() ?? []),
    ]),
    romajiRuleIds: new Set([...Object.keys(ROMAJI_RULES), ...(editor.customRomajiRules ?? []).map((rule) => rule.id)]),
    shapeIds: new Set(editor.shapes.keys()),
  });

  const exportPresets = (ids?: readonly string[]) => {
    if (fileIo === undefined) return;
    const chosen = ids === undefined ? presetLibrary.presets : presetLibrary.presets.filter((preset) => ids.includes(preset.id));
    if (chosen.length === 0) return;
    const filename = chosen.length === 1 && ids !== undefined
      ? presetFileName({ kind: 'one', name: chosen[0]!.name })
      : presetFileName({ kind: 'all', date: new Date() });
    fileIo.saveJson(filename, PRESET_FILE_FORMAT, presetFileBody({ presets: chosen }));
    show(chosen.length === 1 && ids !== undefined ? `「${chosen[0]!.name}」を書き出した` : `${chosen.length}件のプリセットを書き出した`, false);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // 同じファイルをもう一度選んでも変更として届くよう、選択を空へ戻す
    input.value = '';
    if (file === undefined || fileIo === undefined) return;
    const read = await fileIo.readText(file, PRESET_FILE_MAX_BYTES);
    if (read.kind !== 'ok') {
      show(read.kind === 'too-large' ? PRESET_FILE_TOO_LARGE_MESSAGE : PRESET_FILE_UNREADABLE_MESSAGE, false);
      return;
    }
    const parsed = parsePresetFile(read.text, references());
    if (!parsed.ok) {
      show(parsed.message, false, parsed.details);
      return;
    }
    dispatch(importPresetsCommand(parsed.presets, editor.generatePresetId));
    show(parsed.message, true, parsed.details);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizePresetName(name);
    if (normalized === undefined) return;
    dispatch(savePresetCommand(normalized, GLOBAL_LEVEL, editor.generatePresetId));
    setName('');
    show(savedResultText(normalized), true);
  };

  const apply = (id: string) => {
    const preset = presetLibrary.presets.find((entry) => entry.id === id);
    if (preset === undefined) return;
    const applied = applyPresetValues(SETTINGS_ITEMS, overrides, GLOBAL_LEVEL, preset.values);
    const result = applyResultText(preset.name, changedGlobalItemCount(overrides, applied.overrides), applied.skipped);
    if (result.undoable) dispatch(applyPresetCommand(id, GLOBAL_LEVEL));
    show(result.text, result.undoable);
  };

  const remove = (id: string) => {
    const preset = presetLibrary.presets.find((entry) => entry.id === id);
    if (preset === undefined) return;
    dispatch(deletePresetCommand(id));
    show(deletedResultText(preset.name), true);
  };

  const commitRename = (event: FormEvent) => {
    event.preventDefault();
    if (renaming === undefined || !isSavableName(renaming.draft)) return;
    dispatch(renamePresetCommand(renaming.id, renaming.draft));
    setRenaming(undefined);
  };

  const undo = () => {
    editor.undo();
    // 戻した結果の行は、戻したこと自体を伝える（元に戻すは付けない）
    setNotice({ text: '元に戻した', undoable: false, base: { overrides, library: presetLibrary } });
  };

  return (
    <details className="condition-presets" data-condition-presets="true">
      <summary>プリセット（{rows.length}）</summary>
      <div className="condition-presets-body">
        {rows.length === 0 ? (
          <p className="condition-presets-empty">保存したプリセットは無い</p>
        ) : (
          <ul className="condition-preset-list">
            {rows.map((row) => (
              <li key={row.id} className="condition-preset-row" data-preset-id={row.id} data-same={row.sameAsCurrent || undefined}>
                {renaming?.id === row.id ? (
                  <form className="condition-preset-rename" onSubmit={commitRename}>
                    <input
                      type="text"
                      aria-label="新しい名前"
                      value={renaming.draft}
                      autoFocus
                      onChange={(event) => setRenaming({ id: row.id, draft: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return;
                        // モーダルごと閉じず、名前の入力だけをやめる
                        event.preventDefault();
                        event.stopPropagation();
                        setRenaming(undefined);
                      }}
                    />
                    <button type="submit" disabled={!isSavableName(renaming.draft)}>変更</button>
                    <button type="button" onClick={() => setRenaming(undefined)}>やめる</button>
                  </form>
                ) : (
                  <>
                    <span className="condition-preset-name">{row.name}</span>
                    {row.sameAsCurrent ? <span className="condition-preset-same">いまの値と同じ</span> : null}
                    <button
                      type="button"
                      className="condition-preset-apply"
                      aria-label={`「${row.name}」の値を流し込む`}
                      onClick={() => apply(row.id)}
                    >
                      流し込む
                    </button>
                    <PaneMenu
                      paneName={row.name}
                      label={`「${row.name}」の操作`}
                      className="condition-preset-menu"
                      items={[
                        { id: 'rename', label: '名前を変更', onSelect: () => setRenaming({ id: row.id, draft: row.name }) },
                        ...(fileIo === undefined ? [] : [{ id: 'export', label: '書き出す', onSelect: () => exportPresets([row.id]) }]),
                        { id: 'delete', label: '削除', onSelect: () => remove(row.id) },
                      ]}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className="condition-preset-save" onSubmit={save}>
          <input
            type="text"
            aria-label="プリセットの名前"
            placeholder="名前"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={!isSavableName(name)}>今の全体の値を保存</button>
        </form>
        {fileIo === undefined ? null : (
          <div className="condition-preset-files">
            <button type="button" disabled={rows.length === 0} onClick={() => exportPresets()}>すべて書き出す</button>
            <button type="button" onClick={() => fileInput.current?.click()}>読み込む…</button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="読み込むプリセットのファイル"
              onChange={(event) => void importFile(event)}
            />
          </div>
        )}
        {visibleNotice === undefined ? null : (
          <div className="condition-preset-result-block">
            <p className="condition-preset-result" role="status" data-preset-result="true">
              <span>{visibleNotice.text}</span>
              {visibleNotice.undoable ? <button type="button" onClick={undo}>元に戻す</button> : null}
            </p>
            <ErrorDetails lines={visibleNotice.details ?? []} />
          </div>
        )}
      </div>
    </details>
  );
}
