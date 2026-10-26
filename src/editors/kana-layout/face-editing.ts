import type { DraftFace } from '#input/layouts/face-layout-edit.ts';
import type { FaceMode, InputRole, LayerKind, TriggerOrder, TriggerPersistence } from '#input/layouts/types.ts';
import { physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';
import { THUMB_KEY, SHIFT_KEY, type PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';

/**
 * 面1つの下書きを書き換える純関数。画面は値を書き換えるたびにここを通し、
 * 項目どうしの依存（単打の面は順序を持たない、など）で意味を失った項目を残さない。
 * 失う項目は、その面の定義が持てない項目だけ。利用者が選んでいない値を、ここで足すことはしない。
 */

/** 面の定義が持てない項目を落とし、triggerに無いキーの修飾の組を落とす。 */
export function normalizeFace(face: DraftFace): DraftFace {
  const next: DraftFace = { ...face };
  if (next.trigger.length === 0) {
    delete next.mode;
    delete next.triggerPersistence;
    delete next.triggerOrder;
    delete next.layer;
    delete next.modifierGroups;
  }
  if (next.inputRole !== 'composition') delete next.compositionAggregation;
  if (next.inputRole !== 'modifier') delete next.modifierGroups;
  // 先押しの指定は同時押しの面だけが持つ。前置・後置の面は順序で既に決まっている
  if (next.mode !== undefined && next.mode !== 'simultaneous') delete next.triggerOrder;
  if (next.modifierGroups !== undefined) {
    const groups = Object.fromEntries(Object.entries(next.modifierGroups).filter(([key]) => next.trigger.includes(key)));
    if (Object.keys(groups).length === 0) delete next.modifierGroups;
    else next.modifierGroups = groups;
  }
  return next;
}

/** triggerのキーを足す・外す。 */
export function toggleTriggerKey(face: DraftFace, key: string): DraftFace {
  const trigger = face.trigger.includes(key) ? face.trigger.filter((entry) => entry !== key) : [...face.trigger, key];
  return normalizeFace({ ...face, trigger });
}

/** 面の上のキーの出力を書く。空にすると、そのキーの出力を消す。 */
export function setFaceOutput(face: DraftFace, key: string, output: string): DraftFace {
  const outputs = { ...face.outputs };
  if (output === '') delete outputs[key];
  else outputs[key] = output;
  return { ...face, outputs };
}

/** 修飾の組の名前を書く。空にすると、そのキーの分類を消す。 */
export function setModifierGroup(face: DraftFace, key: string, group: string): DraftFace {
  const groups = { ...face.modifierGroups };
  if (group === '') delete groups[key];
  else groups[key] = group;
  return normalizeFace({ ...face, modifierGroups: groups });
}

/** 面の項目を書き換える。`undefined` を渡した項目は、未選択に戻す。 */
export function patchFace(face: DraftFace, patch: Partial<DraftFace>): DraftFace {
  return normalizeFace({ ...face, ...patch });
}

export const MODE_LABEL: Readonly<Record<FaceMode, string>> = {
  simultaneous: '同時に押す',
  prefix: '切り替えのキーを先に打つ',
  suffix: '切り替えのキーを後に打つ',
};

export const PERSISTENCE_LABEL: Readonly<Record<TriggerPersistence, string>> = {
  single: '単発（1回の入力ごとに押す）',
  'hold-capable': '保持（押し続けて複数の入力に使える）',
};

export const INPUT_ROLE_LABEL: Readonly<Record<InputRole, string>> = {
  layer: 'レイヤーの切り替え',
  modifier: '修飾キー',
  composition: '合成',
};

export const AGGREGATION_LABEL: Readonly<Record<LayerKind, string>> = {
  layer: 'レイヤーに数える',
  combo: 'コンボ枠に数える',
};

export const TRIGGER_ORDER_LABEL: Readonly<Record<TriggerOrder, string>> = {
  prefix: '切り替えのキーを先に押す',
  suffix: '切り替えのキーを後に押す',
};

/** 面の一覧に出す短い名前。切り替えのキーと、打鍵の順序の組。 */
export function faceSummary(face: DraftFace, standard?: PhysicalKeyboardStandard): string {
  if (face.trigger.length === 0) return '単打';
  const keys = face.trigger.map((key) => keyLabel(key, standard)).join('+');
  return face.mode === undefined ? keys : `${keys}・${MODE_LABEL[face.mode]}`;
}

/** キーの名前。親指とShiftは図に出す名前のまま。 */
export function keyLabel(key: string, standard?: PhysicalKeyboardStandard): string {
  if (key === THUMB_KEY.LT) return '左親指';
  if (key === THUMB_KEY.RT) return '右親指';
  if (key === SHIFT_KEY.L) return '左Shift';
  if (key === SHIFT_KEY.R) return '右Shift';
  return physicalKeyDisplayLabel(key, standard);
}

/**
 * 診断の位置（`faces[2].outputs.q` など）から、面の番号（0始まり）を取り出す。
 * 面の中の位置でなければ `undefined`。
 */
export function faceIndexOfPath(path: string): number | undefined {
  const match = /^faces\[(\d+)\]/.exec(path);
  return match === null ? undefined : Number(match[1]);
}
