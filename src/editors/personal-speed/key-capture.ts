import { browserCodeToPhysicalKey, EMPTY_BROWSER_KEY_BINDING_OVERRIDES, type BrowserKeyBindingOverrides } from '#input/shapes/browser-key-codes.ts';
import { LEFT_COLUMN_KEYS } from '#input/shapes/geometry.ts';

/**
 * 測定中のキー入力の取得。取るのは測定中だけで、取る押下も1文字のキーに限る。
 * Escape・Enter・Space・矢印・修飾キーつきの押下は取らないので、サイドバーを閉じるEscape、
 * 拡大表示のEscape、ボタンの操作のEnter・Spaceはそのまま働く。
 * 例外は2つある。1つは、Spaceを測るキーにする測定（親指との同時押し）の間のSpaceで、その間は押下と離しをブラウザの働きへ渡さない。
 * もう1つは、物理配列の左端の列のキー（CapsLock・Tab・半角/全角の位置）で、次に打つキーがそのキーの時だけ取る。
 * 次に打つキーでないTabは取らないので、フォーカス移動はそのまま働く。
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

/** 照合に渡す押下。`code`から、利用者の対応を重ねて引いたキーのidを添える（引けなければ添えない）。 */
export function matchableKeyEvent(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
  bindings: BrowserKeyBindingOverrides,
): { readonly key: string; readonly code: string; readonly physicalKey?: string } {
  const physicalKey = browserCodeToPhysicalKey(event.code, bindings);
  return physicalKey === undefined ? { key: event.key, code: event.code } : { key: event.key, code: event.code, physicalKey };
}

/** 押下の`code`が、利用者の対応を重ねた時に左端の列のキーになる時の、そのキーのid。 */
export function leftColumnKeyOf(
  event: Pick<PressLike, 'code'>,
  bindings: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): string | undefined {
  if (event.code === undefined) return undefined;
  const key = browserCodeToPhysicalKey(event.code, bindings);
  return key !== undefined && (LEFT_COLUMN_KEYS as readonly string[]).includes(key) ? key : undefined;
}

/**
 * 測定の打鍵として扱う押下か。左端の列のキーの押下は、`acceptsLeftColumnKey`がそのキーのidに真を返す時だけ扱う
 * （既定では扱わない）。
 */
export function isCalibrationKeyPress(
  event: PressLike,
  bindings: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
  acceptsLeftColumnKey: (keyId: string) => boolean = () => false,
): boolean {
  if (event.repeat || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const leftColumn = leftColumnKeyOf(event, bindings);
  if (leftColumn !== undefined) return acceptsLeftColumnKey(leftColumn);
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
  /** 押下の`code`から物理キーのidを引く、利用者の対応を重ねた対応。 */
  readonly codeBindings?: BrowserKeyBindingOverrides;
  /** 今、左端の列のキー（`LEFT_COLUMN_KEYS`）のidを次に打つキーとして受け付けるか。 */
  readonly acceptsLeftColumnKey?: (keyId: string) => boolean;
}

/**
 * 測定の打鍵の取得を始める。戻り値の関数で止める。
 * `onPress`には測定の打鍵として扱う押下だけが渡る。次に打つキーだったかどうかは`onPress`が決め、
 * 次に打つキーだった時だけ`preventDefault`と`stopPropagation`を呼ぶ（他の押下の働きは変えない）。
 * `acceptsSpace`が真の間のSpaceは、この関数が`preventDefault`と`stopPropagation`を呼んで`onPress`へ渡す。
 */
export function captureCalibrationKeys(source: KeyEventSource, onPress: (event: KeyboardEvent) => void, options: CaptureOptions = {}): () => void {
  const { acceptsSpace, codeBindings = EMPTY_BROWSER_KEY_BINDING_OVERRIDES, acceptsLeftColumnKey } = options;
  // CapsLockのkeydownを取った後で、まだ離していない。keydownが届かないまま離しだけが届く環境の判別に使う。
  let capsLockDown = false;
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
    if (event.code === 'CapsLock') capsLockDown = true;
    if (!isCalibrationKeyPress(event, codeBindings, acceptsLeftColumnKey)) return;
    onPress(event);
  };
  const keyUp = (event: KeyboardEvent): void => {
    if (event.code === 'CapsLock') {
      // 対応するkeydownが無いままCapsLockの離しが届いた時（固定を外す押下で離しだけが届く環境）は、離しを押下として扱う。
      const paired = capsLockDown;
      capsLockDown = false;
      if (paired || isTypingTarget(event.target)) return;
      if (!isCalibrationKeyPress(event, codeBindings, acceptsLeftColumnKey)) return;
      onPress(event);
      return;
    }
    if (!isSpaceKeyPress(event) || isTypingTarget(event.target)) return;
    if (acceptsSpace?.() !== true && !spaceDown) return;
    spaceDown = false;
    swallow(event);
  };
  source.addEventListener('keydown', keyDown, true);
  source.addEventListener('keyup', keyUp, true);
  return () => {
    source.removeEventListener('keydown', keyDown, true);
    source.removeEventListener('keyup', keyUp, true);
    if (acceptsSpace === undefined) return;
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
