/**
 * コマンドによる書き込みと履歴（#544 §8-2 / Phase 2「コマンドによる書き込み、Undo / Redo、
 * タブ間の追従」）。ここは仕組みだけを持つ純粋層で、具体の資産（`SetupLibrary` 等）は
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
 * コマンド1回の適用結果。例外にはせず値として表す（#544 §8-5と同じ「エラーは値」の方針）。
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
 * このsnapshotを差し戻すだけで実現する（資産は小さいのでsnapshotで十分という判断。
 * 指示書参照）。
 */
export interface HistoryEntry<A extends AssetValues> {
  readonly label: string;
  readonly before: Readonly<Partial<A>>;
  readonly after: Readonly<Partial<A>>;
}

/**
 * アプリ全体で1本の履歴（#544 Phase 1締めコメント「決定: Undoの単位はアプリ全体で1本」）。
 * `undoStack` / `redoStack` は末尾が直近の項目。タブごと・メモリのみで、永続化しない
 * （呼び出し側がこの値をstorageへ保存しない、というだけの約束。ここでは何もしない）。
 */
export interface CommandHistory<A extends AssetValues> {
  readonly undoStack: readonly HistoryEntry<A>[];
  readonly redoStack: readonly HistoryEntry<A>[];
}

/** `applyCommand` / `undo` / `redo` に共通の戻り値。 */
export interface CommandStepResult<A extends AssetValues> {
  readonly assets: A;
  readonly history: CommandHistory<A>;
  /** 呼び出し側が失敗理由やno-opを見るための、元のoutcome（undo/redoでは合成したものを返す）。 */
  readonly outcome: CommandOutcome<A>;
}
