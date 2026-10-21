/**
 * 対象（`AnalysisTarget`）の表示名（docs/architecture.md「画面の構成」）。
 *
 * **表示名は常に、同じ画面に並ぶ集合に対して計算する。** 集合の中で共通な部分は落とし、
 * 違う部分だけを出す。配列名は、集合の中で全員同じでなければ全員に出す。物理配列名と条件の併記は、
 * 区別に要る時だけ足す。配列名で作った名前が他と重なった組の中で物理配列名が全員同じでなければ、
 * その組の全員に物理配列名を足す。それでも名前が重なった組の中で条件の併記が全員同じでなければ、
 * その組の全員に条件の併記を足す。名前が重ならない対象には、物理配列や条件が違っても足さない
 * （違いは条件の要約とhoverのフルの名前で読める）。
 * 例: 集合 `{QWERTY/row-staggered, Colemak-DH/row-staggered, QWERTY/row-staggered・指割当JIS}` の表示は
 * `QWERTY` / `Colemak-DH` / `QWERTY · 指割当JIS`。
 * フルの名前はhoverに出す。
 *
 * ユーザーが付けたラベル（`Setup.label`）は既にユーザー自身が区別のために選んだ文字列なので、
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

export type TargetNameSource = TargetNameSourceBase &
  (
    | {
        readonly failed?: false;
        readonly layoutName: string;
        /** 実効の物理配列名。配列対象は常にカスケードの「既定の物理配列」の名前になる。 */
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
         * 実効の物理配列・条件が決まっていないので、差分計算に混ぜると不自然な差分が出るため。
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
  /** 集合によらない、常にすべてを含む名前。hoverに使う。 */
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

/**
 * 段階1: 集合内で共通な部分を落とした名前（配列名だけ）。配列名が母集団の全員で同じなら落とし、
 * 落とした結果が空なら配列名へ戻す。物理配列名と条件の併記は、名前が重なった組にだけ後の段階で足す。
 * 比較対象が無い（自分だけ、または全員ラベル付き・失敗）時は、単一対象と同じ扱いで
 * 配列名に条件の併記を足す。
 */
function differenceName(source: TargetNameSource, commonalityBasis: readonly ResolvedSource[]): string {
  if (!isResolved(source)) return source.description;

  if (commonalityBasis.length <= 1) {
    return source.overrideSummary ? `${source.layoutName} · ${source.overrideSummary}` : source.layoutName;
  }
  return source.layoutName;
}

/** 名前が同じ、ラベル無し・解決成功の対象の組（2件以上のものだけ）。 */
function collisionGroups(sources: readonly TargetNameSource[], labels: readonly (string | undefined)[], bases: readonly string[]): number[][] {
  const groups = new Map<string, number[]>();
  for (const [i, s] of sources.entries()) {
    if (labels[i] !== undefined || !isResolved(s)) continue;
    groups.set(bases[i]!, [...(groups.get(bases[i]!) ?? []), i]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * 段階2: 段階1の名前が重なった組の中で、物理配列名が全員同じでなければ、組の全員に物理配列名を足す。
 * 配列名が母集団の全員で同じ集合では、段階1で配列名を落としているので物理配列名だけの名前になる。
 * 比べる相手は組の中のラベル無し・解決成功の対象だけで、ラベルと解決失敗の説明には足さない。
 */
function addShapesOnCollision(
  sources: readonly TargetNameSource[],
  labels: readonly (string | undefined)[],
  bases: string[],
  commonalityBasis: readonly ResolvedSource[],
): void {
  if (commonalityBasis.length <= 1) return;
  const layoutShown = !allSame(commonalityBasis, (s) => s.layoutName);
  for (const group of collisionGroups(sources, labels, bases)) {
    const members = group.map((i) => sources[i] as ResolvedSource);
    if (allSame(members, (s) => s.shapeName)) continue;
    for (const [k, i] of group.entries()) {
      bases[i] = layoutShown ? `${bases[i]} · ${members[k]!.shapeName}` : members[k]!.shapeName;
    }
  }
}

/**
 * 段階3: 段階2の後でも名前が重なった組の中で、条件の併記が全員同じでなければ、組の全員に条件の併記を足す。
 * 併記を持たない対象には何も足さない。比べる相手は段階2と同じ。
 */
function addConditionsOnCollision(
  sources: readonly TargetNameSource[],
  labels: readonly (string | undefined)[],
  bases: string[],
  commonalityBasis: readonly ResolvedSource[],
): void {
  if (commonalityBasis.length <= 1) return;
  for (const group of collisionGroups(sources, labels, bases)) {
    const members = group.map((i) => sources[i] as ResolvedSource);
    if (allSame(members, (s) => s.overrideSummary ?? '')) continue;
    for (const [k, i] of group.entries()) {
      const summary = members[k]!.overrideSummary;
      if (summary) bases[i] = `${bases[i]} · ${summary}`;
    }
  }
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
 * 衝突した時だけ、衝突したメンバーの名前を段階的に詳しくする。
 * - 0: 集合内で共通な部分を落とした名前（ラベルがあればラベル）
 * - 1: 対象の種類を添える（「配列」「Setup n」。配列対象と上書きの無いSetupが並ぶ、同じラベルの
 *   Setupが並ぶ等）。種類の札を持たない対象は、ここで段階2と同じ位置を添える
 * - 2: 集合の中での位置を添える（同じ名前の自作配列が2つある等、種類でも分からない時の最後の砦。
 *   位置は集合の中で一意なので、ここまで来れば必ず解消する）
 *
 * 配列名の違いは段階0で既に名前に出ており、物理配列名と条件の違いも、重なった組の中では
 * 名前に足してある。段階0で衝突するメンバー同士は、配列名・物理配列名・条件が同じなので、
 * そこへ足しても区別できない。足すのは種類と位置だけにする。内部のkey（UUID等）は出さない。
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
  const commonalityBasis = sources.filter((s, i): s is ResolvedSource => labels[i] === undefined && isResolved(s));
  // 集合が1件なら共通部分は全部なので、名前だけにする（条件の差分は直下の条件の要約で見る）。
  // 2件以上で他がラベル付き・失敗のため基準が1件以下になる場合は、区別のために従来どおり差を含める。
  const bases = sources.map((s, i) => labels[i] ?? (sources.length === 1 && isResolved(s) ? s.layoutName : differenceName(s, commonalityBasis)));
  addShapesOnCollision(sources, labels, bases, commonalityBasis);
  addConditionsOnCollision(sources, labels, bases, commonalityBasis);
  const levels = sources.map(() => 0);

  const namesNow = () => sources.map((s, i) => escalatedName(bases[i]!, s, i, levels[i]!));

  let names = namesNow();
  for (;;) {
    const members = new Map<string, number[]>();
    for (const [i, name] of names.entries()) members.set(name, [...(members.get(name) ?? []), i]);
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
