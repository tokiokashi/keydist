import { createEngineCache } from '#engine/cache.ts';
import { createEngineWorkerHandler } from '#engine/worker-handler.ts';
import type { EngineWorkerRequest, EngineWorkerResponse } from '#engine/worker-protocol.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { fingerDistanceDefinition } from '#analyzers/finger-distance/extract.ts';
import { heatmapIntegratedDefinition } from '#analyzers/heatmap-integrated/extract.ts';
import { heatmapLayersDefinition } from '#analyzers/heatmap-layers/extract.ts';
import { inputMethodDefinition } from '#analyzers/input-method/extract.ts';
import { layerComboPressesDefinition } from '#analyzers/layer-combo-presses/extract.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { fingerMatrixDefinition } from '#analyzers/finger-matrix/extract.ts';
import { nSensitivityDefinition } from '#analyzers/n-sensitivity/extract.ts';

/**
 * 計算用Workerの入口（Vite が別チャンクとして切り出す。`engine-computer.ts`が起動する）。
 *
 * ここで載せる定義が、Workerで計算できるAnalyzerの一覧になる。単体ページのAnalyzerを
 * 足す時は、ここにも足す（足さないと「未登録のAnalyzer」として失敗する）。
 * 描画側（`definition.tsx`）はReactを引き込むので読み込まず、抽出だけの`extract.ts`を使う。
 */
const handle = createEngineWorkerHandler(createEngineCache(), {
  single: [bigramFlowDefinition, fingerDistanceDefinition, heatmapIntegratedDefinition, heatmapLayersDefinition, layerComboPressesDefinition, inputMethodDefinition],
  set: [comparisonDefinition, fingerMatrixDefinition, nSensitivityDefinition],
});

// このファイルはWorkerとして動く。DOMの型のままだと`self`が`Window`になるので、使う分だけ型を当てる。
const scope = self as unknown as {
  onmessage: ((event: { readonly data: EngineWorkerRequest }) => void) | null;
  postMessage(message: EngineWorkerResponse): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handle(event.data));
};
