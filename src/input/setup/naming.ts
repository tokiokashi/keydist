/**
 * 対象（`AnalysisTarget`）の表示名（docs/architecture.md「画面の構成」・#578指摘2、
 * レビュー指摘3での強化）。
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
  /** ユーザーが付けたラベル（Setupだけが持ちうる）。あれば常にそのまま表示名にする。空文字はラベル無し扱い。 */
  readonly label?: string;
  readonly layoutName: string;
  /** 実効の物理形状名。配列対象は常にカスケードの「既定の形状」の名前になる。 */
  readonly shapeName: string;
  /**
   * 既定値と違う条件の短い併記（`hosts/shared/condition-summary.ts`の
   * `summarizeNonDefaultConditions`と同じ形式の1行）。無ければ省略。
   */
  readonly overrideSummary?: string;
  /**
   * 対象の解決自体が失敗している（Setup削除・このテキストに使えない等）。
   * レビュー指摘3: 失敗メンバーは「集合の中で何が共通か」を決める母集団から除く
   * （失敗メンバーのlayoutName/shapeNameはfallback表示のための代用値でしかなく、
   * 他メンバーとの共通性判定に混ぜると不自然な差分が出るため）。失敗メンバー自身の
   * 表示名は通常どおり計算する（値はfallback表示のまま）。
   */
  readonly failed?: boolean;
}

export interface NamedTarget {
  readonly key: string;
  /** 集合に対して計算した、差分だけを残す表示名。空になることはない。 */
  readonly displayName: string;
  /** 集合によらない、常にすべてを含む名前。hoverと条件の要約に使う。 */
  readonly fullName: string;
}

function hasLabel(source: TargetNameSource): source is TargetNameSource & { label: string } {
  return source.label !== undefined && source.label.length > 0;
}

function fullNameOf(source: TargetNameSource): string {
  const base = `${source.layoutName}/${source.shapeName}`;
  return source.overrideSummary ? `${base} · ${source.overrideSummary}` : base;
}

function allSame(sources: readonly TargetNameSource[], pick: (s: TargetNameSource) => string): boolean {
  return sources.length > 0 && sources.every((s) => pick(s) === pick(sources[0]!));
}

/**
 * `level`が上がるほど詳しく出す（衝突を解消するための段階的なエスカレーション。
 * レビュー指摘3「重複したら詳しく」）。
 * - 0: 集合内で共通な部分を落とす（従来どおり）
 * - 1: 共通でも配列名・形状名・条件併記を強制的に出す（形状だけ違う等の細かい差を拾う）
 * - 2: フルの名前（`fullNameOf`と同じ）
 * - 3: フルの名前 + `key`（同じ配列・形状・条件の対象が複数枠に並ぶ、最後の砦。
 *   `key`は対象ごとに必ず一意なので、ここまで来れば必ず解消する）
 */
function computeDisplayName(
  source: TargetNameSource,
  commonalityBasis: readonly TargetNameSource[],
  level: number,
): string {
  if (hasLabel(source)) return source.label;
  if (level >= 3) return `${fullNameOf(source)}（${source.key}）`;
  if (level >= 2) return fullNameOf(source);

  if (commonalityBasis.length <= 1) {
    // 比較対象が無い（自分だけ、または全員ラベル付き・失敗）: 単一対象と同じ扱い。
    return source.overrideSummary ? `${source.layoutName} · ${source.overrideSummary}` : source.layoutName;
  }

  const sameLayout = allSame(commonalityBasis, (s) => s.layoutName);
  const sameShape = allSame(commonalityBasis, (s) => s.shapeName);
  const sameOverride = allSame(commonalityBasis, (s) => s.overrideSummary ?? '');
  const forceAll = level >= 1;

  const parts: string[] = [];
  if (!sameLayout || forceAll) parts.push(source.layoutName);
  if (!sameShape || forceAll) parts.push(source.shapeName);
  if ((!sameOverride || forceAll) && source.overrideSummary) parts.push(source.overrideSummary);

  return parts.length > 0 ? parts.join(' · ') : source.layoutName;
}

/**
 * 対象の集合から、表示名（差分だけ、衝突すれば段階的に詳しくする）とフルの名前を
 * まとめて求める（純関数）。
 *
 * - `label`があれば常にそれをそのまま表示名にする（ユーザーが選んだ値は差分計算の対象外）
 * - 「集合内で何が共通か」はラベル付き・解決失敗のメンバーを除いた母集団で判定する
 *   （レビュー指摘3）
 * - 差分計算の結果、ラベルを持たないメンバー同士で表示名が衝突したら、衝突が解消するまで
 *   `computeDisplayName`のlevelを上げて詳しくする（level 3で`key`込みになり必ず解消する）
 * - 表示名が空文字になることはない
 */
export function nameTargets(sources: readonly TargetNameSource[]): readonly NamedTarget[] {
  const commonalityBasis = sources.filter((s) => !hasLabel(s) && !s.failed);

  let level = 0;
  let displayNameOf = new Map<string, string>();
  for (;;) {
    displayNameOf = new Map(sources.map((s) => [s.key, computeDisplayName(s, commonalityBasis, level)]));
    const counts = new Map<string, number>();
    for (const s of sources) {
      const name = displayNameOf.get(s.key)!;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const collides = sources.some((s) => !hasLabel(s) && counts.get(displayNameOf.get(s.key)!)! > 1);
    if (!collides || level >= 3) break;
    level += 1;
  }

  return sources.map((s) => ({
    key: s.key,
    displayName: displayNameOf.get(s.key)!,
    fullName: fullNameOf(s),
  }));
}
