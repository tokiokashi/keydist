import type { ResolvedInputError } from './resolved-input.ts';
import type { SetupReferenceError } from '#input/setup/index.ts';

/**
 * `ResolvedInputError`を日本語の説明文へ変換する（#544 §6「残る例外表示はSetup・配列・
 * 形状が削除された時だけ」・§4「このテキストには使えないSetup」・§3「形状で実現できない値」）。
 *
 * 元は`hosts/shared/pane-status.ts`にあった（単一対象のペインだけが使っていた）。
 * Phase 3で集合対象のAnalyzer（比較表）の抽出がメンバーごとの解決失敗を値として持つ
 * ようになり（`analyzers/contract.ts`の`AnalyzerSetMemberFailure`）、その文言を
 * engine側（`engine/cache.ts`の`getSetExtraction`）で組み立てる必要が生じたため、
 * `engine`が持てる場所（`ResolvedInputError`を定義する場所そのもの）へ移した。
 * `hosts`は`engine`をimportしてよい（依存の規則）ので、`hosts/shared/pane-status.ts`は
 * ここを re-export するだけにする（依存が逆向きにならないよう、`engine`は`hosts`を
 * 一切importしない）。
 */
function describeSetupReferenceError(error: SetupReferenceError): string {
  switch (error.kind) {
    case 'layout-missing': return `配列「${error.layoutId}」が見つからない（削除された可能性）`;
    case 'shape-missing': return `物理形状「${error.shapeId}」が見つからない（削除された可能性）`;
  }
}

export function describeResolvedInputError(error: ResolvedInputError): string {
  switch (error.kind) {
    case 'reference':
      return error.errors.map(describeSetupReferenceError).join(' / ');
    case 'incompatible-text':
      return `このテキスト（${error.language === 'ja' ? '日本語' : '英語'}）には「${error.layout.name}」を使えない`;
    case 'geometry':
      return `形状を組み立てられない: ${error.message}`;
    case 'target-missing':
      return error.target.kind === 'setup' ? 'Setupが削除された' : `配列「${error.target.layoutId}」が見つからない（削除された可能性）`;
  }
}
