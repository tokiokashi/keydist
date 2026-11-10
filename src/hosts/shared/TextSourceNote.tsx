import { TEXT_LICENSES, type TextSource } from '#input/text/text-source.ts';
import type { BodyState } from './use-resolved-text-selection.ts';

/** 出典を一覧にせず、そのまま並べる件数の上限。これを超えたら、開いた時だけ一覧を出す。 */
const INLINE_ITEM_LIMIT = 3;

/** CC BY-SAのテキストを抜粋して改変したことを伝える文。ライセンスの表示の要件（改変の明示）を満たす。 */
const CC_BY_SA_MODIFIED = '記事や作品から文を抜粋して改変しています。';

function SourceItems({ source }: { readonly source: TextSource }) {
  return (
    <ul className="text-source-items">
      {source.items.map((item) => (
        <li key={item.url}>
          <a href={item.url} target="_blank" rel="noreferrer">
            {item.label}
          </a>
          {item.historyUrl === undefined ? null : (
            <>
              （
              <a href={item.historyUrl} target="_blank" rel="noreferrer">
                履歴
              </a>
              ）
            </>
          )}
          {item.note === undefined ? null : <span className="text-source-note">{item.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * 組み込みテキストの出典とライセンス。文脈バーのテキストの選択の下に出す。
 * 本文の読み込みに失敗した時は、その知らせも出す。
 */
export function TextSourceNote({ source, body }: { readonly source: TextSource; readonly body: BodyState }) {
  const license = TEXT_LICENSES[source.license];
  return (
    <div className="text-source">
      {body === 'failed' ? (
        <p className="text-editor-hint" role="status">
          本文を読み込めませんでした。通信を確かめて、もう一度選んでください。
        </p>
      ) : null}
      <p className="text-editor-hint">
        ライセンス:{' '}
        {license.url === undefined ? (
          license.name
        ) : (
          <a href={license.url} target="_blank" rel="noreferrer">
            {license.name}
          </a>
        )}
        {source.license === 'cc-by-sa-4.0' ? `。${CC_BY_SA_MODIFIED}` : null}
      </p>
      {source.items.length <= INLINE_ITEM_LIMIT ? (
        <div className="text-editor-hint">
          出典
          <SourceItems source={source} />
        </div>
      ) : (
        <details className="text-source-details">
          <summary className="text-editor-hint">出典の一覧（{source.items.length}件）</summary>
          <SourceItems source={source} />
        </details>
      )}
    </div>
  );
}
