import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/input')({
  component: InputRoute,
});

function InputRoute() {
  return (
    <section className="feature-shell">
      <p className="eyebrow">Phase B · #270</p>
      <h1>Input Converter</h1>
      <p>
        このrouteを、物理キー入力を SemanticInput / realization core へ接続する
        最初の純React vertical sliceとして使う。
      </p>
      <div className="feature-placeholder" role="status">
        browser adapter と実入力UIは #270 で実装する。
      </div>
    </section>
  );
}
