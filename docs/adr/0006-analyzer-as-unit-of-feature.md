# ADR-0006: 機能の単位をAnalyzerと呼ぶ

- 番号: ADR-0006
- 日付: 2026-10-06（このリポジトリの最初のコミットの日。旧リポジトリから履歴を持たずに取り込んだため、決めた日は読めない）。旧画面の削除は2026-10-16（issue #29、コミット `6833d745`）
- 状態: 採用

## 背景

指標・図・設定が機能ごとにばらばらに足されると、個別画面とWorkspaceで同じ機能を同じcomponentで載せられない。
機能を1つの単位で数え、載せる器（host）から切り離す必要があった。

決めた当時の議論は、取り込み前の履歴にあり読めない。以下は、コード・`docs/architecture.md` に書かれている内容に限る。

## 決定

- **Analyzer** を機能の単位とする。中身は、抽出 + 可視化 + 解析設定（`docs/architecture.md` の用語「Analyzer」）
  - 抽出は、Trace（と解釈の結果）からAnalyzerが使うデータを取り出す純関数
  - 可視化は、抽出したデータを表示するcomponent
  - 解析設定は、どの数値を・どの切り口で・どう見せるか
- 対象の数でAnalyzerを2つに分ける。1つの対象を見るSingleと、対象の集合を見るMulti。契約の型は `SingleAnalyzerDefinition` と `SetAnalyzerDefinition` の合併で、1つの型に両方の形を詰め込まない（`src/analyzers/contract.ts`）
- Analyzerは、ペインの中身だけを渡す。見出し・説明・解析設定のパネルをどこに出すかはhostが決める。個別画面は、ペインが1枚だけのWorkspaceと同じ形にする（`docs/architecture.md`「画面の構成」「Analyzerがペインに渡すもの」）
- Analyzerの結び付けは各Analyzerの `definition.tsx` に置き、名前と短い説明はReactに依存しない `pane-meta.ts` に置く
- 「View」「`AnalysisSession` / `AnalysisSnapshot`」は使わない語とする

## 却下した案

- Analyzerが見出し・説明・解析設定のパネルを自前で描く案は、却下の理由が書かれている。ペインの見出しと二重になり、狭いペインでは図に届く前に設定で埋まる（`docs/architecture.md`「Analyzerがペインに渡すもの」）
- 「View」「`AnalysisSession` / `AnalysisSnapshot`」を使う案は、使わない語として退けられている。理由は書かれていない
- 旧Analyzer画面（`/analyzer`・`/analyzer/flow`）と移行中の `src/features/analyzer-next/` は、2026-10-16にコードごと削除した（issue #29）。旧URLの転送は作らず、旧画面で作った資産も移さなかった。理由は、`AGENTS.md`「実験場としての開発方針」の、保存データの互換を守らない方針

## 結果

- 同じAnalyzerを、個別画面にもWorkspaceにも同じcomponentで載せられる
- 新しいAnalyzerは、Worker側の入口（`app/standalone/engine-worker.ts`）にも足す必要がある（ADR-0009）
- Analyzer同士は互いをimportできない。共有物は、`analyzers/` 直下か、uiかinterpretationへ下ろす（ADR-0007）
