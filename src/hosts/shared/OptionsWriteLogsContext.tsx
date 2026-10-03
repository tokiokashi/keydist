import { createContext, useContext, type ReactNode } from 'react';
import type { OptionsWriteLog, OptionsWriteLogs } from './options-write-log.ts';

const OptionsWriteLogsContext = createContext<OptionsWriteLogs | undefined>(undefined);

/** `app`が、保存先へ書く側と同じ記録を下書き側へ渡す。 */
export function OptionsWriteLogsProvider({ logs, children }: { readonly logs: OptionsWriteLogs; readonly children: ReactNode }) {
  return <OptionsWriteLogsContext.Provider value={logs}>{children}</OptionsWriteLogsContext.Provider>;
}

/** 渡されていなければ（記録が無い画面）undefined。その時の下書きは、保存先の変化をすべて外からの変更として揃える。 */
export function useOptionsWriteLog(key: string): OptionsWriteLog | undefined {
  return useContext(OptionsWriteLogsContext)?.forKey(key);
}
