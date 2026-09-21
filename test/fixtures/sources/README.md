# かな配列の出典マニフェスト

各 JSON は、Issue #83 の出典ファイルから、かな面として採用する面だけを抜き出した
固定スナップショットである。source manifest version 2では各Faceに2つの行列を持つ。

- `sourceRows`: 出典から転記したJISグリッド（13 / 12 / 12 / 11列）を、各行タブ区切り文字列で保持する。除外する値も消さない
- `rows`: keydistのANSI fixtureへ採用する行列。除外セルは空文字にする

`scripts/generate-kana-fixtures.ts` が `rows` の各行先頭から ANSI の
12 / 12 / 11 / 10 列を切り出して `test/fixtures/<layout-id>.json` を生成する。

`sourceRows` に値があり `rows` で空欄になったセルは、必ず `omissions` に同じ値と理由を持つ。
ANSI対象外の値も同じ規則で明示する。これにより omission の記載漏れ・不要指定・重複を
生成時に機械検出し、出典にある値が暗黙に消えることを防ぐ。
