import { Link, useNavigate } from '@tanstack/react-router';
import { useSyncExternalStore, type ReactNode } from 'react';
import { BIGRAM_FLOW_PANE_META } from '#analyzers/bigram-flow/pane-meta.ts';
import { FINGER_DISTANCE_PANE_META } from '#analyzers/finger-distance/pane-meta.ts';
import { HEATMAP_PANE_META } from '#analyzers/heatmap/pane-meta.ts';
import { LAYER_COMBO_PANE_META } from '#analyzers/layer-combo/pane-meta.ts';
import { COMPARISON_PANE_META } from '#analyzers/comparison/pane-meta.ts';
import { FINGER_MATRIX_PANE_META } from '#analyzers/finger-matrix/pane-meta.ts';
import { N_SENSITIVITY_PANE_META } from '#analyzers/n-sensitivity/pane-meta.ts';
import {
  getAppearanceSnapshot,
  getServerAppearanceSnapshot,
  setAppearanceTheme,
  subscribeAppearance,
} from '../theme/appearance.ts';
import type { ThemeChoice } from '../theme/theme.ts';
import { ABOUT_LABEL } from '../about/AboutPage.tsx';
import { USER_ASSETS_LABEL } from '../assets/UserAssetsPage.tsx';
import { REPOSITORY_URL, SPEC_LINKS } from '../about/links.ts';
import { createWorkspaceInStorage } from '../workspace/create-workspace.ts';
import { generateWorkspaceId } from '../workspace/id-generator.ts';
import { useWorkspaceLinks } from './use-workspace-links.ts';

/** 旧バージョン（`/analyzer`）へのリンクの文言。トップの下端のリンクも同じ文を出す。 */
export const LEGACY_ANALYZER_LABEL = '旧バージョン';

/** Workspace区分の案内文（保存したWorkspaceが1つも無い時）。トップの見本も同じ文を出す。 */
export const WORKSPACE_EMPTY_TEXT = 'Analyzerを並べて見る画面。';

/**
 * サイドバーの中身（docs/architecture.md「サイドバー」）。ナビゲーションだけを持ち、
 * 最下端にだけ例外として版表示・旧バージョンへのリンク・テーマ切替を置く。
 *
 * 区分見出しは英語（Analyze / Workspace / Assets）。Analyzeの中は対象の数で
 * Single / Multiに分ける。Testerは区分に入れず単独で置く。
 * Workspaceは保存したWorkspaceの一覧と「＋ 新しいWorkspace」で、1つも無い時は案内文を出す。
 * Aboutは計算方法のページと、仕様書・リポジトリ（GitHub）へのリンク。どの画面からも同じ場所でたどれる。
 * Assetsは手持ちの資産を扱う画面へのリンクを並べる区分。最初の項目は自作の配列・ローマ字規則の一覧と削除。
 */
export interface SidebarProps {
  readonly pinned: boolean;
  readonly onPinnedChange: (pinned: boolean) => void;
  /** リンクを押した時（重ねて出している・引き出しの時は閉じる）。 */
  readonly onNavigate: () => void;
}

const THEME_OPTIONS: readonly { readonly value: ThemeChoice; readonly label: string; readonly icon: ReactNode }[] = [
  {
    value: 'system',
    label: '自動',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="8.5" rx="1" />
        <path d="M5.5 14h5M8 11.5V14" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: '明',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: '暗',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />
      </svg>
    ),
  },
];

const THEME_TITLES: Readonly<Record<ThemeChoice, string>> = {
  system: '端末の設定に合わせる',
  light: '明るい表示',
  dark: '暗い表示',
};

function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeAppearance, getAppearanceSnapshot, getServerAppearanceSnapshot);
  return (
    <div className="sidebar-theme" role="group" aria-label="テーマ">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          title={THEME_TITLES[option.value]}
          aria-pressed={theme === option.value}
          data-theme-set={option.value}
          onClick={() => setAppearanceTheme(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

function NavLink({ to, children, onNavigate }: { readonly to: string; readonly children: ReactNode; readonly onNavigate: () => void }) {
  return (
    <Link className="sidebar-link" to={to} activeProps={{ 'aria-current': 'page' }} onClick={onNavigate}>
      {children}
    </Link>
  );
}

export function Sidebar({ pinned, onPinnedChange, onNavigate }: SidebarProps) {
  const { ready: workspacesReady, links: workspaceLinks } = useWorkspaceLinks();
  const navigate = useNavigate();

  const createWorkspace = () => {
    const id = generateWorkspaceId();
    if (!createWorkspaceInStorage(id)) return;
    onNavigate();
    void navigate({ to: '/workspace/$id', params: { id } });
  };

  return (
    <>
      <div className="sidebar-top">
        <Link className="sidebar-brand" to="/" onClick={onNavigate}>keydist</Link>
        <button
          type="button"
          className="sidebar-icon-button sidebar-pin"
          aria-label="サイドバーを固定"
          title={pinned ? '固定を外す' : '固定する'}
          aria-pressed={pinned}
          onClick={() => onPinnedChange(!pinned)}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            <path d="M6 2.5h4l-.5 4 2.5 2.5H4l2.5-2.5z" />
            <path d="M8 9v4.5" />
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="主要ナビゲーション">
        <section className="sidebar-group" aria-labelledby="sidebar-analyze">
          <h2 className="sidebar-heading" id="sidebar-analyze">Analyze</h2>
          <h3 className="sidebar-subheading">Single</h3>
          <NavLink to="/standalone/bigram-flow" onNavigate={onNavigate}>{BIGRAM_FLOW_PANE_META.name}</NavLink>
          <NavLink to="/standalone/finger-distance" onNavigate={onNavigate}>{FINGER_DISTANCE_PANE_META.name}</NavLink>
          <NavLink to="/standalone/heatmap" onNavigate={onNavigate}>{HEATMAP_PANE_META.name}</NavLink>
          <NavLink to="/standalone/layer-combo" onNavigate={onNavigate}>{LAYER_COMBO_PANE_META.name}</NavLink>
          <h3 className="sidebar-subheading">Multi</h3>
          <NavLink to="/standalone/comparison" onNavigate={onNavigate}>{COMPARISON_PANE_META.name}</NavLink>
          <NavLink to="/standalone/finger-matrix" onNavigate={onNavigate}>{FINGER_MATRIX_PANE_META.name}</NavLink>
          <NavLink to="/standalone/n-sensitivity" onNavigate={onNavigate}>{N_SENSITIVITY_PANE_META.name}</NavLink>
        </section>

        <section className="sidebar-group" aria-labelledby="sidebar-workspace">
          <h2 className="sidebar-heading" id="sidebar-workspace">Workspace</h2>
          {workspacesReady && workspaceLinks.length === 0 ? <p className="sidebar-empty">{WORKSPACE_EMPTY_TEXT}</p> : null}
          {workspaceLinks.map((workspace) => (
            <Link
              key={workspace.id}
              className="sidebar-link"
              to="/workspace/$id"
              params={{ id: workspace.id }}
              activeProps={{ 'aria-current': 'page' }}
              onClick={onNavigate}
            >
              {workspace.name}
            </Link>
          ))}
          <button type="button" className="sidebar-link sidebar-new-workspace" onClick={createWorkspace}>
            ＋ 新しいWorkspace
          </button>
        </section>

        <section className="sidebar-group">
          <NavLink to="/input" onNavigate={onNavigate}>Tester</NavLink>
        </section>

        <section className="sidebar-group" aria-labelledby="sidebar-assets">
          <h2 className="sidebar-heading" id="sidebar-assets">Assets</h2>
          <NavLink to="/assets" onNavigate={onNavigate}>{USER_ASSETS_LABEL}</NavLink>
        </section>

        <section className="sidebar-group" aria-labelledby="sidebar-about">
          <h2 className="sidebar-heading" id="sidebar-about">About</h2>
          <NavLink to="/about" onNavigate={onNavigate}>{ABOUT_LABEL}</NavLink>
          {SPEC_LINKS.map((link) => (
            <a key={link.url} className="sidebar-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
          ))}
          <a className="sidebar-link" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        </section>
      </nav>

      <div className="sidebar-foot">
        <span className="sidebar-version">v{__KEYDIST_VERSION__}</span>
        {/* /analyzerはシェルに載らない別ページ。リンクで遷移すると新しい画面に切り替わる */}
        <Link className="sidebar-legacy" to="/analyzer" onClick={onNavigate}>{LEGACY_ANALYZER_LABEL}</Link>
        <ThemeSwitch />
      </div>
    </>
  );
}
