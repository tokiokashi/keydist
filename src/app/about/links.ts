/** リポジトリのルート。サイドバーと計算方法のページの両方がたどる先。 */
export const REPOSITORY_URL = 'https://github.com/tokiokashi/keydist';

export interface SpecLink {
  readonly label: string;
  /** リポジトリ内のパス。実在することを `links.test.ts` が検査する */
  readonly path: string;
  readonly url: string;
}

const specLink = (label: string, path: string): SpecLink => ({
  label,
  path,
  url: `${REPOSITORY_URL}/blob/main/${path}`,
});

/** 仕様書へのリンク。ファイルが無いものは載せない。 */
export const SPEC_LINKS: readonly SpecLink[] = [
  specLink('距離モデルの仕様書', 'spec/distance-model.md'),
  specLink('再生時間モデルの仕様書', 'spec/playback-timing.md'),
];
