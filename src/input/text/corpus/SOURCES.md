# 同梱するテキストの出典とライセンス

このディレクトリのテキスト（`*.txt`）は `scripts/generate-eval-texts.ts` が作る。手で直さない。
原文の取得元とsha256は `scripts/eval-text-spec.ts` に固定してある。

## ライセンス

- 青空文庫の作品の本文（`aozora-*.txt`）: 作者の没後70年を過ぎ、著作権の保護期間が満了している。
  [青空文庫収録ファイルの取り扱い規準](https://www.aozora.gr.jp/guide/kijyunn.html)に従い、ルビと入力者注を取り除いて抜粋した。
- Wikipediaの文を含む本文（`wiki-*.txt` と `mixed.txt`）: [Creative Commons表示-継承4.0国際（CC BY-SA 4.0）](https://creativecommons.org/licenses/by-sa/4.0/deed.ja)で配る。
  Wikipediaの記事の本文は、Wikimedia Foundationの[利用規約](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use)第7条により、CC BY-SA 4.0とGFDLで許諾されている。
  取得元のデータセットの表記はCC BY-SA 3.0だが、改変した文は「4.0以降」で許諾できる（[Wikipedia:Copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights)の「Reusers' rights and obligations」）。
  CC BY-SA 4.0になるのはこれらのテキストのファイルだけで、リポジトリのほかのファイルはApache-2.0のままである。
  `mixed.txt` は青空文庫の文も含むが、Wikipediaの文と並べた改変物なので、全体をCC BY-SA 4.0で配る。
- 改変: 記事ごとに、地の文の段落（40字以上で句点を含む行）だけを残し、脚注や関連項目の節から後ろを捨てた。
  取得元のデータで中身が欠けた空の括弧を取り除き、先頭の語や括弧の中の語が欠けた段落は除いた。残した段落から文の単位で抜粋した。
  英字と数字は原文のまま残し、文の順は変えていない。
- 出典の記事の執筆者は、各記事の履歴のページ（下の「履歴」）で辿れる。
- 画面に出す時は、改行と空白を取り除き、英数字に挟まれた空白だけを1つ残す（`src/input/text/corpus-bodies.ts` の `corpusBodyText`）。

## 取得元

- Wikipedia日本語版: [wikimedia/wikipedia](https://huggingface.co/datasets/wikimedia/wikipedia) の `20231101.ja`（版 `b04c8d1ceb2f5cd4588862100d08de323dccfbaa`）。記事ごとの本文のsha256は `scripts/eval-text-spec.ts` にある。
- 青空文庫: 作品ごとのzip。sha256は `scripts/eval-text-spec.ts` にある。

## 青空文庫（著作権の保護期間が満了）

### 青空文庫・小説（人間失格）（`aozora-novel.txt`）

- [『人間失格』](https://www.aozora.gr.jp/cards/000035/card301.html): 太宰治（没年1948）。青空文庫。底本：「人間失格」新潮文庫、新潮社、1952（昭和27）年10月30日発行、1985（昭和60）年1月30日100刷改版。入力：細渕真弓、校正：八巻美惠。ルビと入力者注を取り除き、一部の文を抜粋しました

### 青空文庫・童話（銀河鉄道の夜）（`aozora-fairy-tale.txt`）

- [『銀河鉄道の夜』](https://www.aozora.gr.jp/cards/000081/card43737.html): 宮沢賢治（没年1933）。青空文庫。底本：「銀河鉄道の夜」角川文庫、角川書店、1969（昭和44）年7月20日改版初版発行、1987（昭和62）年3月30日改版50版。入力：幸野素子、校正：土屋隆。ルビと入力者注を取り除き、一部の文を抜粋しました

### 青空文庫・随筆（柿の種）（`aozora-essay.txt`）

- [『柿の種』](https://www.aozora.gr.jp/cards/000042/card1684.html): 寺田寅彦（没年1935）。青空文庫。底本：「柿の種」岩波文庫、岩波書店、1996（平成8）年4月16日第1刷発行、1997（平成9）年10月15日第9刷発行。入力：山口美佐、校正：田中敬三。ルビと入力者注を取り除き、一部の文を抜粋しました

### 青空文庫・講演（私の個人主義）（`aozora-lecture.txt`）

- [『私の個人主義』](https://www.aozora.gr.jp/cards/000148/card772.html): 夏目漱石（没年1916）。青空文庫。底本：「ちくま日本文学全集　夏目漱石」筑摩書房、1992（平成4）年1月20日第1刷発行。入力：真先芳秋、校正：かとうかおり。ルビと入力者注を取り除き、一部の文を抜粋しました

## CC BY-SA 4.0

### 混合（青空文庫4作品とWikipedia8分野）（`mixed.txt`）

- [『人間失格』](https://www.aozora.gr.jp/cards/000035/card301.html): 太宰治（没年1948）。青空文庫。底本：「人間失格」新潮文庫、新潮社、1952（昭和27）年10月30日発行、1985（昭和60）年1月30日100刷改版。入力：細渕真弓、校正：八巻美惠。ルビと入力者注を取り除き、一部の文を抜粋しました
- [『銀河鉄道の夜』](https://www.aozora.gr.jp/cards/000081/card43737.html): 宮沢賢治（没年1933）。青空文庫。底本：「銀河鉄道の夜」角川文庫、角川書店、1969（昭和44）年7月20日改版初版発行、1987（昭和62）年3月30日改版50版。入力：幸野素子、校正：土屋隆。ルビと入力者注を取り除き、一部の文を抜粋しました
- [『柿の種』](https://www.aozora.gr.jp/cards/000042/card1684.html): 寺田寅彦（没年1935）。青空文庫。底本：「柿の種」岩波文庫、岩波書店、1996（平成8）年4月16日第1刷発行、1997（平成9）年10月15日第9刷発行。入力：山口美佐、校正：田中敬三。ルビと入力者注を取り除き、一部の文を抜粋しました
- [『私の個人主義』](https://www.aozora.gr.jp/cards/000148/card772.html): 夏目漱石（没年1916）。青空文庫。底本：「ちくま日本文学全集　夏目漱石」筑摩書房、1992（平成4）年1月20日第1刷発行。入力：真先芳秋、校正：かとうかおり。ルビと入力者注を取り除き、一部の文を抜粋しました
- [光合成](https://ja.wikipedia.org/wiki/%E5%85%89%E5%90%88%E6%88%90)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%85%89%E5%90%88%E6%88%90&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [火山](https://ja.wikipedia.org/wiki/%E7%81%AB%E5%B1%B1)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%81%AB%E5%B1%B1&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [太陽](https://ja.wikipedia.org/wiki/%E5%A4%AA%E9%99%BD)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%A4%AA%E9%99%BD&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [自動車](https://ja.wikipedia.org/wiki/%E8%87%AA%E5%8B%95%E8%BB%8A)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E8%87%AA%E5%8B%95%E8%BB%8A&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [鉄道](https://ja.wikipedia.org/wiki/%E9%89%84%E9%81%93)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E9%89%84%E9%81%93&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [飛行機](https://ja.wikipedia.org/wiki/%E9%A3%9B%E8%A1%8C%E6%A9%9F)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E9%A3%9B%E8%A1%8C%E6%A9%9F&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [江戸時代](https://ja.wikipedia.org/wiki/%E6%B1%9F%E6%88%B8%E6%99%82%E4%BB%A3)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B1%9F%E6%88%B8%E6%99%82%E4%BB%A3&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [明治維新](https://ja.wikipedia.org/wiki/%E6%98%8E%E6%B2%BB%E7%B6%AD%E6%96%B0)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%98%8E%E6%B2%BB%E7%B6%AD%E6%96%B0&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [織田信長](https://ja.wikipedia.org/wiki/%E7%B9%94%E7%94%B0%E4%BF%A1%E9%95%B7)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%B9%94%E7%94%B0%E4%BF%A1%E9%95%B7&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [哲学](https://ja.wikipedia.org/wiki/%E5%93%B2%E5%AD%A6)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%93%B2%E5%AD%A6&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [倫理学](https://ja.wikipedia.org/wiki/%E5%80%AB%E7%90%86%E5%AD%A6)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%80%AB%E7%90%86%E5%AD%A6&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [功利主義](https://ja.wikipedia.org/wiki/%E5%8A%9F%E5%88%A9%E4%B8%BB%E7%BE%A9)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%8A%9F%E5%88%A9%E4%B8%BB%E7%BE%A9&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [仏教](https://ja.wikipedia.org/wiki/%E4%BB%8F%E6%95%99)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E4%BB%8F%E6%95%99&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [キリスト教](https://ja.wikipedia.org/wiki/%E3%82%AD%E3%83%AA%E3%82%B9%E3%83%88%E6%95%99)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E3%82%AD%E3%83%AA%E3%82%B9%E3%83%88%E6%95%99&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [神道](https://ja.wikipedia.org/wiki/%E7%A5%9E%E9%81%93)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%A5%9E%E9%81%93&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [日本語](https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%97%A5%E6%9C%AC%E8%AA%9E&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [漢字](https://ja.wikipedia.org/wiki/%E6%BC%A2%E5%AD%97)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%BC%A2%E5%AD%97&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [俳句](https://ja.wikipedia.org/wiki/%E4%BF%B3%E5%8F%A5)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E4%BF%B3%E5%8F%A5&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [経済学](https://ja.wikipedia.org/wiki/%E7%B5%8C%E6%B8%88%E5%AD%A6)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%B5%8C%E6%B8%88%E5%AD%A6&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [民主主義](https://ja.wikipedia.org/wiki/%E6%B0%91%E4%B8%BB%E4%B8%BB%E7%BE%A9)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B0%91%E4%B8%BB%E4%B8%BB%E7%BE%A9&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [憲法](https://ja.wikipedia.org/wiki/%E6%86%B2%E6%B3%95)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%86%B2%E6%B3%95&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [寿司](https://ja.wikipedia.org/wiki/%E5%AF%BF%E5%8F%B8)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%AF%BF%E5%8F%B8&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [日本料理](https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E6%96%99%E7%90%86)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%97%A5%E6%9C%AC%E6%96%99%E7%90%86&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [温泉](https://ja.wikipedia.org/wiki/%E6%B8%A9%E6%B3%89)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B8%A9%E6%B3%89&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・自然科学（`wiki-science.txt`）

- [光合成](https://ja.wikipedia.org/wiki/%E5%85%89%E5%90%88%E6%88%90)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%85%89%E5%90%88%E6%88%90&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [火山](https://ja.wikipedia.org/wiki/%E7%81%AB%E5%B1%B1)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%81%AB%E5%B1%B1&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [太陽](https://ja.wikipedia.org/wiki/%E5%A4%AA%E9%99%BD)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%A4%AA%E9%99%BD&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [進化](https://ja.wikipedia.org/wiki/%E9%80%B2%E5%8C%96)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E9%80%B2%E5%8C%96&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [気象](https://ja.wikipedia.org/wiki/%E6%B0%97%E8%B1%A1)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B0%97%E8%B1%A1&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・技術（`wiki-technology.txt`）

- [自動車](https://ja.wikipedia.org/wiki/%E8%87%AA%E5%8B%95%E8%BB%8A)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E8%87%AA%E5%8B%95%E8%BB%8A&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [鉄道](https://ja.wikipedia.org/wiki/%E9%89%84%E9%81%93)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E9%89%84%E9%81%93&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [飛行機](https://ja.wikipedia.org/wiki/%E9%A3%9B%E8%A1%8C%E6%A9%9F)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E9%A3%9B%E8%A1%8C%E6%A9%9F&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [インターネット](https://ja.wikipedia.org/wiki/%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%BC%E3%83%8D%E3%83%83%E3%83%88)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%BC%E3%83%8D%E3%83%83%E3%83%88&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [半導体](https://ja.wikipedia.org/wiki/%E5%8D%8A%E5%B0%8E%E4%BD%93)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%8D%8A%E5%B0%8E%E4%BD%93&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・歴史（`wiki-history.txt`）

- [江戸時代](https://ja.wikipedia.org/wiki/%E6%B1%9F%E6%88%B8%E6%99%82%E4%BB%A3)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B1%9F%E6%88%B8%E6%99%82%E4%BB%A3&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [明治維新](https://ja.wikipedia.org/wiki/%E6%98%8E%E6%B2%BB%E7%B6%AD%E6%96%B0)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%98%8E%E6%B2%BB%E7%B6%AD%E6%96%B0&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [織田信長](https://ja.wikipedia.org/wiki/%E7%B9%94%E7%94%B0%E4%BF%A1%E9%95%B7)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%B9%94%E7%94%B0%E4%BF%A1%E9%95%B7&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [鎌倉幕府](https://ja.wikipedia.org/wiki/%E9%8E%8C%E5%80%89%E5%B9%95%E5%BA%9C)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E9%8E%8C%E5%80%89%E5%B9%95%E5%BA%9C&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [縄文時代](https://ja.wikipedia.org/wiki/%E7%B8%84%E6%96%87%E6%99%82%E4%BB%A3)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%B8%84%E6%96%87%E6%99%82%E4%BB%A3&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・哲学（`wiki-philosophy.txt`）

- [哲学](https://ja.wikipedia.org/wiki/%E5%93%B2%E5%AD%A6)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%93%B2%E5%AD%A6&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [倫理学](https://ja.wikipedia.org/wiki/%E5%80%AB%E7%90%86%E5%AD%A6)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%80%AB%E7%90%86%E5%AD%A6&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [功利主義](https://ja.wikipedia.org/wiki/%E5%8A%9F%E5%88%A9%E4%B8%BB%E7%BE%A9)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%8A%9F%E5%88%A9%E4%B8%BB%E7%BE%A9&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [イマヌエル・カント](https://ja.wikipedia.org/wiki/%E3%82%A4%E3%83%9E%E3%83%8C%E3%82%A8%E3%83%AB%E3%83%BB%E3%82%AB%E3%83%B3%E3%83%88)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E3%82%A4%E3%83%9E%E3%83%8C%E3%82%A8%E3%83%AB%E3%83%BB%E3%82%AB%E3%83%B3%E3%83%88&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [実存主義](https://ja.wikipedia.org/wiki/%E5%AE%9F%E5%AD%98%E4%B8%BB%E7%BE%A9)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%AE%9F%E5%AD%98%E4%B8%BB%E7%BE%A9&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・宗教（`wiki-religion.txt`）

- [仏教](https://ja.wikipedia.org/wiki/%E4%BB%8F%E6%95%99)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E4%BB%8F%E6%95%99&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [キリスト教](https://ja.wikipedia.org/wiki/%E3%82%AD%E3%83%AA%E3%82%B9%E3%83%88%E6%95%99)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E3%82%AD%E3%83%AA%E3%82%B9%E3%83%88%E6%95%99&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [神道](https://ja.wikipedia.org/wiki/%E7%A5%9E%E9%81%93)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%A5%9E%E9%81%93&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [イスラム教](https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%83%A9%E3%83%A0%E6%95%99)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E3%82%A4%E3%82%B9%E3%83%A9%E3%83%A0%E6%95%99&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [浄土真宗](https://ja.wikipedia.org/wiki/%E6%B5%84%E5%9C%9F%E7%9C%9F%E5%AE%97)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B5%84%E5%9C%9F%E7%9C%9F%E5%AE%97&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・言語と芸術（`wiki-language-arts.txt`）

- [日本語](https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%97%A5%E6%9C%AC%E8%AA%9E&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [漢字](https://ja.wikipedia.org/wiki/%E6%BC%A2%E5%AD%97)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%BC%A2%E5%AD%97&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [俳句](https://ja.wikipedia.org/wiki/%E4%BF%B3%E5%8F%A5)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E4%BF%B3%E5%8F%A5&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [浮世絵](https://ja.wikipedia.org/wiki/%E6%B5%AE%E4%B8%96%E7%B5%B5)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B5%AE%E4%B8%96%E7%B5%B5&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [歌舞伎](https://ja.wikipedia.org/wiki/%E6%AD%8C%E8%88%9E%E4%BC%8E)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%AD%8C%E8%88%9E%E4%BC%8E&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・社会科学（`wiki-social-science.txt`）

- [経済学](https://ja.wikipedia.org/wiki/%E7%B5%8C%E6%B8%88%E5%AD%A6)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%B5%8C%E6%B8%88%E5%AD%A6&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [民主主義](https://ja.wikipedia.org/wiki/%E6%B0%91%E4%B8%BB%E4%B8%BB%E7%BE%A9)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B0%91%E4%B8%BB%E4%B8%BB%E7%BE%A9&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [憲法](https://ja.wikipedia.org/wiki/%E6%86%B2%E6%B3%95)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%86%B2%E6%B3%95&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [貨幣](https://ja.wikipedia.org/wiki/%E8%B2%A8%E5%B9%A3)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E8%B2%A8%E5%B9%A3&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [国際連合](https://ja.wikipedia.org/wiki/%E5%9B%BD%E9%9A%9B%E9%80%A3%E5%90%88)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%9B%BD%E9%9A%9B%E9%80%A3%E5%90%88&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）

### Wikipedia・生活と文化（`wiki-life-culture.txt`）

- [寿司](https://ja.wikipedia.org/wiki/%E5%AF%BF%E5%8F%B8)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E5%AF%BF%E5%8F%B8&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [日本料理](https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E6%96%99%E7%90%86)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%97%A5%E6%9C%AC%E6%96%99%E7%90%86&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [温泉](https://ja.wikipedia.org/wiki/%E6%B8%A9%E6%B3%89)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E6%B8%A9%E6%B3%89&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [相撲](https://ja.wikipedia.org/wiki/%E7%9B%B8%E6%92%B2)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E7%9B%B8%E6%92%B2&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
- [茶道](https://ja.wikipedia.org/wiki/%E8%8C%B6%E9%81%93)、[履歴](https://ja.wikipedia.org/w/index.php?title=%E8%8C%B6%E9%81%93&action=history): Wikipedia日本語版の記事から一部の文を抜粋した（行を除き、文の順は変えていない）
