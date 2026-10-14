import { useMemo, useState } from 'react';
import {
  contentOf,
  hasBlockingProblem,
  isEditableUserLayout,
  layoutProblems,
  newUserLayoutId,
  normalizeContent,
  placedKeys,
  type LayoutProblem,
  type UserLayoutContent,
} from '#input/layouts/layout-edit.ts';
import { ROW_LABELS, ROW_LIMITS, type UserLayout } from '#input/layouts/user-layouts.ts';
import { allRomajiRules, type UserRomajiRule } from '#input/romaji/rules.ts';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import { physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';
import { FINGERS, HOME_ROW, QWERTY_LEGEND } from '#input/shapes/geometry.ts';
import { ROMAJI_LAYOUT_LABEL } from './label.ts';
import './romaji-layout.css';

const NEW = 'new';

/** 新規作成の入力欄の初期値。ローマ字規則は先頭の組み込みの規則から始める。 */
const blankContent = (romaji: string): UserLayoutContent => ({ name: '', rows: ['', '', '', ''], romaji, homeKeys: {} });

export interface RomajiLayoutEditorProps {
  /** 自作の配列。取り込み形式の配列は一覧に出さず、直せる配列だけを扱う。 */
  readonly layouts: readonly UserLayout[];
  /** 自作のローマ字規則。組み込みの規則と並べて選べる。 */
  readonly rules: readonly UserRomajiRule[];
  /** 保存の読み込みが済むまでは、配列が無いように見せない。 */
  readonly ready: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCreate: (id: string, content: UserLayoutContent) => void;
  readonly onUpdate: (id: string, content: UserLayoutContent) => void;
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
  readonly ruleOptions: readonly { readonly id: string; readonly name: string }[];
  readonly onSubmit: (content: UserLayoutContent) => void;
}

/** 入力中の値はこの中だけで持ち、保存を押した時に親へ渡す。 */
function LayoutForm({ initial, isNew, ruleOptions, onSubmit }: LayoutFormProps) {
  const [draft, setDraft] = useState<UserLayoutContent>(initial);
  const knownRuleIds = useMemo(() => new Set(ruleOptions.map((option) => option.id)), [ruleOptions]);
  const problems = useMemo(() => layoutProblems(draft, knownRuleIds), [draft, knownRuleIds]);
  const normalized = useMemo(() => normalizeContent(draft), [draft]);
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

      <fieldset className="romaji-layout-rows">
        <legend>段の文字</legend>
        <p className="romaji-layout-note">
          キーに置く文字を、左から順に続けて入力します。数字段は空にすると、QWERTYと同じ数字段になります。
        </p>
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
              <span className="romaji-layout-count">{length} / {ROW_LIMITS[index]}</span>
              <Problems problems={own} />
            </div>
          );
        })}
        <Problems problems={problemsAt((problem) => problem.field.kind === 'letter-rows')} />
        <Problems problems={problemsAt((problem) => problem.field.kind === 'duplicate')} />
      </fieldset>

      <fieldset className="romaji-layout-home">
        <legend>ホームキー（任意）</legend>
        <p className="romaji-layout-note">
          指ごとに、この配列が前提とするホームキーを決めます。指定した指は、指の割り当てのホームキーより、ここでの指定が優先されます。指定しない指は、指の割り当ての値を使います。
        </p>
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
                      <option key={option.keyId} value={option.keyId}>{option.char}（{physicalKeyDisplayLabel(option.keyId)}のキー）</option>
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
          value={draft.romaji}
          data-layout-romaji
          onChange={(event) => setDraft({ ...draft, romaji: event.currentTarget.value })}
        >
          {knownRuleIds.has(draft.romaji) ? null : <option value={draft.romaji}>見つからない規則</option>}
          {ruleOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      <p className="romaji-layout-note">
        日本語のテキストを打つ時に、この配列が推奨する規則です。条件でローマ字規則を指定した場合は、条件の指定が優先されます。
      </p>
      <Problems problems={problemsAt((problem) => problem.field.kind === 'romaji')} />
      <Problems problems={problemsAt((problem) => problem.field.kind === 'build')} />

      <div className="romaji-layout-actions">
        <button type="submit" data-layout-submit disabled={blocked || (!isNew && !dirty)}>{isNew ? '追加する' : '保存する'}</button>
        {blocked ? <span className="romaji-layout-note">保存できない入力があります</span> : null}
      </div>
    </form>
  );
}

/**
 * 名前・4段の文字・ホームキー・ローマ字規則を入れて、ローマ字配列を自作する・直す画面。
 * 書き込みは親が渡すコールバックを通す。選んでいる配列はこの画面の中だけの値で、保存しない。
 */
export function RomajiLayoutEditor({
  layouts,
  rules,
  ready,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCreate,
  onUpdate,
}: RomajiLayoutEditorProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [newCount, setNewCount] = useState(0);

  const editable = useMemo(() => layouts.filter(isEditableUserLayout), [layouts]);
  const importedCount = layouts.length - editable.length;
  const ruleOptions = useMemo(() => allRomajiRules([...rules]), [rules]);

  // 選んでいた配列が元に戻すなどで無くなった時は、先頭の配列（無ければ新規作成）に移る
  const layout = selectedId === NEW ? undefined : editable.find((candidate) => candidate.id === selectedId) ?? editable[0];
  const isNew = layout === undefined;

  const initial = layout === undefined ? blankContent(ruleOptions[0]?.id ?? 'kunrei') : contentOf(layout);
  const formKey = layout === undefined ? `new:${newCount}` : `${layout.id}:${JSON.stringify(initial)}`;

  const submit = (content: UserLayoutContent) => {
    if (layout === undefined) {
      const id = newUserLayoutId();
      onCreate(id, content);
      setSelectedId(id);
    } else {
      onUpdate(layout.id, content);
    }
  };

  return (
    <article className="romaji-layout" data-romaji-layout-editor>
      <h1>{ROMAJI_LAYOUT_LABEL}</h1>
      <p className="romaji-layout-note">
        名前と4段の文字を入力して、ローマ字配列を自作します。作った配列は、Analyzerの対象に選べます。
      </p>
      <div className="romaji-layout-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>元に戻す</button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>やり直す</button>
      </div>
      {!ready ? null : (
        <>
          <div className="romaji-layout-actions">
            {editable.length === 0 ? null : (
              <label>
                編集する配列
                <select
                  value={layout?.id ?? NEW}
                  data-layout-pick
                  onChange={(event) => setSelectedId(event.currentTarget.value)}
                >
                  {editable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  {isNew ? <option value={NEW}>新しい配列</option> : null}
                </select>
              </label>
            )}
            <button
              type="button"
              data-layout-create
              onClick={() => { setSelectedId(NEW); setNewCount((count) => count + 1); }}
            >
              新規作成
            </button>
          </div>
          {importedCount === 0 ? null : (
            <p className="romaji-layout-note">
              定義ファイルから取り込んだ配列（{importedCount}件）は、ここでは直せません。削除は「自作の配列・規則」で行えます。
            </p>
          )}
          <h2>{isNew ? '新しい配列' : layout.name}</h2>
          <LayoutForm key={formKey} initial={initial} isNew={isNew} ruleOptions={ruleOptions} onSubmit={submit} />
        </>
      )}
    </article>
  );
}
