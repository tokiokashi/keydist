import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { blankFaceLayoutDraft, contentOfFaceLayout, draftOf } from '#input/layouts/face-layout-edit.ts';
import type { AlphaLayoutContent, FaceLayoutContent } from '#input/layouts/face-layout-file.ts';
import { importRomajiLayoutFile } from '#input/layouts/import.ts';
import {
  chordOutputCount,
  contentOf,
  contentOfImported,
  hasBlockingProblem,
  isStageUserLayout,
  isImportedContent,
  layoutProblems,
  newUserLayoutId,
  normalizeContent,
  placedKeys,
  type LayoutProblem,
  type UserLayoutContent,
} from '#input/layouts/layout-edit.ts';
import { isAlphaFaceUserLayout, ROW_LABELS, ROW_LIMITS, type UserLayout } from '#input/layouts/user-layouts.ts';
import { allRomajiRules, type UserRomajiRule } from '#input/romaji/rules.ts';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import { physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';
import { FINGERS, HOME_ROW, QWERTY_LEGEND, type FingerAssignment } from '#input/shapes/geometry.ts';
import { ROMAJI_LAYOUT_LABEL } from './label.ts';
import './romaji-layout.css';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { HOME_KEY_RULE_DESCRIPTION } from '../home-key/home-key-text.ts';
import { FaceLayoutForm, type FaceLayoutKindFieldsContext } from '../face-layout/FaceLayoutForm.tsx';

/** 保存していない新しい配列。段の文字で作る */
const NEW = 'new';
/** 保存していない新しい配列。面で作る。種類は英字に決まる */
const NEW_FACE = 'new-face';

/** 新規作成の入力欄の初期値。ローマ字規則は先頭の組み込みの規則から始める。 */
const blankContent = (romaji: string): UserLayoutContent => ({ name: '', rows: ['', '', '', ''], romaji, homeKeys: {} });

/** 定義ファイルから取り込んだ下書き。 */
type ImportedDraft =
  | { readonly kind: 'stage'; readonly content: UserLayoutContent; readonly warnings: readonly string[] }
  | { readonly kind: 'face'; readonly content: AlphaLayoutContent; readonly warnings: readonly string[] };

export interface RomajiLayoutEditorProps {
  /** 自作の配列。段の形の配列と、英字の種類の面の形の配列を一覧に出す。 */
  readonly layouts: readonly UserLayout[];
  /** 自作のローマ字規則。組み込みの規則と並べて選べる。 */
  readonly rules: readonly UserRomajiRule[];
  /** 選べる指の割り当て（組み込みと自作）。ホームキーを担当しない割り当てを警告するために照合する。 */
  readonly fingerAssignments: readonly FingerAssignment[];
  /** 保存の読み込みが済むまでは、配列が無いように見せない。 */
  readonly ready: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCreate: (id: string, content: UserLayoutContent) => void;
  readonly onUpdate: (id: string, content: UserLayoutContent) => void;
  readonly onCreateFace: (id: string, content: FaceLayoutContent) => void;
  readonly onUpdateFace: (id: string, content: FaceLayoutContent) => void;
  /** 書き出したJSONをファイルとして保存する。ブラウザの保存は `editors` が持てないので、appが渡す。 */
  readonly onDownload: (filename: string, text: string) => void;
  /** かな配列の画面へのリンク。ルーターを使えるのは `app` だけなので、`app` が渡す */
  readonly KanaLayoutLink: ComponentType<{ readonly children: ReactNode }>;
}

function Problems({ problems }: { readonly problems: readonly LayoutProblem[] }) {
  return (
    <>
      {problems.map((problem) => (
        <p
          key={problem.message}
          className={problem.severity === 'error' ? 'romaji-layout-error' : 'romaji-layout-warning'}
          role={problem.severity === 'error' ? 'alert' : 'status'}
          data-layout-problem={problem.severity}
        >
          {problem.message}
        </p>
      ))}
    </>
  );
}

interface LayoutFormProps {
  readonly initial: UserLayoutContent;
  readonly isNew: boolean;
  readonly fingerAssignments: readonly FingerAssignment[];
  readonly ruleOptions: readonly { readonly id: string; readonly name: string }[];
  readonly onSubmit: (content: UserLayoutContent) => void;
}

/** 取り込んだ配列の段の文字と、段の文字では表せない出力。ここでは直せない。 */
function ImportedParts({ content }: { readonly content: UserLayoutContent }) {
  const chords = chordOutputCount(content.sequences ?? []);
  return (
    <fieldset className="romaji-layout-rows" data-layout-imported-parts>
      <legend>段の文字（取り込んだ内容）</legend>
      {ROW_LABELS.map((label, index) => (
        <div key={label} className="romaji-layout-imported-line">
          <span>{label}</span>
          <code className="romaji-layout-imported-row" data-layout-imported-row={index}>
            {content.rows[index]}
          </code>
        </div>
      ))}
      <p className="romaji-layout-note" data-layout-imported-summary>
        同時押しなどで出す出力が{chords}件あります。段の文字・表示ラベルと合わせて、ここでは直せません。
      </p>
    </fieldset>
  );
}

interface RomajiRuleFieldProps extends FaceLayoutKindFieldsContext {
  readonly ruleOptions: readonly { readonly id: string; readonly name: string }[];
}

/** 面の形の推奨のローマ字規則。英字の種類だけが持つ。 */
function RomajiRuleField({ draft, setDraft, ruleOptions }: RomajiRuleFieldProps) {
  const known = ruleOptions.some((option) => option.id === draft.romaji);
  return (
    <>
      <label className="romaji-layout-romaji">
        推奨のローマ字規則
        <select
          value={draft.romaji ?? ''}
          data-layout-romaji
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDraft({ ...draft, romaji: value === '' ? undefined : value });
          }}
        >
          <option value="">指定しない</option>
          {draft.romaji === undefined || known ? null : <option value={draft.romaji}>見つからない規則</option>}
          {ruleOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <p className="romaji-layout-note">
        日本語のテキストを打つ時に、この配列が推奨する規則です。条件でローマ字規則を指定した場合は、条件の指定が優先されます。
      </p>
      {draft.romaji === undefined || known ? null : (
        <p className="romaji-layout-warning" role="status" data-layout-problem="warning">
          選んでいたローマ字規則が見つかりません。全体の値の規則で打ちます。規則を選び直すと、その規則で打ちます
        </p>
      )}
    </>
  );
}

/** 入力中の値はこの中だけで持ち、保存を押した時に親へ渡す。 */
function LayoutForm({ initial, isNew, fingerAssignments, ruleOptions, onSubmit }: LayoutFormProps) {
  const [draft, setDraft] = useState<UserLayoutContent>(initial);
  const knownRuleIds = useMemo(() => new Set(ruleOptions.map((option) => option.id)), [ruleOptions]);
  const problems = useMemo(() => layoutProblems(draft, knownRuleIds, fingerAssignments), [draft, knownRuleIds, fingerAssignments]);
  const normalized = useMemo(() => normalizeContent(draft), [draft]);
  const imported = isImportedContent(initial);
  const dirty = JSON.stringify(normalized) !== JSON.stringify(normalizeContent(initial));
  const blocked = hasBlockingProblem(problems);

  const problemsAt = (match: (problem: LayoutProblem) => boolean) => problems.filter(match);
  const setRow = (index: number, value: string) => {
    const rows = [...draft.rows] as [string, string, string, string];
    rows[index] = value;
    setDraft({ ...draft, rows });
  };
  const setHomeKey = (finger: (typeof FINGERS)[number], value: string) => setDraft({ ...draft, homeKeys: { ...draft.homeKeys, [finger]: value } });

  // 選べるホームキーは、ホーム段に置いたキー。段を縮めて外れた値は、不備として示すために選択肢に残す
  const homeRowKeys = placedKeys(normalized.rows).filter((entry) => entry.row === HOME_ROW);

  return (
    <form
      className="romaji-layout-form"
      data-layout-form
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked && (isNew || dirty)) onSubmit(draft);
      }}
    >
      <label className="romaji-layout-name">
        名前
        <input
          type="text"
          value={draft.name}
          aria-invalid={problemsAt((problem) => problem.field.kind === 'name').length > 0}
          onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
        />
      </label>
      <Problems problems={problemsAt((problem) => problem.field.kind === 'name')} />

      {imported ? (
        <ImportedParts content={normalized} />
      ) : (
        <fieldset className="romaji-layout-rows">
          <legend>段の文字</legend>
          <p className="romaji-layout-note">数字段は空にすると、QWERTYと同じ数字段になります。</p>
          {ROW_LABELS.map((label, index) => {
            const own = problemsAt((problem) => problem.field.kind === 'row' && problem.field.index === index);
            const length = [...normalized.rows[index]!].length;
            return (
              <div key={label} className="romaji-layout-row">
                <label>
                  {label}
                  <input
                    type="text"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={QWERTY_LEGEND[index]}
                    value={draft.rows[index]}
                    aria-invalid={own.length > 0}
                    data-layout-row={index}
                    onChange={(event) => setRow(index, event.currentTarget.value)}
                  />
                </label>
                <span className="romaji-layout-count">
                  {length} / {ROW_LIMITS[index]}
                </span>
                <Problems problems={own} />
              </div>
            );
          })}
          <Problems problems={problemsAt((problem) => problem.field.kind === 'letter-rows')} />
          <Problems problems={problemsAt((problem) => problem.field.kind === 'duplicate')} />
        </fieldset>
      )}

      <fieldset className="romaji-layout-home">
        <legend className="romaji-layout-label-row">
          ホームキー（任意）
          <InfoButton name="ホームキー" description={HOME_KEY_RULE_DESCRIPTION} />
        </legend>
        <div className="romaji-layout-home-grid">
          {FINGERS.map((finger) => {
            const value = draft.homeKeys[finger] ?? '';
            const own = problemsAt((problem) => problem.field.kind === 'home-key' && problem.field.finger === finger);
            const options = homeRowKeys;
            const stale = value !== '' && !options.some((option) => option.keyId === value);
            return (
              <div key={finger} className="romaji-layout-home-item">
                <label>
                  {FINGER_LABEL[finger]}
                  <select
                    value={value}
                    aria-invalid={own.length > 0}
                    data-layout-home={finger}
                    onChange={(event) => setHomeKey(finger, event.currentTarget.value)}
                  >
                    <option value="">指の割り当ての値</option>
                    {stale ? <option value={value}>{physicalKeyDisplayLabel(value)}（段に無いキー）</option> : null}
                    {options.map((option) => (
                      <option key={option.keyId} value={option.keyId}>
                        {option.char}（{physicalKeyDisplayLabel(option.keyId)}のキー）
                      </option>
                    ))}
                  </select>
                </label>
                <Problems problems={own} />
              </div>
            );
          })}
        </div>
      </fieldset>

      <label className="romaji-layout-romaji">
        推奨のローマ字規則
        <select
          value={draft.romaji ?? ''}
          data-layout-romaji
          onChange={(event) => {
            const { romaji: _removed, ...rest } = draft;
            const value = event.currentTarget.value;
            setDraft(value === '' ? rest : { ...rest, romaji: value });
          }}
        >
          <option value="">指定しない</option>
          {draft.romaji === undefined || knownRuleIds.has(draft.romaji) ? null : <option value={draft.romaji}>見つからない規則</option>}
          {ruleOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <p className="romaji-layout-note">
        日本語のテキストを打つ時に、この配列が推奨する規則です。条件でローマ字規則を指定した場合は、条件の指定が優先されます。
      </p>
      <Problems problems={problemsAt((problem) => problem.field.kind === 'romaji')} />
      <Problems problems={problemsAt((problem) => problem.field.kind === 'build')} />

      <div className="romaji-layout-actions">
        <button type="submit" data-layout-submit disabled={blocked || (!isNew && !dirty)}>
          {isNew ? '追加する' : '保存する'}
        </button>
        {blocked ? <span className="romaji-layout-note">保存できない入力があります</span> : null}
      </div>
    </form>
  );
}

/**
 * 段の文字、または面で、名前・ホームキー・ローマ字規則を入れて、ローマ字配列を自作する・直す画面。
 * 書き込みは親が渡すコールバックを通す。選んでいる配列はこの画面の中だけの値で、保存しない。
 */
export function RomajiLayoutEditor({
  layouts,
  rules,
  fingerAssignments,
  ready,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCreate,
  onUpdate,
  onCreateFace,
  onUpdateFace,
  onDownload,
  KanaLayoutLink,
}: RomajiLayoutEditorProps) {
  useHistoryShortcuts({ canUndo, canRedo, undo: onUndo, redo: onRedo });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [newCount, setNewCount] = useState(0);
  // 定義ファイルから取り込んだ、保存していない新しい配列の下書き。段の形か、面の形のどちらか
  const [imported, setImported] = useState<ImportedDraft | undefined>(undefined);
  const [importError, setImportError] = useState<{ readonly message: string; readonly kanaLayout: boolean } | undefined>(undefined);

  const editable = useMemo(() => layouts.filter((candidate) => isStageUserLayout(candidate) || isAlphaFaceUserLayout(candidate)), [layouts]);
  const ruleOptions = useMemo(() => allRomajiRules([...rules]), [rules]);
  const defaultRomaji = ruleOptions[0]?.id ?? 'kunrei';

  // 選んでいた配列が元に戻すなどで無くなった時は、先頭の配列（無ければ新規作成）に移る
  const creating = selectedId === NEW || selectedId === NEW_FACE;
  const layout = creating ? undefined : (editable.find((candidate) => candidate.id === selectedId) ?? editable[0]);
  const isNew = layout === undefined;
  // 開いている（または新しく作る）配列の形。面の形の配列は英字の種類に決まる
  const faceLayout = layout === undefined ? undefined : isAlphaFaceUserLayout(layout) ? layout : undefined;
  const faceForm = faceLayout !== undefined || (isNew && selectedId === NEW_FACE);
  const stageLayout = layout !== undefined && isStageUserLayout(layout) ? layout : undefined;

  const initial = stageLayout !== undefined ? contentOf(stageLayout) : imported?.kind === 'stage' ? imported.content : blankContent(defaultRomaji);
  const faceInitial = useMemo(() => {
    if (faceLayout !== undefined) return draftOf(contentOfFaceLayout(faceLayout));
    // 取り込んだ面の形は推奨のローマ字規則を持たないので、段の形の取り込みと同じく先頭の規則から始める
    if (imported?.kind === 'face') return draftOf({ ...imported.content, romaji: defaultRomaji });
    return blankFaceLayoutDraft('alpha', defaultRomaji);
  }, [faceLayout, imported, defaultRomaji]);
  const formKey = layout === undefined ? `new:${newCount}` : `${layout.id}:${JSON.stringify(layout)}`;

  const submit = (content: UserLayoutContent) => {
    if (stageLayout === undefined) {
      const id = newUserLayoutId();
      onCreate(id, content);
      setImported(undefined);
      setSelectedId(id);
    } else {
      onUpdate(stageLayout.id, content);
    }
  };

  const submitFace = (content: FaceLayoutContent) => {
    if (faceLayout === undefined) {
      const id = newUserLayoutId();
      onCreateFace(id, content);
      setImported(undefined);
      setSelectedId(id);
    } else {
      onUpdateFace(faceLayout.id, content);
    }
  };

  const importFile = async (file: File) => {
    const result = importRomajiLayoutFile(file.name, await file.arrayBuffer());
    if (!result.ok) {
      setImportError({ message: result.message, kanaLayout: result.kanaLayout === true });
      return;
    }
    setImportError(undefined);
    if (result.kind === 'face') {
      setImported({ kind: 'face', content: result.content, warnings: result.warnings });
      setSelectedId(NEW_FACE);
    } else {
      setImported({ kind: 'stage', content: contentOfImported(result.layout, defaultRomaji), warnings: result.layout.warnings });
      setSelectedId(NEW);
    }
    setNewCount((count) => count + 1);
  };

  return (
    <article className="romaji-layout face-layout" data-romaji-layout-editor>
      <h1>{ROMAJI_LAYOUT_LABEL}</h1>
      <p className="romaji-layout-note">ローマ字配列を自作します。作った配列は、Analyzerの対象に選べます。</p>
      <div className="romaji-layout-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          元に戻す
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>
          やり直す
        </button>
      </div>
      {!ready ? null : (
        <>
          <div className="romaji-layout-actions">
            {editable.length === 0 ? null : (
              <label>
                編集する配列
                <select value={layout?.id ?? (faceForm ? NEW_FACE : NEW)} data-layout-pick onChange={(event) => setSelectedId(event.currentTarget.value)}>
                  {editable.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {isNew ? <option value={faceForm ? NEW_FACE : NEW}>{faceForm ? '新しい配列（面）' : '新しい配列（段の文字）'}</option> : null}
                </select>
              </label>
            )}
            <button
              type="button"
              data-layout-create
              onClick={() => {
                setImported(undefined);
                setImportError(undefined);
                setSelectedId(NEW);
                setNewCount((count) => count + 1);
              }}
            >
              段の文字で新規作成
            </button>
            <button
              type="button"
              data-layout-create-face
              onClick={() => {
                setImported(undefined);
                setImportError(undefined);
                setSelectedId(NEW_FACE);
                setNewCount((count) => count + 1);
              }}
            >
              面で新規作成
            </button>
            <label>
              DvorakJ・Vial・紅皿の定義ファイル
              <input
                type="file"
                accept=".txt,.vil,.bnz,.ini"
                data-layout-import-file
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  // 同じファイルをもう一度選んでも変更として届くように、選択を空に戻す
                  if (file !== undefined) void importFile(file).finally(() => (input.value = ''));
                }}
              />
            </label>
          </div>
          {importError === undefined ? null : (
            <p className="romaji-layout-error" role="alert" data-layout-file-import="error">
              {importError.message}
              {importError.kanaLayout ? <KanaLayoutLink>かな配列の画面を開く</KanaLayoutLink> : null}
            </p>
          )}
          {imported === undefined || !isNew || faceForm !== (imported.kind === 'face') ? null : (
            <div data-layout-file-import="ok">
              <p className="romaji-layout-note" role="status">
                定義ファイルから開いた、保存していない配列です。
              </p>
              {imported.warnings.length === 0 ? null : (
                <ul className="romaji-layout-problems" data-layout-file-warnings>
                  {imported.warnings.map((warning) => (
                    <li key={warning} className="romaji-layout-warning" role="status">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <h2>{isNew ? '新しい配列' : layout.name}</h2>
          {faceForm ? (
            <FaceLayoutForm
              key={formKey}
              initial={faceInitial}
              isNew={isNew}
              fingerAssignments={fingerAssignments}
              onSubmit={submitFace}
              onDownload={onDownload}
              renderAfterHome={(context) => <RomajiRuleField {...context} ruleOptions={ruleOptions} />}
            />
          ) : (
            <LayoutForm key={formKey} initial={initial} isNew={isNew} fingerAssignments={fingerAssignments} ruleOptions={ruleOptions} onSubmit={submit} />
          )}
        </>
      )}
    </article>
  );
}
