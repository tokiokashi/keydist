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

  // Setupの表示名はnameTargets（#578指摘2・3）のfullNameを使う。ピッカーの一覧は
  // 「並べて見比べる集合」ではなく「取りうる全部から探す」場なので、集合内の共通部分を
  // 落とすdisplayNameではなく常に全部を含むfullNameを使い、表示名の衝突時に添える
  // 「Setup n」と同じ番号を頭に付けて対応を取れるようにする（idは内部の値なので出さない）。
  const setupNumbers = setupNumbersOf(setups);
  const namedSetups = nameTargets(setups.map((setup) => ({
    key: setup.id,
    kind: 'setup' as const,
    layoutName: layouts.get(setup.layoutId)?.name ?? '見つからない配列',
    shapeName: shapes.get(setup.shapeId)?.name ?? '見つからない形状',
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
      aria-label={ariaLabel}
      value={value === undefined ? '' : targetOptionValue(value)}
      onChange={(event) => {
        const select = event.currentTarget;
        const parsed = parseTargetOptionValue(select.value);
        if (parsed !== undefined) onChange(parsed);
        // 「追加」モードで重複した対象を選ぶと、選択は変わらないため資産への書き込みは
        // no-opになり、親が再レンダーされない。controlledの`value=""`に頼るとDOM側の値が
        // 選択のまま残るので、DOMの値を直接プレースホルダへ戻す（レビュー指摘5）。
        // 要素を作り直す方式はフォーカスを失い、キーボードで続けて追加できなくなる（指摘L1）。
        if (placeholder) select.value = '';
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
