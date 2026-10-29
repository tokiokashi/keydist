# かな配列の出典マニフェスト

各 JSON は、出典ファイルから、かな面として採用する面だけを抜き出した
固定スナップショットである。source manifest version 2では各Faceに2つの行列を持つ。

- `sourceRows`: 出典から転記したJISグリッド（13 / 12 / 12 / 11列）を、各行タブ区切り文字列で保持する。除外する値も消さない
- `rows`: keydistのANSI fixtureへ採用する行列。除外セルは空文字にする

`scripts/generate-kana-fixtures.ts` が `rows` の各行先頭から ANSI の
12 / 12 / 11 / 10 列を切り出して `test/fixtures/<layout-id>.json` を生成する。

`sourceRows` に値があり `rows` で空欄になったセルは、必ず `omissions` に同じ値と理由を持つ。
ANSI対象外の値も同じ規則で明示する。これにより omission の記載漏れ・不要指定・重複を
生成時に機械検出し、出典にある値が暗黙に消えることを防ぐ。

前置のtriggerと出力キーの後に打つ後置のtriggerを持つ3打の面は、`suffixTrigger`（キーの配列）で表す。
`mode` は `prefix`、`trigger` は前置のtriggerで、どちらも必須。`suffixTrigger` を持たない面は、生成する fixture にもこの欄を出さない。

格子の外のキー（`backquote`・`tab`・`caps-lock`）に出力を置く面は、`extraCells`（キーidから出力への写像）を持つ。
出典のJISの格子に置き場が無い値を、採用する値のまま持つので、`sourceRows` と `omissions` には載せない。持たない面は、生成する fixture にもこの欄を出さない。

出典の値を、別の出典（作者の追記など）に従って置き換えたセルは、manifestの `substitutions`（任意）に記録する。
各要素は、面の番号・行・列（`omissions` と同じ位置の表し方）、`value`（`sourceRows` の値）、`adopted`（`rows` の値）、`source`（根拠）を持つ。
`sourceRows` は出典の値のまま残し、`rows` に採用する値を置く。検査は、`sourceRows` の値と `value`、`rows` の値と `adopted` が一致すること、`adopted` と `value` が違うこと、`source` が空でないことを確かめる。
`sourceRows` と `rows` で値が違うセルは、`omissions` か `substitutions` のどちらかに記録が無いと失敗する。fixtureは `rows` の値だけを持つ。

面に入れない出典の行のうち、格子のキーの位置を持つ行は、`sourceRows` に転記して `omissions` に理由を書く。
Shiftを要する入力や2キーの入力のように位置を持たない行は、manifestの `unplacedRows`（任意。入力・出力・理由）に書く。
理由 `ime-default` は、作者の配列の設計ではなく、Google日本語入力の既定の表から残ったと読む行に使う。

## 英字配列の出典の写し（`format` を持つ manifest）

`format` を持つ JSON は、かな配列の manifest ではなく、作者が機械で読める形で配る英字配列の定義の写しである。
面と格子を持たないので、`scripts/generate-kana-fixtures.ts` の対象にしない（`isKanaManifestFile`）。fixture は生成しない。

- `format`: `keyflow-analyzer-layout`（作者の解析ツール Keyflow Analyzer の配列の定義の形に近い）
- `source`: `url`（配信先）・`repository`・`commit`（版を指すコミット）・`license`・`sha`（そのコミットの HTML の sha256）・`lastModified`（HTTP の Last-Modified）・`retrievedAt`（取得日）・`path`・`transform`（何を写し、何を写さないか）
- `definition`: 解析ツールの定義から値を変えずに写した欄
  - `L`・`R`: 左手・右手の格子。`null` は置き場の無い位置。セルは「単打で出す文字」のあとに、空白を挟んでレイヤーで出す入力を書く（`w ~` は単打が `w`、レイヤーが `~`）
  - `customRules`・`aliases`: ローマ字の綴りの拡張

突き合わせの unit test は `src/input/layouts/seoto-source.test.ts`。写しと配列の差（既知の不一致）は、test の中で理由と一緒に持つ。
