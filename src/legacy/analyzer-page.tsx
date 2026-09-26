import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { mountAnalyzerRuntime } from './main.ts';

interface RetainedAnalyzerRuntime {
  dispose: () => void;
  releasePending: boolean;
}

let retainedRuntime: RetainedAnalyzerRuntime | undefined;

/**
 * React Strict Effectsの setup -> cleanup -> setup では同じruntimeを再利用する。
 * 本当のroute離脱だけmicrotask終端でdisposeし、nested React rootの二重mountを防ぐ。
 */
function acquireAnalyzerRuntime(): () => void {
  const runtime = retainedRuntime ?? {
    dispose: mountAnalyzerRuntime(),
    releasePending: false,
  };
  retainedRuntime = runtime;
  runtime.releasePending = false;

  return () => {
    runtime.releasePending = true;
    queueMicrotask(() => {
      if (!runtime.releasePending || retainedRuntime !== runtime) return;
      retainedRuntime = undefined;
      runtime.dispose();
    });
  };
}

function InfoButton({ tip }: { tip: string }) {
  return (
    <button
      type="button"
      className="info"
      data-tip={tip}
      aria-label={tip}
    >
      i
    </button>
  );
}

export function AnalyzerPage() {
  useEffect(() => acquireAnalyzerRuntime(), []);

  return (
    <div className="analyzer-feature">
      <header className="topbar">
        <h1><Link className="topbar-home" to="/">keydist</Link></h1>
        <p className="lede">
          論理配列を打った時の指の総移動距離で評価する
          <span id="analyzer-dialog-actions" />
        </p>
        <div className="spacer" />
        <div id="analyzer-theme-controls" className="theme-toggle-slot" />
      </header>

      <div className="app" id="app">
        <aside className="sidebar">
          <div className="panel">
            <h2>入力</h2>
            <div id="analyzer-mode-control" />
            <div id="analyzer-sidebar-controls" />
          </div>

          <div id="analyzer-geometry-panel" />
          <div id="analyzer-add-panel" />
        </aside>

        <div className="stack">
          <div id="analyzer-text-panel" />

          <section className="panel">
            <h2>配列の詳細</h2>
            <p className="note metric-conditions" id="detail-conditions" />
            <div id="playback" />
            <div className="fig-fixed" id="heatmap" />

            <div className="split">
              <div>
                <h3>
                  指ごとの移動距離 [u]
                  <InfoButton tip="文章を打ち切るまでに各指が動いた距離。短い経路を選んだ場合はその分短縮される。" />
                </h3>
                <div id="finger-chart" />
                <p className="note">親指の距離は常に0なので省く。押下数は図にかざすと出る。</p>
              </div>
              <div>
                <h3>
                  指間距離の標準偏差 [u]
                  <InfoButton tip="指間距離のばらつき。平均が同じでも、常に一定の開き方をするか打鍵ごとに変わるかで差が出る。" />
                </h3>
                <div id="adjacent-chart" />
              </div>
            </div>

            <div id="analyzer-bigram-flow" />
          </section>

          <section className="panel compare-panel">
            <h2>
              総移動距離
              <InfoButton tip="全指の移動距離の合計。ホームポジションからどれだけ移動したかの指標。" />
            </h2>
            <div id="analyzer-comparison-controls" />
            <div id="compare-chart" />
            <div className="scroll-x">
              <table id="compare" />
            </div>
            <p className="note">
              総移動距離は小さい候補を採った下界。実際の運指はこれ以上になる。
            </p>
          </section>

          <section className="panel">
            <h2>配列 × 指のマトリックス</h2>
            <div className="split-wrap">
              <div>
                <h3>
                  指ごとの押下数 [押下/文字]
                  <InfoButton tip="1文字を出力するのに必要な打鍵数。同時押しは押した数だけ数える。" />
                </h3>
                <div className="fig-fixed" id="press-matrix" />
              </div>
              <div>
                <h3>
                  指ごとの移動距離 [u/文字]
                  <InfoButton tip="各指が動いた距離を入力文字数で割った値。1文字を出力するのに必要な指の平均移動距離。" />
                </h3>
                <div className="fig-fixed" id="finger-matrix" />
              </div>
              <div>
                <h3>
                  指間距離の平均 [u]
                  <InfoButton tip="隣り合う2本の指の距離を全打鍵で平均し、両方がホームにある時の距離を引いた値。両指ともホームから一度も動かなければ0。平均的な指同士の間隔。" />
                </h3>
                <div className="fig-fixed" id="adjacent-mean-matrix" />
              </div>
              <div>
                <h3>
                  指間距離の標準偏差 [u]
                  <InfoButton tip="指間距離のばらつき。平均が同じでも、常に一定の開き方をするか打鍵ごとに変わるかで差が出る。" />
                </h3>
                <div className="fig-fixed" id="adjacent-stddev-matrix" />
              </div>
            </div>
            <p className="note">
              距離と押下数は文字数で割った値。色は図ごとの強弱を示す。
              <br />
              隣接指の間隔はホーム時を0として測る。ばらつきは打鍵中の間隔の変動。
            </p>
          </section>

          <div id="analyzer-sensitivity-panel" />
        </div>

        <aside
          id="playback-settings-panel"
          className="playback-settings-aside"
          aria-label="打鍵再生設定"
          aria-hidden="true"
          inert
        />
      </div>

      <dialog id="how-dialog" />
      <dialog id="conditions-dialog" />
      <dialog id="geometry-dialog" />
      <dialog id="romaji-dialog" />
      <dialog id="playback-calibration-dialog" />

      <div id="analyzer-react-shell" hidden />
      <div className="tooltip" id="tooltip" hidden />
      <footer>
        <a href="https://github.com/tokiokashi/keydist">GitHub</a>
      </footer>
    </div>
  );
}
