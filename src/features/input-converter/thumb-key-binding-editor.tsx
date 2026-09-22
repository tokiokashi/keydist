import { useEffect, useState } from 'react';
import {
  DEFAULT_THUMB_KEY_BINDINGS,
  assignThumbKeyCode,
  removeThumbKeyCode,
  type ThumbKeyBindings,
} from './browser-keyboard-bindings.ts';

interface ThumbKeyBindingEditorProps {
  readonly value: ThumbKeyBindings;
  readonly onChange: (value: ThumbKeyBindings) => void;
}

type Side = 'left' | 'right';

function sideLabel(side: Side): string {
  return side === 'left' ? '左親指' : '右親指';
}

export function ThumbKeyBindingEditor({
  value,
  onChange,
}: ThumbKeyBindingEditorProps) {
  const [capturing, setCapturing] = useState<Side>();

  useEffect(() => {
    if (capturing === undefined) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(assignThumbKeyCode(value, capturing, event.code));
      setCapturing(undefined);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, onChange, value]);

  const renderSide = (side: Side, codes: readonly string[]) => (
    <section className="input-thumb-binding-side">
      <strong>{sideLabel(side)}</strong>
      <div className="input-thumb-binding-codes">
        {codes.length === 0 ? <span className="input-muted">未割当</span> : null}
        {codes.map((code) => (
          <button
            aria-label={`${sideLabel(side)}から${code}を削除`}
            className="input-binding-chip"
            key={code}
            onClick={() => onChange(removeThumbKeyCode(value, side, code))}
            type="button"
          >
            <code>{code}</code>
            <span aria-hidden="true">×</span>
          </button>
        ))}
        <button
          aria-label={capturing === side
            ? `${sideLabel(side)}のキー登録をキャンセル`
            : `${sideLabel(side)}にキーを追加`}
          className="input-binding-add"
          data-capturing={capturing === side || undefined}
          onClick={() => setCapturing(capturing === side ? undefined : side)}
          type="button"
        >
          {capturing === side ? 'キーを押す…' : 'キーを追加'}
        </button>
      </div>
    </section>
  );

  return (
    <section className="input-thumb-bindings" aria-label="親指キー割当">
      <header>
        <div>
          <strong>親指キー割当</strong>
          <span>次に押した物理キーを追加。重複キーは新しい側へ移動する。</span>
        </div>
        <button
          onClick={() => {
            setCapturing(undefined);
            onChange({
              leftCodes: [...DEFAULT_THUMB_KEY_BINDINGS.leftCodes],
              rightCodes: [...DEFAULT_THUMB_KEY_BINDINGS.rightCodes],
            });
          }}
          type="button"
        >
          既定に戻す
        </button>
      </header>
      {renderSide('left', value.leftCodes)}
      {renderSide('right', value.rightCodes)}
      {capturing !== undefined ? (
        <p className="input-binding-capture" aria-live="polite">
          {sideLabel(capturing)}へ割り当てるキーを押す。
          キー入力はこの登録にだけ使われる。
        </p>
      ) : null}
    </section>
  );
}
