import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import { analysisTargetKey, type AnalysisTarget, type NamedTarget, type Setup } from '#input/setup/index.ts';
import { AddTargetControl } from './TargetPicker.tsx';
import './set-selection-controls.css';

/**
 * 集合を見るAnalyzer（比較表・N感度）の、見出しの「対象」欄と対象の選択（docs/architecture.md「対象の選択」）。
 *
 * 見出しには集合の要約（「先頭 他N件」、全件はhover）だけを出し、押すと見出しの下に対象の選択を開く。
 * 対象の選択の中身は、追加・並び替え・外す操作と、Analyzerが差し込む項目（比較表の基準）。
 *
 * 絞り込み欄と区分ごとのチェックリスト（docs/architecture.md「対象の選択」）はまだ作っていない。
 * 今の追加・並び替えの部品をこの置き場へ移しただけで、選び方の作り直しは別に行う。
 */
export interface SetTargetSelectionProps {
  readonly targets: readonly AnalysisTarget[];
  readonly namedByKey: ReadonlyMap<string, NamedTarget>;
  readonly layouts: ReadonlyMap<string, Layout>;
  readonly shapes: ReadonlyMap<string, PhysicalShape>;
  readonly setups: readonly Setup[];
  readonly onChange: (next: readonly AnalysisTarget[]) => void;
  /** Analyzerが対象の選択に差し込む項目（`AnalyzerPaneParts.TargetItem`をホストが値と結んだもの）。 */
  readonly extraItem?: ReactNode;
}

function summaryOf(targets: readonly AnalysisTarget[], namedByKey: ReadonlyMap<string, NamedTarget>) {
  const names = targets.map((target) => namedByKey.get(analysisTargetKey(target)));
  const first = names[0]?.displayName ?? '';
  const rest = targets.length - 1;
  return {
    text: targets.length === 0 ? '未選択' : rest > 0 ? `${first} 他${rest}件` : first,
    title: names.map((named) => named?.fullName ?? '').filter((name) => name !== '').join('\n'),
  };
}

export function SetTargetSelection({
  targets,
  namedByKey,
  layouts,
  shapes,
  setups,
  onChange,
  extraItem,
}: SetTargetSelectionProps) {
  // 対象が空の時は開いた状態から始める（ペインの案内と、選ぶ場所を同時に見せる）。
  const [open, setOpen] = useState(targets.length === 0);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const summary = summaryOf(targets, namedByKey);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && rootRef.current?.contains(document.activeElement)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const remove = (index: number) => onChange(targets.filter((_, i) => i !== index));
  const move = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= targets.length) return;
    const next = [...targets];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="set-target" ref={rootRef}>
      <button
        type="button"
        className="set-target-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`対象: ${summary.text}`}
        title={summary.title || undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="set-target-button-label">対象</span>
        <span className="set-target-button-summary">{summary.text}</span>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <section className="set-selection-controls" id={panelId} aria-label="対象の選択">
          <div className="set-selection-main">
            <AddTargetControl layouts={layouts} shapes={shapes} setups={setups} onAdd={(target) => onChange([...targets, target])} />
            {targets.length > 0 ? (
              <ol className="set-selection-order" aria-label="表示順">
                {targets.map((target, index) => {
                  const key = analysisTargetKey(target);
                  const named = namedByKey.get(key);
                  return (
                    <li key={key}>
                      <span title={named?.fullName}>{named?.displayName ?? key}</span>
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${index + 1}番目を上へ`}>↑</button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === targets.length - 1}
                        aria-label={`${index + 1}番目を下へ`}
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => remove(index)} aria-label={`${index + 1}番目を外す`}>✕</button>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
          {extraItem !== undefined ? <div className="set-selection-extra">{extraItem}</div> : null}
          <button type="button" className="set-selection-close" onClick={() => setOpen(false)}>閉じる</button>
        </section>
      ) : null}
    </div>
  );
}
