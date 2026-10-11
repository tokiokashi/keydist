/**
 * 測定中のキー入力の取得。取るのは測定中だけで、取る押下も1文字のキーに限る。
 * Escape・Tab・Enter・Space・矢印・修飾キーつきの押下は取らないので、サイドバーを閉じるEscape、
 * 拡大表示のEscape、フォーカス移動のTab、ボタンの操作のEnter・Spaceはそのまま働く。
 */

export interface PressLike {
  readonly key: string;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/** 測定の打鍵として扱う押下か。 */
export function isCalibrationKeyPress(event: PressLike): boolean {
  if (event.repeat || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  // 1文字のキーだけ。Escape・Tab・Enter・矢印などは名前が複数文字で、Spaceは空白1文字なので除く。
  return [...event.key].length === 1 && event.key.trim() !== '';
}

/** 文字を入力する欄にフォーカスがある時の押下か（入力の邪魔をしない）。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || typeof (target as Partial<Element>).tagName !== 'string') return false;
  const element = target as HTMLElement;
  return element.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

/** `document`など、キー入力を受ける対象のうち、取得に使う部分。 */
export interface KeyEventSource {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void, capture: boolean): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void, capture: boolean): void;
}

/**
 * 測定の打鍵の取得を始める。戻り値の関数で止める。
 * `onPress`には測定の打鍵として扱う押下だけが渡る。次に打つキーだったかどうかは`onPress`が決め、
 * 次に打つキーだった時だけ`preventDefault`と`stopPropagation`を呼ぶ（他の押下の働きは変えない）。
 */
export function captureCalibrationKeys(
  source: KeyEventSource,
  onPress: (event: KeyboardEvent) => void,
): () => void {
  const listener = (event: KeyboardEvent): void => {
    if (!isCalibrationKeyPress(event) || isTypingTarget(event.target)) return;
    onPress(event);
  };
  source.addEventListener('keydown', listener, true);
  return () => source.removeEventListener('keydown', listener, true);
}
