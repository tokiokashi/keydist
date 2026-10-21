import { useEffect, useState } from 'react';
import { mapBoundariesToReading, offsetsOfChunks, type SegmenterInfo, type SegmentationInput } from '#input/text/segmentation.ts';
import type { SegmentationBasis } from './reading-evaluation.ts';

/**
 * 文節の分割器の入口。`app` が組み立てて注入する（`ReadingSource` と同じ形）。
 * 分割器は、区切りを使う設定のペインが最初に求めるまで読み込まない。
 */
export interface BunsetsuSource {
  /** 分割器の名前と版。数値の条件に記録する。 */
  readonly info: SegmenterInfo;
  /** テキストを文節の断片に分ける。連結すると原文に戻る。読み込めなければ例外を投げる。 */
  split(text: string): Promise<readonly string[]>;
}

/** 区切りの用意の状態。`idle` は求められていない。 */
export type SegmentationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly input: SegmentationInput };

/** 原文を分割器で区切り、読みのテキストの位置へ写す。 */
export async function computeSegmentation(source: BunsetsuSource, basis: SegmentationBasis): Promise<SegmentationInput> {
  const chunks = await source.split(basis.sourceText);
  const boundaries = mapBoundariesToReading(basis.sourceText, basis.tokens, offsetsOfChunks(chunks), basis.corrections);
  return { boundaries, origin: basis.origin, splitter: source.info };
}

/**
 * 文節の区切りを求める。`enabled` の間だけ分割器を呼ぶ。材料が変わると、新しい区切りが出るまで `loading` にする。
 */
export function useSegmentation(source: BunsetsuSource | undefined, basis: SegmentationBasis | undefined, enabled: boolean): SegmentationState {
  const [stored, setStored] = useState<
    { readonly basis: SegmentationBasis; readonly source: BunsetsuSource; readonly state: SegmentationState } | undefined
  >(undefined);
  const active = enabled && source !== undefined && basis !== undefined;

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    computeSegmentation(source, basis).then(
      (input) => {
        if (!cancelled) setStored({ basis, source, state: { status: 'ready', input } });
      },
      () => {
        if (!cancelled) setStored({ basis, source, state: { status: 'failed' } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, source, basis]);

  if (!active) return { status: 'idle' };
  return stored !== undefined && stored.basis === basis && stored.source === source ? stored.state : { status: 'loading' };
}
