/**
 * 対象（`AnalysisTarget`）の表示名（docs/architecture.md「画面の構成」・#578指摘2）。
 *
 * **表示名は常に、同じ画面に並ぶ集合に対して計算する。** 集合の中で共通な部分は落とし、
 * 違う部分だけを出す（例: 集合 `{QWERTY/row-staggered, Colemak-DH/row-staggered,
 * QWERTY/row-staggered・指割当JIS}` の表示は `QWERTY` / `Colemak-DH` / `QWERTY · 指割当JIS`）。
 * フルの名前はhoverと条件の要約に出す。
 *
 * 旧`nameSetups`（Setupの自動生成名が衝突した時だけラベル入力を促す版）を置き換える
 * （#578コメント2026-09-28「『衝突時だけ足す』を『差分だけ残す』に広げる」）。ユーザーが
 * 付けたラベル（`Setup.label`）は既にユーザー自身が区別のために選んだ文字列なので、
 * 差分計算を経由せず常にそのまま表示名として使う。
 *
 * このファイルは`Layout`/`PhysicalShape`/`AnalysisTarget`を直接importしない（旧実装と
 * 同じ理由。呼び出し側が文字列へ解決してから渡す）。
 */

export interface TargetNameSource {
  readonly key: string;
  /** ユーザーが付けたラベル（Setupだけが持ちうる）。あれば常にそのまま表示名にする。 */
  readonly label?: string;
  readonly layoutName: string;
  /** 実効の物理形状名。配列対象は常にカスケードの「既定の形状」の名前になる。 */
  readonly shapeName: string;
  /**
   * 既定値と違う条件の短い併記（`hosts/shared/condition-summary.ts`の
   * `summarizeNonDefaultConditions`と同じ形式の1行）。無ければ省略。
   */
  readonly overrideSummary?: string;
}

export interface NamedTarget {
  readonly key: string;
  /** 集合に対して計算した、差分だけを残す表示名。 */
  readonly displayName: string;
  /** 集合によらない、常にすべてを含む名前。hoverと条件の要約に使う。 */
  readonly fullName: string;
}

function fullNameOf(source: TargetNameSource): string {
  const base = `${source.layoutName}/${source.shapeName}`;
  return source.overrideSummary ? `${base} · ${source.overrideSummary}` : base;
}

/**
 * 対象の集合から、表示名（差分だけ）とフルの名前をまとめて求める（純関数）。
 *
 * - `label`があれば常にそれをそのまま表示名にする（ユーザーが選んだ値は差分計算の対象外）
 * - 集合が1件だけなら、常に配列名（+ 既定値と違う条件があればそれも）を出す
 *   （#578コメントの決定「単一対象は配列名（+ Setupで上書きがあれば差分だけ併記）」）
 * - 2件以上なら、配列名・形状名・条件併記のそれぞれについて「集合全員が同じ値か」を見て、
 *   全員同じなら落とし、1人でも違えば残す。結果が空（＝完全に同じ対象が並んでいる）なら
 *   空文字ではなく配列名だけを出す（表示名が空にならないようにするフォールバック）
 */
export function nameTargets(sources: readonly TargetNameSource[]): readonly NamedTarget[] {
  const allSame = (pick: (s: TargetNameSource) => string): boolean =>
    sources.length > 0 && sources.every((s) => pick(s) === pick(sources[0]!));

  const sameLayout = allSame((s) => s.layoutName);
  const sameShape = allSame((s) => s.shapeName);
  const sameOverride = allSame((s) => s.overrideSummary ?? '');

  return sources.map((source) => {
    const fullName = fullNameOf(source);

    if (source.label !== undefined) {
      return { key: source.key, displayName: source.label, fullName };
    }

    if (sources.length <= 1) {
      const displayName = source.overrideSummary
        ? `${source.layoutName} · ${source.overrideSummary}`
        : source.layoutName;
      return { key: source.key, displayName, fullName };
    }

    const parts: string[] = [];
    if (!sameLayout) parts.push(source.layoutName);
    if (!sameShape) parts.push(source.shapeName);
    if (!sameOverride && source.overrideSummary) parts.push(source.overrideSummary);

    const displayName = parts.length > 0 ? parts.join(' · ') : source.layoutName;
    return { key: source.key, displayName, fullName };
  });
}
