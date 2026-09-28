import { useRef, useState, type Ref } from 'react';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import { analysisTargetKey, effectiveLabel, nameTargets, type AnalysisTarget, type Setup } from '#input/setup/index.ts';
import { setupNumbersOf } from './target-name-source.ts';

/**
 * 対象（`AnalysisTarget`）を選ぶ部品（#578指摘1「対象選択UIで配列を選べるようにする」）。
 * 組み込み+自作の配列と、手持ちのSetupを「配列」「Setup」の2グループに分けた
 * `<select>`だけの最小形（コーディネーター指示「シェル・ペイン見出しへ移すのは次の
 * 作業単位。ここでは磨かない」）。
 *
 * - `TargetPicker`: 選んだ値がそのまま対象になる（単体ページの対象）
 * - `AddTargetControl`: 「追加する対象を選ぶ→追加ボタン」の形（集合対象ページ）。
 *   `<select>`の変更で直接追加すると、矢印キーで候補を動かすだけで確定する環境
 *   （WindowsのChrome等）で、見ていくだけの候補まで追加されてしまうため、確定をボタンに分ける
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

/** 不明な値の表示文（レビュー指摘5: 選ばれている値が候補に無い時も、実際の状態をそのまま見せる）。 */
function describeUnknownValue(target: AnalysisTarget): string {
  return target.kind === 'setup'
    ? '（削除されたSetup）'
    : '（見つからない配列）';
}

export interface TargetPickerProps {
  readonly 'aria-label': string;
  readonly layouts: ReadonlyMap<string, Layout>;
  readonly shapes: ReadonlyMap<string, PhysicalShape>;
  readonly setups: readonly Setup[];
  readonly value: AnalysisTarget | undefined;
  readonly onChange: (target: AnalysisTarget) => void;
  /** trueなら先頭に「選ぶ…」のプレースホルダを出す（追加フロー用）。 */
  readonly placeholder?: boolean;
  readonly ref?: Ref<HTMLSelectElement>;
}

export function TargetPicker({
  'aria-label': ariaLabel,
  layouts,
  shapes,
  setups,
  value,
  onChange,
  placeholder,
  ref,
}: TargetPickerProps) {
  const layoutOptions = layoutOptionsFrom(layouts);

  // Setupの表示名はnameTargets（#578指摘2・3）のfullNameを使う。ピッカーの一覧は
  // 「並べて見比べる集合」ではなく「取りうる全部から探す」場なので、集合内の共通部分を
  // 落とすdisplayNameではなく常に全部を含むfullNameを使い、表示名の衝突時に添える
  // 「Setup n」と同じ番号を頭に付けて対応を取れるようにする（idは内部の値なので出さない）。
  const setupNumbers = setupNumbersOf(setups);
  const namedSetups = nameTargets(setups.map((setup) => ({
    key: setup.id,
    kind: 'setup' as const,
    layoutName: layouts.get(setup.layoutId)?.name ?? '見つからない配列',
    shapeName: shapes.get(setup.shapeId)?.name ?? '見つからない物理配列',
  })));
  const setupOptionText = new Map(namedSetups.map((named, index) => {
    const setup = setups[index]!;
    const label = effectiveLabel(setup.label);
    const body = label === undefined ? named.fullName : `${label}（${named.fullName}）`;
    return [setup.id, `Setup ${setupNumbers.get(setup.id)!}: ${body}`] as const;
  }));

  const knownValues = new Set<string>([
    ...layoutOptions.map((layout) => targetOptionValue({ kind: 'layout', layoutId: layout.id })),
    ...setups.map((setup) => targetOptionValue({ kind: 'setup', setupId: setup.id })),
  ]);
  const valueIsUnknown = value !== undefined && !knownValues.has(targetOptionValue(value));

  return (
    <select
      ref={ref}
      aria-label={ariaLabel}
      value={value === undefined ? '' : targetOptionValue(value)}
      onChange={(event) => {
        const parsed = parseTargetOptionValue(event.currentTarget.value);
        if (parsed !== undefined) onChange(parsed);
      }}
    >
      {placeholder ? <option value="">選ぶ…</option> : null}
      {valueIsUnknown && value !== undefined ? (
        <option value={targetOptionValue(value)} disabled>{describeUnknownValue(value)}</option>
      ) : null}
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
              {setupOptionText.get(setup.id)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

export interface AddTargetControlProps {
  readonly layouts: ReadonlyMap<string, Layout>;
  readonly shapes: ReadonlyMap<string, PhysicalShape>;
  readonly setups: readonly Setup[];
  readonly onAdd: (target: AnalysisTarget) => void;
}

/**
 * 追加する対象を選んで「追加」で確定する部品（集合対象ページ）。候補は部品の中だけの状態で、
 * 追加するまで資産へ書き込まない。追加したら候補をプレースホルダへ戻し、フォーカスを
 * `<select>`へ返す（押したボタンは候補が空になって無効化されるため、そのままだとフォーカスが
 * ページの先頭へ飛び、キーボードで続けて追加できない）。
 */
export function AddTargetControl({ layouts, shapes, setups, onAdd }: AddTargetControlProps) {
  const [candidate, setCandidate] = useState<AnalysisTarget | undefined>(undefined);
  const selectRef = useRef<HTMLSelectElement>(null);
  return (
    <div className="standalone-control">
      <span>対象を追加</span>
      <div className="add-target-row">
        <TargetPicker
          ref={selectRef}
          aria-label="追加する対象"
          layouts={layouts}
          shapes={shapes}
          setups={setups}
          value={candidate}
          placeholder
          onChange={setCandidate}
        />
        <button
          type="button"
          disabled={candidate === undefined}
          onClick={() => {
            if (candidate === undefined) return;
            onAdd(candidate);
            setCandidate(undefined);
            selectRef.current?.focus();
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}
