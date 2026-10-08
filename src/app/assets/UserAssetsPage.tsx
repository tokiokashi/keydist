import { useContext, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { KeydistAssets } from '#engine/commands.ts';
import {
  USER_ASSETS_FILE_FORMAT,
  USER_ASSETS_FILE_MAX_BYTES,
  mergeUserAssets,
  parseUserAssetsFile,
  userAssetsFileBody,
  type UserAssetsBundle,
} from '#engine/user-assets-file.ts';
import { ErrorDetails } from '#hosts/shared/ErrorDetails.tsx';
import { PresetFileIoContext } from '#hosts/shared/preset-file-io.ts';
import { exportedText, importEntryText, importSummaryText, userAssetsFileName } from './user-assets-file-text.ts';
import { userLayoutRows, userRomajiRuleRows, type UserAssetRow } from './user-asset-rows.ts';

/** 自作の配列・規則の画面の名前。サイドバーのリンクも同じ文言を出す。 */
export const USER_ASSETS_LABEL = '自作の配列・規則';

export interface UserAssetsPageProps {
  readonly assets: Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments'>;
  /** 保存の読み込みが済むまでは、空の一覧を出さない。 */
  readonly ready: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onDeleteLayout: (id: string) => void;
  readonly onDeleteRomajiRule: (id: string) => void;
  /** 読み込んだ資産を手元へ足す。`stamp`は足す時に振る新しいidの元になる、1回の読み込みで固定の値。 */
  readonly onImport: (bundle: UserAssetsBundle, stamp: string) => void;
}

const FILE_TOO_LARGE_MESSAGE = 'ファイルが大きすぎます（1MBまで）';
const FILE_UNREADABLE_MESSAGE = 'ファイルを読み取れませんでした';

interface ImportResult {
  readonly summary: string;
  readonly lines: readonly string[];
  readonly details: readonly string[];
}

/** 新しいidの元にする値。同じ読み込みの中では変わらず、別の読み込みとは重ならない。 */
function newStamp(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface AssetSectionProps {
  readonly title: string;
  readonly kind: 'layout' | 'romaji-rule';
  readonly emptyText: string;
  readonly rows: readonly UserAssetRow[];
  readonly onDelete: (row: UserAssetRow, button: HTMLElement) => void;
}

/** 種類ごとの一覧。行の操作は削除だけで、他の操作を足す時もこの行に並べる。 */
function AssetSection({ title, kind, emptyText, rows, onDelete }: AssetSectionProps) {
  return (
    <section className="user-assets-section" data-user-assets-section={kind}>
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="user-assets-empty">{emptyText}</p> : (
        <ul className="user-assets-list">
          {rows.map((row) => (
            <li key={row.id} className="user-assets-row" data-user-asset-row={row.id}>
              <div className="user-assets-row-text">
                <span className="user-assets-name">{row.name}</span>
                {row.detail === undefined ? null : <span className="user-assets-detail">{row.detail}</span>}
              </div>
              <button type="button" aria-label={`「${row.name}」を削除`} onClick={(event) => onDelete(row, event.currentTarget)}>削除</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PendingDelete {
  readonly kind: 'layout' | 'romaji-rule';
  readonly row: UserAssetRow;
}

/** 削除の確認の文。元に戻すが使える範囲と、削除が他へ及ぼす影響を書く。 */
function confirmText(pending: PendingDelete): readonly string[] {
  const lines = pending.kind === 'layout'
    ? ['この配列を対象にしているペインは、「配列が見つかりません」の表示になります。']
    : ['この規則を推奨にしている配列は、全体の値の規則で打つようになります。'];
  lines.push('「元に戻す」はこの画面にいる間だけ使えます。別の画面へ移ったり開き直したりすると、戻せません。');
  return lines;
}

/** 削除の確認。キャンセルにフォーカスを置き、Escでもキャンセルになる。 */
function ConfirmDelete({ pending, onConfirm, onCancel }: {
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
    <dialog ref={ref} className="user-assets-confirm" aria-labelledby="user-assets-confirm-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id="user-assets-confirm-title">「{pending.row.name}」を削除しますか</h2>
      {confirmText(pending).map((line) => <p key={line}>{line}</p>)}
      <div className="user-assets-confirm-actions">
        <button type="button" autoFocus onClick={onCancel}>キャンセル</button>
        <button type="button" onClick={onConfirm}>削除する</button>
      </div>
    </dialog>
  );
}

/**
 * 自作の配列とローマ字規則を一覧して削除する画面。削除は確認の後に行い、この画面にいる間は元に戻すで戻せる。
 * 削除した配列を対象にしているペインは、その旨を各画面で出す。
 */
export function UserAssetsPage({
  assets,
  ready,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteLayout,
  onDeleteRomajiRule,
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
  const hasAssets = assets.userLayouts.length + assets.userRomajiRules.length + assets.fingerAssignments.length > 0;

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

  const exportAssets = () => {
    if (fileIo === undefined || !hasAssets) return;
    fileIo.saveJson(userAssetsFileName(new Date()), USER_ASSETS_FILE_FORMAT, userAssetsFileBody(assets));
    clearResults();
    setMessage(exportedText({ userLayouts: assets.userLayouts, userRomajiRules: assets.userRomajiRules, fingerAssignments: assets.fingerAssignments }));
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
      setMessage(read.kind === 'too-large' ? FILE_TOO_LARGE_MESSAGE : FILE_UNREADABLE_MESSAGE);
      return;
    }
    const parsed = parseUserAssetsFile(read.text);
    if (!parsed.ok) {
      setImportResult({ summary: parsed.message, lines: [], details: parsed.details });
      return;
    }
    const stamp = newStamp();
    // 画面に出す結果と書き込みは、同じ手元・同じ`stamp`から同じ突き合わせをする
    const merged = mergeUserAssets(assets, parsed.bundle, stamp);
    onImport(parsed.bundle, stamp);
    const dropped = parsed.dropped.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`);
    const lines = merged.entries.map(importEntryText);
    if (dropped.length > 0) lines.push(`${dropped.length}件は読み込めませんでした`);
    setImportResult({ summary: importSummaryText(merged.entries), lines, details: dropped });
  };
  const layouts = userLayoutRows(assets.userLayouts, assets.userRomajiRules);
  const rules = userRomajiRuleRows(assets.userLayouts, assets.userRomajiRules);

  return (
    <article className="user-assets" ref={root}>
      <h1>{USER_ASSETS_LABEL}</h1>
      <div className="user-assets-toolbar">
        <button type="button" data-user-assets-undo="true" disabled={!canUndo} onClick={() => { clearResults(); onUndo(); }}>元に戻す</button>
        <button type="button" disabled={!canRedo} onClick={() => { clearResults(); onRedo(); }}>やり直す</button>
        {fileIo === undefined ? null : (
          <>
            <button type="button" disabled={!hasAssets} onClick={exportAssets}>書き出す</button>
            <button type="button" disabled={!ready} onClick={() => fileInput.current?.click()}>読み込む…</button>
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
        <p className="user-assets-message" role="status">{message}</p>
      </div>
      {importResult === undefined ? null : (
        <div className="user-assets-import-result" data-user-assets-import-result="true">
          <p role="status">{importResult.summary}</p>
          {importResult.lines.length === 0 ? null : (
            <ul>{importResult.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
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
            onDelete={(row, button) => { opener.current = button; setPending({ kind: 'layout', row }); }}
          />
          <AssetSection
            title="ローマ字規則"
            kind="romaji-rule"
            emptyText="自作のローマ字規則はありません。"
            rows={rules}
            onDelete={(row, button) => { opener.current = button; setPending({ kind: 'romaji-rule', row }); }}
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
            if (pending.kind === 'layout') onDeleteLayout(pending.row.id);
            else onDeleteRomajiRule(pending.row.id);
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
