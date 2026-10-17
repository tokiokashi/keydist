import type { ResolvedInputError } from './resolved-input.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { SetupReferenceError } from '#input/setup/index.ts';
import { LAYOUT_MISSING_REASON, SETUP_MISSING_REASON, SHAPE_MISSING_REASON } from '#input/setup/index.ts';

/**
 * `ResolvedInputError`を日本語の説明文へ変換する（残る例外表示は、Setup・配列・
 * 物理配列が削除された時と、このテキストには使えないSetup、物理配列で実現できない値）。
 *
 * 集合対象のAnalyzer（比較表）の抽出がメンバーごとの解決失敗を値として持ち
 * （`analyzers/contract.ts`の`AnalyzerSetMemberFailure`）、その文言を
 * engine側（`engine/cache.ts`の`getSetExtraction`）で組み立てる必要があるため、
 * `engine`が持てる場所（`ResolvedInputError`を定義する場所そのもの）に置く。
 * `hosts`は`engine`をimportしてよい（依存の規則）ので、`hosts/shared/pane-status.ts`は
 * ここを re-export するだけにする（依存が逆向きにならないよう、`engine`は`hosts`を
 * 一切importしない）。
 */
// 画面にそのまま出る文なので、配列・物理配列・Setupのidは含めない（利用者には意味の無い内部の値）。
// どの対象の失敗かは、行・見出しに並ぶ対象の名前で分かる。
function describeSetupReferenceError(error: SetupReferenceError): string {
  switch (error.kind) {
    case 'layout-missing': return LAYOUT_MISSING_REASON;
    case 'shape-missing': return SHAPE_MISSING_REASON;
  }
}

// JISの物理配列が要る配列なら、選び直す先を具体に示す。
function keysMissingHint(layout: Layout): string {
  return layout.requiresJisShape === true
    ? 'JISの物理配列を選んでください'
    : 'キーが足りる物理配列を選んでください';
}

export function describeResolvedInputError(error: ResolvedInputError): string {
  switch (error.kind) {
    case 'reference':
      return error.errors.map(describeSetupReferenceError).join(' / ');
    case 'incompatible-text':
      return `このテキスト（${error.language === 'ja' ? '日本語' : '英語'}）には「${error.layout.name}」を使えません`;
    case 'geometry':
      // 例外の文（`error.message`）は定義の内部を指す開発者向けの文なので出さない。
      return '物理配列と指の割当が噛み合わず、キーボードを組み立てられません';
    case 'keys-missing':
      return `「${error.layout.name}」が使うキーが物理配列に足りません。${keysMissingHint(error.layout)}`;
    case 'target-missing':
      return error.target.kind === 'setup' ? SETUP_MISSING_REASON : LAYOUT_MISSING_REASON;
  }
}
