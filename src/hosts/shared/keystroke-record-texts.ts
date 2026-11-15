import type { KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import type { KeystrokeRecordTexts } from '#analyzers/pane-parts.tsx';
import { conditionItemLabel, conditionOverrideValueText, type ConditionValueNames } from './condition-summary.ts';

/**
 * 選んだ打鍵の記録の、記録を取った時の物理配列・指の割り当て・条件の名前。idは、条件の要約と同じ表で名前に引く
 * （引けないidは「見つからない〜」）。今の入力の値は使わない。食い違う時も、記録を取った時の値を出す。
 */
export function keystrokeRecordTexts(record: KeystrokeRecord, names: ConditionValueNames): KeystrokeRecordTexts {
  const value = (id: Parameters<typeof conditionOverrideValueText>[0], raw: unknown) => conditionOverrideValueText(id, raw, names);
  const label = (id: string) => conditionItemLabel(id) ?? id;
  const { conditions } = record;
  return {
    rows: [
      { label: '物理配列', value: value('defaultShapeId', record.shapeId) },
      { label: label('fingerAssignmentId'), value: value('fingerAssignmentId', record.fingerAssignmentId) },
      { label: label('windowSize'), value: value('windowSize', conditions.windowSize) },
      { label: label('romajiRuleId'), value: conditions.romajiRuleId === null ? 'なし' : value('romajiRuleId', conditions.romajiRuleId) },
      { label: label('keepSymbols'), value: value('keepSymbols', conditions.keepSymbols) },
      { label: label('keepAlphanumerics'), value: value('keepAlphanumerics', conditions.keepAlphanumerics) },
    ],
    conditionLabel: (key) => (key === 'comboSet' ? 'コンボの組' : label(key)),
  };
}
