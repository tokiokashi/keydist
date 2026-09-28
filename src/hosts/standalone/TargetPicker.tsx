import { useState } from 'react';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import { analysisTargetKey, nameTargets, type AnalysisTarget, type Setup } from '#input/setup/index.ts';

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

/** 不明な値の表示文（レビュー指摘5: 選ばれている値が候補に無い時も、実際の状態をそのまま見せる）。 */
function describeUnknownValue(target: AnalysisTarget): string {
  return target.kind === 'setup'
    ? '（削除されたSetup）'
    : `（不明な配列: ${target.layoutId}）`;
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
}

export function TargetPicker({
  'aria-label': ariaLabel,
  layouts,
  shapes,
  setups,
  value,
  onChange,
  placeholder,
}: TargetPickerProps) {
  const layoutOptions = layoutOptionsFrom(layouts);

  // Setupの表示名はnameTargets（#578指摘2・3）のfullNameを使う（レビュー指摘3
  // 「TargetPickerは生のlayoutId/shapeIdでなくnameTargets/fullNameでSetupをラベル付けする」）。
  // ピッカーの一覧は「並べて見比べる集合」ではなく「取りうる全部から探す」場なので、
  // 集合内の共通部分を落とすdisplayNameではなく、常に全部を含むfullNameを使う。
  const namedSetups = nameTargets(setups.map((setup) => ({
    key: setup.id,
    ...(setup.label !== undefined ? { label: setup.label } : {}),
    layoutName: layouts.get(setup.layoutId)?.name ?? setup.layoutId,
    shapeName: shapes.get(setup.shapeId)?.name ?? setup.shapeId,
  })));
  const setupFullNameById = new Map(namedSetups.map((n) => [n.key, n.fullName] as const));

  const knownValues = new Set<string>([
    ...layoutOptions.map((layout) => targetOptionValue({ kind: 'layout', layoutId: layout.id })),
    ...setups.map((setup) => targetOptionValue({ kind: 'setup', setupId: setup.id })),
  ]);
  const valueIsUnknown = value !== undefined && !knownValues.has(targetOptionValue(value));

  // 「追加」モードで重複した対象を選ぶと、選択は変わらないため資産への書き込みは
  // no-opになり、親が再レンダーされない。この`<select>`は常に`value=""`の
  // controlled componentのはずだが、親が再レンダーされないとDOM側の値がユーザーの
  // 選択のまま残ってしまう（レビュー指摘5「重複を追加した後、ピッカーの表示を戻す」）。
  // `key`をクリックのたびに変えて丸ごと作り直すことで、no-opでも必ずプレースホルダへ
  // 戻す（controlled valueに頼らない、確実なリセット）。
  const [resetToken, setResetToken] = useState(0);

  return (
    <select
      key={placeholder ? resetToken : undefined}
      aria-label={ariaLabel}
      value={value === undefined ? '' : targetOptionValue(value)}
      onChange={(event) => {
        const parsed = parseTargetOptionValue(event.currentTarget.value);
        if (placeholder) setResetToken((n) => n + 1);
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
              {setupFullNameById.get(setup.id) ?? setup.id}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
