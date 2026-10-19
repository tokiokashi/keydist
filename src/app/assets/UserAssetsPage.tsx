import { focusOnMount } from '#ui/primitives/focus-on-mount.ts';
import { useContext, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { LAYOUT_MISSING_REASON, MISSING_SETUP_NAME } from '#input/setup/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import {
  USER_ASSETS_FILE_FORMAT,
  USER_ASSETS_FILE_MAX_BYTES,
  parseUserAssetsFile,
  userAssetsFileBody,
  type UserAssetImportEntry,
  type UserAssetsBundle,
} from '#engine/user-assets-file.ts';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';
import { ErrorDetails } from '#hosts/shared/ErrorDetails.tsx';
import { PresetFileIoContext } from '#hosts/shared/preset-file-io.ts';
import { PRESET_FILE_IMPORT_FAILED_MESSAGE, PRESET_FILE_TOO_LARGE_MESSAGE, PRESET_FILE_UNREADABLE_MESSAGE } from '#hosts/shared/preset-file.ts';
import { exportedText, importEntryText, importSummaryText, userAssetsFileName } from './user-assets-file-text.ts';
import { userFingerAssignmentRows, userLayoutRows, userRomajiRuleRows, userSetupRows, type UserAssetRow } from './user-asset-rows.ts';
import type { SetupListItem } from '../setup/setup-view.ts';
import type { OverrideEntry, OverrideGroup } from './cascade-override-groups.ts';

/** データ・設定の管理の画面の名前。サイドバーのリンクも同じ文言を出す。 */
export const USER_ASSETS_LABEL = 'データ・設定の管理';

export interface UserAssetsPageProps {
  readonly assets: Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments' | 'setupLibrary'>;
  /** 手持ちのSetup全部に対して付けた名前。 */
  readonly setupItems: readonly SetupListItem[];
  /** 保存の読み込みが済むまでは、空の一覧を出さない。 */
  readonly ready: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onDeleteLayout: (id: string) => void;
  readonly onDeleteRomajiRule: (id: string) => void;
  readonly onDeleteFingerAssignment: (id: string) => void;
  readonly onDeleteSetup: (id: string) => void;
  /** 条件の設定の表。保存してある条件の上書きの一覧の前に出す。 */
  readonly conditionTable: ReactNode;
  /** 保存してある条件の上書き。適用範囲ごとにカスケードの順。 */
  readonly overrideGroups: readonly OverrideGroup[];
  /** 1項目の上書きを消す。消すと、その項目は継承する値に戻る。 */
  readonly onResetOverride: (group: OverrideGroup, itemId: OverrideEntry['itemId']) => void;
  /**
   * 読み込んだ資産を手元へ足し、書き込みに使った突き合わせの内訳を返す（書き込めなかった時は`undefined`）。
   * `stamp`は足す時に振る新しいidの元になる、1回の読み込みで固定の値。
   */
  readonly onImport: (bundle: UserAssetsBundle, stamp: string) => readonly UserAssetImportEntry[] | undefined;
}

interface ImportResult {
  readonly summary: string;
  readonly lines: readonly string[];
  readonly details: readonly string[];
}

/** 新しいidの元にする値。同じ読み込みの中では変わらず、別の読み込みとは重ならない。 */
function newStamp(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type UserAssetKind = 'layout' | 'romaji-rule' | 'finger-assignment' | 'setup';

interface AssetSectionProps {
  readonly title: string;
  readonly kind: UserAssetKind;
  readonly emptyText: string;
  readonly rows: readonly UserAssetRow[];
  readonly onDelete: (row: UserAssetRow, button: HTMLElement) => void;
}

/** 種類ごとの一覧。行の操作は削除だけで、他の操作を足す時もこの行に並べる。 */
function AssetSection({ title, kind, emptyText, rows, onDelete }: AssetSectionProps) {
  return (
    <section className="user-assets-section" data-user-assets-section={kind}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="user-assets-empty">{emptyText}</p>
      ) : (
        <ul className="user-assets-list">
          {rows.map((row) => (
            <li key={row.id} className="user-assets-row" data-user-asset-row={row.id}>
              <div className="user-assets-row-text">
                <span className="user-assets-name">{row.name}</span>
                {row.detail === undefined ? null : <span className="user-assets-detail">{row.detail}</span>}
              </div>
              <button type="button" aria-label={`「${row.name}」を削除`} onClick={(event) => onDelete(row, event.currentTarget)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PendingDelete {
  readonly kind: UserAssetKind | 'missing-setup-override';
  readonly row: UserAssetRow;
  /** 上書きを消す確認の時だけ。確定した時に消す。 */
  readonly confirm?: () => void;
}

const CONFIRM_IMPACT: Readonly<Record<UserAssetKind | 'missing-setup-override', string>> = {
  'missing-setup-override': 'このSetupが手持ちに無いため、変更を戻した後は「元に戻す」で戻せません。',
  layout: `この配列を対象にしているペインは、「${LAYOUT_MISSING_REASON}」の表示になります。`,
  'romaji-rule': 'この規則を推奨にしている配列は、全体の値の規則で打つようになります。',
  'finger-assignment': 'この割り当てを選んでいる場所は、既定の割り当てで測るようになります。',
  setup: `このSetupを対象にしているペインは、「${MISSING_SETUP_NAME}」の表示になります。`,
};

/** 削除の確認の文。元に戻すが使える範囲と、削除が他へ及ぼす影響を書く。 */
function confirmText(pending: PendingDelete): readonly string[] {
  if (pending.kind === 'missing-setup-override') return [CONFIRM_IMPACT[pending.kind]];
  return [CONFIRM_IMPACT[pending.kind], '「元に戻す」で戻せます。再読み込みやタブを閉じた後は戻せません。'];
}

/** 削除の確認。キャンセルにフォーカスを置き、Escでもキャンセルになる。 */
function ConfirmDelete({
  pending,
  onConfirm,
  onCancel,
}: {
  readonly pending: PendingDelete;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="user-assets-confirm"
      aria-labelledby="user-assets-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="user-assets-confirm-title">
        {pending.kind === 'missing-setup-override' ? `「${pending.row.name}」の変更を戻しますか` : `「${pending.row.name}」を削除しますか`}
      </h2>
      {confirmText(pending).map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className="user-assets-confirm-actions">
        <button type="button" ref={focusOnMount} onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" onClick={onConfirm}>
          {pending.kind === 'missing-setup-override' ? '変更を戻す' : '削除する'}
        </button>
      </div>
    </dialog>
  );
}

/** 保存してある条件の上書きの一覧。適用範囲ごとに、項目の名前と値を並べ、項目ごとに消せる。 */
function OverrideSection({
  groups,
  onReset,
}: {
  readonly groups: readonly OverrideGroup[];
  readonly onReset: (group: OverrideGroup, entry: OverrideEntry, button: HTMLElement) => void;
}) {
  return (
    <section className="user-assets-section" data-user-assets-section="overrides">
      <h2>変更した条件</h2>
      <p className="user-assets-detail">
        保存してある変更をそのまま並べています。継承する値と同じ値や、今の条件では使われない値も含みます。
        書き出しのファイルに入るのは、Setupの変更だけです。
      </p>
      {groups.length === 0 ? (
        <p className="user-assets-empty">変更した条件はありません。</p>
      ) : (
        <ul className="user-assets-list">
          {groups.map((group) => (
            <li key={group.key} className="user-assets-override-group" data-user-assets-override-group={group.key}>
              <h3 className="user-assets-override-title">{group.title}</h3>
              <ul className="user-assets-list">
                {group.entries.map((entry) => (
                  <li key={entry.itemId} className="user-assets-row" data-user-assets-override={`${group.key}/${entry.itemId}`}>
                    <div className="user-assets-row-text">
                      <span className="user-assets-name">
                        {entry.label}: {entry.valueText}
                      </span>
                      {entry.unused ? <span className="user-assets-detail">この適用範囲では使われません</span> : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`${group.title}の「${entry.label}」の変更を戻す`}
                      onClick={(event) => onReset(group, entry, event.currentTarget)}
                    >
                      変更を戻す
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 自作の配列・ローマ字規則・指の割り当て・Setupを一覧して削除する画面。削除は確認の後に行い、元に戻すで戻せる。
 * 削除した配列を対象にしているペインは、その旨を各画面で出す。
 */
export function UserAssetsPage({
  assets,
  setupItems,
  ready,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteLayout,
  onDeleteRomajiRule,
  onDeleteFingerAssignment,
  onDeleteSetup,
  conditionTable,
  overrideGroups,
  onResetOverride,
  onImport,
}: UserAssetsPageProps) {
  const [message, setMessage] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | undefined>(undefined);
  const [pending, setPending] = useState<PendingDelete | undefined>(undefined);
  const fileIo = useContext(PresetFileIoContext);
  const fileInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  /** 削除の確認を開いたボタン。閉じたらここへフォーカスを返す。 */
  const opener = useRef<HTMLElement | null>(null);
  /** 確認を閉じた後にフォーカスを移す先。削除した行のボタンは消えるので、続けて戻せる「元に戻す」へ移す。 */
  const focusAfterClose = useRef<'opener' | 'undo' | undefined>(undefined);
  const hasAssets = assets.userLayouts.length + assets.userRomajiRules.length + assets.fingerAssignments.length + assets.setupLibrary.setups.length > 0;

  /** 上書きを消した後、一覧が書き換わってからフォーカスを移す。消した項目のボタンは無くなり、「元に戻す」は書き込みの後に押せるようになるため。 */
  const focusUndoAfterReset = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: overrideGroupsは一覧が書き換わった時を知る合図。本体では読まない。依存から外すと、上書きを消した後に「元に戻す」へフォーカスが移らない
  useEffect(() => {
    if (!focusUndoAfterReset.current) return;
    focusUndoAfterReset.current = false;
    root.current?.querySelector<HTMLElement>('[data-user-assets-undo]')?.focus();
  }, [overrideGroups]);

  useEffect(() => {
    if (pending !== undefined) return;
    const target = focusAfterClose.current;
    focusAfterClose.current = undefined;
    if (target === 'opener') opener.current?.focus();
    else if (target === 'undo') root.current?.querySelector<HTMLElement>('[data-user-assets-undo]')?.focus();
  }, [pending]);

  const clearResults = () => {
    setMessage('');
    setImportResult(undefined);
  };

  // キー操作もボタンと同じ処理を通す
  useHistoryShortcuts({
    canUndo,
    canRedo,
    undo: () => {
      clearResults();
      onUndo();
    },
    redo: () => {
      clearResults();
      onRedo();
    },
  });

  const exportAssets = () => {
    if (fileIo === undefined || !hasAssets) return;
    fileIo.saveJson(userAssetsFileName(new Date()), USER_ASSETS_FILE_FORMAT, userAssetsFileBody(assets));
    clearResults();
    setMessage(exportedText(assets));
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // 同じファイルをもう一度選んでも変更として届くよう、選択を空へ戻す
    input.value = '';
    if (file === undefined || fileIo === undefined) return;
    clearResults();
    const read = await fileIo.readText(file, USER_ASSETS_FILE_MAX_BYTES);
    if (read.kind !== 'ok') {
      setMessage(read.kind === 'too-large' ? PRESET_FILE_TOO_LARGE_MESSAGE : PRESET_FILE_UNREADABLE_MESSAGE);
      return;
    }
    const parsed = parseUserAssetsFile(read.text);
    if (!parsed.ok) {
      setImportResult({ summary: parsed.message, lines: [], details: parsed.details });
      return;
    }
    const stamp = newStamp();
    // 画面に出す内訳は、書き込みを決めた突き合わせそのものから取る。ファイルを読む間に別のタブが資産を書き換えても食い違わない
    const entries = onImport(parsed.bundle, stamp);
    if (entries === undefined) {
      setMessage(PRESET_FILE_IMPORT_FAILED_MESSAGE);
      return;
    }
    const dropped = parsed.dropped.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`);
    const lines = entries.map(importEntryText);
    if (dropped.length > 0) lines.push(`${dropped.length}件は読み込めませんでした`);
    setImportResult({ summary: importSummaryText(entries), lines, details: dropped });
  };
  const layouts = userLayoutRows(assets.userLayouts, assets.userRomajiRules);
  const rules = userRomajiRuleRows(assets.userLayouts, assets.userRomajiRules);
  const fingerAssignments = userFingerAssignmentRows(assets.fingerAssignments);
  const setups = userSetupRows(setupItems);

  return (
    <article className="user-assets" ref={root}>
      <h1>{USER_ASSETS_LABEL}</h1>
      <div className="user-assets-toolbar">
        <button
          type="button"
          data-user-assets-undo="true"
          disabled={!canUndo}
          onClick={() => {
            clearResults();
            onUndo();
          }}
        >
          元に戻す
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={() => {
            clearResults();
            onRedo();
          }}
        >
          やり直す
        </button>
        {fileIo === undefined ? null : (
          <>
            <button type="button" disabled={!hasAssets} onClick={exportAssets}>
              書き出す
            </button>
            <button type="button" disabled={!ready} onClick={() => fileInput.current?.click()}>
              読み込む…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="読み込む自作の資産のファイル"
              onChange={(event) => void importFile(event)}
            />
          </>
        )}
        <p className="user-assets-message" role="status">
          {message}
        </p>
      </div>
      {importResult === undefined ? null : (
        <div className="user-assets-import-result" data-user-assets-import-result="true">
          <p role="status">{importResult.summary}</p>
          {importResult.lines.length === 0 ? null : (
            <ul>
              {importResult.lines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 読み込みの結果を毎回まるごと差し替える表示だけの一覧で、同じ文が並びうる
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
          <ErrorDetails lines={importResult.details} />
        </div>
      )}
      {ready ? (
        <>
          <AssetSection
            title="配列"
            kind="layout"
            emptyText="自作の配列はありません。"
            rows={layouts}
            onDelete={(row, button) => {
              opener.current = button;
              setPending({ kind: 'layout', row });
            }}
          />
          <AssetSection
            title="ローマ字規則"
            kind="romaji-rule"
            emptyText="自作のローマ字規則はありません。"
            rows={rules}
            onDelete={(row, button) => {
              opener.current = button;
              setPending({ kind: 'romaji-rule', row });
            }}
          />
          <AssetSection
            title="指の割り当て"
            kind="finger-assignment"
            emptyText="自作の指の割り当てはありません。"
            rows={fingerAssignments}
            onDelete={(row, button) => {
              opener.current = button;
              setPending({ kind: 'finger-assignment', row });
            }}
          />
          <AssetSection
            title="Setup"
            kind="setup"
            emptyText="Setupはありません。"
            rows={setups}
            onDelete={(row, button) => {
              opener.current = button;
              setPending({ kind: 'setup', row });
            }}
          />
          {conditionTable}
          <OverrideSection
            groups={overrideGroups}
            onReset={(group, entry, button) => {
              const name = `${group.title}の${entry.label}`;
              const reset = () => {
                onResetOverride(group, entry.itemId);
                clearResults();
                setMessage(`「${name}」の変更を戻しました`);
                focusUndoAfterReset.current = true;
              };
              if (group.missingSetup) {
                opener.current = button;
                setPending({ kind: 'missing-setup-override', row: { id: `${group.key}/${entry.itemId}`, name, detail: undefined }, confirm: reset });
                return;
              }
              reset();
            }}
          />
        </>
      ) : null}
      {pending === undefined ? null : (
        <ConfirmDelete
          pending={pending}
          onCancel={() => {
            focusAfterClose.current = 'opener';
            setPending(undefined);
          }}
          onConfirm={() => {
            if (pending.confirm !== undefined) {
              pending.confirm();
              setPending(undefined);
              return;
            }
            if (pending.kind === 'layout') onDeleteLayout(pending.row.id);
            else if (pending.kind === 'romaji-rule') onDeleteRomajiRule(pending.row.id);
            else if (pending.kind === 'finger-assignment') onDeleteFingerAssignment(pending.row.id);
            else onDeleteSetup(pending.row.id);
            clearResults();
            setMessage(`「${pending.row.name}」を削除しました`);
            focusAfterClose.current = 'undo';
            setPending(undefined);
          }}
        />
      )}
    </article>
  );
}
