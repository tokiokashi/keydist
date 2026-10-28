import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { blankFaceLayoutDraft, contentOfFaceLayout, draftOf } from '#input/layouts/face-layout-edit.ts';
import type { FaceLayoutContent, KanaLayoutContent } from '#input/layouts/face-layout-file.ts';
import { importKanaLayoutFile } from '#input/layouts/import.ts';
import { KANA_COVERAGE_GROUPS } from '#input/layouts/kana-coverage.ts';
import { newUserLayoutId } from '#input/layouts/layout-edit.ts';
import { isKanaFaceUserLayout, type UserLayout } from '#input/layouts/user-layouts.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';
import { FaceLayoutForm, type FaceLayoutKindFieldsContext } from '../face-layout/FaceLayoutForm.tsx';
import { KANA_LAYOUT_LABEL } from './label.ts';
import './kana-layout.css';

const NEW = 'new';

export interface KanaLayoutEditorProps {
  /** 自作の配列。かなの種類の面の形だけを一覧に出す。 */
  readonly layouts: readonly UserLayout[];
  /** 保存の読み込みが済むまでは、配列が無いように見せない。 */
  readonly ready: boolean;
  /** ホームキーの照合に使う、選べる指の割り当て（組み込みと自作）。 */
  readonly fingerAssignments: readonly FingerAssignment[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCreate: (id: string, content: FaceLayoutContent) => void;
  readonly onUpdate: (id: string, content: FaceLayoutContent) => void;
  /** 書き出したJSONをファイルとして保存する。ブラウザの保存は `editors` が持てないので、appが渡す。 */
  readonly onDownload: (filename: string, text: string) => void;
  /** ローマ字配列の画面へのリンク。ルーターを使えるのは `app` だけなので、`app` が渡す */
  readonly RomajiLayoutLink: ComponentType<{ readonly children: ReactNode }>;
}

/** 濁点・半濁点の合成。かなの種類だけが持つ。 */
function CompositionFields({ draft, setDraft }: FaceLayoutKindFieldsContext) {
  return (
    <fieldset className="kana-layout-composition">
      <legend>濁点・半濁点</legend>
      <label className="face-layout-inline">
        <input
          type="checkbox"
          checked={draft.composition.dakuten}
          data-kana-composition="dakuten"
          onChange={(event) => setDraft({ ...draft, composition: { ...draft.composition, dakuten: event.currentTarget.checked } })}
        />
        濁点（゛）を後に打って合成する
      </label>
      <label className="face-layout-inline">
        <input
          type="checkbox"
          checked={draft.composition.handakuten}
          data-kana-composition="handakuten"
          onChange={(event) => setDraft({ ...draft, composition: { ...draft.composition, handakuten: event.currentTarget.checked } })}
        />
        半濁点（゜）を後に打って合成する
      </label>
    </fieldset>
  );
}

/** 全かなが打てるかの確認。ローマ字を経ずにかなを直接打つ種類だけに問う。 */
function CoverageSection({ check }: FaceLayoutKindFieldsContext) {
  return (
    <section className="kana-layout-coverage" aria-labelledby="kana-coverage-title" data-kana-coverage>
      <h3 id="kana-coverage-title">全かなが打てるか</h3>
      {check.uncovered === undefined ? (
        <p className="face-layout-note">定義に誤りがあるため、確かめられません。</p>
      ) : check.uncovered.length === 0 ? (
        <p className="face-layout-note" data-kana-coverage-result="all">
          清音・濁音・半濁音・小書き・長音・句読点の全部を打てます。
        </p>
      ) : (
        <>
          <p className="face-layout-warning" role="status" data-kana-coverage-result="missing">
            打てないかなが{check.uncovered.length}個あります
          </p>
          <ul className="kana-layout-uncovered">
            {KANA_COVERAGE_GROUPS.map((group) => {
              const missing = group.kana.filter((kana) => check.uncovered?.includes(kana));
              return missing.length === 0 ? null : (
                <li key={group.name}>
                  <strong>{group.name}</strong> <span data-kana-uncovered={group.name}>{missing.join(' ')}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * 面ごとに、切り替えのキー・打鍵の順序・キーごとの出力を決めて、かな配列を自作する・直す画面。
 * 書き込みは親が渡すコールバックを通す。選んでいる配列はこの画面の中だけの値で、保存しない。
 */
export function KanaLayoutEditor({
  layouts,
  ready,
  fingerAssignments,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCreate,
  onUpdate,
  onDownload,
  RomajiLayoutLink,
}: KanaLayoutEditorProps) {
  useHistoryShortcuts({ canUndo, canRedo, undo: onUndo, redo: onRedo });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [newCount, setNewCount] = useState(0);
  // 定義ファイルから取り込んだ、保存していない新しい配列の下書き
  const [imported, setImported] = useState<{ readonly content: KanaLayoutContent; readonly warnings: readonly string[] } | undefined>(undefined);
  const [importError, setImportError] = useState<{ readonly message: string; readonly romajiLayout: boolean } | undefined>(undefined);

  const editable = useMemo(() => layouts.filter(isKanaFaceUserLayout), [layouts]);

  // 選んでいた配列が元に戻すなどで無くなった時は、先頭の配列（無ければ新規作成）に移る
  const layout = selectedId === NEW ? undefined : (editable.find((candidate) => candidate.id === selectedId) ?? editable[0]);
  const isNew = layout === undefined;

  const initial = useMemo(() => {
    if (layout !== undefined) return draftOf(contentOfFaceLayout(layout));
    return imported === undefined ? blankFaceLayoutDraft() : draftOf(imported.content);
  }, [layout, imported]);
  const formKey = layout === undefined ? `new:${newCount}` : `${layout.id}:${JSON.stringify(initial)}`;

  const submit = (content: FaceLayoutContent) => {
    if (layout === undefined) {
      const id = newUserLayoutId();
      onCreate(id, content);
      setImported(undefined);
      setSelectedId(id);
    } else {
      onUpdate(layout.id, content);
    }
  };

  const importFile = async (file: File) => {
    const result = importKanaLayoutFile(file.name, await file.arrayBuffer());
    if (!result.ok) {
      setImportError({ message: result.message, romajiLayout: result.romajiLayout === true });
      return;
    }
    setImportError(undefined);
    setImported({ content: result.content, warnings: result.warnings });
    setSelectedId(NEW);
    setNewCount((count) => count + 1);
  };

  return (
    <article className="kana-layout face-layout" data-kana-layout-editor>
      <h1>{KANA_LAYOUT_LABEL}</h1>
      <p className="face-layout-note">面ごとに、切り替えのキーと打鍵の順序、キーごとの出力を決めて、かな配列を自作します。</p>
      <div className="face-layout-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          元に戻す
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>
          やり直す
        </button>
      </div>
      {!ready ? null : (
        <>
          <div className="face-layout-actions">
            {editable.length === 0 ? null : (
              <label>
                編集する配列
                <select value={layout?.id ?? NEW} data-kana-pick onChange={(event) => setSelectedId(event.currentTarget.value)}>
                  {editable.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {isNew ? <option value={NEW}>新しい配列</option> : null}
                </select>
              </label>
            )}
            <button
              type="button"
              data-kana-create
              onClick={() => {
                setImported(undefined);
                setImportError(undefined);
                setSelectedId(NEW);
                setNewCount((count) => count + 1);
              }}
            >
              新規作成
            </button>
            <label>
              DvorakJ・紅皿の定義ファイル
              <input
                type="file"
                accept=".txt,.bnz,.ini,.vil"
                data-kana-import-file
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
            <p className="face-layout-error" role="alert" data-kana-file-import="error">
              {importError.message}
              {importError.romajiLayout ? <RomajiLayoutLink>ローマ字配列の画面を開く</RomajiLayoutLink> : null}
            </p>
          )}
          {imported === undefined || !isNew ? null : (
            <div data-kana-file-import="ok">
              <p className="face-layout-note" role="status">
                定義ファイルから開いた、保存していない配列です。
              </p>
              {imported.warnings.length === 0 ? null : (
                <ul className="face-layout-problems" data-kana-file-warnings>
                  {imported.warnings.map((warning) => (
                    <li key={warning} className="face-layout-warning" role="status">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <h2>{isNew ? '新しい配列' : layout.name}</h2>
          <FaceLayoutForm
            key={formKey}
            initial={initial}
            fingerAssignments={fingerAssignments}
            isNew={isNew}
            onSubmit={submit}
            onDownload={onDownload}
            renderAfterFaces={(context) => <CompositionFields {...context} />}
            renderAfterHome={(context) => <CoverageSection {...context} />}
          />
        </>
      )}
    </article>
  );
}
