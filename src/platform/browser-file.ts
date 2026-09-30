export type ReadTextResult =
  | { readonly kind: 'ok'; readonly text: string }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'unreadable' };

/**
 * 利用者が選んだファイルを文字列として読む。`maxBytes`を超えるものは中身を読まずに断る
 * （大きなファイルをメモリへ載せてから弾くと、弾くまでに画面が止まるため）。
 */
export async function readTextFile(file: Blob, maxBytes: number): Promise<ReadTextResult> {
  if (file.size > maxBytes) return { kind: 'too-large' };
  try {
    return { kind: 'ok', text: await file.text() };
  } catch {
    return { kind: 'unreadable' };
  }
}
