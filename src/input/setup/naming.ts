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

interface TargetNameSourceBase {
  readonly key: string;
  /** 対象の種類。表示名が衝突した時の区別（「配列」「Setup n」）に使う。 */
  readonly kind: 'layout' | 'setup';
  /**
   * ユーザーが付けたラベル（Setupだけが持ちうる）。あれば常にそのまま表示名にする。
   * 前後の空白を除いて空になるものはラベル無し扱い（空白だけの名前は見出しとして読めないため）。
   */
  readonly label?: string;
  /**
   * 手持ちのSetup一覧での番号（1始まり）。衝突した時の区別に使う。idは内部の値
   * （実Setupでは無意味なUUID）なので表示に出さず、代わりにこの番号を出す。
   * 配列対象と、手持ちから消えたSetupは持たない。
   */
  readonly setupNumber?: number;
}

export type TargetNameSource = TargetNameSourceBase & (
  | {
    readonly failed?: false;
    readonly layoutName: string;
    /** 実効の物理形状名。配列対象は常にカスケードの「既定の形状」の名前になる。 */
    readonly shapeName: string;
    /**
     * 既定値と違う条件の短い併記（`hosts/shared/condition-summary.ts`の
     * `summarizeNonDefaultConditions`と同じ形式の1行）。無ければ省略。
     */
    readonly overrideSummary?: string;
  }
  | {
    /**
     * 対象の解決自体が失敗している（Setup削除・このテキストに使えない等）。
     * 失敗メンバーは「集合の中で何が共通か」を決める母集団から除き、表示名には
     * 呼び出し側が分かる範囲で作った説明（`description`）をそのまま使う。
     * 実効の形状・条件が決まっていないので、差分計算に混ぜると不自然な差分が出るため。
     */
    readonly failed: true;
    readonly description: string;
  }
);

type ResolvedSource = Extract<TargetNameSource, { layoutName: string }>;

export interface NamedTarget {
  readonly key: string;
  /** 集合に対して計算した、差分だけを残す表示名。空になることはない。 */
  readonly displayName: string;
  /** 集合によらない、常にすべてを含む名前。hoverと条件の要約に使う。 */
  readonly fullName: string;
}

/** 表示に使うラベル。前後の空白を除いて空ならラベル無し。 */
export function effectiveLabel(label: string | undefined): string | undefined {
  const trimmed = label?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function isResolved(source: TargetNameSource): source is ResolvedSource {
  return source.failed !== true;
}

function fullNameOf(source: TargetNameSource): string {
  if (!isResolved(source)) return source.description;
  const base = `${source.layoutName}/${source.shapeName}`;
  return source.overrideSummary ? `${base} · ${source.overrideSummary}` : base;
}

function allSame(sources: readonly ResolvedSource[], pick: (s: ResolvedSource) => string): boolean {
  return sources.length > 0 && sources.every((s) => pick(s) === pick(sources[0]!));
}

/** 集合内で共通な部分を落とした名前（衝突を考えない段階）。 */
function differenceName(source: TargetNameSource, commonalityBasis: readonly ResolvedSource[]): string {
  if (!isResolved(source)) return source.description;

  if (commonalityBasis.length <= 1) {
    // 比較対象が無い（自分だけ、または全員ラベル付き・失敗）: 単一対象と同じ扱い。
    return source.overrideSummary ? `${source.layoutName} · ${source.overrideSummary}` : source.layoutName;
  }

  const parts: string[] = [];
  if (!allSame(commonalityBasis, (s) => s.layoutName)) parts.push(source.layoutName);
  if (!allSame(commonalityBasis, (s) => s.shapeName)) parts.push(source.shapeName);
  if (!allSame(commonalityBasis, (s) => s.overrideSummary ?? '') && source.overrideSummary) {
    parts.push(source.overrideSummary);
  }
  return parts.length > 0 ? parts.join(' · ') : source.layoutName;
}

/**
 * 衝突した時に添える種類の札。配列対象は「配列」、手持ちにあるSetupは「Setup n」。
 * 手持ちから消えたSetupは番号を持たず、「Setup」と添えても名前（「削除されたSetup」等）以上の
 * 情報にならないので、札を持たない（`undefined`）。
 */
function kindTag(source: TargetNameSource): string | undefined {
  if (source.kind === 'layout') return '配列';
  return source.setupNumber === undefined ? undefined : `Setup ${source.setupNumber}`;
}

/**
 * 衝突した時だけ、衝突したメンバーの名前を段階的に詳しくする（レビュー指摘3「重複したら詳しく」）。
 * - 0: 集合内で共通な部分を落とした名前（ラベルがあればラベル）
 * - 1: 対象の種類を添える（「配列」「Setup n」。配列対象と上書きの無いSetupが並ぶ、同じラベルの
 *   Setupが並ぶ等）。種類の札を持たない対象は、ここで段階2と同じ位置を添える
 * - 2: 集合の中での位置を添える（同じ名前の自作配列が2つある等、種類でも分からない時の最後の砦。
 *   位置は集合の中で一意なので、ここまで来れば必ず解消する）
 *
 * 配列名・形状名・条件のどれかが違えば段階0で既に名前に出ている（違う部分は全員に出す）ので、
 * 段階0で衝突するメンバー同士は配列名・形状名・条件が同じ。そこへ形状名や条件を足しても
 * 区別できないので、足すのは種類と位置だけにする。内部のkey（UUID等）は出さない。
 */
function escalatedName(base: string, source: TargetNameSource, position: number, level: number): string {
  if (level <= 0) return base;
  const tag = kindTag(source);
  if (level === 1 && tag !== undefined) return `${base}（${tag}）`;
  return `${base}（${position + 1}番目）`;
}

const MAX_LEVEL = 2;

/**
 * 対象の集合から、表示名（差分だけ、衝突すれば衝突した組だけ詳しくする）とフルの名前を
 * まとめて求める（純関数）。
 *
 * - ラベルがあればそれを表示名の元にする（ユーザーが選んだ値は差分計算の対象外）
 * - 「集合内で何が共通か」はラベル付き・解決失敗のメンバーを除いた母集団で判定する
 * - 表示名が他と衝突したら、**衝突したメンバーだけ**段階を上げる（集合全体を詳しくすると、
 *   衝突と無関係な対象まで読みにくくなるため）。ラベルと計算した名前が衝突した時は、
 *   ユーザーが付けたラベルはそのまま残し、計算した側だけを詳しくする。ラベル同士が衝突した時は
 *   ラベル側も詳しくする（同じ名前のまま並ぶと見分けられないため）
 * - 表示名が空文字になることはない
 */
export function nameTargets(sources: readonly TargetNameSource[]): readonly NamedTarget[] {
  const labels = sources.map((s) => effectiveLabel(s.label));
  const commonalityBasis = sources.filter(
    (s, i): s is ResolvedSource => labels[i] === undefined && isResolved(s),
  );
  const bases = sources.map((s, i) => labels[i] ?? differenceName(s, commonalityBasis));
  const levels = sources.map(() => 0);

  const namesNow = () => sources.map((s, i) => escalatedName(bases[i]!, s, i, levels[i]!));

  let names = namesNow();
  for (;;) {
    const members = new Map<string, number[]>();
    names.forEach((name, i) => members.set(name, [...(members.get(name) ?? []), i]));
    let raised = false;
    for (const group of members.values()) {
      if (group.length <= 1) continue;
      // 計算した名前の側がいれば、そちらだけを上げる（ラベルは手を付けずに残す）。
      const unlabeled = group.filter((i) => labels[i] === undefined);
      const toRaise = unlabeled.length > 0 ? unlabeled : group;
      for (const i of toRaise) {
        if (levels[i]! < MAX_LEVEL) {
          levels[i] = levels[i]! + 1;
          raised = true;
        }
      }
    }
    if (!raised) break;
    names = namesNow();
  }

  return sources.map((s, i) => ({ key: s.key, displayName: names[i]!, fullName: fullNameOf(s) }));
}
