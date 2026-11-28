# ADR-0028: 表から配列を作る処理は、途中で画面のスレッドへ処理を返しながら進める

- 番号: ADR-0028
- 日付: 2026-11-28
- 状態: 採用

## 背景

ADR-0024の後も、雪華を選ぶと、画面のスレッドで長いタスクが残った。CPUを4倍に絞ると、ビルド済みのページで最長のタスクが約2.4秒になる。
開発サーバーのプロファイルで、表から配列を作る処理（`seccaLayout`）が約1010ms、評価の見出しの表を作る `evaluationCanonicalInputs` が約630ms、使う物理キーを集める `physicalKeysUsedByLayout` が約190msだった。項目は重なる。

- 表から配列を作る処理の大半は、約2.7万字の打鍵列を1つずつ打ち方の候補にする処理と、見出しの衝突の検証である。1つずつは軽いが、続けて走るので1つの長いタスクになる
- `evaluationCanonicalInputs` は、全角形の記号を含む見出しが1つでもある配列で、見出しごとに打ち方の識別子（JSONの文字列）を作って重複を確かめていた。雪華は見出しの大半が打ち方を1つしか持たないので、識別子は要らない
- `physicalKeysUsedByLayout` は、呼ぶたびに全見出しをたどり、結果を覚えていなかった

## 決定

- 表から配列を作る処理を、`yield` で途中の区切りを示すジェネレータとして書ける形にする。`KanjiDirectDeclaration.layoutStepsFromTable` を持つ宣言（雪華）は、`requestKanjiDirectLayout` が一定の時間ごとに画面のスレッドへ処理を返しながら進める（`src/input/layouts/kanji-direct-tables.ts`）。`layoutFromTable` は、同じジェネレータを返さずに最後まで進めた結果にする。できる配列は変わらない
- `withSequenceInputs`・`validateCanonicalInputMap`・`physicalKeysUsedByLayout` は、`...Steps` のジェネレータと、それを最後まで進める元の関数に分ける。区切りは512項目ごとにする
- 配列を作った後に、使う物理キーの集合を先に求めて、配列の `canonicalInputs` ごとに覚える。配列を使う最初の処理が、集合を求めるために止まらない
- `evaluationCanonicalInputs` は、1つの見出しに打ち方が2つ以上になった時だけ識別子を作る。全角形の記号を含まない見出しは、別名を当てる処理を通さない

## 却下した案

- 表から配列を作る処理を、Workerで行って画面のスレッドへ返す。配列は数十MBあり、画面のスレッドへの構造化複製がかかる。ADR-0024が、配列を送る案を同じ理由で却下している
- 作る処理だけを速くして、区切りを入れない。Nodeで測った作る処理は約500〜700msで、ほぼ半分がGCである。CPUを絞った端末で数百msの長いタスクが残る
- 全部の `layoutFromTable` を非同期にする。T-CodeとTUT-Codeは作る処理が小さく、非同期にすると、同期で作る呼び出し（Worker・検査・テスト）が増やす型の手間に見合わない。`layoutStepsFromTable` は宣言が任意で持つ

## 結果

- 途中で処理を返しながら作った配列が、一度に作った配列と一致する事は `src/input/layouts/secca.test.ts` が確かめる
- 区切りの間隔は、`requestKanjiDirectLayout` が持つ時間の上限（16ms）で決まる。上限を超えたタスクは、画面を描き直す処理（React）の側に残る
