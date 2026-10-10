import { createFileRoute } from '@tanstack/react-router';
import { INPUT_METHOD_PANE_META } from '#analyzers/input-method/pane-meta.ts';
import { inputMethodAnalyzer } from '#analyzers/input-method/definition.tsx';
import { StandaloneSingleAnalyzerApp } from '#app/standalone/StandaloneSingleAnalyzerApp.tsx';

/**
 * 入力方法の単体ページのroute。pathは `/standalone/<Analyzerのid>` で、他の単体ページと揃える。
 * route自体は `createFileRoute` だけの薄いファイルにし、実体は `app` が組み立てる
 * （`hosts/standalone` はTanStack Routerを知らない）。
 */
export const Route = createFileRoute('/standalone/input-method')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${INPUT_METHOD_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '配列やSetupを1つ選んで、配列が持つ修飾、キーを選んで出る文字、コンボの一覧と配列図を見ます。',
      },
    ],
  }),
  component: () => <StandaloneSingleAnalyzerApp analyzer={inputMethodAnalyzer} />,
});
