import { useEffect, useRef, useState } from 'react';
import type { KeydistAssets } from '#engine/commands.ts';
import { userLayoutRows, userRomajiRuleRows, type UserAssetRow } from './user-asset-rows.ts';

/** 自作の配列・規則の画面の名前。サイドバーのリンクも同じ文言を出す。 */
export const USER_ASSETS_LABEL = '自作の配列・規則';

export interface UserAssetsPageProps {
  readonly assets: Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules'>;
  /** 保存の読み込みが済むまでは、空の一覧を出さない。 */
  readonly ready: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onDeleteLayout: (id: string) => void;
  readonly onDeleteRomajiRule: (id: string) => void;
}

interface AssetSectionProps {
  readonly title: string;
  readonly kind: 'layout' | 'romaji-rule';
  readonly emptyText: string;
  readonly rows: readonly UserAssetRow[];
  readonly onDelete: (row: UserAssetRow) => void;
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
              <button type="button" aria-label={`「${row.name}」を削除`} onClick={() => onDelete(row)}>削除</button>
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
    ? ['この配列を対象にしているペインは、「配列が見つからない」の表示になります。']
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
}: UserAssetsPageProps) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingDelete | undefined>(undefined);
  const layouts = userLayoutRows(assets.userLayouts, assets.userRomajiRules);
  const rules = userRomajiRuleRows(assets.userLayouts, assets.userRomajiRules);

  return (
    <article className="user-assets">
      <h1>{USER_ASSETS_LABEL}</h1>
      <div className="user-assets-toolbar">
        <button type="button" disabled={!canUndo} onClick={() => { setMessage(''); onUndo(); }}>元に戻す</button>
        <button type="button" disabled={!canRedo} onClick={() => { setMessage(''); onRedo(); }}>やり直す</button>
        <p className="user-assets-message" role="status">{message}</p>
      </div>
      {ready ? (
        <>
          <AssetSection
            title="配列"
            kind="layout"
            emptyText="自作の配列はありません。"
            rows={layouts}
            onDelete={(row) => setPending({ kind: 'layout', row })}
          />
          <AssetSection
            title="ローマ字規則"
            kind="romaji-rule"
            emptyText="自作のローマ字規則はありません。"
            rows={rules}
            onDelete={(row) => setPending({ kind: 'romaji-rule', row })}
          />
        </>
      ) : null}
      {pending === undefined ? null : (
        <ConfirmDelete
          pending={pending}
          onCancel={() => setPending(undefined)}
          onConfirm={() => {
            if (pending.kind === 'layout') onDeleteLayout(pending.row.id);
            else onDeleteRomajiRule(pending.row.id);
            setMessage(`「${pending.row.name}」を削除した`);
            setPending(undefined);
          }}
        />
      )}
    </article>
  );
}
