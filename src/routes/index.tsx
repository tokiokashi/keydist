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
        既存の配列分析と、これから追加する実入力機能を
        TanStack Start 上で別々の feature として育てる。
      </p>
      <div className="route-grid">
        <Link className="route-card" to="/analyzer">
          <strong>Analyzer</strong>
          <span>既存の解析UIを開く</span>
        </Link>
        <Link className="route-card" to="/input">
          <strong>Input</strong>
          <span>Input Converter の新しい実装境界</span>
        </Link>
        <Link className="route-card" to="/flow">
          <strong>Bigram Flow</strong>
          <span>打鍵方向とロール傾向をベクトルで探索</span>
        </Link>
      </div>
    </section>
  );
}
