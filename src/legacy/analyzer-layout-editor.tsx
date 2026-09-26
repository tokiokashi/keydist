import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  FINGERS,
  HOME_ROW,
  keyId,
  QWERTY_LEGEND,
  type NonThumb,
} from '../geometry.ts';
import {
  ROW_LABELS,
  newId as newLayoutId,
  validate,
  type RomajiRuleId,
  type UserLayout,
} from '#input/layouts/user-layouts.ts';
import {
  decodeLayoutFile,
  formatForFileName,
  importBenizara,
  importDvorakJ,
  importVial,
} from '../layout-import.ts';
import type { AnalyzerLayoutEditorModel } from './analyzer-layout-editor-model.ts';

const FINGER_NAMES: Record<NonThumb, string> = {
  LP: '左小指',
  LR: '左薬指',
  LM: '左中指',
  LI: '左人差指',
  RI: '右人差指',
  RM: '右中指',
  RR: '右薬指',
  RP: '右小指',
};

export interface AnalyzerLayoutEditorProps {
  model: AnalyzerLayoutEditorModel;
  onAddLayout(definition: UserLayout): void;
}

export function AnalyzerLayoutEditor({
  model,
  onAddLayout,
}: AnalyzerLayoutEditorProps) {
  const { romajiRules } = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const [name, setName] = useState('');
  const [rows, setRows] = useState<string[]>(() => ROW_LABELS.map(() => ''));
  const [romaji, setRomaji] = useState<RomajiRuleId>(
    () => (romajiRules[0]?.id ?? 'kunrei') as RomajiRuleId,
  );
  const [homeKeys, setHomeKeys] = useState<Partial<Record<NonThumb, string>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [importError, setImportError] = useState('');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  const homeRowKeys = useMemo(
    () => [...(rows[HOME_ROW] ?? '')].map((_, col) => keyId(HOME_ROW, col)),
    [rows],
  );

  useEffect(() => {
    if (romajiRules.some((rule) => rule.id === romaji)) return;
    setRomaji((romajiRules[0]?.id ?? 'kunrei') as RomajiRuleId);
  }, [romaji, romajiRules]);

  const updateRow = (index: number, value: string) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? value : row));
    if (index === HOME_ROW) {
      const nextHomeRowKeys = [...value].map((_, col) => keyId(HOME_ROW, col));
      setHomeKeys((current) => Object.fromEntries(
        Object.entries(current).filter(([, key]) => key && nextHomeRowKeys.includes(key)),
      ) as Partial<Record<NonThumb, string>>);
    }
  };

  const submit = () => {
    const normalized = rows.map((row) => row.trim());
    const nextErrors = validate(normalized);
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    onAddLayout({
      id: newLayoutId(),
      name: name.trim() || '自作配列',
      rows: [normalized[0], normalized[1], normalized[2], normalized[3]],
      romaji,
      homeKeys: Object.fromEntries(
        Object.entries(homeKeys).filter(([, value]) => value),
      ),
    });

    setName('');
    setRows(ROW_LABELS.map(() => ''));
    setHomeKeys({});
  };

  const importLayout = async (file: File | undefined) => {
    if (!file) return;
    try {
      const format = formatForFileName(file.name);
      if (!format) throw new Error('DvorakJの .txt、Vialの .vil、紅皿の .bnz / .iniを選ぶ');
      const source = decodeLayoutFile(await file.arrayBuffer(), format);
      const fallbackName = file.name.replace(/\.[^.]+$/, '');
      const imported = format === 'vial'
        ? importVial(source, fallbackName)
        : format === 'benizara'
          ? importBenizara(source, fallbackName)
          : importDvorakJ(source, fallbackName);
      onAddLayout({
        id: newLayoutId(),
        name: imported.name,
        rows: imported.rows,
        romaji: 'kunrei',
        legends: imported.legends,
        sequences: imported.sequences,
        direct: imported.direct,
      });
      setImportError('');
      setImportWarnings(imported.warnings);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '定義ファイルを取り込めない');
      setImportWarnings([]);
    }
  };

  return (
    <div data-react-feature="layout-editor">
      <label className="ctl">
        <span>名前</span>
        <input
          type="text"
          id="new-name"
          placeholder="自作配列"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>

      <div className="rows" id="new-rows">
        {ROW_LABELS.map((label, index) => (
          <label key={label}>
            <span>{label}</span>
            <input
              type="text"
              spellCheck={false}
              placeholder={QWERTY_LEGEND[index]}
              data-optional={index === 0 ? 'true' : undefined}
              value={rows[index] ?? ''}
              onChange={(event) => updateRow(index, event.currentTarget.value)}
            />
          </label>
        ))}
      </div>

      <div id="new-home-keys">
        <h4>配列側のホームキー（任意）</h4>
        <p className="note">未指定なら物理形状側の既定ホームキーを使います。</p>
        {FINGERS.map((finger) => (
          <label className="geometry-number" key={finger}>
            <span>{FINGER_NAMES[finger]}</span>
            <select
              data-home-finger={finger}
              value={homeKeys[finger] ?? ''}
              onChange={(event) => setHomeKeys((current) => ({
                ...current,
                [finger]: event.currentTarget.value,
              }))}
            >
              <option value="">形状の既定</option>
              {homeRowKeys.map((id) => <option value={id} key={id}>{id}</option>)}
            </select>
          </label>
        ))}
      </div>

      <label className="ctl">
        <span>ローマ字規則（日本語モード）</span>
        <select
          id="new-romaji"
          value={romaji}
          onChange={(event) => setRomaji(event.currentTarget.value as RomajiRuleId)}
        >
          {romajiRules.map((rule) => (
            <option value={rule.id} key={rule.id}>{rule.name}</option>
          ))}
        </select>
      </label>

      <p className="error" id="new-error" hidden={errors.length === 0}>
        {errors.join(' / ')}
      </p>
      <button type="button" id="add-layout" onClick={submit}>追加する</button>

      <label className="ctl import-file">
        <span>定義ファイルから取り込む</span>
        <input
          type="file"
          id="import-layout"
          accept=".vil,.txt,.bnz,.ini,application/json,text/plain"
          title="DvorakJ .txt、Vial .vil、紅皿 .bnz / .iniに対応する"
          onChange={(event) => {
            void importLayout(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </label>
      <p className="error" id="import-error" hidden={!importError}>{importError}</p>
      <p className="note" id="import-warning" hidden={importWarnings.length === 0}>
        {importWarnings.length > 0 ? `注意: ${importWarnings.join(' / ')}` : ''}
      </p>
    </div>
  );
}
