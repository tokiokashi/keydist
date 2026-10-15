/**
 * コマンドによる書き込みと履歴（コマンドによる書き込み、Undo / Redo、
 * タブ間の追従）。ここは仕組みだけを持つ純粋層で、具体の資産（`SetupLibrary` 等）は
 * 知らない。具体のコマンドは `engine/commands.ts` のように、資産の型を知っている層で
 * `Command<A>` を実装する形にする。
 *
 * 資産は「資産キー → 値」の集合として1つの `A`（`AssetValues` を満たすオブジェクト型）で
 * 表す。1コマンドが複数の資産キーに触れてもよく、その場合も履歴には1項目として積む
 * （「原子的に1項目」という要件）。
 */

/**
 * 資産キー → 値 の集合。呼び出し側（engine層）が実際の形を決める
 * （例: `{ readonly setupLibrary: SetupLibrary<SettingsValueMap> }`）。
 *
 * `Record<string, unknown>` ではなく `object` を境界にする。TypeScriptは名前付きの
 * interface/typeに暗黙のindex signatureを付けないため、`Record<string, unknown>`を
 * 境界にすると具体の資産型（`{ readonly setupLibrary: … }` 等）がどれも「index
 * signatureが無い」という理由で弾かれてしまう（object literalの構造的部分型と、
 * genericsの境界検査は別の規則で動く）。
 */
export type AssetValues = object;

/**
 * コマンド1回の適用結果。例外にはせず値として表す（エラーは値として扱う方針）。
 *
 * - `applied`: 触れた資産の新しい値。`changes` に含めた資産キーがすべて実際に変わったとは
 *   限らない（history側で現在値と比較し、変わっていないキーは捨てる）
 * - `no-op`: そもそも何もしないと自分で判断した（例: 存在しないSetupの削除）
 * - `rejected`: 書き込みが妥当性の理由で拒否された（例: 許可されていないレベルへの上書き）。
 *   `reason` は呼び出し側の型（例: `DisallowedLevelError`）をそのまま運ぶだけで、
 *   このモジュールは中身を解釈しない
 */
export type CommandOutcome<A extends AssetValues> =
  | { readonly kind: 'applied'; readonly label: string; readonly changes: Readonly<Partial<A>> }
  /**
   * 履歴に積まない書き込み（Undoの対象にならない、資産に付く印の更新など）。資産は書くが
   * `undoStack`には積まず、`redoStack`も消さない。`transforms`は資産キーごとの変換で、
   * 現在値と、取っておく全部の画面の履歴の各項目が持つそのキーのbefore/afterへ同じ変換を掛ける。履歴の値へも掛けるのは、
   * 掛けないと、後のUndoが変換前の値（印が付いたまま等）を書き戻してしまうため。
   * 結果の`outcome`は`applied`（`changes`は変換後の現在値）として返るので、呼び出し側は区別しなくてよい。
   */
  | {
    readonly kind: 'quiet';
    readonly label: string;
    readonly transforms: { readonly [K in keyof A]?: (value: A[K]) => A[K] };
  }
  | { readonly kind: 'no-op' }
  | { readonly kind: 'rejected'; readonly reason: unknown };

/**
 * 資産の集合に対する純関数。「どの資産に触れるか」と新しい値を返す。副作用は持たず、
 * 同じ入力には同じ出力を返す（idの発行等、外部から変わりうる値は呼び出し側が
 * クロージャで渡す。setup/types.tsの `SetupIdGenerator` と同じ考え方）。
 */
export type Command<A extends AssetValues> = (current: Readonly<A>) => CommandOutcome<A>;

/**
 * 履歴の1項目。触れた資産ごとのbefore/afterを持つ。undo/redoは逆操作を個別に書かず、
 * このsnapshotを差し戻すだけで実現する（資産は小さいのでsnapshotで十分という判断）。
 */
export interface HistoryEntry<A extends AssetValues> {
  readonly label: string;
  readonly before: Readonly<Partial<A>>;
  readonly after: Readonly<Partial<A>>;
}

/**
 * 1つの画面の履歴。`undoStack` / `redoStack` は末尾が直近の項目。
 * 履歴は画面ごとに持ち（`ScreenHistories`）、その画面でした変更だけをその画面で戻す。
 * タブを開いている間だけメモリに持ち、保存データには書かない
 * （呼び出し側がこの値をstorageへ保存しない、というだけの約束。ここでは何もしない）。
 */
export interface CommandHistory<A extends AssetValues> {
  readonly undoStack: readonly HistoryEntry<A>[];
  readonly redoStack: readonly HistoryEntry<A>[];
}

/** 画面の識別子 → その画面の履歴。画面の数に上限は設けない（項目は資産の値への参照を持つだけ）。 */
export type ScreenHistories<A extends AssetValues> = ReadonlyMap<string, CommandHistory<A>>;

/**
 * 項目単位で照らし合わせる資産キーの定義。値が「id → 件」の集まりの資産に使う。
 * 戻す・やり直す時、項目が既にある件の中身だけを変えているなら、変わった件だけを今の値と
 * 照らし合わせて、その件だけを書き換える。他の件が今変わっていても止めない。
 */
export interface ItemScope<V> {
  /** 件のid → 件の値。並びの順に返す。 */
  readonly items: (value: V) => ReadonlyMap<string, unknown>;
  /**
   * `id`の件を`item`に差し替えた値。`item`が`undefined`なら、その件を外す
   * （`membership`が`'free'`の資産だけで起きる）。
   */
  readonly withItem: (value: V, id: string, item: unknown) => V;
  /**
   * `'fixed'`: 件の追加・削除・並べ替えをした項目は項目単位にしない（1件だけ戻すと、戻す位置や番号の重なりなど、
   * どのコマンドも作らない状態ができうるため）。
   * `'free'`: 件の有無が位置や他の件に影響しない資産で、件の追加・削除も項目単位で戻す。
   */
  readonly membership: 'fixed' | 'free';
  /**
   * `id`の件が値を持つ間、同じ資産の中にあるべき別の件のid。戻す・やり直す結果で`id`の件が値を持つのに、
   * 挙げた件が（同じ操作で戻る場合を除いて）今無ければ、その項目は当てずに知らせる。
   */
  readonly requires?: (id: string) => string | undefined;
}

/** 資産キーごとの`ItemScope`。挙げないキーは、値の参照が丸ごと同じかで照らし合わせる。 */
export type ItemScopes<A extends AssetValues> = { readonly [K in keyof A]?: ItemScope<A[K]> };

/**
 * 戻す・やり直すの結果の種類。`conflict`は、項目を積んだ後に別の画面などで資産が書き換わっていて、
 * 項目を当てられなかったこと（資産は変えず、その項目は履歴から捨てる）。
 */
export type HistoryStepOutcome<A extends AssetValues> =
  | CommandOutcome<A>
  | { readonly kind: 'conflict'; readonly label: string };

/** `undo` / `redo` の戻り値。 */
export interface HistoryStepResult<A extends AssetValues> {
  readonly assets: A;
  readonly history: CommandHistory<A>;
  readonly outcome: HistoryStepOutcome<A>;
}

/** `applyCommand` に共通の戻り値。 */
export interface CommandStepResult<A extends AssetValues> {
  readonly assets: A;
  readonly history: CommandHistory<A>;
  /** 呼び出し側が失敗理由やno-opを見るための、元のoutcome。 */
  readonly outcome: CommandOutcome<A>;
}
