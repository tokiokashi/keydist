import type { AnalysisTarget } from '#input/setup/index.ts';
import type { ResolvedInput, ResolvedInputError, ResolvedInputResult } from './resolved-input.ts';
import { microtaskScheduler, type EngineScheduler } from './scheduler.ts';

/**
 * engineの非同期API（#544 §8-1）。
 *
 * 呼び出し側（将来のペイン）は`createEngineRequest`で購読を1つ作り、`request()`で
 * 「この解決済み入力の結果が欲しい」と依頼するたびに古い依頼を打ち切る。計算そのものは
 * `EngineCache`（同期・キー共有・LRU）へそのまま委ねるので、ここで新しく計算やキャッシュを
 * 持たない。誰も`createEngineRequest`を呼ばず`request()`も呼ばれないキーは、
 * `EngineCache`側の計算も一切走らない。
 */

/** 依頼の失敗。解決済み入力そのものの失敗と、計算中の例外を区別する。 */
export type EngineRequestError =
  | { readonly kind: 'resolution'; readonly error: ResolvedInputError }
  | { readonly kind: 'exception'; readonly error: unknown };

/**
 * ペイン1つが持つ計算状態（#544 §8-1「計算中 / 古い結果を表示中 / 失敗」）。
 *
 * - `idle`: まだ一度も依頼していない
 * - `computing`: 依頼した。表示できる前の結果がまだ無い
 * - `stale`: 新しい依頼を出して計算中だが、直前の`ready`の値を保持して一緒に返す
 *   （切り替え時にちらつかせないため）
 * - `ready`: 直近の依頼どおりの値が計算できた
 * - `failed`: 解決済み入力自体が失敗していたか、計算が例外を投げた
 */
export type EngineRequestState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'computing' }
  | { readonly status: 'stale'; readonly value: T }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'failed'; readonly error: EngineRequestError };

/**
 * 計算の戻り値。同期に値を返す実装（メインスレッドの`EngineCache`）と、Worker越しに
 * Promiseを返す実装（`worker-client.ts`）を同じ窓口で扱う。同期の値は従来どおり
 * scheduleしたタスクの中で即座に`ready`になる（Promiseに包み直さない。既存の
 * 決定的なテストと、同期に済む計算の体感を変えないため）。
 */
export type MaybePromise<T> = T | Promise<T>;

function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

interface ComputeRunnerHost<T> {
  /** 依頼の世代`revision`が、まだ最新の依頼か（購読が続いているか）。 */
  isCurrent(revision: number): boolean;
  onReady(value: T): void;
  onFailed(error: unknown): void;
}

/**
 * 計算を1回走らせて結果を届ける（単一対象・集合対象の依頼で共通）。
 * Promiseを返す実装では、待っている間に新しい依頼が来る（世代が古くなる）か購読が
 * 止まったら、結果もエラーも捨てる。`abort()`は計算中の依頼へ`AbortSignal`で打ち切りを
 * 伝える（Worker越しの実装が、走っている計算を止めるのに使う）。
 */
function createComputeRunner<T>(host: ComputeRunnerHost<T>) {
  let inFlight: AbortController | undefined;
  return {
    abort(): void {
      inFlight?.abort();
      inFlight = undefined;
    },
    run(revision: number, compute: (signal: AbortSignal) => MaybePromise<T>): void {
      const controller = new AbortController();
      inFlight = controller;
      const settle = (deliver: () => void): void => {
        if (inFlight === controller) inFlight = undefined;
        if (host.isCurrent(revision)) deliver();
      };
      let result: MaybePromise<T>;
      try {
        result = compute(controller.signal);
      } catch (error) {
        settle(() => host.onFailed(error));
        return;
      }
      if (isPromiseLike(result)) {
        result.then(
          (value) => settle(() => host.onReady(value)),
          (error) => settle(() => host.onFailed(error)),
        );
      } else {
        settle(() => host.onReady(result));
      }
    },
  };
}

export interface EngineRequestOptions {
  /** 省略時は`microtaskScheduler`（`queueMicrotask`1回）。テストで決定的に進めたい時に差し替える。 */
  readonly scheduler?: EngineScheduler;
}

/**
 * 値の型`T`は`request()`自体には現れず（結果は`listener`経由で届く）、生成時に渡した
 * `listener`の型だけで決まる。そのためこのハンドル自体はジェネリックにしない。
 */
export interface EngineRequestChannel {
  /**
   * 新しい依頼を出す。呼ぶたびに前回までの依頼を打ち切る:
   * まだ計算が終わっていなければその結果は`listener`に届かず、`stale`に切り替わった
   * 直前の`ready`値だけが（あれば）保持される。
   *
   * 同じ内容の`resolution`を続けて渡しても、ここでは「同じだから無視する」判断はしない。
   * 計算済みの結果を同期に引ける（`peek`が値を返す）入力なら、`computing`/`stale`を挟まず
   * その場で`ready`にして、計算は頼まない。引けない入力は`computing`/`stale`を経て再計算する
   * （キー自体が同じなら`EngineCache`側の計算は共有されるので無駄な再計算にはならないが、
   * 状態は一度揺れる）。同じキーへの依頼を弾くかどうかはペイン側の関心事（例:「テキストが
   * 変わっていなければrequest()を呼ばない」）として、呼び出し側に委ねる。
   */
  request(resolution: ResolvedInputResult): void;
  /** 購読を止める。進行中の計算があっても、以降`listener`は呼ばれない。 */
  unsubscribe(): void;
}

/**
 * `compute`（`EngineCache.getTrace` / `getInterpretation`のいずれか）を、打ち切り可能な
 * 依頼と購読のAPIでラップする。`compute`自身は同期の純関数のまま
 * （キャッシュ・共有はすでに`EngineCache`が持つ）。
 */
export function createEngineRequest<T>(
  compute: (input: ResolvedInput, signal: AbortSignal) => MaybePromise<T>,
  listener: (state: EngineRequestState<T>) => void,
  options: EngineRequestOptions = {},
  peek?: (input: ResolvedInput) => T | undefined,
): EngineRequestChannel {
  const scheduler = options.scheduler ?? microtaskScheduler;

  // 依頼のたびに増える通し番号。スケジュールした計算が実行時に「自分がまだ最新の依頼か」を
  // 確かめるのに使う（打ち切り・revisionを混ぜない、の両方をこれ1つで実現する）。
  let revision = 0;
  let unsubscribed = false;
  let cancelScheduled: (() => void) | undefined;
  // 直近で`ready`になった値。`stale`表示のために依頼をまたいで保持する
  // （`failed`を挟んでも、その後の依頼がまた`stale`を出せるよう消さない）。
  let lastReadyValue: T | undefined;
  let hasLastReadyValue = false;

  function emit(state: EngineRequestState<T>): void {
    if (unsubscribed) return;
    listener(state);
  }

  const runner = createComputeRunner<T>({
    isCurrent: (rev) => !unsubscribed && rev === revision,
    onReady(value) {
      lastReadyValue = value;
      hasLastReadyValue = true;
      emit({ status: 'ready', value });
    },
    onFailed: (error) => emit({ status: 'failed', error: { kind: 'exception', error } }),
  });

  function request(resolution: ResolvedInputResult): void {
    if (unsubscribed) return;
    revision += 1;
    const myRevision = revision;
    cancelScheduled?.();
    cancelScheduled = undefined;
    runner.abort();

    if (!resolution.ok) {
      // 解決済み入力自体の失敗は同期に分かっているので、計算を挟まず即座に失敗を返す。
      emit({ status: 'failed', error: { kind: 'resolution', error: resolution.error } });
      return;
    }

    // クロージャ内でも型が絞られたままになるよう、ここで一度取り出しておく。
    const input = resolution.input;

    // 計算済みの結果が手元にあれば、計算中を挟まず同期にreadyを返す（Worker越しの実装が、
    // 往復の間ペインを「計算中」にしてしまうのを避ける）。前の依頼は上で打ち切り済みで、
    // ここではscheduleも積まないので、再入の心配も無い。
    const hit = peek?.(input);
    if (hit !== undefined) {
      lastReadyValue = hit;
      hasLastReadyValue = true;
      emit({ status: 'ready', value: hit });
      return;
    }

    // 先にscheduleしてからemitする（再入対策）。emitはlistenerを同期に呼ぶので、
    // listenerがその場でさらに`request()`や`unsubscribe()`を呼ぶ（再入）ことがある。
    // この行より後に`cancelScheduled`へ書き込む処理を置かなければ、再入した側が
    // 積んだ新しいスケジュール（またはキャンセル済みのundefined）を、この呼び出しが
    // 後から上書きして見失う事故が起きない。emitを先にしていた旧実装では、
    // 「listener内のrequest()が積んだタスクを、外側のrequest()が戻った後の
    // scheduleで上書きしてしまい取り消せなくなる」「listener内のunsubscribe()の後も
    // 外側がscheduleを続けてしまう」の2つの再入バグがあった。
    cancelScheduled = scheduler.schedule(() => {
      cancelScheduled = undefined;
      // 打ち切り・再入への安全網。scheduleをemitより先に行う順序を守っていれば
      // 本来ここに来る前に取り消されているはずだが、`EngineScheduler`の実装が
      // キャンセルに協力しない場合（例: Web Workerで送信済みのメッセージは
      // 取り消せない。#544 §8-1「重くなったらWorkerへ移せるように」）の最後の砦として、
      // 実行時に「自分がまだ最新の依頼か」を再チェックしてから結果を届ける。
      if (unsubscribed || myRevision !== revision) return;
      runner.run(myRevision, (signal) => compute(input, signal));
    });

    emit(
      hasLastReadyValue
        ? { status: 'stale', value: lastReadyValue as T }
        : { status: 'computing' },
    );
  }

  function unsubscribe(): void {
    unsubscribed = true;
    cancelScheduled?.();
    cancelScheduled = undefined;
    runner.abort();
  }

  return { request, unsubscribe };
}

// ---------------------------------------------------------------------------
// 集合対象の依頼（#544 Phase 3「集合を対象にする最初のAnalyzer」）
// ---------------------------------------------------------------------------

/**
 * 集合対象の依頼1件分の入力: どのSetupの、どの解決済み入力（または失敗）か。
 * `createEngineRequest`の`ResolvedInputResult`と違い、集合対象では要素ごとの解決失敗が
 * 全体の失敗を意味しない（#544指示書「部分失敗」）ため、`ok: false`のメンバーも
 * そのまま`compute`へ渡し、成功/失敗をメンバー単位でどう畳むかは`compute`
 * （`EngineCache.getSetExtraction`）側の仕事にする。ここでの打ち切り・再入対策は
 * `createEngineRequest`と同じ形をそのまま使う。
 */
export interface EngineSetMemberInput {
  readonly target: AnalysisTarget;
  readonly resolution: ResolvedInputResult;
}

export interface EngineSetRequestChannel {
  request(members: readonly EngineSetMemberInput[]): void;
  unsubscribe(): void;
}

/**
 * `createEngineRequest`の集合版。`resolution.ok`による早期return（単一対象では
 * 解決失敗イコール依頼全体の失敗）が無い点だけが違う: 集合では要素ごとの失敗が
 * 起こりうる前提そのものが目的なので、失敗の有無に関わらず必ず`compute`を呼ぶ
 * （`compute`側がメンバーごとの成功/失敗を仕分ける）。打ち切り・再入対策
 * （revision番号・scheduleをemitより先に行う順序）は`createEngineRequest`と同一。
 * ロジックを1つの関数へ共通化しなかった理由: 「解決失敗を即座に返すか、必ずcomputeへ
 * 渡すか」という分岐点が関数の構造そのもの（早期returnの有無）に埋め込まれており、
 * オプションで切り替える形にすると早期returnのためだけの引数が増えて読みにくくなる。
 */
export function createEngineSetRequest<T>(
  compute: (members: readonly EngineSetMemberInput[], signal: AbortSignal) => MaybePromise<T>,
  listener: (state: EngineRequestState<T>) => void,
  options: EngineRequestOptions = {},
  peek?: (members: readonly EngineSetMemberInput[]) => T | undefined,
): EngineSetRequestChannel {
  const scheduler = options.scheduler ?? microtaskScheduler;

  let revision = 0;
  let unsubscribed = false;
  let cancelScheduled: (() => void) | undefined;
  let lastReadyValue: T | undefined;
  let hasLastReadyValue = false;

  function emit(state: EngineRequestState<T>): void {
    if (unsubscribed) return;
    listener(state);
  }

  const runner = createComputeRunner<T>({
    isCurrent: (rev) => !unsubscribed && rev === revision,
    onReady(value) {
      lastReadyValue = value;
      hasLastReadyValue = true;
      emit({ status: 'ready', value });
    },
    onFailed: (error) => emit({ status: 'failed', error: { kind: 'exception', error } }),
  });

  function request(members: readonly EngineSetMemberInput[]): void {
    if (unsubscribed) return;
    revision += 1;
    const myRevision = revision;
    cancelScheduled?.();
    cancelScheduled = undefined;
    runner.abort();

    // 単一対象の依頼と同じく、計算済みなら計算中を挟まず同期にreadyを返す。
    const hit = peek?.(members);
    if (hit !== undefined) {
      lastReadyValue = hit;
      hasLastReadyValue = true;
      emit({ status: 'ready', value: hit });
      return;
    }

    cancelScheduled = scheduler.schedule(() => {
      cancelScheduled = undefined;
      if (unsubscribed || myRevision !== revision) return;
      runner.run(myRevision, (signal) => compute(members, signal));
    });

    emit(
      hasLastReadyValue
        ? { status: 'stale', value: lastReadyValue as T }
        : { status: 'computing' },
    );
  }

  function unsubscribe(): void {
    unsubscribed = true;
    cancelScheduled?.();
    cancelScheduled = undefined;
    runner.abort();
  }

  return { request, unsubscribe };
}
