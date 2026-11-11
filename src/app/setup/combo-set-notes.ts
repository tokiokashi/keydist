import type { SetupComboSetView } from './setup-view.ts';

/**
 * Setupの画面が、選んだコンボの組について出す状態の文。
 * 組のコンボを計算から外した数、組の基準の綴りとSetupの綴りの違い、組を重ねられない理由を伝える。
 */

export type ComboSetNoteKind = 'kana-layout' | 'missing' | 'dropped' | 'spelling';

export interface ComboSetNote {
  readonly kind: ComboSetNoteKind;
  readonly text: string;
}

export function comboSetStatusNotes(view: SetupComboSetView): readonly ComboSetNote[] {
  const notes: ComboSetNote[] = [];
  const { status } = view;
  if (!view.selectable) {
    notes.push({ kind: 'kana-layout', text: 'かな配列のSetupでは、コンボの組を選べません。' });
  } else if (status.kind === 'missing') {
    notes.push({ kind: 'missing', text: '選んだコンボの組が見つかりません。コンボの組を重ねずに測っています。' });
  }
  if (status.kind === 'applied' && status.dropped.length > 0) {
    const unresolved = status.dropped.filter((item) => item.reason === 'key-unresolved').length;
    const trigger = status.dropped.filter((item) => item.reason === 'trigger-key').length;
    const reasons = [
      ...(unresolved === 0 ? [] : [`この配列で出せない文字のキーを使うものが${unresolved}件`]),
      ...(trigger === 0 ? [] : [`修飾や層のキーを使うものが${trigger}件`]),
    ];
    notes.push({
      kind: 'dropped',
      text: `組のコンボ${status.applied + status.dropped.length}件のうち${status.dropped.length}件は、計算に入れていません。${reasons.join('、')}です。`,
    });
  }
  if (view.spellingDiffers) {
    const quote = (name: string | undefined): string => (name === undefined ? '見つからない綴り' : `「${name}」`);
    notes.push({
      kind: 'spelling',
      text: `この組の基準の綴りは${quote(view.comboSetRuleName)}で、このSetupは${quote(view.effectiveRuleName)}で打ちます。組を作り直してください。`,
    });
  }
  return notes;
}
