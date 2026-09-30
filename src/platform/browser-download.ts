export function downloadText(
  filename: string,
  content: string,
  type = 'text/plain',
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // 解放を遅らせるのは、保存の開始が非同期なブラウザへの備え（そのようなブラウザは確かめていない）。
  // 日本語のファイル名が「download」になる現象はこれとは無関係で、LANG未設定（C/POSIX）のLinuxの
  // Chromiumが名前をUTF-8へ変換できないことによる（LANG=C.UTF-8なら即時に解放しても保たれる）。
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * JSONの書き出しファイルを保存する。ファイルの種類を示す`format`の印は、ここで書く直前に先頭へ付ける
 * （資産のcodecは版番号しか持たず、別の種類のファイルを版の違いと取り違えるため）。
 * 読む側は`format`を見てからcodecへ渡す。
 */
export function downloadJson(filename: string, format: string, body: Readonly<Record<string, unknown>>): void {
  downloadText(filename, `${JSON.stringify({ format, ...body }, null, 2)}\n`, 'application/json');
}
