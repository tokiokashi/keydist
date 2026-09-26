import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AnalyzerRomajiDialogModel } from './analyzer-romaji-dialog-model.ts';
import { LAYOUTS_JA } from '../layouts/index.ts';
import { SAMPLE_TEXT_JA } from '../sample-text-ja.ts';
import { kanaToRomaji } from '#input/romaji/kunrei.ts';
import {
  allRomajiRules,
  defaultRomajiRuleId,
  formatOverrides,
  parseOverrides,
  ROMAJI_RULES,
  tableForRule,
  type BuiltinRomajiRuleId,
  type RomajiSettings,
  type UserRomajiRule,
} from '#input/romaji/rules.ts';

interface RomajiVariant {
  kana: string;
  alternatives: string[];
}

interface RomajiVariantRow {
  variant: RomajiVariant;
  current: string;
  count: number;
  effect: number;
  index: number;
}

interface RomajiEditorDraft {
  selectedId: string;
  name: string;
  base: BuiltinRomajiRuleId;
  generateSokuon: boolean;
  overrides: string;
  variants: RomajiVariantRow[];
}

const ROMAJI_VARIANTS: RomajiVariant[] = [
  { kana: 'い', alternatives: ['i'] }, { kana: 'う', alternatives: ['u'] },
  { kana: 'か', alternatives: ['ka'] }, { kana: 'く', alternatives: ['ku'] },
  { kana: 'こ', alternatives: ['ko'] }, { kana: 'し', alternatives: ['si', 'shi'] },
  { kana: 'せ', alternatives: ['se'] }, { kana: 'ち', alternatives: ['ti', 'chi'] },
  { kana: 'つ', alternatives: ['tu', 'tsu'] }, { kana: 'ふ', alternatives: ['hu', 'fu'] },
  { kana: 'ん', alternatives: ['n', 'nn'] }, { kana: 'じ', alternatives: ['zi', 'ji'] },
  { kana: 'っ', alternatives: ['ltu', 'xtu'] }, { kana: 'ぁ', alternatives: ['la', 'xa'] },
  { kana: 'ぃ', alternatives: ['li', 'xi'] }, { kana: 'ぅ', alternatives: ['lu', 'xu'] },
  { kana: 'ぇ', alternatives: ['le', 'xe'] }, { kana: 'ぉ', alternatives: ['lo', 'xo'] },
  { kana: 'ゃ', alternatives: ['lya', 'xya'] }, { kana: 'ゅ', alternatives: ['lyu', 'xyu'] },
  { kana: 'ょ', alternatives: ['lyo', 'xyo'] }, { kana: 'しゃ', alternatives: ['sha', 'sya'] },
  { kana: 'しゅ', alternatives: ['shu', 'syu'] }, { kana: 'しぇ', alternatives: ['she', 'sye'] },
  { kana: 'しょ', alternatives: ['sho', 'syo'] }, { kana: 'じゃ', alternatives: ['ja', 'zya'] },
  { kana: 'じゅ', alternatives: ['ju', 'zyu'] }, { kana: 'じぇ', alternatives: ['je', 'zye'] },
  { kana: 'じょ', alternatives: ['jo', 'zyo'] }, { kana: 'ちゃ', alternatives: ['tya', 'cha'] },
  { kana: 'ちゅ', alternatives: ['tyu', 'chu'] }, { kana: 'ちょ', alternatives: ['tyo', 'cho'] },
  { kana: 'ちぃ', alternatives: ['tyi'] }, { kana: 'うぃ', alternatives: ['wi'] },
  { kana: 'うぇ', alternatives: ['we'] },
];

const ROMAJI_VARIANT_OPTIONS = [
  ...new Set(ROMAJI_VARIANTS.flatMap((variant) => variant.alternatives)),
];

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  for (
    let at = text.indexOf(needle);
    at >= 0;
    at = text.indexOf(needle, at + needle.length)
  ) count++;
  return count;
}

function signed(value: number): string {
  return value === 0 ? '±0' : value > 0 ? `+${value}` : String(value);
}

function selectedRule(
  id: string,
  settings: RomajiSettings,
): UserRomajiRule | (typeof ROMAJI_RULES)[BuiltinRomajiRuleId] | undefined {
  const custom = settings.rules.find((rule) => rule.id === id);
  if (custom) return custom;
  return id in ROMAJI_RULES ? ROMAJI_RULES[id as BuiltinRomajiRuleId] : undefined;
}

function buildVariantRows(
  selectedId: string,
  settings: RomajiSettings,
  baseInput: BuiltinRomajiRuleId,
  overridesText: string,
): RomajiVariantRow[] {
  const rule = selectedRule(selectedId, settings);
  const base = rule?.base ?? baseInput;
  const table = tableForRule(base, settings.rules);
  const parsed = parseOverrides(overridesText);
  for (const [kana, roman] of Object.entries(parsed.overrides)) table.set(kana, roman);
  const sample = SAMPLE_TEXT_JA.replace(/\s+/g, '');

  return ROMAJI_VARIANTS.map((variant, index) => {
    const current = table.get(variant.kana) ?? kanaToRomaji(variant.kana, table);
    const count = countOccurrences(sample, variant.kana);
    const effect = (variant.alternatives[0]!.length - current.length) * count;
    return { variant, current, count, effect, index };
  }).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) || a.index - b.index);
}

function editorDraft(id: string, settings: RomajiSettings): RomajiEditorDraft {
  if (!id) {
    const base: BuiltinRomajiRuleId = 'kunrei';
    const overrides = '';
    return {
      selectedId: '',
      name: '',
      base,
      generateSokuon: true,
      overrides,
      variants: buildVariantRows('', settings, base, overrides),
    };
  }

  const rule = selectedRule(id, settings);
  if (!rule) return editorDraft('kunrei', settings);
  const base = rule.base;
  const overrides = formatOverrides(rule.overrides);
  return {
    selectedId: id,
    name: 'name' in rule ? rule.name : ROMAJI_RULES[id as BuiltinRomajiRuleId].name,
    base,
    generateSokuon: base === 'azik' ? false : rule.generateSokuon,
    overrides,
    variants: buildVariantRows(id, settings, base, overrides),
  };
}

function updateVariantOverride(overrides: string, kana: string, value: string): string {
  const roman = value.trim().toLowerCase();
  const lines = overrides.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    const equal = line.indexOf('=');
    return equal > 0 && line.slice(0, equal).trim() === kana;
  });

  if (!roman) {
    if (index >= 0) lines.splice(index, 1);
  } else if (index >= 0) {
    lines[index] = `${kana} = ${roman}`;
  } else if (lines.length === 1 && lines[0]!.trim() === '') {
    lines[0] = `${kana} = ${roman}`;
  } else {
    lines.push(`${kana} = ${roman}`);
  }
  return lines.join('\n');
}

function validAssignment(
  requested: string,
  layoutId: string,
  rules: readonly { id: string }[],
): string {
  return rules.some((rule) => rule.id === requested)
    ? requested
    : defaultRomajiRuleId(layoutId);
}

export function AnalyzerRomajiDialog({
  model,
}: {
  model: AnalyzerRomajiDialogModel;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const initial = editorDraft('kunrei', snapshot.settings);
  const [selectedId, setSelectedId] = useState(initial.selectedId);
  const [name, setName] = useState(initial.name);
  const [base, setBase] = useState(initial.base);
  const [generateSokuon, setGenerateSokuon] = useState(initial.generateSokuon);
  const [overrides, setOverrides] = useState(initial.overrides);
  const [variants, setVariants] = useState(initial.variants);
  const [errors, setErrors] = useState<string[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  const loadEditor = (id: string, settings = snapshot.settings) => {
    const draft = editorDraft(id, settings);
    setSelectedId(draft.selectedId);
    setName(draft.name);
    setBase(draft.base);
    setGenerateSokuon(draft.generateSokuon);
    setOverrides(draft.overrides);
    setVariants(draft.variants);
    setErrors([]);
  };

  useEffect(() => {
    const requested = selectedId || 'kunrei';
    const rules = allRomajiRules(snapshot.settings.rules);
    loadEditor(
      rules.some((rule) => rule.id === requested) ? requested : 'kunrei',
      snapshot.settings,
    );
    // refreshRevision changes only when the dialog is explicitly reopened/refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.refreshRevision]);

  const rules = allRomajiRules(snapshot.settings.rules);

  return (
    <form
      method="dialog"
      id="romaji-form"
      data-react-feature="romaji-dialog"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        if (submitter?.value === 'cancel') return;

        event.preventDefault();
        const parsed = parseOverrides(overrides);
        const nextErrors = name.trim() ? parsed.errors : ['名前を入力する'];
        setErrors(nextErrors);
        if (nextErrors.length > 0) return;

        const id = selectedId && !(selectedId in ROMAJI_RULES)
          ? selectedId
          : `custom-${Date.now().toString(36)}`;
        const rule: UserRomajiRule = {
          id,
          name: name.trim(),
          base,
          overrides: parsed.overrides,
          generateSokuon: base === 'azik' ? false : generateSokuon,
        };
        model.saveRule(rule);
        loadEditor(id, model.getSnapshot().settings);
      }}
    >
      <div className="dialog-head">
        <h2>ローマ字の綴り</h2>
        <button type="submit" value="cancel" className="ghost close">閉じる</button>
      </div>
      <p className="note">
        基底ルールと差分で綴りを作る。評価時は小文字として扱う。<br />
        既定配列への割り当てもここで保存する。
      </p>

      <label className="ctl">
        <span>編集する綴り</span>
        <select
          id="romaji-edit"
          value={selectedId}
          onChange={(event) => loadEditor(event.currentTarget.value)}
        >
          <option value="">新しい綴り</option>
          {rules.map((rule) => (
            <option key={rule.id} value={rule.id}>{rule.name}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="secondary"
        id="romaji-new"
        onClick={() => {
          loadEditor('');
          nameRef.current?.focus();
        }}
      >
        新しい綴りを作る
      </button>

      <div className="romaji-variants" id="romaji-variants">
        <datalist id="romaji-variant-options">
          {ROMAJI_VARIANT_OPTIONS.map((option) => <option key={option} value={option} />)}
        </datalist>
        {variants.map((row) => (
          <div className="romaji-variant" key={row.variant.kana}>
            <span>{row.variant.kana}</span>
            <input
              type="text"
              value={row.current}
              spellCheck={false}
              list="romaji-variant-options"
              data-kana={row.variant.kana}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setVariants((current) => current.map((candidate) => (
                  candidate.variant.kana === row.variant.kana
                    ? { ...candidate, current: value }
                    : candidate
                )));
                setOverrides((current) => updateVariantOverride(
                  current,
                  row.variant.kana,
                  value,
                ));
              }}
            />
            <span className="romaji-variant-meta">
              候補 {row.variant.alternatives.join(' / ')} / 出現 {row.count} / 変更 {signed(row.effect)} 打
            </span>
            {row.variant.kana === 'ん' ? (
              <span
                className="romaji-variant-note"
                hidden={row.current.trim().toLowerCase() !== 'n'}
              >
                ん = nは、次が母音・な行・や行の時や語末では実際にはnnが必要です。この設定では区別できません。
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <label className="ctl">
        <span>名前</span>
        <input
          ref={nameRef}
          type="text"
          id="romaji-name"
          placeholder="私のローマ字"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <label className="ctl">
        <span>基底ルール</span>
        <select
          id="romaji-base"
          value={base}
          onChange={(event) => {
            const next = event.currentTarget.value as BuiltinRomajiRuleId;
            setBase(next);
            if (next === 'azik') setGenerateSokuon(false);
          }}
        >
          <option value="qwerty">標準（j / sh / ch）</option>
          <option value="kunrei">訓令式</option>
          <option value="oonishi">大西式</option>
          <option value="azik">AZIK</option>
        </select>
      </label>
      <label className="ctl checkbox">
        <input
          type="checkbox"
          id="romaji-sokuon"
          checked={generateSokuon}
          onChange={(event) => setGenerateSokuon(event.currentTarget.checked)}
        />
        <span>促音の後ろに子音を重ねた見出しを自動生成する（っか → kka）</span>
      </label>
      <label className="ctl">
        <span>差分 <small>1行に「かな = 綴り」。複数かなも可</small></span>
        <textarea
          id="romaji-overrides"
          rows={8}
          spellCheck={false}
          placeholder={'しゃ = sha\nじゃ = ja\nちゃ = cha'}
          value={overrides}
          onChange={(event) => setOverrides(event.currentTarget.value)}
        />
      </label>
      <p className="error" id="romaji-error" hidden={errors.length === 0}>
        {errors.join(' / ')}
      </p>
      <button type="submit" id="romaji-save">この内容を保存する</button>

      <hr />
      <h3>配列への割り当て</h3>
      <div id="romaji-assignments">
        <h4>組み込み配列</h4>
        {LAYOUTS_JA.filter((layout) => layout.romajiTable).map((layout) => {
          const assigned = snapshot.settings.assignments[layout.id]
            ?? defaultRomajiRuleId(layout.id);
          return (
            <label className="romaji-assignment" key={layout.id}>
              <span>{layout.name}</span>
              <select
                value={validAssignment(assigned, layout.id, rules)}
                onChange={(event) => model.setBuiltinAssignment(
                  layout.id,
                  event.currentTarget.value,
                )}
              >
                {rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>{rule.name}</option>
                ))}
              </select>
            </label>
          );
        })}

        {snapshot.userLayouts.length > 0 ? <h4>自作配列</h4> : null}
        {snapshot.userLayouts.map((definition) => (
          <label className="romaji-assignment" key={definition.id}>
            <span>{definition.name}</span>
            <select
              value={validAssignment(definition.romaji, definition.id, rules)}
              onChange={(event) => model.setUserAssignment(
                definition.id,
                event.currentTarget.value,
              )}
            >
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>{rule.name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </form>
  );
}
