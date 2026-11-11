# ADR-0005: modeを廃止し、打ち方をテキストの言語と配列の種類から導く

- 番号: ADR-0005
- 日付: 2026-10-06（取り込みの日。決めた日は読めない。READMEの「日付」を参照）
- 状態: 採用

## 背景

コードのコメントに、画面のモード（`ModeId`）への言及が残る（`src/input/text/samples.ts`）。以前は画面にモードがあり、今は無い。
決めた当時の議論と、モードを廃止した理由は、取り込み前の履歴にあり読めない。以下は、コード・`docs/architecture.md` に書かれている内容に限る。

## 決定

- mode（en / ja）という語と持ち物を使わない。`docs/architecture.md` の「使わない語」に挙げている
- テキストが言語（`en` / `ja`）を属性に持つ（`src/input/text/samples.ts`）
- **打ち方**（`kana-direct` / `romaji` / `direct`）は、テキストの言語 × 配列の種類（`kana` / `alpha`）から導く。利用者が選ぶ値にしない（`src/input/setup/input-method.ts` の `deriveInputMethod`、`src/input/settings/levels.ts`）

| 配列の種類 | 日本語のテキスト | 英語のテキスト |
|---|---|---|
| かな配列 | かな直接（`kana-direct`） | 不成立（`text-language-mismatch`） |
| 英字配列 | ローマ字（`romaji`） | 直接（`direct`） |

- 不成立の組（かな配列と英語のテキスト）は例外にしない。そのSetupを「このテキストには使えない」と表示する
- Setupは打ち方を持たない。Setupがどのテキストに使えるかは、導出が決める（`src/input/setup/types.ts`）
- 打ち方は、カスケードのレベルの1つ（物理配列と配列の間）として残る。条件を打ち方ごとに上書きできる（ADR-0003）

## 却下した案

- modeを持ち続ける案: 却下の記録は読み取れない。`docs/architecture.md` の「使わない語」に、mode（en / ja）が挙がっている。理由は書かれていない。mode廃止とWorker導入に紐づくissueとPRは見つからなかった
- Setupに打ち方を持たせる案は、`src/input/setup/types.ts` のコメントが理由を挙げている。配列の実体だけでは打ち方が決まらない（`qwerty` 等は英語の直接入力とローマ字の両方で同じidを使う）。配列の `romajiTable` の有無は、ローマ字が選択肢になりうることしか表さない

## 結果

- 英語のテキストにかな配列を渡した時だけ、導出が不成立になる。他の3通りは、必ず打ち方が決まる
- ローマ字を経ない打ち方では、`romajiOnly` のコンボを配列ごと外す（`spec/distance-model.md` §4.3）
