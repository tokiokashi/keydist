import type { SegmenterInfo, SegmentationOrigin } from '#input/text/segmentation.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { SEGMENTATION_SOURCE_DESCRIPTION, SEGMENTATION_SOURCE_NAME, segmentationSourceItems } from './segmentation-text.ts';

/** 文節の区切りを使うAnalyzerの図や表の横に置く、区切りの分割器と出どころのⓘ。 */
export function SegmentationSourceButton({ splitter, origin }: { readonly splitter: SegmenterInfo; readonly origin: SegmentationOrigin }) {
  return (
    <InfoButton
      name={SEGMENTATION_SOURCE_NAME}
      description={SEGMENTATION_SOURCE_DESCRIPTION}
      help={{ notes: [], listLabel: '区切りの情報', items: segmentationSourceItems(splitter, origin) }}
    />
  );
}
