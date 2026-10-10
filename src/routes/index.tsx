import { Link, createFileRoute } from '@tanstack/react-router';
import { BIGRAM_FLOW_PANE_META } from '#analyzers/bigram-flow/pane-meta.ts';
import { FINGER_DISTANCE_PANE_META } from '#analyzers/finger-distance/pane-meta.ts';
import { HEATMAP_INTEGRATED_PANE_META } from '#analyzers/heatmap-integrated/pane-meta.ts';
import { HEATMAP_LAYERS_PANE_META } from '#analyzers/heatmap-layers/pane-meta.ts';
import { LAYER_COMBO_PANE_META } from '#analyzers/layer-combo/pane-meta.ts';
import { COMPARISON_PANE_META } from '#analyzers/comparison/pane-meta.ts';
import { FINGER_MATRIX_PANE_META } from '#analyzers/finger-matrix/pane-meta.ts';
import { N_SENSITIVITY_PANE_META } from '#analyzers/n-sensitivity/pane-meta.ts';
import { LEGACY_ANALYZER_LABEL, WORKSPACE_EMPTY_TEXT } from '../app/shell/Sidebar.tsx';
import { TopTargetPick } from '../app/top/TopTargetPick.tsx';
import { useCreateSampleWorkspace } from '../app/workspace/use-create-sample-workspace.ts';

export const Route = createFileRoute('/')({
  component: Home,
});

/**
 * サイドバーの Analyze / Workspace の区分の見本。見出しと名前は実物と同じ定義から取り、
 * 名前は各画面へのリンクにする。見た目はサイドバーの部品のCSSをそのまま使う。
 */
function SidebarSample() {
  return (
    <div className="top-sample" role="group" aria-label="サイドバーの見本">
      <section className="sidebar-group">
        <p className="sidebar-heading">Analyze</p>
        <p className="sidebar-subheading">Single</p>
        <Link className="sidebar-link" to="/standalone/bigram-flow">{BIGRAM_FLOW_PANE_META.name}</Link>
        <Link className="sidebar-link" to="/standalone/finger-distance">{FINGER_DISTANCE_PANE_META.name}</Link>
        <Link className="sidebar-link" to="/standalone/heatmap-integrated">{HEATMAP_INTEGRATED_PANE_META.name}</Link>
        <Link className="sidebar-link" to="/standalone/heatmap-layers">{HEATMAP_LAYERS_PANE_META.name}</Link>
        <Link className="sidebar-link" to="/standalone/layer-combo">{LAYER_COMBO_PANE_META.name}</Link>
        <p className="sidebar-subheading">Multi</p>
        <Link className="sidebar-link" to="/standalone/comparison">{COMPARISON_PANE_META.name}</Link>
        <Link className="sidebar-link" to="/standalone/finger-matrix">{FINGER_MATRIX_PANE_META.name}</Link>
        <Link className="sidebar-link" to="/standalone/n-sensitivity">{N_SENSITIVITY_PANE_META.name}</Link>
      </section>
      <section className="sidebar-group">
        <p className="sidebar-heading">Workspace</p>
        <p className="sidebar-empty">{WORKSPACE_EMPTY_TEXT}</p>
      </section>
    </div>
  );
}

function Home() {
  const createSample = useCreateSampleWorkspace();
  return (
    <section className="hero">
      <p className="eyebrow">keyboard layout laboratory</p>
      <h1>keydist</h1>
      <p>
        キーボードの配列を、文章を打った時に押すキーから調べるツールです。配列の良し悪しを決めるのではなく、性質を数値で眺めるために使います。
      </p>
      {/*
        トップは道具の全体像を説明するページ（docs/architecture.md「画面の構成」）。
        サイドバーの Analyze / Workspace の見本（スマホ幅だけ）を描き、その下に縦1列で4点（Analyzer・Single と Multi・始め方・Workspace）を説明する。
        操作の細部（元に戻す・共有など）は書かない。
      */}
      <div className="top-guide">
        <SidebarSample />
        <ol className="top-points">
          <li>
            <h2>Analyzer</h2>
            <p>配列でテキストを打った時に押すキーについて、特定の切り口で情報を見せる画面です。</p>
          </li>
          <li>
            <h2>Single と Multi</h2>
            <p>Single は1つの配列について、Multi は複数の配列を選んで、情報を比較します。</p>
          </li>
          <li>
            <h2>始め方</h2>
            <p>気になる配列を1つ選んでください。続けて見たい Analyzer を開きます。</p>
            <TopTargetPick />
            <p className="top-note">※テキスト・物理配列・条件は、Analyzer を移っても引き継がれます。</p>
          </li>
          <li>
            <h2>Workspace</h2>
            <p>複数の Analyzer を並べて見る画面です。サイドバーの「＋ 新しいWorkspace」から作ります。中身の入ったサンプルから始めることもできます。</p>
            <button type="button" className="top-sample-workspace" onClick={createSample}>サンプルのWorkspaceを作る</button>
          </li>
        </ol>
      </div>
      {/*
        観測値の注記はトップにだけ置く（docs/architecture.md「画面の構成」）。
        各ペイン・各Analyzerには出さない。
      */}
      <p className="hero-note">数値は観測値であり、配列の優劣を判定するスコアではありません。</p>
      <p className="hero-legacy">
        <Link to="/analyzer">{LEGACY_ANALYZER_LABEL}</Link>
      </p>
    </section>
  );
}
