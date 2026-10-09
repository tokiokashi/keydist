import type { ReactNode } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { EngineComputer } from '#engine/computer.ts';
import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { PresetIdGenerator, PresetLibrary } from '#input/presets/index.ts';
import type { SettingsValueMap } from '#engine/settings-items.ts';
import type { Setup } from '#input/setup/index.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import type { PaneMenuItem } from '../PaneHeaderParts.tsx';
import type { PaneCatalog } from '../resolve-pane-input.ts';

/**
 * ペインが対象を解決して描くのに要る、器の値（個別画面でもWorkspaceでも同じ形）。
 * ペインは資産（`KeydistAssets`）そのものを知らず、器がここへ切り出して渡す。
 * `resolvedText`だけは器ごとに出どころが違う（個別画面は全体で1つの選択、Workspaceは自分の選択。
 * docs/architecture.md「画面の構成」）ので、器が解決してから渡す。
 */
export interface PaneEnvironment {
  readonly setups: readonly Setup[];
  /**
   * カスケードの上書き（グローバル・Workspace・物理配列・配列・Setupの各レベル）。Workspaceのレベルは
   * Workspaceの画面だけが差し込む（`withWorkspaceConditions`）。個別画面は持たない。
   */
  readonly overrides: SettingsCascadeOverrides;
  /**
   * Workspaceの画面なら、そのWorkspaceのid。条件のモーダルがWorkspaceのレベルを編集の先にし、その書き込みの
   * 書き先を指すのに使う。個別画面は持たない（条件のモーダルは全体のレベルで開く）。
   */
  readonly workspaceId?: string;
  readonly catalog: PaneCatalog;
  readonly resolvedText: ResolvedText;
  /** 抽出・Traceのキャッシュ。器の中のペイン全部で同じものを渡し、計算を共有する。 */
  readonly cache: EngineComputer;
  /** 資産への書き込み（条件のモーダルが全体のレベルの条件を書き換える）。 */
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  /** 保存したプリセット（条件のモーダルの上部が一覧にする）。 */
  readonly presetLibrary: PresetLibrary<SettingsValueMap>;
  readonly generatePresetId: PresetIdGenerator;
  /** 器の元に戻す（文脈バーと同じ。待っている書き込みを先に反映してから戻す）。モーダルの中の「元に戻す」が呼ぶ。 */
  readonly undo: () => void;
  /** 資産の初回読み込みが済んでいるか。済む前は、対象が空に見えても空とは限らない。 */
  readonly assetsReady: boolean;
}

export interface PaneTargetBindingControl {
  /** `true`なら連動の組に従っている。`false`ならこのペインだけの対象に固定している。 */
  readonly follows: boolean;
  /** 従っている組の番号（1から）。固定の間は無い。 */
  readonly groupNumber?: number;
  /** 映している対象の要約（読み上げ名に使う）。 */
  readonly summary?: string;
  /** 選べるもの（固定・各組・新しい組）。 */
  readonly items: readonly PaneMenuItem[];
}

/**
 * 解析設定の持ち方（共有に従う / このペインだけ）の表示と切り替え（Workspaceのペイン）。
 * 解析設定の小窓の中に置く（対象の「固定」と同じ考え方）。
 */
export interface PaneOptionsBindingControl {
  /** `true`なら同じAnalyzerの共有の設定に従っている。`false`ならこのペインだけの設定を持つ。 */
  readonly shared: boolean;
  readonly onChange: (shared: boolean) => void;
}

/**
 * ペインの枠まわりの、器ごとの違い。個別画面はペインのAnalyzer名がページのh1で見出しを
 * 文脈バーの下に固定し、Workspaceのペインはh2で固定せず、⋯を持つ。
 */
export interface PaneChrome {
  /**
   * ペインを見分ける印。図のキーを選んで開く小窓の持ち主になる（Workspaceはペインのid）。
   * 省略すると、ペイン自身が自分の印を作る。
   */
  readonly paneKey?: string;
  readonly headingLevel?: 1 | 2;
  readonly stickyHeader?: boolean;
  readonly menuItems?: readonly PaneMenuItem[];
  /** 見出しの右端に置く操作（個別画面の「Workspaceに追加」）。Workspaceのペインは置かない。 */
  readonly headerAction?: ReactNode;
  /**
   * 対象が連動の組に従っているか固定かの表示と切り替え（Workspaceのペイン）。個別画面は対象を
   * ペインの外に持たないので置かない。
   */
  readonly targetBinding?: PaneTargetBindingControl;
  /** 解析設定が共有に従っているか、このペインだけかの表示と切り替え（Workspaceのペイン）。個別画面は置かない。 */
  readonly optionsBinding?: PaneOptionsBindingControl;
  /** 解析設定の小窓にペイン名を出す（Workspaceでは、どのペインの設定か分かるように）。 */
  readonly showPaneNameInSettings?: boolean;
  /**
   * 対象が空のペインを開いた直後に、対象の選択を自動で開く（個別画面）。Workspaceは複数の
   * ペインが同時に開こうとするので使わない。
   */
  readonly autoOpenTargetSelection?: boolean;
  /**
   * 自動で開く判断を「開かない」で確定させる（共有リンクで対象が届く間。取り込みの結果、対象が空のままでも開かない）。
   * 判断は最初の1回で固定されるので、判断を先送りせずfalseを渡すためのもの。
   */
  readonly holdTargetSelectionClosed?: boolean;
}
