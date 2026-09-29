import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  ConditionSample,
  SettingsSample,
  ShapeChipSample,
  ShareSample,
  TextChipSample,
  UndoRedoSample,
} from '#hosts/shared/usage-samples.tsx';

export const Route = createFileRoute('/')({
  component: Home,
});

function UsageCard({ title, samples, children }: { readonly title: string; readonly samples?: ReactNode; readonly children: ReactNode }) {
  return (
    <section className="usage-card">
      <div className="usage-card-head">
        <h3>{title}</h3>
        {samples === undefined ? null : <div className="usage-samples">{samples}</div>}
      </div>
      {children}
    </section>
  );
}

function Home() {
  return (
    <section className="hero">
      <p className="eyebrow">keyboard layout laboratory</p>
      <h1>keydist</h1>
      <p>
        キーボードの配列を、文章を打った時に指がどれだけ動くかで調べるツールです。配列の良し悪しを決めるのではなく、性質を数値で眺めるために使います。
      </p>
      {/*
        トップは使い方のページ（docs/architecture.md「画面の構成」）。画面への入口はサイドバーが持つので、
        ここでメニューを繰り返さない。書くのは、画面を見ても触っても分からないことだけ。
        各項目には説明している部品の見本を添える（実物と同じ部品・CSSで描くので、テーマの明暗にも追従する）。
        Analyzerの説明は pane-meta と重なるが、トップでは使い方の文脈に合わせた文を優先して別に持つ。
      */}
      <h2 className="usage-title">使い方</h2>
      <div className="usage-grid">
        <UsageCard title="画面">
          <p>
            <Link to="/standalone/bigram-flow">Bigram Flow</Link>は、続けて打つ2打鍵で指がキーボードの上をどう動くかを見ます。
            <Link to="/standalone/comparison">比較表</Link>は、選んだ配列で同じテキストを打った時の数値を並べます。
            <Link to="/standalone/n-sensitivity">N感度</Link>は、先読みの数 N を変えた時に総移動距離がどう変わるかを配列ごとに描きます。
          </p>
        </UsageCard>

        <UsageCard title="選択" samples={<><ShapeChipSample /><TextChipSample /></>}>
          <p>
            画面上部で選ぶ物理配列とテキストは、すべての画面で共通です。
            <br />
            組み込みのサンプルを書き換えると、自分のテキストとして別に保存します。元のサンプルはそのまま残ります。
            <br />
            比較表と N感度は、選んだ配列の組を共有します。
          </p>
        </UsageCard>

        <UsageCard title="元に戻す" samples={<UndoRedoSample />}>
          <p>
            テキスト・選んだ配列・物理配列・解析設定の変更を、元に戻したりやり直したりできます。テキストの削除も戻せるので、削除の前に確認は出しません。
          </p>
        </UsageCard>

        <UsageCard title="共有" samples={<><ShareSample /><SettingsSample /></>}>
          <p>
            今の画面の URL をコピーします。解析設定を含むので、受け取った人も同じ表示の設定で開けます。
            <br />
            配列とテキストは含まないので、受け取った人の側で選んでいるもので表示されます。
          </p>
        </UsageCard>

        <UsageCard title="条件の要約" samples={<ConditionSample />}>
          <p>
            各画面の見出しの下で、数値がどの条件で出たかを確かめられます。開くと、各条件の値と、その値がどこで決まったかを見られます。
          </p>
        </UsageCard>
      </div>
      {/*
        観測値の注記はトップにだけ置く（docs/architecture.md「画面の構成」）。
        各ペイン・各Analyzerには出さない。
      */}
      <p className="hero-note">数値は観測値であり、配列の優劣を判定するスコアではない。</p>
      <p className="hero-legacy">
        <Link to="/analyzer">これまでの Analyzer</Link>
      </p>
    </section>
  );
}
