import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <section className="hero">
      <p className="eyebrow">keyboard layout laboratory</p>
      <h1>keydist</h1>
      <p>
        キーボードの配列を、文章を打った時に指がどれだけ動くかで調べるツールです。配列の良し悪しを決めるのではなく、性質を数値で眺めるために使います。
      </p>
      {/* トップは入口だけ。個々のAnalyzerへの導線はシェルのサイドバーが持つ（docs/architecture.md「画面の構成」） */}
      <div className="route-grid">
        <Link className="route-card" to="/analyzer">
          <strong>Analyzer</strong>
          <span>配列とテキストを選び、指の移動距離などの数値と打鍵の再生を見る</span>
        </Link>
        <Link className="route-card" to="/input">
          <strong>Tester</strong>
          <span>配列を選び、手元のキーボードで実際に打って試す</span>
        </Link>
        {/* 旧版は別ビルドとして同梱されるのでルーターの外。dev サーバーでは 404 になる */}
        <a className="route-card" href={`${import.meta.env.BASE_URL}classic/`}>
          <strong>旧版</strong>
          <span>以前の画面をそのまま開く</span>
        </a>
      </div>
    </section>
  );
}
