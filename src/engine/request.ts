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
   * 呼ぶたびに`computing`/`stale`を経て再計算する（キー自体が同じなら`EngineCache`側の
   * 計算は共有されるので無駄な再計算にはならないが、状態は一度揺れる）。同じキーへの
   * 依頼を弾くかどうかはペイン側の関心事（例:「テキストが変わっていなければ
   * request()を呼ばない」）として、呼び出し側に委ねる。
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
  compute: (input: ResolvedInput) => T,
  listener: (state: EngineRequestState<T>) => void,
  options: EngineRequestOptions = {},
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

  function request(resolution: ResolvedInputResult): void {
    if (unsubscribed) return;
    revision += 1;
    const myRevision = revision;
    cancelScheduled?.();
    cancelScheduled = undefined;

    if (!resolution.ok) {
      // 解決済み入力自体の失敗は同期に分かっているので、計算を挟まず即座に失敗を返す。
      emit({ status: 'failed', error: { kind: 'resolution', error: resolution.error } });
      return;
    }

    // クロージャ内でも型が絞られたままになるよう、ここで一度取り出しておく。
    const input = resolution.input;

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
      try {
        const value = compute(input);
        lastReadyValue = value;
        hasLastReadyValue = true;
        emit({ status: 'ready', value });
      } catch (error) {
        emit({ status: 'failed', error: { kind: 'exception', error } });
      }
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
  }

  return { request, unsubscribe };
}
