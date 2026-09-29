import type { TextLanguage } from '#input/text/language.ts';

/**
 * 文脈バー・ペイン見出しの部品の見た目。実物（ContextBar・TextChip・DefaultShapeChip・ConditionSummary）と
 * トップの使い方の見本が同じ形を使うために、状態や資産に依存しない見た目だけをここに置く。
 * ここへ engine や資産を持ち込まない（トップの初期読み込みに入るため）。
 */
export function UndoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M5.5 3.5 2.5 6.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 6.5h6.25a3.75 3.75 0 0 1 0 7.5H7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RedoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="m10.5 3.5 3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6.5H6.75a3.75 3.75 0 0 0 0 7.5H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M8 10V2.5M5 5.25 8 2.25l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 7.5H3.75A1.25 1.25 0 0 0 2.5 8.75v4.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25v-4.5c0-.69-.56-1.25-1.25-1.25H11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function languageLabel(language: TextLanguage): string {
  return language === 'ja' ? '日本語' : '英語';
}

/** チップの中身。トップの使い方が実物と同じ見た目を見せるために切り出してある。 */
export function TextChipFace({ name, language }: { readonly name: string; readonly language: TextLanguage }) {
  return (
    <>
      <span className="context-chip-key">テキスト</span>
      <span className="context-chip-value">{name}</span>
      <span className="text-chip-language">{languageLabel(language)}</span>
      <svg className="context-chip-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </>
  );
}


/** キーボードのアイコン（狭いバーでは名前の代わりに出す）。トップの使い方も同じものを見せる。 */
export function DefaultShapeIcon() {
  return (
    <svg className="context-chip-icon" viewBox="0 0 20 14" width="20" height="14" aria-hidden="true">
      {/* キーボード: 枠の中にキーの四角（1段目5個・2段目4個をずらして）と幅広のスペースバー。線でなく四角で描き、☰と読まれないようにする。 */}
      <rect x="0.7" y="0.7" width="18.6" height="12.6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <g fill="currentColor">
        {[0, 1, 2, 3, 4].map((i) => <rect key={`a${i}`} x={2 + i * 3.4} y="3" width="2.2" height="2" rx="0.4" />)}
        {[0, 1, 2, 3].map((i) => <rect key={`b${i}`} x={3.7 + i * 3.4} y="6.2" width="2.2" height="2" rx="0.4" />)}
        <rect x="5.5" y="9.4" width="9" height="2" rx="0.4" />
      </g>
    </svg>
  );
}

/** 条件の要約の開閉の三角。 */
export function ConditionCaret() {
  return (
    <svg className="pane-condition-caret" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5 3l6 5-6 5z" />
    </svg>
  );
}
