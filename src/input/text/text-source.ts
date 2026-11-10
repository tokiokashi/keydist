/**
 * 組み込みテキストの出典とライセンス。画面の出典の表示と、テキストのファイルの隣の出典の一覧
 * （`corpus/SOURCES.md`）が同じ内容を持つ。
 */
export type TextLicenseId = 'public-domain' | 'cc-by-sa-4.0';

export interface TextLicense {
  readonly name: string;
  /** ライセンスの本文へのリンク。著作権の保護期間が満了したテキストには無い。 */
  readonly url?: string;
}

export const TEXT_LICENSES: Readonly<Record<TextLicenseId, TextLicense>> = {
  'public-domain': {
    name: '著作権の保護期間が満了',
  },
  'cc-by-sa-4.0': {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja',
  },
};

/** 出典の1件（青空文庫の作品1つ、Wikipediaの記事1つ）。 */
export interface TextSourceItem {
  /** 作品名や記事名。 */
  readonly label: string;
  /** 作者や取得元など、`label` に添えて出す短い説明。 */
  readonly note: string;
  /** 図書カードや記事のページ。 */
  readonly url: string;
  /** Wikipediaの記事の履歴のページ（執筆者の一覧）。青空文庫の作品には無い。 */
  readonly historyUrl?: string;
}

export interface TextSource {
  readonly license: TextLicenseId;
  readonly items: readonly TextSourceItem[];
}
