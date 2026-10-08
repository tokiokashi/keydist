import { useEffect, useId, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import {
  createTextCommand,
  deleteTextCommand,
  duplicateTextCommand,
  markTextsSeenCommand,
  renameTextCommand,
  selectTextCommand,
  setTextLanguageOverrideCommand,
  type KeydistAssets,
  type TextSelectionHolder,
} from '#engine/commands.ts';
import { BUILTIN_TEXTS } from '#input/text/builtin.ts';
import type { TextIdGenerator, TextLibrary } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { countTextCharacters } from '#input/text/char-count.ts';
import type { TextLanguage } from '#input/text/language.ts';
import type { TextRef, TextSelectionState } from '#input/text/selection.ts';
import './context-bar.css';

export type TextContentCommit = ((value: { readonly ref: TextRef; readonly text: string }) => void) & {
  /**
   * 自分の書き込みで、選択が組み込み`from`から複製`to`へ移ったか。他タブが作った複製へ選択が
   * 移った場合は含まない（下書きを保つかの判定に使う）。
   */
  readonly wasRedirected: (from: TextRef, to: TextRef) => boolean;
};

/**
 * 文脈バーのテキストのチップ（docs/architecture.md「文脈バー」）。閉じている時は1行で
 * 今のテキストの名前と言語だけを出し、開いた時だけ選択・編集を出す。
 *
 * 書き込みはすべて `dispatch` のコマンドを通す。本文だけは打鍵ごとに書かず、
 * 呼び出し元（`app`）が間引いてから書く（`onTextContentCommit`）。
 */
export interface TextChipProps {
  readonly holder: TextSelectionHolder;
  readonly textLibrary: TextLibrary;
  readonly selection: TextSelectionState;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly generateTextId: TextIdGenerator;
  /**
   * 本文の変更を間引いてから資産へ反映する。値は `{ ref, text }` の組で渡す: 打鍵の瞬間に
   * どのテキストへ向けた変更かを捕まえておかないと、待っている間に選択が切り替わった時に
   * 別のテキストへ書き込んでしまう（`engine/commands.ts` の `setTextContentCommand` 参照）。
   */
  readonly onTextContentCommit: TextContentCommit;
}

const LIST_VIEW_KEYS: ReadonlySet<string> = new Set(['Enter', ' ', 'F4']);
/** 閉じた一覧では、素の↑↓は一覧を開かず値を動かすだけ。Altを添えた時だけ一覧が開く。 */
const LIST_OPEN_ARROW_KEYS: ReadonlySet<string> = new Set(['ArrowDown', 'ArrowUp']);

function refKey(ref: TextSelectionState['ref']): string {
  return `${ref.kind}:${ref.id}`;
}

const LANGUAGE_OVERRIDE_OPTIONS: readonly { readonly value: 'auto' | TextLanguage; readonly label: string }[] = [
  { value: 'auto', label: '自動で判定' },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: '英語' },
];

function languageLabel(language: TextLanguage): string {
  return language === 'ja' ? '日本語' : '英語';
}

/** 文字数は確定した本文（資産の値）から数える。打鍵の下書きは確定まで反映しない（解析が見る量と揃える）。 */
function formatTextCount(count: number): string {
  return `${new Intl.NumberFormat('ja-JP').format(count)}字`;
}

export function TextChip(props: TextChipProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const resolved = resolveTextSelection(props.selection, props.textLibrary);
  // 競合で選ばれずに残ったコピーがまだ見られていない間、チップに点を出す。
  // 文脈バーが狭くてキー名や言語を隠す時も、チップ自体は残るので点は見える。
  const hasUnseen = props.textLibrary.texts.some((text) => text.unseen === true);

  // 外を押すと閉じる（開いたままだと図に被るため）。
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    rootRef.current?.querySelector<HTMLElement>('select, textarea')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="text-chip-root"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="context-chip text-chip"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={resolved.name}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="context-chip-key">テキスト</span>
        <span className="context-chip-value">{resolved.name}</span>
        <span className="text-chip-count">{formatTextCount(countTextCharacters(resolved.text))}</span>
        {hasUnseen ? (
          <span className="text-chip-unseen" role="img" aria-label="新しいテキストがある" title="新しいテキストがある" />
        ) : null}
        <span className="text-chip-language">{languageLabel(resolved.language)}</span>
        <svg className="context-chip-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="context-popover text-chip-panel" id={panelId} role="dialog" aria-label="テキストの選択と編集">
          <TextEditor {...props} />
        </div>
      ) : null}
    </div>
  );
}

function TextEditor({
  holder,
  textLibrary,
  selection,
  dispatch,
  generateTextId,
  onTextContentCommit,
}: TextChipProps) {
  const resolved = resolveTextSelection(selection, textLibrary);

  // 本文は見た目へ即座に反映し（controlled textarea）、資産への反映は間引く。
  // 資産側の値が変わったら下書きを合わせる。effectでなく描画中に合わせるのは、effectだと
  // 「新しい資産で描いたが下書きは古い値」の画面が1フレーム確定し、その間の入力が
  // 古い値の後ろへ足されるため。resolved.textは毎回作り直す値なので、比べるのは文字列。
  //
  // 揃え直さない場合が1つある。組み込みを書き換えた自分の書き込みで選択が複製へ移った時、その書き込みの
  // 後・描画の前に打った文字は下書きにだけあり、複製の保存値（書き込んだ時点の本文）には無い。
  // 保存値へ揃えるとその文字が消える。「自分の書き込みで移った」かは書き込み側
  // （`onTextContentCommit.wasRedirected`）が知っているので、それに従う。他タブが作った複製へ移った
  // 場合や他タブの書き換えで揃う経路は従来どおり保存値へ揃える。
  const currentKey = refKey(resolved.ref);
  const [textDraft, setTextDraft] = useState(resolved.text);
  const [textDraftSource, setTextDraftSource] = useState({ text: resolved.text, ref: resolved.ref });
  if (textDraftSource.text !== resolved.text || refKey(textDraftSource.ref) !== currentKey) {
    const movedByOwnWrite =
      textDraftSource.ref.kind === 'builtin' &&
      resolved.ref.kind === 'user' &&
      onTextContentCommit.wasRedirected(textDraftSource.ref, resolved.ref);
    setTextDraftSource({ text: resolved.text, ref: resolved.ref });
    if (textDraftSource.text !== resolved.text && !(movedByOwnWrite && textDraft !== resolved.text)) {
      setTextDraft(resolved.text);
    }
  }

  const [renameDraft, setRenameDraft] = useState(resolved.name);
  const [renameDraftSource, setRenameDraftSource] = useState(resolved.name);
  if (renameDraftSource !== resolved.name) {
    setRenameDraftSource(resolved.name);
    setRenameDraft(resolved.name);
  }

  // 名前は欄を離れた時に書く。チップの外を押して閉じると欄ごと外れてblurが来ないことがあるので、
  // 外れる時にも書く（「元に戻す」を押した時もチップの外なので、ここで確定してから戻る）。
  // 最新の下書きと宛先はrefで持つ（外れる時のcleanupは、最後の描画の値を読む必要がある）。
  const renameRef = useRef({ draft: renameDraft, id: resolved.ref.id, name: resolved.name, isBuiltin: resolved.isBuiltin });
  renameRef.current = { draft: renameDraft, id: resolved.ref.id, name: resolved.name, isBuiltin: resolved.isBuiltin };
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const commitRename = () => {
    const { draft, id, name, isBuiltin } = renameRef.current;
    if (isBuiltin || draft === name || draft.trim() === '') return;
    // 同じ値を2度書かないよう、書いた値を手持ちの名前として覚える（blurと外れる時の両方が来る場合）。
    renameRef.current = { ...renameRef.current, name: draft };
    dispatchRef.current(renameTextCommand(id, draft));
  };
  const commitRenameRef = useRef(commitRename);
  commitRenameRef.current = commitRename;
  useEffect(() => () => commitRenameRef.current(), []);

  // 一覧を見た時に「新しい」印を外す。一覧を開いた瞬間に外すと「新しい」が読めないので、
  // 触ってから離れる時（欄を離れる・チップを閉じる）に外す。見えていたテキストだけを外し、
  // 見ている間に届いた別のコピーの印は残す。
  const viewedUnseenRef = useRef<readonly string[]>([]);
  const commitViewed = () => {
    const ids = viewedUnseenRef.current;
    if (ids.length === 0) return;
    viewedUnseenRef.current = [];
    dispatchRef.current(markTextsSeenCommand(ids));
  };
  const commitViewedRef = useRef(commitViewed);
  commitViewedRef.current = commitViewed;
  useEffect(() => () => commitViewedRef.current(), []);
  const beginViewingList = () => {
    viewedUnseenRef.current = textLibrary.texts.filter((text) => text.unseen === true).map((text) => text.id);
  };

  return (
    <div className="text-editor">
      <div className="text-editor-row">
        <select
          className="text-editor-select"
          value={refKey(resolved.ref)}
          onChange={(event) => {
            // 組み込みのidは `builtin:ja.legacy` のように `:` を含むので、最初の `:` だけで分ける。
            const value = event.currentTarget.value;
            const separatorIndex = value.indexOf(':');
            const kind = value.slice(0, separatorIndex) as 'builtin' | 'user';
            const id = value.slice(separatorIndex + 1);
            dispatch(selectTextCommand(holder, { kind, id }));
          }}
          aria-label="テキストを選ぶ"
          onPointerDown={beginViewingList}
          onKeyDown={(event) => {
            // 一覧を開くキー（Enter・Space・F4・Alt+↑↓）だけを「見た」とみなす。開いた直後の自動フォーカスのまま
            // Esc・Tabで閉じるだけでは、一覧を見ていないので印を残す
            if (event.ctrlKey || event.metaKey) return;
            // 素の↑↓は数えない（閉じた一覧では値が動くだけで、一覧は見えていない）。印のコピーの
            // 上で止まればselectTextCommandがその場で印を外すので、失うものは無い
            if (LIST_VIEW_KEYS.has(event.key) || (event.altKey && LIST_OPEN_ARROW_KEYS.has(event.key))) {
              beginViewingList();
            }
          }}
          onBlur={commitViewed}
        >
          <optgroup label="サンプル">
            {BUILTIN_TEXTS.map((builtin) => (
              <option key={builtin.id} value={refKey({ kind: 'builtin', id: builtin.id })}>
                {builtin.name}
              </option>
            ))}
          </optgroup>
          {textLibrary.texts.length > 0 ? (
            <optgroup label="自作">
              {textLibrary.texts.map((text) => (
                <option key={text.id} value={refKey({ kind: 'user', id: text.id })}>
                  {text.unseen === true ? `${text.name}・新しい` : text.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <label className="text-editor-inline">
          <span>言語</span>
          <select
            value={resolved.languageOverride ?? 'auto'}
            onChange={(event) => {
              const value = event.currentTarget.value;
              dispatch(setTextLanguageOverrideCommand(holder, value === 'auto' ? undefined : value as TextLanguage));
            }}
            disabled={resolved.isBuiltin}
            aria-label="言語の判定"
          >
            {LANGUAGE_OVERRIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value === 'auto' ? `${option.label}（${languageLabel(resolved.language)}）` : option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <textarea
        className="text-editor-body"
        value={textDraft}
        onChange={(event) => {
          const text = event.currentTarget.value;
          setTextDraft(text);
          // 打鍵の瞬間の対象をそのまま運ぶ。この後選択が切り替わっても宛先は変わらない。
          onTextContentCommit({ ref: resolved.ref, text });
        }}
        rows={5}
        aria-label="テキスト"
      />
      {/* 狭い文脈バーではチップの文字数を見た目から省くので、開いた欄の近くでも同じ数を出す。 */}
      <p className="text-editor-count">{formatTextCount(countTextCharacters(resolved.text))}</p>

      <div className="text-editor-row">
        <label className="text-editor-inline text-editor-name">
          <span>名前</span>
          <input
            type="text"
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.currentTarget.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename();
            }}
            disabled={resolved.isBuiltin}
            aria-label="テキストの名前"
          />
        </label>
        <div className="text-editor-buttons">
          <button type="button" onClick={() => dispatch(createTextCommand(holder, generateTextId))}>新規作成</button>
          <button type="button" onClick={() => dispatch(duplicateTextCommand(holder, generateTextId))}>複製</button>
          {/* 削除は「元に戻す」で戻せるので、確認は挟まない。 */}
          <button
            type="button"
            onClick={() => dispatch(deleteTextCommand(holder, resolved.ref.id))}
            disabled={resolved.isBuiltin}
          >
            削除
          </button>
        </div>
      </div>

      <p className="text-editor-hint">
        {resolved.isBuiltin
          ? 'サンプルを書き換えると、自作のテキストとして新しく保存します。元のサンプルはそのまま残ります。'
          : '自作のテキストはその場で書き換わります。残しておきたい時は先に複製します。'}
      </p>
    </div>
  );
}
