/** 配列の選択状態（どれを比較表示に含めるか）の localStorage 永続化 */

export type ModeId = 'en' | 'ja';

const STORAGE_KEY = 'keydist:selected-layouts';

type StoredSelection = Partial<Record<ModeId, string[]>>;

/**
 * 保存値と既定値から、実際に使う選択集合を決める。
 * 保存が無いモード（= 初回訪問）だけ既定値を使う。保存が空配列のモードは
 * 「全部オフ」を意図した状態として尊重し、既定値へは戻さない。
 * 保存値にもう存在しない配列 id が混ざっていても、呼び出し側（activeLayouts）が
 * filter で弾くので害はなく、ここでは弾かない。
 */
export function resolveSelection(
  stored: string[] | undefined,
  initial: readonly string[],
): Set<string> {
  return new Set(stored ?? initial);
}

/** 保存値を読む。壊れていれば「保存無し」として扱う */
export function loadSelection(): StoredSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSelection;
    const result: StoredSelection = {};
    for (const mode of ['en', 'ja'] as ModeId[]) {
      const v = parsed[mode];
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) result[mode] = v;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveSelection(selection: Record<ModeId, Set<string>>) {
  try {
    const data: Record<ModeId, string[]> = {
      en: [...selection.en],
      ja: [...selection.ja],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 保存できなくてもその場の表示は成立する
  }
}
