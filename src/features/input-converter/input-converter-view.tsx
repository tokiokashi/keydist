import { useState } from 'react';
import { QWERTY_LEGEND, THUMB_KEY } from '../../geometry.ts';
import { LAYOUTS_JA, type Layout } from '../../layouts/index.ts';
import { useTypingSession } from './use-typing-session.ts';

const INPUT_LAYOUTS = LAYOUTS_JA.filter((layout) => layout.romajiTable === undefined);

function KeyboardPreview({
  layout,
  pressedKeys,
}: {
  layout: Layout;
  pressedKeys: readonly string[];
}) {
  const pressed = new Set(pressedKeys);
  const label = (key: string) => layout.legends.get(key) ?? key;

  return (
    <div className="input-keyboard" aria-label="現在の物理キー状態">
      {QWERTY_LEGEND.map((row, rowIndex) => (
        <div className="input-keyboard-row" key={rowIndex}>
          {Array.from(row).map((key) => (
            <span
              className="input-key"
              data-active={pressed.has(key) || undefined}
              key={key}
            >
              <span>{label(key)}</span>
              <small>{key}</small>
            </span>
          ))}
        </div>
      ))}
      <div className="input-keyboard-row input-keyboard-thumbs">
        {[THUMB_KEY.LT, THUMB_KEY.RT].map((key) => (
          <span
            className="input-key input-key-thumb"
            data-active={pressed.has(key) || undefined}
            key={key}
          >
            <span>{label(key)}</span>
            <small>{key === THUMB_KEY.LT ? 'NonConvert' : 'Space / Convert'}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function RecognizedDetail({
  recognized,
}: {
  recognized: ReturnType<typeof useTypingSession>['lastRecognized'];
}) {
  if (recognized.length === 0) {
    return <p className="input-muted">まだ入力は確定していない。</p>;
  }

  return (
    <div className="input-recognized-list">
      {recognized.map((entry, entryIndex) => (
        <div className="input-recognized" key={entryIndex}>
          <strong>{entry.output}</strong>
          <div>
            {entry.actions.map((action, actionIndex) => (
              <code key={actionIndex}>
                {action.keys.join(' + ')}
                {action.heldKeys.length > 0 ? ` [hold: ${action.heldKeys.join(' + ')}]` : ''}
                {action.holdPhase ? ` ${action.holdPhase}` : ''}
              </code>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InputConverterView() {
  const [layout, setLayout] = useState<Layout>(() => INPUT_LAYOUTS[0] ?? LAYOUTS_JA[0]);
  const session = useTypingSession(layout);

  return (
    <section
      className="feature-shell input-feature"
      data-input-ready={session.readyLayoutId === layout.id ? layout.id : undefined}
    >
      <p className="eyebrow">Phase B · #270</p>
      <h1>Input Converter</h1>
      <p>
        選択した配列の canonical SemanticInput を使って、物理キーから日本語を直接生成する。
        お題はなく、ここでは自由に打てる。
      </p>

      <div className="input-toolbar">
        <label>
          <span>かな配列</span>
          <select
            value={layout.id}
            onChange={(event) => {
              const next = INPUT_LAYOUTS.find((candidate) => candidate.id === event.target.value);
              if (next !== undefined) setLayout(next);
            }}
          >
            {INPUT_LAYOUTS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={session.clear}>クリア</button>
      </div>

      <textarea
        className="input-output"
        value={session.text}
        readOnly
        rows={7}
        aria-label="自由入力テキスト"
        placeholder="下の入力エリアを選択して打鍵すると、ここに出力される。"
      />

      <div
        className="input-capture"
        data-active={session.active || undefined}
        ref={session.captureRef}
        tabIndex={0}
        role="textbox"
        aria-multiline="true"
        aria-label="物理キー入力エリア"
      >
        <strong>{session.active ? '入力受付中' : 'クリックして入力開始'}</strong>
        <span>
          Backspaceで1文字削除、Enterで改行、Escで入力解除。
          {session.composing ? ' IME composition中は認識を停止している。' : ''}
        </span>
      </div>

      <KeyboardPreview layout={layout} pressedKeys={session.pressedKeys} />

      <div className="input-inspector">
        <section>
          <h2>Pressed</h2>
          <p>{session.pressedKeys.length > 0 ? session.pressedKeys.join(' + ') : '—'}</p>
        </section>
        <section>
          <h2>Recognized / realized action</h2>
          <RecognizedDetail recognized={session.lastRecognized} />
        </section>
      </div>

      <p className="input-note">
        canonical SemanticInputを使い、単打・prefix / suffix・simultaneous・hold・
        multi-step / composed outputまで実入力で扱う。ローマ字→かな変換や時間依存semanticは
        別能力として必要になった段階で追加する。
      </p>
    </section>
  );
}
