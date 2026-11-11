import { useMemo, useState, type FormEvent } from 'react';
import { addComboToSet, buildComboEntry, newComboSetId, type ComboSet, type ComboSetEntry } from '#input/combo-set/combo-set.ts';
import { allRomajiRules, isBuiltin, tableForRule, ROMAJI_RULES, DEFAULT_ROMAJI_RULE_ID, type UserRomajiRule } from '#input/romaji/rules.ts';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';
import { COMBO_SET_LABEL } from './label.ts';
import './combo-set.css';

/** 新しく作る組の名前。 */
const NEW_COMBO_SET_NAME = '新しいコンボの組';

export interface ComboSetEditorProps {
  /** コンボの組。 */
  readonly comboSets: readonly ComboSet[];
  /** 自作のローマ字規則。基準の綴りの選択肢と、出力の展開に使う。 */
  readonly userRomajiRules: readonly UserRomajiRule[];
  /** 保存の読み込みが済むまでは、組が無いように見せない。 */
  readonly ready: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCreate: (id: string, name: string, romajiRuleId: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onAddCombo: (id: string, entry: ComboSetEntry) => void;
  readonly onRemoveCombo: (id: string, index: number) => void;
}

/** 基準の綴りの名前。見つからない規則は、見つからない旨を出す。 */
function ruleLabel(ruleId: string, userRomajiRules: readonly UserRomajiRule[]): { readonly name: string; readonly found: boolean } {
  if (isBuiltin(ruleId)) return { name: ROMAJI_RULES[ruleId].name, found: true };
  const user = userRomajiRules.find((rule) => rule.id === ruleId);
  return user === undefined ? { name: '見つかりません', found: false } : { name: user.name, found: true };
}

/** 押すキーの表示。`s + t`の形。 */
const keysText = (keys: readonly string[]): string => keys.join(' + ');

/** コンボを足す行。入力中の値は行の中だけで持ち、足した時に親へ渡す。 */
function AddCombo({
  table,
  disabled,
  onAdd,
}: {
  readonly table: ReadonlyMap<string, string>;
  readonly disabled: boolean;
  /** 足せなければ理由を返す。 */
  readonly onAdd: (entry: ComboSetEntry) => string | undefined;
}) {
  const [keys, setKeys] = useState('');
  const [kana, setKana] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const built = buildComboEntry(keys, kana, table);
    if (!built.ok) {
      setProblem(built.problem);
      return;
    }
    const rejected = onAdd(built.entry);
    setProblem(rejected);
    if (rejected === undefined) {
      setKeys('');
      setKana('');
    }
  };
  return (
    <form className="combo-set-add" data-combo-set-add onSubmit={submit}>
      <label>
        押すキー
        <input
          type="text"
          aria-label="押すキー"
          placeholder="st"
          spellCheck={false}
          autoComplete="off"
          value={keys}
          disabled={disabled}
          onChange={(event) => setKeys(event.currentTarget.value)}
        />
      </label>
      <label>
        出力のかな
        <input
          type="text"
          aria-label="出力のかな"
          placeholder="して"
          spellCheck={false}
          autoComplete="off"
          value={kana}
          disabled={disabled}
          onChange={(event) => setKana(event.currentTarget.value)}
        />
      </label>
      <button type="submit" data-combo-set-add-submit disabled={disabled || keys.trim() === '' || kana.trim() === ''}>
        コンボを足す
      </button>
      {problem === undefined ? null : (
        <span className="combo-set-invalid" role="alert">
          {problem}
        </span>
      )}
    </form>
  );
}

/**
 * コンボの組を作る・編集する画面。押すキーを英字の文字で、出力をかなで入力すると、組を作る時に選んだ基準の綴りで出力を展開して保存する。
 * 書き込みは親が渡すコールバックを通す。選んでいる組はこの画面の中だけの値で、保存しない。
 */
export function ComboSetEditor({
  comboSets,
  userRomajiRules,
  ready,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCreate,
  onRename,
  onAddCombo,
  onRemoveCombo,
}: ComboSetEditorProps) {
  useHistoryShortcuts({ canUndo, canRedo, undo: onUndo, redo: onRedo });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined);
  const [newRuleId, setNewRuleId] = useState<string>(DEFAULT_ROMAJI_RULE_ID);

  // 選んでいた組が元に戻すなどで無くなった時は、先頭の組に移る
  const comboSet = comboSets.find((candidate) => candidate.id === selectedId) ?? comboSets[0];
  const rules = useMemo(() => allRomajiRules([...userRomajiRules]), [userRomajiRules]);
  const label = comboSet === undefined ? undefined : ruleLabel(comboSet.romajiRuleId, userRomajiRules);
  const table = useMemo(
    () => (comboSet === undefined ? new Map<string, string>() : tableForRule(comboSet.romajiRuleId, [...userRomajiRules])),
    [comboSet, userRomajiRules],
  );
  const createRuleId = rules.some((rule) => rule.id === newRuleId) ? newRuleId : DEFAULT_ROMAJI_RULE_ID;

  const create = () => {
    const id = newComboSetId();
    onCreate(id, NEW_COMBO_SET_NAME, createRuleId);
    setSelectedId(id);
    setNameDraft(undefined);
  };
  const commitName = () => {
    if (comboSet === undefined || nameDraft === undefined) return;
    const name = nameDraft.trim();
    setNameDraft(undefined);
    if (name !== '' && name !== comboSet.name) onRename(comboSet.id, name);
  };
  const add = (entry: ComboSetEntry): string | undefined => {
    if (comboSet === undefined) return undefined;
    const checked = addComboToSet([comboSet], comboSet.id, entry);
    if (!checked.ok) return checked.problem;
    onAddCombo(comboSet.id, entry);
    return undefined;
  };

  return (
    <article className="combo-set" data-combo-set-editor>
      <h1>{COMBO_SET_LABEL}</h1>
      <p className="combo-set-note">
        押すキーを英字の文字で、出力をかなで入力して、コンボを作ります。出力は、組を作る時に選んだ基準の綴りで展開して保存します。作った組は、Setupで選びます。
      </p>
      <div className="combo-set-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          元に戻す
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>
          やり直す
        </button>
      </div>
      {!ready ? null : (
        <>
          <section className="combo-set-section" aria-labelledby="combo-set-pick">
            <h2 id="combo-set-pick">組</h2>
            <div className="combo-set-actions">
              {comboSet === undefined ? null : (
                <label>
                  編集する組
                  <select
                    value={comboSet.id}
                    onChange={(event) => {
                      setSelectedId(event.currentTarget.value);
                      setNameDraft(undefined);
                    }}
                  >
                    {comboSets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                基準の綴り
                <select aria-label="作る組の基準の綴り" value={createRuleId} onChange={(event) => setNewRuleId(event.currentTarget.value)}>
                  {rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" data-combo-set-create onClick={create}>
                新規作成
              </button>
            </div>
            {comboSet === undefined || label === undefined ? (
              <p className="combo-set-note">コンボの組はありません。</p>
            ) : (
              <>
                <label className="combo-set-name">
                  名前
                  <input
                    type="text"
                    value={nameDraft ?? comboSet.name}
                    onChange={(event) => setNameDraft(event.currentTarget.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
                <p className="combo-set-note" data-combo-set-spelling>
                  この組の基準の綴り: {label.name}
                </p>
                {label.found ? null : (
                  <p className="combo-set-note" role="status" data-combo-set-problem="rule-missing">
                    基準の綴りが見つからないため、コンボを足せません。
                  </p>
                )}
              </>
            )}
          </section>

          {comboSet === undefined || label === undefined ? null : (
            <section className="combo-set-section" aria-labelledby="combo-set-combos">
              <h2 id="combo-set-combos">コンボ（{comboSet.combos.length}）</h2>
              <table className="combo-set-table" data-combo-set-table>
                <thead>
                  <tr>
                    <th scope="col">押すキー</th>
                    <th scope="col">出力の綴り</th>
                    <th scope="col">
                      <span className="combo-set-sr">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comboSet.combos.map((combo, index) => (
                    <tr key={`${keysText(combo.keys)}:${combo.output}`} data-combo-set-row={combo.output}>
                      <td className="combo-set-mono">{keysText(combo.keys)}</td>
                      <td className="combo-set-mono">{combo.output}</td>
                      <td>
                        <button
                          type="button"
                          aria-label={`コンボ「${keysText(combo.keys)}」から「${combo.output}」を削除`}
                          onClick={() => onRemoveCombo(comboSet.id, index)}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>コンボを足す</h3>
              <AddCombo key={comboSet.id} table={table} disabled={!label.found} onAdd={add} />
            </section>
          )}
        </>
      )}
    </article>
  );
}
