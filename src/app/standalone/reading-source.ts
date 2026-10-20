import type { ReadingSource } from '#hosts/shared/reading-evaluation.ts';
import type { ReadingToken } from '#input/text/reading.ts';
import type { ReadingCandidateTable } from '#input/text/reading-candidates.ts';
import { DICTIONARY_SPEC, LIBRARY_SPEC } from '#platform/reading/dictionary-spec.ts';

/** 解析の入口のうち使う部分。 */
export interface ReadingServiceLike {
  tokenize(text: string): Promise<ReadingToken[]>;
}

/** 候補の表の入口。 */
export interface ReadingCandidatesLike {
  loadReadingCandidates(): Promise<ReadingCandidateTable>;
}

/**
 * 漢字を読みに直す入口を、最初に呼ばれた時に読み込む形で包む。
 *
 * 入口のモジュール（Worker・wasm・辞書の取得を持つ）と候補の表は、漢字を含む日本語のテキストが現れるまで読み込まない。
 * 読み込めなかった時は次の呼び出しで読み込み直す。
 */
export function createLazyReadingSource(
  loadService: () => Promise<ReadingServiceLike>,
  loadCandidatesModule: () => Promise<ReadingCandidatesLike>,
): ReadingSource {
  let service: Promise<ReadingServiceLike> | undefined;
  let candidates: Promise<ReadingCandidateTable> | undefined;
  return {
    async tokenize(text) {
      service ??= loadService();
      try {
        return await (await service).tokenize(text);
      } catch (error) {
        service = undefined;
        throw error;
      }
    },
    async loadCandidates() {
      candidates ??= loadCandidatesModule().then((module) => module.loadReadingCandidates());
      try {
        return await candidates;
      } catch (error) {
        candidates = undefined;
        throw error;
      }
    },
    conditions: {
      dictionary: { name: DICTIONARY_SPEC.name, version: DICTIONARY_SPEC.version },
      library: { name: LIBRARY_SPEC.name, version: LIBRARY_SPEC.version },
    },
  };
}

/** 画面が共有する、漢字を読みに直す入口。 */
export const sharedReadingSource: ReadingSource = createLazyReadingSource(
  async () => (await import('#platform/reading/client.ts')).readingService(),
  () => import('#platform/reading/candidates.ts'),
);
