import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  conditionSummaryLine,
  conditionTriggerTitle,
  type ConditionHeaderInfo,
  type ConditionSummaryRow,
  type ConditionTargetDiff,
} from './condition-summary.ts';
import { resetAllPlan } from './condition-edit.ts';
import type { ConditionProvenanceItem } from './reading-evaluation.ts';
import { ConditionEditor, type ConditionEditorContext } from './ConditionEditor.tsx';
import { PresetSection } from './PresetSection.tsx';
import { SetupLink } from './setup-link.tsx';
import { historyShortcutOf, isMacPlatform, isTextEntryTarget } from '#ui/primitives/history-shortcut.ts';

/**
 * 条件の要約（docs/architecture.md「画面の構成 > 条件の要約」）。
 *
 * 閉じた状態は1行で、変えた項目の先頭2件（項目の定義順）と「他N件」。何も変えていなければ
 * 「すべて既定値」。押すと条件のモーダルを開き、全体のレベルの条件をその場で編集できる
 * （docs/architecture.md「条件の編集とURL」）。開いた時の閲覧用の一覧は、モーダルの行
 * （値・出どころ・診断）が兼ねる。
 *
 * ペインの枠から切り離しておくのは、個別画面とWorkspaceのどちらのペインにも同じ部品を置くため。
 * 複数の対象を持つペインは、共通の条件を`rows`に、対象ごとの差を`targetDiffs`に渡す。
 */
export interface ConditionSummaryProps {
  /** Traceに効く条件の一覧。項目の定義順（`traceConditionSummary`の順）で渡す。 */
  readonly rows: readonly ConditionSummaryRow[];
  /**
   * モーダルの先頭に出す、対象の実体（配列・物理配列・指の割当）の名前。解決前（読み込み中）は省略する。
   * 対象のフル名（既定と違う条件つき）は出さない。条件の差分は各行が出どころつきで出すため。
   */
  readonly header?: ConditionHeaderInfo | undefined;
  /**
   * 複数の対象を持つペインで、共通の条件（`rows`）と違う対象とその項目。全対象が同じなら空か省略。
   * 単一の対象のペインは渡さない。
   */
  readonly targetDiffs?: readonly ConditionTargetDiff[] | undefined;
  /**
   * 数値の出どころとして添える項目（読みの辞書の名前と版）。設定値ではなく、数値を作った段の記録なので、
   * 条件の行とは別に出す。閉じた1行にも出し、見出しの1行に置く小さい形ではhoverの説明に出す。
   */
  readonly provenance?: readonly ConditionProvenanceItem[] | undefined;
  /** 全体のレベルの条件を書き換えるための手持ち。 */
  readonly editor: ConditionEditorContext;
  /**
   * 見出しの1行に置く小さい形（Workspaceの、名前を見出しの先頭に出すペイン）。広い時は「条件: 既定値」「条件: 3件変更」の
   * chip、狭い時（ペインの幅34rem以下）は絵と、既定と違う時の点だけ。文字は狭い時も読み上げ用に残す。
   * 変えた項目の中身はchipに出さず、押して開くモーダルと、hoverの説明が出す。
   */
  readonly compact?: boolean;
}

/** 見出しの1行に置く形の、chipの文字。 */
function compactLabel(changedCount: number, hasTargetDiffs: boolean): string {
  if (changedCount > 0) return `条件: ${changedCount}件変更`;
  return hasTargetDiffs ? '条件: 対象ごとに差あり' : '条件: 既定値';
}

/** 省略できる札に、名前に続けて値の先頭を読ませる最小の字数（em）。これより狭くなる札は出さず、件数にまとめる。 */
const PROVENANCE_VALUE_MIN_EM = 4;

/** 変えた項目の札が、幅が足りない時に縮む下限（em）。項目の名前の先頭を読める幅を残す。 */
const ITEMS_MIN_EM = 6;

/** 閉じた1行に並べる、省略できる出どころの札の数と、それぞれの縮む下限（px）。 */
interface ProvenanceFit {
  readonly shown: number;
  readonly minWidths: readonly number[];
}

const FIT_ALL: ProvenanceFit = { shown: Number.POSITIVE_INFINITY, minWidths: [] };

function sameFit(a: ProvenanceFit, b: ProvenanceFit): boolean {
  return a.shown === b.shown && a.minWidths.length === b.minWidths.length && a.minWidths.every((width, index) => width === b.minWidths[index]);
}

/**
 * 閉じた1行の幅を測り、省略できる出どころの札を先頭から何枚並べられるかを決める。
 * 札は「名前: 値の先頭4字」が読める幅より縮めない。並べきれない札は、それ以降をまとめて件数の札にする。
 * 並べない札も位置を外して描いておくので、ここで本来の幅を測れる。
 */
function measureProvenanceFit(trigger: HTMLElement): ProvenanceFit {
  const style = getComputedStyle(trigger);
  const em = Number.parseFloat(style.fontSize);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const available = trigger.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  let fixed = 0;
  let parts = 0;
  let moreWidth = 0;
  const minWidths: number[] = [];
  for (const child of trigger.children) {
    if (!(child instanceof HTMLElement || child instanceof SVGElement)) continue;
    if (child.matches('.pane-condition-provenance-more')) {
      moreWidth = child.getBoundingClientRect().width;
    } else if (child.matches('.pane-condition-provenance:not([data-keep-width])')) {
      const label = child.querySelector('.pane-condition-provenance-label');
      const labelWidth = label === null ? 0 : label.getBoundingClientRect().width;
      minWidths.push(Math.ceil(Math.min(child.scrollWidth, labelWidth + PROVENANCE_VALUE_MIN_EM * em)));
    } else {
      fixed += child.matches('.pane-condition-items') ? Math.min(child.scrollWidth, ITEMS_MIN_EM * em) : child.getBoundingClientRect().width;
      parts += 1;
    }
  }
  const base = fixed + gap * Math.max(parts - 1, 0);
  const all = minWidths.reduce((sum, width) => sum + gap + width, base);
  if (all <= available) return { shown: minWidths.length, minWidths };
  let used = base + gap + moreWidth;
  let shown = 0;
  for (const width of minWidths) {
    if (used + gap + width > available) break;
    used += gap + width;
    shown += 1;
  }
  return { shown, minWidths };
}

export function ConditionSummary({ rows, header, targetDiffs = [], provenance = [], editor, compact = false }: ConditionSummaryProps) {
  const [open, setOpen] = useState(false);
  const [fit, setFit] = useState<ProvenanceFit>(FIT_ALL);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 閉じた1行の幅が変わるたびに、並べる札を決め直す。描いた直後に測り、断片の札が一瞬も見えないようにする
  useLayoutEffect(() => {
    const trigger = buttonRef.current;
    if (compact || trigger === null) return undefined;
    const measure = () => {
      const next = measureProvenanceFit(trigger);
      setFit((current) => (sameFit(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(trigger);
    return () => observer.disconnect();
  });

  if (rows.length === 0) return null;
  const line = conditionSummaryLine(rows);

  const close = () => {
    setOpen(false);
    // 見出しを固定しないペインではボタンが画面外にあり、既定のfocus()はそこまでスクロールしてしまう。
    buttonRef.current?.focus({ preventScroll: true });
  };

  const differs = line.changedCount > 0 || targetDiffs.length > 0;
  // hoverには、条件の役割とモーダルに出る行の例を先に置く。compactでは変えた項目の中身も続ける
  // （chipに載らないので、hoverで読めるようにする。押せば条件のモーダルで全部読める）
  const title = conditionTriggerTitle({
    rows,
    hiddenIds: editor.hiddenIds ?? [],
    compact,
    line,
    hasTargetDiffs: targetDiffs.length > 0,
    provenance,
  });

  return (
    <div className="pane-condition-summary" data-changed-count={line.changedCount} data-compact={compact || undefined}>
      <button
        ref={buttonRef}
        type="button"
        className="pane-condition-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen(true)}
      >
        {compact ? (
          <>
            {/* 解析設定のボタン（スライダーの絵）と取り違えないよう、項目を並べた一覧の絵にする */}
            <svg className="pane-condition-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M6 4h7.5M6 8h7.5M6 12h7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              <circle cx="2.8" cy="4" r="0.9" fill="currentColor" />
              <circle cx="2.8" cy="8" r="0.9" fill="currentColor" />
              <circle cx="2.8" cy="12" r="0.9" fill="currentColor" />
            </svg>
            <span className="pane-condition-chip-text">{compactLabel(line.changedCount, targetDiffs.length > 0)}</span>
            {differs ? <span className="pane-condition-dot" aria-hidden="true" /> : null}
          </>
        ) : (
          <>
            <svg className="pane-condition-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h2M7.5 11.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              <circle cx="11" cy="4.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="6" cy="11.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="pane-condition-key">条件</span>
            {line.changedCount === 0 ? (
              <span className="pane-condition-default">すべて既定値</span>
            ) : (
              <>
                <span className="pane-condition-items">{line.shown.map((row) => `${row.label}: ${row.displayValue}`).join(' · ')}</span>
                {line.restCount > 0 ? <span className="pane-condition-more">他{line.restCount}件</span> : null}
              </>
            )}
            {targetDiffs.length > 0 ? <span className="pane-condition-diff-flag">対象ごとに差あり</span> : null}
            {renderProvenance(provenance, fit)}
          </>
        )}
      </button>
      {open ? <ConditionModal rows={rows} header={header} targetDiffs={targetDiffs} provenance={provenance} editor={editor} onClose={close} /> : null}
    </div>
  );
}

/**
 * 閉じた1行の出どころの札。省略できる札は先頭から`fit.shown`枚だけ並べ、残りは件数の札にまとめる。
 * 並べない札と、0件の時の件数の札も、幅を測れるよう位置を外して描く。中身は押して開くモーダルで読める。
 */
function renderProvenance(provenance: readonly ConditionProvenanceItem[], fit: ProvenanceFit) {
  let shrinkIndex = 0;
  let hiddenCount = 0;
  const chips = provenance.map((item) => {
    const index = item.keepWidth ? undefined : shrinkIndex++;
    const hidden = index !== undefined && index >= fit.shown;
    if (hidden) hiddenCount += 1;
    const minWidth = index === undefined || hidden ? undefined : fit.minWidths[index];
    return (
      <span
        key={item.label}
        className="pane-condition-provenance"
        data-keep-width={item.keepWidth || undefined}
        data-overflow={hidden || undefined}
        style={minWidth === undefined ? undefined : { minWidth }}
      >
        <span className="pane-condition-provenance-label">{item.label}: </span>
        {item.value}
      </span>
    );
  });
  if (shrinkIndex === 0) return chips;
  return (
    <>
      {chips}
      {/* 件数は、まとめた札が1枚でも「他N件」の形にそろえる */}
      <span className="pane-condition-provenance-more" data-overflow={hiddenCount === 0 || undefined}>
        出どころ他{Math.max(hiddenCount, 1)}件
      </span>
    </>
  );
}

interface ConditionModalProps extends ConditionSummaryProps {
  readonly targetDiffs: readonly ConditionTargetDiff[];
  readonly provenance: readonly ConditionProvenanceItem[];
  readonly onClose: () => void;
}

/**
 * どの画面でも同じ器で開く（パソコン幅は中央のモーダル、スマホ幅は下からのシート。`pane-frame.css`）。
 * `<dialog>`のモーダルにするのは、背後の操作を止め、Escapeとフォーカスの戻りをブラウザに任せるため。
 */
function ConditionModal({ rows, header, targetDiffs, provenance, editor, onClose }: ConditionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // 消すレベルの組み立て（単体ページは全体と今の配列、Workspaceのペインはそのレベルだけ）は`resetAllPlan`
  const inWorkspace = editor.workspace !== undefined;
  const resetPlan = resetAllPlan(editor.overrides, editor.hiddenIds ?? [], editor.layout?.id, editor.workspace?.id);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return undefined;
    dialog.showModal();
    // 片付けでcloseを呼ばない（開発時の二重実行で、閉じるイベントが親へ届いて開いた直後に閉じてしまう。
    // 閉じる時は親が描画をやめ、要素ごと外れる）。
    return undefined;
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="condition-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      // モーダルが開いている間の元に戻すのキー操作は、モーダルの中の「元に戻す」と同じ処理（`editor.undo`）を通す。
      // モーダルの背後の画面のキー操作（`useHistoryShortcuts`）は、`<dialog>`が開いている間は動かない
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        if (historyShortcutOf(event, isMacPlatform()) !== 'undo') return;
        if (isTextEntryTarget(event.target instanceof HTMLElement ? event.target : null)) return;
        event.preventDefault();
        editor.undo();
      }}
      // 中身は器いっぱいに広げてあるので、器自身への押下は背後（暗い部分）を押した時だけ。
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="condition-modal-inner">
        <header className="condition-modal-head">
          <h2 id={titleId}>条件</h2>
          <span className="condition-modal-scope">
            {inWorkspace
              ? editor.layout === undefined
                ? 'このWorkspaceの値を変えます。他の画面には反映されません'
                : 'このWorkspaceの値を変えます'
              : editor.layout === undefined
                ? '全体の値を変えます。すべての画面に反映されます'
                : '全体の値を変えます'}
          </span>
          <button type="button" className="condition-modal-reset-all" disabled={resetPlan.disabled} onClick={() => editor.dispatch(resetPlan.command)}>
            {inWorkspace ? 'Workspaceの変更をすべて戻す' : 'すべて既定値に戻す'}
          </button>
          <button type="button" className="condition-modal-close" aria-label="閉じる" onClick={() => dialogRef.current?.close()}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="condition-modal-body">
          {header !== undefined ? (
            <p className="pane-condition-target">
              {header.layoutName} / {header.shapeName} · 指の割当: {header.fingerAssignmentName}
            </p>
          ) : null}
          {editor.openSetups === undefined
            ? null
            : editor.openSetups.map((setup) => (
                <p key={setup.id} className="pane-condition-setup-link">
                  <SetupLink setupId={setup.id}>
                    {setup.name === undefined ? 'このSetupの物理配列と条件を編集' : `「${setup.name}」の物理配列と条件を編集`}
                  </SetupLink>
                </p>
              ))}
          <PresetSection editor={editor} />
          <ConditionEditor editor={editor} rows={rows} />
          {provenance.length > 0 ? (
            <section className="pane-condition-diffs" aria-label="数値の出どころ">
              <h4>数値の出どころ</h4>
              <dl>
                {provenance.map((item) => (
                  <div key={item.label} className="pane-condition-diff">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {targetDiffs.length > 0 ? (
            <section className="pane-condition-diffs" aria-label="対象ごとの差">
              <h4>対象ごとの差</h4>
              <dl>
                {targetDiffs.map((diff) => (
                  <div key={diff.key} className="pane-condition-diff">
                    <dt>{diff.label}</dt>
                    <dd>{diff.items.map((item) => `${item.label}=${item.displayValue}`).join('、')}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
