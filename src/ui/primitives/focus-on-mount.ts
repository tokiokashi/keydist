/**
 * 要素が画面に付いた時に焦点を移す ref。
 * 関数の参照が変わらないので、再描画のたびには呼ばれず、付いた時の1回だけ焦点を移す。
 */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}
