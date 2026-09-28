/**
 * Setupの名前（#544 §4「名前は配列名+形状名から自動で付ける。同名になる時だけ
 * ユーザーがラベルを付ける」）。
 *
 * このファイルは `Layout` / `PhysicalShape` を直接importしない。配列名・形状名の解決は
 * 呼び出し側（resolve.tsやそれを使う層）が行い、ここには文字列だけを渡す。
 * 衝突判定は「最終的な表示名」だけを見れば決まる、配列・形状の実体を知らなくてよい計算
 * なので、依存を増やさないほうが純粋層としてテストしやすい。
 */

/** 「配列名 + 形状名」から自動生成する名前。 */
export function deriveSetupName(layoutName: string, shapeName: string): string {
  return `${layoutName} / ${shapeName}`;
}

export interface SetupNameSource {
  readonly setupId: string;
  /** ユーザーが付けたラベル。無ければ自動生成名を使う。 */
  readonly label: string | undefined;
  readonly layoutName: string;
  readonly shapeName: string;
}

export interface NamedSetup {
  readonly setupId: string;
  /** 実際に表示する名前（label ?? 自動生成名）。 */
  readonly displayName: string;
  /** ラベルの有無によらない自動生成名。衝突の説明や再ラベル時の初期値に使う。 */
  readonly derivedName: string;
  /** 表示名が他のSetupと衝突しているか。trueならユーザーにラベル入力を促す。 */
  readonly needsLabel: boolean;
}

/**
 * Setupの集合から、表示名と「ラベルが要るか」をまとめて求める（純関数）。
 * 衝突はラベル由来か自動生成由来かを問わず、最終的な表示名の一致だけで判定する
 * （#544はラベル同士の衝突だけを特別扱いしていないため。表示名が重なっていれば
 * 見分けが付かない、という実害は自動生成名同士でもラベルとの衝突でも同じ）。
 */
export function nameSetups(sources: readonly SetupNameSource[]): readonly NamedSetup[] {
  const named = sources.map((source) => {
    const derivedName = deriveSetupName(source.layoutName, source.shapeName);
    return {
      setupId: source.setupId,
      displayName: source.label ?? derivedName,
      derivedName,
    };
  });

  const countByDisplayName = new Map<string, number>();
  for (const entry of named) {
    countByDisplayName.set(entry.displayName, (countByDisplayName.get(entry.displayName) ?? 0) + 1);
  }

  return named.map((entry) => ({
    ...entry,
    needsLabel: (countByDisplayName.get(entry.displayName) ?? 0) > 1,
  }));
}
