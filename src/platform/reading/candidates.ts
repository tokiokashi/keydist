import type { ReadingCandidateTable } from '#input/text/reading-candidates.ts';

/**
 * 読みの候補の表を読み込む。表は別のチャンクに分かれていて、呼ばれるまで通信しない。
 * 読みを直す画面を開いた時にだけ呼ぶ。
 */
export async function loadReadingCandidates(): Promise<ReadingCandidateTable> {
  return (await import('./candidate-table.json')).default as ReadingCandidateTable;
}
