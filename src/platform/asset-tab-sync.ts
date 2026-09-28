import type { AssetCodec, DecodeFailure, CodecDiagnostic } from '#input/codec/index.ts';
import type { KeyValueStorage } from './persistence/storage.ts';
import { notifyKeydistStorageChange, subscribeKeydistStorageChanges } from './browser-storage-events.ts';

/**
 * 資産1つぶんの永続化とタブ間追従のアダプタ（#544 Phase 2「永続化とタブ間追従の
 * アダプタ」）。資産の型・codecに依存しない汎用の仕組みとして`platform`に置く
 * （`docs/architecture.md`の依存規則で`platform`は`input`しかimportできず、
 * `engine`のSetupLibrary等は知らない。具体のcodecを注入して使う側は`app`が組み立てる）。
 *
 * このモジュール自身はReactの配線もengineの型も知らない。「storageへの読み書き」と
 * 「他タブ・同タブの変更通知」だけを扱う土台で、`applyExternalChange`（`input/commands/`）
 * へ渡す値を作るところまでを担当する。実際に`applyExternalChange`を呼ぶ配線
 * （React hookやAppState）はこのPhaseではまだ作らない（指示書どおり、消費者が
 * できてから配線する）。
 */

/** JSONとして読めない生データ。`AssetCodec`の`DecodeFailure`はJSONとして妥当な形が前提なので、その手前の失敗を別に持つ。 */
export type AssetLoadFailure = DecodeFailure | { readonly kind: 'invalid-json' };

export type AssetLoadResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly CodecDiagnostic[] }
  | { readonly ok: false; readonly reason: AssetLoadFailure };

export interface AssetTabSyncOptions<T> {
  readonly storageKey: string;
  readonly codec: AssetCodec<T>;
  /** 既定は`window.localStorage`。テストでは偽物を注入する。 */
  readonly storage?: KeyValueStorage;
  /** 既定は`browser-storage-events.ts`の購読。テストでは偽物を注入する。 */
  readonly subscribe?: typeof subscribeKeydistStorageChanges;
  /** 既定は`browser-storage-events.ts`の通知。テストでは偽物を注入する。 */
  readonly notify?: typeof notifyKeydistStorageChange;
  /**
   * 他タブがこの資産を書き換えた時に呼ばれる。decodeが失敗した場合は呼ばれず、
   * `onLoadFailure`（あれば）が呼ばれる（#544 Phase 2「decode失敗・診断の扱い:
   * 失敗なら外部変更を取り込まず、診断と一緒に値で返す」を、値を渡すコールバックとして実装）。
   *
   * 自タブがした書き込みの反響（`notifyKeydistStorageChange`が同一タブへ返す通知）は
   * ここに来ない。直前に自分が書き込んだ直列化結果と、通知を受けて読み直した中身が
   * 一致するかどうかで判定し、一致すれば無視する（このモジュール内で吸収する）。
   */
  readonly onExternalChange: (value: T, diagnostics: readonly CodecDiagnostic[]) => void;
  readonly onLoadFailure?: (reason: AssetLoadFailure) => void;
}

export interface AssetTabSync<T> {
  /** storageから読み込む。無い・decodeできない場合は`undefined`（詳細は`onLoadFailure`）。 */
  load(): T | undefined;
  /** storageへ書き込み、他タブ・同タブへ変更を通知する。 */
  save(value: T): void;
  /** 変更通知の購読を止める。 */
  stop(): void;
}

function defaultStorage(): KeyValueStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function parseJson(raw: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * 資産1つの永続化とタブ間追従を組み立てる。`storageKey`が資産を識別する
 * （呼び出し側が既存キーと衝突しないものを渡す。例: `SETUP_LIBRARY_STORAGE_KEY`）。
 */
export function createAssetTabSync<T>(options: AssetTabSyncOptions<T>): AssetTabSync<T> {
  const storage = options.storage ?? defaultStorage();
  const subscribe = options.subscribe ?? subscribeKeydistStorageChanges;
  const notify = options.notify ?? notifyKeydistStorageChange;

  // 「storageの現在値として、このインスタンスが最後に知っているraw」。
  // 自分の書き込み（save）でも、他タブの書き込みを外部変更として取り込んだ時
  // （decode成功時）でも更新する。反響判定は「この値と一致するか」で行うので、
  // ここを自分の書き込みだけに限ると、他タブが書いた値をここで覚えないまま
  // 3手目（自分がA→他がB→他がAに戻す）でstorageの中身がsave時のAと再び一致し、
  // 外部からの書き戻しを反響と誤判定してしまう（レビューで指摘された穴）。
  let lastWrittenRaw: string | undefined;

  function readRaw(): string | null {
    if (!storage) return null;
    try {
      return storage.getItem(options.storageKey);
    } catch {
      return null;
    }
  }

  function decode(raw: string): AssetLoadResult<T> {
    const json = parseJson(raw);
    if (!json.ok) return { ok: false, reason: { kind: 'invalid-json' } };
    const result = options.codec.decode(json.value);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, value: result.value, diagnostics: result.diagnostics };
  }

  function load(): T | undefined {
    const raw = readRaw();
    if (raw === null) return undefined;
    const result = decode(raw);
    if (!result.ok) {
      options.onLoadFailure?.(result.reason);
      return undefined;
    }
    return result.value;
  }

  function save(value: T): void {
    if (!storage) return;
    const raw = JSON.stringify(options.codec.encode(value));
    try {
      storage.setItem(options.storageKey, raw);
    } catch {
      // 保存できなくても、その場の編集と評価は成立する（既存の資産storageと同じ方針）。
      return;
    }
    // 書き込みの直後に自分の直列化結果を記録してから通知する。通知がこのタブの購読者
    // （このsync自身を含む）へ届いた時点でstorageの中身は必ずこの値になっている
    // （同期的な書き込みのため）ので、反響の判定に使える。
    lastWrittenRaw = raw;
    notify(options.storageKey);
  }

  const unsubscribe = subscribe([options.storageKey], (key) => {
    if (key !== options.storageKey) return;
    const raw = readRaw();
    // 削除（null）は今のところ扱わない対象（資産を消す操作はまだ無い）。
    if (raw === null) return;
    if (raw === lastWrittenRaw) return; // 自タブの書き込みの反響。外部変更として扱わない。

    const result = decode(raw);
    if (!result.ok) {
      // 壊れたrawは記録しない。「最後に自分が知っているstorageの中身」という
      // `lastWrittenRaw`の意味に、decodeできなかった値まで含めると、次に別の
      // タブが正しい値を書き戻した時に比較対象が無意味になる。同じ壊れたrawが
      // 続けて届いた場合はその都度`onLoadFailure`を報告し続ける（黙って
      // 一度だけ報告して以後無視する、という特別扱いはしない。失敗は毎回
      // 値として報告する、という#544 §8-5の方針に揃える）。
      options.onLoadFailure?.(result.reason);
      return;
    }
    // 「storageの現在値として最後に自分が知っているraw」に更新する。これが無いと、
    // 自タブでsave→他タブがB→他タブがAに戻す、という3手目でstorageの中身が
    // save時のrawと一致してしまい、外部からの書き戻しなのに反響と誤判定してしまう
    // （lastWrittenRawを「自分が書いた値」のままにしていた時の穴）。
    lastWrittenRaw = raw;
    options.onExternalChange(result.value, result.diagnostics);
  });

  return { load, save, stop: unsubscribe };
}
