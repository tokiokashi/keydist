import { useState, type ReactNode } from 'react';
import { FigureSettingsBox, FigureSettingsToggle } from '#ui/primitives/figure-settings.tsx';
import { SegmentedOptionField, type OptionBinding } from '#ui/primitives/option-fields.tsx';
import type { Layout } from '#input/layouts/types.ts';
import { canToggleLayerDetail, compactPresentationOf, type LayerDetail } from './layer-detail.ts';

/**
 * 図の見出し行と、そこから開くレイヤーのまとめ方の欄。ヒートマップ（レイヤー）とキーマップで共通。
 * 配列がまとめる表示を宣言していて、まとめると層が減る時だけ、ボタンと欄を出す。
 * 開閉の状態はここで持ち、保存しない。
 */
export function LayerDetailHeading({ layout, figureName, headingClassName, children, binding }: {
  readonly layout: Layout;
  /** 図の名前。ボタンと欄の読み上げ名の元になる */
  readonly figureName: string;
  readonly headingClassName: string;
  /** 見出し（`h3`） */
  readonly children: ReactNode;
  readonly binding: OptionBinding<LayerDetail>;
}) {
  const [open, setOpen] = useState(false);
  const compact = compactPresentationOf(layout);
  const toggleable = compact !== undefined && canToggleLayerDetail(layout);
  return (
    <>
      <div className={headingClassName}>
        {children}
        {toggleable ? <FigureSettingsToggle name={figureName} open={open} onToggle={() => setOpen(!open)} /> : null}
      </div>
      {toggleable && open ? (
        <FigureSettingsBox name={figureName}>
          <SegmentedOptionField
            label={compact.controlLabel}
            binding={binding}
            choices={[
              { value: 'compact', label: compact.compactLabel },
              { value: 'detail', label: compact.detailLabel },
            ]}
          />
        </FigureSettingsBox>
      ) : null}
    </>
  );
}
