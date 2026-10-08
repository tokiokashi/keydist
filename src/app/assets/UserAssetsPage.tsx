import { useState } from 'react';
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

/**
 * 自作の配列とローマ字規則を一覧して削除する画面。削除は確認を挟まず、元に戻すで戻せる。
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
            onDelete={(row) => { onDeleteLayout(row.id); setMessage(`「${row.name}」を削除した`); }}
          />
          <AssetSection
            title="ローマ字規則"
            kind="romaji-rule"
            emptyText="自作のローマ字規則はありません。"
            rows={rules}
            onDelete={(row) => { onDeleteRomajiRule(row.id); setMessage(`「${row.name}」を削除した`); }}
          />
        </>
      ) : null}
    </article>
  );
}
