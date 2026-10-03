import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { OptionsWriteLog, OptionsWriteLogs } from './options-write-log.ts';

const OptionsWriteLogsContext = createContext<OptionsWriteLogs | undefined>(undefined);

/** `app`が、保存先へ書く側と同じ記録を下書き側へ渡す。 */
export function OptionsWriteLogsProvider({ logs, children }: { readonly logs: OptionsWriteLogs; readonly children: ReactNode }) {
  return createElement(OptionsWriteLogsContext.Provider, { value: logs }, children);
}

/**
 * 書き込みの記録を引く。`OptionsWriteLogsProvider`で包まれていなければ例外にする。
 * 記録が無いと、下書きは自分の保存の反響を見分けられず、保存の反響で入力が巻き戻る不具合（#935）へ
 * 静かに戻る。画面は動いてしまうので気づけない。そのため、ページの名前や組み立て場所に関係なく、
 * 包み忘れたページの最初の描画で落とす。
 */
export function useOptionsWriteLog(key: string): OptionsWriteLog {
  const logs = useContext(OptionsWriteLogsContext);
  if (logs === undefined) {
    throw new Error(
      `解析設定の下書き（key: ${key}）がOptionsWriteLogsProviderの外で使われている。` +
      'ページを組み立てる側（app）でOptionsWriteLogsProviderで包み、保存先へ書く側と同じ記録を渡すこと。',
    );
  }
  return logs.forKey(key);
}
