import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { BIGRAM_FLOW_PANE_META } from '#analyzers/bigram-flow/pane-meta.ts';
import { FINGER_DISTANCE_PANE_META } from '#analyzers/finger-distance/pane-meta.ts';
import { HEATMAP_INTEGRATED_PANE_META } from '#analyzers/heatmap-integrated/pane-meta.ts';
import { HEATMAP_LAYERS_PANE_META } from '#analyzers/heatmap-layers/pane-meta.ts';
import { INPUT_METHOD_PANE_META } from '#analyzers/input-method/pane-meta.ts';
import { LAYER_COMBO_PRESSES_PANE_META } from '#analyzers/layer-combo-presses/pane-meta.ts';
import { COMPARISON_PANE_META } from '#analyzers/comparison/pane-meta.ts';
import { FINGER_MATRIX_PANE_META } from '#analyzers/finger-matrix/pane-meta.ts';
import { N_SENSITIVITY_PANE_META } from '#analyzers/n-sensitivity/pane-meta.ts';
import { setTargetForSingleAndMultiCommand } from '#engine/commands.ts';
import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import { setupNumbersOf, targetChoiceGroups, TargetSelection } from '#hosts/shared/index.ts';
import { targetNameSource } from '#hosts/shared/target-name-source.ts';
import { resolvePaneInput } from '#hosts/shared/resolve-pane-input.ts';
import { nameTargets } from '#input/setup/index.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';

/**
 * トップで気になる配列を1つ選ぶ部品。選んだ配列は Single の対象になり、Multi の組にも入る
 * （`setTargetForSingleAndMultiCommand`）。
 *
 * 選ぶ部品は各画面の見出しと同じ`TargetSelection`（単一選択）。資産の読み書きも各画面と同じ
 * `useKeydistAssets`を通すので、他のタブへの反映は同じ形で乗る。履歴は画面ごとに持ち、
 * トップには元に戻す操作が無いので、画面からこの書き込みを戻す手段は無い（選び直す）。
 * 資産にはこの部品が書き込むまで Single の対象が無い。無い間は各画面と同じく既定の配列を
 * 選択中として見せ、Analyzerへのリンクは「選んだ後」にだけ出す。
 */
export function TopTargetPick() {
  const { assets, ready, dispatch } = useKeydistAssets();
  const catalog = useMemo(() => paneCatalog(assets), [assets.userLayouts, assets.userRomajiRules]);
  const setups = assets.setupLibrary.setups;
  const target = effectiveSingleTarget(assets.singleTargetSelection);

  // 名前は各画面の見出しと同じ手順で作る（解決した入力を渡す）。解決結果が無いとSetupの名前だけが
  // 「配列/物理配列」の形になり、見出しの名前（集合が1件なら名前だけ）と食い違う。
  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );
  const named = useMemo(() => {
    const setupsById = new Map(setups.map((setup) => [setup.id, setup] as const));
    const resolution = resolvePaneInput(target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText);
    return nameTargets([targetNameSource(target, resolution, setupsById, setupNumbersOf(setups), catalog.setupCatalog)])[0];
  }, [target, setups, catalog, assets.setupLibrary.overrides, resolvedText]);

  const groups = useMemo(() => targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups,
    selected: [target],
  }), [catalog, setups, target]);

  const picked = assets.singleTargetSelection.target !== undefined;

  return (
    <div className="top-pick">
      {/* 読み込み前は操作を受け付けない（プリレンダーのHTMLへの操作が消えないように。各画面と同じ） */}
      <fieldset disabled={!ready} className="top-pick-field">
        <TargetSelection
          mode="single"
          groups={groups}
          selected={[target]}
          summary={named === undefined ? [] : [{ key: named.key, label: named.displayName, fullName: named.fullName }]}
          onChange={(next) => {
            if (next[0] !== undefined) dispatch(setTargetForSingleAndMultiCommand(next[0]));
          }}
        />
      </fieldset>
      {picked ? (
        <p className="top-pick-links">
          <Link className="top-pick-link" to="/standalone/bigram-flow">{BIGRAM_FLOW_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/finger-distance">{FINGER_DISTANCE_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/heatmap-integrated">{HEATMAP_INTEGRATED_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/heatmap-layers">{HEATMAP_LAYERS_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/layer-combo-presses">{LAYER_COMBO_PRESSES_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/input-method">{INPUT_METHOD_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/comparison">{COMPARISON_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/finger-matrix">{FINGER_MATRIX_PANE_META.name}</Link>
          <Link className="top-pick-link" to="/standalone/n-sensitivity">{N_SENSITIVITY_PANE_META.name}</Link>
        </p>
      ) : null}
    </div>
  );
}
