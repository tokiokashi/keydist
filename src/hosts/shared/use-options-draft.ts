import { useCallback, useState } from 'react';
import { useOptionsWriteLog } from './OptionsWriteLogsContext.tsx';
import { applyDraftInput, initialDraftSync, syncDraftWithStored } from './options-draft-sync.ts';

/**
 * 解析設定の下書き（UI用の一時状態）。見た目は即座に変えつつ、資産への書き込みは
 * 呼び出し側がdebounceする。資産側の値（`stored`）が変わった時（初回読み込み・他タブからの
 * 反映・元に戻す等）は下書きをそれに揃え直す。
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
 *
 * 自分が書いた値の反響は揃え直さない。反響は次の入力より後に届くことがあり、その時に揃え直すと
 * 新しい下書きが1つ前の値へ戻る（#935）。書いた値は`app`が書く時に残す記録（`options-write-log.ts`）で
 * 知る。`writeLogKey`は記録の引き先（個別画面は固定の名前、Workspaceはペインのid）。判断は`options-draft-sync.ts`にある。
 */
export function useOptionsDraft<T>(stored: T, writeLogKey: string): readonly [T, (next: T) => void] {
  const log = useOptionsWriteLog(writeLogKey);
  const [state, setState] = useState(() => initialDraftSync(stored, log?.latestSeq() ?? 0));
  const synced = syncDraftWithStored(state, stored, log?.entries() ?? [], log?.latestSeq() ?? 0);
  if (synced !== state) setState(synced);
  const setDraft = useCallback((next: T) => setState((current) => applyDraftInput(current, next)), []);
  return [synced.draft, setDraft] as const;
}
