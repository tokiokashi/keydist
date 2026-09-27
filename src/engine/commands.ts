import type { Command } from '#input/commands/index.ts';
import type { CascadeLevel } from '#input/settings/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT, type FingerAssignment } from '#input/shapes/geometry.ts';
import {
  createUserFingerAssignment,
  deleteUserFingerAssignment,
  duplicateUserFingerAssignment,
  renameUserFingerAssignment,
} from '#input/shapes/user-finger-assignments.ts';
import {
  createSetup,
  deleteSetup,
  duplicateSetup,
  relabelSetup,
  type SetupIdGenerator,
  type SetupLibrary,
} from '#input/setup/index.ts';
import {
  withStandaloneLanguageOverride,
  withStandaloneText,
  type StandaloneTextState,
} from '#input/text/standalone-text.ts';
import type { TextLanguage } from '#input/text/language.ts';
import {
  resetSettingsItem,
  resetSettingsLevel,
  setSettingsOverride,
  type SettingsItemId,
  type SettingsValueMap,
} from './settings-items.ts';

/**
 * このリポジトリが今持つ資産の集合（#544 Phase 2「コマンドによる書き込み」）。
 *
 * 資産は当面 `setupLibrary`（`SetupLibrary<SettingsValueMap>`）の1つだけにする。
 * Setupの手持ち（`setups`）とカスケードの上書き（`overrides`）を分けて2資産にする案も
 * あったが、採らなかった: Setupの削除・複製は「Setup本体の一覧」と「そのSetup固有の
 * カスケード上書き（`overrides.setup[id]`）」を同時に書き換えないと整合しない
 * （`input/setup/collection.ts` の `deleteSetup` / `duplicateSetup` 参照）。2資産に
 * 分けると、この2つを常にペアで扱うコマンドを毎回書く必要が生じ、"複数資産に触れる
 * コマンド"を1項目として原子的に積む仕組み（`applyCommand`）を使えばよいだけの話を
 * 複雑にする。`SetupLibrary` は元からこの2つを1つの値として扱う型なので、資産の粒度も
 * それに合わせるのが素直。Workspaceなど将来の資産は、この資産とは独立に読み書きできる
 * ものが増えた時点で新しいキーとして足す（先回りして今は足さない）。
 *
 * この粒度の帰結: `applyExternalChange`（タブ間追従）は資産キー単位でしか履歴を絞れない
 * ため、他タブが`setupLibrary`に何か1つでも書き込むと、このタブのUndo/Redo履歴は
 * （カスケードの上書き・Setupの作成/削除のどちらであっても）全部消える。単一ユーザー向けの
 * ツールで複数タブを同時に編集する場面は稀という前提でこれを許容する。細かくしたくなったら、
 * 資産をさらに分ける（例: `setups`と`overrides`を分離する）か、資産単位ではなく項目単位
 * （どのSetup・どのレベル・どの項目に触れたか）で履歴の破棄範囲を判定する仕組みへ広げる、
 * の2方向がある。
 *
 * `fingerAssignments`（自作の指割り当ての手持ち、#544 Phase 2「自作の指割当を資産として
 * engine に入れる」）は独立した2つ目のキーとして足す。`setupLibrary`に同居させなかった
 * 理由: `setupLibrary`を1資産にまとめたのは「Setup本体とそのSetup固有の上書き
 * （`overrides.setup[id]`）が**同じidで結ばれた1対の状態**で、片方だけ書き換えると
 * 整合が壊れる」からだった（`input/setup/overrides.ts`参照）。自作の指割り当ての手持ちと
 * カスケードの`fingerAssignmentId`はそういう対にならない: 後者はどのレベルにも置ける
 * ただの文字列値で、前者を指しているとは限らない（組み込みidのこともある）し、前者を
 * 削除しても後者を道連れで書き換える必要が無い（`resolveFingerAssignment`が解決の
 * たびに検査し、無ければ診断付きでfallbackする。`input/shapes/user-finger-assignments.ts`の
 * `deleteUserFingerAssignment`コメント参照）。原子的に2箇所を書き換える理由が無いので、
 * 「独立に読み書きできるものは新しいキーとして足す」という元のコメント通りの扱いにする。
 */
export interface KeydistAssets {
  readonly setupLibrary: SetupLibrary<SettingsValueMap>;
  readonly fingerAssignments: readonly FingerAssignment[];
  /**
   * 単体ページ全体で共有する「最後に使ったテキスト」（#544 §5、`hosts/standalone`）。
   * `setupLibrary`と対にならない・`fingerAssignments`とも無関係の独立した値なので、
   * このコメント冒頭の判断（「独立に読み書きできるものは新しいキーとして足す」）どおり
   * 3つ目の資産キーとして足す。
   */
  readonly standaloneText: StandaloneTextState;
}

type SetupLibraryComputation =
  | { readonly ok: true; readonly library: SetupLibrary<SettingsValueMap> }
  | { readonly ok: false; readonly reason: unknown };

/**
 * `setupLibrary` だけに触れるコマンドの共通の骨組み。`compute` が失敗を報告したら
 * `rejected` に、`compute` が渡された参照をそのまま返したら（=何もしなかったら）
 * `no-op` に変換する。実際の値の変化があるかどうかの最終判定（`Object.is` での比較）は
 * `applyCommand` 側（`input/commands/history.ts`）が担うので、ここでは「呼び出した
 * 純関数が何と言ったか」だけを`CommandOutcome`の形に写す。
 */
function setupLibraryCommand(
  label: string,
  compute: (library: SetupLibrary<SettingsValueMap>) => SetupLibraryComputation,
): Command<KeydistAssets> {
  return (current) => {
    const result = compute(current.setupLibrary);
    if (!result.ok) return { kind: 'rejected', reason: result.reason };
    if (result.library === current.setupLibrary) return { kind: 'no-op' };
    return { kind: 'applied', label, changes: { setupLibrary: result.library } };
  };
}

/** カスケードの上書きを1項目・1レベルへ書き込む（レベル指定は必須。#544 §8-2）。 */
export function setCascadeOverrideCommand<K extends SettingsItemId>(
  level: CascadeLevel,
  itemId: K,
  value: SettingsValueMap[K],
): Command<KeydistAssets> {
  return setupLibraryCommand(`設定を変更する: ${itemId}`, (library) => {
    const result = setSettingsOverride(library.overrides, level, itemId, value);
    if (!result.ok) return { ok: false, reason: result.error };
    // `setSettingsOverride`は既に同じ値が入っていれば同じ`overrides`参照を返す
    // （`input/settings/write.ts`の規約）。ここでも`resetCascadeItemCommand`と同じ理由で、
    // 変化が無い時は`library`自体を据え置く（毎回新しいオブジェクトを作ると、
    // 中身が同じでも「変わった」と誤判定されてしまう）。
    if (result.overrides === library.overrides) return { ok: true, library };
    return { ok: true, library: { ...library, overrides: result.overrides } };
  });
}

/**
 * 1項目・1レベルの上書きだけを消す。`resetItem`は消すものが無ければ同じ`overrides`参照を
 * 返す（`input/settings/reset.ts`）ので、それをそのまま`setupLibrary`のno-op判定に伝える
 * ため、変化が無い時は`library`自体も同じ参照を返す（`{...library, overrides}`で毎回
 * 新しいオブジェクトを作ると、中身が同じでも「変わった」と誤判定されてしまうため）。
 */
export function resetCascadeItemCommand(level: CascadeLevel, itemId: SettingsItemId): Command<KeydistAssets> {
  return setupLibraryCommand(`設定をリセットする: ${itemId}`, (library) => {
    const overrides = resetSettingsItem(library.overrides, level, itemId);
    if (overrides === library.overrides) return { ok: true, library };
    return { ok: true, library: { ...library, overrides } };
  });
}

/** 1レベルの上書きを全項目まとめて消す。no-op判定の理由は`resetCascadeItemCommand`と同じ。 */
export function resetCascadeLevelCommand(level: CascadeLevel): Command<KeydistAssets> {
  return setupLibraryCommand('レベルの設定をまとめてリセットする', (library) => {
    const overrides = resetSettingsLevel(library.overrides, level);
    if (overrides === library.overrides) return { ok: true, library };
    return { ok: true, library: { ...library, overrides } };
  });
}

/** Setupを新規作成する。 */
export function createSetupCommand(
  layoutId: string,
  shapeId: string,
  generateId: SetupIdGenerator,
  label?: string,
): Command<KeydistAssets> {
  return setupLibraryCommand('Setupを作成する', (library) => ({
    ok: true,
    library: createSetup(library, layoutId, shapeId, generateId, label),
  }));
}

/** Setupを複製する。複製元が存在しない場合は何もしない（`duplicateSetup` 自身の方針）。 */
export function duplicateSetupCommand(
  sourceSetupId: string,
  generateId: SetupIdGenerator,
  label?: string,
): Command<KeydistAssets> {
  return setupLibraryCommand('Setupを複製する', (library) => ({
    ok: true,
    library: duplicateSetup(library, sourceSetupId, generateId, label),
  }));
}

/**
 * Setupを削除する。存在しないidの削除は何もしない（`deleteSetup`自身が、対象が無ければ
 * 同一のlibrary参照を返す規約になっている。`input/setup/collection.ts`参照）。
 */
export function deleteSetupCommand(setupId: string): Command<KeydistAssets> {
  return setupLibraryCommand('Setupを削除する', (library) => ({ ok: true, library: deleteSetup(library, setupId) }));
}

/**
 * Setupのラベルを付け直す。対象が存在しない、または既に同じラベルなら何もしない
 * （`relabelSetup`自身の規約。`input/setup/collection.ts`参照）。
 */
export function relabelSetupCommand(setupId: string, label: string | undefined): Command<KeydistAssets> {
  return setupLibraryCommand('Setupのラベルを変更する', (library) => ({
    ok: true,
    library: relabelSetup(library, setupId, label),
  }));
}

type FingerAssignmentsComputation =
  | { readonly ok: true; readonly assignments: readonly FingerAssignment[] }
  | { readonly ok: false; readonly reason: unknown };

/** `fingerAssignments`だけに触れるコマンドの共通の骨組み。`setupLibraryCommand`と同じ形。 */
function fingerAssignmentsCommand(
  label: string,
  compute: (assignments: readonly FingerAssignment[]) => FingerAssignmentsComputation,
): Command<KeydistAssets> {
  return (current) => {
    const result = compute(current.fingerAssignments);
    if (!result.ok) return { kind: 'rejected', reason: result.reason };
    if (result.assignments === current.fingerAssignments) return { kind: 'no-op' };
    return { kind: 'applied', label, changes: { fingerAssignments: result.assignments } };
  };
}

/** 自作の指割り当てを新規作成する。`base`省略時は組み込みの既定（列固定）から始める。 */
export function createFingerAssignmentCommand(
  generateId: () => string,
  base: FingerAssignment = DEFAULT_FINGER_ASSIGNMENT,
  name?: string,
): Command<KeydistAssets> {
  return fingerAssignmentsCommand('指割り当てを作成する', (assignments) => ({
    ok: true,
    assignments: createUserFingerAssignment(assignments, generateId, base, name),
  }));
}

/** 自作の指割り当てを複製する。複製元が存在しない場合は何もしない（`duplicateUserFingerAssignment`自身の方針）。 */
export function duplicateFingerAssignmentCommand(
  sourceId: string,
  generateId: () => string,
  name?: string,
): Command<KeydistAssets> {
  return fingerAssignmentsCommand('指割り当てを複製する', (assignments) => ({
    ok: true,
    assignments: duplicateUserFingerAssignment(assignments, sourceId, generateId, name),
  }));
}

/**
 * 自作の指割り当てを削除する。存在しないidの削除は何もしない。
 * これを参照しているカスケードの`fingerAssignmentId`上書きはここでは触らない
 * （理由は`input/shapes/user-finger-assignments.ts`の`deleteUserFingerAssignment`コメント、
 * および`KeydistAssets`のコメント参照）。
 */
export function deleteFingerAssignmentCommand(id: string): Command<KeydistAssets> {
  return fingerAssignmentsCommand('指割り当てを削除する', (assignments) => ({
    ok: true,
    assignments: deleteUserFingerAssignment(assignments, id),
  }));
}

/** 自作の指割り当ての名前を変更する。対象が存在しない、または既に同じ名前なら何もしない。 */
export function renameFingerAssignmentCommand(id: string, name: string): Command<KeydistAssets> {
  return fingerAssignmentsCommand('指割り当ての名前を変更する', (assignments) => ({
    ok: true,
    assignments: renameUserFingerAssignment(assignments, id, name),
  }));
}

/** `standaloneText`だけに触れるコマンドの共通の骨組み。`setupLibraryCommand`と同じ形。 */
function standaloneTextCommand(
  label: string,
  compute: (current: StandaloneTextState) => StandaloneTextState,
): Command<KeydistAssets> {
  return (current) => {
    const next = compute(current.standaloneText);
    if (next === current.standaloneText) return { kind: 'no-op' };
    return { kind: 'applied', label, changes: { standaloneText: next } };
  };
}

/**
 * 単体ページの「最後に使ったテキスト」を差し替える（#544 §5）。テキストを変えると
 * 言語は自動判定へ再計算され、手動上書きは引き継がない（`withStandaloneText`のコメント参照）。
 */
export function setStandaloneTextCommand(text: string): Command<KeydistAssets> {
  return standaloneTextCommand('テキストを変更する', (current) => withStandaloneText(current, text));
}

/** テキストの言語判定を手動で上書きする。`undefined`で自動判定へ戻す。 */
export function setStandaloneTextLanguageOverrideCommand(
  override: TextLanguage | undefined,
): Command<KeydistAssets> {
  return standaloneTextCommand(
    '言語判定を変更する',
    (current) => withStandaloneLanguageOverride(current, override),
  );
}
