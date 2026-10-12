import type { GeometryKind } from '#input/shapes/geometry.ts';
import type { ChainInterpretation } from '#interpretation/structure/chain.ts';
import type { ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from '#input/semantics/index.ts';

/**
 * 旧画面（`legacy/`）と移行中の`features/analyzer-next/`が持つ全体の条件。
 * 速度平均の3項目（`playbackRate*`）は旧画面だけが読む。新しい構成では打鍵再生の解析設定にあり、
 * 旧画面と一緒に消える。
 */
export interface ConditionDefaults {
  geometry: GeometryKind;
  windowSize: number;
  /** 速度平均の方式。全配列共通。 */
  playbackRateAverage: 'sma' | 'ewma';
  /** SMAで使う直近Stroke数。全配列共通。 */
  playbackRateWindow: number;
  /** EWMAで過去寄与が半分になる時間 [秒]。全配列共通。 */
  playbackRateHalfLifeSeconds: number;
  sfbHomeCost: boolean;
  preferOppositeThumb: boolean;
  chain: ChainInterpretation;
  arpeggioPolicy: ArpeggioInterpretation;
  triggerRealization: TriggerRealizationPolicy;
  actionRealization: ActionRealizationPolicy;
}

export type LayoutConditionOverrides = Partial<Omit<
  ConditionDefaults,
  'playbackRateAverage' | 'playbackRateWindow' | 'playbackRateHalfLifeSeconds'
>> & {
  romajiRule?: string;
};
