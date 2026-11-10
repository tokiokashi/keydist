import type { AssetCodec, CodecDiagnostic } from '#input/codec/index.ts';
import { decodePresets, encodePresets, type Preset } from '#input/presets/index.ts';
import { EMPTY_PERSONAL_SPEED, PERSONAL_SPEED_CODEC, type PersonalSpeed } from '#interpretation/timing/calibration-codec.ts';
import { SETTINGS_ITEM_SCHEMAS } from './settings-codec.ts';
import type { SettingsValueMap } from './settings-items.ts';
import { STANDALONE_ANALYZER_OPTIONS_CODEC } from './standalone-analyzer-options-codec.ts';
import { initialStandaloneAnalyzerOptions, type StandaloneAnalyzerOptionsState } from './standalone-analyzer-options.ts';
import {
  decodeConditionLevels,
  EMPTY_CONDITION_LEVELS,
  encodeConditionLevels,
  isEmptyConditionLevels,
  type ConditionLevels,
} from './user-assets-conditions.ts';
import { decodeWorkspaces, encodeWorkspaces } from './workspace-codec.ts';
import type { WorkspaceLibrary } from './workspace.ts';

/**
 * 「データ・設定の管理」の書き出しファイルのうち、配列・ローマ字規則・指の割り当て・Setup・テキスト以外の項目。
 * プリセットとWorkspaceは、それぞれのファイルと同じ形（`encodePresets`・`encodeWorkspaces`）で持つ。
 * 個人速度と解析設定は、保存先のcodecが書く封筒（版つき）をそのまま入れ、読む時も同じcodecを通す。
 * 無い項目は空として読める（項目を足しただけなので、ファイルの版は上げない）。
 */
export interface UserAssetsExtras {
  readonly presets: readonly Preset<SettingsValueMap>[];
  readonly workspaces: WorkspaceLibrary;
  readonly personalSpeed: PersonalSpeed;
  /** Analyzerごとの最後に使った解析設定。 */
  readonly analyzerOptions: StandaloneAnalyzerOptionsState;
  /** SetupとWorkspace以外のレベル（全体・物理配列・入力方式・配列）の条件。 */
  readonly conditions: ConditionLevels;
}

export const EMPTY_USER_ASSETS_EXTRAS: UserAssetsExtras = {
  presets: [],
  workspaces: [],
  personalSpeed: EMPTY_PERSONAL_SPEED,
  analyzerOptions: initialStandaloneAnalyzerOptions(),
  conditions: EMPTY_CONDITION_LEVELS,
};

export function isEmptyUserAssetsExtras(extras: UserAssetsExtras): boolean {
  return (
    extras.presets.length === 0 &&
    extras.workspaces.length === 0 &&
    extras.personalSpeed.calibration === undefined &&
    Object.keys(extras.analyzerOptions).length === 0 &&
    isEmptyConditionLevels(extras.conditions)
  );
}

/** 版つきの封筒を保存先のcodecで読む。読めなければ診断を積んで`fallback`を返す。 */
function decodeEnvelope<T>(codec: AssetCodec<T>, raw: unknown, path: string, fallback: T, diagnostics: CodecDiagnostic[]): T {
  if (raw === undefined) return fallback;
  const result = codec.decode(raw);
  if (!result.ok) {
    diagnostics.push({ path, message: '読めない形のため捨てました' });
    return fallback;
  }
  for (const diagnostic of result.diagnostics) {
    diagnostics.push({ path: diagnostic.path === '' ? path : `${path}.${diagnostic.path}`, message: diagnostic.message });
  }
  return result.value;
}

export function decodeUserAssetsExtras(payload: Record<string, unknown>, diagnostics: CodecDiagnostic[]): UserAssetsExtras {
  return {
    presets: decodePresets(SETTINGS_ITEM_SCHEMAS, payload.presets, 'presets', diagnostics),
    workspaces: decodeWorkspaces(payload.workspaces, 'workspaces', diagnostics),
    personalSpeed: decodeEnvelope(PERSONAL_SPEED_CODEC, payload.personalSpeed, 'personalSpeed', EMPTY_PERSONAL_SPEED, diagnostics),
    analyzerOptions: decodeEnvelope(
      STANDALONE_ANALYZER_OPTIONS_CODEC,
      payload.analyzerOptions,
      'analyzerOptions',
      initialStandaloneAnalyzerOptions(),
      diagnostics,
    ),
    conditions: decodeConditionLevels(payload.conditions, 'conditions', diagnostics),
  };
}

/** 空の項目は出さない。 */
export function encodeUserAssetsExtras(extras: UserAssetsExtras): Record<string, unknown> {
  return {
    ...(extras.presets.length === 0 ? {} : { presets: encodePresets(extras.presets) }),
    ...(extras.workspaces.length === 0 ? {} : { workspaces: encodeWorkspaces(extras.workspaces) }),
    ...(extras.personalSpeed.calibration === undefined ? {} : { personalSpeed: PERSONAL_SPEED_CODEC.encode(extras.personalSpeed) }),
    ...(Object.keys(extras.analyzerOptions).length === 0 ? {} : { analyzerOptions: STANDALONE_ANALYZER_OPTIONS_CODEC.encode(extras.analyzerOptions) }),
    ...(isEmptyConditionLevels(extras.conditions) ? {} : { conditions: encodeConditionLevels(extras.conditions) }),
  };
}
