# ADR-0007: ディレクトリを流れの段で切り、依存を一方向にする

- 番号: ADR-0007
- 日付: 2026-10-06（取り込みの日。決めた日は読めない。READMEの「日付」を参照）
- 状態: 採用

## 背景

決めた当時の議論と理由は、取り込み前の履歴にあり読めない。今の文書が挙げる、純粋な層を守る理由は「結果」の節にある。以下は、`docs/architecture.md` と `test/architecture-layers.test.ts` に書かれている内容に限る。

## 決定

- `src/` のトップは、流れの段の名前で切る。`input` （入力）・`trace`・`interpretation`・`analyzers`・`engine`・`hosts`・`editors`・`tester`・`ui`・`platform`・`app`・`routes` （`docs/architecture.md` 「ディレクトリ」）
- 依存は、`docs/architecture.md` 「依存の規則」の表のとおり一方向にする。要点は次の4つ
  - `input` は何もimportしない。`trace` は `input` まで、`interpretation` は `input`・`trace` まで
  - Analyzer同士はimportしない。個別のAnalyzerから別のAnalyzerへも、契約から個別のAnalyzerへも向かない
  - host同士はimportしない。共有物は `hosts/shared/` に置く
  - `app` と `routes` だけがすべてをimportできる
- **純粋な層**（`input`・`trace`・`interpretation`・`engine`・`analyzers/**/*.ts`・`tester/engine/`）は、React・描画ライブラリ・Router・react-grid-layout・DOM・storage・ブラウザAPIを使わない。`import type` も含めて使わない。純粋さは推移的に守り、純粋なファイルは純粋なファイルしかimportしない
- storageを直接触るのは `platform` と `app` だけ。保存が要る層は、`app` が組み立てたアダプタを注入して使う
- 部品は最初は使う場所に置き、2つ目の使い手が現れた時に `ui` へ下ろす。Analyzer同士で共有したくなったら、`ui` か `interpretation` へ下ろす
- 依存の規則は `test/architecture-layers.test.ts` が検査する。ファイルを列挙せず、パスの前方一致で層を決めるので、層の中にファイルを足せば自動で検査対象になる

## 却下した案

却下した案の記録は読み取れない。

## 結果

- `docs/architecture.md` に、純粋な層を守る理由が3つ書かれている。計算がReactのファイルを1つでもimportするとNodeの `--experimental-strip-types` でテストできなくなる。重い計算をWeb Workerへそのまま移せる。キャッシュが描画のタイミングに縛られない
- 規則に反するが今は直せないimportは、理由付きで `KNOWN_VIOLATIONS` に載せる。解消したら消す。残っているとテストが落ちる。純粋さの違反（ブラウザAPIの使用）には逃げ道を作らない
- `tester` は、`platform` をimportできる当面の例外として表に載っている
