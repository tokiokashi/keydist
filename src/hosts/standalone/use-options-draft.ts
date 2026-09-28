import { useState } from 'react';

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
 * `stored`は呼び出し側で保存値からmemoした値を渡す。比較は参照で行うので、保存値が
 * 変わらない限り同じ参照である必要がある（毎回作り直すと下書きが毎回戻される）。
 */
export function useOptionsDraft<T>(stored: T): readonly [T, (next: T) => void] {
  const [draft, setDraft] = useState(stored);
  const [source, setSource] = useState(stored);
  if (source !== stored) {
    setSource(stored);
    setDraft(stored);
  }
  return [draft, setDraft] as const;
}
