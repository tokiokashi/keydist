import type { BunsetsuSource } from '#hosts/shared/segmentation.ts';
import { BUNSETSU_SPLITTER } from '#platform/bunsetsu/info.ts';

/**
 * 文節の分割器の入口を、最初に呼ばれた時に読み込む形で包む。
 * 分割器のモジュールは、区切りを使う設定のペインが現れるまで読み込まない。読み込めなかった時は次の呼び出しで読み込み直す。
 */
export function createLazyBunsetsuSource(loadModule: () => Promise<{ splitBunsetsu(text: string): string[] }>): BunsetsuSource {
  let module: ReturnType<typeof loadModule> | undefined;
  return {
    info: BUNSETSU_SPLITTER,
    async split(text) {
      module ??= loadModule();
      try {
        return (await module).splitBunsetsu(text);
      } catch (error) {
        module = undefined;
        throw error;
      }
    },
  };
}

/** 画面が共有する、文節の分割器の入口。 */
export const sharedBunsetsuSource: BunsetsuSource = createLazyBunsetsuSource(() => import('#platform/bunsetsu/budoux.ts'));
