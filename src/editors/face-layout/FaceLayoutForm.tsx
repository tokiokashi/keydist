import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { blankFace, checkFaceLayout, draftOf, type DraftFace, type FaceLayoutCheck, type FaceLayoutDraft } from '#input/layouts/face-layout-edit.ts';
import { faceLayoutFileText, parseFaceLayoutFile, type FaceLayoutContent } from '#input/layouts/face-layout-file.ts';
import { faceIndexOfPath } from './face-editing.ts';
import type { FaceLayoutNotice, FaceLayoutProblem } from '#input/layouts/kana-face-layout.ts';
import { ignoredHomeKeyWarnings } from '#input/layouts/layout-edit.ts';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import { FINGERS, HOME_ROW, LEFT_COLUMN_KEYS, type FingerAssignment, type PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { HOME_KEY_RULE_DESCRIPTION } from '../home-key/home-key-text.ts';
import { faceSummary, keyLabel } from './face-editing.ts';
import { FacePanel, geometryOf, initialStandard, NoticeList, ProblemList } from './FacePanel.tsx';

/** 種類ごとの欄（かなの濁点・半濁点、英字のローマ字規則など）が、下書きと検査結果を読み書きするための引数。 */
export interface FaceLayoutKindFieldsContext {
  readonly draft: FaceLayoutDraft;
  readonly setDraft: Dispatch<SetStateAction<FaceLayoutDraft>>;
  readonly check: FaceLayoutCheck;
}

export interface FaceLayoutFormProps {
  readonly initial: FaceLayoutDraft;
  readonly fingerAssignments: readonly FingerAssignment[];
  readonly isNew: boolean;
  readonly onSubmit: (content: FaceLayoutContent) => void;
  readonly onDownload: (filename: string, text: string) => void;
  /** 面の欄の次に出す、種類ごとの欄 */
  readonly renderAfterFaces?: (context: FaceLayoutKindFieldsContext) => ReactNode;
  /** ホームキーの欄の次に出す、種類ごとの欄 */
  readonly renderAfterHome?: (context: FaceLayoutKindFieldsContext) => ReactNode;
}

/** 書き出すファイルの名前が空の時の既定。 */
const DEFAULT_FILE_NAME = { kana: 'かな配列', alpha: 'ローマ字配列' } as const;

/**
 * 面で定義する配列の編集欄。名前・面・ホームキー・JSONの貼り付けと書き出しは、かなの種類と英字の種類で共通で、
 * 種類ごとの欄は呼び出し側が渡す。入力中の値はこの中だけで持ち、保存を押した時に親へ渡す。
 */
export function FaceLayoutForm({ initial, fingerAssignments, isNew, onSubmit, onDownload, renderAfterFaces, renderAfterHome }: FaceLayoutFormProps) {
  const [draft, setDraft] = useState<FaceLayoutDraft>(initial);
  const [faceIndex, setFaceIndex] = useState(0);
  const [standard, setStandard] = useState<PhysicalKeyboardStandard>(() => initialStandard(initial));
  const [pasted, setPasted] = useState('');
  const [importResult, setImportResult] = useState<
    | { readonly ok: true; readonly notices: readonly FaceLayoutNotice[] }
    | { readonly ok: false; readonly problems: readonly FaceLayoutProblem[] }
    | undefined
  >(undefined);
  const [copyResult, setCopyResult] = useState<'copied' | 'failed' | undefined>(undefined);

  const check = useMemo(() => checkFaceLayout(draft), [draft]);
  const blocked = check.content === undefined;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const exportText = useMemo(() => (check.content === undefined ? undefined : faceLayoutFileText(check.content)), [check.content]);
  const shownIndex = Math.min(faceIndex, draft.faces.length - 1);
  const face = draft.faces[shownIndex]!;
  const homeKeySet = useMemo(() => new Set(Object.values(draft.homeKeys).filter((key) => key !== '')), [draft.homeKeys]);
  const homeKeyWarnings = useMemo(() => ignoredHomeKeyWarnings(draft.homeKeys, fingerAssignments), [draft.homeKeys, fingerAssignments]);
  const homeKeyCandidates = useMemo(() => {
    const geometry = geometryOf(standard);
    return [...(geometry.grid[HOME_ROW] ?? []).map((key) => key.id), ...LEFT_COLUMN_KEYS.filter((key) => geometry.keys.has(key))];
  }, [standard]);

  const problemsOfFace = (index: number) => check.problems.filter((problem) => faceIndexOfPath(problem.path) === index);
  const formProblems = check.problems.filter((problem) => faceIndexOfPath(problem.path) === undefined);

  const setFace = (next: DraftFace) => setDraft({ ...draft, faces: draft.faces.map((entry, index) => (index === shownIndex ? next : entry)) });
  const addFace = () => {
    setDraft({ ...draft, faces: [...draft.faces, blankFace()] });
    setFaceIndex(draft.faces.length);
  };
  const removeFace = () => {
    setDraft({ ...draft, faces: draft.faces.filter((_, index) => index !== shownIndex) });
    setFaceIndex(Math.max(0, shownIndex - 1));
  };

  const importPasted = () => {
    const result = parseFaceLayoutFile(pasted, draft.kind);
    if (!result.ok) {
      setImportResult({ ok: false, problems: result.problems });
      return;
    }
    const next = draftOf(result.layout);
    setDraft(next);
    setFaceIndex(0);
    setStandard(initialStandard(next));
    setImportResult({ ok: true, notices: result.notices });
  };

  const copy = async () => {
    if (exportText === undefined) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyResult('copied');
    } catch {
      setCopyResult('failed');
    }
  };

  return (
    <form
      className="face-layout-form"
      data-face-layout-form
      onSubmit={(event) => {
        event.preventDefault();
        if (check.content !== undefined && (isNew || dirty)) onSubmit(check.content);
      }}
    >
      <label className="face-layout-name">
        名前
        <input
          type="text"
          value={draft.name}
          aria-invalid={check.problems.some((problem) => problem.path === 'name')}
          data-face-name
          onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
        />
      </label>

      <fieldset className="face-layout-faces">
        <legend>面</legend>
        <div className="face-layout-face-list">
          {draft.faces.map((entry, index) => {
            const own = problemsOfFace(index);
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: 面は並びの番号が名前で、並べ替えを持たない
                key={index}
                type="button"
                aria-pressed={index === shownIndex}
                data-face-pick={index}
                data-has-problem={own.length > 0 || undefined}
                onClick={() => setFaceIndex(index)}
              >
                <span>面{index + 1}</span>
                <small>{faceSummary(entry, standard)}</small>
                {own.length > 0 ? <small className="face-layout-error">誤りあり</small> : null}
              </button>
            );
          })}
        </div>
        <div className="face-layout-actions">
          <button type="button" data-face-add onClick={addFace}>
            面を足す
          </button>
          <button type="button" data-face-remove disabled={draft.faces.length <= 1} onClick={removeFace}>
            選んだ面を消す
          </button>
          <label className="face-layout-inline">
            キーの並びの表示
            <select value={standard} data-face-standard onChange={(event) => setStandard(event.currentTarget.value as PhysicalKeyboardStandard)}>
              <option value="ansi">ANSI</option>
              <option value="jis">JIS</option>
            </select>
          </label>
        </div>
        <h3 className="face-layout-face-title">面{shownIndex + 1}</h3>
        <FacePanel
          kind={draft.kind}
          // 選ぶ面が替わったら、選んでいたキーと操作を持ち越さない
          key={shownIndex}
          face={face}
          standard={standard}
          homeKeys={homeKeySet}
          problems={problemsOfFace(shownIndex)}
          onChange={setFace}
        />
      </fieldset>

      {renderAfterFaces?.({ draft, setDraft, check })}

      <fieldset className="face-layout-home">
        <legend className="face-layout-label-row">
          ホームキー（任意）
          <InfoButton name="ホームキー" description={HOME_KEY_RULE_DESCRIPTION} />
        </legend>
        <div className="face-layout-home-grid">
          {FINGERS.map((finger) => {
            const value = draft.homeKeys[finger] ?? '';
            const stale = value !== '' && !homeKeyCandidates.includes(value);
            const warnings = homeKeyWarnings.filter((warning) => warning.finger === finger);
            return (
              <div key={finger}>
                <label>
                  {FINGER_LABEL[finger]}
                  <select
                    value={value}
                    aria-invalid={check.problems.some((problem) => problem.path === `homeKeys.${finger}`)}
                    data-face-home={finger}
                    onChange={(event) => setDraft({ ...draft, homeKeys: { ...draft.homeKeys, [finger]: event.currentTarget.value } })}
                  >
                    <option value="">指の割り当ての値</option>
                    {stale ? <option value={value}>{keyLabel(value, standard)}（選べるキーに無いキー）</option> : null}
                    {homeKeyCandidates.map((key) => (
                      <option key={key} value={key}>
                        {keyLabel(key, standard)}のキー
                      </option>
                    ))}
                  </select>
                </label>
                {warnings.map((warning) => (
                  <p key={warning.message} className="face-layout-warning" role="status" data-face-home-warning={finger}>
                    {warning.message}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </fieldset>

      {renderAfterHome?.({ draft, setDraft, check })}

      <NoticeList notices={check.notices} />
      <ProblemList problems={formProblems} severity="error" />

      <details className="face-layout-json" data-face-json>
        <summary>JSONの貼り付けと書き出し</summary>
        <label>
          貼り付ける定義
          <textarea
            rows={8}
            spellCheck={false}
            value={pasted}
            data-face-json-paste
            onChange={(event) => {
              setPasted(event.currentTarget.value);
              setImportResult(undefined);
            }}
          />
        </label>
        <div className="face-layout-actions">
          <button type="button" data-face-json-import disabled={pasted.trim() === ''} onClick={importPasted}>
            編集中の内容に取り込む
          </button>
        </div>
        {importResult === undefined ? null : importResult.ok ? (
          <>
            <p className="face-layout-note" role="status" data-face-import-result="ok">
              取り込みました。
            </p>
            <NoticeList notices={importResult.notices} />
          </>
        ) : (
          <>
            <p className="face-layout-error" role="alert" data-face-import-result="error">
              誤りがあるため、取り込みませんでした。
            </p>
            <ProblemList problems={importResult.problems} severity="error" />
          </>
        )}

        <label>
          書き出す定義
          <textarea
            rows={8}
            readOnly
            spellCheck={false}
            value={exportText ?? ''}
            placeholder="誤りが無くなると、ここに定義が出ます"
            data-face-json-export
          />
        </label>
        <div className="face-layout-actions">
          <button type="button" data-face-json-copy disabled={exportText === undefined} onClick={() => void copy()}>
            コピーする
          </button>
          <button
            type="button"
            data-face-json-download
            disabled={exportText === undefined}
            onClick={() => exportText !== undefined && onDownload(`${draft.name.trim() || DEFAULT_FILE_NAME[draft.kind]}.json`, exportText)}
          >
            ファイルに保存する
          </button>
          {copyResult === 'copied' ? <span className="face-layout-note">コピーしました</span> : null}
          {copyResult === 'failed' ? <span className="face-layout-warning">コピーできませんでした。上の欄から選んでコピーしてください</span> : null}
        </div>
      </details>

      <div className="face-layout-actions">
        <button type="submit" data-face-submit disabled={blocked || (!isNew && !dirty)}>
          {isNew ? '追加する' : '保存する'}
        </button>
      </div>
    </form>
  );
}
