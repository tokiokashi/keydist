import { createFileRoute } from '@tanstack/react-router';
import { CONTROL_TEXTS_PANE_META } from '#analyzers/control-texts/pane-meta.ts';
import { controlTextsAnalyzer } from '#analyzers/control-texts/definition.tsx';
import { StandaloneSetAnalyzerApp } from '#app/standalone/StandaloneSetAnalyzerApp.tsx';

/**
 * 対照テキストとの比較の単体ページのroute。`analyzer.bunsetsu-stats.tsx`と同じ形
 * （route自体は`createFileRoute`だけの薄いファイルにする。AGENTS.md）。
 */
export const Route = createFileRoute('/analyzer/control-texts')({
  staticData: { contextBar: true },
  head: () => ({
    meta: [
      { title: `${CONTROL_TEXTS_PANE_META.name} | keydist` },
      {
        name: 'description',
        content: '評価に渡したテキストと、そこから作った対照テキストを、同じ配列・同じ条件で測った値を配列やSetupごとに並べます。',
      },
    ],
  }),
  component: () => <StandaloneSetAnalyzerApp analyzer={controlTextsAnalyzer} />,
});
