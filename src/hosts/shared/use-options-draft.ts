import { useState } from 'react';
import { stableStringify } from '#engine/cache-key.ts';

/**
 * 解析設定の下書き（UI用の一時状態）。見た目は即座に変えつつ、資産への書き込みは
 * 呼び出し側がdebounceする。資産側の値（`stored`）が変わった時（初回読み込み・他タブからの
 * 反映・自分のcommitの反響）は下書きをそれに揃え直す。
 *
 * 揃え直しはeffectでなく描画中に行う。effectだと「資産は読み込み済みで操作可能だが、
 * 下書きはまだ読み込み前の既定値」の画面が1フレーム確定し、その間の操作が
 * 「既定値 + 変えた1項目」として書き込まれ、保存済みの設定を消していた（#603）。
 * 描画中の更新は確定前に描き直される。
 *
 * 比較は参照でなく中身（`stableStringify`。`withStandaloneAnalyzerOptions`が書き込みの
 * 同値判定に使うものと同じ正規化）で行う。解析設定は3つのAnalyzerの分が1つのstorageキーに
 * 入っているので、他タブが別のAnalyzerの設定を書くと記録全体が読み直され、自分のAnalyzerの
 * 設定も中身は同じまま新しい参照になる。参照で比べると、debounce待ちの下書きが保存値へ戻され、
 * 戻っている間の別の変更が先の変更を上書きして失われる（#606）。
 */
export function useOptionsDraft<T>(stored: T): readonly [T, (next: T) => void] {
  const [draft, setDraft] = useState(stored);
  const [source, setSource] = useState(stored);
  if (source !== stored) {
    setSource(stored);
    // 中身が同じなら下書きは触らない（参照だけが変わった読み直し）
    if (stableStringify(source) !== stableStringify(stored)) setDraft(stored);
  }
  return [draft, setDraft] as const;
}
