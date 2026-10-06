import { useId, type ReactNode } from 'react';
import './option-fields.css';

/**
 * 解析設定の項目を描く共通の入力部品（docs/architecture.md「Analyzerがペインに渡すもの」）。
 *
 * 各項目に「既定値へ戻す」を付けるのはここだけにする。Analyzerごとに戻す操作を作ると、
 * 戻す範囲（旧Bigram Flowの「標準に戻す」は3項目だけを戻していた）がAnalyzerごとにばらつき、
 * 利用者が「どこまで戻るか」を毎回読み取る必要が出るため。Analyzerは項目ごとの既定値
 * （`defaultOptions`）を渡すだけで、戻す操作の有無・見た目はこの部品が決める。
 */
export interface OptionBinding<T> {
  readonly value: T;
  readonly defaultValue: T;
  /** 「戻す」先の呼び名。省略時は「既定値」（条件の配列のレベルの編集は「全体の値」「推奨」）。 */
  readonly resetTarget?: string;
  readonly onChange: (next: T) => void;
}

/** 解析設定のオブジェクトから1項目ぶんの結び付けを作る。 */
export function bindOption<O extends object, K extends keyof O>(
  options: O,
  defaults: O,
  onOptionsChange: (next: O) => void,
  key: K,
): OptionBinding<O[K]> {
  return {
    value: options[key],
    defaultValue: defaults[key],
    onChange: (next) => onOptionsChange({ ...options, [key]: next }),
  };
}

/**
 * 解析設定の値はJSONにできるプレーンな値だけを持つ契約（`analyzers/options.ts`）なので、
 * 既定値との比較は構造の文字列化で足りる。配列の項目（表示する列・指の組み合わせ）も
 * 要素の順まで含めて比べる（順が違えば「既定と違う」として戻せる方が、戻した結果を予測しやすい）。
 */
export function isDefaultValue<T>(binding: OptionBinding<T>): boolean {
  return JSON.stringify(binding.value) === JSON.stringify(binding.defaultValue);
}

function ResetButton<T>({ label, binding }: { label: string; binding: OptionBinding<T> }) {
  if (isDefaultValue(binding)) return null;
  return (
    <button
      type="button"
      className="option-field-reset"
      aria-label={`${label}を${binding.resetTarget ?? '既定値'}へ戻す`}
      title={`${binding.resetTarget ?? '既定値'}へ戻す`}
      data-option-reset="true"
      onClick={() => binding.onChange(binding.defaultValue)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M3.5 6.5A4.75 4.75 0 1 1 3.8 10M3.5 2.75V6.5h3.75"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export interface OptionFieldProps<T> {
  /** 項目名。画面に出し、既定値へ戻すボタンの読み上げ名にも使う。 */
  readonly label: string;
  readonly binding: OptionBinding<T>;
  /** 項目名の横に出す、今の値の短い表示（スライダーの値等）。 */
  readonly valueText?: ReactNode;
  readonly hint?: ReactNode;
  /** 項目名の横に添える小さな札（条件の「全体で変更」等）。 */
  readonly badge?: ReactNode;
  /** 入力部品。`id`をラベルと結ぶ時は`inputId`を使う。 */
  readonly children: (inputId: string) => ReactNode;
}

/**
 * 1項目ぶんの行（項目名・入力・既定値へ戻す・補足）。専用の部品に当てはまらない入力
 * （指の組み合わせのような制約付きの複数選択）もこの行に載せれば、戻す操作が揃う。
 */
export function OptionField<T>({ label, binding, valueText, hint, badge, children }: OptionFieldProps<T>) {
  const inputId = useId();
  return (
    <div className="option-field" data-option-default={isDefaultValue(binding) || undefined}>
      <div className="option-field-head">
        <label className="option-field-label" id={`${inputId}-label`} htmlFor={inputId}>{label}</label>
        {badge}
        {valueText !== undefined ? <output className="option-field-value" htmlFor={inputId}>{valueText}</output> : null}
        <ResetButton label={label} binding={binding} />
      </div>
      <div className="option-field-input">{children(inputId)}</div>
      {hint !== undefined ? <p className="option-field-hint">{hint}</p> : null}
    </div>
  );
}

export interface OptionChoice<T extends string> {
  readonly value: T;
  readonly label: string;
  /** `SelectOptionField` で見出し（`<optgroup>`）の下にまとめる時の見出し。無ければ見出しの外に置く。 */
  readonly group?: string;
}

/** 選択肢を見出しごとにまとめる。見出しの順は最初に現れた順。見出しの無い選択肢は先頭に置く。 */
function groupChoices<T extends string>(choices: readonly OptionChoice<T>[]) {
  const plain = choices.filter((choice) => choice.group === undefined);
  const groups = new Map<string, OptionChoice<T>[]>();
  for (const choice of choices) {
    if (choice.group === undefined) continue;
    groups.set(choice.group, [...(groups.get(choice.group) ?? []), choice]);
  }
  return { plain, groups: [...groups] };
}

export function SelectOptionField<T extends string>({
  label,
  binding,
  choices,
  hint,
  badge,
}: {
  readonly label: string;
  readonly binding: OptionBinding<T>;
  readonly choices: readonly OptionChoice<T>[];
  readonly hint?: ReactNode;
  readonly badge?: ReactNode;
}) {
  const { plain, groups } = groupChoices(choices);
  return (
    <OptionField label={label} binding={binding} hint={hint} badge={badge}>
      {(id) => (
        <select
          id={id}
          value={binding.value}
          onChange={(event) => binding.onChange(event.currentTarget.value as T)}
        >
          {plain.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
          {groups.map(([group, members]) => (
            <optgroup key={group} label={group}>
              {members.map((choice) => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </OptionField>
  );
}

/** 選択肢が2〜3個の時の、並べて押すボタン。どれが選ばれているかを開かずに読める。 */
export function SegmentedOptionField<T extends string>({
  label,
  binding,
  choices,
  hint,
  badge,
}: {
  readonly label: string;
  readonly binding: OptionBinding<T>;
  readonly choices: readonly OptionChoice<T>[];
  readonly hint?: ReactNode;
  readonly badge?: ReactNode;
}) {
  return (
    <OptionField label={label} binding={binding} hint={hint} badge={badge}>
      {(id) => (
        <div className="option-segmented" role="group" aria-labelledby={`${id}-label`} id={id}>
          {choices.map((choice) => (
            <button
              type="button"
              key={choice.value}
              aria-pressed={binding.value === choice.value}
              onClick={() => binding.onChange(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </OptionField>
  );
}

/** 選択肢の説明が長い時の、縦に並べるラジオ。 */
export function RadioOptionField<T extends string>({
  label,
  binding,
  choices,
  hint,
}: {
  readonly label: string;
  readonly binding: OptionBinding<T>;
  readonly choices: readonly OptionChoice<T>[];
  readonly hint?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset
      className="option-field option-field-group"
      aria-labelledby={`${name}-label`}
      data-option-default={isDefaultValue(binding) || undefined}
    >
      <div className="option-field-head">
        <span className="option-field-label" id={`${name}-label`}>{label}</span>
        <ResetButton label={label} binding={binding} />
      </div>
      <div className="option-radio-group">
        {choices.map((choice) => (
          <label key={choice.value}>
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={binding.value === choice.value}
              onChange={() => binding.onChange(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
      {hint !== undefined ? <p className="option-field-hint">{hint}</p> : null}
    </fieldset>
  );
}

export function CheckboxOptionField({
  label,
  binding,
  hint,
  badge,
}: {
  readonly label: string;
  readonly binding: OptionBinding<boolean>;
  readonly hint?: ReactNode;
  readonly badge?: ReactNode;
}) {
  const inputId = useId();
  return (
    <div className="option-field option-field-checkbox" data-option-default={isDefaultValue(binding) || undefined}>
      <div className="option-field-head">
        <input
          id={inputId}
          type="checkbox"
          checked={binding.value}
          onChange={(event) => binding.onChange(event.currentTarget.checked)}
        />
        <label className="option-field-label" htmlFor={inputId}>{label}</label>
        {badge}
        <ResetButton label={label} binding={binding} />
      </div>
      {hint !== undefined ? <p className="option-field-hint">{hint}</p> : null}
    </div>
  );
}

export function RangeOptionField({
  label,
  binding,
  min,
  max,
  step,
  format,
  hint,
}: {
  readonly label: string;
  readonly binding: OptionBinding<number>;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly hint?: ReactNode;
}) {
  return (
    <OptionField label={label} binding={binding} valueText={format(binding.value)} hint={hint}>
      {(id) => (
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={binding.value}
          onChange={(event) => binding.onChange(Number(event.currentTarget.value))}
        />
      )}
    </OptionField>
  );
}

/** 複数を選ぶ項目（表示する列など）。空も1つの値として扱う（全選択の意味にはしない）。 */
export function CheckboxGroupOptionField<T extends string>({
  label,
  binding,
  choices,
  hint,
}: {
  readonly label: string;
  readonly binding: OptionBinding<readonly T[]>;
  readonly choices: readonly OptionChoice<T>[];
  readonly hint?: ReactNode;
}) {
  const toggle = (value: T) => {
    const next = binding.value.includes(value)
      ? binding.value.filter((candidate) => candidate !== value)
      : // 選んだ順ではなく選択肢の並びで持つ（既定値と比べた時に、同じ集合なら同じ値になるように）。
        choices.map((choice) => choice.value).filter((candidate) => candidate === value || binding.value.includes(candidate));
    binding.onChange(next);
  };
  const labelId = useId();
  return (
    <fieldset
      className="option-field option-field-group"
      aria-labelledby={labelId}
      data-option-default={isDefaultValue(binding) || undefined}
    >
      <div className="option-field-head">
        <span className="option-field-label" id={labelId}>{label}</span>
        <ResetButton label={label} binding={binding} />
      </div>
      <div className="option-checkbox-group">
        {choices.map((choice) => (
          <label key={choice.value}>
            <input
              type="checkbox"
              checked={binding.value.includes(choice.value)}
              onChange={() => toggle(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
      {hint !== undefined ? <p className="option-field-hint">{hint}</p> : null}
    </fieldset>
  );
}

/** 解析設定のまとまり（図ごと等）の小見出し。 */
export function OptionGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="option-group">
      <h3 className="option-group-title">{title}</h3>
      <div className="option-group-body">{children}</div>
    </section>
  );
}
