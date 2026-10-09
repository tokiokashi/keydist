import { createFileRoute } from '@tanstack/react-router';
import { LAYER_COMBO_PANE_META } from '#analyzers/layer-combo/pane-meta.ts';
import { layerComboAnalyzer } from '#analyzers/layer-combo/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * レイヤーとコンボの単体ページのroute。pathは `/standalone/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/layer-combo')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${LAYER_COMBO_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、押下が帰属したレイヤーとコンボの内訳と、配列が持つ修飾・コンボを見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={layerComboAnalyzer} />,
});
