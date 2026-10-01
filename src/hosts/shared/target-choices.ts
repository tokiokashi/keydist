import { builtInLayoutKind } from '#input/layouts/kind.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import { analysisTargetKey, effectiveLabel, nameTargets, type AnalysisTarget, type Setup } from '#input/setup/index.ts';

/**
 * 対象の選択（docs/architecture.md「対象の選択」）に並べる候補。
 *
 * 候補は区分（組み込み・英字 / 組み込み・かな / 自作の配列 / Setup）に分ける。区分と名前だけの
 * 純粋な組み立てなので、ペインの枠（個別画面・Workspace）のどちらからも同じものを使う。
 */

/** 手持ちのSetupの番号（作成時に固定した`Setup.number`）。表示名の衝突時の区別と候補の表示で揃えて使う。 */
export function setupNumbersOf(setups: readonly Setup[]): ReadonlyMap<string, number> {
  return new Map(setups.map((setup) => [setup.id, setup.number] as const));
}

export type TargetChoiceGroupId = 'missing' | 'builtin-alphabet' | 'builtin-kana' | 'user' | 'setup';

export interface TargetChoice {
  /** `analysisTargetKey`。チェックの値にもなる。 */
  readonly key: string;
  readonly target: AnalysisTarget;
  /** 一覧に出す名前。 */
  readonly name: string;
  /** hoverに出すフルの名前（Setupの配列・物理配列等）。名前と同じなら省く。 */
  readonly fullName?: string;
  /** 名前の右に小さく添える種類（`Setup n`）。 */
  readonly tag?: string;
  /** 絞り込みだけに効く読み・別名（`Layout.aliases`）。画面には出さない。 */
  readonly aliases?: readonly string[];
}

export interface TargetChoiceGroup {
  readonly id: TargetChoiceGroupId;
  readonly label: string;
  readonly choices: readonly TargetChoice[];
}

export interface TargetChoiceSource {
  readonly layouts: ReadonlyMap<string, Layout>;
  /** `layouts`のうち自作の配列のid。 */
  readonly userLayoutIds: ReadonlySet<string>;
  readonly shapes: ReadonlyMap<string, PhysicalShape>;
  readonly setups: readonly Setup[];
  /**
   * 今選んでいる対象。候補に無いもの（削除されたSetup・見つからない配列）は「見つからない」区分に
   * 出し、外せるようにする（実際の状態をそのまま見せる）。
   */
  readonly selected: readonly AnalysisTarget[];
}

function missingName(target: AnalysisTarget): string {
  return target.kind === 'setup' ? '削除されたSetup' : '見つからない配列';
}

export function targetChoiceGroups({ layouts, userLayoutIds, shapes, setups, selected }: TargetChoiceSource): readonly TargetChoiceGroup[] {
  const alphabet: TargetChoice[] = [];
  const kana: TargetChoice[] = [];
  const user: TargetChoice[] = [];
  // 並びはカタログの並び（配列の定義順）のまま。名前順にすると、英字の配列の中でQWERTYが先頭に来ない。
  for (const layout of layouts.values()) {
    const target: AnalysisTarget = { kind: 'layout', layoutId: layout.id };
    const choice: TargetChoice = {
      key: analysisTargetKey(target),
      target,
      name: layout.name,
      ...(layout.aliases === undefined || layout.aliases.length === 0 ? {} : { aliases: layout.aliases }),
    };
    if (userLayoutIds.has(layout.id)) user.push(choice);
    // 英字とかなの区分は配列の種類の対応表（`input/layouts/kind.ts`）に従う。`Layout`の形からは決まらない。
    else if (builtInLayoutKind(layout.id) === 'kana') kana.push(choice);
    else alphabet.push(choice);
  }

  // Setupのフル名は`nameTargets`のfullName（集合によらない全部を含む名前）。一覧は「取りうる全部から
  // 探す」場なので、集合の中の共通部分を落とすdisplayNameは使わない。
  const setupNumbers = setupNumbersOf(setups);
  const namedSetups = nameTargets(setups.map((setup) => ({
    key: setup.id,
    kind: 'setup' as const,
    layoutName: layouts.get(setup.layoutId)?.name ?? '見つからない配列',
    shapeName: shapes.get(setup.shapeId)?.name ?? '見つからない物理配列',
  })));
  const setupChoices: TargetChoice[] = setups.map((setup, index) => {
    const target: AnalysisTarget = { kind: 'setup', setupId: setup.id };
    const fullName = namedSetups[index]!.fullName;
    const label = effectiveLabel(setup.label);
    return {
      key: analysisTargetKey(target),
      target,
      name: label ?? fullName,
      ...(label === undefined ? {} : { fullName }),
      tag: `Setup ${setupNumbers.get(setup.id)!}`,
    };
  });

  const known = new Set([...alphabet, ...kana, ...user, ...setupChoices].map((choice) => choice.key));
  const missing: TargetChoice[] = selected
    .filter((target) => !known.has(analysisTargetKey(target)))
    .map((target) => ({ key: analysisTargetKey(target), target, name: missingName(target) }));

  const groups: TargetChoiceGroup[] = [
    { id: 'missing', label: '見つからない配列・Setup', choices: missing },
    { id: 'builtin-alphabet', label: '組み込み・英字の配列', choices: alphabet },
    { id: 'builtin-kana', label: '組み込み・かな配列', choices: kana },
    { id: 'user', label: '自作の配列', choices: user },
    { id: 'setup', label: 'Setup', choices: setupChoices },
  ];
  return groups.filter((group) => group.choices.length > 0);
}

/**
 * 絞り込みの比較用に揃える。全角・半角と大文字・小文字に加え、ひらがなとカタカナも同じにする
 * （NFKCは半角カナを全角カナへ寄せるので、その後にカタカナをひらがなへ写せば半角カナも揃う）。
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30A1-\u30F6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

/**
 * 絞り込み欄の語で候補を絞る。空白で区切った語をすべて含む候補を残す（名前・フル名・種類・読みや別名のどれかに）。
 * 候補が無くなった区分は落とす。
 */
export function filterTargetChoiceGroups(groups: readonly TargetChoiceGroup[], query: string): readonly TargetChoiceGroup[] {
  const words = normalizeSearchText(query).split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return groups;
  return groups
    .map((group) => ({
      ...group,
      choices: group.choices.filter((choice) => {
        const haystack = normalizeSearchText([choice.name, choice.fullName ?? '', choice.tag ?? '', ...(choice.aliases ?? [])].join(' '));
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((group) => group.choices.length > 0);
}

/**
 * 見出しに出す対象の名前。全部が入るなら読点でつなぎ、入らなければ先頭と「他N件」に畳む
 * （docs/architecture.md「対象の選択」）。入るかどうかは画面の実寸で決めるので、呼び出し側が渡す。
 */
export function targetSummaryText(names: readonly string[], fits: boolean): { readonly text: string; readonly more?: string } {
  if (names.length === 0) return { text: '未選択' };
  if (fits || names.length === 1) return { text: names.join('、') };
  return { text: names[0]!, more: `他${names.length - 1}件` };
}

/**
 * 集合の対象を、候補の一覧の順（組み込みの定義順 → 自作の配列 → Setup）に並べる。表示順はこれに固定する
 * （チェックを付けた順にすると、同じ集合でも組み方によって並びが変わり、画面どうしで見比べにくい）。
 * 色は並びと別で、画面の器が加えた順に配ったもの（`colorSlots`。個別画面は集合、Workspaceは全ペインの和）を対象に付けたまま使う。
 * 候補に無い対象（削除されたSetup等）は末尾へ、元の並びのまま置く。
 */
export function sortTargetsByChoices(
  targets: readonly AnalysisTarget[],
  groups: readonly TargetChoiceGroup[],
): readonly AnalysisTarget[] {
  const rank = new Map<string, number>();
  for (const group of groups) {
    if (group.id === 'missing') continue;
    for (const choice of group.choices) rank.set(choice.key, rank.size);
  }
  const ranked = targets.map((target, index) => ({ target, index, rank: rank.get(analysisTargetKey(target)) ?? Number.POSITIVE_INFINITY }));
  ranked.sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank));
  const sorted = ranked.map((entry) => entry.target);
  return sorted.every((target, index) => target === targets[index]) ? targets : sorted;
}
