import type { InputConverterPreferencesV2 } from '#tester/input-converter-preferences.ts';
import type { ThemeChoice } from '../theme/theme.ts';
import type { WorkspaceStateV1 } from '#tester/panels/workspace-state.ts';

export const APP_STATE_VERSION = 2;

export interface AppearancePreferencesV1 {
  theme: ThemeChoice;
}

/** シェルの見た目の状態（このブラウザに覚える。サイドバーの固定と、畳んだ見出しのまとまり）。 */
export interface ShellPreferencesV1 {
  sidebarPinned: boolean;
  /** 畳んだ見出しのまとまりの識別子。無い時は全部開いている。 */
  sidebarCollapsed?: readonly string[];
}

export interface AppStateV2 {
  version: typeof APP_STATE_VERSION;
  workspace?: WorkspaceStateV1;
  inputConverter?: InputConverterPreferencesV2;
  appearance?: AppearancePreferencesV1;
  shell?: ShellPreferencesV1;
}

export type AppStateSliceKey = Exclude<keyof AppStateV2, 'version'>;
