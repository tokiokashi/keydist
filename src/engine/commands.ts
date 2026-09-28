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
  appendCopiedUserText,
  deleteUserText,
  editUserTextContent,
  renameUserText,
  setUserTextLanguageOverride,
  uniqueAutoTextName,
  type TextIdGenerator,
  type TextLibrary,
} from '#input/text/library.ts';
import { builtinTextById, deriveEditedTextName } from '#input/text/builtin.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { DEFAULT_TEXT_REF, withTextSelection, type TextRef, type TextSelectionState } from '#input/text/selection.ts';
import type { TextLanguage } from '#input/text/language.ts';
import {
  withStandaloneAnalyzerOptions,
  type StandaloneAnalyzerOptionsState,
} from './standalone-analyzer-options.ts';
import {
  analyzerSetSelectionFor,
  withAnalyzerSetSelection,
  withSetSelectionBaseline,
  withSetSelectionSetupIds,
  type AnalyzerSetSelectionState,
  type SetSelectionState,
} from './analyzer-set-selection.ts';
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
   * ユーザーが自作したテキストの手持ち（#544 Phase 3「テキストの資産化」）。`Setup`（配列 ×
   * 形状）と同じく、器（単体ページ / 将来のWorkspace）をまたいで共有する資産にする。
   * どのテキストを今使っているかという「選択」は器ごとに別のキー（`standaloneTextSelection`）
   * に持つ（`setupLibrary.setups`と「今選んでいるSetup」がそもそも別概念であるのと同じ分担。
   * ただしSetupの選択は各hostのローカルstateで、資産にはしていない。テキストの選択を資産に
   * するのは#544指示書の決定: リロードをまたいで「最後に使ったテキスト」を復元したいため）。
   */
  readonly textLibrary: TextLibrary;
  /**
   * 単体ページ全体で共有する「今使っているテキストの選択」。`standaloneAnalyzerOptions`・
   * `analyzerSetSelections`と同じ理由（`textLibrary`とも対にならない、独立に読み書きできる値）
   * で新しいキーとして足す。型（`TextSelectionState`）自体は器を知らない汎用の値にしてあるので、
   * 将来Workspaceが自分の選択を持ちたくなった時は`workspaceTextSelection`のような別キーを
   * 同じ型で足すだけで済む（今回は単体ページ用のこのキーだけ実装する）。
   */
  readonly standaloneTextSelection: TextSelectionState;
  /**
   * 単体ページの「Analyzerごとの最後に使った解析設定」（#544指示書「解析設定の保存」）。
   * `standaloneText`と同じ理由（`setupLibrary`とも`fingerAssignments`とも対にならない、
   * 独立に読み書きできる値）で4つ目の資産キーとして足す。値の型は`engine`からは
   * `unknown`のまま扱う（`standalone-analyzer-options.ts`冒頭コメント参照。engineは
   * 個別Analyzerの`Options`型へ依存できないため）。
   */
  readonly standaloneAnalyzerOptions: StandaloneAnalyzerOptionsState;
  /**
   * 集合対象Analyzer全般（比較表・N感度等）が使う、汎用の「対象の集合」
   * （Analyzer id → 選んだSetup id列 + 基準。#544 Phase 3）。`standaloneText`・
   * `standaloneAnalyzerOptions`と同じ理由（他資産と対にならない、独立に読み書きできる値）で
   * 5つ目の資産キーとして足す。
   */
  readonly analyzerSetSelections: AnalyzerSetSelectionState;
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

/**
 * テキストの選択の持ち主。将来Workspaceが自分の選択を持つ時に2つ目の値が増える前提の型に
 * しておく。今実装しているのは単体ページの1つだけだが、コマンドの名前に
 * `standaloneTextSelection`を直接埋め込まず、引数として持ち主を渡す形にしておく
 * （レビュー指摘: `current`止まりの名前だと、Workspace用の2つ目の持ち主を足す時に
 * 別名の関数一式を丸ごと複製する羽目になる）。
 */
export type TextSelectionHolder = 'standalone';

/** 持ち主から、その選択を保持する`KeydistAssets`のキーを引く。 */
function textSelectionAssetKey(holder: TextSelectionHolder): 'standaloneTextSelection' {
  switch (holder) {
    case 'standalone':
      return 'standaloneTextSelection';
  }
}

/**
 * `textLibrary`・持ち主の選択キーの両方に触れうるコマンドの共通の骨組み
 * （`setupLibraryCommand`と同じ形。この2資産はcopy-on-write・削除時のフォールバックで
 * 同時に書き換わることがあるペアなので、Setup本体とその上書きのように1つの`compute`へまとめる）。
 * `applyCommand`（`input/commands/history.ts`の`diffChanges`）が最終的に「実際に変わった
 * キーだけ」を履歴へ積むので、ここでは2キーとも無条件に`changes`へ含めてよい。
 */
function currentTextCommand(
  holder: TextSelectionHolder,
  label: string,
  compute: (current: { readonly library: TextLibrary; readonly selection: TextSelectionState }) =>
    { readonly library: TextLibrary; readonly selection: TextSelectionState },
): Command<KeydistAssets> {
  const key = textSelectionAssetKey(holder);
  return (current) => {
    const next = compute({ library: current.textLibrary, selection: current[key] });
    if (next.library === current.textLibrary && next.selection === current[key]) {
      return { kind: 'no-op' };
    }
    return {
      kind: 'applied',
      label,
      changes: { textLibrary: next.library, [key]: next.selection },
    };
  };
}

/** `textLibrary`だけに触れるコマンドの共通の骨組み。`setupLibraryCommand`と同じ形。 */
function textLibraryCommand(
  label: string,
  compute: (library: TextLibrary) => TextLibrary,
): Command<KeydistAssets> {
  return (current) => {
    const next = compute(current.textLibrary);
    if (next === current.textLibrary) return { kind: 'no-op' };
    return { kind: 'applied', label, changes: { textLibrary: next } };
  };
}

/**
 * 新規の空テキストを作り、そのまま選択する。
 * 自動生成名（未指定なら「新しいテキスト」）が既に使われていれば連番を振る
 * （`uniqueAutoTextName`、レビュー指摘: 自動生成名は見分けが付くようにする）。
 */
export function createTextCommand(
  holder: TextSelectionHolder,
  generateId: TextIdGenerator,
  name?: string,
): Command<KeydistAssets> {
  return currentTextCommand(holder, 'テキストを作成する', ({ library }) => {
    const uniqueName = uniqueAutoTextName(library, name ?? '新しいテキスト');
    const { library: nextLibrary, created } = appendCopiedUserText(library, generateId, { text: '', name: uniqueName });
    return { library: nextLibrary, selection: { ref: { kind: 'user', id: created.id } } };
  });
}

/**
 * 今選んでいるテキスト（組み込み・ユーザーテキストのどちらでもよい）を複製し、複製先を
 * 選択する。自動生成名（「元の名前」のコピー）が既に使われていれば連番を振る
 * （`createTextCommand`と同じ理由）。
 */
export function duplicateTextCommand(
  holder: TextSelectionHolder,
  generateId: TextIdGenerator,
  name?: string,
): Command<KeydistAssets> {
  return currentTextCommand(holder, 'テキストを複製する', ({ library, selection }) => {
    const resolved = resolveTextSelection(selection, library);
    const uniqueName = name ?? uniqueAutoTextName(library, `${resolved.name}のコピー`);
    const { library: nextLibrary, created } = appendCopiedUserText(
      library,
      generateId,
      { text: resolved.text, name: resolved.name, languageOverride: resolved.languageOverride },
      uniqueName,
    );
    return { library: nextLibrary, selection: { ref: { kind: 'user', id: created.id } } };
  });
}

/** ユーザーテキストの名前を付け直す。組み込みは対象外（`renameUserText`は該当idが無ければno-op）。 */
export function renameTextCommand(id: string, name: string): Command<KeydistAssets> {
  return textLibraryCommand('テキストの名前を変更する', (library) => renameUserText(library, id, name));
}

/**
 * ユーザーテキストを削除する。指定した持ち主の選択が消したテキストを指していた場合は
 * 既定の組み込みへフォールバックする（選択が指す実体が無くなった状態を残さないため）。
 */
export function deleteTextCommand(holder: TextSelectionHolder, id: string): Command<KeydistAssets> {
  return currentTextCommand(holder, 'テキストを削除する', ({ library, selection }) => {
    const nextLibrary = deleteUserText(library, id);
    if (nextLibrary === library) return { library, selection };
    const nextSelection = selection.ref.kind === 'user' && selection.ref.id === id
      ? { ref: DEFAULT_TEXT_REF }
      : selection;
    return { library: nextLibrary, selection: nextSelection };
  });
}

/**
 * 指定した持ち主の選択を切り替える。存在しない参照（削除済み・不正なid）は何もしない
 * （他のコマンドと同じ「存在しない対象は無視する」方針。#544 §8-5）。
 */
export function selectTextCommand(holder: TextSelectionHolder, ref: TextRef): Command<KeydistAssets> {
  const key = textSelectionAssetKey(holder);
  return (current) => {
    if (ref.kind === 'user' && !current.textLibrary.texts.some((text) => text.id === ref.id)) {
      return { kind: 'no-op' };
    }
    if (ref.kind === 'builtin' && builtinTextById(ref.id) === undefined) {
      return { kind: 'no-op' };
    }
    const next = withTextSelection(current[key], ref);
    if (next === current[key]) return { kind: 'no-op' };
    return { kind: 'applied', label: 'テキストを選ぶ', changes: { [key]: next } };
  };
}

/**
 * テキストの本文を書き換える。呼び出し側（`TextControl`）は**打鍵の瞬間の対象**（`ref`）を
 * 渡す。「適用時点の選択」を読み直す実装ではなく、これを明示的に運ぶのが肝心
 * （#544レビューで見つかった競合の再現: 同じユーザーテキストをタブA・Bで選択中、
 * タブBが入力→debounce待ちの間（既定400ms）にタブAが別のテキストへ選択を切り替えると、
 * その切り替えはタブ間同期でタブBの`assetsRef`にも先に届く。debounce完了時に「今の選択」を
 * 読み直す実装だと、そこはもうタブAが切り替えた後の選択になっており、タブBが打っていた
 * 内容が無関係な別テキストへ書き込まれてしまう。21回中3回この事故が再現した）。
 *
 * - `ref`がユーザーテキストを指す: そのidが今も手持ちにあれば、選択がどこを向いていようと
 *   構わずそのテキストをその場で編集する（上の事故そのものへの対策）。idが手持ちから
 *   消えていれば（他タブでの削除等）何もしない
 * - `ref`が組み込みを指す: **指定した持ち主の選択が今もその組み込みを指している時だけ**
 *   copy-on-writeする。選択が既に他へ移っていれば、この書き込みは宛先を失った古いdraftな
 *   ので何もしない（ここを外すと、選択が動いた後に遅れて届いた組み込みへの書き込みが
 *   無意味な2つ目のコピーを作ってしまう）
 */
export function setTextContentCommand(
  holder: TextSelectionHolder,
  ref: TextRef,
  text: string,
  generateId: TextIdGenerator,
): Command<KeydistAssets> {
  const key = textSelectionAssetKey(holder);
  return (current) => {
    const library = current.textLibrary;

    if (ref.kind === 'user') {
      const target = library.texts.find((entry) => entry.id === ref.id);
      if (target === undefined) return { kind: 'no-op' };
      const nextLibrary = editUserTextContent(library, ref.id, text);
      if (nextLibrary === library) return { kind: 'no-op' };
      return { kind: 'applied', label: 'テキストを変更する', changes: { textLibrary: nextLibrary } };
    }

    // 生の選択ではなく解決後の参照と比べる。選択が消えた自作テキストを指していて既定の
    // 組み込みへ戻って表示されている間も、その組み込みへの編集として複製を作るため
    // （#544 レビュー: 生の参照と比べると一致せず、打った内容が全部捨てられていた）
    const resolvedRef = resolveTextSelection(current[key], library).ref;
    if (resolvedRef.kind !== 'builtin' || resolvedRef.id !== ref.id) {
      return { kind: 'no-op' };
    }
    const builtin = builtinTextById(ref.id);
    if (builtin === undefined || builtin.text === text) return { kind: 'no-op' };

    const name = uniqueAutoTextName(library, deriveEditedTextName(builtin.name));
    const { library: nextLibrary, created } = appendCopiedUserText(library, generateId, { text, name });
    const nextSelection: TextSelectionState = { ref: { kind: 'user', id: created.id } };
    return {
      kind: 'applied',
      label: 'テキストを変更する',
      changes: { textLibrary: nextLibrary, [key]: nextSelection },
    };
  };
}

/**
 * 指定した持ち主が今使っているテキストの言語判定を手動で上書きする。`undefined`で
 * 自動判定へ戻す。組み込みは言語が固定なので、選択が組み込みを指している間は何もしない
 * （`resolveTextSelection`の`isBuiltin`参照。built-inにはそもそも上書きの入れ物が無い）。
 * ボタン操作による即時反映（debounceを挟まない）なので、`setTextContentCommand`と違い
 * 適用時点の選択を読んでよい（打鍵からの遅延が競合を生む余地が無いため）。
 */
export function setTextLanguageOverrideCommand(
  holder: TextSelectionHolder,
  override: TextLanguage | undefined,
): Command<KeydistAssets> {
  return currentTextCommand(holder, '言語判定を変更する', ({ library, selection }) => {
    const resolved = resolveTextSelection(selection, library);
    if (resolved.isBuiltin) return { library, selection };
    return { library: setUserTextLanguageOverride(library, resolved.ref.id, override), selection };
  });
}

/**
 * 1 Analyzerぶんの解析設定を書き換える（#544指示書「解析設定は資産として個人で保持する」）。
 * `options`は呼び出し側（`hosts/standalone`）が対象Analyzerの`Options`型で組み立てた値を
 * そのまま渡す（`engine`は個別Analyzerの型を知らないので`unknown`として受け取る。
 * `standalone-analyzer-options.ts`冒頭コメント参照）。
 */
export function setStandaloneAnalyzerOptionsCommand(
  analyzerId: string,
  options: unknown,
): Command<KeydistAssets> {
  return (current) => {
    const next = withStandaloneAnalyzerOptions(current.standaloneAnalyzerOptions, analyzerId, options);
    if (next === current.standaloneAnalyzerOptions) return { kind: 'no-op' };
    return {
      kind: 'applied',
      label: `解析設定を変更する: ${analyzerId}`,
      changes: { standaloneAnalyzerOptions: next },
    };
  };
}

/**
 * 集合対象Analyzer（Analyzer idで引く）の`analyzerSetSelections`だけに触れるコマンドの
 * 共通の骨組み。`compute`は「そのAnalyzerの今の選択」を受け取り、次の選択を返す
 * （不変条件の保証は`compute`側が呼ぶ`withSetSelectionSetupIds`/`withSetSelectionBaseline`が
 * 持つ。`analyzer-set-selection.ts`のコメント参照）。
 */
function analyzerSetSelectionCommand(
  label: string,
  analyzerId: string,
  compute: (current: SetSelectionState) => SetSelectionState,
): Command<KeydistAssets> {
  return (current) => {
    const currentSelection = analyzerSetSelectionFor(current.analyzerSetSelections, analyzerId);
    const nextSelection = compute(currentSelection);
    if (nextSelection === currentSelection) return { kind: 'no-op' };
    const next = withAnalyzerSetSelection(current.analyzerSetSelections, analyzerId, nextSelection);
    if (next === current.analyzerSetSelections) return { kind: 'no-op' };
    return { kind: 'applied', label: `${label}: ${analyzerId}`, changes: { analyzerSetSelections: next } };
  };
}

/**
 * 集合対象Analyzerの対象の集合（選んだSetup・並び順）を丸ごと差し替える（#544 Phase 3）。
 * 追加・削除・並び替えのどれもこの1本のコマンドを通す（`setupIds`の並びがそのまま
 * 表示順になる。`analyzer-set-selection.ts`の`withSetSelectionSetupIds`コメント参照。
 * 選択から基準が外れたら、同じコマンドの中で基準も一緒に外す）。
 */
export function setAnalyzerSetSelectionSetupIdsCommand(
  analyzerId: string,
  setupIds: readonly string[],
): Command<KeydistAssets> {
  return analyzerSetSelectionCommand(
    '対象の集合を変更する',
    analyzerId,
    (current) => withSetSelectionSetupIds(current, setupIds),
  );
}

/**
 * 集合対象Analyzerの基準（baseline）Setupを差し替える。`undefined`で「基準なし」にする
 * （比較表が使う。N感度など基準の概念を持たないAnalyzerは呼ばない）。
 */
export function setAnalyzerSetSelectionBaselineCommand(
  analyzerId: string,
  baselineSetupId: string | undefined,
): Command<KeydistAssets> {
  return analyzerSetSelectionCommand(
    '基準を変更する',
    analyzerId,
    (current) => withSetSelectionBaseline(current, baselineSetupId),
  );
}
