import type { Layout } from '#input/layouts/types.ts';
import { analysisTargetKey, type AnalysisTarget, type Setup } from '#input/setup/index.ts';

/**
 * 対象（`AnalysisTarget`）を選ぶ部品（#578指摘1「対象選択UIで配列を選べるようにする」）。
 * 組み込み+自作の配列と、手持ちのSetupを「配列」「Setup」の2グループに分けた
 * `<select>`だけの最小形（コーディネーター指示「シェル・ペイン見出しへ移すのは次の
 * 作業単位。ここでは磨かない」）。
 *
 * - `mode: 'select'`: 常に何か選ばれている状態を表す（単体ページの対象。`value`必須）
 * - `mode: 'add'`: 「追加する対象を選ぶ→追加ボタン」の形（集合対象ページ。選んでいる
 *   最中は`AnalysisTarget`を持たないプレースホルダ状態がありうる）
 */
export interface TargetPickerLayoutOption {
  readonly id: string;
  readonly name: string;
}

function layoutOptionsFrom(layouts: ReadonlyMap<string, Layout>): readonly TargetPickerLayoutOption[] {
  return [...layouts.values()]
    .map((layout) => ({ id: layout.id, name: layout.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function targetOptionValue(target: AnalysisTarget): string {
  return analysisTargetKey(target);
}

function parseTargetOptionValue(value: string): AnalysisTarget | undefined {
  if (value.startsWith('layout:')) return { kind: 'layout', layoutId: value.slice('layout:'.length) };
  if (value.startsWith('setup:')) return { kind: 'setup', setupId: value.slice('setup:'.length) };
  return undefined;
}

export interface TargetPickerProps {
  readonly 'aria-label': string;
  readonly layouts: ReadonlyMap<string, Layout>;
  readonly setups: readonly Setup[];
  readonly value: AnalysisTarget | undefined;
  readonly onChange: (target: AnalysisTarget) => void;
  /** trueなら先頭に「選ぶ…」のプレースホルダを出す（追加フロー用）。 */
  readonly placeholder?: boolean;
}

export function TargetPicker({
  'aria-label': ariaLabel,
  layouts,
  setups,
  value,
  onChange,
  placeholder,
}: TargetPickerProps) {
  const layoutOptions = layoutOptionsFrom(layouts);

  return (
    <select
      aria-label={ariaLabel}
      value={value === undefined ? '' : targetOptionValue(value)}
      onChange={(event) => {
        const parsed = parseTargetOptionValue(event.currentTarget.value);
        if (parsed !== undefined) onChange(parsed);
      }}
    >
      {placeholder ? <option value="">選ぶ…</option> : null}
      <optgroup label="配列">
        {layoutOptions.map((layout) => (
          <option key={layout.id} value={targetOptionValue({ kind: 'layout', layoutId: layout.id })}>
            {layout.name}
          </option>
        ))}
      </optgroup>
      {setups.length > 0 ? (
        <optgroup label="Setup">
          {setups.map((setup) => (
            <option key={setup.id} value={targetOptionValue({ kind: 'setup', setupId: setup.id })}>
              {setup.label ?? `${setup.layoutId} / ${setup.shapeId}`}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
