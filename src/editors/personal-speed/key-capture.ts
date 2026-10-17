/**
 * 測定中のキー入力の取得。取るのは測定中だけで、取る押下も1文字のキーに限る。
 * Escape・Tab・Enter・Space・矢印・修飾キーつきの押下は取らないので、サイドバーを閉じるEscape、
 * 拡大表示のEscape、フォーカス移動のTab、ボタンの操作のEnter・Spaceはそのまま働く。
 * 例外は、Spaceを測るキーにする測定（親指との同時押し）の間のSpaceだけで、その間は押下と離しをブラウザの働きへ渡さない。
 */

export interface PressLike {
  readonly key: string;
  readonly code?: string;
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

/** Spaceキーの押下か（修飾キーつき・変換中の押下は除く）。 */
export function isSpaceKeyPress(event: PressLike): boolean {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key === ' ' || event.code === 'Space';
}

/** 文字を入力する欄にフォーカスがある時の押下か（入力の邪魔をしない）。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || typeof (target as Partial<Element>).tagName !== 'string') return false;
  const element = target as HTMLElement;
  return element.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

/** `document`など、キー入力を受ける対象のうち、取得に使う部分。 */
export interface KeyEventSource {
  addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEvent) => void, capture: boolean): void;
  removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEvent) => void, capture: boolean): void;
}

export interface CaptureOptions {
  /**
   * 今、Spaceを測定の打鍵として受け付けるか。受け付ける間は、Spaceの押下を（押し続けて起こる繰り返しも）
   * 画面のスクロールとフォーカスのあるボタンの操作へ渡さず、Spaceを離した時の操作も渡さない。
   */
  readonly acceptsSpace?: () => boolean;
}

/**
 * 測定の打鍵の取得を始める。戻り値の関数で止める。
 * `onPress`には測定の打鍵として扱う押下だけが渡る。次に打つキーだったかどうかは`onPress`が決め、
 * 次に打つキーだった時だけ`preventDefault`と`stopPropagation`を呼ぶ（他の押下の働きは変えない）。
 * `acceptsSpace`が真の間のSpaceは、この関数が`preventDefault`と`stopPropagation`を呼んで`onPress`へ渡す。
 */
export function captureCalibrationKeys(source: KeyEventSource, onPress: (event: KeyboardEvent) => void, options: CaptureOptions = {}): () => void {
  const { acceptsSpace } = options;
  // 取得の間にSpaceを押して、まだ離していない。止めた後に離された時の操作も渡さない。
  let spaceDown = false;
  const swallow = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  const keyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    if (acceptsSpace?.() === true && isSpaceKeyPress(event)) {
      spaceDown = true;
      swallow(event);
      if (!event.repeat) onPress(event);
      return;
    }
    if (!isCalibrationKeyPress(event)) return;
    onPress(event);
  };
  const keyUp = (event: KeyboardEvent): void => {
    if (!isSpaceKeyPress(event) || isTypingTarget(event.target)) return;
    if (acceptsSpace?.() !== true && !spaceDown) return;
    spaceDown = false;
    swallow(event);
  };
  source.addEventListener('keydown', keyDown, true);
  if (acceptsSpace !== undefined) source.addEventListener('keyup', keyUp, true);
  return () => {
    source.removeEventListener('keydown', keyDown, true);
    if (acceptsSpace === undefined) return;
    source.removeEventListener('keyup', keyUp, true);
    if (!spaceDown) return;
    // 最後の打鍵がSpaceだった時、離した時の操作（フォーカスが戻ったボタンの押下）を1回だけ渡さない。
    const swallowOnce = (event: KeyboardEvent): void => {
      if (!isSpaceKeyPress(event)) return;
      source.removeEventListener('keyup', swallowOnce, true);
      swallow(event);
    };
    source.addEventListener('keyup', swallowOnce, true);
  };
}
