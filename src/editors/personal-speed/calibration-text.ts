import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import type { Finger } from '#input/shapes/geometry.ts';
import {
  CALIBRATION_FALLBACK_FINGER_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
  type ParseCalibrationFormResult,
} from '#interpretation/timing/calibration-form.ts';
import {
  remainingCalibrationIntervals,
  type CalibrationItem,
  type CalibrationRun,
  type CalibrationTask,
} from '#interpretation/timing/calibration-session.ts';

/** 個人速度の画面に出す文言。 */

export const ACTIONS_UNIT = 'アクション/秒';
export const SPEED_UNIT = 'u/秒';

function fingerLabel(finger: string): string {
  return FINGER_LABEL[finger as Finger] ?? finger;
}

/** `LM:LI`や`LM>LI`の指の組を、指の名前の組にする。 */
function pairLabel(pair: string, separator: ':' | '>'): string {
  const [first = '', second = ''] = pair.split(separator);
  return separator === ':' ? `${fingerLabel(first)}と${fingerLabel(second)}` : `${fingerLabel(first)}から${fingerLabel(second)}`;
}

export function calibrationItemLabel(item: CalibrationItem): string {
  switch (item.kind) {
    case 'actions': return '通常の打鍵速度';
    case 'direction': return item.direction === 'L→R' ? '左手から右手' : '右手から左手';
    case 'finger': return fingerLabel(item.finger);
    case 'same-hand-pair': return pairLabel(item.pair, ':');
    case 'directed-pair': return pairLabel(item.pair, '>');
  }
}

/** 欄の識別子（`calibrationItemId`か代表値の欄）に対応する名前。 */
export function calibrationFieldLabel(fieldId: string): string {
  if (fieldId === CALIBRATION_SAME_HAND_FIELD) return '同手・別指の代表の速度';
  if (fieldId === CALIBRATION_FALLBACK_FINGER_FIELD) return '測定できなかった指の移動速度';
  const [kind, ...rest] = fieldId.split(':');
  const name = rest.join(':');
  switch (kind) {
    case 'actions': return calibrationItemLabel({ kind: 'actions' });
    case 'direction': return `異手 ${calibrationItemLabel({ kind: 'direction', direction: name === 'L→R' ? 'L→R' : 'R→L' })}`;
    case 'finger': return `${fingerLabel(name)}の移動速度`;
    case 'same-hand-pair': return `同手・別指 ${pairLabel(name, ':')}`;
    case 'directed-pair': return `同手・別指 ${pairLabel(name, '>')}`;
    default: return fieldId;
  }
}

/** 欄の値の単位。指の移動速度は物理キーの距離（u）で、他は1秒あたりの打鍵数。 */
export function calibrationFieldUnit(fieldId: string): string {
  return fieldId === CALIBRATION_FALLBACK_FINGER_FIELD || fieldId.startsWith('finger:') ? SPEED_UNIT : ACTIONS_UNIT;
}

/** 保存値を編集した欄の値を保存できなかった理由。 */
export function calibrationFormProblemText(problem: Extract<ParseCalibrationFormResult, { ok: false }>): string {
  const label = calibrationFieldLabel(problem.fieldId);
  return problem.problem === 'empty'
    ? `${label}を入力してください。`
    : `${label}は${problem.min}から${problem.max}までの数値で入力してください。`;
}

/** 測る項目の案内。キーは配列の刻印の名前で出す。 */
export function calibrationInstruction(task: CalibrationTask, keyLabel: (keyId: string) => string): string {
  const first = `「${keyLabel(task.keys[0])}」`;
  const second = `「${keyLabel(task.keys[1])}」`;
  const subject = calibrationItemLabel(task.item);
  switch (task.item.kind) {
    case 'actions':
      return `${first}と${second}を、普段の速さで交互に打ってください。`;
    case 'finger':
      return `${subject}: ${first}と${second}を交互に打ってください。`;
    case 'same-hand-pair':
      return `${subject}: ${first}と${second}を、普段の速さで交互に打ってください。`;
    case 'direction':
    case 'directed-pair':
      return `${subject}: ${first}→${second}の順で、普段の速さで繰り返してください。戻りの打鍵は数えません。`;
  }
}

/** 測定の進み具合。複数項目なら何番目かも出す。 */
export function calibrationProgressText(run: CalibrationRun): string {
  const remaining = `あと${remainingCalibrationIntervals(run)}回`;
  return run.tasks.length > 1 ? `${run.index + 1} / ${run.tasks.length}、${remaining}` : remaining;
}

export function wrongKeyText(keyLabel: string): string {
  return `今は「${keyLabel}」を押す番です。`;
}

export function savedMessage(scope: 'normal' | 'directional' | 'item', item?: CalibrationItem): string {
  if (scope === 'normal') return '通常の速度と指の移動速度を測って保存しました。';
  if (scope === 'directional') return '方向別の速度を測って保存しました。';
  return item === undefined ? '保存しました。' : `${calibrationItemLabel(item)}を測り直して保存しました。`;
}

export const MEASUREMENT_OUT_OF_RANGE_TEXT = '測った値が保存できる範囲を外れていたため、保存していません。もう一度測ってください。';
