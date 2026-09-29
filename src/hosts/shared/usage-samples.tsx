import type { ReactNode } from 'react';
import { ConditionCaret, DefaultShapeIcon, RedoIcon, ShareIcon, TextChipFace, UndoIcon } from './chrome-faces.tsx';
import { SettingsIcon } from './PaneHeaderParts.tsx';
import './context-bar.css';
import './pane-frame.css';

/**
 * トップの使い方に添える、実物の部品の見本。実物と同じ見た目の部品・同じCSSクラスで描き、
 * 「どのボタン・チップの話か」が分かるようにする。画像にしないのは、テーマの明暗に追従させるため。
 *
 * 見本は押せない（`inert`）。読み上げにも出さない（説明の本文が同じことを言うため）。
 */
function Sample({ children }: { readonly children: ReactNode }) {
  return (
    <span className="usage-sample" inert aria-hidden="true">
      {children}
    </span>
  );
}

export function ShapeChipSample() {
  return (
    <Sample>
      <span className="context-chip context-select-chip">
        <DefaultShapeIcon />
        <span className="context-chip-key">既定の物理配列</span>
        <svg className="context-chip-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    </Sample>
  );
}

export function TextChipSample() {
  return (
    <Sample>
      <span className="context-chip text-chip">
        <TextChipFace name="吾輩は猫である" language="ja" />
      </span>
    </Sample>
  );
}

export function UndoRedoSample() {
  return (
    <Sample>
      <span className="context-icon-button"><UndoIcon /></span>
      <span className="context-icon-button"><RedoIcon /></span>
    </Sample>
  );
}

export function ShareSample() {
  return (
    <Sample>
      <span className="context-share-button">
        <ShareIcon />
        <span>共有</span>
      </span>
    </Sample>
  );
}

export function SettingsSample() {
  return (
    <Sample>
      <span className="pane-settings-button">
        <SettingsIcon />
        <span>解析設定</span>
      </span>
    </Sample>
  );
}

export function ConditionSample() {
  return (
    <Sample>
      <span className="pane-condition-summary usage-condition">
        <span className="usage-condition-head">
          <ConditionCaret />
          <span className="pane-condition-key">条件</span>
          <span className="pane-condition-default">すべて既定値</span>
        </span>
      </span>
    </Sample>
  );
}
