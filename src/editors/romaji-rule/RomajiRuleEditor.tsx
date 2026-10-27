import { useMemo, useState } from 'react';
import { isKanaKey, newRomajiRuleId, spellingRows, withSpelling, type RomajiRuleContent, type SpellingRow } from '#input/romaji/rule-edit.ts';
import { hasSingleStrokeSokuon, ROMAJI_RULES, type BuiltinRomajiRuleId, type UserRomajiRule } from '#input/romaji/rules.ts';
import { ROMAJI_RULE_LABEL } from './label.ts';
import './romaji-rule.css';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';

/** 新しく作る規則の名前。 */
const NEW_RULE_NAME = '新しいローマ字の綴り';

const BASE_IDS: readonly BuiltinRomajiRuleId[] = ['kunrei', 'oonishi', 'tomisuke', 'azik', 'jlod', 'qwerty'];

export interface RomajiRuleEditorProps {
  /** 自作のローマ字規則。 */
  readonly rules: readonly UserRomajiRule[];
  /** 保存の読み込みが済むまでは、規則が無いように見せない。 */
  readonly ready: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCreate: (id: string, name: string, base: BuiltinRomajiRuleId) => void;
  readonly onDuplicate: (sourceId: string, id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onUpdate: (id: string, content: RomajiRuleContent) => void;
}

const SPELLING_PROBLEM = '綴りは、空白を含まず、キーボードにあるキーだけで書いてください';

/** 揺れる箇所の一覧の1行。入力中の綴りは行の中だけで持ち、確定した時に親へ渡す。 */
function SpellingRowView({
  row,
  onCommit,
}: {
  readonly row: SpellingRow;
  /** 確定した綴りを渡す。置けない綴りなら`false`を返す。 */
  readonly onCommit: (kana: string, roman: string) => boolean;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === undefined) return;
    const ok = onCommit(row.kana, draft);
    setInvalid(!ok);
    if (ok) setDraft(undefined);
  };
  const listId = `romaji-rule-options-${row.kana}`;
  return (
    <tr data-romaji-rule-row={row.kana} data-differs={row.differs ? 'true' : 'false'}>
      <th scope="row">{row.kana}</th>
      <td className="romaji-rule-base">{row.base}</td>
      <td>
        <input
          type="text"
          aria-label={`${row.kana}の綴り`}
          aria-invalid={invalid}
          placeholder={row.base}
          spellCheck={false}
          autoComplete="off"
          list={row.alternatives.length === 0 ? undefined : listId}
          value={draft ?? row.current}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {row.alternatives.length === 0 ? null : (
          <datalist id={listId}>
            {row.alternatives.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        )}
        {invalid ? (
          <span className="romaji-rule-invalid" role="alert">
            {SPELLING_PROBLEM}
          </span>
        ) : null}
      </td>
      <td className="romaji-rule-mark">{row.differs ? '基底と違う' : ''}</td>
    </tr>
  );
}

/** 一覧に無いかなの綴りを足す欄。 */
function AddSpelling({ onAdd }: { readonly onAdd: (kana: string, roman: string) => string | undefined }) {
  const [kana, setKana] = useState('');
  const [roman, setRoman] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const add = () => {
    const result = onAdd(kana.trim(), roman);
    setProblem(result);
    if (result === undefined) {
      setKana('');
      setRoman('');
    }
  };
  return (
    <div className="romaji-rule-add" data-romaji-rule-add>
      <label>
        かな
        <input type="text" value={kana} placeholder="きゃ" spellCheck={false} onChange={(event) => setKana(event.currentTarget.value)} />
      </label>
      <label>
        綴り
        <input type="text" value={roman} placeholder="kya" spellCheck={false} onChange={(event) => setRoman(event.currentTarget.value)} />
      </label>
      <button type="button" data-romaji-rule-add-submit disabled={kana.trim() === '' || roman.trim() === ''} onClick={add}>
        一覧に足す
      </button>
      {problem === undefined ? null : (
        <span className="romaji-rule-invalid" role="alert">
          {problem}
        </span>
      )}
    </div>
  );
}

/**
 * 基底のルールに差分を足して、自作のローマ字規則を作る・編集する画面。
 * 書き込みは親が渡すコールバックを通す。選んでいる規則はこの画面の中だけの値で、保存しない。
 */
export function RomajiRuleEditor({ rules, ready, canUndo, canRedo, onUndo, onRedo, onCreate, onDuplicate, onRename, onUpdate }: RomajiRuleEditorProps) {
  useHistoryShortcuts({ canUndo, canRedo, undo: onUndo, redo: onRedo });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined);

  // 選んでいた規則が元に戻すなどで無くなった時は、先頭の規則に移る
  const rule = rules.find((candidate) => candidate.id === selectedId) ?? rules[0];
  const rows = useMemo(() => (rule === undefined ? [] : spellingRows(rule)), [rule]);

  const update = (next: Partial<RomajiRuleContent>) => {
    if (rule === undefined) return;
    onUpdate(rule.id, { base: rule.base, overrides: rule.overrides, generateSokuon: rule.generateSokuon, ...next });
  };
  const commitSpelling = (kana: string, roman: string): boolean => {
    if (rule === undefined) return true;
    const overrides = withSpelling(rule.overrides, kana, roman);
    if (overrides === undefined) return false;
    update({ overrides });
    return true;
  };
  const addSpelling = (kana: string, roman: string): string | undefined => {
    if (rule === undefined) return undefined;
    if (!isKanaKey(kana)) return 'かなは、空白を含めず、かなで書いてください';
    const overrides = withSpelling(rule.overrides, kana, roman);
    if (overrides === undefined) return SPELLING_PROBLEM;
    update({ overrides });
    return undefined;
  };

  const create = () => {
    const id = newRomajiRuleId();
    onCreate(id, NEW_RULE_NAME, 'kunrei');
    setSelectedId(id);
    setNameDraft(undefined);
  };
  const duplicate = () => {
    if (rule === undefined) return;
    const id = newRomajiRuleId();
    onDuplicate(rule.id, id);
    setSelectedId(id);
    setNameDraft(undefined);
  };
  const commitName = () => {
    if (rule === undefined || nameDraft === undefined) return;
    const name = nameDraft.trim();
    setNameDraft(undefined);
    if (name !== '' && name !== rule.name) onRename(rule.id, name);
  };

  return (
    <article className="romaji-rule" data-romaji-rule-editor>
      <h1>{ROMAJI_RULE_LABEL}</h1>
      <p className="romaji-rule-note">
        基底のルールに差分を足して、自作のローマ字の綴りを作ります。作った綴りは、条件のローマ字規則から選べます。綴りは小文字として扱います。
      </p>
      <div className="romaji-rule-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          元に戻す
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>
          やり直す
        </button>
      </div>
      {!ready ? null : (
        <>
          <section className="romaji-rule-section" aria-labelledby="romaji-rule-pick">
            <h2 id="romaji-rule-pick">綴り</h2>
            <div className="romaji-rule-actions">
              {rule === undefined ? null : (
                <label>
                  編集する綴り
                  <select
                    value={rule.id}
                    onChange={(event) => {
                      setSelectedId(event.currentTarget.value);
                      setNameDraft(undefined);
                    }}
                  >
                    {rules.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" data-romaji-rule-create onClick={create}>
                新規作成
              </button>
              <button type="button" data-romaji-rule-duplicate disabled={rule === undefined} onClick={duplicate}>
                複製
              </button>
            </div>
            {rule === undefined ? (
              <p className="romaji-rule-note">自作の綴りはありません。</p>
            ) : (
              <>
                <label className="romaji-rule-name">
                  名前
                  <input
                    type="text"
                    value={nameDraft ?? rule.name}
                    onChange={(event) => setNameDraft(event.currentTarget.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
                <div className="romaji-rule-actions">
                  <label>
                    基底のルール
                    <select
                      value={rule.base}
                      onChange={(event) => {
                        const base = event.currentTarget.value as BuiltinRomajiRuleId;
                        // AZIKとJLODは促音を1打で持つので、子音を重ねる見出しは足さない
                        update({ base, generateSokuon: hasSingleStrokeSokuon(base) ? false : rule.generateSokuon });
                      }}
                    >
                      {BASE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {ROMAJI_RULES[id].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="romaji-rule-check">
                    <input
                      type="checkbox"
                      checked={!hasSingleStrokeSokuon(rule.base) && rule.generateSokuon}
                      disabled={hasSingleStrokeSokuon(rule.base)}
                      onChange={(event) => update({ generateSokuon: event.currentTarget.checked })}
                    />
                    促音の後ろに子音を重ねた見出しを自動生成する（っか → kka）
                  </label>
                </div>
              </>
            )}
          </section>

          {rule === undefined ? null : (
            <section className="romaji-rule-section" aria-labelledby="romaji-rule-spellings">
              <h2 id="romaji-rule-spellings">綴りが割れるかな</h2>
              <table className="romaji-rule-table" data-romaji-rule-table>
                <thead>
                  <tr>
                    <th scope="col">かな</th>
                    <th scope="col">基底の綴り</th>
                    <th scope="col">この規則の綴り</th>
                    <th scope="col">
                      <span className="romaji-rule-sr">基底との差</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <SpellingRowView key={`${rule.id}:${row.kana}`} row={row} onCommit={commitSpelling} />
                  ))}
                </tbody>
              </table>
              <h3>一覧に無いかなの綴りを足す</h3>
              <AddSpelling key={rule.id} onAdd={addSpelling} />
            </section>
          )}
        </>
      )}
    </article>
  );
}
