import './range-switch.css';

/**
 * 図に出すテキストの範囲を前後に切り替える操作。範囲が1つのテキストでは何も出さない。
 * 範囲の分け方は`input/text/display-ranges.ts`。位置は評価に渡したテキストの文字位置（先頭が0、`end`は含まない）。
 */
export interface RangeSwitchProps {
  /** 今の範囲の番号（先頭が0） */
  readonly index: number;
  readonly count: number;
  readonly start: number;
  readonly end: number;
  readonly onChange: (index: number) => void;
}

export function RangeSwitch({ index, count, start, end, onChange }: RangeSwitchProps) {
  if (count <= 1) return null;
  return (
    <fieldset className="plain-group range-switch" aria-label="図に出す範囲" data-range-switch>
      <button type="button" data-range-switch-action="previous" disabled={index <= 0} onClick={() => onChange(index - 1)}>
        <span aria-hidden="true">◀</span> 前の範囲
      </button>
      <button type="button" data-range-switch-action="next" disabled={index >= count - 1} onClick={() => onChange(index + 1)}>
        次の範囲 <span aria-hidden="true">▶</span>
      </button>
      <span className="range-switch-label" aria-live="polite" data-range-switch-label>
        範囲 {index + 1} / {count}（{(start + 1).toLocaleString('ja-JP')}〜{end.toLocaleString('ja-JP')}文字目）
      </span>
    </fieldset>
  );
}
