import type { SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineCache } from './cache.ts';
import { summarizeEngineTrace } from './pipeline.ts';
import { fromWireInput, fromWireMember, type WireLayoutStore } from './worker-wire.ts';
import type { EngineWorkerRequest, EngineWorkerResponse } from './worker-protocol.ts';

function unregisteredAnalyzerError(definitionId: string): Error {
  return new Error(`未登録のAnalyzerです: ${definitionId}`);
}

/**
 * Worker側が持つAnalyzerの定義（関数を含むのでメッセージでは送れない）。
 * どの定義を載せるかは、Workerの入口を書く`app`が決める（Analyzerの登録はapp）。
 * engineはAnalyzerを名指ししない。
 */
export interface EngineWorkerRegistry {
  // biome-ignore lint/suspicious/noExplicitAny: Analyzerごとに違う型引数を、unknownでは反変の位置で代入できないため消す
  readonly single: readonly SingleAnalyzerDefinition<any, any>[];
  // biome-ignore lint/suspicious/noExplicitAny: 同上
  readonly set: readonly SetAnalyzerDefinition<any, any>[];
}

/**
 * Workerが受け取った1件の依頼を、メインスレッドと同じ`EngineCache`の計算で解いて返す。
 * メッセージの受け取りと送り返しは入口の側に任せ、ここは値から値への関数にしておく
 * （Workerを立てずにNodeのテストから直接呼べる。DOM・`self`に依存しない）。
 */
export function createEngineWorkerHandler(cache: EngineCache, registry: EngineWorkerRegistry): (request: EngineWorkerRequest) => EngineWorkerResponse {
  const single = new Map(registry.single.map((definition) => [definition.id, definition]));
  const set = new Map(registry.set.map((definition) => [definition.id, definition]));
  // 表から作った配列。同じ識別子の依頼には、識別子だけが届く（`worker-wire.ts`）
  const layouts: WireLayoutStore = new Map();

  function solve(request: EngineWorkerRequest): unknown {
    // 表で届いた配列は、依頼が失敗する場合でも先に作る。送り手は、送った配列をWorkerが持つものとして次から識別子だけを送る
    switch (request.kind) {
      case 'trace-summary':
        // Traceは複製せず、打鍵の列を除いた要約だけをメインスレッドへ返す
        return summarizeEngineTrace(cache.getTrace(fromWireInput(request.input, layouts)));
      case 'extraction': {
        const input = fromWireInput(request.input, layouts);
        const definition = single.get(request.definitionId);
        if (definition === undefined) throw unregisteredAnalyzerError(request.definitionId);
        return cache.getExtraction(input, definition, request.options);
      }
      case 'set-extraction': {
        const members = request.members.map((member) => fromWireMember(member, layouts));
        const definition = set.get(request.definitionId);
        if (definition === undefined) throw unregisteredAnalyzerError(request.definitionId);
        return cache.getSetExtraction(members, definition, request.options);
      }
      case 'set-warmup': {
        const member = fromWireMember(request.member, layouts);
        const definition = set.get(request.definitionId);
        if (definition === undefined) throw unregisteredAnalyzerError(request.definitionId);
        cache.warmSetMember(member, definition, request.step);
        return undefined;
      }
      case 'ngram-table':
        return cache.getNgramTable(request.request);
    }
  }

  return (request) => {
    try {
      return { id: request.id, ok: true, value: solve(request) };
    } catch (error) {
      if (error instanceof Error) {
        return error.stack === undefined
          ? { id: request.id, ok: false, message: error.message }
          : { id: request.id, ok: false, message: error.message, stack: error.stack };
      }
      return { id: request.id, ok: false, message: String(error) };
    }
  };
}
