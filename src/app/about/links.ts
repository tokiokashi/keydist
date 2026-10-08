/** リポジトリのルート。サイドバーと計算方法のページの両方がたどる先。 */
export const REPOSITORY_URL = 'https://github.com/tokiokashi/keydist';

export interface SpecLink {
  readonly label: string;
  /** リポジトリ内のパス。実在することを `links.test.ts` が検査する */
  readonly path: string;
  /** 見出しへのアンカー（GitHubが見出しの文字列から作るid）。`links.test.ts` が見出しの実在を検査する */
  readonly anchor?: string;
  /** `anchor` が指す見出しの文字列（`#` を除く） */
  readonly heading?: string;
  readonly url: string;
}

/** GitHubの見出しのアンカー: 小文字にし、記号を除き、空白を `-` にする。 */
const headingAnchor = (heading: string): string =>
  heading.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');

const specLink = (label: string, path: string, heading?: string): SpecLink => {
  const base = `${REPOSITORY_URL}/blob/main/${path}`;
  if (heading === undefined) return { label, path, url: base };
  const anchor = headingAnchor(heading);
  return { label, path, anchor, heading, url: `${base}#${anchor}` };
};

/** 仕様書へのリンク。ファイルが無いものは載せない。 */
export const SPEC_LINKS: readonly SpecLink[] = [
  specLink('距離モデルの仕様書', 'spec/distance-model.md'),
  specLink('再生時間モデルの仕様書', 'spec/playback-timing.md'),
  // 構造解析モデルは独立した仕様書を持たず、距離モデルの仕様書の該当節に含まれる
  specLink('構造解析モデルの仕様', 'spec/distance-model.md', '10. 任意時点の指位置'),
];
