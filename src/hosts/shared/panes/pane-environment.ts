import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { EngineComputer } from '#engine/computer.ts';
import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
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
  /** カスケードの上書き（グローバル・物理配列・配列・Setupの各レベル）。 */
  readonly overrides: SettingsCascadeOverrides;
  readonly catalog: PaneCatalog;
  readonly resolvedText: ResolvedText;
  /** 抽出・Traceのキャッシュ。器の中のペイン全部で同じものを渡し、計算を共有する。 */
  readonly cache: EngineComputer;
  /** 資産への書き込み（条件のモーダルが全体のレベルの条件を書き換える）。 */
  readonly dispatch: (command: Command<KeydistAssets>) => void;
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
 * ペインの枠まわりの、器ごとの違い。個別画面はペインのAnalyzer名がページのh1で見出しを
 * 文脈バーの下に固定し、Workspaceのペインはh2で固定せず、⋯を持つ。
 */
export interface PaneChrome {
  readonly headingLevel?: 1 | 2;
  readonly stickyHeader?: boolean;
  readonly menuItems?: readonly PaneMenuItem[];
  /**
   * 対象が連動の組に従っているか固定かの表示と切り替え（Workspaceのペイン）。個別画面は対象を
   * ペインの外に持たないので置かない。
   */
  readonly targetBinding?: PaneTargetBindingControl;
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
