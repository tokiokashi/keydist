import type { ResolvedInputError } from './resolved-input.ts';
import type { SetupReferenceError } from '#input/setup/index.ts';

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
    case 'layout-missing': return '配列が見つからない（削除された可能性がある）';
    case 'shape-missing': return '物理配列が見つからない（削除された可能性がある）';
  }
}

export function describeResolvedInputError(error: ResolvedInputError): string {
  switch (error.kind) {
    case 'reference':
      return error.errors.map(describeSetupReferenceError).join(' / ');
    case 'incompatible-text':
      return `このテキスト（${error.language === 'ja' ? '日本語' : '英語'}）には「${error.layout.name}」を使えない`;
    case 'geometry':
      // 例外の文（`error.message`）は定義の内部を指す開発者向けの文なので出さない。
      return '物理配列と指の割当が噛み合わず、キーボードを組み立てられない';
    case 'target-missing':
      return error.target.kind === 'setup' ? 'Setupが削除された' : '配列が見つからない（削除された可能性がある）';
  }
}
