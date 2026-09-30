import type { SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineCache } from './cache.ts';
import type { EngineWorkerRequest, EngineWorkerResponse } from './worker-protocol.ts';

/**
 * Worker側が持つAnalyzerの定義（関数を含むのでメッセージでは送れない）。
 * どの定義を載せるかは、Workerの入口を書く`app`が決める（Analyzerの登録はapp）。
 * engineはAnalyzerを名指ししない。
 */
export interface EngineWorkerRegistry {
  readonly single: readonly SingleAnalyzerDefinition<any, any>[];
  readonly set: readonly SetAnalyzerDefinition<any, any>[];
}

/**
 * Workerが受け取った1件の依頼を、メインスレッドと同じ`EngineCache`の計算で解いて返す。
 * メッセージの受け取りと送り返しは入口の側に任せ、ここは値から値への関数にしておく
 * （Workerを立てずにNodeのテストから直接呼べる。DOM・`self`に依存しない）。
 */
export function createEngineWorkerHandler(
  cache: EngineCache,
  registry: EngineWorkerRegistry,
): (request: EngineWorkerRequest) => EngineWorkerResponse {
  const single = new Map(registry.single.map((definition) => [definition.id, definition]));
  const set = new Map(registry.set.map((definition) => [definition.id, definition]));

  function solve(request: EngineWorkerRequest): unknown {
    switch (request.kind) {
      case 'trace':
        return cache.getTrace(request.input);
      case 'extraction': {
        const definition = single.get(request.definitionId);
        if (definition === undefined) throw new Error(`未登録のAnalyzerです: ${request.definitionId}`);
        return cache.getExtraction(request.input, definition, request.options);
      }
      case 'set-extraction': {
        const definition = set.get(request.definitionId);
        if (definition === undefined) throw new Error(`未登録のAnalyzerです: ${request.definitionId}`);
        return cache.getSetExtraction(request.members, definition, request.options);
      }
    }
  }

  return (request) => {
    try {
      return { id: request.id, ok: true, value: solve(request) };
    } catch (error) {
      if (error instanceof Error) return { id: request.id, ok: false, message: error.message, stack: error.stack };
      return { id: request.id, ok: false, message: String(error) };
    }
  };
}
