import { createFileRoute } from '@tanstack/react-router';
import { LAYER_COMBO_PRESSES_PANE_META } from '#analyzers/layer-combo-presses/pane-meta.ts';
import { layerComboPressesAnalyzer } from '#analyzers/layer-combo-presses/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * レイヤーとコンボの押下数の単体ページのroute。pathは `/standalone/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/layer-combo-presses')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${LAYER_COMBO_PRESSES_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、同じテキストを打った時の押下数を、レイヤーとコンボごとに表で見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={layerComboPressesAnalyzer} />,
});
