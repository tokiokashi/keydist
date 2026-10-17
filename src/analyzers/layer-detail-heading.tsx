import type { ReactNode } from 'react';
import { useFigureSettings } from '#ui/primitives/figure-settings.tsx';
import { SegmentedOptionField, type OptionBinding } from '#ui/primitives/option-fields.tsx';
import type { Layout } from '#input/layouts/types.ts';
import { canToggleLayerDetail, compactPresentationOf, type LayerDetail } from './layer-detail.ts';

/**
 * 図の見出し行と、そこから開くレイヤーのまとめ方の小窓。ヒートマップ（レイヤー）とキーマップで共通。
 * 配列がまとめる表示を宣言していて、まとめると層が減る時だけ、ボタンと小窓を出す。
 * 開閉の状態はここで持ち、保存しない。
 */
export function LayerDetailHeading({
  layout,
  figureName,
  headingClassName,
  children,
  binding,
}: {
  readonly layout: Layout;
  /** 図の名前。ボタンと小窓の読み上げ名の元になる */
  readonly figureName: string;
  readonly headingClassName: string;
  /** 見出し（`h3`） */
  readonly children: ReactNode;
  readonly binding: OptionBinding<LayerDetail>;
}) {
  const figureSettings = useFigureSettings(figureName);
  const compact = compactPresentationOf(layout);
  const toggleable = compact !== undefined && canToggleLayerDetail(layout);
  return (
    <>
      <div className={headingClassName}>
        {children}
        {toggleable ? figureSettings.toggle : null}
      </div>
      {toggleable
        ? figureSettings.renderWindow(
            <SegmentedOptionField
              label={compact.controlLabel}
              binding={binding}
              choices={[
                { value: 'compact', label: compact.compactLabel },
                { value: 'detail', label: compact.detailLabel },
              ]}
            />,
          )
        : null}
    </>
  );
}
